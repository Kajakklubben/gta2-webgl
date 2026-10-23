# GTA2 WebGL

A browser GTA2 map viewer and multiplayer game, modernized with TypeScript, ES modules, Three.js, Vite, Node.js, and WebSockets.

## Setup

Use **Node.js 24** and **pnpm 11.25.0** (the package manager version is pinned in `package.json`). Run commands from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm run init
```

`init` installs the frozen pnpm dependencies when the worktree does not have a
loaded `node_modules` tree, creates the checkout-local `assets/` directory, and
prints the stable development URL for this working tree. Copy the GTA2 data
files into that directory before starting the server.

Copy your own GTA2 files into `assets/`:

- `MP1-comp.gmp` — compressed map (the old README incorrectly called this `.cmp`).
- `bil.sty` — tile palettes and sprites.

The supplied retail data can remain in `assets/App_Executables/data/`; its `MP1-comp.gmp` and `bil.sty` files are the same files used by the default setup. See [data integration notes](docs/data-integration-notes.md) for the relationship between GMP road arrows, map objects, and mission-script weapon points.

These files are not included or committed. The server reads the configured asset directory from `src/server/config.ts` and also recognizes the retail `App_Executables/data` layout.

```sh
pnpm assets:check
pnpm dev
```

Open the URL printed by `pnpm dev`. The default launch is a local single-player game; open the in-game lobby and choose Online multiplayer when you want to join a server room. Use `?mode=multiplayer` to start directly in multiplayer, or `?mode=singleplayer` to make the default explicit. The legacy `?local=split` option still starts local split-screen. `&view=x,y` selects an authored GTA2 map-tile location and starts the camera detached there, for example `/?mapId=hidden-surprise&view=228,38`. In Debug → Camera, choose Detached to pan with WASD/PageUp/PageDown and use the X tilt buttons to inspect sprite depth. Choose a name, room, and team, then join. Use the arrow keys to move and turn, and Shift to run. Hold Ctrl or Space to fire; press Z or X to switch weapons; press E near a traffic vehicle to enter or leave it. On phones and tablets, the lobby becomes a stacked touch-friendly card and on-screen movement, fire, weapon, and vehicle controls appear after joining. The HUD includes the room roster, score, kills/deaths, armor, money, wanted level, and chat. Weapon pickups are decoded from the district's compiled SCR files and replicated by the server; the level does not invent pickup locations. Players start with the base pistol and acquire the remaining weapons from those authored points. The server owns traffic, authored road graphs and traffic lights, enter/exit state, vehicle health, NPC movement and police fire, team damage rules, respawn protection, combat events, match state, and lag-aware hit validation; the client plays decoded audio cues from server events. Rooms run independent game worlds; snapshots are interest-filtered and sent as player deltas, while inputs are rate-limited and sequence-checked. WebGL2 is required.

The browser defaults to the local single-player district `bil.gmp`, `bil.sty`, and `bil.scr`. Multiplayer uses the selected catalog bundle, which defaults to `MP1-comp.gmp`. Any supported file under `assets/` can be selected for a manual playtest with query parameters, for example `/?map=App_Executables/data/ste.gmp&style=App_Executables/data/ste.sty`. Configure alternate server assets in `src/server/config.ts` so authoritative collision, pickups, and rendering use the same data. Supported data extensions are `.gmp`, `.sty`, `.scr`, `.mmp`, `.gci`, `.gxt`, and `.seq`.

The server derives a stable development port in the `8000–8999` range from the
absolute working-directory path. Configure an explicit port or host in
`src/server/config.ts`; HTTP and WebSockets use the same port. When hosting
behind HTTPS, proxy WebSocket upgrades at `/ws`.

## Build and run

```sh
pnpm build
pnpm start
```

The client builds into `dist/client` and the server into `dist/server`. Production serves the built client and supported GTA2 data files from the configured asset directory. Runtime dependencies must be installed on the deployment host.

For a backend-free single-player deployment, run `pnpm build:static` and publish
`dist/client/` to any static HTTP host. The build copies the detected GTA2
data directory into `dist/client/assets/`; the browser loads the local game
simulation directly and does not require Node.js, HTTP API routes, or
WebSockets. Static hosting must serve the files over HTTP(S), rather than
opening `index.html` with `file://`. Multiplayer remains available only when
the Node server is running.

To upload the static build over FTP, set `FTP_HOST`, `FTP_USER`, and
`FTP_PASSWORD`, then optionally set `FTP_PROTOCOL` (`ftp` or `ftps`),
`FTP_PORT`, and `FTP_REMOTE_DIR` before running `pnpm deploy:ftp`. The command
builds the static site first and uploads every file under `dist/client/`.
Credentials are read from the environment and are not stored in the project.
After the first full upload, use `pnpm deploy:ftp:code` to rebuild and upload
only the HTML, JavaScript, and CSS while leaving the large `assets/` directory
untouched on the FTP server.

## Verification without GTA2 files

```sh
pnpm check
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

Tests generate original synthetic map/style binaries in temporary directories. Browser tests exercise decoding, WebGL rendering, movement, two-player synchronization, disconnect/reconnect, and missing-file feedback. Integration tests bind local ephemeral ports. No proprietary game files are required.

For a synthetic scene you can inspect manually:

```sh
pnpm dev:fixture
```

Open http://127.0.0.1:8001. This scene is a small flat test area with placeholder tiles/sprites, not GTA2 artwork.

## Architecture

For the full documentation map, see [docs/README.md](docs/README.md).
For coding conventions and contribution checks, see
[contributions.md](contributions.md).

- `src/shared/engine`: reusable fixed-step timing and deterministic runtime driving; it has no GTA2 or transport rules.
- `src/shared/game`: the GTA2 implementation boundary (`Gta2Game`, `GameWorld`) and deterministic rules.
- `src/shared/loader`: typed GTA2 data loading, format parsers, and decoded asset catalogs.
- `src/shared/domain`: GTA2 rules and source-derived constants.
- `src/shared/game`: game objects, effects, runtime phases, physics adapters, and snapshot codecs.
- `src/shared/protocol`: typed, versioned network messages, validation, and DTO conversion.
- `src/client/app`: browser bootstrapping, session orchestration, input, HUD, audio, and reconnect UI. `game-client-frame.ts`, `game-client-network.ts`, and `game-client-hud.ts` keep the main composition module focused.
- `src/client/rendering`: Three.js map, camera, sprite, presentation, and debug rendering.
- `src/client/tools`: deterministic vehicle-entry/gameplay scenarios and the sprite viewer.
- `src/server`: filesystem asset loading, room/transport orchestration, static HTTP serving, and `ws` transport.
- `src/tests/unit`: synthetic assets and parser/physics/rendering regressions.
- `src/tests/integration`: HTTP/WebSocket, runtime configuration, multiplayer, and world integration tests.
- `src/tests/e2e`: Playwright browser tests.

The fixed-step world advances at 30 ticks per second. Clients send sequenced inputs and render authoritative snapshots; the server processes at most one queued input per player per tick. Remote players use the latest snapshot state. Player-to-player physics collisions remain disabled, matching the original filtering.

Planck.js provides the authoritative 2D rigid-body backend through a small compatibility boundary, while `src/client/rendering/map/map-render.js` preserves the original slope/UV construction rules behind a typed boundary, generating only current `BufferGeometry` meshes. It remains JavaScript during gradual TypeScript adoption. RGBA decoding no longer uses the DOM, jQuery, data URLs, or localStorage.

The active application is organized under `src/client`, `src/server`, and `src/shared`; tests, scripts, documentation, and runtime assets remain at the repository root. The legacy prototype implementation is no longer an active source tree.

## Validation limits

Synthetic tests establish behavior and malformed-input handling, but do not prove fidelity against every original GTA2 map, palette, or slope variant. Check your own map/style files and compare the original artwork, animation, slopes, collision boundaries, and multiplayer behavior before publishing. Slope variants 49–52 retain the original renderer's fallback behavior. Physics-library replacement and measured mesh/texture batching are separate follow-up work.
