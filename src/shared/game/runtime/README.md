# Game runtime

This folder contains the ordered phase runners and focused controllers that
advance a `GameWorld`. `phases.ts`, `phase-runners.ts`, and `early-phases.ts`
define the fixed-step order; the other modules handle prediction,
reconciliation, vehicle/pedestrian orchestration, projectiles, combat,
surfaces, and object operations. Native map collision and body construction
are delegated to `../physics` through runtime host methods.

Keep domain rules in `../../domain` and object state in `../gameobjects`.
