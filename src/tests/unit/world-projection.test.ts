import { describe, expect, it } from 'vitest';
import { createTopDownCamera, setTopDownCamera, TOP_DOWN_PITCH } from '../../client/rendering/world-projection';
import { WORLD, worldActorSurfaceZ, worldEntityZ, worldSurfaceZ } from '../../shared/domain/world/world';

describe('shared world z projection', () => {
  it('maps an actor support height to the lid of its containing block', () => {
    const blockLayer = 3;
    const supportHeight = blockLayer + 1;
    expect(worldActorSurfaceZ(supportHeight)).toBe(worldSurfaceZ(blockLayer));
    expect(worldEntityZ(supportHeight)).toBe(worldSurfaceZ(blockLayer) + WORLD.render.entityZOffset);
  });

  it('keeps adjacent support heights one map tile apart', () => {
    expect(worldActorSurfaceZ(5) - worldActorSurfaceZ(4)).toBe(WORLD.tileSize);
  });

  it('uses the fixed overhead perspective camera', () => {
    const camera = createTopDownCamera(640, 480);
    setTopDownCamera(camera, 100, -200, 400, 640, 480);
    expect(camera.isPerspectiveCamera).toBe(true);
    expect(camera.position.y).toBeCloseTo(-200);
    expect(camera.position.z).toBeCloseTo(400);
    expect(camera.aspect).toBeCloseTo(640 / 480);
    expect(Math.atan2(-200 - camera.position.y, camera.position.z)).toBeCloseTo(TOP_DOWN_PITCH);
  });

  it('applies detached-camera X tilt after the overhead look-at', () => {
    const camera = createTopDownCamera(640, 480);
    const rotationX = Math.PI / 4;
    setTopDownCamera(camera, 100, -200, 400, 640, 480, rotationX);
    expect(camera.rotation.x).toBeCloseTo(rotationX);
  });
});
