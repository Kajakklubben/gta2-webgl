# Engine

This folder contains environment-neutral simulation infrastructure:
`fixed-clock.ts` provides the accumulator, `game-engine.ts` drives a fixed-step
world, `world-runtime.ts` defines generic phase coordination, and
`physics-world.ts` defines the engine-facing physics boundary and the small
`PhysicsBody` port used by objects and phase runners. `planck-physics.ts` is
the engine's native solver implementation; its bodies, fixtures, contacts, ray
casts, and multiple internal native worlds are exposed only through the
solver-neutral contracts in `physics-world.ts`. The engine must not import
GTA2 state or rules. `spatial-depth.ts` contains the shared placement and
semantic depth contracts used by physics and presentation adapters; it does
not contain renderer coordinates or sort policy.
