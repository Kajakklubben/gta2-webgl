# Runtime architecture

The repository has a shared deterministic game core with thin platform
adapters. Dependencies point toward smaller, more stable contracts:

```text
browser adapter       src/client
server adapter        src/server
        │
shared game           src/shared/game, src/shared/domain
asset/protocol edges  src/shared/loader, src/shared/protocol
        │
generic engine        src/shared/engine
        │
runtime libraries     Planck.js, Three.js, WebSocket, browser/Node APIs
```

## Repository boundaries

| Area | Owns | Must not own |
| --- | --- | --- |
| `src/shared/engine` | fixed-step clocks, generic runtime coordination, physics interfaces, native solver implementation | GTA2 rules, asset formats, UI, transport |
| `src/shared/domain` | GTA2 combat, physics math, vehicles, pedestrians, world constants | browser APIs, server APIs, rendering |
| `src/shared/game` | game composition, object lifecycle, effects, runtime phases, GTA2 physics adapters, snapshots | Three.js, WebSocket transport |
| `src/shared/loader` | GMP/STY/GCI/SCR decoding and typed asset bundles | filesystem access and HTTP serving |
| `src/shared/protocol` | wire shapes, DTO conversion, validation, protocol constants | UI and server-only implementation details |
| `src/client` | browser sessions, input, UI, rendering, visual tools | server authority and filesystem access |
| `src/server` | asset access, HTTP, WebSocket rooms, authority, snapshots | browser UI and rendering |
| `src/tests` | unit, integration, and browser verification | production runtime behavior |

## Generic engine

`src/shared/engine` contains infrastructure that can be reused by a game:

- `fixed-clock.ts` accumulates real time and executes bounded fixed steps;
- `game-engine.ts` drives a fixed-step world;
- `world-runtime.ts` provides generic phase coordination; and
- `physics-world.ts` defines the engine-facing physics boundary and the
  solver-neutral `PhysicsBody` transfer port. `planck-physics.ts` contains the
  native Planck implementation behind that boundary, including any internal
  world split. Game code never imports Planck or relies on the number of native
  worlds.

The engine receives input through callbacks and does not decide what a weapon,
car, player, map tile, or network packet means. GTA2-specific physics and
contact behavior lives in `src/shared/game/physics`, using only the engine
contracts.

## Shared game

`src/shared/game/gta2-game.ts` is the public GTA2 composition boundary and
extends `GameWorld` from `game-world.ts`. `GameWorld` owns the shared state and
connects focused modules without making the platform adapters know about the
internal system layout.

### Game objects and effects

`src/shared/game/gameobjects` contains the typed `GameObject` classes and
`GameState` store:

- `game-state.ts` owns object identity, typed lookup, state views, and deferred
  spawn/despawn operations;
- `gameobject.ts` defines placement, collision descriptors, update contexts,
  and engine-neutral draw commands;
- `player/` and `vehicle/` contain multi-file actor families;
- `npc.ts` and `map-object.ts` contain single-file object types; and
- `src/shared/game/effects` contains pickups, projectiles, hazards, and car-fire
  objects.

The object store is flat. Vehicle occupancy, projectile ownership, and effect
relationships stay in domain state and object actions rather than a generic
parent/child registry. The client consumes draw commands; shared objects never
import the renderer.

### Runtime phases

`src/shared/game/runtime` advances a `GameWorld` in a fixed order:

```text
lifecycle → AI → input → physics → collision → combat → replication
```

`phases.ts`, `phase-runners.ts`, and `early-phases.ts` define the order. Focused
controllers handle map collision, surfaces, vehicles, pedestrians, combat,
projectiles, damage, prediction, reconciliation, and object operations. Domain
rules remain in `src/shared/domain`; runtime modules coordinate them.

### Physics

`src/shared/game/physics` owns GTA2-specific shape descriptors and contact
handling. The shared domain supplies collision shapes, surface queries,
vehicle integration, skid, impact, collision categories, and proximity
calculations. The native Planck lifecycle and any internal world split belong
to `src/shared/engine/planck-physics.ts`; game physics translates map metadata
and GTA2 descriptors through the engine-facing ports. Map walls and dynamic
entities therefore use the same engine abstraction without exposing the solver
choice or world count to gameplay code.

Vehicle metadata is resolved once from the loaded GCI/CARI catalog. Occupancy
and door transitions use `src/shared/domain/vehicles/vehicle-occupancy.ts` and
replicate the vehicle links needed by remote clients. The server remains the
authority for traffic, vehicles, NPCs, effects, combat, and match state.

## Assets and protocol

`src/shared/loader` is the typed asset boundary. Parsers decode source bytes;
`asset-loaders.ts`, `bundle.ts`, and `cars.ts` compose map, style, pickup,
weapon, and vehicle catalogs; `models/` contains the returned shapes.

`src/shared/protocol` is the wire boundary. `types.ts` defines messages and
replicated state, `client-dto.ts` converts wire values, and `validation.ts`
rejects malformed input. `src/shared/game/snapshot-codecs.ts` clones and
applies nested state so authoritative restores do not accidentally share
mutable arrays or objects.

## Server adapter

`src/server/main.ts` initializes typed assets, creates the initial game, and
assembles HTTP and multiplayer adapters. `config.ts` and `runtime-config.ts`
resolve the checkout-local port and asset/map/style/script configuration.

`multiplayer.ts` owns WebSocket peers, rooms, input queues, ready/chat state,
and the fixed tick. `snapshot-builder.ts` builds the initial and incremental
client snapshots, including interest-filtered world state. The server creates
one `Gta2Game` per room and drives it through `GameEngine`.

## Client adapter

`src/client/app` owns browser lifecycle and session orchestration:

- `main.ts` is the thin browser entrypoint;
- `game-client.ts` composes the session and UI integrations;
- `game-client-frame.ts` advances local input, sends online input, and renders;
- `game-client-network.ts` owns WebSocket connection and snapshot ingestion;
- `game-client-hud.ts` maps player state to HUD elements;
- `local-session.ts` and `multiplayer-session.ts` build the two game modes; and
- `client-snapshot.ts` expands and restores authoritative snapshots.

`src/client/rendering` turns draw commands and authoritative state into Three.js
presentation. `renderer.ts` coordinates cameras, map meshes, sprites,
interpolation, transient presentation, and debug layers. `src/client/tools`
contains the sprite viewer and deterministic scenario viewer; these tools reuse
production loaders, game objects, and rendering without becoming alternate
gameplay implementations.

## Tests

Tests mirror the runtime boundaries:

- `src/tests/unit` covers domain, loader, protocol, object, rendering, and
  runtime behavior with synthetic fixtures;
- `src/tests/integration` covers HTTP/WebSocket, configuration, rooms, and
  server-side world activity; and
- `src/tests/e2e` runs Playwright against the synthetic fixture server and
  covers the game, sprite viewer, and scenario viewer.

## Change placement

When adding a feature, use the narrowest owner:

| Feature | Location |
| --- | --- |
| Fixed timestep or generic phase coordination | `src/shared/engine` |
| GTA2 weapon, vehicle, pedestrian, collision, or world rule | `src/shared/domain` |
| Game object, effect, runtime controller, or snapshot reconciliation | `src/shared/game` |
| GMP/STY/SCR/GCI decoding or asset model | `src/shared/loader` |
| Network-visible state shape or message validation | `src/shared/protocol` |
| WebSocket rooms, HTTP, asset files, or authority | `src/server` |
| Input, HUD, browser session, Three.js, or visual tools | `src/client` |
| Verification of any of the above | `src/tests` |

The server owns authoritative multiplayer mutation. Clients send sequenced
inputs and apply snapshots for presentation; they do not run a second
authoritative multiplayer world.
