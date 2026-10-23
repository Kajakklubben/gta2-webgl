# Neutral engine asset contracts

This directory contains the small, game-independent asset contracts shared by
loaders, simulation adapters, and presentation backends.

- `reader.ts` defines byte-source access without choosing HTTP or filesystem;
- `pixels.ts` defines decoded bitmap frames;
- `sprites.ts` defines resolved sprite assets and resolver ports;
- `animation.ts` contains frame-timeline selection; and
- `tile-map.ts` defines the minimal layered tile-map shape consumed by map
  renderers.

Game-specific formats and source semantics remain in the engine-owned
`src/shared/engine/loader` adapter.
For example, the GTA2 STY parser produces `Pixels` and `Style`, while GTA2
source model mappings remain in the GTA2 rendering adapter. Browser concerns
such as Three.js and DOM access remain under `src/client`.
