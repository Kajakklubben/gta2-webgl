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

export type PhysicsBodyType = 'static' | 'kinematic' | 'dynamic';

export interface PhysicsVector {
  readonly x: number;
  readonly y: number;
}

export interface PhysicsFixture {
  getFilterCategoryBits(): number;
  getFilterGroupIndex(): number;
  setFilterData(data: { categoryBits: number; maskBits: number; groupIndex: number }): void;
  getUserData(): unknown;
  getBody(): PhysicsBody;
}

export type PhysicsShape =
  | { readonly type: 'circle'; readonly radius: number }
  | { readonly type: 'box'; readonly halfWidth: number; readonly halfHeight: number; readonly center?: PhysicsVector; readonly angle?: number }
  | { readonly type: 'edge'; readonly start: PhysicsVector; readonly end: PhysicsVector };

export interface PhysicsFixtureDefinition {
  readonly shape: PhysicsShape;
  readonly density?: number;
  readonly friction?: number;
  readonly restitution?: number;
  readonly isSensor?: boolean;
  readonly filterCategoryBits?: number;
  readonly filterMaskBits?: number;
  readonly filterGroupIndex?: number;
  readonly userData?: unknown;
}

export interface PhysicsBodyDefinition {
  readonly type?: PhysicsBodyType;
  readonly position?: PhysicsVector;
  readonly angle?: number;
  readonly fixedRotation?: boolean;
  readonly bullet?: boolean;
  readonly allowSleep?: boolean;
  readonly userData?: unknown;
}

export interface PhysicsRuntimeDefinition {
  readonly gravity?: PhysicsVector;
  readonly allowSleep?: boolean;
  readonly continuousPhysics?: boolean;
  readonly linearSlop?: number;
}

export interface PhysicsMassData {
  readonly mass: number;
  readonly center: PhysicsVector;
  readonly inertia: number;
}

/**
 * Minimal body contract shared by game objects and runtime phase runners.
 * Native bodies (Planck today, another solver later) stay behind a game
 * physics adapter and never cross this boundary as concrete library types.
 */
export interface PhysicsBody {
  getType(): PhysicsBodyType;
  setType(type: PhysicsBodyType): void;
  getPosition(): PhysicsVector;
  setPosition(position: PhysicsVector): void;
  getLinearVelocity(): PhysicsVector;
  setLinearVelocity(velocity: PhysicsVector): void;
  getAngle(): number;
  setAngle(angle: number): void;
  getAngularVelocity(): number;
  setAngularVelocity(velocity: number): void;
  setAwake(flag: boolean): void;
  getFixtureList(): PhysicsFixture | null;
  createFixture(definition: PhysicsFixtureDefinition): PhysicsFixture;
  setBullet(flag: boolean): void;
  setMassData(data: PhysicsMassData): void;
  setUserData(data: unknown): void;
  getUserData(): unknown;
}

export interface PhysicsWorldManifold {
  readonly normal?: PhysicsVector | undefined;
  readonly points: readonly PhysicsVector[];
  readonly separations: readonly number[];
}

export interface PhysicsContact {
  getFixtureA(): PhysicsFixture;
  getFixtureB(): PhysicsFixture;
  isTouching(): boolean;
  getWorldManifold(): PhysicsWorldManifold | null;
  setEnabled(flag: boolean): void;
  setFriction(value: number): void;
  setRestitution(value: number): void;
}

export type PhysicsRayCastCallback = (fixture: PhysicsFixture, point: PhysicsVector, normal: PhysicsVector, fraction: number) => number;

/** Native solver operations are implemented by the engine, never by game code. */
export interface PhysicsRuntime {
  createBody(definition?: PhysicsBodyDefinition): PhysicsBody;
  destroyBody(body: PhysicsBody): void;
  step(dt: number, velocityIterations?: number, positionIterations?: number): void;
  rayCast(start: PhysicsVector, end: PhysicsVector, callback: PhysicsRayCastCallback): void;
  queryCircle(center: PhysicsVector, radius: number, callback: (fixture: PhysicsFixture) => boolean): void;
  contacts(): readonly PhysicsContact[];
  onPreSolve(listener: (contact: PhysicsContact) => void): void;
  onPostSolve(listener: (contact: PhysicsContact) => void): void;
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

export { createPhysicsRuntime } from './planck-physics';
