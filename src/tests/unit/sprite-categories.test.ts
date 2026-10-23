import { describe, expect, it } from 'vitest';
import { cars, effects, pickups, pedestrians, weapons } from '../../client/rendering/sprite';
import { renderPolicy } from '../../client/rendering/sprite-engine/render-policy';

describe('rendering sprite categories', () => {
  it('keeps car light DELS mapping behind the car category', () => {
    expect(cars.lightDeltaIndices({ infoFlags: { emergencyLights: true, roofLights: false, rearEmergencyLights: false } } as never, {
      headlights: true,
      brakeLights: true,
      emergencyLights: true,
    })).toEqual([6, 22, 5, 21, 15, 16, 17, 18]);
  });

  it('resolves source effect sequences through the effects category', () => {
    expect(effects.sequence('car-fire-small')).toMatchObject({ start: 401, count: 8, frames: [401, 402, 403, 404, 405, 406, 407] });
    expect(effects.EXPLOSION_RANGES.large).toEqual({ start: 361, count: 16 });
    expect(effects.sequence('water-splash')).toMatchObject({ start: 437, count: 14 });
    expect(effects.sequence('water-splash').frames?.slice(0, 3)).toEqual([437, 438, 439]);
    expect(effects.sequence('electric-arc')).toMatchObject({ start: 480, count: 4, frames: [480, 481, 482, 483] });
  });

  it('exposes weapon and pickup ranges without leaking source tables to callers', () => {
    expect(weapons.sourceModelRange(128)).toEqual({ start: 540, count: 1 });
    expect(pickups.rangeForWeapon(0)).toEqual({ start: 18, count: 8 });
    expect(pickups.spriteFor({ weapon: 0, x: 10, y: 20, z: 1, active: true })).toMatchObject({ model: 18, frameCount: 8, presentation: { band: 'object' } });
  });

  it('provides stable pedestrian definitions', () => {
    expect(pedestrians.definition('police')).toEqual({ bank: 'ped', sourceId: 2 });
  });

  it('renders NPC bodies below cars while keeping the player layer above them', () => {
    const pedestrian = { atlas: 'player', placement: { x: 0, y: 0, z: 0, rotation: 0 } } as const;
    const vehicle = { atlas: 'cars', placement: { x: 0, y: 0, z: 0, rotation: 0 } } as const;
    expect(renderPolicy(pedestrian, { kind: 'npc', id: 'npc-1', key: 'npc:npc-1', state: {}, sprite: pedestrian }).presentation.priority)
      .toBeLessThan(renderPolicy(vehicle, { kind: 'vehicle', id: 1, key: 'vehicle:1', state: {}, sprite: vehicle }).presentation.priority);
    expect(renderPolicy(pedestrian, { kind: 'player', id: 'player-1', key: 'player:player-1', state: {}, sprite: pedestrian }).presentation.priority)
      .toBeGreaterThan(renderPolicy(vehicle, { kind: 'vehicle', id: 1, key: 'vehicle:1', state: {}, sprite: vehicle }).presentation.priority);
  });
});
