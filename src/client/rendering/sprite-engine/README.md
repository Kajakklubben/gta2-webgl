# Sprite engine

This folder owns the browser-side sprite pipeline: asset registration and
lookup, palette and delta resolution, animation timing, frame interpolation,
render policy, draw ordering, and Three.js drawing. `index.ts` is the public
adapter and `three-renderer.ts` performs the dynamic draw work; the other
modules keep catalog, library, animation, spatial-depth, and policy concerns
separate. Numeric Three.js render orders are resolved here from semantic draw
intent; shared game objects do not provide them.

Keep domain sprite identifiers and source metadata in `src/shared`; keep
browser drawing details here.
