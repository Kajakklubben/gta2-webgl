import { WORLD } from '../../domain/world/world';
import type { PlayerState, TrafficState } from '../../protocol/types';
import { PlayerObject } from '../gameobjects/player';
import type { WorldPhaseContext } from '../../engine/world-runtime';
import type { WorldTickState } from './types';
import { occupantForPlayer } from '../../domain/vehicles/vehicle-occupancy';
import { withinCollisionRadius } from '../../domain/physics/collision-rules';
import { setBodyCollisionLayer } from '../physics/body-factory';
import { runCollisionPhase as executeCollisionPhase, runPhysicsPhase as executePhysicsPhase, runReplicationPhase as executeReplicationPhase, type CollisionPhaseHost, type PhysicsPhaseHost, type ReplicationPhaseHost } from './phase-runners';

export function runInputPhase(world: any, _context: WorldPhaseContext<WorldTickState>) {
    const inputs = _context.state.inputs, reactivated = _context.state.reactivated, playerOnly = _context.state.playerOnly;
    for (const playerObject of world.gameObjects.players) {
      const id = playerObject.id, body = playerObject.physicsBody;
      if (!body) continue;
      if (playerOnly && id !== world.localId) continue;
      const player: PlayerState = world.gameState.playerStates.get(id)!;
      const combat = player.combat;
      const input = world.input(inputs.get(id));
      if (playerObject instanceof PlayerObject && input.controls) playerObject.applyControls(input.controls);
      // The authoritative server reconstructs held controls from transition
      // events. Use the continuous key mask only for the current input when
      // explicit transitions are absent.
      let keys = input.keys;
      if (!playerOnly && playerObject instanceof PlayerObject && input.controls !== undefined) keys = playerObject.heldControls;
      let controlInput = input;
      if (keys !== input.keys) controlInput = { ...input, keys };
      if (playerOnly && combat.respawn > 0) {
        continue;
      }
      if (playerOnly) combat.attacking = false;
      else {
        for (const shot of combat.shots) shot.life--;
        combat.shots = combat.shots.filter(shot => shot.life > 0);
        if (combat.cooldown > 0) combat.cooldown--;
        if (combat.fireAnimation > 0) combat.fireAnimation = Math.max(0, combat.fireAnimation - 1);
        if (!combat.throwing && combat.throwAnimation > 0) combat.throwAnimation = Math.max(0, combat.throwAnimation - 1);
      }
      if (combat.respawn > 0) {
        if (playerObject instanceof PlayerObject) playerObject.resetMotion();
        combat.throwAnimation = 0; combat.attacking = false;
        if (--combat.respawn === 0) { const spawn = world.spawnPoint(); world.restore({ ...player, ...spawn, combat: world.weaponSystem.createCombat(), vehicleId: undefined, jump: undefined, movement: { speed: 0, turnSpeed: 0, moveDirection: 0 } }); world.spawnProtection.set(player.id, 120); }
        continue;
      }
      const floor = world.floor(player);
      const weaponNext = input.controls?.includes('weaponNext') ?? (Boolean(keys & 64) && !(combat.previousKeys & 64));
      const weaponPrevious = input.controls?.includes('weaponPrevious') ?? false;
      if (!playerOnly && (weaponNext || weaponPrevious)) {
        if (weaponPrevious) world.playerSystem.loadout.cycleWeaponPrevious(player);
        else world.playerSystem.loadout.cycleWeapon(player);
        combat.throwing = false; combat.throwCharge = 0; combat.throwAnimation = 0; combat.attacking = false;
      }
      const recentEntry = world.recentVehicleEntries.get(id);
      if (recentEntry && recentEntry.untilTick < world.tick) world.recentVehicleEntries.delete(id);
      // Accept the legacy edge action even when a newer client also sends an
      // empty controls array. The player-one gamepad path uses this shape for
      // enter/exit, and treating `[]` as authoritative made the action vanish.
      const enterVehicle = input.controls?.includes('enterVehicle') === true || input.action === 'enter';
      const duplicateMobileEntry = enterVehicle && input.vehicleId !== undefined && recentEntry?.vehicleId === input.vehicleId && recentEntry.untilTick >= world.tick;
      if (!playerOnly && enterVehicle && !duplicateMobileEntry) {
        if (player.vehicleId !== undefined) {
          // An explicit mobile target must be the car being occupied. Tapping
          // a different car while driving does not eject the player; the
          // keyboard/Enter button path has no vehicle id and still exits.
          if (input.vehicleId !== undefined && input.vehicleId !== player.vehicleId) continue;
          const vehicle = world.gameState.vehicleStates.find((item: TrafficState) => item.id === player.vehicleId);
          const occupant = vehicle && occupantForPlayer(vehicle, id);
          if (vehicle && occupant && occupant.state !== 'exiting') {
            const speed = Math.hypot(vehicle.vx, vehicle.vy);
            // The source accepts an explicit keyboard cancel while the
            // authored entry state is still advancing. A mobile tap carries
            // the vehicle id and can be delivered twice by pointer capture;
            // that duplicate must not turn a valid entry into an immediate
            // eject/re-open cycle.
            if (occupant.state === 'approaching' || occupant.state === 'entering') {
              if (input.vehicleId === undefined) world.beginVehicleExit(player, vehicle, true);
            }
            else if (speed <= WORLD.vehicle.occupancySpeedLimit) world.beginVehicleExit(player, vehicle);
          }
        } else {
          const explicitTarget = input.vehicleId;
          // The keyboard and Enter button use the nearest usable car. A
          // mobile tap supplies an id and must preserve that exact selection,
          // even when another car happens to be closer.
          const candidates = world.gameState.vehicleStates
            .filter((item: TrafficState) => {
              if (item.health <= 0 || (item.wrecked && item.health <= 0)) return false;
              if (explicitTarget !== undefined) return item.id === explicitTarget && withinCollisionRadius(item, player, WORLD.vehicle.enterDistance, WORLD.interaction.sameFloor + 1);
              return withinCollisionRadius(item, player, WORLD.vehicle.enterDistance, WORLD.interaction.sameFloor + 1);
            })
            .sort((a: TrafficState, b: TrafficState) => {
              if (explicitTarget !== undefined) return 0;
              return Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y);
            });
          let entered = false;
          for (const vehicle of candidates) {
            if (vehicle.health <= 0 || (vehicle.wrecked && vehicle.health <= 0)) continue;
            // An NPC driver is carjackable: target the driver seat so the
            // entry transition can eject that NPC and hand the chassis to the
            // player. Other occupied cars still use a passenger seat.
            const npcDriver = vehicle.passengers[0]?.startsWith('npc:') === true;
            const role: 'passenger' | 'driver' = npcDriver || vehicle.passengers.length === 0 ? 'driver' : 'passenger';
            for (const candidate of world.vehicleDoorPosition(vehicle, player, true, role)) {
              if (world.beginVehicleEntry(player, vehicle, candidate)) {
                world.emit({ type: 'vehicle-enter', actor: id, entity: vehicle.id, x: vehicle.x, y: vehicle.y, z: vehicle.z });
                entered = true;
                break;
              }
            }
            if (entered) break;
          }
        }
      }
      const jumpRequested = input.controls?.includes('jump') === true || input.action === 'jump';
      if (jumpRequested && player.vehicleId === undefined) world.beginPlayerJump(player, controlInput, floor);
      if (player.vehicleId !== undefined) {
        const vehicle = world.gameState.vehicleStates.find((item: TrafficState) => item.id === player.vehicleId);
        const occupant = vehicle && occupantForPlayer(vehicle, id);
        if (vehicle && occupant && vehicle.health <= 0) world.detachVehicleOccupant(vehicle, id, 0);
        if (!vehicle || !occupant || vehicle.health <= 0) {
          if (playerObject instanceof PlayerObject) playerObject.clearVehicleOccupancy();
        } else if (occupant.state === 'exiting') {
          if (!playerOnly) world.collectPickups(player, reactivated);
          continue;
        } else {
          // The player object owns the movement command boundary. It delegates
          // to the vehicle when it is the driver, while passengers remain
          // seated and never fall back to on-foot movement.
          world.updateVehicleFloor(vehicle, _context.dt);
          const slippery = world.gameState.hazardStates.some((hazard: { kind: string; z: number; x: number; y: number }) => hazard.kind === 'slick' && Math.abs(hazard.z - vehicle.z) <= 1 && Math.hypot(hazard.x - vehicle.x, hazard.y - vehicle.y) < WORLD.interaction.pickupRadius);
          if (playerObject instanceof PlayerObject) playerObject.applyMovementInput(controlInput, floor, _context.dt, slippery);
          if (!playerOnly) world.collectPickups(player, reactivated);
          continue;
        }
      }
      if (playerObject instanceof PlayerObject) playerObject.applyMovementInput(controlInput, floor, _context.dt);
      const fixture = body.getFixtureList();
      if (fixture) fixture.setFilterData({
        categoryBits: fixture.getFilterCategoryBits(),
        maskBits: 1 << world.collisionLayer(player),
        groupIndex: fixture.getFilterGroupIndex(),
      });
      if (!playerOnly) world.collectPickups(player, reactivated);
    }
  }

export function runPhysicsPhase(world: any, _context: WorldPhaseContext<WorldTickState>) {
    const host: PhysicsPhaseHost = {
      playerObjects: world.gameObjects.players,
      preparePlayerBodies: () => world.preparePlayerBodies(),
      prepareVehicleBodies: (starts, dt) => world.prepareVehicleBodies(starts, dt),
      readVehicleBodies: dt => world.readVehicleBodies(dt),
      prepareNpcBodies: (starts, dt) => world.prepareNpcBodies(starts, dt),
      readNpcBodies: () => world.readNpcBodies(),
      physicsStep: dt => world.physicsWorld.step(dt),
      applySurface: (state, surface, dt, allowFall) => world.applySurface(state, surface, dt, allowFall),
      surfaceFor: state => world.surfaceFor(state),
      collisionLayer: state => world.collisionLayer(state),
      setPlayerCollisionLayer: (player, body) => setBodyCollisionLayer(body, world.collisionLayer(player)),
    };
    executePhysicsPhase(host, _context);
  }

export function runCollisionPhase(world: any, _context: WorldPhaseContext<WorldTickState>) {
    const host: CollisionPhaseHost = {
      syncCollisionWorld: () => world.syncCollisionWorld(),
      resolveBlocking: (dt, starts) => world.physicsWorld.resolveBlocking(dt, starts),
      applyVehicleImpacts: contacts => world.applyVehicleImpacts(contacts),
      applyPedestrianImpacts: contacts => world.applyPedestrianImpacts(contacts),
      syncBlockedBodies: () => world.syncBlockedBodies(),
      drainMapContacts: () => world.physicsWorld.drainMapContacts(),
      traffic: world.gameState.vehicleStates,
      vehicleObjectFor: (id: number) => world.gameObjects.findVehicle(id),
      combatContext: () => world.gameObjectCombatContext(),
    };
    executeCollisionPhase(host, _context);
  }

export function runReplicationPhase(world: any, _context: WorldPhaseContext<WorldTickState>) {
    const host: ReplicationPhaseHost = {
      tick: world.tick,
      players: world.gameState.playerStates.values(),
      traffic: world.gameState.vehicleStates,
      history: world.history,
      vehicleHistory: world.vehicleHistory,
    };
    executeReplicationPhase(host, _context);
  }


