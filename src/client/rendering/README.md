# Rendering

This directory translates game state and engine-neutral draw commands into
browser visuals. Its current responsibilities are:

- `renderer.ts` coordinates map, sprites, presentation, and debug layers;
- `spatial-depth.ts` resolves physics-owned support heights and semantic draw
  hints into concrete world depth and sort keys;
- `gta2-camera.ts` and `gta2-camera-motion.ts` follow players and handle detached views;
- `render-interpolation.ts` smooths authoritative poses;
- `presentation-system.ts` owns transient labels and impact/audio-facing effects;
- `map/` builds map geometry through the legacy JavaScript boundary;
- `sprite/` defines source sprite groups; and
- `sprite-engine/` resolves assets and performs Three.js sprite drawing.

Rendering must remain a client concern and must not be imported by shared
gameplay or server code.
