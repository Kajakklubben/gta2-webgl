import type { TrafficState } from '../../protocol/types';
import type { PhysicsBody, PhysicsRuntime } from '../../engine/physics-world';
import { WORLD, worldToPhysics } from '../../domain/world/world';
import { vehicleMass, vehicleMomentOfInertia } from '../../domain/physics/vehicle-kinematics';
import type { VehicleCatalog } from '../../domain/vehicles/vehicle-catalog';

type BodyLayerState = { z: number; collisionLayer?: number | undefined };

export function setBodyCollisionLayer(body: PhysicsBody | undefined, layer: number) {
  const fixture = body?.getFixtureList();
  if (!fixture) return;
  fixture.setFilterData({
    categoryBits: fixture.getFilterCategoryBits(),
    maskBits: 1 << layer,
    groupIndex: fixture.getFilterGroupIndex(),
  });
}

export function updateVehicleBodyLayer(body: PhysicsBody | undefined, vehicle: BodyLayerState, collisionLayer: (state: BodyLayerState) => number) {
  setBodyCollisionLayer(body, collisionLayer(vehicle));
}

export function createVehicleBody(
  vehicle: TrafficState,
  physicsRuntime: PhysicsRuntime,
  vehicleCatalog: VehicleCatalog,
  collisionLayer: (state: BodyLayerState) => number,
) {
  const body = physicsRuntime.createBody({
    type: 'dynamic',
    position: { x: worldToPhysics(vehicle.x), y: -worldToPhysics(vehicle.y) },
    allowSleep: false,
    fixedRotation: false,
  });
  const { bounds, physics } = vehicleCatalog.get(vehicle.model);
  body.setAngle(-vehicle.rotation);
  const area = Math.max(.01, worldToPhysics(bounds.width) * worldToPhysics(bounds.height));
  body.createFixture({
    shape: { type: 'box', halfWidth: worldToPhysics(bounds.width / 2), halfHeight: worldToPhysics(bounds.height / 2) },
    density: vehicleMass(physics) / area,
    friction: WORLD.vehicle.collisionFriction,
    restitution: WORLD.vehicle.collisionRestitution,
    filterCategoryBits: 1 << 14,
    filterMaskBits: 1 << collisionLayer(vehicle),
  });
  body.setMassData({
    mass: vehicleMass(physics),
    center: { x: 0, y: 0 },
    inertia: vehicleMomentOfInertia(bounds.width, bounds.height, physics) / (WORLD.physicsUnitsPerWorldUnit ** 2),
  });
  body.setBullet(true);
  body.setUserData({ kind: 'vehicle', id: vehicle.id });
  body.setAngularVelocity(-vehicle.angularVelocity);
  return body;
}
