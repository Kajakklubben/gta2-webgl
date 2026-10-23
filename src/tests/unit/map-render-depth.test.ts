import { describe, expect, it } from 'vitest';
import type { Object3D } from 'three';
import { MapRender } from '../../client/rendering/map/map-render.js';
import { GTA2FaceType, GTA2SlopeType } from '../../shared/domain/world/gta2-enums';
import type { Block, Face, GameMap } from '../../shared/engine/loader/map-parser';
import type { Pixels, Style } from '../../shared/engine/loader/models/style';

const pixel: Pixels = { width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) };

function face(tileNumber: number, flat = false): Face {
  return { tileNumber, wall: false, bulletWall: false, flat, flip: false, rotation: 0 };
}

function block(slopeType = GTA2SlopeType.Flat): Block {
  return {
    Left: face(1, true),
    Right: face(0),
    Top: face(0),
    Bottom: face(0),
    Lid: face(1, true),
    arrows: 0,
    slopeType,
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

function materialTransparent(object: Object3D) {
  const child = object.children[0] as { material?: { transparent?: boolean } } | undefined;
  return child?.material?.transparent;
}

function materialDepth(object: Object3D) {
  const child = object.children[0] as { material?: { depthTest?: boolean; depthWrite?: boolean } } | undefined;
  return { depthTest: child?.material?.depthTest, depthWrite: child?.material?.depthWrite };
}

describe('map render ordering', () => {
	it('painter-orders walls and lids', () => {
    const renderer = new MapRender();
    const style = { tiles: [undefined, pixel] } as unknown as Style;
    renderer.CreateMesh(mapFixture(), style);
    const authoredBlock = { ...block(), Lid: face(1) };
    const lid = renderer.CreatePolygon(0, 0, 1, authoredBlock.Lid, GTA2FaceType.Lid, authoredBlock);
    const wall = renderer.CreatePolygon(0, 0, 1, authoredBlock.Left, GTA2FaceType.Left, authoredBlock);

    expect(materialTransparent(lid)).toBe(true);
    expect(materialTransparent(wall)).toBe(true);
    expect(materialDepth(lid)).toEqual({ depthTest: true, depthWrite: true });
    expect(materialDepth(wall)).toEqual({ depthTest: true, depthWrite: true });
    expect(wall.renderOrder).toBeLessThan(lid.renderOrder);
  });

  it('keeps slope walls and lids at their authored block levels', () => {
    const renderer = new MapRender();
    const style = { tiles: [undefined, pixel] } as unknown as Style;
    renderer.CreateMesh(mapFixture(), style);
    const lower = renderer.CreatePolygon(0, 0, 2, face(1), GTA2FaceType.Left, block());
    const lowerLid = renderer.CreatePolygon(0, 0, 2, face(1), GTA2FaceType.Lid, block());
    const slopeBlock = block(GTA2SlopeType.UpLow);
    const slopeWall = renderer.CreatePolygon(0, 0, 3, slopeBlock.Left, GTA2FaceType.Left, slopeBlock);
    const slopeLid = renderer.CreatePolygon(0, 0, 3, slopeBlock.Lid, GTA2FaceType.Lid, slopeBlock);
    const upper = renderer.CreatePolygon(0, 0, 3, face(1), GTA2FaceType.Lid, block());
    const z4Wall = renderer.CreatePolygon(0, 0, 4, face(1), GTA2FaceType.Left, block());

    expect(lower.renderOrder).toBeLessThan(slopeWall.renderOrder);
    expect(lowerLid.renderOrder).toBeLessThan(slopeWall.renderOrder);
    expect(slopeWall.renderOrder).toBeLessThan(slopeLid.renderOrder);
    expect(slopeLid.renderOrder).toBe(upper.renderOrder);
    expect(slopeLid.renderOrder).toBeLessThan(z4Wall.renderOrder);
  });
});
