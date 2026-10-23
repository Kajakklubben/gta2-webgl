import type { GameObjectDrawCommand, GameObjectSpriteLayer } from '../../../shared/game/gameobjects/gameobject';
import { resolveGta2Presentation, type ResolvedGta2PresentationSlot } from '../../../shared/domain/world/presentation-order';
import { mapLevelFromGameObject } from '../spatial-depth';

export interface SpriteRenderPolicy {
  readonly presentation: ResolvedGta2PresentationSlot;
  readonly alphaTest: number;
}

/** Resolve semantic GTA2 presentation before the Three.js backend runs. */
export function presentationSlot(command: GameObjectDrawCommand, sprite: GameObjectSpriteLayer) {
  return resolveGta2Presentation({
    kind: command.kind,
    mapLevel: mapLevelFromGameObject(command, sprite),
    animation: sprite.animation,
    sourceSequence: sprite.sourceSequence,
    slot: sprite.presentation,
  });
}

/** Resolve backend material policy without deciding GTA2 object ordering. */
export function renderPolicy(sprite: GameObjectSpriteLayer, command: GameObjectDrawCommand): SpriteRenderPolicy {
  return {
    presentation: presentationSlot(command, sprite),
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
