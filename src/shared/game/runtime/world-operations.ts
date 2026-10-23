import type { Input, PlayerState, TrafficState } from '../../protocol/types';
import { PlayerObject } from '../gameobjects/player';
import { NpcObject } from '../gameobjects/npc';
import { VehicleObject } from '../gameobjects/vehicle';
import { directionFromRotation } from '../../domain/physics/motion-vector';
import { worldToPhysics, WORLD } from '../../domain/world/world';
import { playerSnapshotCodec } from '../snapshot-codecs';
import { occupantForPlayer } from '../../domain/vehicles/vehicle-occupancy';
import type { CollisionContact } from '../physics/collision-world';
import { isLethalPedestrianImpact, sourcePedestrianImpact } from '../../domain/physics/pedestrian-impact';
export { raiseWanted, syncBlockedBodies } from './world-operations-physics';
export { emit, floor, input, spawnPoint, updateNpcJumps } from './world-operations-basic';

export function addPlayer(host: any, id: string, state?: PlayerState) {
    const spawn = host.spawnPoint();
    let player: PlayerState;
    if (state) player = playerSnapshotCodec.fromSnapshot(state);
    else player = { id, ...spawn, rotation: 0, vx: 0, vy: 0, movement: { speed: 0, turnSpeed: 0, moveDirection: 0 as const }, name: 'Player', color: 0x65a9e8, score: 0, kills: 0, deaths: 0, ready: true, armor: 0, money: 0, wanted: 0, team: 0, combat: host.weaponSystem.createCombat() };
    if (!state || player.collisionLayer === undefined) host.applySurface(player, host.surfaceFor(player));
    if (!player.movement) {
      const forward = directionFromRotation(player.rotation), signedSpeed = player.vx * forward.x + player.vy * forward.y;
      let moveDirection: -1 | 0 | 1 = 0;
      if (signedSpeed < -1e-6) moveDirection = -1;
      else if (signedSpeed > 1e-6) moveDirection = 1;
      player.movement = { speed: Math.max(0, Math.abs(signedSpeed)), turnSpeed: 0, moveDirection };
    }
    const playerObject = new PlayerObject(player);
    host.registerObject(playerObject);
    if (host.localId) playerObject.syncReplicatedShot();
    host.history.set(id, []);
    if (host.ambientTrafficEnabled && !host.localId && !host.gameState.vehicleStates.length && host.trafficModels.length) {
      const occupied = [...host.gameState.playerStates.values(), ...host.gameState.vehicleStates].map(item => ({ x: item.x, y: item.y, z: item.z }));
      const spawned = host.trafficSpawner.spawnAround(player.x, player.y, host.nextTrafficId, occupied, host.tick, player.z);
      host.nextTrafficId += spawned.length;
      for (const vehicle of spawned) {
        const object = host.createVehicleObject(vehicle);
        host.registerObject(object);
        host.createVehicleBody(vehicle);
      }
    }
    // A local world keeps a body for the player and the currently occupied
    // chassis so authoritative snapshots can restore their physics state.
    if (!host.localId || id === host.localId) {
      const body = host.createPlayerPhysicsBody(player);
      playerObject.attachPhysicsBody(body);
    }
    return player;
  }
export function removePlayer(host: any, id: string) {
    const playerObject = host.gameObjects.findPlayer(id);
    const body = playerObject?.physicsBody;
    if (body) host.destroyPhysicsBody(body);
    playerObject?.detachPhysicsBody();
    for (const vehicle of host.gameObjects.vehicles) if (occupantForPlayer(vehicle.state, id)) host.detachVehicleOccupant(vehicle.state, id);
    host.history.delete(id); host.recentVehicleEntries.delete(id);
    playerObject?.despawn();
    host.spawnProtection.delete(id); host.wantedDecay.delete(id);
  }
  /** Start the source-style DoJump state. The ped stays on the map floor for
   * wall/slope physics; its airborne height is a replicated presentation
   * value and its vehicle collision mask is removed until landing. */
export function beginPlayerJump(host: any, player: PlayerState, input: Input, floor: number) {
    const object = host.gameObjects.findPlayer(player.id);
    if (!(object instanceof PlayerObject)) return false;
    return object.beginJump(input, floor);
  }
export function updatePlayerJumps(host: any, dt: number, playerOnly = false) {
    for (const player of host.gameState.playerStates.values()) {
      if (playerOnly && player.id !== host.localId) continue;
      const object = host.gameObjects.findPlayer(player.id);
      if (object instanceof PlayerObject) object.updateJump(dt);
    }
  }
export function killPlayer(host: any, target: PlayerState, killer?: string) {
    const object = host.gameObjects.findPlayer(target.id);
    if (!(object instanceof PlayerObject) || object.combatState.respawn > 0) return false;
    if (target.vehicleId !== undefined) {
      const vehicle = host.gameObjects.findVehicle(target.vehicleId);
      if (vehicle && occupantForPlayer(vehicle.state, target.id)) host.detachVehicleOccupant(vehicle.state, target.id);
    }
    object.kill();
    if (killer && killer !== target.id) {
      host.gameObjects.findPlayer(killer)?.awardKill();
    }
    return true;
  }
export function killNpc(host: any, target: NpcObject) {
    if (target.state.health <= 0) return false;
    const id = `npc:${target.id}`;
    if (target.state.vehicleId !== undefined) {
      const vehicle = host.gameObjects.findVehicle(target.state.vehicleId);
      if (vehicle && occupantForPlayer(vehicle.state, id)) host.detachVehicleOccupant(vehicle.state, id);
    }
    return target.killByWater();
  }
export function damagePlayer(host: any, target: PlayerState, damage: number, killer?: string, cause: PlayerState['deathCause'] = 'weapon') {
    const object = host.gameObjects.findPlayer(target.id);
    if (!(object instanceof PlayerObject)) return false;
    if (object.takeDamage(damage, killer, cause)) host.killPlayer(target, killer);
    return true;
  }

export function detachVehicleOccupant(host: any, vehicle: TrafficState, id: string, damage = 0) {
    const object = host.gameObjects.findVehicle(vehicle.id);
    return object?.detachOccupant(id, host.vehicleObjectContext(object), damage) ?? false;
  }

export function ejectVehicleOccupants(host: any, vehicle: TrafficState, damage = 0) {
    const object = host.gameObjects.findVehicle(vehicle.id);
    if (!object) return false;
    object.ejectOccupants(host.vehicleObjectContext(object), damage);
    return true;
  }

export function spawnVehicleFireHazard(host: any, vehicle: TrafficState, life: number, effect: 'fire' | 'explosion' = 'fire') {
    return host.vehicleDamageController.spawnFire(vehicle, life, effect);
  }

export function removeVehicleFireHazards(host: any, vehicle: TrafficState, effect?: 'fire' | 'explosion') {
    host.vehicleDamageController.removeFire(vehicle, effect);
  }

export function syncVehicleFireHazards(host: any) {
    host.vehicleDamageController.syncFire();
  }

export function vehicleDamage(host: any, vehicle: TrafficState, damage: number, x = vehicle.x, y = vehicle.y, sourceModel?: number, attacker?: string) {
  host.vehicleDamageController.applyDamage(vehicle, damage, x, y, sourceModel, attacker);
  }
  /** Gameplay impact effects consume contacts; separation belongs to CollisionWorld. */
export function applyVehicleImpacts(host: any, contacts: readonly CollisionContact[]) {
    if (host.localId) return;
    for (const contact of contacts) {
      if (contact.a.kind !== 'vehicle' || contact.b.kind !== 'vehicle') continue;
      const aObject = contact.a.object, bObject = contact.b.object;
      if (!(aObject instanceof VehicleObject) || !(bObject instanceof VehicleObject)) continue;
      const a = aObject.state, b = bObject.state;
      const aLiveExplosion = a.damagePhase === 'exploding' && a.aiState === 'stuck' && !a.wrecked;
      const bLiveExplosion = b.damagePhase === 'exploding' && b.aiState === 'stuck' && !b.wrecked;
      if ((a.health <= 0 && !aLiveExplosion) || (b.health <= 0 && !bLiveExplosion)) continue;
      const { normalX: nx, normalY: ny } = contact;
      const avx = a.vx, avy = a.vy, bvx = b.vx, bvy = b.vy;
      const relativeX = (contact.velocityA?.x ?? avx) - (contact.velocityB?.x ?? bvx), relativeY = (contact.velocityA?.y ?? avy) - (contact.velocityB?.y ?? bvy);
      const closing = Math.max(0, relativeX * nx + relativeY * ny);
      // The native fixture restitution, friction, and mass properties
      // already produced the post-contact velocities in CollisionWorld. Keep
      // this phase limited to GTA2's damage event; applying a second gameplay
      // impulse here would double the bounce and diverge from the physics
      // engine's authoritative result.
      const combat = host.gameObjectCombatContext();
      aObject.receiveCollisionImpact(closing, contact.pointX, contact.pointY, combat);
      bObject.receiveCollisionImpact(closing, contact.pointX, contact.pointY, combat);
      if (closing >= WORLD.vehicle.source.fastImpactVelocity) {
        combat.spawnEffect({ x: contact.pointX, y: contact.pointY, z: Math.max(a.z, b.z) + .1, kind: 'impact', life: 8, owner: `vehicle:${a.id}`, rotation: Math.atan2(relativeY, relativeX), scale: .7 });
      }
      aObject.recomputeSpeed(); bObject.recomputeSpeed();
    }
    const ordered = [...host.gameState.vehicleStates].sort((a, b) => a.id - b.id);
    for (const vehicle of ordered) {
      const driverId = host.gameObjects.findVehicle(vehicle.id)?.driver;
      if (!driverId) continue;
      const occupant = occupantForPlayer(vehicle, driverId);
      if (!occupant || occupant.state !== 'seated') continue;
      const driver = host.gameState.playerStates.get(driverId), driverObject = driver && host.gameObjects.findPlayer(driver.id), body = driverObject?.physicsBody;
      if (driver && driverObject instanceof PlayerObject) {
        driverObject.followVehicle({ x: vehicle.x, y: vehicle.y, z: vehicle.z, rotation: vehicle.rotation, vx: vehicle.vx, vy: vehicle.vy });
        body?.setPosition({ x: worldToPhysics(driverObject.state.x), y: -worldToPhysics(driverObject.state.y) });
        body?.setLinearVelocity({ x: 0, y: 0 });
      }
    }
  }
  /** Vehicle injury is a gameplay event, independent of generic blocking. */
export function applyPedestrianImpacts(host: any, contacts: readonly CollisionContact[]) {
    if (host.localId) return;
    for (const contact of contacts) {
      let vehicleBody: typeof contact.a | undefined;
      if (contact.a.kind === 'vehicle') vehicleBody = contact.a;
      else if (contact.b.kind === 'vehicle') vehicleBody = contact.b;
      if (!vehicleBody) continue;
      let otherBody = contact.a;
      if (vehicleBody === contact.a) otherBody = contact.b;
      const vehicleObject = vehicleBody.object;
      if (!(vehicleObject instanceof VehicleObject)) continue;
      const vehicle = vehicleObject.state;
      const carVelocity = vehicleBody === contact.a ? contact.velocityA : contact.velocityB;
      const incomingNormalX = vehicleBody === contact.a ? contact.normalX : -contact.normalX;
      const incomingNormalY = vehicleBody === contact.a ? contact.normalY : -contact.normalY;
      const linearX = carVelocity?.x ?? vehicle.vx;
      const linearY = carVelocity?.y ?? vehicle.vy;
      // CarPhysics_B0::ComputeRelativePointVelocity_561130 includes angular
      // velocity at the collision point.  The engine contact already gives us
      // the point, so preserve that part before projecting the car's incoming
      // velocity onto the contact normal. The original car dispatch does not
      // turn a pedestrian walking into a stationary chassis into a car impact.
      const pointOffsetX = contact.pointX - vehicle.x;
      const pointOffsetY = contact.pointY - vehicle.y;
      const pointVelocityX = linearX - vehicle.angularVelocity * pointOffsetY;
      const pointVelocityY = linearY + vehicle.angularVelocity * pointOffsetX;
      const impact = Math.max(0, pointVelocityX * incomingNormalX + pointVelocityY * incomingNormalY);
      if (impact < WORLD.vehicle.pedestrianImpact.contactTrigger) continue;
      const sourceImpact = sourcePedestrianImpact(impact);
      const driverId = vehicleObject.driver;
      const driverIsPlayer = driverId !== undefined && Boolean(host.gameObjects.findPlayer(driverId));
      const info = host.vehicleMetadata(vehicle)?.info;
      const tooHighToJump = Boolean(info?.infoFlags?.pedJump);
      const velocityX = carVelocity?.x ?? vehicle.vx, velocityY = carVelocity?.y ?? vehicle.vy;
      const rotation = Math.atan2(pointVelocityY, pointVelocityX);
      const jumpInput = { seq: 0, keys: 0, moveX: pointVelocityX, moveY: pointVelocityY };
      // CanJumpOver/DoJump is evaluated before the ordinary impact packet. A
      // high chassis marked CARI ped_jump remains solid and therefore never
      // gets this pass.
      if (!tooHighToJump && sourceImpact < WORLD.vehicle.pedestrianImpact.npcLethal) {
        if (otherBody.kind === 'player' && otherBody.object instanceof PlayerObject) {
          if (otherBody.object.beginJump(jumpInput, otherBody.object.state.z)) continue;
        }
        if (otherBody.kind === 'npc' && otherBody.object instanceof NpcObject) {
          if (otherBody.object.beginJump(otherBody.object.state.z, velocityX, velocityY)) continue;
        }
      }
      const combat = host.gameObjectCombatContext();
      if (otherBody.kind === 'player' && otherBody.object instanceof PlayerObject) {
        const lethal = isLethalPedestrianImpact(sourceImpact, 'player', driverIsPlayer);
        otherBody.object.receiveVehicleImpact(sourceImpact, driverId, combat, { lethal, rotation });
      } else if (otherBody.kind === 'npc' && otherBody.object instanceof NpcObject) {
        const lethal = isLethalPedestrianImpact(sourceImpact, 'npc');
        const impulseX = velocityX * .12, impulseY = velocityY * .12;
        otherBody.object.receiveVehicleImpact(sourceImpact, driverId, combat, { lethal, rotation, impulseX, impulseY });
      }
    }
  }

