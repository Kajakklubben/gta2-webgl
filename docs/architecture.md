# Runtime architecture

The runtime has four layers. Dependencies point downward toward smaller, more
stable contracts; the engine never imports GTA2 rules, asset formats, Three.js,
Node.js, or the network protocol.

```text
platform adapters       src/client, src/server
        │
game implementation     src/shared/domain, src/shared/objects, src/shared/game, src/shared/loader, src/shared/protocol
        │
engine                  src/shared/engine
        │
runtime libraries       Planck.js, Three.js, WebSocket, browser/Node APIs
```

## Engine

`src/shared/engine` contains reusable runtime mechanics:

- `fixed-clock.ts` accumulates real time and executes a bounded fixed step.
- `game-engine.ts` drives a deterministic world and owns the fixed world tick.
- future engine modules belong here when they are independent of GTA2 concepts:
  object lifecycle contracts, generic broad-phase collision, physics adapters,
  interpolation, and replay/rollback support.

The engine receives input through callbacks and does not decide what a weapon,
car, player, map tile, or network packet means. `world-runtime.ts` provides the
generic fixed-order phase runner used by the game implementation.

## Game implementation

`src/shared/game` is the public composition boundary for a game; `src/shared/domain` contains rules and `src/shared/objects` contains entity lifecycles. `Gta2Game` currently
wraps the deterministic `GameWorld` while the systems are migrated
incrementally. New GTA2 rules should enter through this boundary rather than
being added to the engine.

The GTA2 implementation owns:

- player, NPC, vehicle, pickup, projectile, hazard, and weapon rules;
- GTA2 collision categories, map floors, slopes, and Box2D fixtures;
- traffic graphs, car handling, SCR weapon points, and multiplayer state;
- GTA2 map/style/SCR/GCI decoders and typed asset catalogs under `src/shared/loader`;
- the versioned wire model in `src/shared/protocol`.

The shared implementation is organized by responsibility: `src/shared/objects` contains entity
lifecycles, `src/shared/domain/combat` contains weapons and damage, `src/shared/domain/physics` contains collision
and motion, `src/shared/domain/vehicles` contains traffic and occupancy, `src/shared/domain/world` contains GTA2
world constants and sprite metadata, and `src/shared/game/runtime` contains fixed-order
world runtime orchestration. Generic timing lives in `src/shared/engine`, while
GTA2 timing policy is defined in `src/shared/domain/world`.

## Shared object blocking

`GameObject.collision` declares a circle or oriented box, whether it is solid
or a sensor, and an optional movement weight (zero means immovable). The base
`GameObject.getCollider()` and `block()` methods own collider construction and
the normal blocking response. `CollisionWorld.resolveBlocking()` handles all
shape pairs uniformly, separating solids and removing only velocity into the
surface. Object kinds do not select a blocking algorithm; masks can explicitly
exclude a contact. Sensors produce queries without blocking movement.

Cars get their box dimensions from the loaded style's CARI records, on both
the server and client. Sprite padding does not affect their footprint. Every
car, including parked and burned-out cars, remains a dynamic solid with its
authored mass, so player and car contacts can push the chassis. Clients consume
these authoritative poses for presentation; they do not displace simulated
objects.
Impact damage is a separate game rule consuming pre-blocking contact velocities.
Authored map walls remain in the Box2D backend, whose poses are synchronized
after generic entity blocking. These compatibility modules currently live in
`src/shared/domain/physics/physics-world.ts` and `src/shared/domain/physics/collision.ts`; the game-facing
`PhysicsWorld` facade also drains map contact events in the shared collision
phase.

`GameObjectRegistry` owns object identity, lookup, iteration, and kind-based
cleanup; the world runtime no longer manipulates a raw object map when entities
are created, removed, or restored. Object behaviors receive a narrow
`GameObjectWorld` host and can defer child lifecycle changes until the phase
boundary instead of mutating the registry during iteration.

Vehicle lifecycle is keyed by vehicle id as well. `VehicleCatalog` resolves the
GCI handling record and CARI chassis bounds together, so traffic, player entry,
entity collision, and the Box2D wall adapter share one metadata decision. The
the world runtime no longer relies on array position to find or remove a vehicle.

Vehicle occupancy is a single authoritative state machine in
`src/shared/domain/vehicles/vehicle-occupancy.ts`. CARI's passenger count creates seat 0 for
the driver and numbered passenger seats, while each seat retains its authored
door. `TrafficState.occupants` is the source of truth; `driver` and
`passengers` remain synchronized aliases for older clients. Door state carries
the source open/close phase, frame, hold timer, and current occupant. The
the world runtime checks static-wall access before entry or exit, reserves the seat
while a ped approaches, interpolates the ped through the door into the seat,
and attaches seated players/NPCs to the vehicle pose. Exiting uses the same
door path in reverse and is gated by the source low-speed rule. Player and NPC
vehicle fields are replicated alongside the traffic state so clients can hide
seated sprites and attach remote occupants without running a second vehicle
the world runtime. `requestNpcEnterVehicle` and `requestNpcExitVehicle` expose the
same path to AI behaviors.

Traffic cars are spawned from authored road-arrow positions at the camera edge
and remain parked until a player takes the driver seat. No route cursor, traffic
light phase, waypoint steering, or ahead-of-car scan runs for spawned traffic;
the road graph is used only to select valid spawn lanes. CARI door positions
control entry/exit checks, while CARI emergency flags and remap indices are
retained in replicated state.

Vehicle integration follows the source force order: point velocity is sampled
at each wheel, engine torque is split across driven axles, lateral grip and
braking are applied at wheel points, and the resulting force/torque is divided
by authored mass and chassis moment before integration. Box2D remains the map
wall sweep; the shared collision world supplies oriented entity contacts and
mass-weighted impulses. Wrecks transition through the authored countdown into
a wreck sprite and a replicated fire effect.

Pedestrians build patrol loops from walkable map blocks instead of borrowing the
vehicle road graph. Their replicated state includes path cursor, walking,
panic/flee, knockdown, attack, and death states. Police react to wanted or
recently firing players, while civilians flee from nearby threats.

## Unified sprite draw model

Every `GameObject` exposes a typed `GameObjectSprite` description from its
`draw()` command. The description contains the atlas (`player`, `cars`,
`codeObjects`, or `objects`), model/range, animation timing, a shared
`GameObjectPlacement` value, opacity, and depth policy. Collision, movement,
labels, and rendering all use that same placement value. The world runtime therefore describes presentation without
depending on Three.js; the client renderer resolves the same command shape for
players, NPCs, vehicles, pickups, projectiles, and hazards. Asset-specific
frame lookup stays in [sprite-view.ts](/Users/kaspervidebaek/Documents/gta2-webgl/src/client/rendering/sprites/sprite-view.ts), the single dynamic sprite adapter, while gameplay objects remain authoritative and testable in the core. Static map geometry and transient impact effects remain separate because they have different lifetimes from simulated objects.

The client renderer accepts a named `RenderFrame` object rather than a long
positional argument list. This keeps interpolation, authoritative snapshot
state, and simulated object commands explicit as new presentation data is added.

Transient labels, impact bursts, and shot effects are owned by
`PresentationSystem`. `Renderer` coordinates map, sprites, presentation, and
debug layers without retaining per-frame label and effect state itself.

Runtime values cross the network boundary through the typed codecs in
`src/shared/game/snapshot-codecs.ts`. Server snapshots use cloned wire values, while
restore paths apply them to retained runtime objects. Nested combat state and
vehicle passenger arrays are copied at this boundary.

`GameWorld.step()` is a coordinator over the ordered phases
`lifecycle → ai → input → physics → collision → combat → replication`. Each
phase receives a fixed-step context and a small per-tick state object, making
the authoritative order visible and testable without moving GTA2 rules into
the engine.

## Architecture pass: ownership and presentation seams

The object model now has one ownership contract. `GameObjectRegistry` in
`src/shared/objects/game-state.ts` owns typed lookup and lifecycle used by the world runtime,
while each object can own transient child objects through `attachChild`,
`detachChild`, `children`, and `walkChildren`.
Children carry their parent key in draw commands, and registry removal cascades
through the ownership tree. This gives effects, mounted weapons, vehicle
occupants, and future sensors a place to live without adding special cases to
every system. The registry remains flat for collision and rendering lookup;
parentage describes lifetime, not spatial transforms.

Authoritative snapshots are reconciled by id in
`src/shared/game/runtime/reconciliation.ts`. Retained state objects are updated in
place, new ids are created, and missing ids are removed. This preserves
`GameObject`, collision-body, and renderer-mesh identity during multiplayer
updates. The renderer receives authoritative poses through explicit
`placementOverrides`, keyed by the same object key used by draw commands, so
rendering does not mutate raw protocol state.

This pass implements the five requested seams. The remaining architectural
risks are:

1. `GameWorld` still owns the GTA2 systems and should eventually become a
   thinner composition root around dedicated combat, traffic, and replication
   services.
2. Box2D and the entity broad phase remain separate implementations behind the
   common facade; a later pass can replace the adapter with one authoritative
   contact solver.
3. Runtime state still uses protocol-shaped fields internally. The codecs now
   isolate copying, but domain-specific runtime models and dirty replication
   fields are still a worthwhile follow-up.
4. Authority and replication diagnostics are not yet first-class object
   services.

These are boundaries rather than new game rules: engine code stays generic,
GTA2 rules stay in the game layer, and the client remains a presentation and
input adapter.

## Platform adapters

`src/server` owns filesystem loading, HTTP/WebSocket transport, room creation,
rate limits, and snapshot delivery. It creates one `Gta2Game` per room and
drives it with `GameEngine`.

`src/server/main.ts:init()` is the server bootstrap boundary. It loads the
typed assets, creates the initial `Gta2Game`, attaches HTTP and multiplayer
adapters, and returns an unbound server runtime. `startServer()` only adds the
listening socket and signal handlers. This keeps initialization reusable for
tests and for tools that create more than one checkout-local runtime.

When `PORT` is unset, `src/server/runtime-config.ts` hashes the absolute working
directory into the `8000–8999` range. Separate Git worktrees therefore get
stable, independent development ports; an explicit `PORT` still wins.

`src/client/app` owns browser input, bootstrapping, audio, and authoritative
snapshot application. `src/client/rendering` owns Three.js scene construction,
sprite presentation, map rendering, and debug views. Rendering code may read
game asset metadata but must not change authoritative game state.

## Change placement rules

When adding a feature, use the narrowest layer that can express it:

| Feature | Layer |
| --- | --- |
| Fixed timestep and accumulator | Engine |
| GTA2 weapon damage, car handling, slopes, pickup rules | Game |
| GMP/STY/SCR/GCI decoding | Shared loader |
| WebSocket validation, rooms, reconnects | Server adapter |
| Three.js materials, depth ordering, touch controls | Client adapter |
| A network-visible state shape | Shared protocol |

The server owns the deterministic game implementation and all authoritative
mutation in multiplayer. Clients send sequenced inputs and apply snapshots for
presentation.

