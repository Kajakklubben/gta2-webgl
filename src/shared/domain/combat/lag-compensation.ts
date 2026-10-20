/** Shared fixed-tick history lookup used by authoritative weapon queries. */
export type HistoryEntry = { readonly tick: number };
export type PlayerHistoryEntry = HistoryEntry & { readonly x: number; readonly y: number; readonly z: number };
export type VehicleHistoryEntry = PlayerHistoryEntry & { readonly rotation: number };
export type HistoryTick = number | 'latest';

export function stateAtTick<T extends HistoryEntry>(entries: readonly T[], tick: number, current: T): T {
  if (!entries.length) return current;
  let result = entries[0]!;
  for (const entry of entries) {
    if (entry.tick > tick) break;
    result = entry;
  }
  return result;
}

export class LagCompensation {
  constructor(
    private readonly playerHistory: ReadonlyMap<string, readonly PlayerHistoryEntry[]>,
    private readonly vehicleHistory: ReadonlyMap<number, readonly VehicleHistoryEntry[]>,
  ) {}

  player(id: string, tick: HistoryTick, current: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    if (tick === 'latest') return current;
    return stateAtTick(this.playerHistory.get(id) ?? [], tick, { ...current, tick });
  }

  vehicle(id: number, tick: HistoryTick, current: { x: number; y: number; z: number; rotation: number }): { x: number; y: number; z: number; rotation: number } {
    if (tick === 'latest') return current;
    return stateAtTick(this.vehicleHistory.get(id) ?? [], tick, { ...current, tick });
  }
}
