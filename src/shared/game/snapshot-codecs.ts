import type { CombatState, HazardState, NpcState, PickupState, PlayerState, TrafficState } from '../protocol/types';

export interface SnapshotCodec<T extends object> {
  fromSnapshot(snapshot: T): T;
  apply(target: T, snapshot: T): T;
  toSnapshot(state: T): T;
}

function applyPlain<T extends object>(target: T, snapshot: T) {
  for (const key of Object.keys(target)) if (!(key in snapshot)) delete (target as Record<string, unknown>)[key];
  Object.assign(target, snapshot);
  return target;
}

export function cloneCombatSnapshot(combat: CombatState): CombatState {
  return { ...combat, ammo: [...combat.ammo], shots: combat.shots.map(shot => ({ ...shot })) };
}

export function clonePlayerSnapshot(snapshot: PlayerState): PlayerState {
  const result = { ...snapshot, combat: cloneCombatSnapshot(snapshot.combat) };
  if (snapshot.animation) result.animation = { ...snapshot.animation };
  if (snapshot.jump) result.jump = { ...snapshot.jump };
  if (snapshot.movement) result.movement = { ...snapshot.movement };
  return result;
}

export function clonePickupSnapshot(snapshot: PickupState): PickupState { return { ...snapshot }; }
export function cloneTrafficSnapshot(snapshot: TrafficState): TrafficState {
  return {
    ...snapshot,
    passengers: [...snapshot.passengers],
    occupants: snapshot.occupants.map(occupant => ({ ...occupant })),
    doorStates: snapshot.doorStates.map(door => ({ ...door })),
  };
}
export function cloneHazardSnapshot(snapshot: HazardState): HazardState { return { ...snapshot }; }
export function cloneNpcSnapshot(snapshot: NpcState): NpcState {
  const result = { ...snapshot, shots: snapshot.shots.map(shot => ({ ...shot })) };
  if (snapshot.path) result.path = [...snapshot.path];
  if (snapshot.pathGoal) result.pathGoal = { ...snapshot.pathGoal };
  if (snapshot.patrolRoute) result.patrolRoute = [...snapshot.patrolRoute];
  if (snapshot.jump) result.jump = { ...snapshot.jump };
  return result;
}

export const playerSnapshotCodec: SnapshotCodec<PlayerState> = {
  fromSnapshot: clonePlayerSnapshot,
  apply(target, snapshot) {
    const next = clonePlayerSnapshot(snapshot);
    const existingCombat = target.combat;
    applyPlain(target, next);
    existingCombat.ammo.splice(0, existingCombat.ammo.length, ...next.combat.ammo);
    applyPlain(existingCombat, next.combat);
    target.combat = existingCombat;
    return target;
  },
  toSnapshot: clonePlayerSnapshot,
};

export const pickupSnapshotCodec: SnapshotCodec<PickupState> = { fromSnapshot: clonePickupSnapshot, apply: applyPlain, toSnapshot: clonePickupSnapshot };
export const trafficSnapshotCodec: SnapshotCodec<TrafficState> = { fromSnapshot: cloneTrafficSnapshot, apply: applyPlain, toSnapshot: cloneTrafficSnapshot };
export const hazardSnapshotCodec: SnapshotCodec<HazardState> = { fromSnapshot: cloneHazardSnapshot, apply: applyPlain, toSnapshot: cloneHazardSnapshot };
export const npcSnapshotCodec: SnapshotCodec<NpcState> = { fromSnapshot: cloneNpcSnapshot, apply: applyPlain, toSnapshot: cloneNpcSnapshot };
