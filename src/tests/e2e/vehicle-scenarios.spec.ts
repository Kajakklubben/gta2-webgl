import { expect, test } from '@playwright/test';
import { ENTRY_SCENARIO_APPROACHES, ENTRY_SCENARIOS, EXIT_SCENARIOS, SCENARIO_DEFINITIONS, VEHICLE_PROPERTY_CASES, VehicleScenarioPanel, matrixByKey } from './vehicle-scenarios';

const SCENARIO_OPTION_COUNT = ENTRY_SCENARIOS.reduce((count, id) => count + ENTRY_SCENARIO_APPROACHES[id].length, 0)
  + EXIT_SCENARIOS.length
  + (SCENARIO_DEFINITIONS.length - ENTRY_SCENARIOS.length - EXIT_SCENARIOS.length);

test.describe('vehicle scenario replay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/scenarios.html');
    await expect(page.locator('#vehicle-entry-lab')).toBeVisible();
    await new VehicleScenarioPanel(page).setSpeed(16);
  });

  test('opens a real game-rendered scenario with all controls', async ({ page }) => {
    const scenario = new VehicleScenarioPanel(page);
    await scenario.open();
    await expect(scenario.car.locator('option')).not.toHaveCount(0);
    await expect(page.locator('#scenario-select option')).toHaveCount(SCENARIO_OPTION_COUNT);
    await expect(page.locator('#scenario-select')).toBeVisible();
    await expect(page.locator('#scenario-approach-control')).toHaveCount(0);
    await expect(page.locator('#entry-action')).toHaveCount(0);
    await expect(page.getByLabel('Vehicle scenario preview', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Vehicle scenario diagnostics', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Selected door animation frames', { exact: true })).toBeVisible();
    const result = await scenario.snapshot();
    expect(result.car).toBe(0);
    expect(result.title).toContain('Clear on both sides');
    expect(result.detail).toContain('2 doors · 4 seats');
  });

  test('uses the id query parameter as the default scenario and keeps it in sync', async ({ page }) => {
    await page.goto('/scenarios.html?id=tiny-town-rendering');
    await expect(page.locator('#scenario-select')).toHaveValue('tiny-town-rendering');
    await expect(page.locator('#gameplay-scenario-lab')).toBeVisible();
    await expect(page).toHaveURL(/\/scenarios\.html\?id=tiny-town-rendering$/);

    await page.locator('#scenario-select').selectOption('jump-over-car');
    await expect(page).toHaveURL(/\/scenarios\.html\?id=jump-over-car$/);
  });

  test('supports 1x through 16x simulation speed for both scenario labs', async ({ page }) => {
    const entrySpeed = page.locator('#entry-speed');
    const gameplaySpeed = page.locator('#gameplay-speed');
    await expect(entrySpeed.locator('option')).toHaveCount(5);
    await expect(gameplaySpeed.locator('option')).toHaveCount(5);
    await entrySpeed.selectOption('16');
    await expect(page.locator('#vehicle-entry-lab')).toHaveAttribute('data-simulation-speed', '16');
    const scenario = new VehicleScenarioPanel(page);
    await scenario.select({ car: 0, scenario: 'clear', approach: 'left' });
    await expect.poll(async () => (await scenario.snapshot()).outcome, { timeout: 5_000 }).toBe('seated');
    await page.locator('#scenario-select').selectOption('jump-over-car');
    await gameplaySpeed.selectOption('16');
    await expect(page.locator('#gameplay-scenario-lab')).toHaveAttribute('data-simulation-speed', '16');
    await scenario.select({ car: 0, scenario: 'clear', approach: 'left' });
    await entrySpeed.selectOption('1');
    await page.locator('#scenario-select').selectOption('jump-over-car');
    await gameplaySpeed.selectOption('1');
    await expect(page.locator('#vehicle-entry-lab')).toHaveAttribute('data-simulation-speed', '1');
    await expect(page.locator('#gameplay-scenario-lab')).toHaveAttribute('data-simulation-speed', '1');
  });

  test('prefers the left-front door for a clear exit', async ({ page }) => {
    const scenario = new VehicleScenarioPanel(page);
    await scenario.select({ car: 10, scenario: EXIT_SCENARIOS[0], approach: 'left' });
    await expect(scenario.status).toContainText('LF left');
    const clearSelection = await scenario.snapshot();
    expect(clearSelection.selectedDoor).toBe(1);
    expect(clearSelection.status).toContain('LF left');
    await scenario.play();
    await scenario.waitForOutcome('exited');
    const clear = await scenario.snapshot();
    expect(clear.action).toBe('exit');
    expect(clear.outcome).toBe('exited');
  });

  test('falls back to the right-front door when the left side is blocked', async ({ page }) => {
    const scenario = new VehicleScenarioPanel(page);
    const fallbackScenario = scenario;
    await fallbackScenario.select({ car: 10, scenario: EXIT_SCENARIOS[1], approach: 'left' });
    await expect(fallbackScenario.status).toContainText('RF right');
    const fallbackSelection = await fallbackScenario.snapshot();
    expect(fallbackSelection.selectedDoor).toBe(0);
    expect(fallbackSelection.status).toContain('RF right');
    await fallbackScenario.play();
    await fallbackScenario.waitForOutcome('exited');
    const fallback = await fallbackScenario.snapshot();
    expect(fallback.outcome, fallback.status).toBe('exited');
  });

  test('rejects an exit when every door is blocked', async ({ page }) => {
    const scenario = new VehicleScenarioPanel(page);
    const blockedScenario = scenario;
    const blocked = await blockedScenario.run({ car: 10, scenario: EXIT_SCENARIOS[2], approach: 'left' }, { settleMs: 250, allowActive: true });
    expect(blocked.outcome).toBe('rejected');
    expect(blocked.entryInputSent).toBe(true);
  });

  test('shows the property test cases on the Scenarios page', async ({ page }) => {
    const scenario = new VehicleScenarioPanel(page);
    await scenario.open();
    await scenario.openProperties();
    await expect(scenario.propertyCases).toHaveCount(VEHICLE_PROPERTY_CASES.length);
    await expect(page.locator('#entry-property-summary')).toContainText('Decoded CARI/GCI');
    const tankerCase = page.locator('#entry-property-cases button[data-car-model="55"]');
    await tankerCase.click();
    await expect(scenario.panel).toHaveAttribute('data-car-model', '55');
    await expect(page.locator('#entry-detail')).toContainText('0 doors · 0 seats');
    await expect(tankerCase).toHaveAttribute('aria-pressed', 'true');
  });

  test('completes clear-side entries through the real occupancy state machine', async ({ page }) => {
    const scenario = new VehicleScenarioPanel(page);
    for (const approach of ['left', 'right', 'rear'] as const) {
      const result = await scenario.run({ scenario: 'clear', approach }, { settleMs: 2_000 });
      expect(result.outcome, `${approach}: ${result.status}`).toBe('seated');
      expect(result.phase).toBe('seated');
      expect(result.progress).toBe(100);
      expect(result.doorFrame).toBe(0);
    }
  });

  test('keeps map-driven layouts separate from explicit occupancy rejection', async ({ page }) => {
    const scenario = new VehicleScenarioPanel(page);
    let bothBlocked: Awaited<ReturnType<VehicleScenarioPanel['snapshot']>> | undefined;
    for (const selection of [
      { car: 0, scenario: 'both-blocked' as const, approach: 'left' as const },
      { car: 0, scenario: 'full' as const, approach: 'left' as const },
      { car: 0, scenario: 'locked' as const, approach: 'left' as const },
    ]) {
      const result = await scenario.run(selection, { settleMs: 250, allowActive: selection.scenario === 'both-blocked' });
      if (selection.scenario !== 'both-blocked') {
        expect(result.outcome, result.status).toBe('rejected');
        expect(result.progress).toBe(100);
        expect(result.status).toMatch(/rejected|no accessible/);
      }
      if (selection.scenario === 'both-blocked') bothBlocked = result;
    }
    expect(bothBlocked?.detail).toContain('blocked');
  });

  test('uses decoded door and seat metadata for a four-door car', async ({ page }) => {
    const scenario = new VehicleScenarioPanel(page);
    const result = await scenario.run({ car: 10, scenario: 'clear', approach: 'right' }, { settleMs: 2_000 });
    expect(result.detail).toContain('4 doors · 5 seats');
    expect(result.selectedDoor).toBeDefined();
    expect(result.outcome).toBe('seated');
    const mapDriven = await scenario.run({ car: 10, scenario: 'front-blocked', approach: 'rear' }, { settleMs: 2_000, allowActive: true });
    expect(mapDriven.detail).toContain('blocked');
    expect(mapDriven.selectedDoor).toBeDefined();
  });

  test('covers decoded car property classes in the real scenario renderer', async ({ page }) => {
    const scenario = new VehicleScenarioPanel(page);
    const snapshots = new Map<number, Awaited<ReturnType<VehicleScenarioPanel['snapshot']>>>();
    for (const propertyCase of VEHICLE_PROPERTY_CASES) {
      await scenario.select({ car: propertyCase.car, scenario: 'clear', approach: 'left' });
      await scenario.pause();
      const result = await scenario.snapshot();
      snapshots.set(propertyCase.car, result);
      expect(result.doorCount, propertyCase.name).toBe(propertyCase.doors);
      expect(result.seatCount, propertyCase.name).toBe(propertyCase.seats);
      expect(result.straightDoorCount, propertyCase.name).toBe(propertyCase.straightDoors);
      expect(result.carFlags, propertyCase.name).toBe(propertyCase.flags);
      expect(result.carFlags2, propertyCase.name).toBe(propertyCase.flags2);
      expect(result.carWidth, propertyCase.name).toBe(propertyCase.width);
      expect(result.carHeight, propertyCase.name).toBe(propertyCase.height);
      expect(result.physicsMass, propertyCase.name).toBeCloseTo(propertyCase.mass);
      expect(result.physicsMaxSpeed, propertyCase.name).toBeCloseTo(propertyCase.maxSpeed);
      expect(result.physicsThrust, propertyCase.name).toBeCloseTo(propertyCase.thrust);
      expect(result.physicsTurnRatio, propertyCase.name).toBeCloseTo(propertyCase.turnRatio);
      if (propertyCase.enterable) {
        expect(result.selectedDoor !== undefined, propertyCase.name).toBe(true);
        expect(result.outcome !== 'rejected', propertyCase.name).toBe(true);
      } else {
        expect(result.selectedDoor === undefined, propertyCase.name).toBe(true);
        expect(result.outcome === 'rejected', propertyCase.name).toBe(true);
      }
    }
    // CARI sprite allocation is shared by model 67/68 even though their
    // decoded model records have different flags and ratings.
    expect(snapshots.get(67)?.carSprite).toBe(snapshots.get(68)?.carSprite);
    expect(snapshots.get(67)?.carSpriteCount).toBe(VEHICLE_PROPERTY_CASES.find(propertyCase => propertyCase.car === 67)?.spriteCount);
    expect(snapshots.get(68)?.carSpriteCount).toBe(VEHICLE_PROPERTY_CASES.find(propertyCase => propertyCase.car === 68)?.spriteCount);
  });

  test('can pause and single-step the authoritative replay', async ({ page }) => {
    const scenario = new VehicleScenarioPanel(page);
    // Single-step is a discrete-control test; keep the replay slow enough to
    // observe the pre-step state before exercising the fixed-step button.
    await scenario.setSpeed(1);
    await scenario.select({ car: 0, scenario: 'clear', approach: 'left' });
    await scenario.pause();
    const before = await scenario.snapshot();
    await scenario.step(3);
    const after = await scenario.snapshot();
    expect(after.progress).toBeGreaterThan(before.progress);
    expect(after.entryInputSent).toBe(true);
    await expect(scenario.playButton).toHaveText('Play');
  });

  test('runs the complete default-car matrix and attaches a diagnostic report', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const scenario = new VehicleScenarioPanel(page);
    const results = await scenario.runMatrix([0], { settleMs: 2_000, allowActive: true });
    const expectedMatrixLength = ENTRY_SCENARIOS.reduce((count, id) => count + ENTRY_SCENARIO_APPROACHES[id].length, 0);
    expect(results).toHaveLength(expectedMatrixLength);
    const matrix = matrixByKey(results);
    expect(matrix.get('0:clear:left')?.outcome).toBe('seated');
    expect(matrix.get('0:clear:right')?.outcome).toBe('seated');
    expect(matrix.get('0:full:left')?.outcome).toBe('rejected');
    expect(matrix.get('0:locked:left')?.outcome).toBe('rejected');
    await testInfo.attach('vehicle-scenario-matrix.json', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
    expect(results.every(result => result.progress >= 0 && result.progress <= 100)).toBe(true);
    expect(results.every(result => result.status.length > 0 && result.detail.length > 0)).toBe(true);
  });

  test('ejects the NPC driver when entering an occupied car', async ({ page }) => {
    const scenario = new VehicleScenarioPanel(page);
    const result = await scenario.run({ scenario: 'driver-occupied', approach: 'left' }, { settleMs: 2_000 });
    expect(result.outcome, result.status).toBe('seated');
  });

  test('rejects a blocked approach using a locked vehicle blockade', async ({ page }) => {
    const scenario = new VehicleScenarioPanel(page);
    const result = await scenario.run({ car: 0, scenario: 'both-blocked', approach: 'left' }, { settleMs: 250, allowActive: true });
    expect(result.outcome).toBe('rejected');
    expect(result.entryInputSent).toBe(true);
    expect(result.detail).toContain('blockers');
  });

  test('keeps the scenario panel free of page errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const scenario = new VehicleScenarioPanel(page);
    await scenario.run({ car: 0, scenario: 'clear', approach: 'left' }, { settleMs: 2_000 });
    await scenario.run({ car: 0, scenario: 'driver-occupied', approach: 'left' }, { settleMs: 2_000, allowActive: true });
    expect(errors).toEqual([]);
  });

  test('replays the jump, impact, and water gameplay levels', async ({ page }) => {
    test.setTimeout(30_000);
    const panel = page.locator('#gameplay-scenario-lab');
    const selector = page.locator('#scenario-select');
    await selector.selectOption('jump-over-car');
    await expect(panel).toBeVisible();
    await page.locator('#gameplay-speed').selectOption('16');
    await expect(panel).toHaveAttribute('data-simulation-speed', '16');
    await expect(selector.locator('option')).toHaveCount(SCENARIO_OPTION_COUNT);
    for (const scenario of [
      'jump-over-car', 'npc-jump-over-car', 'player-car-impact', 'npc-car-impact',
      'player-water', 'driver-water', 'npc-water', 'tiny-town-rendering',
    ]) {
      await selector.selectOption(scenario);
      await expect(panel).toHaveAttribute('data-outcome', 'passed', { timeout: 4_000 });
      await expect(panel).toHaveAttribute('data-npc-count', scenario.startsWith('npc-') ? '1' : '0');
      await expect(panel).toHaveAttribute('data-traffic-count', scenario.endsWith('-water') && scenario !== 'driver-water' ? '0' : '1');
      if (scenario === 'player-water' || scenario === 'npc-water') await expect(page.locator('#scenario-car-control')).toBeHidden();
      if (scenario === 'driver-water') await expect(page.locator('#scenario-car-control')).toBeVisible();
      if (scenario === 'npc-water') await expect(panel).toHaveAttribute('data-npc-death-cause', 'water');
    }
  });

  test('allows manual control of a gameplay player through the normal input path', async ({ page }) => {
    const panel = page.locator('#gameplay-scenario-lab');
    const selector = page.locator('#scenario-select');
    await selector.selectOption('jump-over-car');
    await page.locator('#gameplay-speed').selectOption('1');
    const manual = page.locator('#gameplay-manual');
    await manual.click();
    await expect(panel).toHaveAttribute('data-control-mode', 'manual');
    const startX = Number(await panel.getAttribute('data-player-x'));
    await page.keyboard.down('ArrowUp');
    await expect.poll(async () => Number(await panel.getAttribute('data-player-x')), { timeout: 3_000 }).toBeGreaterThan(startX);
    await page.keyboard.up('ArrowUp');
    await manual.click();
    await expect(panel).toHaveAttribute('data-control-mode', 'scripted');
  });

  test('uses the same manual control mode for vehicle entry and exit replays', async ({ page }) => {
    const panel = page.locator('#vehicle-entry-lab');
    const selector = page.locator('#scenario-select');
    const manual = page.locator('#entry-manual');
    await selector.selectOption('exit-clear');
    await manual.click();
    await expect(panel).toHaveAttribute('data-control-mode', 'manual');
    await page.keyboard.press('KeyE');
    await expect(panel).toHaveAttribute('data-outcome', 'exited', { timeout: 3_000 });
    await page.keyboard.press('KeyE');
    await expect(panel).toHaveAttribute('data-outcome', 'seated', { timeout: 3_000 });
  });

  test('allows manual entry replays to exit through the same input path', async ({ page }) => {
    const panel = page.locator('#vehicle-entry-lab');
    const selector = page.locator('#scenario-select');
    const manual = page.locator('#entry-manual');
    await selector.selectOption('clear|left');
    await manual.click();
    await expect(panel).toHaveAttribute('data-control-mode', 'manual');
    await page.keyboard.press('KeyE');
    await expect(panel).toHaveAttribute('data-outcome', 'seated', { timeout: 3_000 });
    await page.keyboard.press('KeyE');
    await expect(panel).toHaveAttribute('data-outcome', 'exited', { timeout: 3_000 });
  });

  test('keeps manual control available for rejected vehicle scenarios', async ({ page }) => {
    const panel = page.locator('#vehicle-entry-lab');
    const selector = page.locator('#scenario-select');
    const manual = page.locator('#entry-manual');
    await selector.selectOption('both-blocked|left');
    await expect(manual).toBeEnabled();
    await manual.click();
    await expect(panel).toHaveAttribute('data-control-mode', 'manual');
  });

});
