import type { CollisionBody, CollisionContact, CollisionObject, CollisionQuery, CollisionStart } from './collision-types';
import { sameCollisionFloor } from '../../domain/physics/collision-rules';
import { WORLD, physicsToWorld, worldToPhysics } from '../../domain/world/world';
import { createPhysicsRuntime, type PhysicsBody, type PhysicsContact, type PhysicsFixture, type PhysicsRuntime, type PhysicsShape } from '../../engine/physics-world';
export * from './collision-types';
export { COLLISION_CATEGORY, defaultCollisionCategory, sameCollisionFloor, withinCollisionRadius } from '../../domain/physics/collision-rules';

interface PhysicsRecord {
  descriptor: CollisionBody;
  body: PhysicsBody;
  fixture: PhysicsFixture;
}

export type CollisionResult = CollisionContact[];

function shapeFor(body: CollisionBody): PhysicsShape {
  if (body.box) return { type: 'box', halfWidth: worldToPhysics(body.box.width / 2), halfHeight: worldToPhysics(body.box.height / 2) };
  return { type: 'circle', radius: worldToPhysics(body.radius) };
}

function shapeArea(body: CollisionBody) {
  if (body.box) return worldToPhysics(body.box.width) * worldToPhysics(body.box.height);
  const radius = worldToPhysics(body.radius);
  return Math.PI * radius * radius;
}

/** `blockingWeight` is an authored mass, so normalize density by shape area. */
function densityFor(body: CollisionBody, movable: boolean) {
  if (!movable) return 0;
  return Math.max(.001, body.blockingWeight ?? 1) / Math.max(.001, shapeArea(body));
}

function recordForFixture(fixture: PhysicsFixture): PhysicsRecord | undefined {
  return fixture.getBody().getUserData() as PhysicsRecord | undefined;
}

function makeContact(contact: PhysicsContact, a: PhysicsRecord, b: PhysicsRecord): CollisionResult {
  if (!contact.isTouching()) return [];
  const manifold = contact.getWorldManifold();
  const point = manifold?.points[0] ?? {
    x: (a.body.getPosition().x + b.body.getPosition().x) / 2,
    y: (a.body.getPosition().y + b.body.getPosition().y) / 2,
  };
  const centerDelta = {
    x: b.body.getPosition().x - a.body.getPosition().x,
    y: b.body.getPosition().y - a.body.getPosition().y,
  };
  const centerDistance = Math.hypot(centerDelta.x, centerDelta.y);
  // The native solver does not always populate a manifold normal for sensor contacts.
  // Gameplay still needs the incoming direction for vehicle damage/jumps, so
  // fall back to the deterministic A-to-B center vector in that case.
  const manifoldNormal = manifold?.normal;
  let normal: { x: number; y: number } = { x: 0, y: 0 };
  if (manifoldNormal && Math.hypot(manifoldNormal.x, manifoldNormal.y) > 1e-6) {
    normal = manifoldNormal;
  } else if (centerDistance > 1e-6) {
    normal = { x: centerDelta.x / centerDistance, y: centerDelta.y / centerDistance };
  }
  const separation = manifold?.separations[0] ?? 0;
  const left = a.body.getPosition(), right = b.body.getPosition();
  const toWorld = (value: number) => Math.round(physicsToWorld(value) * 1e9) / 1e9;
  return [{
    a: a.descriptor,
    b: b.descriptor,
    normalX: normal.x,
    normalY: normal.y,
    distance: toWorld(Math.hypot(right.x - left.x, right.y - left.y)),
    depth: toWorld(Math.max(0, -separation)),
    pointX: toWorld(point.x),
    pointY: toWorld(point.y),
  }];
}

/**
 * Runtime entity collision is backed by an engine physics runtime. Map and
 * entity runtime ownership is intentionally hidden behind the engine-facing
 * contracts exposed to gameplay systems.
 */
export class CollisionWorld {
  private readonly world: PhysicsRuntime;
  private readonly records = new Map<string, PhysicsRecord>();
  private steppedContacts: CollisionContact[] = [];

  constructor(world: PhysicsRuntime = createPhysicsRuntime({ gravity: { x: 0, y: 0 }, allowSleep: false, continuousPhysics: true, linearSlop: worldToPhysics(.000001) })) {
    this.world = world;
    this.world.onPreSolve(contact => {
      const a = recordForFixture(contact.getFixtureA()), b = recordForFixture(contact.getFixtureB());
      if (!a || !b || !sameCollisionFloor(a.descriptor, b.descriptor)) contact.setEnabled(false);
      else if (a.descriptor.kind !== 'vehicle' || b.descriptor.kind !== 'vehicle') {
        contact.setRestitution(0);
        // GTA2 pedestrians are swept around a chassis and do not inherit the
        // car's tyre grip. Keep that pair frictionless while leaving native
        // vehicle-to-vehicle friction in the solver.
        if (a.descriptor.kind === 'vehicle' || b.descriptor.kind === 'vehicle') contact.setFriction(0);
      }
    });
    this.world.onPostSolve(contact => {
      const a = recordForFixture(contact.getFixtureA()), b = recordForFixture(contact.getFixtureB());
      if (!a || !b || !a.descriptor.solid || !b.descriptor.solid) return;
      const value = makeContact(contact, a, b);
      this.steppedContacts.push(...value);
    });
  }

  clear() {
    for (const record of this.records.values()) this.world.destroyBody(record.body);
    this.records.clear();
  }

  rebuild(objects: Iterable<CollisionObject>) {
    this.clear();
    for (const object of objects) {
      for (const descriptor of object.getCollider()) {
        if (!descriptor.active) continue;
        const movable = descriptor.solid && (descriptor.blockingWeight ?? 1) > 0;
        let bodyType: 'dynamic' | 'static' = 'static';
        if (movable) bodyType = 'dynamic';
        const body = this.world.createBody({
          type: bodyType,
          position: { x: worldToPhysics(descriptor.x), y: worldToPhysics(descriptor.y) },
          angle: descriptor.box?.rotation ?? 0,
          allowSleep: false,
          fixedRotation: descriptor.fixedRotation ?? true,
        });
        const fixture = body.createFixture({
          shape: shapeFor(descriptor),
          density: densityFor(descriptor, movable),
          friction: descriptor.friction ?? 0,
          restitution: descriptor.restitution ?? 0,
          isSensor: !descriptor.solid,
          filterCategoryBits: descriptor.category,
          filterMaskBits: descriptor.mask,
          userData: descriptor,
        });
        // Cars are the fast-moving body in pedestrian sensor contacts. Keep
        // only genuinely fast chassis continuous so ordinary low-speed
        // pushing retains the authored solver response and cannot tunnel
        // through a ped between two fixed simulation poses.
        if (descriptor.kind === 'vehicle') {
          // Lightweight geometry fixtures may implement only the collision
          // surface, so keep this optional read at the adapter boundary.
          const velocity = (descriptor.object as { readPhysicsVelocity?: () => { vx?: number; vy?: number } }).readPhysicsVelocity?.();
          if (Math.hypot(velocity?.vx ?? 0, velocity?.vy ?? 0) >= WORLD.vehicle.collisionDamageSpeed * .75) body.setBullet(true);
        }
        const record = { descriptor, body, fixture };
        body.setUserData(record);
        this.records.set(descriptor.id, record);
      }
    }
    // Build the native broad phase/contact list before callers query it.
    this.world.step(0);
  }

  values() { return [...this.records.values()].map(record => record.descriptor).values(); }

  queryCircle(query: CollisionQuery): CollisionBody[] {
    const result: CollisionBody[] = [], seen = new Set<string>();
    this.world.queryCircle({ x: worldToPhysics(query.x), y: worldToPhysics(query.y) }, worldToPhysics(query.radius), fixture => {
      const record = recordForFixture(fixture), body = record?.descriptor;
      if (!body || seen.has(body.id) || !body.active) return true;
      seen.add(body.id);
      if (query.kinds && !query.kinds.includes(body.kind)) return true;
      if (query.category !== undefined && !(body.mask & query.category)) return true;
      if (query.mask !== undefined && !(query.mask & body.category)) return true;
      if (!sameCollisionFloor(body, query, query.floorTolerance)) return true;
      result.push(body);
      return true;
    });
    return result;
  }

  contacts(filter?: (a: CollisionBody, b: CollisionBody) => boolean): CollisionContact[] {
    const result: CollisionContact[] = [];
    for (const contact of this.world.contacts()) {
      const a = recordForFixture(contact.getFixtureA()), b = recordForFixture(contact.getFixtureB());
      if (!a || !b || (filter && !filter(a.descriptor, b.descriptor))) continue;
      const value = makeContact(contact, a, b);
      result.push(...value);
    }
    return result;
  }

  /** Let the engine solver perform all solid separation and velocity response. */
  resolveBlocking(dt = 1 / WORLD.tickRate, starts?: ReadonlyMap<string, CollisionStart>, mapBlockedBodies?: ReadonlySet<string>): CollisionContact[] {
    const priorContacts = this.contacts((a, b) => a.solid && b.solid);
    const priorSensorContacts = this.contacts((a, b) => !(a.solid && b.solid));
    const priorContactIds = new Set(priorContacts.flatMap(contact => [contact.a.id, contact.b.id]));
    const originalVelocity = new Map<string, { x: number; y: number }>();
    const nativeStarts = new Set<string>();
    for (const record of this.records.values()) {
      const movable = record.descriptor.solid && (record.descriptor.blockingWeight ?? 1) > 0;
      if (movable) record.body.setType('dynamic');
      else record.body.setType('static');
      const state = record.descriptor.object.readPhysicsVelocity();
      const velocity = { x: state.vx ?? 0, y: state.vy ?? 0 };
      originalVelocity.set(record.descriptor.id, velocity);
      if (!movable) {
        record.body.setLinearVelocity({ x: 0, y: 0 });
        record.body.setAngularVelocity(0);
        continue;
      }

      // If the world runtime captured a start pose, run the native body from that
      // pose through this fixed step. This makes the collision world the
      // single integrator for entity bounces while map physics may still have
      // resolved the same horizontal displacement against static walls. A
      // standalone caller has no start map; its descriptor pose is already
      // the intended contact pose, so solve from there without a second
      // velocity rewind.
      const position = record.body.getPosition();
      const providedStart = starts?.get(record.descriptor.id);
      const mapBlocked = mapBlockedBodies?.has(record.descriptor.id) === true;
      // The map physics pass may already have stopped this body at a wall.
      // In that case the desired pose moved less than its post-contact
      // velocity would imply; preserve that pose and solve entity contacts
      // from it instead of rewinding through the wall.
      const expectedDistance = Math.hypot(velocity.x, velocity.y) * dt;
      let actualDistance = expectedDistance;
      if (providedStart !== undefined) actualDistance = Math.hypot(record.descriptor.x - providedStart.x, record.descriptor.y - providedStart.y);
      let start: CollisionStart | undefined;
      if (!mapBlocked && providedStart !== undefined && (expectedDistance < 1e-5 || actualDistance + Math.max(.5, expectedDistance * .1) >= expectedDistance)) start = providedStart;
      if (start) nativeStarts.add(record.descriptor.id);
      if (start) record.body.setPosition({ x: worldToPhysics(start.x), y: worldToPhysics(start.y) });
      else record.body.setPosition(position);
      const angular = state.angularVelocity ?? 0;
      if (record.descriptor.box && record.descriptor.fixedRotation !== true) {
        if (start?.rotation !== undefined) record.body.setAngle(start.rotation);
        record.body.setAngularVelocity(angular);
      }
      const standaloneContact = !start && priorContactIds.has(record.descriptor.id);
      let nativeVelocity = { x: 0, y: 0 };
      if (start || standaloneContact) nativeVelocity = velocity;
      record.body.setLinearVelocity({ x: worldToPhysics(nativeVelocity.x), y: worldToPhysics(nativeVelocity.y) });
      record.body.setAwake(true);
    }

    // Positions are rewound after the previous broad phase was built. Refresh
    // the native contact cache before the real fixed step so warm-start data
    // from the old pose cannot inject a spurious sideways impulse.
    this.steppedContacts = [];
    this.world.step(0);
    this.steppedContacts = [];
    this.world.step(dt, 8, 80);
    const resolved = this.contacts((a, b) => a.solid && b.solid);
    for (const record of this.records.values()) {
      if (record.body.getType() !== 'dynamic') continue;
      const position = record.body.getPosition();
      const placement = record.descriptor.object.placement;
      const round = (value: number) => {
        const rounded = Math.round(value * 10000) / 10000;
        if (Object.is(rounded, -0)) return 0;
        return rounded;
      };
      const nativeVelocity = record.body.getLinearVelocity();
      const nativeX = physicsToWorld(nativeVelocity.x), nativeY = physicsToWorld(nativeVelocity.y);
      const state = record.descriptor.object.readPhysicsVelocity();
      // A standalone caller normally supplies an already-integrated pose. If
      // the native solver left a velocity component unchanged, remove only
      // that free displacement while retaining the contact correction. A
      // changed component is a genuine solver response (including bounce)
      // and remains authoritative.
      const standalone = !nativeStarts.has(record.descriptor.id);
      let adjustedX = physicsToWorld(position.x);
      if (standalone && Math.abs(nativeX - (state.vx ?? 0)) < 1e-5) adjustedX = physicsToWorld(position.x) - (state.vx ?? 0) * dt;
      let adjustedY = physicsToWorld(position.y);
      if (standalone && Math.abs(nativeY - (state.vy ?? 0)) < 1e-5) adjustedY = physicsToWorld(position.y) - (state.vy ?? 0) * dt;
      let resolvedPlacement = {
        ...placement,
        x: round(adjustedX),
        y: round(adjustedY),
      };
      if (record.descriptor.box && record.descriptor.fixedRotation !== true) resolvedPlacement = { ...resolvedPlacement, rotation: record.body.getAngle() };
      const resolvedVelocity: { vx?: number; vy?: number; angularVelocity?: number } = {};
      if (state.vx !== undefined && (!standalone || priorContactIds.has(record.descriptor.id))) resolvedVelocity.vx = nativeX;
      if (state.vy !== undefined && (!standalone || priorContactIds.has(record.descriptor.id))) resolvedVelocity.vy = nativeY;
      if (state.angularVelocity !== undefined) resolvedVelocity.angularVelocity = record.body.getAngularVelocity();
      record.descriptor.object.applyPhysicsResult(resolvedPlacement, resolvedVelocity);
    }
    // Sensors do not enter the solver's post-solve stream, but GTA2 still consumes
    // the contact for pedestrian-versus-car damage and jump-over decisions.
    const sensorContacts = this.contacts((a, b) => !(a.solid && b.solid));
    const impacts = [...priorContacts, ...priorSensorContacts, ...this.steppedContacts, ...resolved, ...sensorContacts].filter((contact, index, all) => {
      const key = [contact.a.id, contact.b.id].sort().join('|');
      return all.findIndex(candidate => [candidate.a.id, candidate.b.id].sort().join('|') === key) === index;
    });
    return impacts.map(contact => ({
      ...contact,
      // Keep the incoming velocity for damage and gameplay impact packets;
      // the object's state now contains the solver's post-contact bounce velocity.
      velocityA: originalVelocity.get(contact.a.id) ?? { x: 0, y: 0 },
      velocityB: originalVelocity.get(contact.b.id) ?? { x: 0, y: 0 },
    }));
  }
}

function contactFromDescriptors(a: CollisionBody, b: CollisionBody): CollisionResult {
  const world = new CollisionWorld();
  // Standalone geometry helpers must still report contacts for two fixed
  // descriptors; a real world uses static-vs-dynamic filtering as usual.
  const left = { ...a.object, getCollider: () => [{ ...a, blockingWeight: 1 }] } as CollisionObject;
  const right = { ...b.object, getCollider: () => [{ ...b, blockingWeight: 1 }] } as CollisionObject;
  world.rebuild([left, right]);
  return world.contacts((left, right) => (left.id === a.id && right.id === b.id) || (left.id === b.id && right.id === a.id));
}

/** Compatibility helpers now delegate to the engine solver instead of implementing geometry. */
export function circleContact(a: CollisionBody, b: CollisionBody, floorTolerance = WORLD.interaction.sameFloor) {
  if (!a.active || !b.active || a.id === b.id || a.box || b.box || !sameCollisionFloor(a, b, floorTolerance)) return [];
  if (!(a.mask & b.category) || !(b.mask & a.category)) return [];
  return contactFromDescriptors(a, b).filter(contact => contact.depth > 1e-3);
}

export function shapeContact(a: CollisionBody, b: CollisionBody, floorTolerance = WORLD.interaction.sameFloor) {
  if (!a.active || !b.active || a.id === b.id || !sameCollisionFloor(a, b, floorTolerance)) return [];
  if (!(a.mask & b.category) || !(b.mask & a.category)) return [];
  return contactFromDescriptors(a, b).filter(contact => contact.depth > 1e-3);
}

