import { WORLD } from '../domain/world/world';

/** Wire protocol limits and fixed-step timing shared by client and server. */
export const PROTOCOL_VERSION = 6;
export const TICK_RATE = WORLD.tickRate;
export const DEFAULT_STEP_SECONDS = 1 / TICK_RATE;
export const STEP = DEFAULT_STEP_SECONDS;
export const MAX_PENDING_INPUTS = 120;
export const MAX_INPUTS_PER_SECOND = 45;
export const INTEREST_RADIUS = 2200;
