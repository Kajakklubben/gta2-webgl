import { describe, expect, it } from 'vitest';
import type { Object3D } from 'three';
import { MapRender } from '../../client/rendering/map/map-render.js';
import { GTA2FaceType, GTA2SlopeType } from '../../shared/domain/world/gta2-enums';
import type { Block, Face, GameMap } from '../../shared/loader/map-parser';
import type { Pixels, Style } from '../../shared/loader/models/style';

const pixel: Pixels = { width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) };

function face(tileNumber: number, flat = false): Face {
  return { tileNumber, wall: false, bulletWall: false, flat, flip: false, rotation: 0 };
}

function block(): Block {
  return {
    Left: face(1, true),
    Right: face(0),
    Top: face(0),
    Bottom: face(0),
    Lid: face(1, true),
    arrows: 0,
    slopeType: GTA2SlopeType.Flat,
    groundType: 1,
  };
}

function mapFixture(): GameMap {
  return {
    map: [[[block()]]],
    objects: [],
    zones: [],
    animations: [],
    lights: [],
    roads: [],
    traffic: { roadNodes: [], junctions: [], horizontalSegments: [], verticalSegments: [], trafficLightZones: [], arrowBlockerZones: [], busStopZones: [] },
    format: 'CMAP',
  } as unknown as GameMap;
}

function materialDepthWrite(object: Object3D) {
  const child = object.children[0] as { material?: { depthWrite?: boolean } } | undefined;
  return child?.material?.depthWrite;
}

describe('map depth rendering', () => {
  it('writes depth for flat bridge lids but keeps flat wall art non-occluding', () => {
    const renderer = new MapRender();
    const style = { tiles: [undefined, pixel] } as unknown as Style;
    renderer.CreateMesh(mapFixture(), style);
    const authoredBlock = block();
    const lid = renderer.CreatePolygon(0, 0, 1, authoredBlock.Lid, GTA2FaceType.Lid, authoredBlock);
    const wall = renderer.CreatePolygon(0, 0, 1, authoredBlock.Left, GTA2FaceType.Left, authoredBlock);

    expect(materialDepthWrite(lid)).toBe(true);
    expect(materialDepthWrite(wall)).toBe(false);
  });
});
