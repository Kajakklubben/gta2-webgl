# Engine

The engine-facing rendering contract is documented in
[`docs/rendering-requirements.md`](../../../docs/rendering-requirements.md).
This is the canonical description of semantic map levels, map/underlay/object/
overlay bands, spatial depth, and the separation between draw order and
occlusion.

This folder contains the encapsulated engine and its asset-loading boundary:
`fixed-clock.ts` provides the accumulator, `game-engine.ts` drives a fixed-step
world, `world-runtime.ts` defines generic phase coordination, and
`assets/` defines neutral byte readers, decoded pixel frames, sprite resolver
ports, animation timing, and layered tile-map contracts. The
`loader/` decodes GTA2 game files into typed asset bundles and is the only
format-specific part of the engine boundary; clients and servers provide bytes
or consume its results without parsing files themselves. `physics-world.ts`
defines the engine-facing physics boundary and the small
`PhysicsBody` port used by objects and phase runners; each engine `GameObject`
may bind its live simulation body while the runtime remains responsible for
body lifecycle and stepping. `planck-physics.ts` is
the engine's native solver implementation; its bodies, fixtures, contacts, ray
casts, and multiple internal native worlds are exposed only through the
solver-neutral contracts in `physics-world.ts`. The generic engine core must not
import GTA2 state or rules; the engine-owned `loader/` is the explicit adapter
for that format. The neutral asset contracts likewise do not parse GTA2 formats
or depend on a renderer. `spatial-depth.ts` contains the shared placement
contract used by physics and presentation adapters, while
`presentation-order.ts` defines the renderer-neutral `PresentationSlot`
hierarchy (`mapLevel`, band, and local priority) and its stable comparator.
The map phase is first within each map level. Neither file contains renderer
coordinates or Three.js sort policy.
