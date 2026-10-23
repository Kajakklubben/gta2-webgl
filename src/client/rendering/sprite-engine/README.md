# Sprite engine

This folder owns the browser-side sprite pipeline: GTA2 asset registration and
lookup, palette and delta resolution, backend material policy, draw ordering,
and Three.js drawing. GTA2 map-level and map/underlay/object/overlay semantics
live in `src/shared/domain/world/presentation-order.ts`. The
game-neutral decoded pixel, sprite resolver, and
animation contracts live in `src/shared/engine/assets`; `frame-interpolation.ts` is
kept as a compatibility export for existing browser callers. `index.ts` is
the public adapter and `three-renderer.ts` performs the dynamic draw work; the
other modules keep the GTA2 catalog, library, spatial-depth, and policy
concerns separate. Numeric Three.js render orders are resolved here from
shared semantic slots; support height/collision layer supplies the map group,
while slot band and priority select the local phase. Shared game objects do
not provide backend render orders.

Keep domain sprite identifiers and source metadata in `src/shared`; keep
browser drawing details here.
