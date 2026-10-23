import { WORLD, worldToPhysics } from '../../domain/world/world';
import { updatePedestrianAi } from '../../domain/pedestrians/ai';
import { PEDESTRIAN_DESPAWN_DISTANCE, PEDESTRIAN_PER_PLAYER, PEDESTRIAN_POPULATION_LIMIT } from '../../domain/pedestrians/pedestrian-spawner';
import type { PlayerState, TrafficState } from '../../protocol/types';
import { STEP } from '../../protocol/constants';
import { NpcObject } from '../gameobjects/npc';
import { PlayerObject } from '../gameobjects/player';
import type { GameWorld } from '../game-world';

export function maintainNpcs(world: GameWorld) {
  if (world.ambientPedestriansEnabled === false || world.localId || !world.gameState.playerStates.size || !world.pedestrianNavigation.nodes.length) return;
  const players = [...world.gameState.playerStates.values()];
  for (const npc of [...world.gameState.npcStates]) {
    if (players.some(player => Math.hypot(npc.x - player.x, npc.y - player.y) <= PEDESTRIAN_DESPAWN_DISTANCE)) continue;
    world.destroyNpcBody(npc.id);
    world.unregisterObject(world.gameObjects.findNpc(npc.id));
  }
  const desired = Math.min(PEDESTRIAN_POPULATION_LIMIT, players.length * PEDESTRIAN_PER_PLAYER);
  if (world.gameState.npcStates.length >= desired) return;
  const occupied = [...world.gameState.playerStates.values(), ...world.gameState.vehicleStates, ...world.gameState.npcStates]
    .map(item => ({ x: item.x, y: item.y, z: item.z }));
  for (const player of players) {
    while (world.gameState.npcStates.length < desired) {
      const spawned = world.pedestrianSpawner.spawnAround(player, world.nextNpcId, occupied, world.tick);
      if (!spawned.length) break;
      for (const npc of spawned) {
        world.nextNpcId++;
        occupied.push({ x: npc.x, y: npc.y, z: npc.z });
        world.registerObject(world.createNpcObject(npc));
        world.createNpcBody(npc);
      }
    }
    if (world.gameState.npcStates.length >= desired) break;
  }
}

export function updateNpcAi(world: GameWorld, dt = STEP) {
  if (world.localId) return;
  updateNpcVehicleAi(world);
  updatePoliceAndGangAi(world);
  updatePedestrianAi({
    npcs: world.gameState.npcStates,
    players: world.gameState.playerStates.values(),
    navigation: world.pedestrianNavigation,
    traffic: world.gameState.vehicleStates,
    vehicleBounds: vehicle => world.vehicleCatalog.get(vehicle.model).bounds,
    vehicleCanJumpOver: vehicle => !world.vehicleMetadata(vehicle).info?.infoFlags?.pedJump,
    dt,
    tick: world.tick,
  });
}

function updatePoliceAndGangAi(world: GameWorld) {
  const players = [...world.gameState.playerStates.values()];
  for (const npc of world.gameState.npcStates) {
    if (npc.health <= 0) continue;
    const isPolice = npc.kind === 'police';
    const isGang = npc.kind === 'civilian' && (npc.faction ?? 0) > 0;
    if (!isPolice && !isGang) continue;
    const vehicle = npc.vehicleId === undefined ? undefined : world.gameObjects.findVehicle(npc.vehicleId);
    if (isPolice && !world.policeAttackPlayer) {
      npc.target = undefined;
      if (vehicle) delete (vehicle.state as TrafficState).pursuitTarget;
      continue;
    }
    const origin = vehicle?.state ?? npc;
    const target = players
      .filter(player => player.combat.health > 0 && player.combat.respawn <= 0 && Math.abs(player.z - npc.z) <= WORLD.interaction.sameFloor)
      .filter(player => {
        const threatened = npc.threatenedBy === player.id && (npc.threatTimer ?? 0) > 0;
        return isPolice
          ? threatened || player.wanted > 0 || player.combat.attacking || player.combat.shots.some(shot => shot.projectile && !shot.impact)
          : threatened || player.combat.attacking || player.combat.shots.some(shot => shot.projectile && !shot.impact);
      })
      .map(player => ({ player, distance: Math.hypot(player.x - origin.x, player.y - origin.y) }))
      .filter(item => item.distance <= (isPolice ? WORLD.traffic.policePursuitRadius : WORLD.traffic.policeAttackRadius))
      .sort((a, b) => a.distance - b.distance)[0]?.player;
    if (!target) {
      if (npc.state === 'attack') { npc.state = 'walk'; npc.animation = 'walking'; }
      npc.target = undefined;
      if (vehicle) delete (vehicle.state as TrafficState).pursuitTarget;
      continue;
    }
    if (isPolice && target.wanted > 0 && !target.combat.attacking && Math.hypot(target.x - origin.x, target.y - origin.y) <= WORLD.traffic.policeArrestRadius) {
      arrestPlayer(world, target, npc.id);
      if (vehicle && vehicle.state.occupants.some(occupant => occupant.id === `npc:${npc.id}`)) world.detachVehicleOccupant(vehicle.state, `npc:${npc.id}`, 0);
      npc.target = undefined;
      if (vehicle) delete (vehicle.state as TrafficState).pursuitTarget;
      npc.state = 'walk'; npc.animation = 'walking';
      continue;
    }
    npc.target = target.id;
    if (vehicle) {
      (vehicle.state as TrafficState).pursuitTarget = target.id;
      continue;
    }
    npc.state = 'attack'; npc.animation = 'armedRunning';
  }
}

function updateNpcVehicleAi(world: GameWorld) {
  const vehicles = world.gameState.vehicleStates;
  for (const vehicle of vehicles.filter(item => item.transport !== undefined && item.serviceStop !== undefined && Math.hypot(item.vx, item.vy) < 25)) {
    const object = world.gameObjects.findVehicle(vehicle.id);
    if (!object) continue;
    const passenger = world.gameState.npcStates
      .filter(npc => npc.health > 0 && npc.vehicleId === undefined && npc.kind === 'civilian' && npc.state !== 'flee')
      .map(npc => ({ npc, object: world.gameObjects.findNpc(npc.id), distance: Math.hypot(npc.x - vehicle.x, npc.y - vehicle.y) }))
      .filter(item => item.object && item.distance < 96)
      .sort((a, b) => a.distance - b.distance)[0];
    if (passenger?.object) object.beginNpcEntry(passenger.object, world.vehicleObjectContext(object));
  }
  for (const npc of world.gameState.npcStates) {
    const policeDriver = npc.kind === 'police' && npc.target !== undefined;
    if (npc.health <= 0 || npc.vehicleId !== undefined || (!policeDriver && npc.kind !== 'civilian') || (!policeDriver && npc.state === 'flee') || (!policeDriver && npc.id % 11 !== world.tick % 11)) continue;
    const object = world.gameObjects.findNpc(npc.id);
    if (!(object instanceof NpcObject)) continue;
    const candidate = vehicles
      .map(vehicle => ({ vehicle, object: world.gameObjects.findVehicle(vehicle.id), distance: Math.hypot(vehicle.x - npc.x, vehicle.y - npc.y) }))
      .filter(item => item.object && item.object.alive && !item.object.isDriven() && item.vehicle.transport !== 'train' && Math.hypot(item.vehicle.vx, item.vehicle.vy) < 8 && item.distance < WORLD.vehicle.enterDistance)
      .sort((a, b) => a.distance - b.distance)[0];
    if (!candidate?.object) continue;
    if (candidate.object.beginNpcEntry(object, world.vehicleObjectContext(candidate.object))) {
      npc.state = 'driving'; npc.animation = 'idle';
      if (policeDriver) candidate.vehicle.pursuitTarget = npc.target;
    }
  }
}

export function arrestPlayer(world: GameWorld, target: PlayerState, officerId?: number) {
  const object = world.gameObjects.findPlayer(target.id);
  if (!(object instanceof PlayerObject) || target.combat.health <= 0) return false;
  if (target.vehicleId !== undefined) {
    const vehicle = world.gameObjects.findVehicle(target.vehicleId);
    if (vehicle && vehicle.state.occupants.some(occupant => occupant.id === target.id)) world.detachVehicleOccupant(vehicle.state, target.id, 0);
  }
  const spawn = world.spawnPoint(true);
  object.setPose({ ...spawn, rotation: 0, vx: 0, vy: 0 });
  target.combat.health = 100; target.combat.respawn = 0; target.combat.attacking = false; target.combat.shots = [];
  target.wanted = 0; target.jump = undefined; target.animation = undefined;
  world.gameObjects.findPlayer(target.id)?.physicsBody?.setPosition({ x: worldToPhysics(target.x), y: -worldToPhysics(target.y) });
  world.emit({ type: 'hit', actor: officerId === undefined ? undefined : `npc:${officerId}`, target: target.id, damage: 0, lethal: false, x: target.x, y: target.y, z: target.z });
  return true;
}

export function setPoliceAttackPlayer(world: GameWorld, enabled: boolean) {
  world.policeAttackPlayer = enabled;
  if (enabled) return;
  for (const npc of world.gameState.npcStates) {
    if (npc.kind !== 'police') continue;
    if (npc.state === 'attack') { npc.state = 'walk'; npc.animation = 'walking'; }
    npc.target = undefined;
    if (npc.vehicleId !== undefined) {
      const vehicle = world.gameObjects.findVehicle(npc.vehicleId);
      if (vehicle) delete (vehicle.state as TrafficState).pursuitTarget;
    }
  }
}
