import { describe, expect, it } from 'vitest';
import { CollisionWorld, circleContact, type CollisionBody } from '../../shared/game/physics/collision-world';
import { COLLISION_CATEGORY, withinCollisionRadius } from '../../shared/domain/physics/collision-rules';
import { NpcObject } from '../../shared/game/gameobjects/npc';
import { npcDefaults } from './fixtures';

const body = (id: string, kind: 'player' | 'vehicle' | 'npc', x: number, y: number, z = 0, radius = 10) => {
  const state = { id, x, y, z };
  const object = { id, kind, state, getCollider: () => [result] } as any;
  const result = {
  id, objectId: id, kind, x, y, z, radius,
  category: COLLISION_CATEGORY[kind],
  mask: COLLISION_CATEGORY.player | COLLISION_CATEGORY.vehicle | COLLISION_CATEGORY.npc,
  solid: true, active: true, object,
  };
  return result;
};
const requireCollider = (value: readonly CollisionBody[]) => {
  if (value.length !== 1) throw new Error('Expected one collision body');
  return value[0]!;
};

describe('unified collision model', () => {
  it('keeps pedestrians queryable without making them solid blockers', () => {
    const npc = new NpcObject({ ...npcDefaults(), id: 1, x: 0, y: 0, z: 0, rotation: 0, vx: 0, vy: 0, health: 100, kind: 'civilian', state: 'idle', animation: 'idle' });
    const collider = requireCollider(npc.getCollider());
    const player = body('player', 'player', 10, 0);
    expect(collider.solid).toBe(false);
    expect(withinCollisionRadius(collider, player, 12)).toBe(true);
  });

  it('uses a shared floor rule and circle radius for interaction queries', () => {
    const player = body('p', 'player', 0, 0, 2);
    const pickup = body('pickup', 'npc', 20, 0, 2);
    expect(withinCollisionRadius(player, pickup, 20)).toBe(true);
    expect(withinCollisionRadius(player, { ...pickup, z: 4 }, 20)).toBe(false);
  });

  it('finds contacts through the broad phase even when bodies span cells', () => {
    const world = new CollisionWorld();
    const a = body('a', 'vehicle', 62, 0, 0, 18), b = body('b', 'vehicle', 90, 0, 0, 18);
    world.rebuild([a.object, b.object]);
    const contacts = world.contacts((a, b) => a.kind === 'vehicle' && b.kind === 'vehicle');
    expect(contacts).toHaveLength(1);
    expect(contacts[0]!.depth).toBe(8);
    expect(world.queryCircle({ x: 44, y: 0, z: 0, radius: 1, kinds: ['vehicle'] }).map(item => item.id)).toContain('a');
  });

  it('filters contacts by floor and collision masks', () => {
    const a = body('a', 'vehicle', 0, 0, 0, 18);
    const b = { ...body('b', 'player', 10, 0, 2, 10), mask: COLLISION_CATEGORY.vehicle };
    expect(circleContact(a, b)).toEqual([]);
    expect(circleContact(a, { ...b, z: 0 })).toHaveLength(1);
    expect(circleContact(a, { ...b, z: 0, mask: 0 })).toEqual([]);
  });
});
