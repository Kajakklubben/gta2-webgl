import * as planck from 'planck';
import type { Block, GameMap } from '../../loader/map-parser';
import { GTA2SlopeType } from '../../domain/world/gta2-enums';
import { tileToWorld, worldToPhysics } from '../../domain/world/world';
import type { PlanckPhysicsRuntime } from '../../engine/physics-runtime';
import type { StaticMapObject } from '../gameobjects/map-object';

type MapEdge = {
  points: [number, number, number, number];
  layer: number;
  movement: boolean;
  bullet: boolean;
};

type MergeableEdge = MapEdge & {
  orientation: 'horizontal' | 'vertical';
  fixed: number;
  start: number;
  end: number;
};

/** Build the static map faces once. Dynamic entities use the same Planck
 * world, but map faces remain owned by this loader and are never recreated by
 * the world tick. */
export function addMapWallBodies(level: GameMap, physicsRuntime: PlanckPhysicsRuntime, mapObjects: Iterable<StaticMapObject> = []) {
  const mergeable = new Map<string, MergeableEdge[]>();
  const standalone: MapEdge[] = [];
  const objectFixtures: { id: number; model: number; layer: number; x: number; y: number; width: number; height: number; rotation: number }[] = [];
  const addEdge = (x: number, y: number, z: number, points: MapEdge['points'], movement: boolean, bullet: boolean, merge = true) => {
    if (!merge) {
      standalone.push({ points: [worldToPhysics(tileToWorld(x) + points[0]), worldToPhysics(tileToWorld(y) + points[1]), worldToPhysics(tileToWorld(x) + points[2]), worldToPhysics(tileToWorld(y) + points[3])], layer: z, movement, bullet });
      return;
    }
    const x1 = tileToWorld(x) + points[0], y1 = tileToWorld(y) + points[1];
    const x2 = tileToWorld(x) + points[2], y2 = tileToWorld(y) + points[3];
    const orientation = x1 === x2 ? 'vertical' : 'horizontal';
    const fixed = orientation === 'vertical' ? x1 : y1;
    const start = Math.min(orientation === 'vertical' ? y1 : x1, orientation === 'vertical' ? y2 : x2);
    const end = Math.max(orientation === 'vertical' ? y1 : x1, orientation === 'vertical' ? y2 : x2);
    const key = `${orientation}:${fixed}:${z}:${movement ? 1 : 0}:${bullet ? 1 : 0}`;
    const edge = { orientation, fixed, start, end, layer: z, movement, bullet, points: [0, 0, 0, 0] as [number, number, number, number] } satisfies MergeableEdge;
    const group = mergeable.get(key);
    if (group) group.push(edge);
    else mergeable.set(key, [edge]);
  };
  for (let x = 0; x < level.map.length; x++) {
    const mapColumn = level.map[x];
    if (!mapColumn) continue;
    for (let y = 0; y < mapColumn.length; y++) {
      const mapRow = mapColumn[y];
      if (!mapRow) continue;
      for (let z = 0; z < mapRow.length; z++) {
        const block = mapRow[z];
        if (!block) continue;
        const addFace = (points: MapEdge['points'], face: Block['Left']) => {
          if (face.wall || face.bulletWall) addEdge(x, y, z, points, face.wall, face.wall || face.bulletWall);
        };
        addFace([-32, -32, -32, 32], block.Left);
        addFace([32, -32, 32, 32], block.Right);
        addFace([-32, -32, 32, -32], block.Top);
        addFace([-32, 32, 32, 32], block.Bottom);
        if (block.slopeType >= GTA2SlopeType.DiagonalFacingUpLeft && block.slopeType <= GTA2SlopeType.DiagonalFacingDownRight) {
          let points: MapEdge['points'] = [-32, -32, 32, 32];
          if (block.slopeType === GTA2SlopeType.DiagonalFacingUpLeft || block.slopeType === GTA2SlopeType.DiagonalFacingDownRight) points = [-32, 32, 32, -32];
          addEdge(x, y, z, points, true, true, false);
        }
      }
    }
  }

  // Static map objects are game objects, so the raw MOBJ records never enter
  // this adapter directly. Their colliders are copied into the native static
  // map world so player-only prediction and bullet raycasts share one source.
  for (const object of mapObjects) {
    const collider = object.getCollider()[0];
    if (!collider?.solid || !collider.box) continue;
    const placement = object.placement;
    objectFixtures.push({
      id: Number(object.id),
      model: object.state.model,
      layer: placement.layer ?? object.state.collisionLayer,
      x: placement.x,
      y: placement.y,
      width: collider.box.width,
      height: collider.box.height,
      rotation: placement.rotation,
    });
  }

  const edges = [...standalone];
  for (const group of mergeable.values()) {
    group.sort((left, right) => left.start - right.start || left.end - right.end);
    let current = group[0];
    if (!current) continue;
    for (const next of group.slice(1)) {
      if (next.start <= current.end) {
        current.end = Math.max(current.end, next.end);
        continue;
      }
      edges.push(edgeFromMerged(current));
      current = next;
    }
    edges.push(edgeFromMerged(current));
  }

  if (!edges.length && !objectFixtures.length) return;
  // One static body avoids a native broad-phase proxy per authored block. The
  // edge and object fixtures retain their layer/movement/bullet metadata
  // individually.
  const body = physicsRuntime.createBody({ position: { x: 0, y: 0 } });
  for (const edge of edges) {
    const [x1, y1, x2, y2] = edge.points;
    let filterCategoryBits = 1 << (8 + edge.layer);
    let filterMaskBits = 0;
    if (edge.movement) {
      filterCategoryBits = 1 << edge.layer;
      filterMaskBits = 0xffff;
    }
    body.createFixture({
      shape: new planck.EdgeShape({ x: x1, y: y1 }, { x: x2, y: y2 }),
      filterCategoryBits,
      filterMaskBits,
      userData: { kind: 'map-wall', layer: edge.layer, movement: edge.movement, bullet: edge.bullet },
    });
  }
  for (const object of objectFixtures) {
    body.createFixture({
      shape: new planck.BoxShape(
        worldToPhysics(object.width / 2),
        worldToPhysics(object.height / 2),
        { x: worldToPhysics(object.x), y: -worldToPhysics(object.y) },
        -object.rotation,
      ),
      filterCategoryBits: 1 << object.layer,
      filterMaskBits: 0xffff,
      userData: { kind: 'map-object', layer: object.layer, movement: true, bullet: true, objectId: object.id, model: object.model },
    });
  }
}

function edgeFromMerged(edge: MergeableEdge): MapEdge {
  const start = worldToPhysics(edge.start), end = worldToPhysics(edge.end), fixed = worldToPhysics(edge.fixed);
  const points: [number, number, number, number] = edge.orientation === 'vertical'
    ? [fixed, start, fixed, end]
    : [start, fixed, end, fixed];
  return { points, layer: edge.layer, movement: edge.movement, bullet: edge.bullet };
}
