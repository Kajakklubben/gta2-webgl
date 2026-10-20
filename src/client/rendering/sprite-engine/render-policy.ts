import type { GameObjectDrawCommand, GameObjectSpriteLayer } from '../../../shared/game/gameobjects/gameobject';

export interface SpriteRenderPolicy {
  readonly renderOrder: number;
  readonly depthTest: boolean;
  readonly depthWrite: boolean;
  readonly alphaTest: number;
}

/** Source default draw layers, with explicit command values taking priority. */
export function renderPolicy(sprite: GameObjectSpriteLayer, _command?: GameObjectDrawCommand): SpriteRenderPolicy {
  let defaultOrder = 2;
  if (sprite.atlas === 'cars') defaultOrder = 15;
  else if (sprite.atlas === 'player') defaultOrder = 23;
  else if (sprite.atlas === 'codeObjects') defaultOrder = 2;
  // NPCs share the pedestrian atlas with the player, but source-style vehicle
  // sprites occlude them. Keep the player presentation layer unchanged while
  // placing NPC bodies behind cars by their draw-command kind.
  if (_command?.kind === 'npc' && sprite.atlas === 'player') defaultOrder = 14;
  return {
    renderOrder: sprite.renderOrder ?? defaultOrder,
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
