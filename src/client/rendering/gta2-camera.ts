import { WORLD } from '../../shared/domain/world/world';
import type { PlayerState, TrafficState } from '../../shared/protocol/types';
import { occupantForPlayer } from '../../shared/domain/vehicles/vehicle-occupancy';
import { applyShake, computeBounds, updateDebugTarget, updateElevation } from './gta2-camera-motion';

/** The camera modes used by the original Player/Camera pair. */
export type CameraMode = 'follow' | 'debug';

/** Presentation-only camera input; it never enters the authoritative game. */
export interface CameraInput {
  north?: boolean;
  south?: boolean;
  west?: boolean;
  east?: boolean;
  zoomIn?: boolean;
  zoomOut?: boolean;
}

export interface CameraWorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface CameraPose {
  /** Browser world pixels. */
  x: number;
  y: number;
  /** GTA2 map z units, where one unit is one map level. */
  z: number;
  /** Source projection scale. Higher values show a smaller area. */
  zoom: number;
  /** Presentation-only pitch around the world X axis, in radians. */
  rotationX: number;
}

export interface CameraBounds extends CameraWorldBounds {
  expanded: CameraWorldBounds;
}

export interface CameraFrame {
  pose: CameraPose;
  previous: CameraPose;
  target: CameraPose;
  velocity: CameraVelocity;
  followSpeed: number;
  /** Authored map level of the subject the camera is following. */
  floorZ: number;
  facingAngle: number;
  elevation: number;
  mode: CameraMode;
  bounds: CameraBounds;
}

interface CameraSubject {
  x: number;
  y: number;
  z: number;
  rotation: number;
  vx: number;
  vy: number;
  vehicle: boolean;
  dead: boolean;
}

export interface CameraVelocity {
  x: number;
  y: number;
  z: number;
  zoom: number;
}

export interface CameraUpdateOptions {
  input?: CameraInput;
}

interface AnchorTransition {
  fromX: number;
  fromY: number;
  elapsed: number;
}

/**
 * Source-shaped camera state and update loop.
 *
 * Camera.cpp keeps separate pending, committed, current, and previous poses.
 * It then moves the current pose toward the committed target using fixed-step
 * acceleration. Keeping that model here avoids making the Three.js camera the
 * gameplay camera and gives every rendering path the same placement rules.
 */
export class Gta2Camera {
  static readonly DEFAULT_ZOOM = 0x38cc / 0x4000;
  static readonly DEATH_ZOOM = 0xe333 / 0x4000;
  /** Mobile screens need a wider view to keep the player and controls readable. */
  static readonly MOBILE_ZOOM_SCALE = 0.72;
  static readonly MAX_ELEVATION = 0x50000 / 0x4000;
  static readonly MAX_CAMERA_Z = 14;
  static readonly ELEVATION_STEP = 0x2000 / 0x4000;
  static readonly SOURCE_SCREEN_WIDTH = 640;
  static readonly SOURCE_SCREEN_HEIGHT = 480;
  static readonly PITCH_STEP = Math.PI / 18;
  static readonly MAX_PITCH = Math.PI * .35;
  /** Presentation-only response time for camera elevation and projection zoom. */
  static readonly ZOOM_SMOOTHING_SECONDS = 0.25;
  /** Keep the camera moving between the ped and car anchors during entry/exit. */
  static readonly ANCHOR_SMOOTHING_SECONDS = 0.25;
  /** Presentation-only response time for the speed-based forward offset. */
  static readonly LOOKAHEAD_SMOOTHING_SECONDS = 0.25;

  static readonly Z_BASE_OFFSET = 0x1c000 / 0x4000;
  static readonly VERTICAL_BOUNDARY_RATIO = 0x3000 / 0x4000;
  static readonly BOUNDARY_MARGIN = 0x3000 / 0x4000;
  /** Small presentation filter for replicated velocity used by follow lookahead. */
  private static readonly VELOCITY_LOOKAHEAD_THRESHOLD = 180;

  current: CameraPose = { x: 0, y: 0, z: 1, zoom: Gta2Camera.DEFAULT_ZOOM, rotationX: 0 };
  private previous: CameraPose = { ...this.current };
  target: CameraPose = { ...this.current };
  pending: CameraPose = { ...this.current };
  velocity: CameraVelocity = { x: 0, y: 0, z: 0, zoom: 0 };
  private initialized = false;
  private mode: CameraMode = 'follow';
  targetElevation = 0;
  /** Subject speed in world pixels per fixed game tick. */
  followSpeed = 0;
  private speedZoomEnabled = true;
  private lookaheadEnabled = true;
  private lookaheadOffset = { x: 0, y: 0 };
  shake = 0;
  private lastFloorZ = 0;
  private zoomScale = 1;
  private lastSubjectVehicle = false;
  private hasLastSubjectVehicle = false;
  private anchorTransition: AnchorTransition = { fromX: 0, fromY: 0, elapsed: Gta2Camera.ANCHOR_SMOOTHING_SECONDS };
  private anchorTransitionActive = false;
  mapBounds: CameraWorldBounds = { minX: 0, maxX: 256 * WORLD.tileSize, minY: -256 * WORLD.tileSize, maxY: 0 };
  viewportWidth = 640;
  viewportHeight = 480;

  setMapBounds(bounds: CameraWorldBounds) { this.mapBounds = { ...bounds }; }

  setViewport(width: number, height: number) {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
    const coarsePointer = typeof window !== 'undefined' && (
      window.matchMedia?.('(pointer: coarse)').matches === true ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
    );
    this.zoomScale = 1;
    if (this.viewportWidth <= 700 || coarsePointer) this.zoomScale = Gta2Camera.MOBILE_ZOOM_SCALE;
  }

  /** Set a loading-screen pose without marking the camera as initialized. */
  setInitialPose(pose: Partial<CameraPose>) {
    if (this.initialized) return;
    let initial: Partial<CameraPose> = pose;
    if (typeof pose.zoom === 'number') initial = { ...pose, zoom: pose.zoom * this.zoomScale };
    this.current = { ...this.current, ...initial };
    this.previous = { ...this.current };
    this.target = { ...this.current };
    this.pending = { ...this.current };
  }

  /** Reset an embedded diagnostic camera to an authored static pose. */
  setPose(pose: Partial<CameraPose>) {
    const next = { ...this.current, ...pose };
    this.current = { ...next };
    this.previous = { ...next };
    this.target = { ...next };
    this.pending = { ...next };
    this.velocity = { x: 0, y: 0, z: 0, zoom: 0 };
    this.initialized = true;
  }

  setMode(mode: CameraMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === 'debug') {
      // Detaching should freeze the camera where it is instead of snapping to
      // the last follow target before manual control begins.
      this.target = { ...this.current };
      this.pending = { ...this.current };
      this.velocity = { x: 0, y: 0, z: 0, zoom: 0 };
      this.lookaheadOffset = { x: 0, y: 0 };
    } else {
      // Follow mode retains GTA2's unrotated presentation. The free-camera
      // roll is restored when detached mode is selected again by the user.
      this.current.rotationX = 0;
      this.previous.rotationX = 0;
      this.target.rotationX = 0;
      this.pending.rotationX = 0;
    }
  }

  get targetPose() { return { ...this.target }; }

  /** Tilt the detached camera around the world X axis. */
  rotateX(radians: number) {
    if (this.mode !== 'debug' || !Number.isFinite(radians)) return;
    const rotationX = Math.max(-Gta2Camera.MAX_PITCH, Math.min(Gta2Camera.MAX_PITCH, this.target.rotationX + radians));
    this.current.rotationX = rotationX;
    this.previous.rotationX = rotationX;
    this.target.rotationX = rotationX;
    this.pending.rotationX = rotationX;
  }

  setSpeedZoomEnabled(enabled: boolean) {
    this.speedZoomEnabled = enabled;
  }

  setLookaheadEnabled(enabled: boolean) {
    this.lookaheadEnabled = enabled;
  }

  update(localPlayer: PlayerState | undefined, traffic: readonly TrafficState[], dtSeconds: number, options: CameraUpdateOptions = {}): CameraFrame {
    const input = options.input ?? {};
    let finiteDtSeconds = 0;
    if (Number.isFinite(dtSeconds)) finiteDtSeconds = dtSeconds;
    const dtTicks = Math.max(0, Math.min(4, finiteDtSeconds * WORLD.tickRate));

    this.updateElevation(input, dtTicks);

    const subject = this.resolveSubject(localPlayer, traffic);
    const hasSubject = localPlayer !== undefined;
    const subjectVehicle = subject.vehicle;
    if (this.mode !== 'debug' && hasSubject && this.hasLastSubjectVehicle && subjectVehicle !== this.lastSubjectVehicle) {
      this.anchorTransition = { fromX: this.current.x, fromY: this.current.y, elapsed: 0 };
      this.anchorTransitionActive = true;
    }
    this.followSpeed = 0;
    if (hasSubject && subject.vehicle) this.followSpeed = Math.hypot(subject.vx, subject.vy) / WORLD.tickRate;
    if (hasSubject) this.lastFloorZ = subject.z;
    const lookahead = this.updateLookahead(subject, hasSubject, dtSeconds);
    if (this.mode === 'debug') {
      this.updateDebugTarget(input, dtTicks);
    } else if (hasSubject) {
      this.pending = this.makeTarget(subject, lookahead);
    } else {
      this.pending = { ...this.target };
    }

    if (!this.initialized) {
      this.current = { ...this.pending };
      this.target = { ...this.pending };
      this.previous = { ...this.pending };
      this.initialized = true;
      this.velocity = { x: 0, y: 0, z: 0, zoom: 0 };
    } else {
      // Save the completed pose before moving it toward this tick's target.
      this.previous = { ...this.current };
      if (this.anchorTransitionActive) this.anchorTransition.elapsed = Math.min(Gta2Camera.ANCHOR_SMOOTHING_SECONDS, this.anchorTransition.elapsed + Math.max(0, dtSeconds));
      this.current = this.smoothPose(this.current, this.pending, dtSeconds, this.anchorTransitionActive);
      if (this.anchorTransitionActive && this.anchorTransition.elapsed === Gta2Camera.ANCHOR_SMOOTHING_SECONDS) {
        this.current.x = this.pending.x;
        this.current.y = this.pending.y;
        this.anchorTransitionActive = false;
      }
      this.target = { ...this.pending };
      this.velocity = { x: 0, y: 0, z: 0, zoom: 0 };
    }
    if (hasSubject) { this.lastSubjectVehicle = subjectVehicle; this.hasLastSubjectVehicle = true; }
    this.applyShake();
    const frame = this.frame(subject, hasSubject);
    // Consume the committed target, then commit the pending target for the next update.
    this.target = { ...this.pending };
    return frame;
  }

  private resolveSubject(localPlayer: PlayerState | undefined, traffic: readonly TrafficState[]): CameraSubject {
    const player = localPlayer;
    if (!player) return { x: this.current.x, y: this.current.y, z: this.lastFloorZ, rotation: 0, vx: 0, vy: 0, vehicle: false, dead: false };
    let vehicle: TrafficState | undefined;
    if (player.vehicleId !== undefined) vehicle = traffic.find(item => item.id === player.vehicleId);
    let occupant: ReturnType<typeof occupantForPlayer>;
    if (vehicle) occupant = occupantForPlayer(vehicle, player.id);
    // The ped remains the camera anchor while approaching a car. Once the
    // transition starts, the car is the stable anchor through entry and exit.
    if (vehicle && occupant?.state === 'seated') {
      // A seated player normally carries the authoritative vehicle velocity
      // in the same PlayerState fields. Keep the vehicle as a compatibility
      // fallback for snapshots from before that synchronization was enabled.
      const playerSpeed = Math.hypot(player.vx, player.vy);
      const vehicleSpeed = Math.hypot(vehicle.vx, vehicle.vy);
      let vx = vehicle.vx;
      if (playerSpeed > 1e-6 || vehicleSpeed <= 1e-6) vx = player.vx;
      let vy = vehicle.vy;
      if (playerSpeed > 1e-6 || vehicleSpeed <= 1e-6) vy = player.vy;
      return {
        x: player.x,
        y: player.y,
        z: player.z,
        rotation: player.rotation,
        vx,
        vy,
        vehicle: true,
        dead: player.combat.respawn > 0,
      };
    }
    if (vehicle && occupant?.state !== 'approaching') return this.vehicleSubject(vehicle, player.combat.respawn > 0);
    return {
      x: player.x,
      y: player.y,
      z: player.z,
      rotation: player.rotation,
      vx: player.vx,
      vy: player.vy,
      vehicle: false,
      dead: player.combat.respawn > 0,
    };
  }

  private vehicleSubject(vehicle: TrafficState, dead = false): CameraSubject {
    return {
      x: vehicle.x,
      y: vehicle.y,
      z: vehicle.z,
      rotation: vehicle.rotation,
      vx: vehicle.vx,
      vy: vehicle.vy,
      vehicle: true,
      dead,
    };
  }

  private updateLookahead(subject: CameraSubject, hasSubject: boolean, dtSeconds: number) {
    const desired = { x: 0, y: 0 };
    if (this.mode !== 'debug' && hasSubject && subject.vehicle && this.lookaheadEnabled) {
      const speed = Math.hypot(subject.vx, subject.vy);
      if (speed > Gta2Camera.VELOCITY_LOOKAHEAD_THRESHOLD) {
        const amount = Math.min(160, (speed - Gta2Camera.VELOCITY_LOOKAHEAD_THRESHOLD) * .24);
        desired.x = subject.vx / speed * amount;
        desired.y = subject.vy / speed * amount;
      }
    }
    const response = 1 - Math.exp(-Math.max(0, dtSeconds) / Gta2Camera.LOOKAHEAD_SMOOTHING_SECONDS);
    this.lookaheadOffset.x += (desired.x - this.lookaheadOffset.x) * response;
    this.lookaheadOffset.y += (desired.y - this.lookaheadOffset.y) * response;
    return { ...this.lookaheadOffset };
  }

  private makeTarget(subject: CameraSubject, lookahead: { x: number; y: number }): CameraPose {
    const sourceZ = Math.max(subject.z - 2, 1) + this.targetElevation;
    let baseZoom = Gta2Camera.DEFAULT_ZOOM;
    if (subject.dead) baseZoom = Gta2Camera.DEATH_ZOOM;
    const zoom = baseZoom * this.zoomScale;
    let x = subject.x;
    let y = subject.y;
    let z = Math.max(0, Math.min(Gta2Camera.MAX_CAMERA_Z, sourceZ));

    if (subject.vehicle && this.speedZoomEnabled) {
      const speed = Math.hypot(subject.vx, subject.vy);
      if (speed > Gta2Camera.VELOCITY_LOOKAHEAD_THRESHOLD) {
        z = Math.min(Gta2Camera.MAX_CAMERA_Z, z + Math.min(3, (speed - Gta2Camera.VELOCITY_LOOKAHEAD_THRESHOLD) / 240));
      }
    }

    x += lookahead.x;
    y += lookahead.y;

    return { x, y, z, zoom, rotationX: this.target.rotationX };
  }

  private smoothPose(current: CameraPose, target: CameraPose, dtSeconds: number, transitionActive: boolean): CameraPose {
    const response = 1 - Math.exp(-Math.max(0, dtSeconds) / Gta2Camera.ZOOM_SMOOTHING_SECONDS);
    const blend = (from: number, to: number) => {
      if (Math.abs(to - from) < 1e-4) return to;
      return from + (to - from) * response;
    };
    if (!transitionActive) return { ...target, z: blend(current.z, target.z), zoom: blend(current.zoom, target.zoom) };
    const progress = this.anchorTransition.elapsed / Gta2Camera.ANCHOR_SMOOTHING_SECONDS;
    const eased = progress * progress * (3 - 2 * progress);
    return {
      ...target,
      x: this.anchorTransition.fromX + (target.x - this.anchorTransition.fromX) * eased,
      y: this.anchorTransition.fromY + (target.y - this.anchorTransition.fromY) * eased,
      z: blend(current.z, target.z),
      zoom: blend(current.zoom, target.zoom),
    };
  }

  private updateElevation(input: CameraInput, dtTicks: number) { updateElevation(this, input, dtTicks); }

  private updateDebugTarget(input: CameraInput, dtTicks: number) { updateDebugTarget(this, input, dtTicks); }

  private applyShake() { applyShake(this); }

  private frame(subject: CameraSubject, hasSubject: boolean): CameraFrame {
    const bounds = this.computeBounds();
    let facingAngle = 0;
    if (hasSubject) facingAngle = subject.rotation;
    if (hasSubject && subject.vehicle) {
      const headingX = -Math.sin(subject.rotation), headingY = Math.cos(subject.rotation);
      if (subject.vx * headingX + subject.vy * headingY < -1) facingAngle += Math.PI;
    }
    let floorZ = this.lastFloorZ;
    if (hasSubject) floorZ = subject.z;
    return {
      pose: { ...this.current },
      previous: { ...this.previous },
      target: { ...this.target },
      velocity: { ...this.velocity },
      followSpeed: this.followSpeed,
      floorZ,
      facingAngle: normalizeAngle(facingAngle),
      elevation: this.targetElevation,
      mode: this.mode,
      bounds,
    };
  }

  private computeBounds() { return computeBounds(this); }
}

function normalizeAngle(value: number) {
  const circle = Math.PI * 2;
  const normalized = value % circle;
  if (normalized < 0) return normalized + circle;
  return normalized;
}
