export const DEBUG_SETTINGS_STORAGE_KEY = 'gta2-debug-settings';
export const PLAYER_SESSION_STORAGE_KEY = 'gta2-player-session';

export type DebugTab = 'graphs' | 'player' | 'camera';

export type DebugSettings = {
  /** Retained for compatibility with settings saved before the Debug page was flattened. */
  tab?: DebugTab;
  pedestrianGraph: boolean;
  traffic: boolean;
  car: boolean;
  zones: boolean;
  policeAttack: boolean;
  vehicleDoors: boolean;
  closestDoor: boolean;
  cameraMode: 'follow' | 'detached';
  cameraSpeedZoom: boolean;
  cameraLookahead: boolean;
  spriteFrameInterpolation: boolean;
  fpsCounter: boolean;
  showPlayerState: boolean;
  tilePicker: boolean;
  mapLevels: number[];
};

export function readDebugSettings(): Partial<DebugSettings> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(DEBUG_SETTINGS_STORAGE_KEY) ?? 'null');
    if (value && typeof value === 'object') return value as Partial<DebugSettings>;
  } catch {
    // Storage may contain malformed data or be unavailable.
  }
  return {};
}

export function getPlayerSessionId() {
  const stored = localStorage.getItem(PLAYER_SESSION_STORAGE_KEY);
  if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) return stored;
  const sessionId = crypto.randomUUID();
  localStorage.setItem(PLAYER_SESSION_STORAGE_KEY, sessionId);
  return sessionId;
}
