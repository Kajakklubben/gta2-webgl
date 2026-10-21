# Browser tests

The Playwright suite runs against the synthetic fixture server configured in
`playwright.config.ts`. It uses generated map, style, and GCI data, so the
browser tests do not require proprietary GTA2 files.

## Suites

- `game.spec.ts` covers the main game page, startup, movement, and multiplayer
  browser flows.
- `sprites.spec.ts` covers the standalone sprite viewer and decoded sprite
  presentation.
- `vehicle-scenarios.spec.ts` covers the deterministic scenario viewer.
- `vehicle-scenarios.ts` is the Playwright page object for the Scenarios panel.

Run the full suite with:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

Run only the scenario suite with:

```sh
pnpm test:e2e:scenarios
```

## Scenario viewer

The scenario viewer runs the same shared `Gta2Game.step` loop used by gameplay
inside a deterministic synthetic room. The authored cases live in
`src/client/tools/scenarios/scenario-definitions.ts`, which is the registry for
both vehicle-entry and gameplay scenarios. The registry uses common `id`,
`kind`, `level`, `title`, `description`, `arrange`, `act`, and `assert` fields.

Vehicle cases cover door access, entry and exit, blocked approaches, occupied
drivers, decoded vehicle metadata, and representative CARI/GCI variants.
Gameplay cases cover jumping over cars, lethal vehicle impacts, and water
drowning for players and NPCs. The page object drives visible controls and
reads structured `data-*` results from the panel instead of reaching into
private simulation state.

The scenario helper also supports pausing, single-step replay, terminal-state
waits, alternate decoded car models, and arbitrary matrices:

```ts
const panel = new VehicleScenarioPanel(page);
const results = await panel.runMatrix([0, 10], { settleMs: 1_500, allowActive: true });
```
