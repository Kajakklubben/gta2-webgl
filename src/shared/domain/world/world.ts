/**
 * Shared world scale. Asset-authored distances live on GTA2's 64-pixel
 * tile grid. Runtime state uses world pixels, and the fixed-step loop converts
 * rates to per-tick movement through `STEP`.
 */
const TICK_RATE = 30;
/** GTA2 Fix16 stores one whole map unit as 0x4000 (14 fractional bits). */
export const SOURCE_FIX16_ONE = 0x4000;
/** Ped::FindUsableCarDoor accepts velocities through Fix16(0xCCC). */
const SOURCE_VEHICLE_OCCUPANCY_SPEED = 0xCCC / SOURCE_FIX16_ONE * 64 * TICK_RATE;
/** Char_B4's authored run/jump velocity: 4 * 256 raw Fix16 units/tick. */
const SOURCE_PLAYER_RUN_SPEED = 4 * 256;
/** Char_B4 switches from walking to running above the 2 * 256 collision-repulsion speed. */
const SOURCE_PLAYER_RUN_ANIMATION_SPEED = 2 * 256;
/** GTA2's Ang16 values use 2048 units for a complete turn. */
export const SOURCE_ANG16_CIRCLE = 2048;
export const WORLD = {
  tickRate: TICK_RATE,
  /** GTA2's map and sprite coordinate grid. One tile is one 64px sprite unit. */
  tileSize: 64,
  /** The native physics backend uses metres; gameplay coordinates stay in GTA2 world pixels. */
  physicsUnitsPerWorldUnit: 10,
  player: {
    /** Movement rates are authored in tiles per second; convert at the boundary. */
    walkSpeed: SOURCE_PLAYER_RUN_SPEED / SOURCE_FIX16_ONE * TICK_RATE,
    sprintMultiplier: 3,
    /**
     * Player.cpp keeps these as Ang16/Fix16 values and applies them once per
     * fixed world tick.  Keep the authored values together so the browser
     * movement integrator cannot silently drift from the source constants.
     */
    source: {
      turnAcceleration: 20,
      maxTurnSpeed: 48,
      jumpTurnAcceleration: 4,
      maxJumpTurnSpeed: 24,
      attackTurnAcceleration: 12,
      runSpeed: 4 * 256,
      speedAcceleration: 256 / 4,
    },
    /** Legacy public rate retained for callers that display a turn setting. */
    turnRate: 3.6,
    radius: 10,
    /** Runtime pixels per second for Char_B4's armed-running state. */
    runAnimationThreshold: SOURCE_PLAYER_RUN_ANIMATION_SPEED / SOURCE_FIX16_ONE * 64 * TICK_RATE,
    /** Source DoJump uses a fixed-step arc and carries the ped forward. */
    jumpDuration: 17 / TICK_RATE,
    jumpHeight: 32,
    jumpSpeed: SOURCE_PLAYER_RUN_SPEED / SOURCE_FIX16_ONE * 64 * TICK_RATE,
    /** Char_B4::state_8_5520A0 keeps a drowning ped in sinking_20 for ten
     * fixed updates before Kill_46F9D0 is called. */
    waterDeathTicks: 10,
    /** Player::Wasted_567130 uses a 70-tick network death countdown. */
    deathCountdown: 70,
  },
  vehicle: {
    /** Fallback mirrors the Romero max_speed when a legacy snapshot has no GCI record. */
    forwardSpeed: .245 * TICK_RATE,
    boostMultiplier: 1.5,
    reverseSpeed: 180 / 64,
    turnRadius: 46,
    lowSpeedTurnRate: 3.2,
    maxTurnRate: 6.4,
    exitDistance: 42,
    /** Maximum centre-to-ped distance for an untargeted enter action. The
     * source EnterCarStateMachine abandons a car only beyond four map tiles;
     * once selected, the ped walks to the authored phase-0 door pose. */
    enterDistance: 4 * 64,
    /** Source FindUsableCarDoor/CanExitCar low-speed gate in world pixels/s. */
    occupancySpeedLimit: SOURCE_VEHICLE_OCCUPANCY_SPEED,
    /** Fixed-step ped transition length for non-straight CARI doors. */
    occupancyTransitionTicks: 8,
    collisionDistance: 34,
    collisionPush: 24,
    /**
     * Char_B4::HandleCarImpact_5538A0 does not use the car's raw speed as a
     * boolean kill switch.  It clamps the collision impulse to the source run
     * speed, then compares it with Fix16(0x666), Fix16(0xCCC), and
     * Fix16(0x1333).  Keep those thresholds in browser world units so the
     * authoritative collision path can preserve the source's pedestrian
     * outcome bands.
     */
    pedestrianImpact: {
      /** gRunOrJumpSpeed_6FD7D0: 4 * 256 Fix16 units per source tick. */
      minimum: SOURCE_PLAYER_RUN_SPEED / SOURCE_FIX16_ONE * 64 * TICK_RATE,
      /** kFpPoint1_6FD824: below this, a standing ped is knocked down. */
      npcLethal: 0x666 / SOURCE_FIX16_ONE * 64 * TICK_RATE,
      /** dword_6FD82C: player hits in this band kill only when the car is
       * driven by a player; an AI/empty car knocks the player down. */
      playerDriverLethal: 0xCCC / SOURCE_FIX16_ONE * 64 * TICK_RATE,
      /** kFpPoint3_6FD830: unconditional player lethal threshold. */
      playerLethal: 0x1333 / SOURCE_FIX16_ONE * 64 * TICK_RATE,
      /** Ignore resting overlap; ProcessPedImpact is reached from a moving
       * car collision in the source, not from every broad-phase touch. */
      contactTrigger: 30,
    },
    collisionDamageSpeed: 150,
    /** GCI velocity values are map-tile units per fixed fixed world tick. */
    gciSpeedScale: TICK_RATE,
    reverseRatio: 0.7,
    /** CarPhysics_B0 accumulates a 0..5 gas pedal by 0.25 per source tick. */
    gasPedalMax: 5,
    gasPedalStep: .25,
    /** Turbo revs engage once the source pedal reaches 3. */
    turboRevThreshold: 3,
    /** Fixed-point GCI force is converted from tile/tick² to pixel/s² here. */
    gciAccelerationScale: 64 * TICK_RATE * TICK_RATE,
    /** CarPhysics_B0 steering and stabilization constants, kept in source units. */
    source: {
      /** dword_6FE37C / dword_6FE1C4 (0xA3): minimum impulse/mass used by
       * ApplyImpactForcesAndDamage before a world-contact consequence. */
      impactDamageVelocity: 0xA3 / SOURCE_FIX16_ONE * 64 * TICK_RATE,
      /** FastCarMinVelocity_6FE1CC (0x1EB): impact particle/area threshold. */
      fastImpactVelocity: 0x1EB / SOURCE_FIX16_ONE * 64 * TICK_RATE,
      /** dword_6FE228 (0x2666): speed-squared steering falloff ceiling. */
      steeringSpeedSquared: 0x2666 / SOURCE_FIX16_ONE,
      /** dword_6FE104 (0x3333): player steering normalization denominator. */
      steeringReferenceScale: 0x3333 / SOURCE_FIX16_ONE,
      /** dword_6FE374 (0xCCC + 0x333): minimum speed factor. */
      steeringMinimumFactor: (0xCCC + 0x333) / SOURCE_FIX16_ONE,
      /** Fix16_To_Ang16_40F540: source steering values become Ang16 radians
       * through raw/71, then the renderer's 2048-unit circle. */
      steeringAngleScale: SOURCE_FIX16_ONE / 71 * (Math.PI * 2 / SOURCE_ANG16_CIRCLE),
      /** dword_6FE340 (3 + .8) used by CalculateRearWheelForce. */
      rearSteeringDenominator: (3 + 0.8) * (0x2666 / SOURCE_FIX16_ONE),
      /** dword_6FE100: lateral velocity damping on grounded cars. */
      groundLateralDamping: 1 - 0x666 / SOURCE_FIX16_ONE,
      /** dword_6FE0FC: longitudinal velocity damping on grounded cars. */
      groundLongitudinalDamping: 1 - 0x1EB / SOURCE_FIX16_ONE,
      /** dword_6FE318: angular velocity damping on grounded cars. */
      groundAngularDamping: 1 - 0x7AE / SOURCE_FIX16_ONE,
      /** dword_6FE148: the authored wheel rolling-friction coefficient. */
      wheelLongitudinalFriction: 0x8E5 / SOURCE_FIX16_ONE,
      /** kFP16One128th: near-zero velocity branch in StabilizeVelocityAtSpeed. */
      velocityZeroThreshold: 0x80 / SOURCE_FIX16_ONE,
      /** Airborne branch of StabilizeVelocityAtSpeed (dword_6FE334). */
      airLateralDamping: 1 - 0x333 / SOURCE_FIX16_ONE,
      /** Airborne longitudinal damping (dword_6FDFBC). */
      airLongitudinalDamping: 1 - 0x1EB / SOURCE_FIX16_ONE,
      /** Airborne angular damping (dword_6FDF18). */
      airAngularDamping: 1 - 0x3D7 / SOURCE_FIX16_ONE,
      /** HandleGravityOnSlope_55AA00's fixed acceleration (dword_6FDF3C). */
      slopeGravityAcceleration: (0x28F / SOURCE_FIX16_ONE) * 64 * TICK_RATE * TICK_RATE,
      /** ApplyBrakePhysics feeds 0x3333/.4000 of brake friction to the front axle. */
      frontBrakeShare: 0x3333 / SOURCE_FIX16_ONE,
      /** The rear axle receives the complementary 1 - front share. */
      rearBrakeShare: 1 - 0x3333 / SOURCE_FIX16_ONE,
      /** Rear hand-brake pressure rises by one byte unit per source tick. */
      handbrakePressureStep: 1 / 128,
    },
    velocityResponse: 9,
    steeringResponse: 12,
    lateralGrip: 8,
    coastingDrag: 2.6,
    brakingDrag: 9,
    /** CarPhysics_B0 increments brake pressure by one quarter per tick. */
    brakePressureResponse: .25,
    /** World-pixel/s² scale applied to authored brake friction. */
    brakeForceScale: 240,
    collisionRestitution: .08,
    collisionFriction: .72,
    /** Applied directly after each source physics slice; the old torque-style
     * damping is kept at zero so it cannot be applied twice. */
    angularDamping: 0,
  },
  traffic: {
    /** The source fallback speed is Fix16(0x147), in map units per tick. */
    baseSpeed: 0x147 / SOURCE_FIX16_ONE * TICK_RATE,
    speedStep: 0x100 / SOURCE_FIX16_ONE * TICK_RATE,
    /** Civilian and police speeds are authored in the same tile grid. */
    civilianSpeed: 58 / 64,
    policeSpeed: 105 / 64,
    /** Police remain ordinary walking pedestrians until police combat is enabled. */
    policeAttackPlayer: false,
    policeAttackRadius: 650,
    policePursuitRadius: 900,
    policeArrestRadius: 28,
    /**
     * Decompiled GetRandomTrafficSpeed_583750 bands, in GCI max_speed units.
     * These are the four Fix16 globals used by the original traffic spawner:
     * 0x1EB, 0xCCC, 0x1333 and 0x1999.
     */
    gciSpeedBands: {
      slow: [0x1eb / SOURCE_FIX16_ONE, 0xccc / SOURCE_FIX16_ONE],
      medium: [0xccc / SOURCE_FIX16_ONE, 0x1333 / SOURCE_FIX16_ONE],
      fast: [0x1333 / SOURCE_FIX16_ONE, 0x1999 / SOURCE_FIX16_ONE],
    },
    /** CarAI_78::UpdateDrivingAI_452DF0 speed-control thresholds. */
    source: {
      /** dword_677B70: the default target used unless the authored target is lower. */
      defaultTargetSpeed: 0x3d7 / SOURCE_FIX16_ONE,
      /** dword_677B78: foot-brake threshold. */
      footBrakeSpeed: 0x5c2 / SOURCE_FIX16_ONE,
      /** dword_6779B8: brake-and-handbrake threshold. */
      handbrakeSpeed: 0x666 / SOURCE_FIX16_ONE,
    },
  },
  interaction: {
    pickupRadius: 34,
    sameFloor: 1,
  },
  projectile: {
    /** ObjectDefinitions_8CA8: model 254 uses Fix16(0xCCC) per source tick. */
    bulletSpeed: 0xCCC / SOURCE_FIX16_ONE * TICK_RATE,
    /** Particle_8's flame stream advances by dword_6FD2E8=Fix16(0x666). */
    flameSpeed: 0x666 / SOURCE_FIX16_ONE * TICK_RATE,
    /** Particle_4C state 31 survives through the source terminal flame state. */
    flameSegmentLifetimeTicks: 27,
    /** Explosion_30::EmitFireTrail_5 changes forever to a 20-tick ground fire
     * once the attached moving object has stopped. */
    molotovFireTicks: 20,
    /** ObjectDefinitions_8CA8: rocket 128 and shotgun 192 use Fix16(0x1999). */
    rocketSpeed: 0x1999 / SOURCE_FIX16_ONE * TICK_RATE,
    /** The electro baton object uses the source's intermediate object speed;
     * keeping it between ordinary bullets and rockets preserves its short,
     * but still moving, baton window. */
    electroSpeed: 0x1333 / SOURCE_FIX16_ONE * TICK_RATE,
    /** Throwable objects start from the source's Fix16(0x666) base before
     * Weapon_30's charge formula replaces the launch speed. */
    thrownSpeed: 0x666 / SOURCE_FIX16_ONE * TICK_RATE,
    /**
     * Weapon_30::throwable_5DDFC0 stores its throw velocity as a GTA2
     * Fix16 value (14 fractional bits) per fixed world tick.  Keep the raw
     * values here rather than folding them into the browser's pixel/second
     * constants: the source uses a different base for grenades and molotovs,
     * then adds the carried-ped velocity only when the ped is moving.
     */
    sourceThrow: {
      fix16Scale: 1 / 0x4000,
      grenadeBase: 0xA3,
      molotovBase: 0x147,
      sharedRamp: 0x666,
      carriedVelocity: 0x340,
      /** NewMovingObjUnlessBlocked receives dword_706CF0 as z speed. */
      verticalSpeed: (0x666 / 0x4000) * TICK_RATE,
      /** Object_5C initializes Object_3C::field_1C_z_accel to
       * kObjectGravity_6F8DA8 = Fix16(-0x8).  dword_706F64=0x20 is the
       * throw friction argument, not the airborne gravity. */
      // Object_2C::z is stored in map-layer units, unlike x/y which are
      // rendered pixels.  Do not apply the tile-size conversion here.
      gravity: -(0x8 / SOURCE_FIX16_ONE) * TICK_RATE * TICK_RATE,
    },
    /** Keep impacts visible even for short-range weapons. */
    minimumTravelTicks: 8,
    /** Explosion_30::GetBlastRadius for type 18 is Fix16 half a tile. */
    sourceSmallExplosionRadius: 32,
    /** Explosion_30 timers start at 100 and count down to zero. */
    sourceExplosionTicks: 100,
  },
  combat: {
    /** Ped::field_212_electrocution_threshold. */
    electrocutionThreshold: 100,
  },
  render: {
    cameraHeight: 400,
    entityZOffset: 7,
    projectileZOffset: 8,
    labelZOffset: 6,
  },
  /** Vertical support is solved separately from planar engine physics movement. */
  vertical: {
    gravity: 18,
    terminalVelocity: 24,
    snapDistance: .08,
  },
} as const;

export const tileToWorld = (tile: number) => tile * WORLD.tileSize;
export const tilesPerSecondToWorld = tileToWorld;
/** Convert a decoded Fix16 velocity (already divided by 0x4000) to world px/s. */
export const sourceFixedPerTickToWorld = (value: number) => value * WORLD.tileSize * WORLD.tickRate;
/** Convert a raw source Fix16 value (the integer stored in the executable). */
export const sourceFixedRawPerTickToWorld = (value: number) => sourceFixedPerTickToWorld(value / SOURCE_FIX16_ONE);
/** Convert a map-grid location whose integer is the rendered tile centre. */
export const tileLocationToWorld = (x: number, y: number, z = 0) => ({ x: tileToWorld(x), y: -tileToWorld(y), z });
/**
 * Convert a GTA2 script coordinate to the renderer's tile-centre convention.
 * Script/map-file coordinates are measured from the north-west cube corner,
 * while the renderer keeps each map tile centred on its integer grid index.
 */
export const authoredLocationToWorld = (x: number, y: number, z = 0) => tileLocationToWorld(x - .5, y - .5, z);
export const worldZ = (z: number) => tileToWorld(z);
/** The rendered top surface of a regular map block at floor index z. */
export const worldSurfaceZ = (z: number) => worldZ(z) + WORLD.tileSize / 2;
/**
 * Convert the continuous support height used by actors to the map's rendered
 * surface.  The map array stores a block at layer 3, whose lid is at 3.5
 * tiles; the collision state reports that support as height 4.
 * Keeping this half-tile boundary conversion here prevents every renderer
 * from inventing its own z convention.
 */
export const worldActorSurfaceZ = (supportHeight: number) => worldZ(supportHeight) - WORLD.tileSize / 2;
/** A small presentation offset above an actor's authored floor surface. */
export const worldEntityZ = (supportHeight: number) => worldActorSurfaceZ(supportHeight) + WORLD.render.entityZOffset;
export const worldToPhysics = (value: number) => value / WORLD.physicsUnitsPerWorldUnit;
export const physicsToWorld = (value: number) => value * WORLD.physicsUnitsPerWorldUnit;

