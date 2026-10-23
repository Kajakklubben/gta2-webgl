import { describe, expect, it } from 'vitest';
import { comparePresentationOrder } from '../../shared/engine/presentation-order';
import { GTA2_PRESENTATION_PRIORITIES, resolveGta2Presentation } from '../../shared/domain/world/presentation-order';

describe('semantic presentation order', () => {
  it('orders map and local phases in every authored map level', () => {
    const key = (mapLevel: number, band: 'map' | 'underlay' | 'object' | 'overlay') => ({ mapLevel, band, priority: 0, depth: 100, sequence: 0 });
    expect(comparePresentationOrder(key(4, 'map'), key(4, 'underlay'))).toBeLessThan(0);
    expect(comparePresentationOrder(key(4, 'underlay'), key(4, 'object'))).toBeLessThan(0);
    expect(comparePresentationOrder(key(4, 'object'), key(4, 'overlay'))).toBeLessThan(0);
    expect(comparePresentationOrder(key(4, 'overlay'), key(5, 'map'))).toBeLessThan(0);
  });

  it('orders semantic priorities after the local phase', () => {
    const key = (priority: number, band: 'object' | 'overlay') => ({ mapLevel: 4, band, priority, depth: 100, sequence: 0 });
    expect(comparePresentationOrder(key(10, 'object'), key(20, 'object'))).toBeLessThan(0);
    expect(comparePresentationOrder(key(100, 'object'), key(0, 'overlay'))).toBeLessThan(0);
  });

  it('resolves GTA2 defaults into map-local semantic slots', () => {
    expect(resolveGta2Presentation({ kind: 'map', mapLevel: 3 })).toMatchObject({ mapLevel: 3, band: 'map', priority: 0 });
    expect(resolveGta2Presentation({ kind: 'npc', mapLevel: 3 })).toMatchObject({ mapLevel: 3, band: 'object', priority: GTA2_PRESENTATION_PRIORITIES.npc });
    expect(resolveGta2Presentation({ kind: 'vehicle', mapLevel: 3 })).toMatchObject({ mapLevel: 3, band: 'object', priority: GTA2_PRESENTATION_PRIORITIES.vehicle });
    expect(resolveGta2Presentation({ kind: 'hazard', mapLevel: 3, animation: 'skid' })).toMatchObject({ mapLevel: 3, band: 'underlay', priority: GTA2_PRESENTATION_PRIORITIES.ground });
    expect(resolveGta2Presentation({ kind: 'projectile', mapLevel: 3, sourceSequence: 'rocket-trail' })).toMatchObject({ mapLevel: 3, band: 'overlay', priority: GTA2_PRESENTATION_PRIORITIES.effect });
  });

  it('preserves explicit map levels, bands, and priorities', () => {
    expect(resolveGta2Presentation({ kind: 'map-object', mapLevel: 3, slot: { mapLevel: 2, priority: 10, band: 'object' } })).toMatchObject({ mapLevel: 2, band: 'object', priority: 10 });
    expect(resolveGta2Presentation({ kind: 'player', mapLevel: 3, slot: { band: 'underlay' } })).toMatchObject({ mapLevel: 3, band: 'underlay', priority: GTA2_PRESENTATION_PRIORITIES.player });
  });
});
