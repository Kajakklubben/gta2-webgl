import { expect, type Locator, type Page } from '@playwright/test';
export { VEHICLE_PROPERTY_CASES } from '../../shared/domain/vehicles/vehicle-property-cases';
export { ENTRY_APPROACHES, ENTRY_SCENARIO_APPROACHES, ENTRY_SCENARIO_IDS as ENTRY_SCENARIOS, EXIT_SCENARIO_IDS as EXIT_SCENARIOS, VEHICLE_ENTRY_SCENARIOS, VEHICLE_EXIT_SCENARIOS } from '../../shared/domain/vehicles/vehicle-entry-scenarios';
import { ENTRY_APPROACHES, ENTRY_SCENARIO_APPROACHES, ENTRY_SCENARIO_IDS as ENTRY_SCENARIOS, EXIT_SCENARIO_IDS as EXIT_SCENARIOS } from '../../shared/domain/vehicles/vehicle-entry-scenarios';

export type EntryScenarioId = typeof ENTRY_SCENARIOS[number];
export type ExitScenarioId = typeof EXIT_SCENARIOS[number];
export type EntryApproach = typeof ENTRY_APPROACHES[number];
export type EntryOutcome = 'active' | 'seated' | 'rejected';
export type ScenarioAction = 'enter' | 'exit';

export interface VehicleScenarioSelection {
  readonly car: number;
  readonly scenario: EntryScenarioId | ExitScenarioId;
  readonly action?: ScenarioAction;
  readonly approach: EntryApproach;
}

export interface VehicleScenarioSnapshot extends VehicleScenarioSelection {
  readonly title: string;
  readonly status: string;
  readonly detail: string;
  readonly phase: 'approaching' | 'entering' | 'seated' | 'exiting' | 'exited' | 'blocked';
  readonly outcome: EntryOutcome | 'exited';
  readonly progress: number;
  readonly selectedDoor: number | undefined;
  readonly doorFrame: number;
  readonly entryInputSent: boolean;
  readonly doorCount: number;
  readonly seatCount: number;
  readonly straightDoorCount: number;
  readonly carFlags: number;
  readonly carFlags2: number;
  readonly carWidth: number;
  readonly carHeight: number;
  readonly carSprite: number | undefined;
  readonly carSpriteCount: number | undefined;
  readonly carRemapCount: number;
  readonly carWreck: number | undefined;
  readonly carRating: number | undefined;
  readonly physicsMass: number | undefined;
  readonly physicsMaxSpeed: number | undefined;
  readonly physicsThrust: number | undefined;
  readonly physicsTurnRatio: number | undefined;
}

export interface RunMatrixOptions {
  /** Time to allow the authoritative fixed-step replay to run for each case. */
  readonly settleMs?: number;
  /** Capture the case even when it is still active at the deadline. */
  readonly allowActive?: boolean;
}

const phaseValues = new Set<VehicleScenarioSnapshot['phase']>(['approaching', 'entering', 'seated', 'exiting', 'exited', 'blocked']);
const outcomeValues = new Set<VehicleScenarioSnapshot['outcome']>(['active', 'seated', 'exited', 'rejected']);

function parseInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return Math.trunc(parsed);
  return fallback;
}

function parsePhase(value: string | null): VehicleScenarioSnapshot['phase'] {
  if (phaseValues.has(value as VehicleScenarioSnapshot['phase'])) return value as VehicleScenarioSnapshot['phase'];
  return 'blocked';
}

function parseOutcome(value: string | null): VehicleScenarioSnapshot['outcome'] {
  if (outcomeValues.has(value as VehicleScenarioSnapshot['outcome'])) return value as VehicleScenarioSnapshot['outcome'];
  return 'rejected';
}

function parseOptionalInteger(value: string | null) {
  if (value === null || value === '') return undefined;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return Math.trunc(parsed);
  return undefined;
}

function parseOptionalNumber(value: string | null) {
  if (value === null || value === '') return undefined;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  return undefined;
}

/**
 * Page object for the standalone vehicle scenario replay.  All operations use
 * the same visible controls a developer uses manually; the data attributes
 * are only read as structured diagnostics after the UI has updated.
 */
export class VehicleScenarioPanel {
  readonly panel: Locator;
  readonly car: Locator;
  readonly action: Locator;
  readonly scenario: Locator;
  readonly restartButton: Locator;
  readonly playButton: Locator;
  readonly stepButton: Locator;
  readonly status: Locator;
  readonly progress: Locator;
  readonly propertySection: Locator;
  readonly propertyCases: Locator;

  constructor(readonly page: Page) {
    this.panel = page.getByRole('main', { name: 'Vehicle scenarios' });
    this.car = page.locator('#entry-car');
    this.action = page.locator('#entry-action');
    this.scenario = page.locator('#entry-scenario-approach');
    this.restartButton = page.locator('#entry-restart');
    this.playButton = page.locator('#entry-play');
    this.stepButton = page.locator('#entry-step');
    this.status = page.locator('#entry-status');
    this.progress = page.locator('#entry-progress');
    this.propertySection = page.locator('#entry-property-coverage');
    this.propertyCases = page.locator('#entry-property-cases button');
  }

  async open() {
    if (!(await this.panel.isVisible())) await this.page.goto('/scenarios.html');
    await expect(this.panel).toBeVisible();
    await expect(this.car).toBeVisible();
  }

  async close() {
    if (await this.panel.isVisible()) await this.page.getByRole('button', { name: 'Back to game', exact: true }).click();
    await expect(this.page).toHaveURL(/\/$/);
  }

  async openProperties() {
    if (await this.propertySection.getAttribute('open') === null) await this.propertySection.locator('summary').click();
    await expect(this.propertyCases.first()).toBeVisible();
  }

  async select(selection: VehicleScenarioSelection) {
    await this.open();
    await this.car.selectOption(String(selection.car));
    if (selection.action) await this.action.selectOption(selection.action);
    await this.scenario.selectOption(`${selection.scenario}|${selection.approach}`);
    await expect(this.panel).toHaveAttribute('data-car-model', String(selection.car));
    await expect(this.panel).toHaveAttribute('data-scenario', selection.scenario);
    await expect(this.panel).toHaveAttribute('data-approach', selection.approach);
  }

  async restart({ pause = false }: { readonly pause?: boolean } = {}) {
    await this.restartButton.click();
    await expect(this.progress).toHaveText(/^(0|[1-9])%$/);
    if (pause && await this.playButton.innerText() === 'Pause') await this.playButton.click();
  }

  async play() {
    if (await this.playButton.innerText() === 'Play') await this.playButton.click();
  }

  async pause() {
    if (await this.playButton.innerText() === 'Pause') await this.playButton.click();
  }

  async step(count = 1) {
    await this.pause();
    for (let index = 0; index < count; index++) await this.stepButton.click();
  }

  async snapshot(): Promise<VehicleScenarioSnapshot> {
    await expect(this.panel).toBeVisible();
    const car = parseInteger(await this.panel.getAttribute('data-car-model'), 0);
    const scenario = (await this.panel.getAttribute('data-scenario') ?? 'clear') as EntryScenarioId;
    const action = (await this.panel.getAttribute('data-action') ?? 'enter') as ScenarioAction;
    const approach = (await this.panel.getAttribute('data-approach') ?? 'left') as EntryApproach;
    return {
      car,
      scenario,
      action,
      approach,
      title: await this.page.locator('#entry-title').innerText(),
      status: await this.status.innerText(),
      detail: await this.page.locator('#entry-detail').innerText(),
      phase: parsePhase(await this.panel.getAttribute('data-phase')),
      outcome: parseOutcome(await this.panel.getAttribute('data-outcome')),
      progress: parseInteger(await this.panel.getAttribute('data-progress'), 0),
      selectedDoor: parseOptionalInteger(await this.panel.getAttribute('data-selected-door')),
      doorFrame: parseInteger(await this.panel.getAttribute('data-door-frame'), 0),
      entryInputSent: (await this.panel.getAttribute('data-entry-input-sent')) === 'true',
      doorCount: parseInteger(await this.panel.getAttribute('data-door-count'), 0),
      seatCount: parseInteger(await this.panel.getAttribute('data-seat-count'), 0),
      straightDoorCount: parseInteger(await this.panel.getAttribute('data-straight-door-count'), 0),
      carFlags: parseInteger(await this.panel.getAttribute('data-car-flags'), 0),
      carFlags2: parseInteger(await this.panel.getAttribute('data-car-flags2'), 0),
      carWidth: parseInteger(await this.panel.getAttribute('data-car-width'), 0),
      carHeight: parseInteger(await this.panel.getAttribute('data-car-height'), 0),
      carSprite: parseOptionalInteger(await this.panel.getAttribute('data-car-sprite')),
      carSpriteCount: parseOptionalInteger(await this.panel.getAttribute('data-car-sprite-count')),
      carRemapCount: parseInteger(await this.panel.getAttribute('data-car-remap-count'), 0),
      carWreck: parseOptionalInteger(await this.panel.getAttribute('data-car-wreck')),
      carRating: parseOptionalInteger(await this.panel.getAttribute('data-car-rating')),
      physicsMass: parseOptionalNumber(await this.panel.getAttribute('data-physics-mass')),
      physicsMaxSpeed: parseOptionalNumber(await this.panel.getAttribute('data-physics-max-speed')),
      physicsThrust: parseOptionalNumber(await this.panel.getAttribute('data-physics-thrust')),
      physicsTurnRatio: parseOptionalNumber(await this.panel.getAttribute('data-physics-turn-ratio')),
    };
  }

  async run(selection: VehicleScenarioSelection, options: RunMatrixOptions = {}) {
    await this.select(selection);
    await this.play();
    await this.page.waitForTimeout(options.settleMs ?? 2_000);
    // Freeze the fixed-step replay before reading several data attributes so
    // phase/progress/door state cannot come from different animation frames.
    await this.pause();
    const result = await this.snapshot();
    if (!options.allowActive) expect(result.outcome, `${selection.scenario}/${selection.approach} did not reach a terminal state`).not.toBe('active');
    return result;
  }

  async runMatrix(cars: readonly number[], options: RunMatrixOptions = {}) {
    const results: VehicleScenarioSnapshot[] = [];
    for (const car of cars) {
      for (const scenario of ENTRY_SCENARIOS) {
        for (const approach of ENTRY_SCENARIO_APPROACHES[scenario]) {
          results.push(await this.run({ car, scenario, approach }, options));
        }
      }
    }
    return results;
  }
}

export function matrixByKey(results: readonly VehicleScenarioSnapshot[]) {
  return new Map(results.map(result => [`${result.car}:${result.scenario}:${result.approach}`, result] as const));
}
