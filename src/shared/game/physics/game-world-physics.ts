import { worldToPhysics } from '../../domain/world/world';
import { CollisionWorld, type CollisionBody, type CollisionContact, type CollisionObject, type CollisionQuery, type CollisionStart } from './collision-world';
import { createPhysicsRuntime, PhysicsWorld, type PhysicsFixture, type PhysicsRayCastHit } from '../../engine/physics-world';
import type { PhysicsBody, PhysicsRuntime } from '../../engine/physics-world';
import type { NpcState, PlayerState, TrafficState } from '../../protocol/types';
import { addMapWallBodies } from './map-collision';
import { createNpcPhysicsBody } from './npc-bodies';
import { createPlayerPhysicsBody } from './player-bodies';
import { createVehicleBody } from './body-factory';
import { installVehicleContactHandling } from './vehicle-contact-handler';
import { installMapContactHandling } from './map-contact-handler';
import type { GameMap } from '../../engine/loader/map-parser';
import type { StaticMapObject } from '../gameobjects/map-object';
import type { VehicleCatalog } from '../../domain/vehicles/vehicle-catalog';

export class GameWorldPhysics {
  private readonly physicsRuntime: PhysicsRuntime;
  private readonly collisionWorld: CollisionWorld;
  readonly vehicleStepVelocities = new Map<number, { x: number; y: number }>();
  readonly physicsWorld: PhysicsWorld<CollisionObject, CollisionBody, CollisionQuery, CollisionContact, CollisionStart>;

  constructor(localId?: string) {
    this.physicsRuntime = createPhysicsRuntime({ gravity: { x: 0, y: 0 }, allowSleep: true, continuousPhysics: true });
    this.collisionWorld = new CollisionWorld();
    this.physicsWorld = new PhysicsWorld({
      sync: objects => this.collisionWorld.rebuild(objects),
      queryCircle: query => this.collisionWorld.queryCircle(query),
      contacts: filter => this.collisionWorld.contacts(filter),
      resolveBlocking: (dt, starts, mapBlockedBodies) => this.collisionWorld.resolveBlocking(dt, starts, mapBlockedBodies),
    }, {
      step: dt => this.physicsRuntime.step(dt, 10, 10),
      rayCast: (start, end, accept) => {
        let fraction = 1;
        this.physicsRuntime.rayCast({ x: worldToPhysics(start.x), y: -worldToPhysics(start.y) }, { x: worldToPhysics(end.x), y: -worldToPhysics(end.y) }, (fixture, _point, _normal, value) => {
          if (fixture.getBody().getType() !== 'static') return -1;
          if (accept && !accept(fixture)) return -1;
          fraction = Math.min(fraction, value);
          return value;
        });
        return fraction;
      },
    });
    installVehicleContactHandling(this.physicsRuntime, {
      localId,
      incomingVelocities: this.vehicleStepVelocities,
      recordMapContact: contact => this.physicsWorld.recordMapContact(contact),
    });
    installMapContactHandling(this.physicsRuntime, bodyId => this.physicsWorld.recordMapBlockedBody(bodyId));
  }

  /** Return the nearest accepted static fixture as well as its fraction. The
   * ordinary number-only raycast remains available to weapon code; projectile
   * dispatch needs the authored wall metadata carried by this fixture. */
  rayCastHit(start: { x: number; y: number }, end: { x: number; y: number }, accept?: (fixture: unknown) => boolean): PhysicsRayCastHit | undefined {
    let hit: PhysicsRayCastHit | undefined;
    this.physicsRuntime.rayCast({ x: worldToPhysics(start.x), y: -worldToPhysics(start.y) }, { x: worldToPhysics(end.x), y: -worldToPhysics(end.y) }, (fixture: PhysicsFixture, point, normal, fraction) => {
      if (fixture.getBody().getType() !== 'static') return -1;
      if (accept && !accept(fixture)) return -1;
      if (!hit || fraction < hit.fraction) hit = { fixture, point, normal, fraction };
      return fraction;
    });
    return hit;
  }

  addMapWallBodies(level: GameMap, mapObjects: Iterable<StaticMapObject>) {
    addMapWallBodies(level, this.physicsRuntime, mapObjects);
  }

  createPlayerBody(player: PlayerState, collisionLayer: number) {
    return createPlayerPhysicsBody(this.physicsRuntime, player, collisionLayer);
  }

  createNpcBody(npc: NpcState, collisionLayer: number) {
    return createNpcPhysicsBody(this.physicsRuntime, npc, collisionLayer);
  }

  createVehicleBody(vehicle: TrafficState, catalog: VehicleCatalog, collisionLayer: (state: { z: number; collisionLayer?: number | undefined }) => number) {
    return createVehicleBody(vehicle, this.physicsRuntime, catalog, collisionLayer);
  }

  destroyBody(body: PhysicsBody) {
    this.physicsRuntime.destroyBody(body);
  }
}
