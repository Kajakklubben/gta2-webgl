import type { PhysicsRuntime } from '../../engine/physics-world';

type DynamicBodyData = { kind?: string; id?: string | number };

/**
 * Records which generic game-object bodies were stopped by static map
 * geometry during the map physics step. Entity blocking uses this to avoid
 * rewinding a solved map pose through a wall on the second collision pass.
 */
export function installMapContactHandling(runtime: PhysicsRuntime, recordMapBlockedBody: (bodyId: string) => void) {
  runtime.onPostSolve(contact => {
    const left = contact.getFixtureA().getBody();
    const right = contact.getFixtureB().getBody();
    const leftDynamic = left.getType() === 'dynamic';
    const rightDynamic = right.getType() === 'dynamic';
    if (leftDynamic === rightDynamic) return;
    const dynamic = leftDynamic ? left : right;
    const manifold = contact.getWorldManifold();
    const normal = manifold?.normal;
    if (normal) {
      // The native solver owns static separation for every game object. Remove
      // only residual velocity away from the face so a zero-restitution wall
      // cannot turn a contact correction into a rebound; tangent motion stays
      // intact for sliding.
      const outward = leftDynamic ? { x: -normal.x, y: -normal.y } : normal;
      const velocity = dynamic.getLinearVelocity();
      const normalVelocity = velocity.x * outward.x + velocity.y * outward.y;
      if (normalVelocity > 0) dynamic.setLinearVelocity({
        x: velocity.x - normalVelocity * outward.x,
        y: velocity.y - normalVelocity * outward.y,
      });
    }
    const data = dynamic.getUserData() as DynamicBodyData | undefined;
    if (data?.kind === undefined || data.id === undefined) return;
    recordMapBlockedBody(`${data.kind}:${data.id}`);
  });
}
