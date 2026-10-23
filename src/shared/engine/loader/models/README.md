# Asset data

This directory contains the typed, decoded shapes that cross the asset-loading boundary:

- `map.ts` describes map blocks, faces, zones, lights, and traffic metadata.
- `style.ts` describes decoded pixels, sprite banks, car metadata, doors, and style data.
- `vehicles.ts` describes decoded GCI handling values and CARI bounds.
- `weapons.ts` describes the shared weapon catalog.
- `catalog.ts` describes the map, style, pickup, car, weapon, and client bundle results.

Binary parsers and loader orchestration live in the parent
`src/shared/engine/loader` directory. Gameplay code imports the engine loader
boundary directly.
