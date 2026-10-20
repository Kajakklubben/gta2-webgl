export type StartupMode = 'singleplayer' | 'multiplayer' | 'split-screen';

export interface StartupView {
  /** GTA2 map-tile coordinate, before conversion to browser world pixels. */
  x: number;
  /** GTA2 map-tile coordinate, before conversion to browser world pixels. */
  y: number;
}

export interface StartupOptions {
  mode: StartupMode;
  clearSession?: boolean;
  view?: StartupView;
}

function isTrue(value: string | null) {
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function parseView(value: string | null): StartupView | undefined {
  if (!value) return undefined;
  const parts = value.split(',').map(part => Number(part.trim()));
  if (parts.length !== 2 || !parts.every(Number.isFinite)) return undefined;
  return { x: parts[0]!, y: parts[1]! };
}

/** Read the URL launch options. Unknown values intentionally fall back safely. */
export function parseStartupOptions(search: string): StartupOptions {
  const params = new URLSearchParams(search);
  const clearSession = isTrue(params.get('clear-session'));
  const requestedMode = params.get('mode')?.trim().toLowerCase();
  let mode: StartupMode = 'singleplayer';
  if (params.get('local')?.trim().toLowerCase() === 'split' || requestedMode === 'split' || requestedMode === 'local') {
    mode = 'split-screen';
  } else if (requestedMode === 'multiplayer' || requestedMode === 'online' || (!requestedMode && isTrue(params.get('multiplayer')))) {
    mode = 'multiplayer';
  }
  const view = parseView(params.get('view'));
  const options: StartupOptions = { mode };
  if (clearSession) options.clearSession = true;
  if (view) options.view = view;
  return options;
}
