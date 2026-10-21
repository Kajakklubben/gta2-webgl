import { worldToPhysics } from '../../domain/world/world';
import { CollisionWorld, type CollisionBody, type CollisionContact, type CollisionObject, type CollisionQuery, type CollisionStart } from './collision-world';
import { createPhysicsRuntime, PhysicsWorld } from '../../engine/physics-world';
import type { PhysicsBody, PhysicsRuntime } from '../../engine/physics-world';
import type { NpcState, PlayerState, TrafficState } from '../../protocol/types';
import { addMapWallBodies } from './map-collision';
import { createNpcPhysicsBody } from './npc-bodies';
import { createPlayerPhysicsBody } from './player-bodies';
import { createVehicleBody } from './body-factory';
import { installVehicleContactHandling } from './vehicle-contact-handler';
import type { GameMap } from '../../loader/map-parser';
import type { StaticMapObject } from '../gameobjects/map-object';
import type { VehicleCatalog } from '../../domain/vehicles/vehicle-catalog';

export class GameWorldPhysics {
  private readonly physicsRuntime: PhysicsRuntime;
  private readonly collisionWorld: CollisionWorld;
  readonly bodies = new Map<string, PhysicsBody>();
  readonly vehicleBodies = new Map<number, PhysicsBody>();
  readonly npcBodies = new Map<number, PhysicsBody>();
  readonly vehicleStepVelocities = new Map<number, { x: number; y: number }>();
  readonly physicsWorld: PhysicsWorld<CollisionObject, CollisionBody, CollisionQuery, CollisionContact, CollisionStart>;

  constructor(localId?: string) {
    this.physicsRuntime = createPhysicsRuntime({ gravity: { x: 0, y: 0 }, allowSleep: true, continuousPhysics: true });
    this.collisionWorld = new CollisionWorld();
    this.physicsWorld = new PhysicsWorld({
      sync: objects => this.collisionWorld.rebuild(objects),
      queryCircle: query => this.collisionWorld.queryCircle(query),
      contacts: filter => this.collisionWorld.contacts(filter),
      resolveBlocking: (dt, starts) => this.collisionWorld.resolveBlocking(dt, starts),
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
