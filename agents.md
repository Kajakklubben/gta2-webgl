# Agent guide

## Project purpose

This repository is a browser-based reimplementation of GTA2 multiplayer. The
goal is to reproduce the original game's authored maps, vehicles, pedestrians,
weapons, animation, collision, traffic, vehicle entry, damage, and multiplayer
behavior while keeping the game playable through WebGL in a browser.

The authoritative simulation is shared by the browser and server, but online
multiplayer is server-authoritative:

- clients send validated, sequenced inputs;
- the server advances each room at a fixed 30 ticks per second;
- the server owns players, vehicles, NPCs, traffic, pickups, effects, combat,
  collisions, room state, and match state; and
- clients apply snapshots and render the resulting state.

There are also local single-player and split-screen modes for development and
playtesting. They reuse the same shared game simulation but do not replace the
authoritative online server path.

## Read these documents first

Use the documentation as the project behavior contract before changing game
logic:

- `docs/architecture.md` — module ownership, runtime phases, physics, client,
  server, and change placement.
- `docs/data-integration-notes.md` — GMP/STY/GCI/SCR data, map scale, traffic,
  pickups, vehicles, and authored asset behavior.
- `docs/gta2-decompiled-source.md` — source-derived rules for vehicles, weapons,
  pedestrians, animation, jumping, damage, and vehicle occupancy.
- `README.md` — setup, commands, supported modes, and deployment behavior.
- The focused `README.md` files beside the relevant source directory.

The repository may also contain the official GTA2 documentation PDF and format
notes under `docs/`. Use those when working on file decoding or source data.

The decompiled source checkout described by `docs/gta2-decompiled-source.md` is
expected at `references/gta2_re/` when available. It is intentionally not a
runtime dependency and is not present in every checkout. If it exists, inspect
the local `Source/` files first; otherwise use the linked upstream references
in `docs/gta2-decompiled-source.md` and record uncertainty rather than
inventing behavior.

## Architecture and ownership

Keep dependencies flowing toward stable, environment-neutral contracts:

```text
src/client  ->  src/shared/game + src/shared/domain
src/server  ->  src/shared/game + src/shared/domain
                    |
        src/shared/loader + src/shared/protocol
                    |
             src/shared/engine
```

- `src/shared/engine`: generic fixed-step timing, runtime coordination, and
  solver-neutral physics interfaces. It must not know GTA2 rules, assets, UI,
  or transport.
- `src/shared/domain`: GTA2 rules and source-derived constants for combat,
  physics, vehicles, pedestrians, animation, and world behavior. It must not
  use browser, filesystem, or server APIs.
- `src/shared/game`: game objects, effects, runtime phases, GTA2 physics
  adapters, world composition, and snapshot reconciliation. It must not import
  Three.js or WebSocket transport.
- `src/shared/loader`: GMP, STY, GCI, and SCR parsing plus typed asset bundles.
  Loaders consume bytes; filesystem and HTTP access belong in adapters.
- `src/shared/protocol`: validated wire messages, DTOs, replicated state, and
  protocol constants.
- `src/server`: asset access, HTTP, WebSocket rooms, authority, input queues,
  and snapshots. It must not import client UI or rendering.
- `src/client`: browser bootstrapping, input, networking, HUD, audio, Three.js
  rendering, and visual tools.
- `src/tests`: unit, integration, and Playwright verification.

The fixed runtime phase order is:

```text
lifecycle -> AI -> input -> physics -> collision -> combat -> replication
```

Put a change in the narrowest owner. For example, a new weapon rule belongs in
`shared/domain/combat`; a projectile lifecycle belongs in `shared/game`; a new
wire field belongs in `shared/protocol`; and a browser control belongs in
`client`.

## Behavior and fidelity rules

Prefer authored GTA2 data and source behavior over approximations:

- Map geometry, traffic arrows, junctions, zones, lights, objects, and tile
  data come from decoded GTA2 assets.
- Weapon pickup points come from compiled SCR gameplay data, not decorative
  MOBJ scenery or invented coordinates.
- Vehicle handling comes from GCI and chassis/sprite metadata comes from STY
  CARI/DELS data. Preserve the source's mass, gearing, grip, doors, occupancy,
  damage, wreck, and fire lifecycle where implemented.
- Vehicle entry/exit is an authoritative state machine with source door
  accessibility, seat, transition, and collision rules.
- Pedestrians use the map-derived walkable-block graph because the retail GMP
  format does not provide the old pedestrian route chunk. Preserve civilian
  flee, police response, pathing, knockdown, attack, death, and animation state.
- Weapon dispatch, projectile models, spread, throw charge, carried velocity,
  impacts, explosions, hazards, and pickup art should follow the source-derived
  mappings documented in `docs/gta2-decompiled-source.md`.
- Keep the single world-scale boundary in `src/shared/domain/world/world.ts`.
  One tile is 64 world pixels; Planck receives positions through the explicit
  physics conversion. Do not add independent scale conversions in callers.
- Keep presentation separate from gameplay. Shared objects emit typed draw
  commands/state; Three.js decides how to display them.

When behavior is unclear, inspect the relevant documentation and decompiled
source, then add a focused regression test before changing the implementation.

## Assets and references

Retail GTA2 files are local inputs under `assets/` or
`assets/App_Executables/data/`. Supported data includes GMP, STY, SCR, MMP,
GCI, GXT, SEQ, WAV, RAW, and SDT files. Do not add new proprietary or large
retail assets unless explicitly requested. Keep asset-loading logic behind the
server/client loader boundaries.

For source lookups, use the references listed in
`docs/gta2-decompiled-source.md`. The external decompilation is research input,
not code to copy blindly: translate source behavior into the typed domain and
test it against the project's units, fixed timestep, world scale, and protocol.

## Development and verification

Use Node.js 24 and pnpm 11.25.0. Common checks are:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm test:e2e
```

Run the smallest relevant check while iterating, then run the full checks for a
runtime or protocol change. Add or update unit tests for domain behavior,
integration tests for server/HTTP/WebSocket behavior, and E2E tests for browser
flows or rendering-visible behavior.

Before editing, inspect `git status` and preserve unrelated user changes.
Avoid destructive Git operations. Keep commits focused and update the nearest
documentation when a refactor changes ownership, behavior, asset setup, or a
public workflow.

## Review priorities

When reviewing changes, prioritize:

1. server authority and client trust boundaries;
2. deterministic fixed-step behavior and snapshot/reconnect correctness;
3. source/data fidelity and world-scale conversions;
4. collision, vehicle occupancy, combat, and damage edge cases;
5. malformed asset/protocol input handling;
6. browser/server boundary violations and accidental duplicate simulations; and
7. regressions in local, multiplayer, static-build, and asset-discovery modes.

Document known deviations from the original game instead of silently masking
them with client-only behavior or invented data.
