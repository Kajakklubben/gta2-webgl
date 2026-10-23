import type { GameObjectDrawCommand, GameObjectSpriteLayer } from '../../../shared/game/gameobjects/gameobject';
import { renderPolicy } from './render-policy';
import { resolveRenderDepth } from '../spatial-depth';

export interface SpriteRenderJob {
  readonly command: GameObjectDrawCommand;
  readonly sprite: GameObjectSpriteLayer;
  readonly key: string;
  readonly shadow: boolean;
  readonly sequence: number;
  /** Concrete backend order, including the spatial depth tie-break. */
  readonly renderOrder: number;
}

export function spriteRenderOrder(command: GameObjectDrawCommand, sprite: GameObjectSpriteLayer, sequence = 0, mapLevelOverride?: number) {
  return resolveRenderDepth(command, sprite, sequence, mapLevelOverride).sortKey;
}

function childPlacement(parent: GameObjectSpriteLayer, child: GameObjectSpriteLayer, attachment: NonNullable<GameObjectSpriteLayer['attachments']>[number]): GameObjectSpriteLayer {
  const rotation = parent.placement.rotation;
  const inheritRotation = attachment.inheritRotation ?? true;
  const angle = inheritRotation ? rotation : 0;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const offsetX = attachment.offsetX ?? 0, offsetY = attachment.offsetY ?? 0;
  return {
    ...child,
    placement: {
      ...child.placement,
      x: parent.placement.x + cos * offsetX - sin * offsetY,
      y: parent.placement.y + sin * offsetX + cos * offsetY,
      z: parent.placement.z + (attachment.offsetZ ?? 0),
      rotation: inheritRotation ? rotation + (attachment.rotationOffset ?? 0) : child.placement.rotation + (attachment.rotationOffset ?? 0),
    },
  };
}

function addLayer(
  jobs: SpriteRenderJob[],
  command: GameObjectDrawCommand,
  sprite: GameObjectSpriteLayer,
  key: string,
  sequence: { value: number },
) {
  const shadow = sprite.shadow;
  if (shadow) {
    const policy = renderPolicy(sprite, command);
    const { shadow: _shadow, attachments: _attachments, ...visibleLayer } = sprite;
    const shadowLayer: GameObjectSpriteLayer = {
      ...visibleLayer,
      placement: {
        ...sprite.placement,
        x: sprite.placement.x + (shadow.offsetX ?? 0),
        y: sprite.placement.y + (shadow.offsetY ?? 0),
      },
      opacity: (sprite.opacity ?? 1) * (shadow.opacity ?? .3),
      scale: (sprite.scale ?? 1) * (shadow.scale ?? .6),
      presentation: { band: 'underlay', elevation: -.35 },
    };
    const shadowSequence = sequence.value++;
    jobs.push({ command, sprite: shadowLayer, key: `${key}:shadow`, shadow: true, sequence: shadowSequence, renderOrder: spriteRenderOrder(command, shadowLayer, shadowSequence, Math.min(policy.presentation.mapLevel, 0) - 1) });
  }
  const { attachments, ...renderedSprite } = sprite;
  const renderedSequence = sequence.value++;
  jobs.push({ command, sprite: renderedSprite, key, shadow: false, sequence: renderedSequence, renderOrder: spriteRenderOrder(command, renderedSprite, renderedSequence) });
  for (const [index, attachment] of (attachments ?? []).entries()) {
    const child = childPlacement(sprite, attachment.sprite, attachment);
    addLayer(jobs, command, child, `${key}:attachment:${index}`, sequence);
  }
}

/** Flatten and sort all sprite layers using one source-style render policy. */
export function buildRenderQueue(commands: readonly GameObjectDrawCommand[]): SpriteRenderJob[] {
  const jobs: SpriteRenderJob[] = [];
  const sequence = { value: 0 };
  for (const command of commands) {
    if (command.sprite.beam || (command.sprite.opacity ?? 1) <= 0) continue;
    addLayer(jobs, command, command.sprite, command.key, sequence);
    for (const [index, layer] of (command.sprite.layers ?? []).entries()) {
      addLayer(jobs, command, layer, `${command.key}:layer:${index}`, sequence);
    }
  }
  return jobs.sort((left, right) => {
    return left.renderOrder - right.renderOrder;
  });
}
