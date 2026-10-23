import type { MapObjectDefinition } from '../../engine/loader/models/style';
import { COLLISION_CATEGORY } from '../../domain/physics/collision-rules';
import type { GameObjectSprite, GameObjectUpdateContext } from './gameobject';
import type { MapObjectPlacement } from '../../domain/physics/map-object-placement';
import { StaticGameObject } from './stateful';

export interface StaticMapObjectState {
  readonly id: number;
  readonly model: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotation: number;
  readonly collisionLayer: number;
  readonly grounded: boolean;
}

/** The game-object representation of an authored GMP MOBJ record. Static map
 * objects own their placement, sprite metadata, and collision footprint; the
 * map backend only adapts their collider into its native static world. */
export class StaticMapObject extends StaticGameObject<StaticMapObjectState, number> {
  private sourceAnimationFrame = 0;
  private sourceAnimationCounter = 0;
  private sourceAnimationTimer: number;
  private sourceAnimationFinished = false;
  private presentationModel: number;

  constructor(state: StaticMapObjectState, readonly definition: MapObjectDefinition) {
    super(state.id, state, 'map-object');
    // ObjectDefinition_74 defaults field_65 to 99 before an override is
    // applied. Preserve that source default for custom animated definitions.
    this.sourceAnimationTimer = definition.animationTimer ?? 99;
    this.presentationModel = state.model;
    this.collision = {
      shape: { type: 'box', width: definition.width, height: definition.height },
      solid: definition.blocksMovement && definition.width > 0 && definition.height > 0,
      restitution: 0,
      friction: 0,
      fixedRotation: true,
      category: COLLISION_CATEGORY['map-object'],
      mask: COLLISION_CATEGORY.player | COLLISION_CATEGORY.vehicle | COLLISION_CATEGORY.npc | COLLISION_CATEGORY.projectile,
    };
  }

  override update(_context: GameObjectUpdateContext) {
    // Object_2C::UpdateAnimation_5257D0 advances the frame counter first,
    // then the OBJI frame, and finally consumes one finite animation timer.
    // MOBJ placement and the authored collision shape stay fixed while the
    // source definition changes presentation.
    if (this.sourceAnimationFinished || this.definition.behavior !== 'animated' || this.definition.spriteCount <= 1) return;
    this.sourceAnimationCounter++;
    if (this.sourceAnimationCounter < Math.max(1, this.definition.frameTicks)) return;
    this.sourceAnimationCounter = 0;
    this.sourceAnimationFrame++;
    if (this.sourceAnimationFrame < this.definition.spriteCount) return;
    this.sourceAnimationFrame = 0;
    if (this.sourceAnimationTimer > 0) this.sourceAnimationTimer--;
    if (this.sourceAnimationTimer !== 0 || this.definition.nextDefinition === 0) return;
    this.presentationModel = this.definition.nextDefinition;
    this.sourceAnimationFinished = true;
  }

  override getSprite(_now: number): GameObjectSprite {
    const sourceAnimated = this.definition.behavior === 'animated' && !this.sourceAnimationFinished;
    const sprite: GameObjectSprite = {
      atlas: 'objects',
      definition: { bank: 'map-object', sourceId: this.presentationModel },
      model: this.presentationModel,
      placement: this.placement,
      ...(sourceAnimated ? { frame: this.sourceAnimationFrame } : {}),
      presentation: { priority: this.definition.drawLayer, band: 'object' },
      blending: (this.definition.spriteFlags & 3) === 2 ? 'additive' : 'normal',
      alphaTest: .01,
      animationKey: `map-object:${this.id}:${this.presentationModel}`,
    };
    const animated = sourceAnimated ? sprite : { ...sprite, frame: 0 };
    if (!this.definition.hasShadows) return animated;
    return { ...animated, shadow: { opacity: .24, scale: .7, offsetX: 3, offsetY: 3 } };
  }
}

export function createStaticMapObject(id: number, placement: MapObjectPlacement, rotation: number, model: number, definition: MapObjectDefinition) {
  return new StaticMapObject({
    id,
    model,
    ...placement,
    rotation,
  }, definition);
}
