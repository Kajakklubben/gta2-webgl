import type { Block, GameMap } from '../../engine/loader/map-parser';
import { GTA2SlopeType } from '../world/gta2-enums';
import { WORLD } from '../world/world';

/**
 * A map block is selected with an integer layer, while its lid can provide a
 * fractional support height inside that block.  `height` uses the same layer
 * units as an actor's `z`: a flat block at map layer 3 supports an actor at
 * height 4.
 */
export interface SurfaceSample {
  readonly grounded: boolean;
  /** Integer map-array layer containing the supporting block. */
  readonly blockLayer: number;
  /** Integer layer used by wall/entity collision filters. */
  readonly collisionLayer: number;
  /** Continuous actor support height in map-layer units. */
  readonly height: number;
  readonly block: Block;
  readonly slopeType: number;
  /** CarPhysics_B0 surface types are 1..4 for cardinal slopes. */
  readonly surfaceType: number;
  readonly slopeLength: number;
  readonly slopeDirection?: { readonly x: number; readonly y: number };
}

/** A query can cover open air or water. An empty collection means no authored
 * support surface was found; a non-empty result contains the best support. */
export type SurfaceResult = SurfaceSample[];

export interface SurfaceQuery {
  readonly x: number;
  readonly y: number;
  /** Current actor height. Used to prefer the nearest reachable support. */
  readonly height?: number;
  /** Preferred map-array layer. Usually collisionLayer - 1. */
  readonly blockLayer?: number;
  /** Permit a support one layer above the current height when entering a ramp. */
  readonly maxClimb?: number;
}

/** Return the authored floor coordinate. Callers select a supporting block
 * before asking for its floor. The retail map uses the block's ground type to
 * decide whether it is non-air; a valid support can therefore have no lid
 * texture (for example, a hidden or script-authored surface). */
export function blockFloor(block: Block, z: number, x: number, y: number): number {
  const fractions = [y, 1 - y, x, 1 - x];
  const slope = block.slopeType;
  if (slope >= GTA2SlopeType.UpLow && slope <= GTA2SlopeType.RightHigh) {
    const direction = Math.floor((slope - GTA2SlopeType.UpLow) / 2), high = slope % 2 === 0;
    const fraction = fractions[direction] ?? 0;
    let highOffset = .5;
    if (high) highOffset = 0;
    return z - fraction * 0.5 - highOffset;
  }
  if (slope >= GTA2SlopeType.Up7Low && slope <= GTA2SlopeType.Right7High) {
    const direction = Math.floor((slope - GTA2SlopeType.Up7Low) / 8), segment = (slope - GTA2SlopeType.Up7Low) % 8;
    return z - 1 + (segment + 1 - (fractions[direction] ?? 0)) / 8;
  }
  if (slope >= GTA2SlopeType.DiagonalFacingDown && slope <= GTA2SlopeType.DiagonalFacingRight) return z - (fractions[slope - GTA2SlopeType.DiagonalFacingDown] ?? 0);
  if (slope === GTA2SlopeType.DiagonalFacingUpLeft) {
    if (x + y >= 1) return z;
    return z - 1;
  }
  if (slope === GTA2SlopeType.DiagonalFacingUpRight) {
    if (1 - x + y >= 1) return z;
    return z - 1;
  }
  if (slope === GTA2SlopeType.DiagonalFacingDownLeft) {
    if (x + 1 - y >= 1) return z;
    return z - 1;
  }
  if (slope === GTA2SlopeType.DiagonalFacingDownRight) {
    if (x + y <= 1) return z;
    return z - 1;
  }
  // Partial and editor-only slope variants are represented as authored
  // surfaces in the renderer but do not expose a complete collision plane in
  // the retail movement code. Keep their solid lid as the safe fallback.
  return z;
}

function localCoordinates(x: number, y: number) {
  const columnX = Math.round(x / WORLD.tileSize);
  const columnY = Math.round(-y / WORLD.tileSize);
  return {
    columnX,
    columnY,
    x: Math.max(0, Math.min(1, (x - columnX * WORLD.tileSize + WORLD.tileSize / 2) / WORLD.tileSize)),
    y: Math.max(0, Math.min(1, (-y - columnY * WORLD.tileSize + WORLD.tileSize / 2) / WORLD.tileSize)),
  };
}

function slopeInfo(block: Block, blockLayer: number, x: number, y: number) {
  const slope = block.slopeType;
  let surfaceType = 0;
  let slopeLength = 0;
  if (slope >= GTA2SlopeType.UpLow && slope <= GTA2SlopeType.RightHigh) { surfaceType = Math.floor((slope - GTA2SlopeType.UpLow) / 2) + 1; slopeLength = 2; }
  else if (slope >= GTA2SlopeType.Up7Low && slope <= GTA2SlopeType.Right7High) { surfaceType = Math.floor((slope - GTA2SlopeType.Up7Low) / 8) + 1; slopeLength = 8; }
  else if (slope >= GTA2SlopeType.DiagonalFacingDown && slope <= GTA2SlopeType.DiagonalFacingRight) { surfaceType = slope - GTA2SlopeType.DiagonalFacingDown + 1; slopeLength = 1; }

  const heightAt = (sampleX: number, sampleY: number) => {
    const floor = blockFloor(block, blockLayer, sampleX, sampleY);
    return floor;
  };
  const hX = heightAt(Math.min(1, x + .25), y) - heightAt(Math.max(0, x - .25), y);
  const hY = heightAt(x, Math.min(1, y + .25)) - heightAt(x, Math.max(0, y - .25));
  let downhill = { x: -hX, y: hY };
  const length = Math.hypot(downhill.x, downhill.y);
  if (length > 1e-6) downhill = { x: downhill.x / length, y: downhill.y / length };
  else if (surfaceType === 1) downhill = { x: 0, y: -1 };
  else if (surfaceType === 2) downhill = { x: 0, y: 1 };
  else if (surfaceType === 3) downhill = { x: -1, y: 0 };
  else downhill = { x: 1, y: 0 };
  const result: { surfaceType: number; slopeLength: number; slopeDirection?: { x: number; y: number } } = { surfaceType, slopeLength };
  if (surfaceType) result.slopeDirection = downhill;
  return result;
}

function collisionLayerFor(height: number) {
  return Math.max(0, Math.min(7, Math.ceil(height)));
}

/**
 * Resolves GTA2 support surfaces without turning them into 3D rigid bodies.
 * Horizontal collision remains an x/y problem; this query supplies the
 * integer layer and fractional height needed by both the physics and renderer.
 */
export class MapSurfaceResolver {
  constructor(readonly level: GameMap) {}

  private sampleBlock(block: Block | undefined, blockLayer: number, x: number, y: number): SurfaceResult {
    // FindHighestBlockForCoord_4E4C30 checks IS_AIR_TYPE(slope_byte), which
    // is the packed GMP ground type, not whether the visual lid has a tile.
    // Keep physics/render placement aligned for authored blocks whose floor
    // is intentionally textureless.
    if (!block || (block.groundType === 0 && !block.Lid.tileNumber)) return [];
    const floor = blockFloor(block, blockLayer, x, y);
    const info = slopeInfo(block, blockLayer, x, y);
    let sample: SurfaceSample = {
      grounded: true,
      blockLayer,
      collisionLayer: collisionLayerFor(floor + 1),
      height: floor + 1,
      block,
      slopeType: block.slopeType,
      surfaceType: info.surfaceType,
      slopeLength: info.slopeLength,
    };
    if (info.slopeDirection) sample = { ...sample, slopeDirection: info.slopeDirection };
    return [sample];
  }

  /** Return the closest authored lid for a world coordinate. */
  resolve(query: SurfaceQuery): SurfaceResult {
    const coordinates = localCoordinates(query.x, query.y);
    const column = this.level.map[coordinates.columnX]?.[coordinates.columnY];
    if (!column) return [];

    let preferred: number | undefined;
    if (query.blockLayer !== undefined) preferred = Math.max(0, Math.min(7, Math.trunc(query.blockLayer)));
    else if (query.height !== undefined) preferred = Math.max(0, Math.min(7, Math.ceil(query.height) - 1));
    const candidates = Array.from({ length: Math.min(8, column.length) }, (_, index) => index)
      .filter(index => column[index] !== undefined)
      .sort((a, b) => {
        if (preferred === undefined) return b - a;
        return Math.abs(a - preferred) - Math.abs(b - preferred) || a - b;
      });
    const currentHeight = query.height;
    const maxClimb = query.maxClimb ?? 1.05;
    let best: { sample: SurfaceSample; score: number } | undefined;
    for (const layer of candidates) {
      const sample = this.sampleBlock(column[layer], layer, coordinates.x, coordinates.y)[0];
      if (!sample) continue;
      // A source actor can descend from a ledge, but cannot teleport onto a
      // full higher block unless the slope/support query places it there.
      if (currentHeight !== undefined && sample.height > currentHeight + maxClimb) continue;
      let difference = 0;
      if (currentHeight !== undefined) difference = Math.abs(sample.height - currentHeight);
      let belowBias = .25;
      if (currentHeight !== undefined && sample.height <= currentHeight + 1e-6) belowBias = 0;
      let preferredBias = 0;
      if (preferred !== undefined) preferredBias = Math.abs(layer - preferred) * .01;
      const score = difference + belowBias + preferredBias;
      if (!best || score < best.score) best = { sample, score };
    }
    if (best) return [best.sample];

    // An actor can be falling above the next support. Return the highest
    // surface below it so the vertical integrator has a landing target.
    if (currentHeight !== undefined) {
      let fallback: SurfaceSample | undefined;
      for (const layer of candidates) {
        const sample = this.sampleBlock(column[layer], layer, coordinates.x, coordinates.y)[0];
        if (sample && sample.height <= currentHeight + 1e-6 && (!fallback || sample.height > fallback.height)) fallback = sample;
      }
      if (fallback) return [fallback];
      return [];
    }
    return [];
  }

  resolveFootprint(points: readonly { x: number; y: number }[], query: Omit<SurfaceQuery, 'x' | 'y'>): SurfaceResult {
    const samples = points.flatMap(point => this.resolve({ ...query, x: point.x, y: point.y }));
    if (!samples.length) return [];
    const height = samples.reduce((total, sample) => total + sample.height, 0) / samples.length;
    const representative = samples.reduce((best, sample) => {
      if (Math.abs(sample.height - height) < Math.abs(best.height - height)) return sample;
      return best;
    }, samples[0]!);
    return [{ ...representative, height, collisionLayer: collisionLayerFor(height) }];
  }

}

export function surfaceHeightToFloor(height: number) { return height - 1; }

