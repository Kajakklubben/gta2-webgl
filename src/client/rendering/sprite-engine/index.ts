import * as THREE from 'three';
import type { GameObjectDrawCommand } from '../../../shared/game/gameobjects/gameobject';
import type { Style } from '../../../shared/engine/loader/models/style';
import { SpriteAssetRegistry } from './asset-registry';
import { SpriteDefinitionCatalog, type SpriteDefinitionSummary } from './definition-catalog';
import { ThreeSpriteRenderer } from './three-renderer';
export { SpriteLibrary } from './library';
export { spriteFrameBlend } from './frame-interpolation';
export { selectSpriteFrames } from './frame-interpolation';
export type { SpriteFrameBlend } from './frame-interpolation';
export type { SpriteDefinitionSummary } from './definition-catalog';

/**
 * Public sprite-engine entry point. Asset lookup, palettes, DELS composition,
 * animation, policy, and the Three.js backend are intentionally hidden behind
 * this class so render callers cannot grow atlas-specific branches again.
 */
export class SpriteEngine {
  private readonly registry: SpriteAssetRegistry;
  private readonly definitions: SpriteDefinitionCatalog;
  private readonly renderer: ThreeSpriteRenderer;

  constructor(scene: THREE.Scene, style: Style) {
    this.registry = new SpriteAssetRegistry(style);
    this.definitions = new SpriteDefinitionCatalog(style);
    this.renderer = new ThreeSpriteRenderer(scene, this.registry);
  }

  setFrameInterpolation(enabled: boolean) {
    this.renderer.setFrameInterpolation(enabled);
  }

  getRenderOrder(commandKey: string) {
    return this.renderer.getRenderOrder(commandKey);
  }

  render(commands: readonly GameObjectDrawCommand[], now: number) {
    this.renderer.render(commands, now);
  }

  /** Source-definition catalog used by scenario editors and debug views. */
  listDefinitions(): readonly SpriteDefinitionSummary[] {
    return this.definitions.list();
  }

  dispose() {
    this.renderer.dispose();
  }
}
