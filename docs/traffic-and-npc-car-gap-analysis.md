# Traffic and NPC car gap analysis

## Scope and baseline

This analysis compares the current WebGL clone with
[Traffic and NPC car AI requirements](traffic-and-npc-car-requirements.md).
It covers the shared loader, server/local simulation, vehicle controller,
physics boundary, protocol state, and tests.

The first version of this analysis described the pre-implementation baseline.
The implementation work has now closed the main architectural gaps: red-only
road data is preserved, RGEN routing is available to shared AI, obstacle and
traffic-light services are wired into the controller, and traffic state is
replicated with explicit task/route/turn/lane fields. The remaining gaps below
are source-fidelity limitations or behaviors that cannot be confirmed from the
incomplete local chase decompilation.

Verification after implementation:

- `pnpm check` passes, including TypeScript and architecture-boundary checks.
- `pnpm test` passes: 45 Vitest files, 300 tests.
- `pnpm build` passes for the client, server, and static package.
- `git diff --check` passes.

The detailed findings retain the original evidence and file locations, but
status statements marked as resolved below describe the current implementation
rather than the pre-implementation baseline.

## Status legend

- **Implemented** — present in the runtime and sufficiently aligned for the
  requirement.
- **Partial** — useful implementation exists, but source behavior or an
  important branch is missing.
- **Missing** — data or scaffolding may exist, but the behavior is not wired
  into the runtime.
- **Contradicted** — the current behavior intentionally differs from the
  requirement or source behavior.

## Executive summary

| Area | Status | Main finding |
| --- | --- | --- |
| Fixed-step authority and vehicle physics | Partial/strong | Server and local worlds advance vehicles through shared physics, but the AI controller supplies simplified inputs. |
| Camera-edge traffic spawning and 16-car cap | Partial | Edge selection, road runs, outside-camera filtering, authored footprint checks, recycling, and cap exist; source density, crew, and special-spawn rules remain incomplete. |
| Green-arrow local navigation | Partial/implemented | Green-arrow adjacency, direction state, arrow runs, turn planning, lane alignment state, and off-road recovery are wired; the steering state machine remains simplified. |
| Red/special navigation | Implemented/partial | Red-only blocks are preserved and ordinary traffic excludes special links; chase/emergency/service modes may opt into them. Exact source permissions remain incomplete. |
| RGEN route finding | Implemented/partial | Shared segment/junction lookup, enabled-link filtering, route search, route cursor, and first-arrow resolution are used by task-driven cars; full source junction semantics remain incomplete. |
| Waypoint approach and lane handling | Partial | Direction/turn/lane targets and authored speed bands are present; source steering modes, lateral correction, and slope/layer behavior remain simplified. |
| Obstacle and traffic-light handling | Partial/implemented | Shared probes cover cars, actors, side lanes, arrow blockers, and direction-specific light phases; object/roadblock reactions and exact source markers remain incomplete. |
| NPC car modes | Partial | Explicit ordinary/scripted/chase/emergency/service state and pursuit handling exist; police/gang policy, crew, and exact chase transitions remain incomplete. |
| Player takeover and authority | Mostly implemented | Server/local simulation owns traffic, player takeover clears active AI, and task-aware recycling protects active task cars; dummy-driver lifecycle remains incomplete. |
| Replicated AI state | Mostly implemented | Route/task/turn/lane/timer/recovery fields are projected and validated; client presentation does not independently simulate them. |
| Verification | Implemented for the new contracts | New tests cover red-only/RGEN routing, light phases, obstacles, controller policy, and state lifecycle; source-uncertain edge behavior still needs scenario fixtures. |

## Detailed findings from the pre-implementation baseline

The following sections preserve the evidence that motivated the implementation
work. Their original gap lists are historical; the current residual gaps are
summarized in the post-implementation section below.

### 1. Data loading and navigation inputs

#### Implemented

- `decodeRoadArrows` preserves green and red masks for individual map blocks in
  `src/shared/loader/map-parser.ts:88-91`.
- GMP `RGEN` bytes are decoded into junctions and horizontal/vertical segments
  in `src/shared/loader/map-parser.ts:95-118`.
- Road adjacency is built from neighboring blocks and separates green
  `next` links from red `specialNext` links in
  `src/shared/loader/map-parser.ts:228-234`.
- The project has a single 64-pixel tile/30 Hz world boundary and source Fix16
  conversion helpers in `src/shared/domain/world/world.ts:6-22` and
  `src/shared/domain/world/world.ts:264-266`.

#### Gaps

1. **Red-only road blocks are lost.** The road-node construction filters on
   `GreenMask` at `src/shared/loader/map-parser.ts:221-226`. A block with only
   red arrows never enters `roadNodes`, so emergency/special routing cannot
   reach it even though red decoding itself works.

2. **RGEN is metadata-only.** The only runtime uses of `junctions` and
   `horizontalSegments`/`verticalSegments` are parsing and renderer debug
   overlays. There is no shared `RouteFinder` equivalent that resolves a car's
   position/target to RGEN junctions, searches enabled links, or advances a
   route cursor.

3. **The runtime road graph is not source-equivalent.** `RoadNode.next` and
   `specialNext` are direct adjacent-tile links. The original uses arrow masks
   for local driving and RGEN junction/segment data for target-driven routes;
   those two concepts are currently collapsed into one graph abstraction.

#### Impact

This prevents authored mission/police routes and makes special-road behavior
unreliable. It also means current traffic choices depend on the loader's
green-only node set rather than the full authored road data.

### 2. Traffic spawning and lifecycle

#### Implemented

- The clone uses camera-sized tile bounds, randomized edge/direction ordering,
  an outside-camera buffer, and inward road scanning in
  `src/shared/domain/vehicles/car-traffic.ts:165-209`.
- The 16-car recycled limit is enforced in the spawner and runtime at
  `src/shared/domain/vehicles/car-traffic.ts:250-253` and
  `src/shared/game/runtime/vehicle-runtime.ts:107-129`.
- Flat-road checks, compatible green-arrow runs, deterministic model selection,
  spawn-position selection, and basic occupied-footprint rejection exist in
  `src/shared/domain/vehicles/car-traffic.ts:143-163` and
  `src/shared/domain/vehicles/car-traffic.ts:260-304`.
- Server/local worlds maintain traffic around player anchors and recycle cars
  outside the interest radius in
  `src/shared/game/runtime/vehicle-runtime.ts:107-129`.
- Spawned vehicles are created as dynamic physics objects and are replicated
  through the server snapshot path. Network clients do not run the traffic
  planner because `updateUnoccupiedVehicleDynamics` gates it on `!host.localId`
  at `src/shared/game/runtime/vehicle-runtime.ts:51-68`.

#### Gaps

1. **The final spawn validation is only an approximation.** The clone checks
   other entity positions with a swept rectangle, but does not reproduce the
   source's full map/movement-region checks, per-tile collision rectangle, or
   all source orientation/width/height rules. `CarInfo` is used for model
   selection and paint, not to form the final oriented spawn footprint.

2. **Zone density and traffic-generation policy are absent.** The source's
   zone density, wanted-level effects, police/gang ratios, roadblock branch,
   and special model pools are not represented in `spawnAround`. The current
   pool is only a rating-weighted list assembled in
   `src/shared/domain/vehicles/car-traffic.ts:112-123`.

3. **NPC driver/crew allocation is absent for ordinary traffic.**
   `makeParkedVehicle` creates an empty `passengers`/`occupants` list at
   `src/shared/domain/vehicles/car-traffic.ts:216-247`. The server can still
   advance an unoccupied chassis through `controlFor`, but it does not model
   the source dummy driver, gang crew, police crew, or driver-specific task
   ownership.

4. **The spawn cadence is simplified.** `spawnAround` returns at most one car
   per call, while the source makes a camera/density decision and can attempt
   multiple candidate paths. The cap is present, but traffic density is not
   source-equivalent.

5. **Recycling is not task-aware.** `maintainTraffic` removes any vehicle
   outside `INTEREST_RADIUS` without checking a script/chase task or preserving
   task state for later reactivation. This is acceptable for ordinary recycled
   traffic but unsafe as a general NPC-car lifecycle.

6. **The project documentation still describes parked traffic.**
   `docs/data-integration-notes.md:34` and `docs/data-integration-notes.md:97-101`
   describe cars as parked and inactive. That no longer matches the asset-backed
   server/local path when car physics metadata is available, and it obscures
   the distinction between the current simplified AI and the desired source
   behavior.

#### Impact

The clone can populate a map plausibly, but it cannot yet guarantee that a
spawned vehicle has the same authored eligibility, occupants, route policy, or
recycling semantics as the original.

### 3. Local road following and waypoint selection

#### Implemented

- Spawned vehicles carry `routeNode` and `targetNode` fields.
- `controlFor` advances to a target when within 0.7 tiles and selects a
  deterministic candidate from `next` plus `specialNext` in
  `src/shared/domain/vehicles/car-traffic.ts:334-342`.
- The controller computes a signed shortest rotation toward the selected point
  and emits a clamped steering value in
  `src/shared/domain/vehicles/car-traffic.ts:344-350`.
- The world runs traffic AI before vehicle physics in
  `src/shared/game/runtime/phase-runners.ts:125-136`, and the native physics
  body remains responsible for pose integration.

#### Gaps

1. **The current waypoint is a graph point, not an authored lane goal.**
   `lanePoint` returns the exact tile center at
   `src/shared/domain/vehicles/car-traffic.ts:68-75`; no lane fraction or
   lateral offset is maintained.

2. **Cars do not derive travel direction from the current block.**
   `controlFor` follows `routeNode`/`targetNode` and then steers toward the
   target's Euclidean position. It does not inspect the current block's arrow
   mask, current cardinal direction, slope/layer fallback, or forward arrow
   continuation.

3. **Junction behavior is not implemented.** There is no source-equivalent
   planned turn, inside-junction state, arrow-run count, turn-ready flag, or
   turn completion condition. The optional `junction` field exists in the
   protocol but is not assigned by `controlFor`.

4. **Turn choice is not source-equivalent.** If a target is missing, the
   controller takes the first valid neighbor at
   `src/shared/domain/vehicles/car-traffic.ts:325-327`; when a target is
   reached it randomly chooses from all green and special neighbors at
   `src/shared/domain/vehicles/car-traffic.ts:337-340`. This is not the source
   rule of preserving an explicit turn and choosing a random left/right turn
   only when no turn is planned.

5. **Ordinary cars can use red/special adjacency.** Because `specialNext` is
   included unconditionally, ordinary traffic can select red-arrow links. This
   is the opposite of the required mode-specific red-route permission.

6. **No road-seeking/recovery state exists.** There is no forward road probe,
   four-direction recovery, off-road timer, or source-style abandonment after
   prolonged failure. A missing target simply returns a braking control packet
   at `src/shared/domain/vehicles/car-traffic.ts:329`.

#### Impact

Cars may look correct on a straight synthetic road, but turns and route choice
are not authored-GTA2 behavior. Complex junctions, disconnected graph nodes,
slopes, and special routes will expose the difference immediately.

### 4. Waypoint approach, speed, and vehicle handling

#### Implemented

- The shared vehicle integrator has source-shaped Fix16 conversions, GCI
  authored max-speed handling, gear/torque, braking, steering scale, mass,
  turbo, slope, damping, and collision integration. The relevant foundations
  are in `src/shared/domain/physics/vehicle-kinematics.ts` and
  `src/shared/domain/physics/vehicle-integration.ts`.
- `VehicleControl` supports throttle, steer, brake, handbrake, and AI mode in
  `src/shared/domain/physics/vehicle-kinematics.ts:63-73`.
- The controller applies authored vehicle speed as a rough target and can
  reduce speed behind another vehicle in
  `src/shared/domain/vehicles/car-traffic.ts:351-366`.

#### Gaps

1. **The source traffic speed result is not wired into traffic control.**
   `trafficSpeedFor` and `trafficCruiseSpeedFor` exist in
   `src/shared/domain/physics/vehicle-integration.ts:208-235`, but
   `controlFor` instead uses `authoredSpeed * .78`, or `.9` for pursuit, with
   a hard minimum of 70 at `src/shared/domain/vehicles/car-traffic.ts:353-355`.
   The selected source speed band is therefore not persisted as the car's
   actual AI speed cap.

2. **AI does not issue source-equivalent neutral/handbrake/reverse decisions.**
   The controller emits throttle, steer, and brake only. It does not use the
   source foot-brake/handbrake thresholds, reverse recovery, or explicit
   coasting/neutral state.

3. **Steering is target-angle steering, not source turn control.** The source
   AI selects straight/clockwise/anticlockwise commands and physics derives
   the steering angle. The clone emits a continuous `delta * 2.5` steering
   value and has no turn-mode state.

4. **Lane-center correction is missing.** There are no half-tile side probes,
   center-band checks, or safe lateral alignment when following a car or
   exiting a junction.

#### Impact

The physics layer is a useful foundation, but it cannot provide source
fidelity by itself while the AI supplies a different control policy.

### 5. Obstacles, traffic lights, and collisions

#### Implemented

- The controller detects another same-floor vehicle within a forward 3.5-tile
  corridor and reduces target speed/brakes when it is close, at
  `src/shared/domain/vehicles/car-traffic.ts:358-366`.
- Planck/native physics handles body collisions, and vehicle damage transitions
  can mark cars stuck or wrecked in `src/shared/domain/combat/vehicle-damage.ts`.
- Traffic-light zones are loaded and can set a replicated `signal` field.

#### Gaps

1. **There is no source forward-probe pipeline.** The clone does not perform
   the near/far road probes, turn-expanded probes, movement-region checks, or
   source reaction dispatch for cars, objects, and pedestrians.

2. **Car-ahead handling is too coarse.** It does not compare headings and
   source speeds in the full way, inspect upcoming arrow runs, probe side
   lanes, or choose pass-around/lane-yield behavior. It only clamps speed and
   brakes based on distance.

3. **Yield is a label, not a controller state.** `aiState = 'yield'` is set for
   a red timer or service stop, but there is no source yield timer/recheck
   state for blocked-road reactions.

4. **Traffic lights are a per-car fake timer.** The current logic checks zone
   membership and derives red/green from `(tick + vehicle.id * 17) % 150` at
   `src/shared/domain/vehicles/car-traffic.ts:367-372`. There is no shared
   traffic-light phase service, approach marker, or direction-specific stop
   collision. Different cars can therefore disagree about the same light.

5. **Arrow-blocker zones are loaded but unused by car AI.** The loader exposes
   `arrowBlockerZones`, but no controller or collision path consults them.

6. **Collision does not feed road recovery.** General collision damage and
   physics are implemented, but the AI does not reset route/road-seeking state,
   select a recovery direction, or apply chase-specific ramming permission.

#### Impact

Cars can stop for a simplified ahead-car or zone condition, but they do not
behave as traffic participants around the authored world. Intersections,
pedestrians, roadblocks, lights, and collisions remain the largest visible
runtime fidelity gap after route selection.

### 6. NPC modes, police, and target-driven cars

#### Implemented

- `TrafficState` carries `pursuitTarget`, and the pedestrian runtime can assign
  a police target when a police NPC enters a vehicle at
  `src/shared/game/runtime/pedestrian-runtime.ts:113-126`.
- `controlFor` resolves that target when it is visible on the same floor and
  raises the target speed for pursuit at
  `src/shared/domain/vehicles/car-traffic.ts:330-355`.
- Bus/train metadata, service zones, service stops, and passenger boarding
  scaffolding exist in `car-traffic.ts:391-421` and
  `pedestrian-runtime.ts:101-111`.
- Player takeover clears active AI presentation fields and pursuit state in
  `src/shared/game/gameobjects/vehicle/vehicle-ai.ts:16-33`.

#### Gaps

1. **There is no explicit NPC car mode/task.** The protocol exposes
   `aiState`, route/target node ids, and optional pursuit/service fields, but
   not ordinary traffic vs scripted route vs emergency/chase vs abandoned
   ownership.

2. **Police/emergency behavior is not a car spawning mode.** A police NPC can
   attach a pursuit target after entering a sufficiently slow ordinary vehicle,
   but there is no source police car selection, emergency route permission,
   red-arrow policy, crew setup, siren behavior, or chase route generation.

3. **Mission/script cars have no route/task runtime.** There is no API that
   requests a target-driven RGEN route, replaces a route, preserves a scripted
   car outside the ordinary traffic pool, or applies source target snap/follow-
   behind behavior.

4. **Public transport is a simplified shared-road cursor.** The service spawn
   comment explicitly says it reuses the shared road cursor rather than a
   separate rail/service route. It is useful scaffolding but not evidence of
   source bus/train path behavior.

5. **Ordinary traffic has no dummy driver.** Because the car is controllable
   while its passenger list is empty, control ownership is represented by the
   runtime rather than the source driver/crew model.

#### Impact

The clone has the beginnings of pursuit and service behavior, but it currently
cannot express the task policy needed to decide which roads, speeds, signals,
and obstacle reactions an NPC car is allowed to use.

### 7. Authority, ownership, and replication

#### Implemented

- The runtime phase order places traffic maintenance and AI before vehicle
  physics, collision, and replication in
  `src/shared/game/runtime/phase-runners.ts:125-136` and the phase modules.
- Server-created traffic is snapshot-replicated through
  `toClientTraffic` in `src/shared/protocol/client-dto.ts:104-117`.
- Network clients reconcile traffic snapshots and do not run the authoritative
  traffic planner, while local single-player/split-screen worlds are created
  with `localId === undefined` in `src/client/app/local-session.ts:6-21` and
  therefore run the shared simulation locally.
- Player control transfer is guarded by `VehicleAiController`, which prevents
  the AI packet from being applied to a player-driven car.

#### Gaps

1. **The replicated state is presentation-oriented.** Current fields include
   `aiState`, `routeNode`, `targetNode`, `junction`, `signal`, transport,
   service stop, and pursuit target (`src/shared/protocol/types.ts:109-135`),
   but omit the source controller state: mode/task, route id/cursor, arrow
   cursor/run, current/target direction, planned turn, lane target, yield and
   obstacle timers, and off-road state.

2. **Player takeover clears presentation state but leaves navigation metadata.**
   `setPlayerControlMode` clears `aiState`, signal, service stop, and pursuit,
   but keeps `routeNode`/`targetNode`. That is acceptable only if those fields
   are explicitly inert while player-controlled; the current protocol does not
   encode that distinction.

3. **Task-aware server lifecycle is not represented.** Interest recycling and
   snapshot removal work for ordinary traffic, but a future scripted/chase car
   has no replicated state that would tell the server whether it may be
   recycled or must be reactivated with its task intact.

### 8. Verification and documentation

#### Implemented

Current traffic tests cover:

- spawning up to the 16-car limit;
- interest-radius recycling;
- keeping inward-facing spawns outside the camera rectangle; and
- signed steering toward a simple rightward target.

These are in `src/tests/unit/car-traffic.test.ts:8-96`.

The loader has an RGEN metadata test in `src/tests/unit/core.test.ts:39-48`,
and renderer/debug tests validate the current AI presentation fields.

#### Gaps

There are no tests for:

- red-only road blocks;
- ordinary-vs-emergency red-arrow permissions;
- current-block arrow direction and random turn selection;
- RGEN segment lookup, link filtering, route search, or route cursor advance;
- lane-center correction or turn approach;
- shared traffic-light phase and direction-specific stop markers;
- roadblocks, pedestrians, map objects, side-lane yield, or off-road recovery;
- police/script car modes and chase state transitions;
- dummy driver/crew ownership; or
- deterministic repeated AI decisions with identical fixed-tick inputs.

The existing “does not invent … autonomous traffic” integration assertion in
`src/tests/integration/world-activity.test.ts:26-34` and the “parked cars” test
name in `src/tests/unit/car-traffic.test.ts:8` describe fixture behavior where
no car physics metadata is supplied. They should be revised or supplemented
with asset-backed tests once autonomous traffic is treated as a required
feature, so the suite does not encode the current scaffolding as the target
behavior.

## Post-implementation residual gaps

The main requested traffic architecture is now implemented in the shared
runtime:

- `src/shared/loader/map-parser.ts` preserves green and red road arrows,
  including red-only blocks, and exposes source RGEN link data.
- `src/shared/domain/vehicles/road-routing.ts` provides segment lookup,
  enabled-link filtering, deterministic route search, route cursors, and first
  arrow-block resolution.
- `src/shared/domain/vehicles/car-traffic.ts` uses mode-aware local arrows or
  RGEN routes, persists direction/turn/lane/speed/timer state, recovers from
  off-road positions, and applies obstacle/light decisions before physics.
- `src/shared/domain/vehicles/traffic-obstacles.ts` and
  `src/shared/domain/vehicles/traffic-lights.ts` provide shared deterministic
  services rather than per-car ad hoc checks.
- Protocol DTOs and validation expose the AI task, route, turn, lane,
  obstacle/yield, and recovery state; player takeover and task-aware recycling
  are explicit.

The remaining implementation work is narrower and should not be described as
missing architecture:

1. The exact source steering state machine is still simplified to a continuous
   target-angle control. Lane-center correction, reverse/handbrake recovery,
   slope/layer transitions, and turn-completion thresholds need more source or
   runtime evidence.
2. Spawn density, movement-region rejection, special model pools, source dummy
   drivers/crew, and disconnect takeover are not fully reproduced.
3. Police/gang policy, scripted route assignment, service-route fidelity, and
   the exact chase transitions remain incomplete. The local decompilation marks
   the chase state-machine routine as WIP, so these should be verified before
   being treated as source facts.
4. Obstacle coverage is deterministic for cars, actors, side lanes, arrow
   blockers, and traffic-light phases, but object/roadblock reaction dispatch
   and exact authored light-marker geometry remain to be added.

Recommended next tests are asset-backed scenario fixtures for straight roads,
forks, junctions, red-only links, slopes, invalidated routes, player takeover,
police pursuit, and repeated fixed-tick determinism.

## Bottom line

The clone now has an authoritative, shared layered controller:

```text
current arrow block -> RGEN/turn decision -> lane-centered approach
    -> forward/side/object/light probes -> physics control -> recovery state
```

It should be described as “authoritative autonomous traffic with source-shaped
navigation and explicit residual fidelity gaps”; the remaining uncertainty is
documented rather than hidden behind a generic waypoint abstraction.
