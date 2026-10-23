import { expect, it } from 'vitest';
import * as THREE from 'three';
import { MapRender } from '../../client/rendering/map/map-render';
import { FaceType, GTA2MapFormat, decodeFace } from '../../shared/engine/loader/map-parser';
import { GTA2SlopeType as SlopeType } from '../../shared/domain/world/gta2-enums';
import { faceGeometry } from '../../client/rendering/textures';
import { parseStyle } from '../../shared/engine/loader/style-parser';
import { binary, chunk, styleFixture } from './fixtures';
import { readChunks } from '../../shared/engine/loader/binary';

it('triangulates every supported slope and produces finite buffers and bounds', () => {
  const renderer = new MapRender();
  for (let slope = 0; slope < 64; slope++) {
    const face = renderer.CreateLid(new THREE.Vector2(32, -32), slope), geometry = faceGeometry(face);
    expect(geometry.isBufferGeometry).toBe(true);
    expect([...geometry.getAttribute('position').array].every(Number.isFinite)).toBe(true);
    expect([...geometry.getAttribute('uv').array].every(Number.isFinite)).toBe(true);
    let expectedIndexCount = 6;
    if (slope >= 45 && slope <= 48) expectedIndexCount = 3;
    expect(geometry.index!.count).toBe(expectedIndexCount);
    geometry.dispose();
    for (const side of [FaceType.Left, FaceType.Right, FaceType.Top, FaceType.Bottom]) {
      const edge = faceGeometry(renderer.CreateEdge(new THREE.Vector2(-32, -32), new THREE.Vector2(64, 0), slope, side));
      expect([...edge.getAttribute('position').array].every(Number.isFinite)).toBe(true); edge.dispose();
    }
  }
});
it('keeps partial blocks on the original edge and corner footprints', () => {
  const renderer = new MapRender();
  const expected = new Map([
    [SlopeType.PartialLeftCenter, [-32, -8, -32, 32]],
    [SlopeType.PartialRightCenter, [8, 32, -32, 32]],
    [SlopeType.PartialTopCenter, [-32, 32, 8, 32]],
    [SlopeType.PartialBottomCenter, [-32, 32, -32, -8]],
    [SlopeType.PartialTopLeft, [-32, -8, 8, 32]],
    [SlopeType.PartialTopRight, [8, 32, 8, 32]],
    [SlopeType.PartialBottomRight, [8, 32, -32, -8]],
    [SlopeType.PartialBottomLeft, [-32, -8, -32, -8]],
    [SlopeType.PartialCenter, [-12, 12, -12, 12]],
  ]);

  for (const [slope, values] of expected) {
    const [minX, maxX, minY, maxY] = values as [number, number, number, number];
    const geometry = faceGeometry(renderer.CreateLid(new THREE.Vector2(32, -32), slope));
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.min.x).toBeCloseTo(minX);
    expect(geometry.boundingBox?.max.x).toBeCloseTo(maxX);
    expect(geometry.boundingBox?.min.y).toBeCloseTo(minY);
    expect(geometry.boundingBox?.max.y).toBeCloseTo(maxY);
    geometry.dispose();
  }

  const bounds = (geometry: THREE.BufferGeometry) => {
    geometry.computeBoundingBox();
    return geometry.boundingBox!;
  };
  const normalLeft = bounds(faceGeometry(renderer.CreateEdge(new THREE.Vector2(-32, -32), new THREE.Vector2(0, 64), SlopeType.PartialLeftCenter, FaceType.Left, false)));
  const specialLeft = bounds(faceGeometry(renderer.CreateEdge(new THREE.Vector2(-32, -32), new THREE.Vector2(0, 64), SlopeType.PartialLeftCenter, FaceType.Left, true)));
  expect(normalLeft.min.x).toBeCloseTo(-32);
  expect(specialLeft.min.x).toBeCloseTo(-8);
});
it('preserves face winding and four UV rotations, and mirrors twice to the original', () => {
  const renderer = new MapRender(), face = renderer.CreateLid(new THREE.Vector2(32, -32), 0);
  const before = face.uvs.map(uv => uv.toArray());
  for (let i = 0; i < 4; i++) renderer.RotateUV(face, 90);
  expect(face.uvs.map(uv => uv.toArray())).toEqual(before);
  renderer.MirrorUV(face, 'x'); renderer.MirrorUV(face, 'x');
  expect(face.uvs.map(uv => uv.toArray())).toEqual(before);
  const geometry = faceGeometry(face);
  expect(geometry.getAttribute('normal').getZ(0)).toBe(1);
  expect([geometry.getAttribute('uv').getX(3), geometry.getAttribute('uv').getY(3)]).toEqual([1, 1]);
});
it('creates modern textured meshes without removed Three.js APIs', () => {
  const renderer = new MapRender(); renderer.style = parseStyle(styleFixture(), [1]);
  const face = decodeFace(1), block = { Left: face, Right: face, Top: face, Bottom: face, Lid: face, slopeType: 0, groundType: 0, arrows: 0 };
  const object = renderer.CreatePolygon(0, 0, 0, face, FaceType.Lid, block);
  expect(object.children[0]).toBeInstanceOf(THREE.Mesh);
  expect((object.children[0] as THREE.Mesh).geometry).toBeInstanceOf(THREE.BufferGeometry);
});
it('painter-orders transparent horizontal map lids without depth occlusion', () => {
  const renderer = new MapRender(); renderer.style = parseStyle(styleFixture(), [1]);
  const face = decodeFace(1), block = { Left: face, Right: face, Top: face, Bottom: face, Lid: face, slopeType: 0, groundType: 0, arrows: 0 };
  const object = renderer.CreatePolygon(0, 0, 0, face, FaceType.Lid, block);
  const material = ((object.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial);
  expect(material.side).toBe(THREE.FrontSide);
  expect(material.transparent).toBe(true);
});
it('keeps GMP flat lids source-sided while letting map order handle occlusion', () => {
  const renderer = new MapRender(); renderer.style = parseStyle(styleFixture(), [1]);
  const face = { ...decodeFace(1), flat: true }, block = { Left: face, Right: face, Top: face, Bottom: face, Lid: face, slopeType: 0, groundType: 0, arrows: 0 };
  const object = renderer.CreatePolygon(0, 0, 0, face, FaceType.Lid, block);
  const material = ((object.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial);
  expect(material.side).toBe(THREE.FrontSide);
  expect(material.transparent).toBe(true);
});
it('applies the retail flat-face pairing rule instead of drawing both sides blindly', () => {
  const renderer = new MapRender(); renderer.style = parseStyle(styleFixture(), [1]);
  const solid = decodeFace(1), empty = decodeFace(0), flat = { ...solid, flat: true };
  const block = { Left: solid, Right: flat, Top: empty, Bottom: empty, Lid: empty, slopeType: 0, groundType: 0, arrows: 0 };
  const object = renderer.CreateBlock(0, 0, 0, block);
  expect(object.children).toHaveLength(2);
  expect(((object.children[0] as THREE.Group).children[0] as THREE.Mesh).material).toMatchObject({ transparent: true });

  const bothFlat = renderer.CreateBlock(0, 0, 0, { ...block, Left: flat, Right: flat });
  expect(bothFlat.children).toHaveLength(4);
});
it('anchors supported flat wall art to the structural plane instead of duplicating it into open space', () => {
  const renderer = new MapRender(); renderer.style = parseStyle(styleFixture(), [1]);
  const empty = decodeFace(0), solid = decodeFace(1), flat = { ...solid, flat: true };
  const block = { Left: solid, Right: flat, Top: empty, Bottom: empty, Lid: empty, slopeType: 0, groundType: 0, arrows: 0 };
  const neighbor = { Left: { ...decodeFace(2), wall: true, bulletWall: true }, Right: empty, Top: empty, Bottom: empty, Lid: empty, slopeType: 0, groundType: 0, arrows: 0 };
  renderer.CreateMesh({
    map: [[[block]], [[neighbor]]], objects: [], zones: [], animations: [], lights: [], roads: [],
    traffic: { roadNodes: [], junctions: [], horizontalSegments: [], verticalSegments: [], trafficLightZones: [], arrowBlockerZones: [], busStopZones: [] },
    format: GTA2MapFormat.Compressed,
  }, renderer.style);

  const object = renderer.CreateBlock(0, 0, 0, block);
  expect(object.children).toHaveLength(1);
  const material = ((object.children[0] as THREE.Group).children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
  expect(material.side).toBe(THREE.DoubleSide);
  expect(material.transparent).toBe(true);
  expect((object.children[0] as THREE.Group).position.x).toBe(-0.5);
});
it('does not promote a flat face to double-sided rendering from its own wall flag', () => {
  const renderer = new MapRender(); renderer.style = parseStyle(styleFixture(), [1]);
  const flatWall = { ...decodeFace(1), flat: true, wall: true, bulletWall: true };
  const block = { Left: flatWall, Right: decodeFace(0), Top: decodeFace(0), Bottom: decodeFace(0), Lid: decodeFace(0), slopeType: 0, groundType: 0, arrows: 0 };
  renderer.CreateMesh({
    map: [[[block]]], objects: [], zones: [], animations: [], lights: [], roads: [],
    traffic: { roadNodes: [], junctions: [], horizontalSegments: [], verticalSegments: [], trafficLightZones: [], arrowBlockerZones: [], busStopZones: [] },
    format: GTA2MapFormat.Compressed,
  }, renderer.style);
  const object = renderer.CreateBlock(0, 0, 0, block);
  const material = ((object.children[0] as THREE.Group).children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
  expect(material.side).toBe(THREE.FrontSide);
});
it('uses packed OBJI order for map-object sprite frames rather than model ids', () => {
  const { chunks } = readChunks(styleFixture(), 'GBST');
  const sprx = chunks.get('SPRX')!.slice();
  const sprxView = new DataView(sprx.buffer, sprx.byteOffset, sprx.byteLength);
  sprxView.setUint8(4, 5); sprxView.setUint8(5, 6);
  sprxView.setUint8(12, 7); sprxView.setUint8(13, 7);
  chunks.set('SPRX', sprx);
  chunks.set('OBJI', new Uint8Array([22, 1, 7, 1]));
  chunks.set('SPRB', new Uint8Array([0, 0, 0, 0, 0, 0, 2, 0]));
  const style = parseStyle(binary('GBST', [...chunks].map(([name, bytes]) => chunk(name, bytes))));
  expect(style.sprites.objects[22]?.[0]).toMatchObject({ width: 5, height: 6 });
  expect(style.sprites.objects[7]?.[0]).toMatchObject({ width: 7, height: 7 });
});
