# Asset data

This directory contains the typed, decoded shapes that cross the asset-loading boundary:

- `map.ts` describes map blocks, faces, zones, lights, and traffic graph metadata.
- `style.ts` describes decoded pixels, sprite banks, car metadata, doors, and style data.
- `vehicles.ts` describes decoded GCI handling values and CARI vehicle bounds.
- `catalog.ts` and `bundle.ts` describe the typed results returned by asset loaders.

Binary parsers and loader orchestration live in the parent `src/shared/loader`
directory. Gameplay code imports the loader boundary directly.
