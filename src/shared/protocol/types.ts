export type PlayerControl =
  | 'forwardStart' | 'forwardEnd' | 'backwardStart' | 'backwardEnd'
  | 'leftStart' | 'leftEnd' | 'rightStart' | 'rightEnd'
  | 'sprintStart' | 'sprintEnd' | 'shootStart' | 'shootEnd'
  | 'weaponPrevious' | 'weaponNext' | 'enterVehicle' | 'jump';

export interface Input {
  seq: number;
  keys: number;
  clientTick?: number | undefined;
  /** Explicit control transitions. `keys` remains as a compatibility and
   * continuous-vector field while clients migrate to direct actions. */
  controls?: readonly PlayerControl[] | undefined;
  action?: 'enter' | 'jump' | undefined;
  vehicleId?: number | undefined;
  /** Optional normalized world-space walking direction from the joystick. */
  moveX?: number | undefined;
  moveY?: number | undefined;
}
/** Authoritative phase of a ped's vehicle occupancy transition. */
export type VehicleOccupancyState = 'approaching' | 'entering' | 'seated' | 'exiting';
export type VehicleSeatRole = 'driver' | 'passenger';
export type VehicleDoorPhase = 'closed' | 'opening' | 'open' | 'closing';
/**
 * Authoritative car damage presentation state.  The names follow the
 * observable stages in the original Car_BC damage machine: normal, dented,
 * fire effects, the 50-tick explosion countdown, and the authored wreck.
 */
export type VehicleDamagePhase = 'new' | 'dented' | 'burning' | 'exploding' | 'burned-out';
/** Source Char_B4 jump state, kept in the snapshot so every client renders
 * the same fixed-step arc and lands on the same floor. */
export type JumpPhase = 'rising' | 'apex' | 'falling';
export interface JumpState {
  phase: JumpPhase;
  /** Normalized progress through the source-style jump animation. */
  progress: number;
  /** Presentation height above `baseZ`, in GTA2 world pixels. */
  height: number;
  /** The floor-relative z captured when DoJump starts. */
  baseZ: number;
  /** Horizontal carry velocity captured at takeoff. */
  vx: number;
  vy: number;
  /** True when the current car footprint is marked `ped_jump` in CARI and
   * therefore remains solid to an airborne ped. */
  vehicleCollision?: boolean | undefined;
}
/**
 * The small amount of player movement state that the original Player/Ped
 * pair keeps between fixed ticks.  `turnSpeed` is stored in the source's
 * Ang16 units per tick (the source uses a 2048-unit circle), while `speed`
 * is in this runtime's world pixels per second.  Keeping these values in the
 * snapshot keeps the authoritative movement state available to clients.
 */
export interface PlayerMovementState {
  speed: number;
  turnSpeed: number;
  moveDirection: -1 | 0 | 1;
}
export interface VehicleOccupantState {
  id: string;
  /** Entry/exit animation state owned by the vehicle. Passenger order is the
   * vehicle's `passengers` array; index 0 is always the driver. */
  door: number;
  state: VehicleOccupancyState;
  progress: number;
  /** CARI's high-bit straight-entry marker selects base+0..7 poses. */
  straightEntry?: boolean | undefined;
}
export interface VehicleDoorState {
  phase: VehicleDoorPhase;
  /** Source Car_Door_10 animation frame, 0..4. */
  frame: number;
  /** Fixed-step countdown used by the source-style hold/open delay. */
  timer: number;
  occupant?: string | undefined;
}
export interface CombatShot {
  x: number; y: number; endX: number; endY: number; z: number; life: number;
  /** Launch velocity, including the shooter's movement at emission time. */
  vx?: number | undefined; vy?: number | undefined;
  weapon: number; projectile: boolean; impact?: boolean | undefined;
  /** Electrical beam presentation entry; impact entries with this flag are
   * intentionally replicated instead of being treated as expired projectiles. */
  beam?: boolean | undefined;
  /** Monotonic owner-local identity used to keep overlapping shots distinct. */
  sequence?: number | undefined;
}
export interface CombatState {
  weapon: number; ammo: number[]; health: number; cooldown: number; previousKeys: number; respawn: number;
  /** Char/Ped shock counter used by the source stun and electro weapons. */
  shockCounter: number;
  /** Source electrocuted state after field_210 reaches field_212 (100). */
  electrocuted: boolean;
  /** Source Ped::bOnFire and the attached fire object's burn clock. */
  onFire: boolean; fireTimer: number;
  /** Source Weapon_30 throw-charge state (grenade reaches 96 while held). */
  throwCharge: number; throwing: boolean;
  /** Remaining fixed ticks of the post-release Char_B4 throw sequence. */
  throwAnimation: number;
  /** Held non-throwable trigger. Source Player keeps the firing pose between
   * projectile emissions, so this is separate from the transient shot FX. */
  attacking: boolean;
  /** Fixed ticks remaining for the source firing pose after a successful shot. */
  fireAnimation: number;
  /** Active projectile shots and brief impact entries, so rapid fire can overlap in flight. */
  shots: CombatShot[];
}
export interface PickupState { id: number; x: number; y: number; z: number; weapon: number; ammo: number; active: boolean; collisionLayer?: number | undefined }
export type TrafficAiState = 'cruise' | 'yield' | 'brake' | 'turn' | 'stuck' | 'wrecked';
/** Authoritative controller owner for a vehicle. `inactive` is used while a
 * player owns the driver seat; it is intentionally distinct from a stopped
 * or blocked AI car. */
export type TrafficAiMode = 'inactive' | 'ordinary' | 'scripted' | 'chase' | 'emergency' | 'service';
/** Source-style high-level task. The task is authoritative metadata, not a
 * client command, and is optional so old snapshots remain readable. */
export type TrafficAiTask = 'none' | 'follow-road' | 'route' | 'goto' | 'chase' | 'service' | 'abandoned';
export type TrafficDirection = 'none' | 'north' | 'south' | 'east' | 'west';
export type TrafficPlannedTurn = 'none' | 'left' | 'right' | 'u-turn';
/** Source lane offsets are -2, -1, 0, 1, and 2. */
export type TrafficLaneTarget = -2 | -1 | 0 | 1 | 2;
export type TrafficLaneAlignment = 'unknown' | 'left' | 'center' | 'right';
export type TrafficSpeedClass = 'slow' | 'medium' | 'fast';
export interface TrafficState {
  id: number; x: number; y: number; z: number; rotation: number; speed: number; color: number;
  health: number; model?: number | undefined;
  /** Integer map collision layer; z remains the continuous support height. */
  collisionLayer?: number | undefined; grounded?: boolean | undefined; verticalVelocity?: number | undefined;
  /** Authoritative physics velocity and integrator state. */
  vx: number; vy: number; angularVelocity: number; throttle: number; brakePressure: number; handbrakeForce: number;
  /** Authored visual/damage state replicated so clients do not guess it. */
  damageFrame?: number | undefined; damageMask?: number | undefined; wreckTimer?: number | undefined; wrecked?: boolean | undefined; wreckModel?: number | undefined; paint?: number | undefined;
  /** Raw Car_BC field_74_damage value (0..32001), its threshold level, and
   * the derived presentation phase. `health` remains the public 0..100
   * compatibility value used by older clients. */
  damage?: number | undefined; damageLevel?: number | undefined; damagePhase?: VehicleDamagePhase | undefined;
  /** Water-cannon suppression persists while the source vehicle remains in a
   * burning damage phase; the next fire stream clears it. */
  fireExtinguished?: boolean | undefined;
  /** Source-style AI and vehicle presentation state. */
  aiState?: TrafficAiState | undefined; routeNode?: number | undefined; targetNode?: number | undefined; junction?: number | undefined; signal?: 'green' | 'red' | 'none' | undefined;
  /** Optional authoritative controller state. These fields are deliberately
   * optional for compatibility with older snapshots and parked-car fixtures. */
  aiActive?: boolean | undefined; aiMode?: TrafficAiMode | undefined; aiTask?: TrafficAiTask | undefined;
  routeId?: number | undefined; routeCursor?: number | undefined;
  arrowCursor?: number | undefined; arrowRun?: number | undefined;
  currentDirection?: TrafficDirection | undefined; targetDirection?: TrafficDirection | undefined;
  plannedTurn?: TrafficPlannedTurn | undefined;
  laneTarget?: TrafficLaneTarget | undefined; laneAlignment?: TrafficLaneAlignment | undefined;
  targetSpeed?: number | undefined; speedClass?: TrafficSpeedClass | undefined;
  yieldTimer?: number | undefined; obstacleTimer?: number | undefined; offRoadTimer?: number | undefined;
  allowSpecialRoute?: boolean | undefined;
  /** Public-transport service metadata. Ordinary traffic keeps this absent. */
  transport?: 'bus' | 'train' | undefined; serviceStop?: number | undefined; pursuitTarget?: string | undefined;
  brakeLights?: boolean | undefined; headlights?: boolean | undefined; emergencyLights?: boolean | undefined; horn?: boolean | undefined; doors?: number | undefined;
  /** Optional source attachment pose used by turret-mounted weapons. */
  turretRotation?: number | undefined;
  /** Installed weapon slots; absent means the chassis has no optional weapon upgrade. */
  mountedWeapons?: number[] | undefined;
  /** Trailer cab link used by the source car-bomb dispatch. */
  trailerId?: number | undefined;
  /** Ordered passenger references. Index 0 is the driver; when it leaves,
   * the next passenger shifts into the driver position. */
  passengers: string[];
  /** Door and transition animation state, owned by the vehicle rather than
   * duplicated on each player state. */
  occupants: VehicleOccupantState[];
  doorStates: VehicleDoorState[];
  doorLock?: 'unlocked' | 'locked' | 'player-only' | 'thief-only' | undefined;
  fireTicks?: number | undefined; collisionCooldown?: number | undefined;
}
export type NpcBehaviorState = 'idle' | 'walk' | 'panic' | 'flee' | 'attack' | 'knockdown' | 'dead' | 'entering' | 'driving';
export type NpcAnimation = 'idle' | 'walking' | 'running' | 'armed' | 'armedWalking' | 'armedRunning' | 'firing' | 'throwing' | 'throwingIdle' | 'jumping' | 'entering' | 'exiting' | 'falling' | 'knockdown' | 'dead' | 'lying' | 'lyingReverse' | 'electrocuted';
/** The current movement objective used to build a temporary pedestrian path. */
export interface PedestrianPathGoal {
  x: number;
  y: number;
  z: number;
  /** Present when the objective points at a navigation node rather than a moving actor. */
  nodeId?: number | undefined;
}
export interface NpcState {
  id: number; x: number; y: number; z: number; rotation: number; vx: number; vy: number; health: number; kind: 'civilian' | 'police';
  /** Source Char field_244_remap, resolved against the style's ped palette base. */
  remap?: number | undefined;
  /** Integer map collision layer; z remains the continuous support height. */
  collisionLayer?: number | undefined; grounded?: boolean | undefined; verticalVelocity?: number | undefined;
  state: NpcBehaviorState; animation: NpcAnimation;
  animationProgress?: number | undefined; animationStraightEntry?: boolean | undefined;
  target?: string | undefined; weapon?: number | undefined; weaponAmmo?: number | undefined; weaponCooldown?: number | undefined; pathIndex?: number | undefined;
  /** Temporary path written by the pathfinder for the current objective. */
  path?: number[] | undefined; pathPointIndex?: number | undefined; pathGoal?: PedestrianPathGoal | undefined;
  /** Source-style explicit patrol route and current authored waypoint. */
  patrolRoute?: number[] | undefined; patrolPointIndex?: number | undefined; waitTimer?: number | undefined;
  panicTimer?: number | undefined;
  /** Remaining fixed ticks in the authored lethal fall; zero selects the corpse pose. */
  deathTimer?: number | undefined;
  /** Source Char_B4's final lying orientation: state 15 or reverse state 16. */
  deathPose?: 'lying' | 'lyingReverse' | undefined;
  killer?: string | undefined; /** Source field_210_shock_counter. */ shockCounter: number;
  electrocuted: boolean;
  /** Replicated transient projectile/beam effects for remote pedestrians. */
  shots: CombatShot[];
  /** Source field_21C_bf.bOnFire and the attached fire effect's burn clock. */
  onFire: boolean; fireTimer: number;
  /** True while the current source-style route is traversing a road surface. */
  crossingRoad?: boolean | undefined;
  /** Source gang/remap relationship. Zero is neutral; positive values are gang ids. */
  faction?: number | undefined;
  /** Source-style short-lived threat target created by weapon-fired events. */
  threatenedBy?: string | undefined;
  threatTimer?: number | undefined;
  /** A dummy can keep the source jump arc while remote clients render it. */
  jump?: JumpState | undefined;
  /** Source Char_B4::sinking_20 countdown. The ped is still alive while it
   * sinks and is killed when this reaches zero. */
  drowningTimer?: number | undefined;
  deathCause?: 'weapon' | 'run-over' | 'explosion' | 'fire' | 'water' | undefined;
  vehicleId?: number | undefined;
}
export interface HazardState { id: number; x: number; y: number; z: number; kind: 'slick' | 'mine' | 'fire' | 'blood' | 'impact' | 'skid' | 'water'; life: number; owner?: string | undefined; collisionLayer?: number | undefined; /** Distinguishes one-shot blast visuals from persistent fire when no source model is present. */ effect?: 'fire' | 'explosion' | undefined; /** Source explosion family: 18/32 small, 19 item/car, or 20 large. */ explosionType?: 'small' | 'item' | 'large' | undefined; /** Exact Explosion_30 type used for wall-side dispatch and vehicle immunity. */ sourceExplosionType?: number | undefined; /** Authored code-object model for source-specific fire/explosion effects. */ sourceModel?: number | undefined; /** Remaining Explosion_30 timer when this is a source-timed blast. */ sourceTimer?: number | undefined; /** Countdown for an attached source object before it triggers its transition. */ armingTimer?: number | undefined; /** Vehicle that owns an attached source object such as a normal car bomb. */ vehicleId?: number | undefined; rotation?: number | undefined; scale?: number | undefined; variant?: number | undefined }
export interface MatchState { room: string; status: 'lobby' | 'playing' | 'finished'; maxPlayers: number; elapsed: number; ready: number }
export interface ChatMessage { id: number; sender: string; name: string; text: string; tick: number }
interface WorldEventPosition { id: number; tick: number; x: number; y: number; z: number }
export type WorldEvent =
  | (WorldEventPosition & { type: 'shot'; actor: string; weapon: number })
  | (WorldEventPosition & { type: 'hit'; actor?: string | undefined; target: string; weapon?: number | undefined; damage: number; lethal?: boolean | undefined })
  | (WorldEventPosition & { type: 'explosion'; actor?: string | undefined; entity?: number | undefined; weapon?: number | undefined; damage: number })
  | (WorldEventPosition & { type: 'pickup'; actor: string; entity: number; weapon: number })
  | (WorldEventPosition & { type: 'vehicle-enter'; actor: string; entity: number })
  | (WorldEventPosition & { type: 'vehicle-exit'; actor: string; entity: number })
  | (WorldEventPosition & { type: 'vehicle-damage'; actor?: string | undefined; entity: number; damage: number });
export type WorldEventInput = {
  [Type in WorldEvent['type']]: Omit<Extract<WorldEvent, { type: Type }>, 'id' | 'tick'>
}[WorldEvent['type']];
export interface PlayerState {
  combat: CombatState;
  id: string; x: number; y: number; z: number; rotation: number; vx: number; vy: number; collisionLayer?: number | undefined; grounded?: boolean | undefined; verticalVelocity?: number | undefined; vehicleId?: number | undefined;
  /** Presentation-only transition state. Occupancy ownership remains on the vehicle. */
  animation?: { kind: 'entering' | 'exiting' | 'seated'; progress: number; straightEntry?: boolean | undefined } | undefined;
  jump?: JumpState | undefined; movement?: PlayerMovementState | undefined;
  /** Replicated Char_B4 sinking_20 countdown before a water death. */
  drowningTimer?: number | undefined;
  name: string; color: number; score: number; kills: number; deaths: number; ready: boolean; armor: number; money: number; wanted: number; team: number;
  killer?: string | undefined; deathCause?: 'weapon' | 'run-over' | 'explosion' | 'fire' | 'water' | undefined;
}
export type { ClientCombatDto, ClientEventDto, ClientHazardDto, ClientNpcDto, ClientPickupDto, ClientPlayerDto, ClientServerMessage, ClientSnapshot, ClientTrafficDto, ClientWelcomeDto } from './client-dto';
import type { ClientServerMessage, ClientSnapshot } from './client-dto';
export type ServerMessage = ClientServerMessage;
/** Snapshot shape that is actually placed on the wire. */
export type Snapshot = ClientSnapshot;
export type ClientMessage = { type: 'input'; input: Input } | { type: 'chat'; text: string } | { type: 'ready'; ready: boolean } | { type: 'reset-world' } | { type: 'give-all-weapons' } | { type: 'set-police-attack'; enabled: boolean };

