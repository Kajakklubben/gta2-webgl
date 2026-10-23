import { describe, expect, it } from 'vitest';
import { Gta2Camera } from '../../client/rendering/gta2-camera';
import type { PlayerState, TrafficState } from '../../shared/protocol/types';
import { newCombat } from '../../shared/domain/combat/weapons';

const player = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'player', x: 100, y: -200, z: 0, rotation: 0, vx: 0, vy: 0, name: 'Player', color: 0, score: 0, kills: 0, deaths: 0, ready: true, armor: 0, money: 0, wanted: 0, team: 0, combat: newCombat(), ...overrides,
});

const car = (overrides: Partial<TrafficState> = {}): TrafficState => ({
  id: 7, model: 0, x: 320, y: -400, z: 0, rotation: 0, speed: 0, vx: 0, vy: 0,
  color: 0, passengers: [], occupants: [], doorStates: [], health: 100, ...overrides,
  angularVelocity: overrides.angularVelocity ?? 0, throttle: overrides.throttle ?? 0, brakePressure: overrides.brakePressure ?? 1, handbrakeForce: overrides.handbrakeForce ?? 0,
});

describe('source-shaped GTA2 camera', () => {
  it('starts on the player anchor and preserves the authored floor level', () => {
    const camera = new Gta2Camera();
    const frame = camera.update(player({ z: 2 }), [], 1 / 30);
    expect(frame.pose).toMatchObject({ x: 100, y: -200, z: 1, zoom: Gta2Camera.DEFAULT_ZOOM });
    expect(frame.floorZ).toBe(2);
    expect(frame.previous).toEqual(frame.pose);
  });

  it('follows the player position directly', () => {
    const camera = new Gta2Camera();
    camera.update(player(), [], 1 / 30);
    const frame = camera.update(player({ x: 500, y: -600 }), [], 1 / 30);
    expect(frame.pose).toMatchObject({ x: 500, y: -600 });
    expect(frame.previous.x).toBe(100);
  });

  it('smooths vertical zoom changes without lagging horizontally', () => {
    const camera = new Gta2Camera();
    camera.update(player(), [], 1 / 30);
    const frame = camera.update(player({ x: 500 }), [], 1 / 30, { input: { zoomOut: true } });
    expect(frame.pose.x).toBe(500);
    expect(frame.pose.z).toBeGreaterThan(1);
    expect(frame.pose.z).toBeLessThan(frame.target.z);
  });

  it('follows the vehicle during occupancy transitions but the ped while approaching', () => {
    const vehicle = car();
    const traffic = [vehicle];
    const camera = new Gta2Camera();
    vehicle.passengers = ['player']; vehicle.occupants = [{ id: 'player', door: 0, state: 'approaching', progress: 0 }];
    camera.update(player({ vehicleId: vehicle.id }), traffic, 1 / 30);
    expect(camera.targetPose.x).toBe(100);
    vehicle.passengers = ['player']; vehicle.occupants = [{ id: 'player', door: 0, state: 'entering', progress: 0 }];
    camera.update(player({ vehicleId: vehicle.id }), traffic, 1 / 30);
    expect(camera.targetPose.x).toBe(vehicle.x);
  });

  it('smooths the camera anchor when entry or exit switches between ped and car', () => {
    const vehicle = car({ x: 320, y: -400 });
    const traffic = [vehicle];
    const camera = new Gta2Camera();
    vehicle.passengers = ['player']; vehicle.occupants = [{ id: 'player', door: 0, state: 'approaching', progress: 0 }];
    camera.update(player({ vehicleId: vehicle.id }), traffic, 1 / 30);

    vehicle.occupants = [{ id: 'player', door: 0, state: 'entering', progress: 0 }];
    const entering = camera.update(player({ vehicleId: vehicle.id }), traffic, 1 / 30);
    expect(entering.target.x).toBe(vehicle.x);
    expect(entering.pose.x).toBeGreaterThan(100);
    expect(entering.pose.x).toBeLessThan(vehicle.x);

    const exiting = camera.update(player({ x: 360, y: -400 }), [], 1 / 30);
    expect(exiting.target.x).toBe(360);
    expect(exiting.pose.x).toBeGreaterThan(entering.pose.x);
    expect(exiting.pose.x).toBeLessThan(360);
  });

  it('flips the exposed facing angle when a car is reversing', () => {
    const camera = new Gta2Camera();
    const frame = camera.update(player({ vehicleId: 7 }), [car({ vy: -30, passengers: ['player'], occupants: [{ id: 'player', door: 0, state: 'seated', progress: 1 }] })], 1 / 30);
    expect(frame.facingAngle).toBeCloseTo(Math.PI);
  });

  it('supports detached camera movement without changing gameplay state', () => {
    const camera = new Gta2Camera();
    camera.update(player(), [], 1 / 30);
    camera.setMode('debug');
    const frame = camera.update(player(), [car({ x: 640 })], 1 / 30, {
      input: { east: true },
    });
    expect(frame.mode).toBe('debug');
    expect(frame.floorZ).toBe(0);
    expect(camera.targetPose.x).toBeGreaterThan(100);
  });

  it('tilts the detached camera around the world X axis', () => {
    const camera = new Gta2Camera();
    camera.update(player(), [], 1 / 30);
    camera.setMode('debug');
    camera.rotateX(Gta2Camera.PITCH_STEP);
    expect(camera.targetPose.rotationX).toBeCloseTo(Gta2Camera.PITCH_STEP);
    expect(camera.update(player(), [], 1 / 30).pose.rotationX).toBeCloseTo(Gta2Camera.PITCH_STEP);
    camera.rotateX(-Gta2Camera.PITCH_STEP);
    expect(camera.targetPose.rotationX).toBeCloseTo(0);
  });
});
