import type {
  CombatState,
  HazardState,
  MatchState,
  NpcState,
  PickupState,
  PlayerState,
  TrafficState,
  WorldEvent,
} from './types';

type WirePick<T, K extends keyof T> = Partial<{ [P in K]: T[P] | undefined }> & {
  [P in K as undefined extends T[P] ? never : P]: T[P]
};

/**
 * Browser-facing representations of authoritative state.
 *
 * These are deliberately separate from the server's authoritative world state.  The
 * runtime can keep object references and server-only integrator fields while
 * the wire format contains only what the browser needs to render and play
 * replicated events.
 */
export type ClientCombatDto = WirePick<CombatState,
  'weapon' | 'ammo' | 'health' | 'cooldown' | 'previousKeys' | 'respawn' |
  'shockCounter' | 'electrocuted' | 'onFire' | 'fireTimer' | 'throwCharge' | 'throwing' | 'throwAnimation' | 'attacking' | 'fireAnimation' | 'shots'>;

export type ClientPlayerDto = Omit<WirePick<PlayerState,
  'id' | 'x' | 'y' | 'z' | 'rotation' | 'vx' | 'vy' | 'collisionLayer' |
  'grounded' | 'verticalVelocity' | 'vehicleId' | 'animation' | 'jump' |
  'movement' | 'drowningTimer' | 'name' | 'color' | 'score' | 'kills' | 'deaths' | 'ready' |
  'armor' | 'money' | 'wanted' | 'team' | 'killer' | 'deathCause' | 'combat'>, 'combat'> & { combat: ClientCombatDto };

export type ClientPickupDto = WirePick<PickupState, 'id' | 'x' | 'y' | 'z' | 'weapon' | 'ammo' | 'active' | 'collisionLayer'>;

export type ClientTrafficDto = WirePick<TrafficState,
  'id' | 'x' | 'y' | 'z' | 'rotation' | 'speed' | 'color' | 'health' | 'model' |
  'collisionLayer' | 'grounded' | 'verticalVelocity' | 'vx' | 'vy' | 'angularVelocity' |
  'throttle' | 'brakePressure' | 'handbrakeForce' |
  'damageFrame' | 'damageMask' | 'wrecked' | 'wreckModel' | 'paint' | 'damagePhase' |
  'aiState' | 'routeNode' | 'targetNode' | 'junction' | 'signal' |
  'aiActive' | 'aiMode' | 'aiTask' | 'routeId' | 'routeCursor' | 'arrowCursor' | 'arrowRun' |
  'currentDirection' | 'targetDirection' | 'plannedTurn' | 'laneTarget' | 'laneAlignment' |
  'targetSpeed' | 'speedClass' | 'yieldTimer' | 'obstacleTimer' | 'offRoadTimer' | 'allowSpecialRoute' |
  'transport' | 'serviceStop' | 'pursuitTarget' | 'brakeLights' |
  'headlights' | 'emergencyLights' | 'horn' | 'turretRotation' | 'mountedWeapons' | 'trailerId' | 'passengers' | 'occupants' |
  'doorStates' | 'doorLock'>;

export type ClientNpcDto = WirePick<NpcState,
  'id' | 'x' | 'y' | 'z' | 'rotation' | 'vx' | 'vy' | 'health' | 'kind' | 'remap' |
  'collisionLayer' | 'grounded' | 'verticalVelocity' | 'state' | 'animation' |
  'animationProgress' | 'animationStraightEntry' | 'target' | 'weapon' | 'weaponAmmo' | 'weaponCooldown' | 'pathIndex' | 'path' | 'pathPointIndex' | 'pathGoal' |
  'patrolRoute' | 'patrolPointIndex' | 'waitTimer' | 'panicTimer' | 'deathTimer' | 'deathPose' | 'killer' | 'shockCounter' | 'electrocuted' | 'shots' | 'onFire' | 'fireTimer' | 'crossingRoad' | 'faction' | 'threatenedBy' | 'threatTimer' | 'jump' | 'drowningTimer' | 'deathCause' | 'vehicleId'>;

export type ClientHazardDto = WirePick<HazardState, 'id' | 'x' | 'y' | 'z' | 'kind' | 'life' | 'owner' | 'collisionLayer' | 'effect' | 'explosionType' | 'sourceExplosionType' | 'sourceModel' | 'sourceTimer' | 'armingTimer' | 'vehicleId' | 'rotation' | 'scale' | 'variant'>;
export type ClientEventDto = WorldEvent;

export interface ClientSnapshot {
  type: 'snapshot';
  tick: number;
  players: ClientPlayerDto[];
  inputAck?: number | undefined;
  removedPlayers?: string[] | undefined;
  pickups?: ClientPickupDto[] | undefined;
  traffic?: ClientTrafficDto[] | undefined;
  npcs?: ClientNpcDto[] | undefined;
  removedNpcs?: number[] | undefined;
  hazards?: ClientHazardDto[] | undefined;
  events?: ClientEventDto[] | undefined;
  chat?: import('./types').ChatMessage[] | undefined;
  match?: MatchState | undefined;
  full?: boolean | undefined;
  baseTick?: number | undefined;
}

export interface ClientWelcomeDto {
  type: 'welcome';
  version: number;
  id: string;
  tick: number;
  inputAck?: number | undefined;
  players: ClientPlayerDto[];
  room: MatchState;
  pickups?: ClientPickupDto[] | undefined;
  traffic?: ClientTrafficDto[] | undefined;
  npcs?: ClientNpcDto[] | undefined;
  hazards?: ClientHazardDto[] | undefined;
  events?: ClientEventDto[] | undefined;
  chat?: import('./types').ChatMessage[] | undefined;
}

export type ClientServerMessage = ClientSnapshot | ClientWelcomeDto | { type: 'chat'; message: import('./types').ChatMessage };

/** Project authoritative runtime state into the browser DTO. */
export function toClientPlayer(player: PlayerState): ClientPlayerDto {
  const result: ClientPlayerDto = {
    ...player,
    combat: { ...player.combat, ammo: [...player.combat.ammo], shots: player.combat.shots.map(shot => ({ ...shot })) },
  };
  if (player.animation) result.animation = { ...player.animation };
  if (player.jump) result.jump = { ...player.jump };
  if (player.movement) result.movement = { ...player.movement };
  return result;
}

export function toClientPickup(pickup: PickupState): ClientPickupDto { return { ...pickup }; }

export function toClientTraffic(vehicle: TrafficState): ClientTrafficDto {
  return {
    id: vehicle.id, x: vehicle.x, y: vehicle.y, z: vehicle.z, rotation: vehicle.rotation, speed: vehicle.speed,
    color: vehicle.color, health: vehicle.health, model: vehicle.model, collisionLayer: vehicle.collisionLayer,
    grounded: vehicle.grounded, verticalVelocity: vehicle.verticalVelocity, vx: vehicle.vx, vy: vehicle.vy,
    angularVelocity: vehicle.angularVelocity, throttle: vehicle.throttle, brakePressure: vehicle.brakePressure,
    handbrakeForce: vehicle.handbrakeForce, damageFrame: vehicle.damageFrame, damageMask: vehicle.damageMask,
    wrecked: vehicle.wrecked, wreckModel: vehicle.wreckModel, paint: vehicle.paint, damagePhase: vehicle.damagePhase,
    aiState: vehicle.aiState, routeNode: vehicle.routeNode, targetNode: vehicle.targetNode, junction: vehicle.junction,
    aiActive: vehicle.aiActive, aiMode: vehicle.aiMode, aiTask: vehicle.aiTask,
    routeId: vehicle.routeId, routeCursor: vehicle.routeCursor, arrowCursor: vehicle.arrowCursor, arrowRun: vehicle.arrowRun,
    currentDirection: vehicle.currentDirection, targetDirection: vehicle.targetDirection, plannedTurn: vehicle.plannedTurn,
    laneTarget: vehicle.laneTarget, laneAlignment: vehicle.laneAlignment, targetSpeed: vehicle.targetSpeed,
    speedClass: vehicle.speedClass, yieldTimer: vehicle.yieldTimer, obstacleTimer: vehicle.obstacleTimer,
    offRoadTimer: vehicle.offRoadTimer, allowSpecialRoute: vehicle.allowSpecialRoute,
    signal: vehicle.signal, brakeLights: vehicle.brakeLights, headlights: vehicle.headlights,
    emergencyLights: vehicle.emergencyLights, horn: vehicle.horn, turretRotation: vehicle.turretRotation, mountedWeapons: vehicle.mountedWeapons ? [...vehicle.mountedWeapons] : undefined, trailerId: vehicle.trailerId, transport: vehicle.transport, serviceStop: vehicle.serviceStop, pursuitTarget: vehicle.pursuitTarget, passengers: [...vehicle.passengers],
    occupants: vehicle.occupants.map(occupant => ({ ...occupant })), doorStates: vehicle.doorStates.map(door => ({ ...door })), doorLock: vehicle.doorLock,
  };
}

export function toClientNpc(npc: NpcState): ClientNpcDto {
  const result: ClientNpcDto = {
    ...npc,
    shots: npc.shots.map(shot => ({ ...shot })),
  };
  if (npc.path) result.path = [...npc.path];
  if (npc.pathGoal) result.pathGoal = { ...npc.pathGoal };
  if (npc.patrolRoute) result.patrolRoute = [...npc.patrolRoute];
  if (npc.jump) result.jump = { ...npc.jump };
  return result;
}

export function toClientHazard(hazard: HazardState): ClientHazardDto { return { ...hazard }; }

/** Convert DTOs back into mutable runtime state at the client boundary. */
export function fromClientPlayer(player: ClientPlayerDto): PlayerState {
  const result: PlayerState = {
    ...player,
    combat: { ...player.combat, ammo: [...player.combat.ammo], shots: player.combat.shots.map(shot => ({ ...shot })) },
  };
  if (player.animation) result.animation = { ...player.animation };
  if (player.jump) result.jump = { ...player.jump };
  if (player.movement) result.movement = { ...player.movement };
  return result;
}

export function fromClientPickup(pickup: ClientPickupDto): PickupState { return { ...pickup }; }
export function fromClientTraffic(vehicle: ClientTrafficDto): TrafficState {
  return {
    ...vehicle,
    passengers: [...vehicle.passengers],
    occupants: vehicle.occupants.map(occupant => ({ ...occupant })),
    doorStates: vehicle.doorStates.map(door => ({ ...door })),
  };
}
export function fromClientNpc(npc: ClientNpcDto): NpcState {
  const result: NpcState = {
    ...npc,
    shots: npc.shots.map(shot => ({ ...shot })),
  };
  if (npc.path) result.path = [...npc.path];
  if (npc.pathGoal) result.pathGoal = { ...npc.pathGoal };
  if (npc.patrolRoute) result.patrolRoute = [...npc.patrolRoute];
  if (npc.jump) result.jump = { ...npc.jump };
  return result;
}
export function fromClientHazard(hazard: ClientHazardDto): HazardState { return { ...hazard }; }

