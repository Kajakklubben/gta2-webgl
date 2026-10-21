import { fetchAsset, loadClientAssets } from '../app/assets';
import { VehicleEntryLab } from './scenarios/vehicle-entry-lab';
import { GameplayScenarioLab } from './scenarios/gameplay-scenario-lab';

async function boot() {
  const assets = await loadClientAssets(fetchAsset, { map: 'MP1-comp.gmp', style: 'bil.sty', carNames: 'nyc.gci' });
  const lab = new VehicleEntryLab(assets.map.map, assets.style.style, assets.cars.names, assets.cars.physics, assets.cars.bounds);
  const gameplayLab = new GameplayScenarioLab(assets.map.map, assets.cars.names, assets.cars.physics, assets.cars.bounds, new Map(assets.style.style.cars.map(car => [car.model, car] as const)), assets.style.style);
  const viewerMode = document.querySelector<HTMLSelectElement>('#scenario-viewer-mode')!;
  const vehicleViewer = document.querySelector<HTMLElement>('#vehicle-entry-viewer')!;
  const setViewerMode = () => {
    const gameplay = viewerMode.value === 'gameplay';
    vehicleViewer.hidden = gameplay;
    lab.setViewerVisible(!gameplay);
    gameplayLab.setOpen(gameplay);
  };
  viewerMode.onchange = setViewerMode;
  setViewerMode();
  lab.onOpenChange = open => { if (!open) location.href = '/'; };
  lab.setOpen(true);
}

boot().catch(error => {
  const message = document.createElement('p');
  message.textContent = `Unable to load scenarios: ${(error as Error).message}`;
  document.querySelector('.scenario-page-shell')?.append(message);
});
