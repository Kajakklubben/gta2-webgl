# Sprite engine

This folder owns the browser-side sprite pipeline: asset registration and
lookup, palette and delta resolution, animation timing, frame interpolation,
render policy, draw ordering, and Three.js drawing. `index.ts` is the public
adapter and `three-renderer.ts` performs the dynamic draw work; the other
modules keep catalog, library, animation, and policy concerns separate.

Keep domain sprite identifiers and source metadata in `src/shared`; keep
browser drawing details here.
