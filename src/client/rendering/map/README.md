# Map rendering

This folder contains Three.js map mesh generation and its slope/UV helpers:
`map-render.js` is the legacy renderer, `map-render.d.ts` is its typed
boundary, and the three `map-render-slope-*.js` files contain focused geometry
helpers. Structural walls, including sloped wall faces and ramps, are rendered
in the map-wall pass. Lids, bridge decks, and ramp surfaces are rendered in a
separate map-surface pass. The renderer clears depth between controlled passes
so each authored level/category gets its intended order. Map parsing,
map objects, and collision rules belong under `src/shared`.
