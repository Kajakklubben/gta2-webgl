import { expect, it } from 'vitest';
import { WorldRuntime } from '../../shared/engine/world-runtime';

it('runs registered phases in deterministic engine order', () => {
  const runtime = new WorldRuntime<{ order: string[] }>();
  const order: string[] = [];
  for (const phase of ['combat', 'lifecycle', 'physics', 'ai', 'replication', 'input', 'collision'] as const) {
    runtime.register(phase, ({ state }) => state.order.push(phase));
  }
  runtime.run({ tick: 4, dt: 1 / 30, state: { order } });
  expect(order).toEqual(['lifecycle', 'ai', 'input', 'physics', 'collision', 'combat', 'replication']);
});
