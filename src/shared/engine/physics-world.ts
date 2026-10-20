/** A backend for dynamic entity collision supplied by a game implementation. */
export interface EntityPhysicsBackend<TObject, TBody, TQuery, TContact, TStart> {
  sync(objects: Iterable<TObject>): void;
  queryCircle(query: TQuery): TBody[];
  contacts(filter?: (a: TBody, b: TBody) => boolean): TContact[];
  resolveBlocking(dt?: number, starts?: ReadonlyMap<string, TStart>): TContact[];
}

/** The map backend can be Planck, another 2D solver, or a test double. */
export interface MapPhysicsBackend {
  step(dt: number): void;
  rayCast(start: { x: number; y: number }, end: { x: number; y: number }, accept?: (fixture: unknown) => boolean): number;
}

export interface MapContact {
  readonly bodyId: string;
  readonly impact: number;
  readonly pointX?: number | undefined;
  readonly pointY?: number | undefined;
}

/**
 * Engine-owned boundary between static map physics and game entity physics.
 *
 * The engine only coordinates the two backends. A game implementation owns
 * the entity descriptors, queries, and contact rules, which keeps this layer
 * reusable for other levels and games without importing GTA2 state types.
 */
export class PhysicsWorld<TObject, TBody, TQuery, TContact, TStart> {
  private readonly mapContacts: MapContact[] = [];

  constructor(
    private readonly entities: EntityPhysicsBackend<TObject, TBody, TQuery, TContact, TStart>,
    private readonly map: MapPhysicsBackend,
  ) {}

  sync(objects: Iterable<TObject>) { this.entities.sync(objects); }
  queryCircle(query: TQuery) { return this.entities.queryCircle(query); }
  contacts(filter?: (a: TBody, b: TBody) => boolean) { return this.entities.contacts(filter); }
  resolveBlocking(dt?: number, starts?: ReadonlyMap<string, TStart>) { return this.entities.resolveBlocking(dt, starts); }
  rayCast(start: { x: number; y: number }, end: { x: number; y: number }, accept?: (fixture: unknown) => boolean) { return this.map.rayCast(start, end, accept); }
  step(dt: number) { this.map.step(dt); }
  recordMapContact(contact: MapContact) { this.mapContacts.push(contact); }
  drainMapContacts() { return this.mapContacts.splice(0); }
}
