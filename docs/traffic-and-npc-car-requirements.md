# Traffic and NPC car AI requirements

## Purpose

This document specifies the behavior required to reproduce the original GTA2
traffic and non-player car systems in this project. It is derived from the
local decompilation at `references/gta2_re/` (commit `4047554`) and the map,
asset, and architecture notes under `docs/`.

The document is a behavior contract, not a direct porting plan. The original
code mixes route selection, lane following, collision probing, vehicle
physics, and special-case mission behavior. The implementation should keep
those responsibilities separate while preserving their observable order and
semantics.

## Source map

| Original source | Responsibility | Important routines |
| --- | --- | --- |
| `Source/Car_BC.cpp` | Car lifecycle, traffic spawning, AI/physics service order | `TrafficSpawner::MakeTrafficForCurrCamera`, `TrafficSpawner::SpawnTrafficCar`, `CarManager::SpawnCarOnRoadNetwork`, `CarManager::PoolUpdate`, `CarsService` |
| `Source/CarAI_78.cpp` | Road following, route progress, turns, lane alignment, obstacle reactions, chase setup | `ManageTrafficCarDirection`, `FollowRoadDirection`, `AlignToLaneCenter`, `DetectCarAhead`, `ScanAheadForObstacles`, `UpdateDrivingAI`, `Init_AI_Chase` |
| `Source/RouteFinder.cpp` | Junction/segment graph loading and route search | `Load_RGEN`, `FindSegmentJunction`, `FindArrowBlockInJunction`, `StartRoute`, route expansion/serialization routines |
| `Source/CarPhysics_B0.cpp` | Input-to-vehicle motion, steering angle, torque, gears, braking | `UpdateSteeringAngle`, throttle/torque and gear routines |
| `Source/TrafficLights_194.cpp` | Traffic-light phases and map-zone setup | `CreateFromMapZones`, light service routines |
| `Source/Object_5C.cpp` | Traffic-light stop behavior during the AI forward probe | `ShouldStopAtTrafficLight` |
| `Source/CarChaseTaskTable_500.cpp` | Chase task data and target-side driving behavior | chase task table definitions and state data |

The exact chase state machine remains partially uncertain because
`CarAI_78::UpdateStateMachine_44E560` is marked `WIP_FUNC` and
`NOT_IMPLEMENTED` in the local decompilation. Requirements below distinguish
the confirmed driving core from the chase transitions that still need runtime
or source verification.

## Terminology and boundaries

### Traffic car

A recycled, ordinary road vehicle created to populate the world around one or
more player cameras. It normally follows the local road-arrow network and
chooses turns at junctions. It does not need an RGEN route unless a separate
mission or chase task assigns one.

### NPC car

Any car whose driver is not a player. This includes ordinary traffic, police,
gang, mission/script cars, chase cars, and cars temporarily controlled by a
dummy driver after player disconnection. These cars share the driving and
obstacle core but differ in spawn policy, route source, target, permissions,
and reactions.

### Three navigation layers

The implementation must keep these layers distinct:

1. **Road arrows** are local lane guidance. Green arrows describe the normal
   road network; red arrows describe special/emergency routes. An arrow block
   tells a car which direction is legal or authored from the current block.
2. **RGEN junction routing** selects a sequence of junctions and segments for
   cars that have a target or authored route. It is not a replacement for
   per-block arrow following.
3. **Vehicle control** converts the selected direction or target lane point
   into steering, throttle, neutral, braking, handbrake, or reverse inputs.

The server remains authoritative for all three layers in multiplayer. Clients
may render replicated AI state, but must not independently advance NPC traffic
or accept client-selected waypoints as authoritative.

## Requirements

### 1. Authoritative data and coordinate handling

1. The map loader must preserve both green and red arrow masks, including
   blocks that contain only red arrows. Red arrows must not be discarded merely
   because they are not part of the ordinary traffic network.
2. GMP road-arrow direction, RGEN junction links, segment lengths, enabled
   bits, junction bounds, junction types, and active counts must remain
   available to the shared simulation. Padded RGEN storage must not be treated
   as active graph data.
3. Route and lane decisions must use the single world-scale boundary in
   `src/shared/domain/world/world.ts`: one map tile is 64 world pixels, and
   physics conversion occurs only at the explicit physics boundary.
4. Source-style fixed-point quantities must be converted once at the domain
   boundary. In particular, GCI speed fields are Fix16 values and source
   `1.0` is `0x4000`; steering angles and directions use the source angle
   conventions rather than ad hoc radians or pixel-scale factors in callers.
5. The authoritative update order must remain:

   ```text
   lifecycle -> AI -> input/AI control -> physics -> collision -> combat -> replication
   ```

   In the original car pool, AI commands are prepared before physics integrates
   the car for the tick.

### 2. Traffic spawning and lifecycle

1. Ordinary traffic must be generated relative to player camera edges, not by
   uniformly filling a radial area around the player. The source considers
   each active camera and chooses an edge side, spawn direction, and scan into
   the visible-area boundary.
2. Spawning must enforce the recycled traffic limit. The source limit is 16
   recycled traffic cars, subject to the active game/settings limit.
3. A candidate spawn must satisfy all of the following before allocation:

   - the candidate road is flat and has a compatible arrow in the intended
     direction;
   - the required run of road tiles is long enough for the oriented car
     footprint;
   - the car footprint, including the source spawn scan margin, is free of
     collisions and outside movement-restricted regions;
   - the candidate is outside the relevant camera visibility area;
   - the zone permits traffic density and the current traffic/model selection
     rules permit the vehicle;
   - the selected model's dimensions and orientation fit the road.

4. Traffic model selection must continue to use authored vehicle metadata and
   the source's zone/density and rating pools. Police, gang, roadblock, and
   other special branches must not be collapsed into ordinary civilian
   traffic.
5. Ordinary traffic speed must be selected from the source speed bands and
   then constrained by the vehicle's authored maximum speed. The documented
   bands are based on source thresholds around `0x1EB`, `0xCCC`, `0x1333`, and
   `0x1999`; the implementation must keep the conversion in one place.
6. A successfully spawned NPC car must receive its dummy driver/crew as
   appropriate, have AI allocated, and start its engine before it enters the
   active simulation.
7. Despawning/recycling must be server-owned and interest-aware. A car that
   leaves the source-equivalent activity region may be recycled only after its
   authoritative occupants, task, and route state have been handled. A client
   must never create or remove traffic locally to compensate for a snapshot.
8. When a player enters a traffic car, the car must stop using NPC driving
   control for that tick and transition to player control. Its AI route/task
   state must be cleared or suspended according to the source ownership rule;
   the client must not continue autonomous motion underneath the player.
9. Police, mission, chase, and scripted cars must use their task-specific
   spawn/activation rules. They must not be synthesized by randomly selecting
   from the ordinary traffic `next` list.

### 3. Waypoint and route selection

#### 3.1 Ordinary traffic and local arrow following

1. Ordinary traffic must derive its immediate travel direction from the arrow
   mask of the current road block and the car's current cardinal direction.
   A direct Euclidean target point is not a sufficient replacement for this
   decision.
2. The current road block must be sampled at the car's actual position, with
   the source's slope/layer fallback behavior where applicable. The car must
   retain the current road direction while it is valid and enter road-seeking
   only when the forward road probe cannot find a valid continuation.
3. At a junction, explicit route/turn information takes precedence. If no
   turn is specified, the source chooses a random left or right turn rather
   than always selecting the first graph neighbor.
4. The selected turn must be planned before the car reaches the junction. The
   controller must track whether it is inside the junction, the planned turn,
   the current and next route directions, and whether the turn has been
   completed.
5. Local arrow traversal must count consecutive compatible arrow blocks. This
   run length is used for turn readiness, lane alignment, forward-car probing,
   and deciding when a route/turn has reached its arrow end.
6. Red arrows may be considered only for cars whose mode/task permits special
   routing, such as emergency or chase behavior. Ordinary civilian traffic
   must not silently use the red network.

#### 3.2 RGEN routes for target-driven cars

1. A target-driven car must resolve its current position and target to the
   corresponding RGEN segment/junctions and request a route through the route
   finder. The route search must use enabled links, junction type/arrow-type
   constraints, link lengths, and the source-style destination heuristic.
2. Route selection must produce a sequence of junctions/segments, not a flat
   list of arbitrary world points. The route cursor must advance only when the
   car has crossed the relevant segment/junction condition.
3. The first route direction must be resolved to an actual arrow block inside
   the junction. `FindArrowBlockInJunction`-style behavior is required,
   including the source fallback when the preferred direction has no matching
   arrow.
4. Route search must be cancellable when the route is invalid, exhausted,
   replaced by a new task, or no longer compatible with the car's current
   position. A failed route must enter an explicit recovery state rather than
   repeatedly steering toward a stale target point.
5. Chase/mission target setup must first resolve the target to an arrow-bearing
   block or a nearby compatible block with the correct slope type, then create
   the route. Near-target behavior must support the source's route cancellation
   and target snap/follow-behind rules where the task allows it.
6. Route waypoints must be represented as lane-centered travel goals. The
   source corrects toward the lane center, approximately the middle 40–60% of
   the tile coordinate, rather than aiming at an arbitrary graph-node center.

### 4. Approaching and handling waypoints

1. Each AI tick must derive the car's current cardinal direction, inspect the
   current block and the forward probe blocks, and then issue vehicle-control
   inputs. The controller must not teleport or directly overwrite the car's
   position to satisfy a waypoint during ordinary driving.
2. Steering must use the source turn model: straight, clockwise, and
   anticlockwise commands are applied to vehicle physics, which computes the
   resulting steering angle from speed, turn direction, vehicle parameters,
   and trailer state where applicable.
3. As the car approaches a turn, the controller must:

   - preserve the planned turn until the junction/arrow condition is crossed;
   - brake or reduce throttle when the turn or obstacle requires it;
   - steer into the selected cardinal direction;
   - align back to the lane center after the turn; and
   - clear turn-ready/alignment state only after the car is centered and the
     next road direction is valid.

4. When a car is taking a lane or following a car ahead, lane-center alignment
   must inspect the neighboring half-tile probes before moving laterally. It
   must not shift into an occupied or invalid neighboring lane.
5. Target speed must be controlled independently from waypoint selection. The
   car must accelerate toward its current target speed, use neutral when the
   source would coast, and use braking/handbrake/reverse when stopped or
   blocked. GCI chassis/engine parameters remain the authority for actual
   acceleration, steering, gearing, and torque.
6. A traffic car that loses the road must use the source recovery behavior:
   probe the four nearby cardinal directions, choose a compatible road-seeking
   turn, and resume arrow following when a valid road is found. A non-script
   car that remains off-road for the source timeout, approximately 200 ticks,
   may be abandoned/recycled; script-controlled cars require task-specific
   recovery.
7. Cars must preserve the source vertical/slope checks while selecting and
   approaching a waypoint. A flat-road target must not be treated as valid
   merely because its x/y distance is small.

### 5. Obstacle, traffic-light, and vehicle interaction

1. Forward obstacle scanning must occur before final throttle/steering output.
   The source probes near the car and farther ahead, and expands the probe
   around a pending turn. The implementation must retain equivalent probe
   coverage rather than checking only the next graph node.
2. A slower or blocked car ahead must cause the following car to choose among
   source-equivalent accelerate, coast, brake, stop, lane-align, yield, or
   pass-around behaviors based on relative speed, heading, distance, route
   state, and lane availability.
3. When yielding to a blocking car or road condition, the controller must
   maintain an explicit yield timer/state. The source uses a short yield
   interval (five ticks in the inspected routine) and then re-evaluates rather
   than making a permanent stop decision.
4. Cars must react to roadblocks, pedestrians, nearby objects, and cars through
   the shared AI collision/reaction path. A civilian car that stops for a
   pedestrian or roadblock must not bypass the behavior by following its
   waypoint through the obstacle.
5. Traffic lights must be represented as phase-driven world objects and
   approach markers. During the AI forward probe, a car approaching a marker
   must stop unless the current phase grants the corresponding direction. The
   AI must not use a client-only or per-car fake timer as the traffic-light
   authority.
6. Collision handling must be able to reset road-seeking state, preserve the
   car's authoritative velocity/occupancy, and dispatch the source-specific
   response. Chase cars may intentionally ram their target; ordinary traffic
   must use the normal avoidance/yield path.
7. The first short period after allocation must be treated as a stabilization
   period before ordinary car-ahead detection, matching the source's initial
   detection guard. This prevents a newly spawned car from immediately
   interpreting its spawn geometry as a blocked road.

### 6. NPC modes and task policy

The shared driving core must expose an explicit mode/task policy instead of
inferring behavior from a generic `targetNode` field.

| Mode | Navigation source | Special behavior |
| --- | --- | --- |
| Ordinary traffic | Current green arrows; random turn when no turn is planned | Camera-edge spawn, traffic speed band, normal obstacle avoidance |
| Route/script car | RGEN route plus arrow blocks | Authored target, route replacement/cancellation, script-specific persistence |
| Police/emergency | RGEN route and permitted red/special arrows | Emergency priorities, target pursuit, source chase/near-target behavior |
| Gang/crew | Task route or local road arrows | Crew/mission occupancy and task-specific aggression |
| Dummy after player disconnect | The car's previous task or ordinary AI fallback | Must remain server-authoritative and deterministic |
| Abandoned/stuck | Recovery, stop, or recycle policy | No hidden client-side motion |

At minimum, the replicated/shared AI state must distinguish ordinary traffic,
target-driven route following, chase/emergency behavior, player takeover, and
abandoned/recovery. `cruise`, `yield`, `brake`, `turn`, `stuck`, and `wrecked`
are useful presentation states but are not sufficient as the authoritative
task model by themselves.

### 7. State required for deterministic simulation and replication

The server-side controller must retain, or be able to derive without loss, the
following state:

- NPC mode/task and driver ownership;
- target entity/position and target validity;
- RGEN route id, route cursor, current junction, and route direction;
- current arrow block, arrow cursor/run length, current direction, target
  direction, and planned turn;
- lane-center target and lane-change/alignment state;
- authored maximum speed, current target speed, and source speed class;
- obstacle/yield/traffic-light state and timers;
- off-road/road-seeking state and timer;
- collision/ram/avoidance permission;
- vehicle occupancy, engine/running state, and player takeover state.

Only the resulting authoritative vehicle transform, velocity, occupancy, and
the state needed by clients for interpolation/debug presentation need be put on
the wire. If a client-facing AI state is replicated, it must be derived from
the server controller and must not be accepted as an input command.

### 8. Verification requirements

Add focused deterministic fixtures for at least the following cases:

1. A straight green-arrow road keeps a traffic car centered and at its target
   speed.
2. A fork with no planned turn selects a valid random turn and does not select
   an unavailable arrow.
3. A planned RGEN route chooses the correct junction sequence and arrow block,
   advances its route cursor, and cancels cleanly when invalidated.
4. A red-only arrow block is preserved by loading and is available to an
   emergency/chase car but not ordinary traffic.
5. A traffic-light marker stops an approaching car during a red phase and
   permits it during the matching green phase.
6. A slower car ahead causes braking/coasting or a safe lane response, and a
   blocked side lane prevents unsafe lateral alignment.
7. A roadblock, pedestrian, and collision each produce the appropriate
   obstacle/recovery state without letting the car drive through the object.
8. A car that leaves the road searches nearby directions, resumes the arrow
   network when possible, and is eventually abandoned only after the source
   timeout when it is not script-controlled.
9. Player entry into an NPC car transfers control without duplicate AI motion;
   player exit or dummy takeover restores only the explicitly allowed AI task.
10. The same server inputs, map, and initial car state produce the same route
    cursor, AI decisions, and vehicle inputs across repeated fixed-tick runs.

Use unit tests for route/arrow selection and controller transitions, physics
tests for input-to-motion behavior, and integration tests for server
authority, spawning, player takeover, and snapshot replication. Add a browser
test only where the behavior is specifically rendering- or interaction-visible.

## Implementation status and residual gaps

The main contract is implemented in the shared authoritative runtime:

- `src/shared/loader/map-parser.ts` preserves both green and red road arrows,
  including red-only blocks, and exposes the active RGEN links used by routing.
- `src/shared/domain/vehicles/road-routing.ts` separates local arrow following
  from target-driven RGEN routing, with deterministic segment lookup, link
  filtering, route cursors, and first-arrow resolution.
- `src/shared/domain/vehicles/car-traffic.ts` applies mode-aware route policy,
  direction and turn state, lane alignment state, authored speed bands,
  obstacle probes, shared traffic-light phases, and off-road recovery before
  physics.
- `src/shared/domain/vehicles/traffic-obstacles.ts` and
  `src/shared/domain/vehicles/traffic-lights.ts` keep obstacle and signal
  decisions deterministic and world-owned.
- `TrafficState`, DTO projection, and validation expose task, route, turn, lane,
  speed, yield, obstacle, and recovery state. Player takeover clears active AI,
  and task-aware recycling protects non-ordinary cars.
- `docs/data-integration-notes.md` now describes the asset-backed autonomous
  traffic path rather than treating all spawned cars as parked.

The remaining gaps are fidelity edges, not missing navigation architecture:

- The original steering state machine is not fully recovered. Continuous
  target-angle steering is used in place of every source turn mode, and exact
  lane-center correction, reverse/handbrake recovery, slope/layer transitions,
  and turn-completion thresholds need further source or runtime evidence.
- Spawn density, movement-region rejection, special model pools, source dummy
  drivers/crew, and disconnect takeover are not fully reproduced.
- Police/gang policy, scripted route assignment, service-route fidelity, and
  exact chase transitions remain incomplete. The local decompilation marks the
  chase state-machine routine as WIP, so those transitions must be verified
  before being treated as source facts.
- Obstacle dispatch covers cars, actors, side lanes, arrow blockers, and shared
  traffic-light phases; object/roadblock reactions and exact light-marker
  geometry remain to be added.

These residuals remain explicit because the original behavior depends on the
distinction between authored road arrows, junction routing, and vehicle
control; a generic waypoint abstraction would hide meaningful differences.

## Known uncertainty

The ordinary traffic spawn, road-arrow following, route-finder, traffic-light
marker, and obstacle-probe behavior is present in the inspected local source.
The detailed chase state transitions are not fully recoverable from the local
decompilation because `UpdateStateMachine_44E560` is incomplete. Implementers
must preserve the confirmed chase setup and shared driving behavior, then
verify the remaining follow-behind/alongside/pull-ahead transitions against
additional source evidence or runtime traces instead of inventing a new chase
model silently.
