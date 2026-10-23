import * as planck from 'planck';
import type {
  PhysicsBody,
  PhysicsBodyDefinition,
  PhysicsContact,
  PhysicsFixture,
  PhysicsFixtureDefinition,
  PhysicsMassData,
  PhysicsRayCastCallback,
  PhysicsRuntime,
  PhysicsRuntimeDefinition,
  PhysicsShape,
  PhysicsVector,
  PhysicsWorldManifold,
} from './physics-world';

type NativeBody = planck.Body;
type NativeFixture = planck.Fixture;

class PlanckFixture implements PhysicsFixture {
  constructor(private readonly native: NativeFixture, private readonly body: PhysicsBody) {}

  getFilterCategoryBits() { return this.native.getFilterCategoryBits(); }
  getFilterGroupIndex() { return this.native.getFilterGroupIndex(); }
  setFilterData(data: { categoryBits: number; maskBits: number; groupIndex: number }) { this.native.setFilterData(data); }
  getUserData() { return this.native.getUserData(); }
  getBody() { return this.body; }
}

class PlanckBody implements PhysicsBody {
  constructor(readonly native: NativeBody) {}

  getType() { return this.native.getType(); }
  setType(type: 'static' | 'kinematic' | 'dynamic') { this.native.setType(type); }
  getPosition() { return this.native.getPosition(); }
  setPosition(position: PhysicsVector) { this.native.setPosition(position); }
  getLinearVelocity() { return this.native.getLinearVelocity(); }
  setLinearVelocity(velocity: PhysicsVector) { this.native.setLinearVelocity(velocity); }
  getAngle() { return this.native.getAngle(); }
  setAngle(angle: number) { this.native.setAngle(angle); }
  getAngularVelocity() { return this.native.getAngularVelocity(); }
  setAngularVelocity(velocity: number) { this.native.setAngularVelocity(velocity); }
  setAwake(flag: boolean) { this.native.setAwake(flag); }
  setBullet(flag: boolean) { this.native.setBullet(flag); }
  setMassData(data: PhysicsMassData) { this.native.setMassData({ mass: data.mass, center: data.center, I: data.inertia }); }
  setUserData(data: unknown) { this.native.setUserData(data); }
  getUserData() { return this.native.getUserData(); }

  getFixtureList() {
    const fixture = this.native.getFixtureList();
    return fixture ? new PlanckFixture(fixture, this) : null;
  }

  createFixture(definition: PhysicsFixtureDefinition) {
    const fixture = this.native.createFixture({
      shape: shapeFor(definition.shape),
      density: definition.density,
      friction: definition.friction,
      restitution: definition.restitution,
      isSensor: definition.isSensor,
      filterCategoryBits: definition.filterCategoryBits,
      filterMaskBits: definition.filterMaskBits,
      filterGroupIndex: definition.filterGroupIndex,
      userData: definition.userData,
    } as planck.FixtureDef);
    return new PlanckFixture(fixture, this);
  }
}

class PlanckContact implements PhysicsContact {
  constructor(private readonly native: planck.Contact, private readonly bodies: WeakMap<NativeBody, PlanckBody>) {}

  getFixtureA() { return this.fixture(this.native.getFixtureA()); }
  getFixtureB() { return this.fixture(this.native.getFixtureB()); }
  isTouching() { return this.native.isTouching(); }
  getWorldManifold(): PhysicsWorldManifold | null {
    const manifold = this.native.getWorldManifold(null);
    if (!manifold) return null;
    return {
      normal: manifold.normal ? { x: manifold.normal.x, y: manifold.normal.y } : undefined,
      points: manifold.points.map(point => ({ x: point.x, y: point.y })),
      separations: [...manifold.separations],
    };
  }
  setEnabled(flag: boolean) { this.native.setEnabled(flag); }
  setFriction(value: number) { this.native.setFriction(value); }
  setRestitution(value: number) { this.native.setRestitution(value); }

  private fixture(fixture: NativeFixture) {
    const body = this.bodies.get(fixture.getBody());
    if (!body) throw new Error('Planck contact references an unknown body');
    return new PlanckFixture(fixture, body);
  }
}

function shapeFor(shape: PhysicsShape): planck.Shape {
  if (shape.type === 'circle') return new planck.CircleShape(shape.radius);
  if (shape.type === 'box') return new planck.BoxShape(shape.halfWidth, shape.halfHeight, shape.center, shape.angle);
  const thickness = shape.thickness ?? 0;
  if (thickness > 0) {
    const dx = shape.end.x - shape.start.x;
    const dy = shape.end.y - shape.start.y;
    const length = Math.hypot(dx, dy);
    if (length > 1e-9) {
      return new planck.BoxShape(
        length / 2,
        thickness / 2,
        { x: (shape.start.x + shape.end.x) / 2, y: (shape.start.y + shape.end.y) / 2 },
        Math.atan2(dy, dx),
      );
    }
  }
  return new planck.EdgeShape(shape.start, shape.end);
}

function bodyDefFor(definition: PhysicsBodyDefinition): planck.BodyDef {
  const result: planck.BodyDef = {};
  if (definition.type !== undefined) result.type = definition.type;
  if (definition.position !== undefined) result.position = definition.position;
  if (definition.angle !== undefined) result.angle = definition.angle;
  if (definition.fixedRotation !== undefined) result.fixedRotation = definition.fixedRotation;
  if (definition.bullet !== undefined) result.bullet = definition.bullet;
  if (definition.allowSleep !== undefined) result.allowSleep = definition.allowSleep;
  if (definition.userData !== undefined) result.userData = definition.userData;
  return result;
}

/** Planck is an engine implementation detail. The rest of the application uses only PhysicsRuntime. */
export class PlanckPhysicsRuntime implements PhysicsRuntime {
  private readonly native: planck.World;
  private readonly bodies = new WeakMap<NativeBody, PlanckBody>();

  constructor(def: PhysicsRuntimeDefinition = {}) {
    if (def.linearSlop !== undefined) planck.Settings.linearSlop = Math.min(planck.Settings.linearSlop, def.linearSlop);
    const worldDef: planck.WorldDef = {};
    if (def.gravity !== undefined) worldDef.gravity = def.gravity;
    if (def.allowSleep !== undefined) worldDef.allowSleep = def.allowSleep;
    if (def.continuousPhysics !== undefined) worldDef.continuousPhysics = def.continuousPhysics;
    this.native = new planck.World(worldDef);
  }

  createBody(definition: PhysicsBodyDefinition = {}) {
    const body = new PlanckBody(this.native.createBody(bodyDefFor(definition)));
    this.bodies.set(body.native, body);
    return body;
  }

  destroyBody(body: PhysicsBody) {
    this.native.destroyBody(this.nativeBody(body));
  }

  step(dt: number, velocityIterations = 10, positionIterations = 10) {
    this.native.step(dt, velocityIterations, positionIterations);
    this.native.clearForces();
  }

  rayCast(start: PhysicsVector, end: PhysicsVector, callback: PhysicsRayCastCallback) {
    this.native.rayCast(start, end, (fixture, point, normal, fraction) => callback(
      this.fixture(fixture), point, normal, fraction,
    ));
  }

  queryCircle(center: PhysicsVector, radius: number, callback: (fixture: PhysicsFixture) => boolean) {
    const shape = new planck.CircleShape(radius);
    const transform = new planck.Transform(center);
    const aabb = new planck.AABB(
      { x: center.x - radius, y: center.y - radius },
      { x: center.x + radius, y: center.y + radius },
    );
    this.native.queryAABB(aabb, fixture => {
      if (!planck.Distance.testOverlap(fixture.getShape(), 0, shape, 0, fixture.getBody().getTransform(), transform)) return true;
      return callback(this.fixture(fixture));
    });
  }

  contacts() {
    const contacts: PhysicsContact[] = [];
    for (let contact = this.native.getContactList(); contact; contact = contact.getNext()) contacts.push(this.contact(contact));
    return contacts;
  }

  onPreSolve(listener: (contact: PhysicsContact) => void) {
    this.native.on('pre-solve', contact => listener(this.contact(contact)));
  }

  onPostSolve(listener: (contact: PhysicsContact) => void) {
    this.native.on('post-solve', contact => listener(this.contact(contact)));
  }

  private nativeBody(body: PhysicsBody) {
    if (!(body instanceof PlanckBody)) throw new Error('Physics body belongs to a different runtime');
    return body.native;
  }

  private fixture(fixture: NativeFixture) {
    return new PlanckFixture(fixture, this.body(fixture.getBody()));
  }

  private body(body: NativeBody) {
    const value = this.bodies.get(body);
    if (!value) throw new Error('Planck fixture references an unknown body');
    return value;
  }

  private contact(contact: planck.Contact) {
    return new PlanckContact(contact, this.bodies);
  }
}

export function createPhysicsRuntime(def: PhysicsRuntimeDefinition = {}): PhysicsRuntime {
  return new PlanckPhysicsRuntime(def);
}
