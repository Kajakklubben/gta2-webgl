import * as planck from 'planck';
import { WeaponSystem } from '../domain/combat/weapon-system';
import type { GameMap } from '../loader/map-parser';
import { MapSurfaceResolver, type SurfaceResult } from '../domain/physics/map-surface';
import { STEP } from '../protocol/constants';
import type { Input, PlayerState, PickupState, TrafficState, HazardState, WorldEvent, WorldEventInput, NpcState } from '../protocol/types';
import { createHazardObject, HazardObject } from './effects/hazard';
import { PickupObject } from './effects/pickup';
import { PlayerObject, type PlayerCombatContext } from './gameobjects/player';
import { NpcObject } from './gameobjects/npc';
import { VehicleObject } from './gameobjects/vehicle';
import { createStaticMapObject } from './gameobjects/map-object';
import type { GameObject, GameObjectCombatContext } from './gameobjects/gameobject';
import { GameState } from './gameobjects/game-state';
import { PickupSystem } from './pickup-system';
import { PlayerSystem } from './player-system';
import { WORLD, physicsToWorld, worldToPhysics } from '../domain/world/world';
import { resolveMapObjectPlacement } from '../domain/physics/map-object-placement';
import type { CarPhysics } from '../loader/gci';
import type { CarInfo } from '../loader/style-parser';
import type { MapObjectDefinition } from '../loader/models/style';
import { DEFAULT_MAP_OBJECT_DEFINITIONS } from '../loader/map-object-definitions';
import { CarTrafficSpawner } from '../domain/vehicles/car-traffic';
import type { VehicleBounds } from '../loader/vehicle-bounds';
import { VehicleCatalog } from '../domain/vehicles/vehicle-catalog';
import { CollisionWorld, type CollisionBody, type CollisionContact, type CollisionObject, type CollisionQuery, type CollisionStart } from '../domain/physics/collision';
import { PlanckPhysicsRuntime } from '../engine/physics-runtime';
import { PhysicsWorld } from '../engine/physics-world';
import { clonePickupSnapshot } from './snapshot-codecs';
import type { WorldRuntime } from '../engine/world-runtime';
import { beginVehicleEntry as runBeginVehicleEntry, beginVehicleExit as runBeginVehicleExit, tickPlayerStatus as runTickPlayerStatus, updateVehicleOccupancyTransitions as runUpdateVehicleOccupancyTransitions, vehicleDoorPosition as runVehicleDoorPosition, vehicleMetadata as runVehicleMetadata, vehicleObjectContext as runVehicleObjectContext } from './runtime/vehicle-operations';

import { addMapWallBodies } from './runtime/map-collision';
import { createWorldRuntime } from './runtime/runtime';
import type { WorldStepOptions, WorldTickState } from './runtime/types';
import { SurfaceController } from './runtime/surface-controller';
import { VehicleDamageController } from './runtime/vehicle-damage-controller';
import { ProjectileController } from './runtime/projectile-controller';
import { WeaponRaycaster } from '../domain/combat/weapon-raycaster';
import { directionFromRotation, rotationFromDirection } from '../domain/physics/motion-vector';
import { WeaponId } from '../domain/combat/weapons';
import { HitscanImpactObject, type ProjectileStateInput } from './effects/projectile';
import { LagCompensation } from '../domain/combat/lag-compensation';
import { runAiPhase as runAiPhaseModule, runLifecyclePhase as runLifecyclePhaseModule } from './runtime/early-phases';
import { runCollisionPhase as runCollisionPhaseModule, runInputPhase as runInputPhaseModule, runPhysicsPhase as runPhysicsPhaseModule, runReplicationPhase as runReplicationPhaseModule } from './runtime/phases';
import { createNpcBody as runCreateNpcBody, createNpcObject as runCreateNpcObject, destroyNpcBody as runDestroyNpcBody, prepareNpcBodies as runPrepareNpcBodies, readNpcBodies as runReadNpcBodies, syncNpcBodies as runSyncNpcBodies } from './runtime/npc-runtime';
import { PedestrianNavigation } from '../domain/pedestrians/pedestrian-navigation';
import { updatePedestrianAi } from '../domain/pedestrians/pedestrian-ai';
import { PEDESTRIAN_DESPAWN_DISTANCE, PEDESTRIAN_PER_PLAYER, PEDESTRIAN_POPULATION_LIMIT, PedestrianSpawner } from '../domain/pedestrians/pedestrian-spawner';
import { createVehicleBody as runCreateVehicleBody, createVehicleObject as runCreateVehicleObject, destroyVehicleBody as runDestroyVehicleBody, maintainTraffic as runMaintainTraffic, prepareVehicleBodies as runPrepareVehicleBodies, readVehicleBodies as runReadVehicleBodies, updateUnoccupiedVehicleDynamics as runUpdateUnoccupiedVehicleDynamics, updateVehicleBodyLayer as runUpdateVehicleBodyLayer, updateVehicleFloor as runUpdateVehicleFloor } from './runtime/vehicle-runtime';
import { addPlayer as runAddPlayer, applyPedestrianImpacts as runApplyPedestrianImpacts, applyVehicleImpacts as runApplyVehicleImpacts, beginPlayerJump as runBeginPlayerJump, damagePlayer as runDamagePlayer, detachVehicleOccupant as runDetachVehicleOccupant, ejectVehicleOccupants as runEjectVehicleOccupants, emit as runEmit, floor as runFloor, input as runInput, killNpc as runKillNpc, killPlayer as runKillPlayer, raiseWanted as runRaiseWanted, removePlayer as runRemovePlayer, removeVehicleFireHazards as runRemoveVehicleFireHazards, spawnPoint as runSpawnPoint, spawnVehicleFireHazard as runSpawnVehicleFireHazard, syncBlockedBodies as runSyncBlockedBodies, syncVehicleFireHazards as runSyncVehicleFireHazards, updateNpcJumps as runUpdateNpcJumps, updatePlayerJumps as runUpdatePlayerJumps, vehicleDamage as runVehicleDamage } from './runtime/world-operations';
import { reconcileHazardObjects as runReconcileHazardObjects, reconcileNpcObjects as runReconcileNpcObjects, reconcilePickupObjects as runReconcilePickupObjects, reconcileVehicleObjects as runReconcileVehicleObjects, reconcileVehicleOccupancyLinks as runReconcileVehicleOccupancyLinks, restore as runRestore, restoreVehicleBody as runRestoreVehicleBody, restoreWorld as runRestoreWorld, snapshot as runSnapshot, snapshotWorld as runSnapshotWorld, step as runStep } from './runtime/reconciliation';

export class GameWorld {
  /** Every world entity has the same lifecycle surface for future systems and renderers. */
  readonly gameState = new GameState();
  /** Compatibility alias; new object behaviour should use gameState. */
  readonly gameObjects = this.gameState;
  get npcs() { return this.gameObjects.npcs; }
  readonly events: WorldEvent[] = [];
  private hazardId = 0;
  eventId = 0;
  /** Fixed-step simulation tick used by the authoritative world. */
  tick = 0;
  history = new Map<string, { tick: number; x: number; y: number; z: number }[]>();
  vehicleHistory = new Map<number, { tick: number; x: number; y: number; z: number; rotation: number }[]>();
  private readonly pickupSystem: PickupSystem;
  spawnProtection = new Map<string, number>();
  wantedDecay = new Map<string, number>();
  readonly projectileController: ProjectileController;
  readonly weaponRaycaster: WeaponRaycaster;
  readonly lagCompensation: LagCompensation;
  bodies = new Map<string, planck.Body>();
  /** Server-side Planck bodies for vehicles, using the same wall/slope fixtures as players. */
  vehicleBodies = new Map<number, planck.Body>();
  /** Incoming vehicle velocities captured before the map physics response. */
  private readonly vehicleStepVelocities = new Map<number, { x: number; y: number }>();
  npcBodies = new Map<number, planck.Body>();
  readonly physicsRuntime = new PlanckPhysicsRuntime({ gravity: { x: 0, y: 0 }, allowSleep: true, continuousPhysics: true });
  readonly weaponSystem = new WeaponSystem();
  readonly playerSystem = new PlayerSystem(this.weaponSystem);
  /** Room-local debug switch for the source-style police combat phase. */
  policeAttackPlayer: boolean = WORLD.traffic.policeAttackPlayer;
  /** Short server-side debounce for a mobile tap replayed during entry. */
  recentVehicleEntries = new Map<string, { vehicleId: number; untilTick: number }>();
  readonly trafficSpawner: CarTrafficSpawner;
  readonly pedestrianNavigation: PedestrianNavigation;
  readonly pedestrianSpawner: PedestrianSpawner;
  private readonly surfaces: MapSurfaceResolver;
  private readonly surfaceController: SurfaceController;
  /** Shared broad-phase and circle-contact model for all moving/sensor objects. */
  readonly collisionWorld = new CollisionWorld();
  private readonly physicsWorld: PhysicsWorld<CollisionObject, CollisionBody, CollisionQuery, CollisionContact, CollisionStart>;
  readonly runtime: WorldRuntime<WorldTickState>;
  readonly vehicleCatalog: VehicleCatalog;
  readonly vehicleDamageController: VehicleDamageController;
  readonly trafficModels: readonly number[];
  nextTrafficId = 1;
  nextNpcId = 1;
  constructor(readonly level: GameMap, readonly localId?: string, initialPickups: PickupState[] = [], readonly carPhysics: ReadonlyMap<number, CarPhysics> = new Map(), trafficModels: readonly number[] = [], readonly carBounds: ReadonlyMap<number, VehicleBounds> = new Map(), readonly carInfo: ReadonlyMap<number, CarInfo> = new Map(), readonly mapObjectDefinitions: ReadonlyMap<number, MapObjectDefinition> = DEFAULT_MAP_OBJECT_DEFINITIONS) {
    this.surfaces = new MapSurfaceResolver(level);
    this.surfaceController = new SurfaceController(this.surfaces);
    this.pedestrianNavigation = new PedestrianNavigation(level);
    this.pedestrianSpawner = new PedestrianSpawner(this.pedestrianNavigation);
    this.physicsWorld = new PhysicsWorld({
      sync: objects => this.collisionWorld.rebuild(objects),
      queryCircle: query => this.collisionWorld.queryCircle(query),
      contacts: filter => this.collisionWorld.contacts(filter),
      resolveBlocking: (dt, starts) => this.collisionWorld.resolveBlocking(dt, starts),
    }, {
      step: dt => this.physicsRuntime.step(dt, 10, 10),
      rayCast: (start, end, accept) => {
        let fraction = 1;
        this.physicsRuntime.rayCast({ x: worldToPhysics(start.x), y: -worldToPhysics(start.y) }, { x: worldToPhysics(end.x), y: -worldToPhysics(end.y) }, (fixture: planck.Fixture, _point: planck.Vec2, _normal: planck.Vec2, value: number) => {
          if (!fixture.getBody().isStatic()) return -1;
          if (accept && !accept(fixture)) return -1;
          fraction = Math.min(fraction, value); return value;
        });
        return fraction;
      },
    });
    this.projectileController = new ProjectileController({
      weaponSystem: this.weaponSystem,
      projectiles: () => this.gameState.projectiles,
      physicsWorld: this.physicsWorld,
      tick: () => this.tick,
      register: object => this.registerObject(object),
      ownerVehicleId: actor => this.gameObjects.findPlayer(actor)?.state.vehicleId,
      isWaterAt: point => this.pedestrianNavigation.isWaterAt(point),
      spawnEffect: effect => this.registerObject(createHazardObject({ ...effect, id: this.hazardId++ })),
      surfaceAt: point => this.surfaces.resolve({ x: point.x, y: point.y, height: point.z }),
    });
    this.lagCompensation = new LagCompensation(this.history, this.vehicleHistory);
    this.weaponRaycaster = new WeaponRaycaster({
      weaponSystem: this.weaponSystem,
      players: () => this.gameState.playerStates.values(),
      npcs: () => this.gameState.npcStates,
      vehicles: () => this.gameState.vehicleStates,
      history: this.lagCompensation,
      rayCast: (start, end, accept) => this.physicsWorld.rayCast(start, end, accept),
    });
    this.runtime = createWorldRuntime({
      lifecycle: context => this.runLifecyclePhase(context),
      ai: context => this.runAiPhase(context),
      input: context => this.runInputPhase(context),
      physics: context => this.runPhysicsPhase(context),
      collision: context => this.runCollisionPhase(context),
      combat: context => this.runCombatPhase(context),
      replication: context => this.runReplicationPhase(context),
    });
    this.trafficModels = [...trafficModels];
    this.vehicleCatalog = new VehicleCatalog(carPhysics, carBounds, carInfo);
    this.vehicleDamageController = new VehicleDamageController({
      hazards: this.gameState.hazardStates,
      vehicleObjectFor: id => this.gameObjects.findVehicle(id),
      hazardObjectFor: id => {
        const object = this.gameObjects.findHazard(id);
        if (object instanceof HazardObject) return object;
        return undefined;
      },
      nextHazardId: () => this.hazardId++,
      registerHazard: hazard => this.registerObject(createHazardObject(hazard)),
      unregisterHazard: hazard => this.unregisterObject(this.gameObjects.findHazard(hazard.id)),
      ejectVehicleOccupants: (vehicle, damage) => this.ejectVehicleOccupants(vehicle, damage),
      emit: event => this.emit(event),
    });
    this.trafficSpawner = new CarTrafficSpawner(level, carPhysics, this.trafficModels, carInfo);
    this.physicsRuntime.onPostSolve((contact: planck.Contact) => {
      const left = contact.getFixtureA().getBody().getUserData?.() as { kind?: string; id?: number } | undefined;
      const right = contact.getFixtureB().getBody().getUserData?.() as { kind?: string; id?: number } | undefined;
      let vehicleData: typeof left | undefined;
      if (left?.kind === 'vehicle') vehicleData = left;
      else if (right?.kind === 'vehicle') vehicleData = right;
      if (!vehicleData) return;
      let body = contact.getFixtureB().getBody();
      if (left?.kind === 'vehicle') body = contact.getFixtureA().getBody();

      // Map walls are one-sided static edges in the source collision pass.
      // Planck's mixed restitution can leave a small rebound velocity after
      // the chassis has been stopped at the edge. Remove the complete normal
      // component (both inward and reflected) while preserving tangent motion
      // so a car can still slide along the wall and cannot keep driving into it.
      let other = contact.getFixtureA().getBody();
      if (body === contact.getFixtureA().getBody()) other = contact.getFixtureB().getBody();
      if (other.isStatic()) {
        const manifold = contact.getWorldManifold(null);
        const normal = manifold?.normal;
        if (normal) {
          const vehicleIsA = body === contact.getFixtureA().getBody();
          // Keep the established Planck response orientation here; the
          // incoming velocity is used separately for damage so post-solve
          // separation cannot erase the impact magnitude.
          const vehicleId = vehicleData.id;
          if (vehicleId === undefined) return;
          const incoming = this.vehicleStepVelocities.get(vehicleId) ?? {
            x: physicsToWorld(body.getLinearVelocity().x), y: -physicsToWorld(body.getLinearVelocity().y),
          };
          let towardOther = { x: normal.x, y: normal.y };
          if (vehicleIsA) towardOther = { x: -normal.x, y: -normal.y };
          const velocity = body.getLinearVelocity();
          const normalVelocity = velocity.x * towardOther.x + velocity.y * towardOther.y;
          if (normalVelocity > 0) {
            body.setLinearVelocity({ x: velocity.x - normalVelocity * towardOther.x, y: velocity.y - normalVelocity * towardOther.y });
          }

          if (this.localId) return;
          // The old code derives wall damage from the incoming impulse. The
          // post-solve velocity is no longer suitable because the normal
          // component has just been removed by the wall response.
          const incomingPhysics = { x: worldToPhysics(incoming.x), y: -worldToPhysics(incoming.y) };
          // `towardOther` is the response/outward direction used by the
          // existing solver. The incoming velocity points against it.
          const impact = Math.max(0, -(incomingPhysics.x * towardOther.x + incomingPhysics.y * towardOther.y)) * WORLD.physicsUnitsPerWorldUnit;
          if (impact >= WORLD.vehicle.source.impactDamageVelocity) {
            const point = manifold?.points[0];
            const mapContact: { bodyId: string; impact: number; pointX?: number; pointY?: number } = {
              bodyId: `vehicle:${vehicleId}`,
              impact,
            };
            if (point) {
              mapContact.pointX = physicsToWorld(point.x);
              mapContact.pointY = -physicsToWorld(point.y);
            }
            this.physicsWorld.recordMapContact(mapContact);
          }
          return;
        }
      }

      if (this.localId) return;
      const velocity = body.getLinearVelocity(), impact = Math.hypot(velocity.x, velocity.y) * WORLD.physicsUnitsPerWorldUnit;
      if (impact < WORLD.vehicle.source.impactDamageVelocity) return;
      this.physicsWorld.recordMapContact({ bodyId: `vehicle:${vehicleData.id}`, impact });
    });
    this.pickupSystem = new PickupSystem(this.gameState.pickupStates, this.weaponSystem);
    this.pickupSystem.replace(initialPickups, pickup => this.normalizePickup(pickup));
    for (const [id, object] of level.objects.entries()) {
      const definition = this.mapObjectDefinitions.get(object.type);
      if (!definition) continue;
      const placement = resolveMapObjectPlacement(level, object, this.surfaces);
      this.registerObject(createStaticMapObject(id, placement, object.rotation, object.type, definition));
    }
    for (const pickup of this.gameState.pickupStates) this.registerObject(new PickupObject(pickup));
    addMapWallBodies(level, this.physicsRuntime, this.gameState.mapObjects);
  }
  /** Pickup data has already crossed the tile-to-world boundary in the asset
   * loader. Preserve all three authored coordinates when it enters the
   * world runtime; deriving height from a possibly different map column moves
   * valid roof and upper-floor pickups. */
  normalizePickup(pickup: PickupState): PickupState {
    const next = clonePickupSnapshot(pickup);
    const surface = this.surfaces.resolve({ x: next.x, y: next.y, height: next.z });
    const support = surface[0];
    if (support && Math.abs(support.height - next.z) <= 1.05) next.collisionLayer = support.collisionLayer;
    return next;
  }
  collisionLayer(state: { z: number; collisionLayer?: number | undefined }) {
    return this.surfaceController.collisionLayer(state);
  }
  surfaceFor(state: { x: number; y: number; z: number; collisionLayer?: number | undefined; grounded?: boolean | undefined }): SurfaceResult {
    return this.surfaceController.surfaceFor(state);
  }
  applySurface(state: { x: number; y: number; z: number; collisionLayer?: number | undefined; grounded?: boolean | undefined; verticalVelocity?: number | undefined }, surface: SurfaceResult, dt = STEP, allowFall = false) {
    this.surfaceController.applySurface(state, surface, dt, allowFall);
  }
  vehicleMetadata(vehicle: TrafficState) { return runVehicleMetadata(this, vehicle); }
  vehicleDoorPosition(vehicle: TrafficState, player: PlayerState, entering: boolean, role?: 'driver' | 'passenger') { return runVehicleDoorPosition(this, vehicle, player, entering, role); }
  vehicleObjectContext(vehicle: VehicleObject) { return runVehicleObjectContext(this, vehicle); }
  updateVehicleOccupancyTransitions(dt = STEP) { return runUpdateVehicleOccupancyTransitions(this, dt); }
  tickPlayerStatus() { return runTickPlayerStatus(this); }
  beginVehicleExit(player: PlayerState, vehicle: TrafficState, immediate = false) { return runBeginVehicleExit(this, player, vehicle, immediate); }
  beginVehicleEntry(player: PlayerState, vehicle: TrafficState, candidate: { door: number; seat: number; role: 'driver' | 'passenger'; outsideX: number; outsideY: number; straightEntry: boolean }) { return runBeginVehicleEntry(this, player, vehicle, candidate); }
  collectPickups(player: PlayerState, reactivated: ReadonlySet<number>) {
    const foundPlayerObject = this.gameObjects.findPlayer(player.id);
    let playerObject: PlayerObject | undefined;
    if (foundPlayerObject instanceof PlayerObject) playerObject = foundPlayerObject;
    this.pickupSystem.collect(player, reactivated, {
      floor: item => this.floor(item), emit: event => this.emit(event),
      pickupObjectFor: id => this.gameObjects.findPickup(id) as PickupObject | undefined,
      playerObject,
    });
  }
  registerObject(object: GameObject<any>) {
    this.gameObjects.register(object);
  }
  unregisterObject(object: GameObject<any> | undefined) {
    if (object) this.gameObjects.unregister(object);
  }
  spawnEffect(effect: Omit<HazardState, 'id'>) { this.registerObject(createHazardObject({ ...effect, id: this.hazardId++ })); }
  /** Keep the public typed views safe for legacy callers that append a state
   * directly. Normal gameplay registers objects at creation time; this repair
   * pass makes the registry the effective authority before any phase reads it. */
  ensureGameObjectCoverage() {
    for (const player of [...this.gameState.playerStates.values()]) if (!this.gameObjects.findPlayer(player.id)) this.registerObject(new PlayerObject(player));
    for (const pickup of [...this.gameState.pickupStates]) if (!this.gameObjects.findPickup(pickup.id)) this.registerObject(new PickupObject(pickup));
    for (const vehicle of [...this.gameState.vehicleStates]) if (!this.gameObjects.findVehicle(vehicle.id)) {
      this.createVehicleBody(vehicle);
      const object = this.createVehicleObject(vehicle);
      this.registerObject(object);
    }
    for (const npc of [...this.gameState.npcStates]) if (!this.gameObjects.findNpc(npc.id)) {
      this.registerObject(this.createNpcObject(npc));
    }
    for (const hazard of [...this.gameState.hazardStates]) if (!this.gameObjects.findHazard(hazard.id)) this.registerObject(createHazardObject(hazard));
  }
  /** CARI's `ped_jump` flag marks vehicles whose chassis is too high to clear.
   * Resolve that authored exception before every broad-phase rebuild so normal
   * cars are passable during a jump while high cars remain solid. */
  updateJumpVehicleCollisions() {
    const update = (ped: { x: number; y: number; z: number; jump?: import('../protocol/types').JumpState | undefined }) => {
      const jump = ped.jump;
      if (!jump) return;
      const speed = Math.hypot(jump.vx, jump.vy);
      jump.vehicleCollision = this.gameState.vehicleStates.some(vehicle => {
        const info = this.vehicleMetadata(vehicle).info;
        if (!info?.infoFlags?.pedJump || Math.abs(vehicle.z - ped.z) > WORLD.interaction.sameFloor) return false;
        const dx = ped.x - vehicle.x, dy = ped.y - vehicle.y;
        const c = Math.cos(vehicle.rotation), s = Math.sin(vehicle.rotation);
        const localX = dx * c + dy * s, localY = -dx * s + dy * c;
        const bounds = this.vehicleCatalog.get(vehicle.model).bounds;
        const withinFootprint = Math.abs(localX) <= bounds.width * .5 + WORLD.player.radius + 8 && Math.abs(localY) <= bounds.height * .5 + WORLD.player.radius + 8;
        const ahead = speed <= 1e-6 || dx * jump.vx + dy * jump.vy >= -WORLD.player.radius * speed;
        return withinFootprint && ahead;
      });
    };
    for (const player of this.gameState.playerStates.values()) update(player);
    for (const npc of this.gameState.npcStates) update(npc);
  }
  syncCollisionWorld() {
    this.updateJumpVehicleCollisions();
    // Static map objects are adapted into the native map world below. Keep
    // them out of the dynamic entity backend so they cannot be solved twice.
    this.physicsWorld.sync([...this.gameObjects.values()].filter(object => object.kind !== 'map-object'));
  }
  /** Services supplied to effect game objects during their own update pass. */
  gameObjectCombatContext(): GameObjectCombatContext {
    return {
      authoritative: !this.localId,
      weaponSystem: this.weaponSystem,
      nextEventId: () => this.eventId++,
      nextHazardId: () => this.hazardId++,
      spawnEffect: effect => this.registerObject(createHazardObject({ ...effect, id: this.hazardId++ })),
      canPlaceHazard: (x, y, z) => {
        const floor = this.floor({ x, y, z: z + 1, id: '__hazard__', rotation: 0, vx: 0, vy: 0 } as PlayerState);
        return Number.isFinite(floor) && Math.abs(floor - Math.round(z)) <= 1;
      },
      surfaceAt: (x, y, z) => this.surfaces.resolve({ x, y, height: z }),
      queryCircle: query => this.physicsWorld.queryCircle(query),
      findPlayer: id => this.gameObjects.findPlayer(id),
      findVehicle: id => this.gameObjects.findVehicle(id),
      findNpc: id => this.gameObjects.findNpc(id),
      killNpc: target => this.killNpc(target),
      damagePlayer: (target, damage, killer) => this.damagePlayer(target.state, damage, killer),
      damageVehicle: (target, damage, x, y, sourceModel, attacker) => { this.vehicleDamage(target.state, damage, x, y, sourceModel, attacker); },
      damageNpc: (target, damage, killer, sourceModel, impactRotation) => { target.receiveWeaponHit(damage, sourceModel, killer, this.gameObjectCombatContext(), impactRotation); },
      isWaterAt: point => this.pedestrianNavigation.isWaterAt(point),
      raiseWanted: player => this.raiseWanted(player.state),
      emit: event => this.emit(event),
    };
  }
  updateGameObjects(dt = STEP, playerOnly = false) {
    let localId: string | undefined;
    if (playerOnly) localId = this.localId;
    let filter: ((object: GameObject<any>) => boolean) | undefined;
    if (localId !== undefined) filter = (object: GameObject<any>) => object.kind === 'player' && String(object.id) === localId;
    const context = { tick: this.tick, dt, world: this.gameObjects, combat: this.gameObjectCombatContext() } as const;
    for (const object of [...this.gameObjects.values()]) if (!filter || filter(object)) object.update(context);
    this.gameObjects.flushLifecycle();
  }
  drawGameObjects(context: Parameters<GameObject<any>['draw']>[0]) {
    for (const object of this.gameObjects.values()) object.draw(context);
  }
  createVehicleObject(vehicle: TrafficState) { return runCreateVehicleObject(this, vehicle); }
  createNpcObject(npc: NpcState) { return runCreateNpcObject(npc); }
  createNpcBody(npc: NpcState) { return runCreateNpcBody(this, npc); }
  destroyNpcBody(id: number) { return runDestroyNpcBody(this, id); }
  prepareNpcBodies(starts: ReadonlyMap<string, { x: number; y: number }>, dt = STEP) { return runPrepareNpcBodies(this, starts, dt); }
  readNpcBodies() { return runReadNpcBodies(this); }
  syncNpcBodies() { return runSyncNpcBodies(this); }
  /** Prepare pedestrian physics from the velocity chosen by PlayerMovementSystem.
   * Input phases choose state; this is the normal per-tick bridge to the
   * native player body. Vehicle occupants remain body-static here because
   * their chassis owns the integration and resynchronizes the ped pose. */
  preparePlayerBodies() {
    for (const [id, body] of this.bodies) {
      const player = this.gameObjects.findPlayer(id);
      if (!(player instanceof PlayerObject)) continue;
      if (player.state.vehicleId !== undefined) {
        body.setLinearVelocity({ x: 0, y: 0 });
        continue;
      }
      body.setLinearVelocity({ x: worldToPhysics(player.state.vx), y: -worldToPhysics(player.state.vy) });
    }
  }
  createVehicleBody(vehicle: TrafficState) { return runCreateVehicleBody(this, vehicle); }
  destroyVehicleBody(id: number) { return runDestroyVehicleBody(this, id); }
  updateVehicleBodyLayer(vehicle: TrafficState, body = this.vehicleBodies.get(vehicle.id)) { return runUpdateVehicleBodyLayer(this, vehicle, body); }
  updateUnoccupiedVehicleDynamics(dt: number) { return runUpdateUnoccupiedVehicleDynamics(this, dt); }
  updateVehicleFloor(vehicle: TrafficState, dt = STEP) { return runUpdateVehicleFloor(this, vehicle, dt); }
  prepareVehicleBodies(starts: ReadonlyMap<number, { x: number; y: number; rotation: number }>, dt = STEP) {
    runPrepareVehicleBodies(this, starts, dt);
    this.vehicleStepVelocities.clear();
    for (const vehicle of this.gameState.vehicleStates) {
      const body = this.vehicleBodies.get(vehicle.id);
      if (!body) continue;
      const velocity = body.getLinearVelocity();
      this.vehicleStepVelocities.set(vehicle.id, { x: physicsToWorld(velocity.x), y: -physicsToWorld(velocity.y) });
    }
  }
  readVehicleBodies(dt = STEP) { return runReadVehicleBodies(this, dt); }
  maintainTraffic() { return runMaintainTraffic(this); }
  maintainNpcs() {
    if (this.localId || !this.gameState.playerStates.size || !this.pedestrianNavigation.nodes.length) return;
    const players = [...this.gameState.playerStates.values()];
    const npcs = [...this.gameState.npcStates];
    for (const npc of npcs) {
      if (players.some(player => Math.hypot(npc.x - player.x, npc.y - player.y) <= PEDESTRIAN_DESPAWN_DISTANCE)) continue;
      this.destroyNpcBody(npc.id);
      this.unregisterObject(this.gameObjects.findNpc(npc.id));
    }
    const desired = Math.min(PEDESTRIAN_POPULATION_LIMIT, players.length * PEDESTRIAN_PER_PLAYER);
    if (this.gameState.npcStates.length >= desired) return;
    const occupied = [
      ...this.gameState.playerStates.values(),
      ...this.gameState.vehicleStates,
      ...this.gameState.npcStates,
    ].map(item => ({ x: item.x, y: item.y, z: item.z }));
    for (const player of players) {
      while (this.gameState.npcStates.length < desired) {
        const spawned = this.pedestrianSpawner.spawnAround(player, this.nextNpcId, occupied, this.tick);
        if (!spawned.length) break;
        for (const npc of spawned) {
          this.nextNpcId++;
          occupied.push({ x: npc.x, y: npc.y, z: npc.z });
          this.registerObject(this.createNpcObject(npc));
          this.createNpcBody(npc);
        }
      }
      if (this.gameState.npcStates.length >= desired) break;
    }
  }
  updateNpcAi(dt = STEP) {
    if (this.localId) return;
    this.updateNpcVehicleAi();
    this.updatePoliceAndGangAi();
    updatePedestrianAi({
      npcs: this.gameState.npcStates,
      players: this.gameState.playerStates.values(),
      navigation: this.pedestrianNavigation,
      traffic: this.gameState.vehicleStates,
      vehicleBounds: vehicle => this.vehicleCatalog.get(vehicle.model).bounds,
      vehicleCanJumpOver: vehicle => !this.vehicleMetadata(vehicle).info?.infoFlags?.pedJump,
      dt,
      tick: this.tick,
    });
  }
  private updatePoliceAndGangAi() {
    const players = [...this.gameState.playerStates.values()];
    for (const npc of this.gameState.npcStates) {
      if (npc.health <= 0) continue;
      const isPolice = npc.kind === 'police';
      const isGang = npc.kind === 'civilian' && (npc.faction ?? 0) > 0;
      if (!isPolice && !isGang) continue;
      const vehicle = npc.vehicleId === undefined ? undefined : this.gameObjects.findVehicle(npc.vehicleId);
      // Keep the existing debug/runtime contract: police remain ordinary
      // walkers until the police combat switch is enabled. Clear any stale
      // pursuit state as well, so turning the switch off cannot leave a car
      // steering at a former target.
      if (isPolice && !this.policeAttackPlayer) {
        npc.target = undefined;
        if (vehicle) delete (vehicle.state as TrafficState).pursuitTarget;
        continue;
      }
      const origin = vehicle?.state ?? npc;
      const target = players
        .filter(player => player.combat.health > 0 && player.combat.respawn <= 0 && Math.abs(player.z - npc.z) <= WORLD.interaction.sameFloor)
        .filter(player => isPolice ? player.wanted > 0 || player.combat.attacking || player.combat.shots.some(shot => shot.projectile && !shot.impact) : player.combat.attacking || player.combat.shots.some(shot => shot.projectile && !shot.impact))
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
        this.arrestPlayer(target, npc.id);
        if (vehicle && vehicle.state.occupants.some(occupant => occupant.id === `npc:${npc.id}`)) this.detachVehicleOccupant(vehicle.state, `npc:${npc.id}`, 0);
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
  arrestPlayer(target: PlayerState, officerId?: number) {
    const object = this.gameObjects.findPlayer(target.id);
    if (!(object instanceof PlayerObject) || target.combat.health <= 0) return false;
    if (target.vehicleId !== undefined) {
      const vehicle = this.gameObjects.findVehicle(target.vehicleId);
      if (vehicle && vehicle.state.occupants.some(occupant => occupant.id === target.id)) this.detachVehicleOccupant(vehicle.state, target.id, 0);
    }
    const spawn = runSpawnPoint(this, true);
    object.setPose({ ...spawn, rotation: 0, vx: 0, vy: 0 });
    target.combat.health = 100;
    target.combat.respawn = 0;
    target.combat.attacking = false;
    target.combat.shots = [];
    target.wanted = 0;
    target.jump = undefined;
    target.animation = undefined;
    this.bodies.get(target.id)?.setPosition({ x: worldToPhysics(target.x), y: -worldToPhysics(target.y) });
    this.emit({ type: 'hit', actor: officerId === undefined ? undefined : `npc:${officerId}`, target: target.id, damage: 0, lethal: false, x: target.x, y: target.y, z: target.z });
    return true;
  }
  /** Source CarThief_AI reduced to the same deterministic route/occupancy
   * surface as players: a small subset of civilian dummies claims a nearby
   * enterable car, becomes its driver, and is then advanced by traffic AI. */
  private updateNpcVehicleAi() {
    const vehicles = this.gameState.vehicleStates;
    for (const vehicle of vehicles.filter(item => item.transport !== undefined && item.serviceStop !== undefined && Math.hypot(item.vx, item.vy) < 25)) {
      const object = this.gameObjects.findVehicle(vehicle.id);
      if (!object) continue;
      const passenger = this.gameState.npcStates
        .filter(npc => npc.health > 0 && npc.vehicleId === undefined && npc.kind === 'civilian' && npc.state !== 'flee')
        .map(npc => ({ npc, object: this.gameObjects.findNpc(npc.id), distance: Math.hypot(npc.x - vehicle.x, npc.y - vehicle.y) }))
        .filter(item => item.object && item.distance < 96)
        .sort((a, b) => a.distance - b.distance)[0];
      if (passenger?.object) object.beginNpcEntry(passenger.object, this.vehicleObjectContext(object));
    }
    for (const npc of this.gameState.npcStates) {
      const policeDriver = npc.kind === 'police' && npc.target !== undefined;
      if (npc.health <= 0 || npc.vehicleId !== undefined || (!policeDriver && npc.kind !== 'civilian') || (!policeDriver && npc.state === 'flee') || (!policeDriver && npc.id % 11 !== this.tick % 11)) continue;
      const object = this.gameObjects.findNpc(npc.id);
      if (!(object instanceof NpcObject)) continue;
      const candidate = vehicles
        .map(vehicle => ({ vehicle, object: this.gameObjects.findVehicle(vehicle.id), distance: Math.hypot(vehicle.x - npc.x, vehicle.y - npc.y) }))
        // CarThief_AI selects an available/parked chassis. A moving traffic
        // car is already owned by its driver and must remain a collision
        // threat rather than becoming an instant NPC boarding target.
        .filter(item => item.object && item.object.alive && !item.object.isDriven() && item.vehicle.transport !== 'train' && Math.hypot(item.vehicle.vx, item.vehicle.vy) < 8 && item.distance < WORLD.vehicle.enterDistance)
        .sort((a, b) => a.distance - b.distance)[0];
      if (!candidate?.object) continue;
      if (candidate.object.beginNpcEntry(object, this.vehicleObjectContext(candidate.object))) {
        npc.state = 'driving'; npc.animation = 'idle';
        if (policeDriver) candidate.vehicle.pursuitTarget = npc.target;
      }
    }
  }
  setPoliceAttackPlayer(enabled: boolean) {
    this.policeAttackPlayer = enabled;
    if (enabled) return;
    for (const npc of this.gameState.npcStates) {
      if (npc.kind !== 'police') continue;
      if (npc.state === 'attack') {
        npc.state = 'walk';
        npc.animation = 'walking';
      }
      npc.target = undefined;
      if (npc.vehicleId !== undefined) {
        const vehicle = this.gameObjects.findVehicle(npc.vehicleId);
        if (vehicle) delete (vehicle.state as TrafficState).pursuitTarget;
      }
    }
  }
  spawnPoint(arrest = false) { return runSpawnPoint(this, arrest); }
  addPlayer(id: string, state?: PlayerState) { return runAddPlayer(this, id, state); }
  removePlayer(id: string) { return runRemovePlayer(this, id); }
  /** Keep a disconnected ped in the simulation as the source dummy rather
   * than deleting the actor. A seated dummy remains the car's driver and is
   * subsequently advanced by autonomous traffic AI. */
  convertDisconnectedPlayerToDummy(id: string) {
    const player = this.gameState.playerStates.get(id);
    const playerObject = this.gameObjects.findPlayer(id);
    if (!player || !(playerObject instanceof PlayerObject)) return false;
    const npcId = this.nextNpcId++;
    const vehicle = player.vehicleId === undefined ? undefined : this.gameObjects.findVehicle(player.vehicleId);
    const npc: NpcState = {
      id: npcId, x: player.x, y: player.y, z: player.z, rotation: player.rotation, vx: player.vx, vy: player.vy,
      health: Math.max(0, player.combat.health), kind: 'civilian', remap: undefined, faction: 0,
      collisionLayer: player.collisionLayer, grounded: player.grounded, verticalVelocity: player.verticalVelocity,
      state: vehicle ? 'driving' : 'walk', animation: vehicle ? 'idle' : 'walking', shockCounter: 0, electrocuted: false,
      shots: [], onFire: false, fireTimer: 0, vehicleId: vehicle?.id,
    };
    if (vehicle) {
      const oldId = id;
      for (const occupant of vehicle.state.occupants) if (occupant.id === oldId) occupant.id = `npc:${npcId}`;
      vehicle.state.passengers.splice(0, vehicle.state.passengers.length, ...vehicle.state.passengers.map(passenger => passenger === oldId ? `npc:${npcId}` : passenger));
      delete (vehicle.state as TrafficState).aiState;
    }
    const body = this.bodies.get(id);
    if (body) this.physicsRuntime.destroyBody(body);
    this.bodies.delete(id); this.history.delete(id); this.recentVehicleEntries.delete(id);
    playerObject.despawn();
    this.spawnProtection.delete(id); this.wantedDecay.delete(id);
    this.registerObject(this.createNpcObject(npc));
    this.createNpcBody(npc);
    return true;
  }
  floor(player: PlayerState) { return runFloor(this, player); }
  input(value: number | Input | undefined) { return runInput(this, value); }
  beginPlayerJump(player: PlayerState, input: Input, floor: number) { return runBeginPlayerJump(this, player, input, floor); }
  updatePlayerJumps(dt: number) { return runUpdatePlayerJumps(this, dt); }
  updateNpcJumps(dt: number) { return runUpdateNpcJumps(this, dt); }
  emit(event: WorldEventInput) { return runEmit(this, event); }
  killPlayer(target: PlayerState, killer?: string) { return runKillPlayer(this, target, killer); }
  killNpc(target: NpcObject) { return runKillNpc(this, target); }
  damagePlayer(target: PlayerState, damage: number, killer?: string) { return runDamagePlayer(this, target, damage, killer); }
  damageNpc(target: NpcState, damage: number, killer?: string, sourceModel?: number) {
    const object = this.gameObjects.findNpc(target.id);
    if (!(object instanceof NpcObject)) return false;
    return object.receiveWeaponHit(damage, sourceModel, killer, this.gameObjectCombatContext());
  }
  detachVehicleOccupant(vehicle: TrafficState, id: string, damage = 0) { return runDetachVehicleOccupant(this, vehicle, id, damage); }
  ejectVehicleOccupants(vehicle: TrafficState, damage = 0) { return runEjectVehicleOccupants(this, vehicle, damage); }
  spawnVehicleFireHazard(vehicle: TrafficState, life: number, effect: 'fire' | 'explosion' = 'fire') { return runSpawnVehicleFireHazard(this, vehicle, life, effect); }
  removeVehicleFireHazards(vehicle: TrafficState, effect?: 'fire' | 'explosion') { return runRemoveVehicleFireHazards(this, vehicle, effect); }
  syncVehicleFireHazards() { return runSyncVehicleFireHazards(this); }
  vehicleDamage(vehicle: TrafficState, damage: number, x = vehicle.x, y = vehicle.y, sourceModel?: number, attacker?: string) { return runVehicleDamage(this, vehicle, damage, x, y, sourceModel, attacker); }
  applyVehicleImpacts(contacts: readonly CollisionContact[]) { return runApplyVehicleImpacts(this, contacts); }
  applyPedestrianImpacts(contacts: readonly CollisionContact[]) { return runApplyPedestrianImpacts(this, contacts); }
  syncBlockedBodies() { return runSyncBlockedBodies(this); }
  raiseWanted(player: PlayerState, amount = 1) { return runRaiseWanted(this, player, amount); }
  runLifecyclePhase(context: any) { return runLifecyclePhaseModule(this, context); }
  runAiPhase(context: any) { return runAiPhaseModule(this, context); }
  runInputPhase(context: any) { return runInputPhaseModule(this, context); }
  runPhysicsPhase(context: any) { return runPhysicsPhaseModule(this, context); }
  runCollisionPhase(context: any) { return runCollisionPhaseModule(this, context); }
  runCombatPhase(context: any) {
    if (context.state.playerOnly) return;
    for (const [id] of this.bodies) {
      const player = this.gameObjects.findPlayer(id);
      if (!player) continue;
      const combat: PlayerCombatContext = {
        input: this.input(context.state.inputs.get(id)),
        weaponSystem: this.weaponSystem,
        traceWeaponRay: (actor, weaponId, originX, originY, angle, clientTick) => this.weaponRaycaster.trace(actor, weaponId, originX, originY, angle, clientTick),
        traceShockerWeapon: (actor, originX, originY, angle, clientTick) => this.weaponRaycaster.traceShocker(actor, originX, originY, angle, clientTick),
        spawnWeaponVisual: (actor, weaponId, originX, originY, z, angle, distance, explosive, collision) => this.projectileController.spawnVisual(actor, weaponId, originX, originY, z, angle, distance, explosive, collision),
        combat: this.gameObjectCombatContext(),
        emit: event => this.emit(event),
      };
      player.updateCombat(combat);
    }
    this.runNpcCombatPhase();
  }
  /** Police use the same pedestrian locomotion as civilians, but their
   * Weapon_30 dispatch is a normal combat emission.  Keeping it here means
   * they share the exact ray/projectile/NPC collision path with players. */
  private runNpcCombatPhase() {
    if (!this.policeAttackPlayer) return;
    const players = [...this.gameState.playerStates.values()];
    const combat = this.gameObjectCombatContext();
    for (const npc of this.gameState.npcStates) {
      const gangHostile = npc.kind === 'civilian' && (npc.faction ?? 0) > 0 && npc.state === 'attack';
      if ((npc.kind !== 'police' && !gangHostile) || npc.health <= 0 || npc.vehicleId !== undefined) continue;
      if (npc.kind === 'police' && !this.policeAttackPlayer) continue;
      const weaponId = npc.weapon ??= npc.kind === 'police' ? WeaponId.SilencedGun : WeaponId.Pistol;
      npc.weaponAmmo ??= this.weaponSystem.sourceDefaultAmmo(weaponId);
      npc.weaponCooldown ??= 0;
      npc.weaponCooldown = Math.max(0, npc.weaponCooldown - 1);
      const target = players
        .filter(player => player.combat.health > 0 && player.combat.respawn <= 0 && Math.abs(player.z - npc.z) <= WORLD.interaction.sameFloor)
        .filter(player => gangHostile ? player.combat.attacking || player.combat.shots.some(shot => shot.projectile && !shot.impact) : player.wanted > 0 || player.combat.attacking || player.combat.shots.some(shot => shot.projectile && !shot.impact))
        .map(player => ({ player, distance: Math.hypot(player.x - npc.x, player.y - npc.y) }))
        .filter(item => item.distance <= WORLD.traffic.policeAttackRadius)
        .sort((a, b) => a.distance - b.distance)[0]?.player;
      if (!target) {
        if (npc.state === 'attack') { npc.state = 'walk'; npc.animation = 'walking'; }
        npc.target = undefined;
        continue;
      }
      npc.target = target.id;
      npc.rotation = rotationFromDirection(target.x - npc.x, target.y - npc.y, npc.rotation);
      npc.state = 'attack'; npc.animation = 'armed';
      if (npc.weaponCooldown > 0 || npc.weaponAmmo <= 0) continue;
      const weapon = this.weaponSystem.get(weaponId);
      if (weapon.vehicleOnly) continue;
      const direction = directionFromRotation(npc.rotation);
      const originX = npc.x + direction.x * 8, originY = npc.y + direction.y * 8;
      const actor = { id: `npc:${npc.id}`, x: npc.x, y: npc.y, z: npc.z, vx: npc.vx, vy: npc.vy, rotation: npc.rotation };
      let rays = this.weaponRaycaster.traceShocker(actor, originX, originY, npc.rotation);
      if (weapon.kind !== 'stun') rays = [this.weaponRaycaster.trace(actor, npc.weapon, originX, originY, npc.rotation)];
      let fired = false;
      if (weapon.kind === 'stun') {
        for (const ray of rays) {
          const target = ray.targets[0];
          if (!target) continue;
          const targetState: NonNullable<ProjectileStateInput['impactTarget']> = { kind: target.kind, id: target.state.id };
          const impactState: ProjectileStateInput = {
            actor: actor.id, weapon: npc.weapon, x: ray.startX, y: ray.startY, endX: ray.endX, endY: ray.endY,
            z: npc.z, life: 1, rotation: ray.rotation, impact: true, beam: true, impactTarget: targetState,
            projectileType: 'shock',
          };
          if (typeof weapon.sourceModel === 'number') impactState.sourceModel = weapon.sourceModel;
          const impact = new HitscanImpactObject(`npc:${npc.id}:hitscan:${this.eventId}`, impactState);
          this.registerObject(impact);
          impact.resolveHitscan(combat);
          this.unregisterObject(impact);
          this.gameObjects.findNpc(npc.id)?.recordShot({ x: ray.startX, y: ray.startY, endX: ray.endX, endY: ray.endY, z: npc.z, life: 4, weapon: npc.weapon, projectile: true, impact: true, beam: true });
          fired = true;
        }
      } else {
        const ray = rays[0]!;
        const projectile = this.projectileController.spawnVisual(actor, npc.weapon, ray.startX, ray.startY, npc.z, ray.rotation, ray.distance, weapon.kind === 'rocket', true);
        const npcObject = this.gameObjects.findNpc(npc.id);
        if (npcObject) {
          const sequence = npcObject.recordProjectileShot({ x: projectile.state.x, y: projectile.state.y, endX: projectile.state.endX, endY: projectile.state.endY, z: projectile.state.z, life: projectile.lifeRemaining, vx: projectile.state.vx, vy: projectile.state.vy, weapon: npc.weapon, projectile: true });
          projectile.setShotSequence(sequence);
        }
        fired = true;
      }
      if (!fired) continue;
      npc.weaponAmmo = Math.max(0, npc.weaponAmmo - 1);
      npc.weaponCooldown = weapon.interval;
      this.emit({ type: 'shot', actor: actor.id, weapon: npc.weapon, x: originX, y: originY, z: npc.z });
    }
  }
  runReplicationPhase(context: any) { return runReplicationPhaseModule(this, context); }
  step(inputs: ReadonlyMap<string, number | Input>, options: WorldStepOptions = {}) { return runStep(this, inputs, options); }
  restore(state: PlayerState) { return runRestore(this, state); }
  reconcilePickupObjects() { return runReconcilePickupObjects(this); }
  restoreVehicleBody(vehicle: TrafficState) { return runRestoreVehicleBody(this, vehicle); }
  reconcileVehicleObjects(incoming: readonly TrafficState[]) { return runReconcileVehicleObjects(this, incoming); }
  reconcileHazardObjects(incoming: readonly HazardState[]) { return runReconcileHazardObjects(this, incoming); }
  reconcileNpcObjects(incoming: readonly NpcState[]) { return runReconcileNpcObjects(this, incoming); }
  reconcileVehicleOccupancyLinks() { return runReconcileVehicleOccupancyLinks(this); }
  restoreWorld(pickups?: PickupState[], traffic?: TrafficState[], hazards?: HazardState[], npcs?: NpcState[]) { return runRestoreWorld(this, pickups, traffic, hazards, npcs); }
  snapshot() { return runSnapshot(this); }
  snapshotWorld() { return runSnapshotWorld(this); }
}
