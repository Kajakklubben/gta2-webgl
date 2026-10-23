import { describe, expect, it } from 'vitest';
import { mapWallSegments, parseMap, decodeFace } from '../../shared/engine/loader/map-parser';
import { decodeCarInfoFlags, parseCarRecycling, parseStyle } from '../../shared/engine/loader/style-parser';
import { parseRoadGraph } from '../../shared/engine/loader/map-parser';
import { parseCarNames, parseCarPhysics } from '../../shared/engine/loader/gci';
import { readChunks } from '../../shared/engine/loader/binary';
import { GameWorld } from '../../shared/game/game-world';
import { FixedClock } from '../../shared/engine/fixed-clock';
import { blockFloor } from '../../shared/domain/physics/map-surface';
import { sourceAngleToRadians } from '../../shared/domain/physics/motion-vector';
import { STEP } from '../../shared/protocol/constants';
import { parseInput } from '../../shared/protocol/validation';
import { WORLD } from '../../shared/domain/world/world';
import { GTA2FaceBits, GTA2MapFormat, GTA2SlopeType } from '../../shared/domain/world/gta2-enums';
import { binary, chunk, mapFixture, styleFixture } from './fixtures';

describe('asset decoding', () => {
  it('reads vehicle names from GCI model records', () => {
    const names = parseCarNames(new TextEncoder().encode('{Romero}\n0 {model}\n\n{Wreck 0}\n72 {model}\n'));
    expect(names.get(0)).toBe('Romero');
    expect(names.get(72)).toBe('Wreck 0');
  });
  it('reads authored vehicle handling values from GCI records', () => {
    const physics = parseCarPhysics(new TextEncoder().encode('{Romero}\n0 {model}\n1 {turbo}\n50 {value}\n7 {pad}\nf0.145 {turn in}\nf0.450 {turn ratio}\nf0.245 {max_speed}\n'));
    expect(physics.get(0)).toMatchObject({ name: 'Romero', turbo: 1, value: 50, pad: 7, turnIn: 0.145, turnRatio: 0.45, maxSpeed: 0.245, sourceFields: { model: 0, turbo: 1, value: 50, pad: 7, 'turn in': 0.145 } });
  });
  it('decodes authored car flags and recycling metadata', () => {
    expect(decodeCarInfoFlags(0xa2)).toMatchObject({ pedJump: false, emergencyLights: true, rearEmergencyLights: true });
    expect(parseCarRecycling(new Uint8Array([1, 7, 72, 255, 99]))).toEqual([1, 7, 72]);
  });
  it('decodes compressed column offsets and skips unknown chunks', () => {
    const level = parseMap(mapFixture());
    expect(level.format).toBe(GTA2MapFormat.WideCompressed);
    expect(level.map[85]![190]![3]?.Lid.tileNumber).toBe(1);
    expect(level.map[0]![0]!).toEqual([]);
    expect(decodeFace(7 | GTA2FaceBits.Wall | GTA2FaceBits.Flip | (3 << GTA2FaceBits.RotationShift))).toMatchObject({ tileNumber: 7, wall: true, flip: true, rotation: 270 });
    expect(GTA2SlopeType.DiagonalFacingUpLeft).toBe(45);
  });
  it('decodes authored RGEN junction and segment metadata', () => {
    const bytes = new Uint8Array(17446), view = new DataView(bytes.buffer);
    bytes.set([1, 2, 3, 4, 5, 6, 7, 8, 9], 0);
    const horizontal = 1024 * 9, vertical = horizontal + 512 * 8, counts = vertical + 512 * 8;
    view.setUint16(horizontal, 11, true); view.setUint16(horizontal + 2, 12, true); bytes.set([13, 14, 15, 16], horizontal + 4);
    view.setUint16(counts, 1, true); view.setUint16(counts + 2, 1, true); view.setUint16(counts + 4, 0, true);
    expect(parseRoadGraph(bytes)).toEqual({
      junctions: [{ index: 0, links: { north: 1, south: 2, east: 3, west: 4 }, searchType: 5, minX: 6, minY: 7, maxX: 8, maxY: 9 }],
      horizontalSegments: [{ junction1: 11, junction2: 12, minX: 13, minY: 14, maxX: 15, maxY: 16 }],
      verticalSegments: [],
    });
  });
  it('rejects truncated chunks, missing chunks, and invalid column offsets', () => {
    expect(() => parseMap(mapFixture().slice(0, -1))).toThrow();
    expect(() => parseMap(binary('GBMP', []))).toThrow('Missing DMAP');
    const invalid = mapFixture(); new DataView(invalid.buffer).setUint32(24, 9999999, true);
    expect(() => parseMap(invalid)).toThrow('column offset');
    expect(() => readChunks(binary('GBMP', [chunk('TEST', new Uint8Array())]).slice(0, -1), 'GBMP')).toThrow();
  });
  it('decodes selected RGBA tiles and sprites without a DOM', () => {
    const style = parseStyle(styleFixture(), [1]);
    expect(style.tiles[0]).toBeUndefined();
    expect([...style.tiles[1]!.data.slice(0, 4)]).toEqual([60, 120, 160, 255]);
    expect(style.sprites.player.running).toHaveLength(8);
    // SPRX dimensions are logical source pixels; they must not include a
    // renderer-side padding border.
    expect(style.sprites.player.idle.width).toBe(8);
    expect(() => parseStyle(styleFixture().slice(0, -8))).toThrow();
  });
  it('decodes representative CARI property classes used by the scenario matrix', () => {
    const cars = new Map(parseStyle(styleFixture()).cars.map(car => [car.model, car] as const));
    expect(cars.get(0)).toMatchObject({ width: 32, height: 64, passengers: 3, doors: { length: 2 } });
    expect(cars.get(4)).toMatchObject({ passengers: 9, doors: { length: 3 } });
    expect(cars.get(4)?.doors.filter(door => door.straightEntry)).toHaveLength(1);
    expect(cars.get(6)).toMatchObject({ passengers: 0, doors: [], flags: 1, infoFlags: { pedJump: true } });
    expect(cars.get(11)).toMatchObject({ passengers: 30, doors: { length: 3 }, flags: 4, infoFlags: { roofLights: true } });
    expect(cars.get(12)).toMatchObject({ doors: { length: 4 }, flags: 2, infoFlags: { emergencyLights: true } });
    expect(cars.get(34)).toMatchObject({ flags: 0x82, infoFlags: { emergencyLights: true, rearEmergencyLights: true } });
    expect(cars.get(46)).toMatchObject({ flags2: 2, infoFlags2: { popupHeadlights: true } });
    expect(cars.get(51)).toMatchObject({ flags: 0x20, infoFlags: { forHireLights: true } });
    expect(cars.get(54)).toMatchObject({ flags: 1, flags2: 1, infoFlags: { pedJump: true }, infoFlags2: { collideOver: true } });
    expect(cars.get(55)).toMatchObject({ doors: [], flags: 0x11, infoFlags: { pedJump: true, trailer: true } });
    expect(cars.get(67)?.sprite).toBe(cars.get(68)?.sprite);
    expect(cars.get(67)?.spriteCount).toBe(1);
    expect(cars.get(68)?.spriteCount).toBe(0);
  });
});

describe('fixed game and authoritative snapshots', () => {
  it('starts with no giant timestep and produces equal ticks at 30 and 144 fps', () => {
    const run = (fps: number) => {
      const clock = new FixedClock(STEP); let ticks = 0;
      for (let frame = 0; frame <= fps * 2; frame++) clock.advance(frame / fps, () => ticks++);
      return ticks;
    };
    expect(run(30)).toBe(60); expect(run(144)).toBe(60);
    const clock = new FixedClock(STEP); let ticks = 0;
    clock.advance(100000, () => ticks++); expect(ticks).toBe(0);
    clock.advance(100010, () => ticks++); expect(ticks).toBeLessThanOrEqual(8);
  });
  it('moves and turns at the intended rates, stays finite outside map bounds', () => {
    const game = new GameWorld(parseMap(mapFixture()));
    const player = game.addPlayer('one'); const start = player.y;
    for (let i = 0; i < 30; i++) game.step(new Map([['one', 1]]));
    expect(player.y - start).toBeCloseTo(WORLD.player.walkSpeed * WORLD.tileSize, 4);
    expect(player.z).toBe(4);
    for (let i = 0; i < 30; i++) game.step(new Map([['one', 4]]));
    // Player.cpp accumulates 20 Ang16 units per tick and clamps at 48. The
    // first two ticks are 20/40, followed by 28 ticks at the 48-unit cap.
    expect(player.rotation).toBeCloseTo(sourceAngleToRadians(20 + 40 + 28 * 48), 4);
    game.restore({ ...player, x: -100000 }); game.step(new Map());
    expect(Number.isFinite(player.z)).toBe(true);
  });
  it('keeps the source turn accumulator and reverse heading semantics', () => {
    const game = new GameWorld(parseMap(mapFixture()));
    const player = game.addPlayer('source-motion');
    game.step(new Map([['source-motion', 4]]));
    expect(player.movement).toMatchObject({ turnSpeed: 20, moveDirection: 0 });
    game.step(new Map([['source-motion', 4]]));
    expect(player.movement?.turnSpeed).toBe(40);
    const facing = player.rotation;
    game.step(new Map([['source-motion', 0]]));
    expect(player.movement?.turnSpeed).toBe(0);
    game.step(new Map([['source-motion', 2]]));
    expect(player.movement).toMatchObject({ moveDirection: -1, speed: WORLD.player.walkSpeed * WORLD.tileSize });
    expect(player.rotation).toBeCloseTo(facing + sourceAngleToRadians(0), 5);
    expect(player.vy).toBeLessThan(0);
  });
  it('moves directly toward a supplied touch direction', () => {
    const game = new GameWorld(parseMap(mapFixture()));
    const player = game.addPlayer('touch');
    const start = { x: player.x, y: player.y };
    game.step(new Map([['touch', { seq: 1, keys: 0, moveX: 1, moveY: 0 }]]));
    expect(player.x).toBeGreaterThan(start.x);
    expect(player.y).toBeCloseTo(start.y, 4);
    expect(player.vx).toBeGreaterThan(0);
    expect(player.rotation).toBeCloseTo(Math.PI * 1.5, 4);
  });
  it('applies authoritative snapshots without local replay', () => {
    const level = parseMap(mapFixture()), server = new GameWorld(level), client = new GameWorld(level, 'one');
    server.addPlayer('one'); client.addPlayer('one');
    for (let i = 0; i < 6; i++) server.step(new Map([['one', 1]]));
    const authoritative = server.snapshot()[0]!;
    client.restore(authoritative);
    expect(client.snapshot()[0]!.y).toBeCloseTo(authoritative.y, 5);
    client.restore({ ...authoritative, y: authoritative.y + 12 });
    expect(client.snapshot()[0]!.y).toBeCloseTo(authoritative.y + 12, 5);
  });
  it('keeps wall collisions in the authoritative game and destroys disconnected bodies', () => {
    const level = parseMap(mapFixture());
    level.map[85]![189]![4] = { ...level.map[85]![190]![3]!, Bottom: { ...decodeFace(1024), wall: true } };
    expect(mapWallSegments(level)).toContainEqual({ x1: 85 * WORLD.tileSize - 32, y1: -(189 * WORLD.tileSize + 32), x2: 85 * WORLD.tileSize + 32, y2: -(189 * WORLD.tileSize + 32), layer: 4, movement: true, bullet: true });
    const game = new GameWorld(level); const player = game.addPlayer('one'); const start = player.y;
    for (let i = 0; i < 60; i++) game.step(new Map([['one', 1]]));
    expect(player.y - start).toBeLessThan(40);
    game.removePlayer('one'); expect(game.snapshot()).toEqual([]);
  });
  it('handles slope heights and rejects malformed inputs', () => {
    const block = parseMap(mapFixture()).map[85]![190]![3]!;
    expect(blockFloor({ ...block, slopeType: 1 }, 3, 0.5, 0.5)).toBe(2.25);
    expect(blockFloor({ ...block, slopeType: 48 }, 3, 0.8, 0.8)).toBe(2);
    for (const value of [null, {}, { type: 'input', input: { seq: 1, keys: 128 } }, { type: 'input', input: { seq: -1, keys: 0 } }]) expect(() => parseInput(value)).toThrow();
    expect(parseInput({ type: 'input', input: { seq: 1, keys: 33 } })).toEqual({ seq: 1, keys: 33 });
    expect(parseInput({ type: 'input', input: { seq: 2, keys: 0, moveX: 0.6, moveY: -0.8 } })).toEqual({ seq: 2, keys: 0, moveX: 0.6, moveY: -0.8 });
    expect(() => parseInput({ type: 'input', input: { seq: 3, keys: 0, moveX: 2, moveY: 0 } })).toThrow();
    expect(STEP).toBe(1 / 30);
  });
});
