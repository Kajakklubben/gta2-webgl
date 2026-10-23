import { fetchAsset, loadClientAssets } from '../app/assets';
import { VehicleEntryLab } from './scenarios/vehicle-entry-lab';
import { GameplayScenarioLab } from './scenarios/gameplay-scenario-lab';
import { ENTRY_SCENARIO_APPROACHES, scenarioOptionValue, type VehicleEntryApproach } from './scenarios/vehicle-entry-scenarios';
import { SCENARIO_DEFINITIONS, type ScenarioDefinition } from './scenarios/scenario-definitions';

interface ScenarioOption {
  readonly value: string;
  readonly definition: ScenarioDefinition;
  readonly approach?: VehicleEntryApproach;
}

function scenarioHasCar(definition: ScenarioDefinition) {
  const arrangements = [definition.arrange, ...(definition.arrange.variants ?? [])];
  return arrangements.some(arrangement => arrangement.actors.some(actor => actor.kind === 'vehicle' || actor.kind === 'blockade'));
}

function scenarioKindLabel(definition: ScenarioDefinition) {
  if (definition.kind === 'vehicle-entry') return 'Enter vehicle';
  if (definition.kind === 'vehicle-exit') return 'Exit vehicle';
  return 'Gameplay';
}

function approachLabel(approach: VehicleEntryApproach) {
  return approach[0]!.toUpperCase() + approach.slice(1);
}

function scenarioOptions(): readonly ScenarioOption[] {
  const options: ScenarioOption[] = [];
  for (const definition of SCENARIO_DEFINITIONS) {
    if (definition.kind !== 'vehicle-entry') {
      options.push({ value: definition.id, definition });
      continue;
    }
    for (const approach of ENTRY_SCENARIO_APPROACHES[definition.id]) {
      options.push({ value: scenarioOptionValue(definition.id, approach), definition, approach });
    }
  }
  return options;
}

function scenarioOptionFromUrl(options: readonly ScenarioOption[]) {
  const requestedId = new URL(location.href).searchParams.get('id');
  if (requestedId !== null) {
    const exact = options.find(option => option.value === requestedId);
    if (exact) return exact;
    const definitionMatch = options.find(option => option.definition.id === requestedId);
    if (definitionMatch) return definitionMatch;
  }
  return options[0]!;
}

function updateScenarioUrl(id: string) {
  const url = new URL(location.href);
  url.searchParams.set('id', id);
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

async function boot() {
  const assets = await loadClientAssets(fetchAsset, { map: 'MP1-comp.gmp', style: 'bil.sty', carNames: 'nyc.gci' });
  const lab = new VehicleEntryLab(assets.map.map, assets.style.style, assets.cars.names, assets.cars.physics, assets.cars.bounds);
  const gameplayLab = new GameplayScenarioLab(assets.map.map, assets.cars.names, assets.cars.physics, assets.cars.bounds, new Map(assets.style.style.cars.map(car => [car.model, car] as const)), assets.style.style);
  const scenarioSelect = document.querySelector<HTMLSelectElement>('#scenario-select')!;
  const carControl = document.querySelector<HTMLElement>('#scenario-car-control')!;
  const carSelect = document.querySelector<HTMLSelectElement>('#entry-car')!;
  const vehicleViewer = document.querySelector<HTMLElement>('#vehicle-entry-viewer')!;
  const options = scenarioOptions();
  scenarioSelect.replaceChildren(...options.map(option => new Option(
    `${scenarioKindLabel(option.definition)} · ${option.definition.title}${option.approach ? ` · ${approachLabel(option.approach)}` : ''}`,
    option.value,
  )));
  scenarioSelect.value = scenarioOptionFromUrl(options).value;
  lab.onModelChange = model => gameplayLab.setCarModel(model);

  const setScenario = () => {
    const selected = options.find(option => option.value === scenarioSelect.value) ?? options[0]!;
    scenarioSelect.value = selected.value;
    updateScenarioUrl(selected.value);
    const definition = selected.definition;
    const gameplay = definition.kind === 'gameplay';
    carControl.hidden = !scenarioHasCar(definition);
    vehicleViewer.hidden = gameplay;
    lab.setViewerVisible(!gameplay);
    gameplayLab.setOpen(gameplay);
    if (gameplay) gameplayLab.setScenario(definition.id);
    else lab.setScenario(definition.id, selected.approach);
  };
  scenarioSelect.onchange = setScenario;
  setScenario();
  lab.onOpenChange = open => { if (!open) location.href = '/'; };
  lab.setOpen(true);

  // The vehicle lab owns the shared selector's option population and input
  // handling. Gameplay scenarios consume the same selected model through the
  // callback above, so the visible car control is configurable in one place.
  if (carSelect.value !== String(lab.selectedModel)) carSelect.value = String(lab.selectedModel);
}

boot().catch(error => {
  const message = document.createElement('p');
  message.textContent = `Unable to load scenarios: ${(error as Error).message}`;
  document.querySelector('.scenario-page-shell')?.append(message);
});
