import * as planck from 'planck';

/**
 * Small engine-owned adapter around a native Planck world.
 *
 * The game layer still decides which bodies and fixtures to create, because
 * their shapes and material values come from GTA2 data. The engine owns the
 * lifetime and fixed-step boundary of the native world so game code cannot
 * accidentally step it without clearing forces or bypass the shared map
 * collision backend.
 */
export class PlanckPhysicsRuntime {
  private readonly native: planck.World;

  constructor(def: planck.WorldDef = {}) {
    this.native = new planck.World(def);
  }

  createBody(def?: planck.BodyDef) {
    return this.native.createBody(def);
  }

  destroyBody(body: planck.Body) {
    return this.native.destroyBody(body);
  }

  /** Run one authoritative fixed step and clear accumulated forces. */
  step(dt: number, velocityIterations = 10, positionIterations = 10) {
    this.native.step(dt, velocityIterations, positionIterations);
    this.native.clearForces();
  }

  rayCast(start: planck.Vec2Value, end: planck.Vec2Value, callback: planck.WorldRayCastCallback) {
    return this.native.rayCast(start, end, callback);
  }

  onPostSolve(listener: (contact: planck.Contact, impulse: planck.ContactImpulse) => void) {
    this.native.on('post-solve', listener);
    return this;
  }
}
