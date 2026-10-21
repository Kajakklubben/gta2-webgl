import { expect, it } from 'vitest';
import { GameObject, type GameObjectCollision, type GameObjectKind } from '../../shared/game/gameobjects/gameobject';
import { GameState } from '../../shared/game/gameobjects/game-state';
import { CollisionWorld, shapeContact, type CollisionBody } from '../../shared/game/physics/collision-world';

const requireCollider = (value: readonly CollisionBody[]) => {
  if (value.length !== 1) throw new Error('Expected one collision body');
  return value[0]!;
};

/** Deliberately use sensor-kind names for solids: blocking must not inspect entity types. */
class Object extends GameObject<{ x: number; y: number; z: number; rotation: number; vx: number; vy: number }, string> {
  constructor(id: string, kind: GameObjectKind, x: number, collision: GameObjectCollision) {
    super(id, { x, y: 0, z: 0, rotation: 0, vx: 100, vy: 30 }, kind); this.collision = collision;
  }
  setSolid(solid: boolean) {
    if (this.collision.length !== 1) throw new Error('blocking test object has no collider');
    this.collision = { ...this.collision[0]!, solid };
  }
  setTestVelocity(vx: number, vy: number) { this.setVelocity(vx, vy); }
  peers() { return this.gameState.objectsOfKind<Object>('pickup'); }
  setPeerVelocity(id: string, vx: number, vy: number) { this.gameState.objectsOfKind<Object>('pickup').find(peer => peer.id === id)?.setTestVelocity(vx, vy); }
  override update() {}
  override draw() {}
}

it.each([
  [{ type: 'box', width: 40, height: 80 }, { type: 'circle', radius: 10 }],
  [{ type: 'circle', radius: 20 }, { type: 'circle', radius: 10 }],
  [{ type: 'box', width: 40, height: 80 }, { type: 'box', width: 20, height: 20 }],
] as const)('blocks configured shapes with the same handler regardless of object kind (%j, %j)', (fixedShape, movingShape) => {
  const wall = new Object('wall', 'pickup', 0, { shape: fixedShape, weight: 0 });
  wall.setTestVelocity(0, 0);
  const actor = new Object('actor', 'hazard', -25, { shape: movingShape });
  const world = new CollisionWorld(); world.rebuild([wall, actor]);
  world.resolveBlocking();
  expect(wall.state.x).toBe(0);
  expect(actor.state.x).toBeCloseTo(-30);
  expect(actor.state.vx).toBeCloseTo(0);
  expect(actor.state.vy).toBe(30);
  expect(actor.state.rotation).toBe(0);
    expect(shapeContact(requireCollider(wall.getCollider()), requireCollider(actor.getCollider()))).toEqual([]);
});

it('binds every object to shared GameState lookup and action APIs', () => {
  const state = new GameState();
  const first = new Object('first', 'pickup', 0, { shape: { type: 'circle', radius: 5 } });
  const second = new Object('second', 'pickup', 10, { shape: { type: 'circle', radius: 5 } });
  state.register(first); state.register(second);
  expect(first.peers()).toEqual([first, second]);
  first.setPeerVelocity('second', 12, 8);
  expect(second.state.vx).toBe(12);
  expect(second.state.vy).toBe(8);
});

it('leaves sensors unblocked and shares separation between movable objects', () => {
  const a = new Object('a', 'projectile', 0, { shape: { type: 'box', width: 20, height: 20 } });
  const b = new Object('b', 'pickup', 15, { shape: { type: 'box', width: 20, height: 20 }, solid: false });
  const world = new CollisionWorld(); world.rebuild([a, b]); world.resolveBlocking();
  expect(a.state.x).toBe(0); expect(b.state.x).toBe(15);
  b.setSolid(true); world.rebuild([a, b]); world.resolveBlocking();
  expect(a.state.x).toBe(-2.5); expect(b.state.x).toBe(17.5);
});

it('keeps immovable objects fixed during blocking and preserves pre-impact velocities', () => {
  const a = new Object('a', 'npc', 0, { shape: { type: 'box', width: 20, height: 20 }, weight: 0 });
  const b = new Object('b', 'player', 15, { shape: { type: 'circle', radius: 10 } });
  a.setTestVelocity(240, a.state.vy); b.setTestVelocity(0, b.state.vy);
  const world = new CollisionWorld(); world.rebuild([a, b]);
  const contacts = world.resolveBlocking();
  expect(a.state.x).toBe(0); expect(b.state.x).toBe(20);
  expect(contacts[0]!.velocityA?.x).toBe(240);
});
