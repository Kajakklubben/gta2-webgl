import { GTA2_CAR_FIRE_SPRITES } from '../../domain/world/gta2-sprites';
import { SOURCE_FIX16_ONE, WORLD } from '../../domain/world/world';
import type { GameObjectPlacement, GameObjectSprite } from '../gameobjects/gameobject';

export interface CarFireParticleOptions {
  readonly sourceModel: number;
  readonly sequence: readonly number[];
  readonly animationAge: number;
  readonly placement: GameObjectPlacement;
  readonly vehicleVelocityX: number;
  readonly vehicleVelocityY: number;
}

/** Build the independent flame particles emitted by an attached vehicle fire. */
export function sourceCarFireParticles({
  sourceModel,
  sequence,
  animationAge,
  placement: basePlacement,
  vehicleVelocityX,
  vehicleVelocityY,
}: CarFireParticleOptions): GameObjectSprite[] {
  // Car flames should billow rather than flicker through their source frames
  // at the simulation tick rate. Keep the large burst's authored scale
  // progression, but give both fire levels a slower, longer pulse.
  const particleLifetime = 40;
  const emissionSpacing = 2;
  const particleSlots = 16;
  const particles: GameObjectSprite[] = [];
  const worldPerSourceUnit = WORLD.tileSize / SOURCE_FIX16_ONE;
  const isSmall = sourceModel === GTA2_CAR_FIRE_SPRITES.small.start;
  // The source rise is quite pronounced at our world scale; soften it so
  // the flame lingers over the car instead of shooting upward.
  let riseSourceUnits = 0x1A0;
  let zSourceUnits = 0x10;
  if (isSmall) {
    riseSourceUnits = 0x52;
    zSourceUnits = 0xA3;
  }
  const risePerTick = riseSourceUnits * worldPerSourceUnit;
  const zPerTick = zSourceUnits * worldPerSourceUnit;
  const velocityPerTickX = vehicleVelocityX / WORLD.tickRate;
  const velocityPerTickY = vehicleVelocityY / WORLD.tickRate;

  for (let index = 0; index < particleSlots; index++) {
    const emittedAt = index * emissionSpacing;
    if (animationAge < emittedAt) continue;
    const age = (animationAge - emittedAt) % particleLifetime;
    let frame = Math.min(sequence.length - 1, age);
    if (isSmall) {
      frame = 0;
      if (age !== 0) frame = Math.min(sequence.length - 1, 1 + Math.floor((age - 1) / 6));
    } else {
      frame = Math.min(sequence.length - 1, Math.floor(age / 2));
    }
    let phase = index * 1.73;
    if (sourceModel === GTA2_CAR_FIRE_SPRITES.wreck.start) phase += .7;
    let lateralDistance = 2.5;
    let forwardDistance = 1.4;
    if (isSmall) {
      lateralDistance = 1.5;
      forwardDistance = .8;
    }
    const lateral = Math.sin(phase) * lateralDistance;
    const forward = Math.cos(phase) * forwardDistance;
    const placement = {
      ...basePlacement,
      x: basePlacement.x - velocityPerTickX * age + lateral + Math.sin(phase + age * .16) * .7,
      y: basePlacement.y - velocityPerTickY * age - risePerTick * age + forward,
      z: basePlacement.z + zPerTick * age,
    };
    let scale = 1;
    if (isSmall) scale = 1.35;
    else scale = 1 + Math.min(15, frame) * (0x666 / SOURCE_FIX16_ONE);
    const model = sequence[0];
    if (typeof model !== 'number') return particles;
    let opacity = .72;
    if (isSmall) opacity = .62 + .38 * (1 - age / particleLifetime);
    particles.push({
      atlas: 'codeObjects', model, modelSequence: sequence,
      sourceSequence: sourceModel === GTA2_CAR_FIRE_SPRITES.small.start ? 'car-fire-small' : sourceModel === GTA2_CAR_FIRE_SPRITES.large.start ? 'car-fire-large' : 'car-fire-wreck',
      sourceModel,
      animation: 'fire', frame, frameCount: sequence.length, loop: false,
      frameTicks: 1, placement, scale,
      // The source uses SetBlendAndAlpha(2, 15) for the expanding bursts;
      // the alpha is intentionally softer than an explosion ring.
      opacity,
      alphaTest: .01,
      presentation: { band: 'overlay' },
      fallbackColor: 0xff8a3d,
    });
  }
  return particles;
}
