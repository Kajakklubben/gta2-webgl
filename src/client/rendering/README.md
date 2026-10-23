# Rendering

See [`docs/rendering-requirements.md`](../../../docs/rendering-requirements.md)
for the renderer contract: map-level composition, semantic map/underlay/
object/overlay bands, spatial depth, occlusion, and verification requirements.

This directory translates game state and engine-neutral draw commands into
browser visuals. Its current responsibilities are:

- `renderer.ts` coordinates map, sprites, presentation, and debug layers;
- `spatial-depth.ts` resolves physics-owned support heights and shared semantic
  presentation slots into concrete Three.js depth and sort keys using
  `(mapLevel, band, priority, depth)`;
- `gta2-camera.ts` and `gta2-camera-motion.ts` follow players and handle detached views, including detached-camera X-axis tilt for inspecting sprite depth;
- `render-interpolation.ts` smooths authoritative poses;
- `presentation-system.ts` owns transient labels and impact/audio-facing effects;
- `map/` builds map geometry through the legacy JavaScript boundary; it accepts
  the neutral layered tile-map contract while retaining GTA2 slope rules in
  the adapter. Map geometry is composed per authored level, with walls/ramps
  and lids/bridge surfaces assigned to separate controlled passes; and
- `sprite/` defines source sprite groups; and
- `sprite-engine/` resolves GTA2 assets through neutral sprite contracts and
  performs Three.js sprite drawing.

For each authored level, `renderer.ts` executes these passes in order:

```text
map walls and ramps
  → lids and bridge surfaces
  → underlays (shadows, skid marks, mines)
  → map objects
  → pickups
  → NPCs
  → cars
  → players
  → effects and overlays
```

The renderer enables only the active level/pass slice, enables depth testing
and writing for every scene material, clears depth between passes, and restores
normal visibility afterward.

Rendering must remain a client concern and must not be imported by shared
gameplay or server code.
