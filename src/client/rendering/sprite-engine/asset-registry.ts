import type { GameObjectDrawCommand, GameObjectSpriteLayer, SpriteAnimation } from '../../../shared/game/gameobjects/gameobject';
import type { PedSpriteSet, Style } from '../../../shared/engine/loader/models/style';
import type { Pixels } from '../../../shared/engine/assets/pixels';
import type { ResolvedSpriteAsset, SpriteAssetResolver } from '../../../shared/engine/assets/sprites';
import { CarDeltaComposer } from './delta-composer';
import { PaletteResolver } from './palette-resolver';
import { sourceModelRange, sourceSequence } from './source-catalog';

/**
 * The only module that converts a source sprite request into decoded Pixels.
 * It intentionally understands both the legacy GameObjectSprite fields and
 * the newer source definition reference, allowing gameplay callers to migrate
 * without duplicating file-offset logic.
 */
export class SpriteAssetRegistry implements SpriteAssetResolver<GameObjectSpriteLayer, GameObjectDrawCommand> {
  readonly palettes = new PaletteResolver();
  readonly deltas: CarDeltaComposer;

  constructor(readonly style: Style) {
    this.deltas = new CarDeltaComposer(style);
  }

  private model(layer: GameObjectSpriteLayer) {
    return layer.definition?.sourceId ?? layer.model;
  }

  private playerFrames(animation: SpriteAnimation | undefined, player: PedSpriteSet): Pixels[] {
    switch (animation) {
      case 'armedRunning': return player.armedRunning;
      case 'armedWalking': return player.armedWalking;
      case 'walking': return player.walking;
      case 'jumping': return player.jumping;
      case 'falling':
      case 'knockdown': return player.falling;
      case 'dead': return player.dead;
      case 'lying': return player.lying;
      case 'lyingReverse': return player.lyingReverse;
      case 'electrocuted': return player.electrocuted;
      case 'entering': return player.entering;
      case 'exiting': return player.exiting;
      case 'pulledOut': return player.pulledOut;
      case 'firing': return player.firing;
      case 'throwing': return player.throwing;
      case 'throwingIdle': return player.throwingIdle;
      case 'running': return player.running;
      case 'idle':
      default:
        return player.idleFrames?.length ? player.idleFrames : [player.idle];
    }
  }

  private codeObjectModel(layer: GameObjectSpriteLayer) {
    const sourceModel = layer.sourceModel ?? (layer.definition?.bank === 'code-object' ? layer.definition.sourceId : undefined);
    const namedSequence = layer.sourceSequence === undefined ? undefined : sourceSequence(layer.sourceSequence);
    const sourceRange = sourceModel === undefined ? undefined : sourceModelRange(sourceModel);
    return {
      model: layer.model ?? namedSequence?.start ?? sourceRange?.start ?? sourceModel,
      count: layer.frameCount ?? namedSequence?.count ?? sourceRange?.count ?? 1,
      frames: namedSequence?.frames,
    };
  }

  private codeObjectFrame(model: number, remap: number | undefined) {
    if (remap !== undefined) {
      const remapped = this.style.sprites.codeObjectRemaps[remap]?.[model]?.[0];
      if (remapped) return remapped;
    }
    return this.style.sprites.codeObjects[model]?.[0];
  }

  private playerSet(layer: GameObjectSpriteLayer, command: GameObjectDrawCommand) {
    const pedKind = command.kind === 'npc' ? (command.state as { kind?: string }).kind : undefined;
    const palette = this.palettes.resolve(layer, command);
    const pedRemap = layer.pedRemap ?? (palette?.area === 'ped-remaps' ? palette.index : undefined);
    if (pedKind === 'police') return this.style.sprites.cop;
    if (pedKind === 'civilian') return this.style.sprites.civilianRemaps?.[pedRemap ?? -1] ?? this.style.sprites.civilian;
    return this.style.sprites.player;
  }

  private resolveFrames(layer: GameObjectSpriteLayer, command: GameObjectDrawCommand): Pixels[] {
    if (layer.atlas === 'player') return this.playerFrames(layer.animation, this.playerSet(layer, command));

    if (layer.atlas === 'cars') {
      const model = this.model(layer);
      if (model === undefined) return [];
      const carLayer = layer.model === undefined ? { ...layer, model } : layer;
      const palette = this.palettes.resolve(layer, command);
      const paintIndex = palette?.area === 'car-remaps' ? palette.index : layer.variantIndex;
      const composedLayer = palette?.area === 'car-remaps'
        ? { ...carLayer, variant: 'paint' as const, ...(paintIndex === undefined ? {} : { variantIndex: paintIndex }) }
        : carLayer;
      const composed = this.deltas.compose(composedLayer);
      if (composed) return [composed];
      if (layer.variant === 'damage') return this.style.sprites.carDamage[model] ?? this.style.sprites.cars[model] ?? [];
      if (layer.variant === 'paint' || palette?.area === 'car-remaps') {
        const paints = this.style.sprites.carPaints[model] ?? this.style.sprites.cars[model] ?? [];
        if (paintIndex === undefined) return paints;
        const selected = paints[((paintIndex % Math.max(1, paints.length)) + Math.max(1, paints.length)) % Math.max(1, paints.length)];
        return selected ? [selected] : paints;
      }
      return this.style.sprites.cars[model] ?? [];
    }

    if (layer.atlas === 'objects') {
      const model = this.model(layer);
      return model === undefined ? [] : this.style.sprites.objects[model] ?? [];
    }

    const code = this.codeObjectModel(layer);
    const palette = this.palettes.resolve(layer, command);
    const remap = layer.codeObjectRemap ?? (palette?.area === 'code-object-remaps' ? palette.index : undefined);
    if (code.frames?.length) return code.frames.map(model => this.codeObjectFrame(model, remap)).filter((frame): frame is Pixels => !!frame);
    if (layer.modelSequence?.length) return layer.modelSequence.map(model => this.codeObjectFrame(model, remap)).filter((frame): frame is Pixels => !!frame);
    if (code.model === undefined) return [];
    return Array.from({ length: code.count }, (_, index) => this.codeObjectFrame(code.model! + index, remap)).filter((frame): frame is Pixels => !!frame);
  }

  resolve(layer: GameObjectSpriteLayer, command: GameObjectDrawCommand): ResolvedSpriteAsset {
    const palette = this.palettes.resolve(layer, command);
    const definition = layer.definition ? `${layer.definition.bank}:${layer.definition.sourceId}` : `${layer.atlas}:${layer.model ?? ''}`;
    const paletteKey = palette ? `${palette.area}:${palette.index}` : 'default';
    return { frames: this.resolveFrames(layer, command), paletteKey, sourceKey: definition };
  }

  clear() {
    this.deltas.clear();
  }
}
