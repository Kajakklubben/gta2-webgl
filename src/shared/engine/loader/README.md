# GTA2 asset adapter

This directory owns the GTA2-specific asset adapter used by both client and
server code. The game-neutral contracts it implements live in
`src/shared/engine/assets`.

- `binary.ts`, `map-parser.ts`, `style-parser.ts`, `gci.ts`, and `scr.ts` decode source files;
- `asset-loaders.ts`, `bundle.ts`, `cars.ts`, and `vehicle-bounds.ts` compose typed assets;
- `map-object-definitions.ts` and `multiplayer-maps.ts` provide authored catalog data; and
- `models/` contains the decoded GTA2 map, style, vehicle, weapon, and catalog shapes.

Browser and filesystem code should provide the neutral `AssetReader` or call
the server adapter. Gameplay code should consume typed values from this
adapter rather than parse asset bytes directly. Generic pixel frames, sprite
resolution ports, animation timing, and tile-map contracts belong in
`src/shared/engine/assets`, not here.
