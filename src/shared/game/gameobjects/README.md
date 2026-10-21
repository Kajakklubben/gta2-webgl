# Game objects

The object layer owns typed lifecycle, placement, collision descriptors,
world-runtime updates, state views, and engine-neutral draw commands.
`game-state.ts` provides the `GameState` object store and typed lookup methods;
`GameWorld` exposes it as `gameObjects` for runtime and renderer adapters.

Object-to-physics transfer uses the generic `PhysicsBody` port from
`src/shared/engine/physics-world.ts`; object classes must not depend on a
concrete native solver.

Object placement uses the shared spatial contract from
`src/shared/engine/spatial-depth.ts`. Sprite producers may describe semantic
intent such as an elevated actor, a surface effect, or a vehicle occlusion;
they do not assign renderer-specific depth offsets or draw-order numbers.

The object store is flat. Vehicle occupancy, projectile ownership, and effect
relationships are represented in the relevant domain state rather than through
a generic parent/child registry. Client rendering consumes draw commands
without being imported by shared code.

Multi-file object families have dedicated folders:

- `player/` contains the player object and its movement, status, combat, and
  sprite modules.
- `vehicle/` contains the vehicle object and its control, occupancy, damage,
  and sprite modules.
- `npc.ts` and `map-object.ts` contain the single-file NPC and static map-object
  implementations.
- `../effects/` contains transient effect objects rather than putting them in
  the actor folders.

Single-file objects remain directly in this folder.
