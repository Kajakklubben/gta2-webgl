import { setStatus, ui } from './main-ui';
import { startGameClient } from './game-client';

startGameClient().catch(error => {
  ui.status.hidden = false;
  setStatus(error instanceof Error ? error.message : String(error), 'error');
  document.body.dataset['connection'] = 'error';
});
