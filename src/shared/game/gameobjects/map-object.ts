import type { MapObjectDefinition } from '../../loader/models/style';
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
  constructor(state: StaticMapObjectState, readonly definition: MapObjectDefinition) {
    super(state.id, state, 'map-object');
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
    // Authored MOBJ records are fixed in the map. Animated definitions change
    // their presentation frame, not their world pose or collision footprint.
  }

  override getSprite(_now: number): GameObjectSprite {
    const sprite: GameObjectSprite = {
      atlas: 'objects',
      definition: { bank: 'map-object', sourceId: this.mutableState.model },
      model: this.mutableState.model,
      placement: this.placement,
      frameTicks: this.definition.frameTicks,
      renderDepth: { band: 'map', sourceLayer: this.definition.drawLayer },
      blending: (this.definition.spriteFlags & 3) === 2 ? 'additive' : 'normal',
      depthTest: true,
      depthWrite: false,
      alphaTest: .01,
      animationKey: `map-object:${this.id}:${this.mutableState.model}`,
    };
    const animated = this.definition.behavior === 'animated' ? sprite : { ...sprite, frame: 0 };
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
