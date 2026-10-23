import { expect, it } from 'vitest';
import { GameObject, type GameObjectSprite } from '../../shared/game/gameobjects/gameobject';
import { GameState } from '../../shared/game/gameobjects/game-state';
import { GameWorld } from '../../shared/game/game-world';
import { parseMap } from '../../shared/engine/loader/map-parser';
import type { PhysicsBody } from '../../shared/engine/physics-world';
import type { TrafficState } from '../../shared/protocol/types';
import { mapFixture } from './fixtures';

class TestObject extends GameObject<{ x: number; y: number; z: number; rotation: number }, number> {
  constructor(id: number) { super(id, { x: 0, y: 0, z: 0, rotation: 0 }, 'hazard'); }
  update() {}
  override getSprite(): GameObjectSprite { return { atlas: 'objects', model: 0, placement: this.placement }; }
}

it('gives game objects a flat lifecycle and draw identity', () => {
  const registry = new GameState();
  const first = registry.register(new TestObject(1));
  const second = registry.register(new TestObject(2));

  expect(registry.findHazard(first.id)).toBe(first);
  const commands: { key: string }[] = [];
  second.draw({ now: 0, submit: command => commands.push({ key: command.key }) });
  expect(commands).toEqual([{ key: 'hazard:2' }]);

  const deferred = registry.deferSpawn(new TestObject(3));
  expect(registry.findHazard(deferred.id)).toBeUndefined();
  registry.flushLifecycle();
  expect(registry.findHazard(deferred.id)).toBe(deferred);
  registry.deferDespawn(deferred);
  expect(registry.findHazard(deferred.id)).toBe(deferred);
  registry.flushLifecycle();
  expect(registry.findHazard(deferred.id)).toBeUndefined();

  registry.unregister(first);
  expect(registry.size).toBe(1);
});

it('submits a render state view instead of the live top-level state object', () => {
  const object = new TestObject(7);
  let submitted: { state: object } | undefined;
  object.draw({ now: 0, submit: command => { submitted = command; } });

  expect(submitted?.state).not.toBe(object.state);
  (submitted!.state as { x: number }).x = 42;
  expect(object.state.x).toBe(0);
});

it('lets an object request flat domain lifecycle changes', () => {
  const registry = new GameState();
  const object = registry.register(new TestObject(4));
  const spawned = object.spawn(new TestObject(5));
  expect(registry.findHazard(spawned.id)).toBe(spawned);

  spawned.deferDespawn();
  expect(registry.findHazard(spawned.id)).toBe(spawned);
  registry.flushLifecycle();
  expect(registry.findHazard(spawned.id)).toBeUndefined();

  const deferred = object.deferSpawn(new TestObject(6));
  expect(registry.findHazard(deferred.id)).toBeUndefined();
  registry.flushLifecycle();
  expect(registry.findHazard(deferred.id)).toBe(deferred);
  object.despawn();
  expect(registry.findHazard(object.id)).toBeUndefined();
  expect(registry.findHazard(deferred.id)).toBe(deferred);
});

it('binds a live simulation body to the object without owning its runtime lifecycle', () => {
  const object = new TestObject(8), first = {} as PhysicsBody, second = {} as PhysicsBody;

  expect(object.physicsBody).toBeUndefined();
  expect(object.attachPhysicsBody(first)).toBeUndefined();
  expect(object.physicsBody).toBe(first);
  expect(object.attachPhysicsBody(second)).toBe(first);
  expect(object.detachPhysicsBody()).toBe(second);
  expect(object.physicsBody).toBeUndefined();
});

it('keeps vehicle game object identity across authoritative world restores', () => {
  const game = new GameWorld(parseMap(mapFixture()), 'client');
  const first: TrafficState = { id: 7, model: 0, x: 100, y: -100, z: 0, rotation: 0, speed: 0, vx: 0, vy: 0, angularVelocity: 0, throttle: 0, brakePressure: 1, handbrakeForce: 0, color: 0, passengers: [], occupants: [], doorStates: [], health: 100 };
  game.restoreWorld([], [first]);
  const object = game.gameObjects.findVehicle(first.id);
  const state = game.gameState.vehicleStates[0]!;

  game.restoreWorld([], [{ ...first, x: 160, y: -120, rotation: .5 }]);
  expect(game.gameObjects.findVehicle(first.id)).toBe(object);
  expect(object?.state).toBe(state);
  expect(state.x).toBe(160);
  expect(state.rotation).toBe(.5);
});
