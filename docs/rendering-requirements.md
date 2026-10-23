# Rendering requirements

This document is the rendering contract for the 2.5D GTA2 presentation. It
defines what the shared engine and game must describe, what the browser
renderer must resolve, and how draw order and occlusion are expected to work.
It is intentionally independent of Three.js names such as `renderOrder` and
of any particular GPU depth-buffer strategy.

## Goals

The renderer must:

- preserve the authored order of map levels and objects;
- distinguish a physical support height from a visual draw position;
- allow slopes, bridges, raised roads, actors, effects, and overlays to state
  their semantic relationship explicitly;
- produce deterministic results when several things occupy the same level;
- keep gameplay and server code independent of browser rendering; and
- remain inspectable through debug views, tests, and detached-camera tools.

The renderer must not infer gameplay relationships from incidental Three.js
object insertion order, camera orientation, or arbitrary numeric offsets.

## Ownership

The shared engine owns renderer-neutral contracts. The shared game and GTA2
domain decide what an object means and emit semantic draw commands. The client
renderer resolves those commands into meshes, materials, concrete world
coordinates, backend sort keys, and depth-buffer state.

The dependency direction is:

```text
engine contract
    ↓
shared game/domain semantic draw command
    ↓
client spatial-depth and presentation adapters
    ↓
browser/Three.js implementation
```

No shared object may provide a Three.js `renderOrder`, a CSS-like z-index, or
an unexplained renderer-specific depth offset.

## Spatial model

Every placed object has a canonical world placement:

```text
(x, y)       horizontal world position
support z    physical surface/support height resolved by physics
layer        authored collision/surface layer, when applicable
rotation     horizontal object rotation
elevation   presentation-only lift above the resolved support surface
```

These values have different meanings:

- `support z` answers where the object is physically supported;
- `layer` identifies the authored map/collision level;
- `elevation` separates a visual layer such as a projectile, label, fire, or
  shadow from its support surface; and
- presentation order answers which semantic surface or object is considered
  first when composing the image.

The renderer may convert support height and elevation into a concrete backend
world coordinate, but that conversion belongs only in the client spatial-depth
adapter. It must not be duplicated in game objects or domain rules.

## Required composition order

For each authored map level, composition follows this controlled pass order:

```text
map walls and ramps for level N
  → lids and bridge surfaces for level N
  → underlays for level N
  → map objects for level N
  → pickups for level N
  → NPCs for level N
  → vehicles for level N
  → players for level N
  → effects and overlays for level N
map geometry for level N+1
  → the same pass sequence for level N+1
```

The map surface establishes the visual context for its level. Objects are then
ordered by semantic presentation level and local band. The next map level is
not allowed to accidentally draw over an earlier level merely because its
mesh was created later or because a camera tilt changes projected distance.

The exact map implementation may batch geometry for performance, but the
result must be equivalent to this authored pass order. Slopes, slope edges,
slope lids, bridge decks, and other map surfaces must be assigned to the level and
occlusion context they visually represent; they are not generic decorations.

## Semantic presentation order

The engine exposes a renderer-neutral presentation slot:

```ts
type PresentationBand = 'map' | 'underlay' | 'object' | 'overlay';

interface PresentationSlot {
  mapLevel?: number;
  band?: PresentationBand;
  priority?: number;
  elevation?: number;
}
```

The stable ordering key is:

```text
mapLevel → band → priority → spatial depth → submission sequence
```

`mapLevel` is the coarse authored map group. `band` is the local relationship
to the map surface or primary object, and `priority` orders categories inside
that band. `elevation` affects the resolved presentation position but is not
itself a replacement for semantic map level. The final submission sequence is
only a deterministic tie-breaker; it must not carry gameplay meaning.

The standard bands mean:

- `map`: the map geometry for the current authored level;
- `underlay`: shadows, skid marks, mines, and surface effects that belong below
  the primary object;
- `object`: the primary actor, vehicle, map object, pickup, or effect body; and
- `overlay`: content attached above or in front of the object, such as fire,
  projectile visuals, labels, and transient impact layers.

GTA2-specific map-level derivation and local priorities live in
`src/shared/domain/world/presentation-order.ts`. Generic engine ordering lives
in `src/shared/engine/presentation-order.ts`.

## Object and surface requirements

Each drawable object must provide enough semantic information to answer:

1. What kind of object is this?
2. Which authored map level or support surface does it belong to?
3. Is it underlay, primary object, or overlay content?
4. Does it have a physical elevation or attachment offset?
5. Should its pixels participate in surface occlusion?
6. If it has multiple layers, what is the relationship between those layers?

Typical semantic categories include:

```text
map surface       walls, lids, slopes, bridge decks, road surfaces
map object        static authored scenery and props
underlay          shadows, skid marks, mines, surface decals
actor             player, NPC, vehicle
pickup            weapon and item visuals
effect            fire, smoke, splash, projectile, impact, explosion
overlay           labels, debug geometry, HUD-like world annotations
```

These categories are semantic defaults, not an excuse to sort by type alone.
An actor on a lower support surface must remain below an occluding bridge
surface even if the actor category normally has a higher global priority.

Attachments and particle layers inherit their parent placement explicitly and
receive their own presentation slot when their visual relationship differs
from the parent.

## Occlusion and depth testing

Draw order and depth testing solve different problems:

- semantic draw order handles broad authored relationships and must be
  deterministic;
- the depth buffer handles per-pixel visibility where a sloped edge, wall,
  bridge, or irregular sprite silhouette intersects another drawable.

The policy is therefore:

- enable `depthTest` and `depthWrite` for every Three.js material, including
  transparent sprites, effects, labels, and diagnostics;
- use semantic ordering to establish the intended level and band;
- keep depth clearing and pass visibility explicit so the GTA2 pipeline still
  controls category order.

Disabling depth testing globally is not a valid substitute for semantic
ordering. It removes the renderer's ability to resolve partial overlap within
slopes, bridge edges, walls, and sprite silhouettes.

Map composition uses the controlled pass sequence at each authored map level.
The renderer enables one level/band slice at a time and clears the depth buffer
between slices. Depth therefore resolves overlap within a pass, while pass
order establishes cross-category visibility. Structural faces and horizontal
lids retain the authored block level, including when the block is sloped.

The material policy is a client concern. Shared draw commands may express
semantic intent, but must not encode Three.js material instances or backend
flags directly.

## Camera and diagnostics

Camera movement changes the projection, not the authored meaning of a draw
command. A free or detached camera may expose errors that are hidden by the
normal overhead view, so the renderer must support inspection of:

- support height and authored layer;
- resolved presentation level and band;
- elevation and concrete world depth;
- semantic sort key and stable sequence; and
- semantic map band and render order.

The detached-camera X-axis tilt is a presentation/debug aid for inspecting
sprite depth. It must not modify simulation state or be used to change draw
order.

## Verification requirements

Rendering changes should include focused tests for:

- map-level, band, and priority ordering;
- deterministic ordering of equal-depth objects;
- conversion from support height/elevation to renderer world depth;
- attachment and shadow ordering;
- map/slope/bridge occlusion behavior; and
- separation between shared draw commands and browser renderer policy.

Browser or scenario tests should be used when the behavior is only observable
through actual map geometry, transparency, or camera projection.

## Current implementation map

The main implementation points are:

- `src/shared/engine/presentation-order.ts` — generic semantic ordering;
- `src/shared/engine/spatial-depth.ts` — renderer-neutral placement contract;
- `src/shared/domain/world/presentation-order.ts` — GTA2 map levels and local priorities;
- `src/shared/game/gameobjects/gameobject.ts` — engine-neutral draw commands;
- `src/client/rendering/spatial-depth.ts` — client depth and sort-key adapter;
- `src/client/rendering/sprite-engine/render-queue.ts` — sprite flattening and
  deterministic sorting; and
- `src/client/rendering/map/` — map surface and slope geometry.

This document is the design contract; implementation-specific details belong
in the focused READMEs and source files listed above.
