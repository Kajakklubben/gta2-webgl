import { WORLD, physicsToWorld, worldToPhysics } from '../../domain/world/world';
import type { MapContact, PhysicsRuntime } from '../../engine/physics-world';

type VehicleBodyData = { kind?: string; id?: number };

export function installVehicleContactHandling(
  runtime: PhysicsRuntime,
  options: {
    localId: string | undefined;
    incomingVelocities: ReadonlyMap<number, { x: number; y: number }>;
    recordMapContact: (contact: MapContact) => void;
  },
) {
  runtime.onPostSolve(contact => {
    const left = contact.getFixtureA().getBody().getUserData?.() as VehicleBodyData | undefined;
    const right = contact.getFixtureB().getBody().getUserData?.() as VehicleBodyData | undefined;
    let vehicleData: VehicleBodyData | undefined;
    if (left?.kind === 'vehicle') vehicleData = left;
    else if (right?.kind === 'vehicle') vehicleData = right;
    if (!vehicleData) return;

    let body = contact.getFixtureB().getBody();
    if (left?.kind === 'vehicle') body = contact.getFixtureA().getBody();
    let other = contact.getFixtureA().getBody();
    if (body === contact.getFixtureA().getBody()) other = contact.getFixtureB().getBody();

    // Map separation is handled by the generic solver. This adapter only
    // translates the contact into GTA2 vehicle impact consequences.
    if (other.getType() === 'static') {
      const manifold = contact.getWorldManifold();
      const normal = manifold?.normal;
      if (normal) {
        const vehicleIsA = body === contact.getFixtureA().getBody();
        const vehicleId = vehicleData.id;
        if (vehicleId === undefined) return;
        const incoming = options.incomingVelocities.get(vehicleId) ?? {
          x: physicsToWorld(body.getLinearVelocity().x),
          y: -physicsToWorld(body.getLinearVelocity().y),
        };
        let towardOther = { x: normal.x, y: normal.y };
        if (vehicleIsA) towardOther = { x: -normal.x, y: -normal.y };
        if (options.localId) return;
        const incomingPhysics = { x: worldToPhysics(incoming.x), y: -worldToPhysics(incoming.y) };
        const impact = Math.max(0, -(incomingPhysics.x * towardOther.x + incomingPhysics.y * towardOther.y)) * WORLD.physicsUnitsPerWorldUnit;
        if (impact < WORLD.vehicle.source.impactDamageVelocity) return;
        const point = manifold?.points[0];
        options.recordMapContact(point
          ? { bodyId: `vehicle:${vehicleId}`, impact, pointX: physicsToWorld(point.x), pointY: -physicsToWorld(point.y) }
          : { bodyId: `vehicle:${vehicleId}`, impact });
        return;
      }
    }

    if (options.localId) return;
    const velocity = body.getLinearVelocity();
    const impact = Math.hypot(velocity.x, velocity.y) * WORLD.physicsUnitsPerWorldUnit;
    if (impact < WORLD.vehicle.source.impactDamageVelocity || vehicleData.id === undefined) return;
    options.recordMapContact({ bodyId: `vehicle:${vehicleData.id}`, impact });
  });
}
