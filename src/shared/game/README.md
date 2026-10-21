# Game

This directory assembles the shared GTA2 simulation from domain rules, game
objects, effects, runtime phases, physics adapters, and snapshot codecs.

- `gta2-game.ts` is the public GTA2 composition boundary and extends `GameWorld`.
- `game-world.ts` owns shared state and delegates to focused systems.
- `gameobjects/` owns typed object lifecycle and draw commands.
- `effects/` owns transient simulation objects.
- `runtime/` owns fixed-order phases, reconciliation, prediction, and controllers.
- `physics/` owns GTA2-specific shape descriptors and contact handling behind
  the solver-neutral ports in `../engine`.
- `snapshot-codecs.ts` copies and applies nested protocol state safely.

Keep generic timing and interfaces in `../engine`; keep gameplay orchestration
and GTA2-specific adapters here.
