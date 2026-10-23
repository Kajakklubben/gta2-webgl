# Scenario tools

This folder contains deterministic scenario viewers and their browser-only
layout/rendering adapters. `scenario-definitions.ts` is the unified registry;
`scenario-definition-data.ts` contains reusable arrangement, action, and
assertion data. The scenarios page exposes that registry through one list, and
every definition is built by `scenario-replay-runtime.ts` with the same loaded
Tiny Town map, authored vehicle catalog, game construction, fixed-step replay,
and sprite/map rendering path. Scenarios that use a vehicle share one
configurable car selector, while the E2E page object defaults omitted car
selections to model `0`.

The scenario selector is the complete replay identity: vehicle entry/exit and
the entry approach are encoded in the selected scenario rather than exposed as
independent controls. The car and simulation speed remain ordinary replay
controls. Replays use the loaded Tiny Town map and its normal textures at the
authored road and water anchors; ambient pedestrians and traffic are disabled,
and only actors listed by the scenario definition are created. Every replay
with a player has the same Manual control toggle, which feeds the normal
keyboard/gamepad input path into the same fixed-step simulation. Scenario cars
never enter the traffic planner: their only movement comes from player input,
authored initial velocity, and normal physics/collision resolution.
Browser controls and presentation stay here; gameplay rules stay in `src/shared`.

The `Tiny Town · five drawing positions` gameplay scenario is the authored-map
rendering probe. It frames five parked cars at once—on the slope, under and
over the see-through bridge, under the solid structure, and at the additional
captured position—and keeps their support heights in the labels so draw-order
changes can be compared directly.
