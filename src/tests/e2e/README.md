# Vehicle scenario E2E library

`vehicle-scenarios.ts` is the Playwright page object for the in-game **Scenarios** panel. It drives the visible selectors, runs the same fixed-step world runtime used by gameplay, and reads structured `data-*` diagnostics from the panel. The authored cases live in `src/shared/domain/vehicles/vehicle-entry-scenarios.ts`: each record places the player relative to a centered vehicle. The panel uses a deterministic square room with four map wall faces; blocked approaches add locked vehicle objects, so the test exercises car collision and entry eligibility rather than replacing a car with a generic wall.

Run the focused suite with:

```sh
pnpm test:e2e:scenarios
```

The matrix test exercises every authored situation and approach for the default car and attaches `vehicle-scenario-matrix.json` to the Playwright report. The helper also supports other decoded car models, pausing, single-step replay, terminal-state waits, and arbitrary matrices:

```ts
const panel = new VehicleScenarioPanel(page);
const results = await panel.runMatrix([0, 10], { settleMs: 1_500, allowActive: true });
```

`VEHICLE_PROPERTY_CASES` covers representative decoded vehicle metadata: two-
and four-door cars, straight-entry doors, zero-door stock, a 31-seat bus,
pedestrian-jump/roof-light/collision flags, emergency/taxi/headlight flags,
handling values from GCI, and two models sharing one sprite allocation. The
property test reads the panel's structured metadata and checks that authored
zero-door models remain rejected by the occupancy state machine.

The occupied-driver case verifies that entering an NPC-driven car ejects the NPC
and completes the player driver-seat transition.

The same viewer now switches between vehicle entry/exit cases and a Gameplay
scenario mode with deterministic road and water rooms. Its seven replays cover
player/NPC jump-over-car behavior, lethal player/NPC car impacts, on-foot water
drowning, a driver entering water, and NPC water drowning. Each replay uses the
authoritative `Gta2Game.step` loop. The synthetic debug room remains the map
background, while the player, NPC, and vehicle layers use the normal decoded
sprite renderer. Each replay exposes its terminal result through `data-outcome`
for browser tests.

All scenario kinds are authored in the unified
`src/shared/domain/scenario-definitions.ts` registry. Every record has the same
`id`, `kind`, `level`, `title`, `description`, `arrange`, `act`, and `assert`
fields. `arrange` contains common player, NPC, vehicle, or blockade records
and optional variants; `act` contains the input/action and tick budget; and
`assert` contains the expected result and completion condition. Vehicle
entry/exit adapters only translate those records for the existing door
renderer.
