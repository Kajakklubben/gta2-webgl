# Shared loader boundary

This directory owns the GTA2 asset boundary used by both client and server code.

- `binary.ts`, `map-parser.ts`, `style-parser.ts`, `gci.ts`, and `scr.ts` decode source files;
- `asset-loaders.ts`, `bundle.ts`, `cars.ts`, and `vehicle-bounds.ts` compose typed assets;
- `map-object-definitions.ts` and `multiplayer-maps.ts` provide authored catalog data; and
- `models/` contains the decoded map, style, vehicle, weapon, and catalog shapes.

Browser and filesystem code should provide an `AssetReader` or call the server
adapter. Gameplay code should consume typed values from this boundary rather
than parse asset bytes directly.
