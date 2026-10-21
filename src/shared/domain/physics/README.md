# Physics

This folder contains reusable motion, collision, map-surface, vehicle
integration, skid, impact, and placement rules. Keep calculations separate
from the native solver adapter in `src/shared/engine` and from rendering.
`collision-rules.ts` owns GTA2 collision categories, floor matching, and
proximity checks; native bodies, fixtures, and solver contacts do not belong
here.
