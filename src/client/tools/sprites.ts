import { fetchAsset, loadClientAssets } from '../app/assets';
import { SpriteLibrary } from '../rendering/sprite-engine';

async function boot() {
  const assets = await loadClientAssets(fetchAsset, { map: 'MP1-comp.gmp', style: 'bil.sty', carNames: 'nyc.gci' });
  new SpriteLibrary(assets.style.style, assets.cars.names);
}

boot().catch(error => {
  const message = document.createElement('p');
  message.textContent = `Unable to load sprites: ${(error as Error).message}`;
  document.querySelector('.sprite-page-shell')?.append(message);
});
