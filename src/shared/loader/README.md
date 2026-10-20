# Shared loader boundary

This directory owns the GTA2 asset boundary used by both client and server code.

- `map-parser.ts`, `style-parser.ts`, `gci.ts`, `scr.ts`, and `binary.ts` decode source files.
- `map.ts`, `style.ts`, `cars.ts`, `pickups.ts`, `weapons.ts`, and `bundle.ts` expose typed loading APIs.
- `data/` contains the decoded models returned by those loaders.
- `vehicle-bounds.ts` contains derived vehicle metadata created during loading.

Browser and filesystem code should provide an `AssetReader` or call the server adapter; gameplay code should consume the typed values from this directory rather than parse asset bytes directly.
