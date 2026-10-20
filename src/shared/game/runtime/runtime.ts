import { WorldRuntime, type WorldPhaseContext } from '../../engine/world-runtime';

export type WorldPhaseName = 'lifecycle' | 'ai' | 'input' | 'physics' | 'collision' | 'combat' | 'replication';

export type WorldPhaseHandlers<State> = {
  [Name in WorldPhaseName]: (context: WorldPhaseContext<State>) => void;
};

/** Keeps the authoritative phase order in one place. The GameWorld class
 * supplies behavior; this module owns only orchestration. */
export function createWorldRuntime<State>(handlers: WorldPhaseHandlers<State>) {
  return new WorldRuntime<State>()
    .register('lifecycle', handlers.lifecycle)
    .register('ai', handlers.ai)
    .register('input', handlers.input)
    .register('physics', handlers.physics)
    .register('collision', handlers.collision)
    .register('combat', handlers.combat)
    .register('replication', handlers.replication);
}
