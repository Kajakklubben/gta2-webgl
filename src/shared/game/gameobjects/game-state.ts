import { gameObjectKey, type GameObject, type GameObjectId, type GameObjectKind, type GameStateAccess } from './gameobject';
import type { HazardObject } from '../effects/hazard';
import type { PickupObject } from '../effects/pickup';
import type { ProjectileObject, ProjectileState } from '../effects/projectile';
import type { PlayerObject } from './player';
import type { VehicleObject } from './vehicle';
import type { NpcObject } from './npc';
import type { HazardState, NpcState, PickupState, PlayerState, TrafficState } from '../../protocol/types';
import type { StaticMapObject } from './map-object';

type LifecycleCommand =
  | { type: 'spawn'; object: GameObject<any> }
  | { type: 'despawn'; object: GameObject<any> };

/**
 * The object-facing world state.
 *
 * GameState is the single shared lookup/lifecycle boundary for game objects.
 * Objects receive this context when registered, so an object can discover
 * peers and request lifecycle changes without depending on GameWorld or on
 * another object's private state. Cross-object changes still go through the
 * target object's public action methods.
 */
export class GameState implements GameStateAccess {
  private readonly objects = new Map<string, GameObject<any>>();
  private readonly stateLists = new Map<GameObjectKind, GameObject<any>['state'][]>();
  private readonly lifecycleQueue: LifecycleCommand[] = [];

  private listFor(kind: GameObjectKind) {
    let list = this.stateLists.get(kind);
    if (!list) { list = []; this.stateLists.set(kind, list); }
    return list;
  }

  register<T extends GameObject<any>>(object: T) {
    const previous = this.objects.get(object.key);
    if (previous && previous !== object) this.unregister(previous);
    this.objects.set(object.key, object);
    object.bindWorld(this);
    const states = this.listFor(object.kind);
    if (!states.includes(object.state)) states.push(object.state);
    return object;
  }
  unregister(object: GameObject<any>) {
    this.objects.delete(object.key);
    const states = this.listFor(object.kind), index = states.indexOf(object.state);
    if (index >= 0) states.splice(index, 1);
    object.bindWorld(undefined);
  }
  spawn<T extends GameObject<any>>(object: T) { return this.register(object); }
  despawn(object: GameObject<any>) { this.unregister(object); }
  deferSpawn<T extends GameObject<any>>(object: T) {
    this.lifecycleQueue.push({ type: 'spawn', object });
    return object;
  }
  deferDespawn(object: GameObject<any>) {
    this.lifecycleQueue.push({ type: 'despawn', object });
  }
  flushLifecycle() {
    const pending = this.lifecycleQueue.splice(0);
    for (const command of pending) {
      if (command.type === 'spawn') this.register(command.object);
      else this.unregister(command.object);
    }
  }
  /** Entity lookup is intentionally typed by domain kind; callers should not
   * search the heterogeneous object map by string kind and cast the result. */
  findPlayer(id: string) { return this.objects.get(gameObjectKey('player', id)) as PlayerObject | undefined; }
  findVehicle(id: number) { return this.objects.get(gameObjectKey('vehicle', id)) as VehicleObject | undefined; }
  findPickup(id: number) { return this.objects.get(gameObjectKey('pickup', id)) as PickupObject | undefined; }
  findProjectile(id: string | number) { return this.objects.get(gameObjectKey('projectile', id)) as ProjectileObject | undefined; }
  findHazard(id: number) { return this.objects.get(gameObjectKey('hazard', id)) as HazardObject | undefined; }
  findNpc(id: number) { return this.objects.get(gameObjectKey('npc', id)) as NpcObject | undefined; }
  findMapObject(id: number) { return this.objects.get(gameObjectKey('map-object', id)) as StaticMapObject | undefined; }
  values() { return this.objects.values(); }
  get size() { return this.objects.size; }

  objectsOfKind<T extends GameObject<any> = GameObject<any>>(kind: GameObjectKind): readonly T[] {
    return [...this.objects.values()].filter(object => object.kind === kind) as T[];
  }
  states<T extends object>(kind: GameObjectKind): T[] { return this.listFor(kind) as T[]; }
  stateMap<T extends { id: GameObjectId }>(kind: GameObjectKind): Map<GameObjectId, T> {
    return new Map(this.listFor(kind).map(state => {
      const typedState = state as T;
      return [typedState.id, typedState] as const;
    }));
  }

  get players(): readonly PlayerObject[] { return this.objectsOfKind<PlayerObject>('player'); }
  get vehicles(): readonly VehicleObject[] { return this.objectsOfKind<VehicleObject>('vehicle'); }
  get pickups(): readonly PickupObject[] { return this.objectsOfKind<PickupObject>('pickup'); }
  get projectiles(): readonly ProjectileObject[] { return this.objectsOfKind<ProjectileObject>('projectile'); }
  get hazards(): readonly HazardObject[] { return this.objectsOfKind<HazardObject>('hazard'); }

  /** Typed mutable state views. Object behavior should prefer the object
   * collections above; adapters and protocol code use these state views. */
  get playerStates(): Map<string, PlayerState> { return this.stateMap<PlayerState>('player') as Map<string, PlayerState>; }
  get pickupStates(): PickupState[] { return this.states<PickupState>('pickup'); }
  get vehicleStates(): TrafficState[] { return this.states<TrafficState>('vehicle'); }
  get projectileStates(): ProjectileState[] { return this.states<ProjectileState>('projectile'); }
  get hazardStates(): HazardState[] { return this.states<HazardState>('hazard'); }
  get npcStates(): NpcState[] { return this.states<NpcState>('npc'); }

  get npcs(): readonly NpcObject[] { return this.objectsOfKind<NpcObject>('npc'); }
  get mapObjects(): readonly StaticMapObject[] { return this.objectsOfKind<StaticMapObject>('map-object'); }
}
