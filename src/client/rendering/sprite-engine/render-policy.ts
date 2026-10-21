import type { GameObjectDrawCommand, GameObjectSpriteLayer } from '../../../shared/game/gameobjects/gameobject';
import type { SpatialRenderBand } from '../../../shared/engine/spatial-depth';

export interface SpriteRenderPolicy {
  readonly renderOrder: number;
  readonly depthTest: boolean;
  readonly depthWrite: boolean;
  readonly alphaTest: number;
}

const SOURCE_EFFECT_BANDS: Readonly<Record<string, number>> = {
  'rocket-trail': 18,
  'electric-arc': 18,
  'fire-trail': 7,
  'water-splash': 5,
  'blood-burst': 8,
  'impact-burst': 8,
  'explosion-small': 20,
  'explosion-large': 20,
  'car-fire-small': 16,
  'car-fire-large': 16,
  'car-fire-wreck': 16,
  'ped-fire': 6,
};

function defaultBand(command: GameObjectDrawCommand): SpatialRenderBand {
  if (command.kind === 'map-object') return 'map';
  if (command.kind === 'vehicle') return 'vehicle';
  if (command.kind === 'player' || command.kind === 'npc') return 'actor';
  if (command.kind === 'pickup') return 'ground';
  if (command.kind === 'projectile' || command.kind === 'hazard') return 'effect';
  return 'ground';
}

/** Resolve semantic presentation intent to an internal renderer pass. */
export function renderPass(command: GameObjectDrawCommand, sprite: GameObjectSpriteLayer): number {
  const hint = sprite.renderDepth;
  if (hint?.sourceLayer !== undefined) return hint.sourceLayer;
  if (hint?.relation === 'behind-vehicle') return 13;
  if (hint?.relation === 'above-vehicle') return 16;

  const sourceSequence = sprite.sourceSequence;
  if (sourceSequence !== undefined) {
    const sourcePass = SOURCE_EFFECT_BANDS[sourceSequence];
    if (sourcePass !== undefined) return sourcePass;
  }

  switch (hint?.band ?? defaultBand(command)) {
    case 'map': return 0;
    case 'ground': return command.kind === 'pickup' ? 4 : 2;
    case 'actor': return command.kind === 'npc' ? 14 : 23;
    case 'vehicle': return 15;
    case 'effect': {
      if (command.kind === 'hazard' && sprite.animation === 'fire') return 6;
      if (command.kind === 'hazard' && sprite.animation === 'water') return 5;
      if (command.kind === 'hazard' && (sprite.animation === 'skid' || sprite.animation === 'slick' || sprite.animation === 'mine')) return 2;
      return 18;
    }
    case 'overlay': return 50;
  }
}

/** Source default draw layers, with semantic hints taking priority. */
export function renderPolicy(sprite: GameObjectSpriteLayer, _command?: GameObjectDrawCommand): SpriteRenderPolicy {
  return {
    renderOrder: _command ? renderPass(_command, sprite) : 2,
    depthTest: sprite.depthTest ?? true,
    depthWrite: sprite.depthWrite ?? false,
    alphaTest: sprite.alphaTest ?? .01,
  };
}

export function fallbackSize(command: GameObjectDrawCommand) {
  if (command.kind === 'vehicle') return { width: 34, height: 66 };
  if (command.kind === 'player' || command.kind === 'npc') return { width: 22, height: 32 };
  return { width: 22, height: 22 };
}

export function fallbackColor(command: GameObjectDrawCommand, sprite: GameObjectSpriteLayer) {
  if (sprite.fallbackColor !== undefined) return sprite.fallbackColor;
  if (command.kind === 'vehicle') return (command.state as { color?: number }).color ?? 0x6d7888;
  if (command.kind === 'npc') return (command.state as { kind?: string }).kind === 'police' ? 0x77aaff : 0xffffff;
  return 0x55d6ff;
}
