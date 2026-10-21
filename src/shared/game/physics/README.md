# Game physics adapters

This folder contains GTA2-specific physics descriptors and contact rules. The
generic coordination interfaces, solver-neutral bodies, and native solver
implementation remain in `../../engine`; this folder must not import Planck or
expose how many native worlds the engine uses.

- `game-world-physics.ts` assembles the game-facing physics world;
- `collision-world.ts` owns GTA2 entity fixture descriptors, queries, and
  solver contacts through the engine runtime contract;
- `map-collision.ts`, `body-factory.ts`, `player-bodies.ts`, and
  `npc-bodies.ts` construct GTA2-specific body and shape descriptors;
- `map-fixtures.ts` interprets map fixture metadata; and
- `vehicle-contact-handler.ts` translates engine contacts into GTA2 effects.
