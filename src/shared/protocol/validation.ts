import { PROTOCOL_VERSION } from './constants';
import type { ClientMessage, CombatShot, Input, JumpPhase, JumpState, NpcState, PlayerControl, PlayerMovementState, PlayerState, ServerMessage, TrafficAiMode, TrafficAiTask, TrafficDirection, TrafficLaneAlignment, TrafficPlannedTurn, TrafficSpeedClass, TrafficState, VehicleDamagePhase, VehicleDoorPhase, VehicleDoorState, VehicleOccupancyState, VehicleOccupantState, WorldEvent } from './types';
import { WEAPONS } from '../domain/combat/weapons';

const weaponSlotCount = WEAPONS.length;

const playerControls = new Set<PlayerControl>([
  'forwardStart', 'forwardEnd', 'backwardStart', 'backwardEnd',
  'leftStart', 'leftEnd', 'rightStart', 'rightEnd',
  'sprintStart', 'sprintEnd', 'shootStart', 'shootEnd',
  'weaponPrevious', 'weaponNext', 'enterVehicle', 'jump',
]);

export class ProtocolValidationError extends Error {
  constructor(message = 'Invalid protocol message') {
    super(message);
    this.name = 'ProtocolValidationError';
  }
}

export function parseInput(value: unknown): Input {
  if (typeof value !== 'object' || value === null) throw new ProtocolValidationError('Invalid input message');
  const message = value as Partial<ClientMessage>;
  if (message.type !== 'input' || !message.input || typeof message.input !== 'object') throw new ProtocolValidationError('Invalid input message');
  const { seq, keys } = message.input;
  if (!Number.isSafeInteger(seq) || seq < 1 || !Number.isInteger(keys) || keys < 0 || keys > 127) throw new ProtocolValidationError('Invalid input message');
  const clientTick = message.input.clientTick;
  if (clientTick !== undefined && (!Number.isSafeInteger(clientTick) || clientTick < 0)) throw new ProtocolValidationError('Invalid input message');
  const controls = message.input.controls;
  if (controls !== undefined && (!Array.isArray(controls) || controls.length > 16 || !controls.every(control => typeof control === 'string' && playerControls.has(control as PlayerControl)))) throw new ProtocolValidationError('Invalid input message');
  const action = message.input.action;
  if (action !== undefined && action !== 'enter' && action !== 'jump') throw new ProtocolValidationError('Invalid input message');
  const vehicleId = message.input.vehicleId;
  if (vehicleId !== undefined && (!Number.isSafeInteger(vehicleId) || vehicleId < 0)) throw new ProtocolValidationError('Invalid input message');
  const moveX = message.input.moveX, moveY = message.input.moveY;
  if ((moveX === undefined) !== (moveY === undefined)) throw new ProtocolValidationError('Invalid input message');
  if (moveX !== undefined && moveY !== undefined && (!Number.isFinite(moveX) || !Number.isFinite(moveY) || Math.hypot(moveX, moveY) > 1.001)) throw new ProtocolValidationError('Invalid input message');
  const result: Input = { seq, keys };
  if (clientTick !== undefined) result.clientTick = clientTick;
  if (controls !== undefined) result.controls = controls;
  if (action !== undefined) result.action = action;
  if (vehicleId !== undefined) result.vehicleId = vehicleId;
  if (moveX !== undefined && moveY !== undefined) {
    result.moveX = moveX;
    result.moveY = moveY;
  }
  return result;
}

export function parseClientMessage(value: unknown): ClientMessage {
  if (value && typeof value === 'object' && (value as Partial<ClientMessage>).type === 'input') return { type: 'input', input: parseInput(value) };
  if (!value || typeof value !== 'object') throw new ProtocolValidationError('Invalid client message');
  const message = value as Partial<ClientMessage>;
  if (message.type === 'chat' && typeof message.text === 'string' && message.text.trim().length > 0 && message.text.length <= 240) return { type: 'chat', text: message.text.trim() };
  if (message.type === 'ready' && typeof message.ready === 'boolean') return { type: 'ready', ready: message.ready };
  if (message.type === 'reset-world') return { type: 'reset-world' };
  if (message.type === 'give-all-weapons') return { type: 'give-all-weapons' };
  if (message.type === 'set-police-attack' && typeof message.enabled === 'boolean') return { type: 'set-police-attack', enabled: message.enabled };
  throw new ProtocolValidationError('Invalid client message');
}

const vehicleOccupancyStates = new Set<VehicleOccupancyState>(['approaching', 'entering', 'seated', 'exiting']);
const vehicleDoorPhases = new Set<VehicleDoorPhase>(['closed', 'opening', 'open', 'closing']);
const vehicleDoorLocks = new Set<NonNullable<TrafficState['doorLock']>>(['unlocked', 'locked', 'player-only', 'thief-only']);
const vehicleDamagePhases = new Set<VehicleDamagePhase>(['new', 'dented', 'burning', 'exploding', 'burned-out']);
const jumpPhases = new Set<JumpPhase>(['rising', 'apex', 'falling']);
const trafficAiModes = new Set<TrafficAiMode>(['inactive', 'ordinary', 'scripted', 'chase', 'emergency', 'service']);
const trafficAiTasks = new Set<TrafficAiTask>(['none', 'follow-road', 'route', 'goto', 'chase', 'service', 'abandoned']);
const trafficDirections = new Set<TrafficDirection>(['none', 'north', 'south', 'east', 'west']);
const trafficPlannedTurns = new Set<TrafficPlannedTurn>(['none', 'left', 'right', 'u-turn']);
const trafficLaneAlignments = new Set<TrafficLaneAlignment>(['unknown', 'left', 'center', 'right']);
const trafficSpeedClasses = new Set<TrafficSpeedClass>(['slow', 'medium', 'fast']);
function validVehicleOccupant(value: unknown): value is VehicleOccupantState {
  if (!value || typeof value !== 'object') return false;
  const occupant = value as VehicleOccupantState;
  return typeof occupant.id === 'string' && Number.isSafeInteger(occupant.door) && occupant.door >= 0 &&
    vehicleOccupancyStates.has(occupant.state) && Number.isFinite(occupant.progress) && occupant.progress >= 0 && occupant.progress <= 1 &&
    (occupant.straightEntry === undefined || typeof occupant.straightEntry === 'boolean');
}
function validVehicleDoor(value: unknown): value is VehicleDoorState {
  if (!value || typeof value !== 'object') return false;
  const door = value as VehicleDoorState;
  return vehicleDoorPhases.has(door.phase) && Number.isSafeInteger(door.frame) && door.frame >= 0 && door.frame <= 4 &&
    Number.isSafeInteger(door.timer) && (door.occupant === undefined || typeof door.occupant === 'string');
}
function validJump(value: unknown): value is JumpState {
  if (!value || typeof value !== 'object') return false;
  const jump = value as JumpState;
  return jumpPhases.has(jump.phase) &&
    [jump.progress, jump.height, jump.baseZ, jump.vx, jump.vy].every(Number.isFinite) &&
    jump.progress >= 0 && jump.progress <= 1 && jump.height >= 0 &&
    (jump.vehicleCollision === undefined || typeof jump.vehicleCollision === 'boolean');
}
function validPlayerMovement(value: unknown): value is PlayerMovementState {
  if (!value || typeof value !== 'object') return false;
  const movement = value as PlayerMovementState;
  return Number.isFinite(movement.speed) && movement.speed >= 0 && Number.isFinite(movement.turnSpeed) &&
    Number.isInteger(movement.moveDirection) && (movement.moveDirection === -1 || movement.moveDirection === 0 || movement.moveDirection === 1);
}
function validPedestrianPathGoal(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const goal = value as { x?: unknown; y?: unknown; z?: unknown; nodeId?: unknown };
  return [goal.x, goal.y, goal.z].every(Number.isFinite) &&
    (goal.nodeId === undefined || Number.isSafeInteger(goal.nodeId));
}

function validCollisionLayer(value: unknown) {
  return value === undefined || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 7);
}

function validOptionalVerticalState(value: { grounded?: unknown; verticalVelocity?: unknown }) {
  return (value.grounded === undefined || typeof value.grounded === 'boolean') &&
    (value.verticalVelocity === undefined || Number.isFinite(value.verticalVelocity));
}
function validOptionalCounter(value: unknown) {
  return value === undefined || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
}
function validCombatShot(value: unknown): value is CombatShot {
  if (!value || typeof value !== 'object') return false;
  const shot = value as CombatShot;
  return ['x', 'y', 'endX', 'endY', 'z', 'life'].every(key => Number.isFinite(shot[key as keyof CombatShot])) && shot.life >= 0 &&
    (shot.vx === undefined || Number.isFinite(shot.vx)) &&
    (shot.vy === undefined || Number.isFinite(shot.vy)) &&
    Number.isInteger(shot.weapon) && shot.weapon >= 0 && shot.weapon < weaponSlotCount &&
    typeof shot.projectile === 'boolean' &&
    (shot.impact === undefined || typeof shot.impact === 'boolean') &&
    (shot.beam === undefined || typeof shot.beam === 'boolean') &&
    (shot.sequence === undefined || (Number.isSafeInteger(shot.sequence) && shot.sequence >= 0));
}
function validShotArray(value: unknown) {
  return Array.isArray(value) && value.length <= 64 && value.every(validCombatShot);
}
function validWorldEvent(value: unknown): value is WorldEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as { id?: unknown; tick?: unknown; x?: unknown; y?: unknown; z?: unknown; type?: unknown; actor?: unknown; target?: unknown; entity?: unknown; weapon?: unknown; damage?: unknown; lethal?: unknown };
  if (!Number.isSafeInteger(event.id) || !Number.isSafeInteger(event.tick) || ![event.x, event.y, event.z].every(Number.isFinite)) return false;
  const validActor = event.actor === undefined || typeof event.actor === 'string';
  const validWeapon = event.weapon === undefined || (typeof event.weapon === 'number' && Number.isInteger(event.weapon) && event.weapon >= 0 && event.weapon < weaponSlotCount);
  switch (event.type) {
    case 'shot': return typeof event.actor === 'string' && validWeapon && event.weapon !== undefined;
    case 'hit': return validActor && typeof event.target === 'string' && validWeapon && Number.isFinite(event.damage) && (event.lethal === undefined || typeof event.lethal === 'boolean');
    case 'explosion': return validActor && validWeapon && (event.entity === undefined || Number.isSafeInteger(event.entity)) && Number.isFinite(event.damage);
    case 'pickup': return typeof event.actor === 'string' && Number.isSafeInteger(event.entity) && validWeapon && event.weapon !== undefined;
    case 'vehicle-enter':
    case 'vehicle-exit': return typeof event.actor === 'string' && Number.isSafeInteger(event.entity);
    case 'vehicle-damage': return validActor && Number.isSafeInteger(event.entity) && Number.isFinite(event.damage);
    default: return false;
  }
}

function validTrafficState(value: unknown): value is TrafficState {
  if (!value || typeof value !== 'object') return false;
  const traffic = value as TrafficState;
  return Number.isInteger(traffic.id) &&
    [traffic.x, traffic.y, traffic.z, traffic.rotation, traffic.speed, traffic.health].every(Number.isFinite) &&
    validCollisionLayer(traffic.collisionLayer) && validOptionalVerticalState(traffic) &&
    [traffic.damageFrame, traffic.damageMask, traffic.paint, traffic.routeNode, traffic.targetNode, traffic.junction].every(value => value === undefined || Number.isFinite(value)) &&
    traffic.throttle >= -1 && traffic.throttle <= 1 && traffic.brakePressure >= 0 && traffic.brakePressure <= 1 && traffic.handbrakeForce >= 0 && traffic.handbrakeForce <= 1 &&
    Number.isInteger(traffic.color) && (traffic.model === undefined || Number.isInteger(traffic.model)) &&
    (traffic.wreckModel === undefined || Number.isInteger(traffic.wreckModel)) &&
    (traffic.damagePhase === undefined || vehicleDamagePhases.has(traffic.damagePhase)) &&
    (traffic.wrecked === undefined || typeof traffic.wrecked === 'boolean') &&
    (traffic.aiState === undefined || ['cruise', 'yield', 'brake', 'turn', 'stuck', 'wrecked'].includes(traffic.aiState)) &&
    (traffic.aiActive === undefined || typeof traffic.aiActive === 'boolean') &&
    (traffic.aiMode === undefined || trafficAiModes.has(traffic.aiMode)) &&
    (traffic.aiTask === undefined || trafficAiTasks.has(traffic.aiTask)) &&
    (traffic.aiActive !== false || traffic.aiMode === undefined || traffic.aiMode === 'inactive') &&
    (traffic.routeId === undefined || (Number.isSafeInteger(traffic.routeId) && traffic.routeId >= 0)) &&
    validOptionalCounter(traffic.routeCursor) && validOptionalCounter(traffic.arrowCursor) && validOptionalCounter(traffic.arrowRun) &&
    (traffic.currentDirection === undefined || trafficDirections.has(traffic.currentDirection)) &&
    (traffic.targetDirection === undefined || trafficDirections.has(traffic.targetDirection)) &&
    (traffic.plannedTurn === undefined || trafficPlannedTurns.has(traffic.plannedTurn)) &&
    (traffic.laneTarget === undefined || (typeof traffic.laneTarget === 'number' && Number.isSafeInteger(traffic.laneTarget) && traffic.laneTarget >= -2 && traffic.laneTarget <= 2)) &&
    (traffic.laneAlignment === undefined || trafficLaneAlignments.has(traffic.laneAlignment)) &&
    (traffic.targetSpeed === undefined || (Number.isFinite(traffic.targetSpeed) && traffic.targetSpeed >= 0)) &&
    (traffic.speedClass === undefined || trafficSpeedClasses.has(traffic.speedClass)) &&
    validOptionalCounter(traffic.yieldTimer) && validOptionalCounter(traffic.obstacleTimer) && validOptionalCounter(traffic.offRoadTimer) &&
    (traffic.allowSpecialRoute === undefined || typeof traffic.allowSpecialRoute === 'boolean') &&
    (traffic.signal === undefined || ['green', 'red', 'none'].includes(traffic.signal)) &&
    (traffic.transport === undefined || traffic.transport === 'bus' || traffic.transport === 'train') &&
    (traffic.serviceStop === undefined || Number.isSafeInteger(traffic.serviceStop)) &&
    (traffic.pursuitTarget === undefined || typeof traffic.pursuitTarget === 'string') &&
    (traffic.brakeLights === undefined || typeof traffic.brakeLights === 'boolean') &&
    (traffic.headlights === undefined || typeof traffic.headlights === 'boolean') &&
    (traffic.emergencyLights === undefined || typeof traffic.emergencyLights === 'boolean') &&
    (traffic.horn === undefined || typeof traffic.horn === 'boolean') &&
    (traffic.turretRotation === undefined || Number.isFinite(traffic.turretRotation)) &&
    (traffic.mountedWeapons === undefined || (Array.isArray(traffic.mountedWeapons) && traffic.mountedWeapons.every(value => Number.isSafeInteger(value) && value >= 0 && value < weaponSlotCount))) &&
    (traffic.trailerId === undefined || Number.isSafeInteger(traffic.trailerId)) &&
    Array.isArray(traffic.passengers) && traffic.passengers.every(value => typeof value === 'string') &&
    Array.isArray(traffic.occupants) && traffic.occupants.every(validVehicleOccupant) &&
    Array.isArray(traffic.doorStates) && traffic.doorStates.every(validVehicleDoor) &&
    (traffic.doorLock === undefined || vehicleDoorLocks.has(traffic.doorLock));
}

function validNpcState(value: unknown): value is NpcState {
  if (!value || typeof value !== 'object') return false;
  const npc = value as NpcState;
  return Number.isInteger(npc.id) &&
    [npc.x, npc.y, npc.z, npc.rotation, npc.vx, npc.vy, npc.health].every(Number.isFinite) &&
    validCollisionLayer(npc.collisionLayer) && validOptionalVerticalState(npc) &&
    (npc.kind === 'civilian' || npc.kind === 'police') &&
    (npc.remap === undefined || (Number.isSafeInteger(npc.remap) && npc.remap >= 0 && npc.remap <= 255)) &&
    ['idle', 'walk', 'panic', 'flee', 'attack', 'knockdown', 'dead', 'entering', 'driving'].includes(npc.state) &&
    ['idle', 'walking', 'running', 'armed', 'armedWalking', 'armedRunning', 'firing', 'throwing', 'throwingIdle', 'jumping', 'entering', 'exiting', 'falling', 'knockdown', 'dead', 'lying', 'lyingReverse', 'electrocuted'].includes(npc.animation) &&
    (npc.animationProgress === undefined || (Number.isFinite(npc.animationProgress) && npc.animationProgress >= 0 && npc.animationProgress <= 1)) &&
    (npc.animationStraightEntry === undefined || typeof npc.animationStraightEntry === 'boolean') &&
    (npc.target === undefined || typeof npc.target === 'string') &&
    (npc.weapon === undefined || (Number.isInteger(npc.weapon) && npc.weapon >= 0 && npc.weapon < weaponSlotCount)) &&
    (npc.weaponAmmo === undefined || (Number.isSafeInteger(npc.weaponAmmo) && npc.weaponAmmo >= 0)) &&
    (npc.weaponCooldown === undefined || (Number.isSafeInteger(npc.weaponCooldown) && npc.weaponCooldown >= 0)) &&
    (npc.pathIndex === undefined || Number.isSafeInteger(npc.pathIndex)) &&
    (npc.path === undefined || (Array.isArray(npc.path) && npc.path.length <= 100 && npc.path.every(point => Number.isSafeInteger(point) && point >= 0))) &&
    (npc.pathPointIndex === undefined || (Number.isSafeInteger(npc.pathPointIndex) && npc.pathPointIndex >= 0 && npc.pathPointIndex <= 100)) &&
    (npc.pathGoal === undefined || validPedestrianPathGoal(npc.pathGoal)) &&
    (npc.patrolRoute === undefined || (Array.isArray(npc.patrolRoute) && npc.patrolRoute.length <= 32 && npc.patrolRoute.every(point => Number.isSafeInteger(point) && point >= 0))) &&
    (npc.patrolPointIndex === undefined || (Number.isSafeInteger(npc.patrolPointIndex) && npc.patrolPointIndex >= 0)) &&
    (npc.waitTimer === undefined || (Number.isSafeInteger(npc.waitTimer) && npc.waitTimer >= 0)) &&
    (npc.panicTimer === undefined || Number.isFinite(npc.panicTimer)) &&
    (npc.deathTimer === undefined || (Number.isSafeInteger(npc.deathTimer) && npc.deathTimer >= 0)) &&
    (npc.deathPose === undefined || npc.deathPose === 'lying' || npc.deathPose === 'lyingReverse') &&
    (npc.killer === undefined || typeof npc.killer === 'string') &&
    Number.isSafeInteger(npc.shockCounter) && npc.shockCounter >= 0 && npc.shockCounter <= 100 &&
    typeof npc.electrocuted === 'boolean' &&
    validShotArray(npc.shots) &&
    typeof npc.onFire === 'boolean' &&
    Number.isSafeInteger(npc.fireTimer) && npc.fireTimer >= 0 &&
    (npc.crossingRoad === undefined || typeof npc.crossingRoad === 'boolean') &&
    (npc.faction === undefined || (Number.isSafeInteger(npc.faction) && npc.faction >= 0 && npc.faction <= 255)) &&
    (npc.threatenedBy === undefined || typeof npc.threatenedBy === 'string') &&
    (npc.threatTimer === undefined || (Number.isSafeInteger(npc.threatTimer) && npc.threatTimer >= 0)) &&
    (npc.jump === undefined || validJump(npc.jump)) &&
    (npc.drowningTimer === undefined || (Number.isSafeInteger(npc.drowningTimer) && npc.drowningTimer >= 0)) &&
    (npc.deathCause === undefined || ['weapon', 'run-over', 'explosion', 'fire', 'water'].includes(npc.deathCause)) &&
    (npc.vehicleId === undefined || Number.isSafeInteger(npc.vehicleId));
}

export function isPlayer(value: unknown): value is PlayerState {
  if (!value || typeof value !== 'object') return false;
  const player = value as PlayerState;
  const c = player.combat;
  if (!c || typeof c !== 'object' || !Number.isInteger(c.weapon) || c.weapon < -1 || c.weapon >= weaponSlotCount || !Array.isArray(c.ammo) || c.ammo.length !== weaponSlotCount || !c.ammo.every(n => Number.isSafeInteger(n) && n >= 0) || ![c.health, c.cooldown, c.previousKeys, c.respawn, c.throwCharge, c.shockCounter, c.throwAnimation, c.fireAnimation, c.fireTimer].every(n => Number.isSafeInteger(n) && n >= 0) || c.shockCounter > 100 || c.throwCharge > 96 || c.throwAnimation > 25 || c.fireAnimation > 3 || typeof c.electrocuted !== 'boolean' || typeof c.throwing !== 'boolean' || typeof c.attacking !== 'boolean' || typeof c.onFire !== 'boolean' || !validShotArray(c.shots) || c.health > 100) return false;
  return typeof player.id === 'string' && ['x', 'y', 'z', 'rotation', 'vx', 'vy'].every(key => Number.isFinite(player[key as keyof PlayerState])) &&
    validCollisionLayer(player.collisionLayer) && validOptionalVerticalState(player) &&
    (player.vehicleId === undefined || Number.isSafeInteger(player.vehicleId)) &&
    (player.animation === undefined || (['entering', 'exiting', 'seated'] as const).includes(player.animation.kind) && Number.isFinite(player.animation.progress) && player.animation.progress >= 0 && player.animation.progress <= 1 && (player.animation.straightEntry === undefined || typeof player.animation.straightEntry === 'boolean')) &&
    (player.jump === undefined || validJump(player.jump)) &&
    (player.drowningTimer === undefined || (Number.isSafeInteger(player.drowningTimer) && player.drowningTimer >= 0)) &&
    (player.killer === undefined || typeof player.killer === 'string') &&
    (player.deathCause === undefined || ['weapon', 'run-over', 'explosion', 'fire', 'water'].includes(player.deathCause)) &&
    (player.movement === undefined || validPlayerMovement(player.movement)) &&
    typeof player.name === 'string' && player.name.length <= 32 && Number.isInteger(player.color) &&
    Number.isSafeInteger(player.score) && Number.isSafeInteger(player.kills) && Number.isSafeInteger(player.deaths) &&
    typeof player.ready === 'boolean' && Number.isFinite(player.armor) && player.armor >= 0 && player.armor <= 100 &&
    Number.isSafeInteger(player.money) && Number.isInteger(player.wanted) && player.wanted >= 0 && player.wanted <= 5 &&
    Number.isSafeInteger(player.team) && player.team >= 0 && player.team <= 3;
}
export function parseServerMessage(value: unknown): ServerMessage {
  if (!value || typeof value !== 'object') throw new ProtocolValidationError('Invalid server message');
  const message = value as ServerMessage;
  if (message.type === 'chat') {
    const chat = message.message;
    if (chat && Number.isSafeInteger(chat.id) && Number.isSafeInteger(chat.tick) && typeof chat.sender === 'string' && typeof chat.name === 'string' && typeof chat.text === 'string') return message;
    throw new ProtocolValidationError('Invalid server message');
  }
  if (!Number.isSafeInteger(message.tick) || message.tick < 0 || (message.inputAck !== undefined && (!Number.isSafeInteger(message.inputAck) || message.inputAck < 0)) || !Array.isArray(message.players) || !message.players.every(isPlayer)) throw new ProtocolValidationError('Invalid server message');
  if (message.pickups !== undefined && (!Array.isArray(message.pickups) || !message.pickups.every(p => p && Number.isInteger(p.id) && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) && validCollisionLayer(p.collisionLayer) && Number.isInteger(p.weapon) && p.weapon >= 0 && p.weapon < weaponSlotCount && Number.isSafeInteger(p.ammo) && p.ammo >= 0 && typeof p.active === 'boolean'))) throw new ProtocolValidationError('Invalid server message');
  if (message.traffic !== undefined && (!Array.isArray(message.traffic) || !message.traffic.every(validTrafficState))) throw new ProtocolValidationError('Invalid server message');
  if (message.npcs !== undefined && (!Array.isArray(message.npcs) || !message.npcs.every(validNpcState))) throw new ProtocolValidationError('Invalid server message');
  if (message.hazards !== undefined && (!Array.isArray(message.hazards) || !message.hazards.every(h => h && Number.isInteger(h.id) && [h.x, h.y, h.z, h.life].every(Number.isFinite) && validCollisionLayer(h.collisionLayer) && ['slick', 'mine', 'fire', 'blood', 'impact', 'skid', 'water'].includes(h.kind) && (h.owner === undefined || typeof h.owner === 'string') && (h.effect === undefined || h.effect === 'fire' || h.effect === 'explosion') && (h.explosionType === undefined || h.explosionType === 'small' || h.explosionType === 'item' || h.explosionType === 'large') && (h.sourceModel === undefined || Number.isInteger(h.sourceModel)) && (h.sourceTimer === undefined || Number.isInteger(h.sourceTimer)) && (h.armingTimer === undefined || Number.isInteger(h.armingTimer)) && (h.vehicleId === undefined || Number.isSafeInteger(h.vehicleId)) && (h.rotation === undefined || Number.isFinite(h.rotation)) && (h.scale === undefined || Number.isFinite(h.scale)) && (h.variant === undefined || Number.isSafeInteger(h.variant))))) throw new ProtocolValidationError('Invalid server message');
  if (message.events !== undefined && (!Array.isArray(message.events) || !message.events.every(validWorldEvent))) throw new ProtocolValidationError('Invalid server message');
  if (message.type === 'snapshot' && message.removedPlayers !== undefined && (!Array.isArray(message.removedPlayers) || !message.removedPlayers.every(id => typeof id === 'string'))) throw new ProtocolValidationError('Invalid server message');
  if (message.type === 'snapshot' && message.removedNpcs !== undefined && (!Array.isArray(message.removedNpcs) || !message.removedNpcs.every(id => Number.isSafeInteger(id) && id >= 0))) throw new ProtocolValidationError('Invalid server message');
  if (message.type === 'welcome' && message.version === PROTOCOL_VERSION && typeof message.id === 'string' && message.room?.room) return message;
  if (message.type === 'snapshot') return message;
  throw new ProtocolValidationError('Invalid server message');
}
