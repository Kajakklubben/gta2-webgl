import { WeaponSystem } from '../domain/combat/weapon-system';
import type { GameMap } from '../engine/loader/map-parser';
import { MapSurfaceResolver, type SurfaceResult } from '../domain/physics/map-surface';
import { STEP } from '../protocol/constants';
import type { Input, PlayerState, PickupState, TrafficState, HazardState, WorldEvent, WorldEventInput, NpcState } from '../protocol/types';
import { createHazardObject, ExplosionObject, HazardObject } from './effects/hazard';
import { PickupObject } from './effects/pickup';
import { PlayerObject } from './gameobjects/player';
import { NpcObject } from './gameobjects/npc';
import { VehicleObject } from './gameobjects/vehicle';
import { createStaticMapObject } from './gameobjects/map-object';
import type { GameObject, GameObjectCombatContext } from './gameobjects/gameobject';
import { GameState } from './gameobjects/game-state';
import { PickupSystem } from './pickup-system';
import { PlayerSystem } from './player-system';
import { WORLD, physicsToWorld, worldToPhysics } from '../domain/world/world';
import { resolveMapObjectPlacement } from '../domain/physics/map-object-placement';
import type { CarPhysics } from '../engine/loader/gci';
import type { CarInfo } from '../engine/loader/style-parser';
import type { MapObjectDefinition } from '../engine/loader/models/style';
import { DEFAULT_MAP_OBJECT_DEFINITIONS } from '../engine/loader/map-object-definitions';
import { CarTrafficSpawner } from '../domain/vehicles/car-traffic';
import type { VehicleBounds } from '../engine/loader/vehicle-bounds';
import { VehicleCatalog } from '../domain/vehicles/vehicle-catalog';
import type { CollisionContact } from './physics/collision-world';
import { GameWorldPhysics } from './physics/game-world-physics';
import { mapFixtureMatches } from './physics/map-fixtures';
import { clonePickupSnapshot } from './snapshot-codecs';
import type { WorldRuntime } from '../engine/world-runtime';
import { beginVehicleEntry as runBeginVehicleEntry, beginVehicleExit as runBeginVehicleExit, tickPlayerStatus as runTickPlayerStatus, updateVehicleOccupancyTransitions as runUpdateVehicleOccupancyTransitions, vehicleDoorPosition as runVehicleDoorPosition, vehicleMetadata as runVehicleMetadata, vehicleObjectContext as runVehicleObjectContext } from './runtime/vehicle-operations';

import { createWorldRuntime } from './runtime/runtime';
import type { WorldStepOptions, WorldTickState } from './runtime/types';
import { SurfaceController } from './runtime/surface-controller';
import { VehicleDamageController } from './runtime/vehicle-damage-controller';
import { ProjectileController } from './runtime/projectile-controller';
import { WeaponRaycaster } from '../domain/combat/weapon-raycaster';
import { LagCompensation } from '../domain/combat/lag-compensation';
import { runCombatPhase as runCombatPhaseModule } from './runtime/combat-phase';
import { runAiPhase as runAiPhaseModule, runLifecyclePhase as runLifecyclePhaseModule } from './runtime/early-phases';
import { runCollisionPhase as runCollisionPhaseModule, runInputPhase as runInputPhaseModule, runPhysicsPhase as runPhysicsPhaseModule, runReplicationPhase as runReplicationPhaseModule } from './runtime/phases';
import { createNpcBody as runCreateNpcBody, createNpcObject as runCreateNpcObject, destroyNpcBody as runDestroyNpcBody, prepareNpcBodies as runPrepareNpcBodies, readNpcBodies as runReadNpcBodies, syncNpcBodies as runSyncNpcBodies } from './runtime/npc-runtime';
import { PedestrianNavigation } from '../domain/pedestrians/pedestrian-navigation';
import { PedestrianSpawner } from '../domain/pedestrians/pedestrian-spawner';
import { arrestPlayer as runArrestPlayer, maintainNpcs as runMaintainNpcs, setPoliceAttackPlayer as runSetPoliceAttackPlayer, updateNpcAi as runUpdateNpcAi } from './runtime/pedestrian-runtime';
import { createVehicleBody as runCreateVehicleBody, createVehicleObject as runCreateVehicleObject, destroyVehicleBody as runDestroyVehicleBody, maintainTraffic as runMaintainTraffic, prepareVehicleBodies as runPrepareVehicleBodies, readVehicleBodies as runReadVehicleBodies, updateUnoccupiedVehicleDynamics as runUpdateUnoccupiedVehicleDynamics, updateVehicleBodyLayer as runUpdateVehicleBodyLayer, updateVehicleFloor as runUpdateVehicleFloor } from './runtime/vehicle-runtime';
import { addPlayer as runAddPlayer, applyPedestrianImpacts as runApplyPedestrianImpacts, applyVehicleImpacts as runApplyVehicleImpacts, beginPlayerJump as runBeginPlayerJump, damagePlayer as runDamagePlayer, detachVehicleOccupant as runDetachVehicleOccupant, ejectVehicleOccupants as runEjectVehicleOccupants, emit as runEmit, floor as runFloor, input as runInput, killNpc as runKillNpc, killPlayer as runKillPlayer, raiseWanted as runRaiseWanted, removePlayer as runRemovePlayer, removeVehicleFireHazards as runRemoveVehicleFireHazards, spawnPoint as runSpawnPoint, spawnVehicleFireHazard as runSpawnVehicleFireHazard, syncBlockedBodies as runSyncBlockedBodies, syncVehicleFireHazards as runSyncVehicleFireHazards, updateNpcJumps as runUpdateNpcJumps, updatePlayerJumps as runUpdatePlayerJumps, vehicleDamage as runVehicleDamage } from './runtime/world-operations';
import { reconcileHazardObjects as runReconcileHazardObjects, reconcileNpcObjects as runReconcileNpcObjects, reconcilePickupObjects as runReconcilePickupObjects, reconcileVehicleObjects as runReconcileVehicleObjects, reconcileVehicleOccupancyLinks as runReconcileVehicleOccupancyLinks, restore as runRestore, restoreVehicleBody as runRestoreVehicleBody, restoreWorld as runRestoreWorld, snapshot as runSnapshot, snapshotWorld as runSnapshotWorld, step as runStep } from './runtime/reconciliation';

export interface GameWorldOptions {
  /** Keep authored scenario actors while suppressing ambient population. */
  readonly ambientTraffic?: boolean;
  readonly ambientPedestrians?: boolean;
  /** Allow the traffic planner to generate controls for unoccupied cars. */
  readonly vehicleAi?: boolean;
}

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
  readonly physics: GameWorldPhysics;
  /** Compatibility views for diagnostics and older callers. The binding
   * itself lives on each GameObject; these maps are rebuilt from that source
   * and are intentionally not mutation points. */
  get bodies() {
    return new Map(this.gameObjects.players.flatMap(object => object.physicsBody ? [[object.id, object.physicsBody] as const] : []));
  }
  get vehicleBodies() {
    return new Map(this.gameObjects.vehicles.flatMap(object => object.physicsBody ? [[object.id, object.physicsBody] as const] : []));
  }
  get npcBodies() {
    return new Map(this.gameObjects.npcs.flatMap(object => object.physicsBody ? [[object.id, object.physicsBody] as const] : []));
  }
  private get vehicleStepVelocities() { return this.physics.vehicleStepVelocities; }
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
  private get physicsWorld() { return this.physics.physicsWorld; }
  readonly runtime: WorldRuntime<WorldTickState>;
  readonly vehicleCatalog: VehicleCatalog;
  readonly vehicleDamageController: VehicleDamageController;
  readonly trafficModels: readonly number[];
  readonly ambientTrafficEnabled: boolean;
  readonly ambientPedestriansEnabled: boolean;
  readonly vehicleAiEnabled: boolean;
  nextTrafficId = 1;
  nextNpcId = 1;
  constructor(readonly level: GameMap, readonly localId?: string, initialPickups: PickupState[] = [], readonly carPhysics: ReadonlyMap<number, CarPhysics> = new Map(), trafficModels: readonly number[] = [], readonly carBounds: ReadonlyMap<number, VehicleBounds> = new Map(), readonly carInfo: ReadonlyMap<number, CarInfo> = new Map(), readonly mapObjectDefinitions: ReadonlyMap<number, MapObjectDefinition> = DEFAULT_MAP_OBJECT_DEFINITIONS, options: GameWorldOptions = {}) {
    this.ambientTrafficEnabled = options.ambientTraffic !== false;
    this.ambientPedestriansEnabled = options.ambientPedestrians !== false;
    this.vehicleAiEnabled = options.vehicleAi !== false;
    this.physics = new GameWorldPhysics(localId);
    this.surfaces = new MapSurfaceResolver(level);
    this.surfaceController = new SurfaceController(this.surfaces);
    this.pedestrianNavigation = new PedestrianNavigation(level);
    this.pedestrianSpawner = new PedestrianSpawner(this.pedestrianNavigation);
    this.projectileController = new ProjectileController({
      weaponSystem: this.weaponSystem,
      projectiles: () => this.gameState.projectiles,
      physicsWorld: {
        rayCast: (start, end, accept) => this.physicsWorld.rayCast(start, end, accept),
        rayCastHit: (start, end, accept) => this.physics.rayCastHit(start, end, accept),
        queryCircle: query => this.physicsWorld.queryCircle(query),
      },
      tick: () => this.tick,
      register: object => this.registerObject(object),
      ownerVehicleId: actor => {
        const player = this.gameObjects.findPlayer(actor);
        if (player) return player.state.vehicleId;
        const match = /^npc:(\d+)$/.exec(actor);
        return match ? this.gameObjects.findNpc(Number(match[1]))?.state.vehicleId : undefined;
      },
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
      mapFixtureMatches,
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
    this.pickupSystem = new PickupSystem(this.gameState.pickupStates, this.weaponSystem);
    this.pickupSystem.replace(initialPickups, pickup => this.normalizePickup(pickup));
    for (const [id, object] of level.objects.entries()) {
      const definition = this.mapObjectDefinitions.get(object.type);
      if (!definition) continue;
      const placement = resolveMapObjectPlacement(level, object, this.surfaces);
      this.registerObject(createStaticMapObject(id, placement, object.rotation, object.type, definition));
    }
    for (const pickup of this.gameState.pickupStates) this.registerObject(new PickupObject(pickup));
    this.physics.addMapWallBodies(level, this.gameState.mapObjects);
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
      const object = this.createVehicleObject(vehicle);
      this.registerObject(object);
      this.createVehicleBody(vehicle);
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
  createPlayerPhysicsBody(player: PlayerState) { return this.physics.createPlayerBody(player, this.collisionLayer(player)); }
  destroyPhysicsBody(body: Parameters<GameWorldPhysics['destroyBody']>[0]) { return this.physics.destroyBody(body); }
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
      isExplosionOccluded: (origin, target) => {
        const hit = this.physics.rayCastHit(origin, target, fixture => mapFixtureMatches(fixture, Math.max(0, Math.min(7, Math.ceil(origin.z))), 'bullet'));
        return hit !== undefined && hit.fraction < .999;
      },
      queryExplosionObjects: query => this.gameObjects.mapObjects.flatMap(object => {
        const body = object.getCollider()[0];
        if (!body || (query.kinds && !query.kinds.includes('map-object'))) return [];
        if (query.layer !== undefined && body.layer !== undefined && query.layer !== body.layer) return [];
        if (Math.abs(body.z - query.z) > (query.floorTolerance ?? WORLD.interaction.sameFloor)) return [];
        if (Math.hypot(body.x - query.x, body.y - query.y) > query.radius + body.radius) return [];
        return [body];
      }),
      onExplosionNearby: (body, source) => {
        if (body.kind !== 'map-object') return;
        const object = this.gameObjects.mapObjects.find(candidate => String(candidate.id) === String(body.objectId));
        if (!object || !object.definition.explosionReaction) return;
        object.deferDespawn();
        if (object.definition.explosionReaction !== 'detonate') return;
        const explosion = createHazardObject({
          id: this.hazardId++, x: object.state.x, y: object.state.y, z: object.state.z,
          kind: 'fire', life: 26, owner: source.actor, effect: 'explosion', explosionType: 'item', sourceExplosionType: source.explosionType, sourceModel: object.state.model,
        });
        if (explosion instanceof ExplosionObject) {
          explosion.armBlast({ actor: source.actor, weapon: 0, radius: WORLD.projectile.sourceSmallExplosionRadius, damage: 0, pellets: 1, selfDamage: false, height: 2, knockback: 6, sourceModel: object.state.model });
          this.registerObject(explosion);
          explosion.resolveBlast(this.gameObjectCombatContext());
        }
      },
      findPlayer: id => this.gameObjects.findPlayer(id),
      findVehicle: id => this.gameObjects.findVehicle(id),
      findNpc: id => this.gameObjects.findNpc(id),
      killNpc: target => this.killNpc(target),
      damagePlayer: (target, damage, killer, cause) => this.damagePlayer(target.state, damage, killer, cause),
      damageVehicle: (target, damage, x, y, sourceModel, attacker) => { this.vehicleDamage(target.state, damage, x, y, sourceModel, attacker); },
      extinguishVehicleFire: target => { this.vehicleDamageController.extinguishFire(target.state); },
      damageNpc: (target, damage, killer, sourceModel, impactRotation, cause) => { target.receiveWeaponHit(damage, sourceModel, killer, this.gameObjectCombatContext(), impactRotation, cause); },
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
  createNpcPhysicsBody(npc: NpcState) { return this.physics.createNpcBody(npc, this.collisionLayer(npc)); }
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
    for (const player of this.gameObjects.players) {
      const body = player.physicsBody;
      if (!body) continue;
      if (!(player instanceof PlayerObject)) continue;
      if (player.state.vehicleId !== undefined) {
        body.setLinearVelocity({ x: 0, y: 0 });
        continue;
      }
      body.setLinearVelocity({ x: worldToPhysics(player.state.vx), y: -worldToPhysics(player.state.vy) });
    }
  }
  createVehiclePhysicsBody(vehicle: TrafficState) { return this.physics.createVehicleBody(vehicle, this.vehicleCatalog, state => this.collisionLayer(state)); }
  createVehicleBody(vehicle: TrafficState) { return runCreateVehicleBody(this, vehicle); }
  destroyVehicleBody(id: number) { return runDestroyVehicleBody(this, id); }
  updateVehicleBodyLayer(vehicle: TrafficState, body = this.gameObjects.findVehicle(vehicle.id)?.physicsBody) { return runUpdateVehicleBodyLayer(this, vehicle, body); }
  updateUnoccupiedVehicleDynamics(dt: number) { return runUpdateUnoccupiedVehicleDynamics(this, dt); }
  updateVehicleFloor(vehicle: TrafficState, dt = STEP) { return runUpdateVehicleFloor(this, vehicle, dt); }
  prepareVehicleBodies(starts: ReadonlyMap<number, { x: number; y: number; rotation: number }>, dt = STEP) {
    runPrepareVehicleBodies(this, starts, dt);
    this.vehicleStepVelocities.clear();
    for (const vehicle of this.gameState.vehicleStates) {
      const body = this.gameObjects.findVehicle(vehicle.id)?.physicsBody;
      if (!body) continue;
      const velocity = body.getLinearVelocity();
      this.vehicleStepVelocities.set(vehicle.id, { x: physicsToWorld(velocity.x), y: -physicsToWorld(velocity.y) });
    }
  }
  readVehicleBodies(dt = STEP) { return runReadVehicleBodies(this, dt); }
  maintainTraffic() { return runMaintainTraffic(this); }
  maintainNpcs() { return runMaintainNpcs(this); }
  updateNpcAi(dt = STEP) { return runUpdateNpcAi(this, dt); }
  arrestPlayer(target: PlayerState, officerId?: number) { return runArrestPlayer(this, target, officerId); }
  setPoliceAttackPlayer(enabled: boolean) { return runSetPoliceAttackPlayer(this, enabled); }
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
    const body = playerObject.physicsBody;
    if (body) this.physics.destroyBody(body);
    playerObject.detachPhysicsBody();
    this.history.delete(id); this.recentVehicleEntries.delete(id);
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
  damagePlayer(target: PlayerState, damage: number, killer?: string, cause?: PlayerState['deathCause']) { return runDamagePlayer(this, target, damage, killer, cause); }
  damageNpc(target: NpcState, damage: number, killer?: string, sourceModel?: number, impactRotation?: number, cause?: NpcState['deathCause']) {
    const object = this.gameObjects.findNpc(target.id);
    if (!(object instanceof NpcObject)) return false;
    return object.receiveWeaponHit(damage, sourceModel, killer, this.gameObjectCombatContext(), impactRotation, cause);
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
  runCombatPhase(context: any) { return runCombatPhaseModule(this, context); }
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
