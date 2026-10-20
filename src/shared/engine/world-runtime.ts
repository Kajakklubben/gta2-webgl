/** Generic fixed-order phase runner used by game implementations. */
export const WORLD_PHASE_ORDER = ['lifecycle', 'ai', 'input', 'physics', 'collision', 'combat', 'replication'] as const;
export type WorldPhaseName = typeof WORLD_PHASE_ORDER[number];

export interface WorldPhaseContext<T> {
  readonly tick: number;
  readonly dt: number;
  readonly state: T;
}

export type WorldPhaseHandler<T> = (context: WorldPhaseContext<T>) => void;

/**
 * Keeps tick ordering in one place without knowing anything about GTA2. A
 * phase may mutate the per-tick state, but the runner owns when it executes.
 */
export class WorldRuntime<T> {
  private readonly phases = new Map<WorldPhaseName, WorldPhaseHandler<T>>();

  register(name: WorldPhaseName, handler: WorldPhaseHandler<T>) {
    if (this.phases.has(name)) throw new Error(`World phase already registered: ${name}`);
    this.phases.set(name, handler);
    return this;
  }

  run(context: WorldPhaseContext<T>) {
    for (const name of WORLD_PHASE_ORDER) this.phases.get(name)?.(context);
  }
}
