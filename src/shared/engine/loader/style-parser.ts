import { BinaryReader, readChunks, requiredChunk } from './binary';
import type { CarInfo, CarInfoFlags, CarInfoFlags2, ObjectInfo, PedSpriteSet, Style } from './models/style';
import type { Pixels } from '../assets/pixels';
import { CIVILIAN_PED_REMAPS, POLICE_PED_REMAP } from '../../domain/pedestrians/pedestrian-appearance';
import { createMapObjectDefinitions } from './map-object-definitions';

export type { CarDoor, CarInfo, CarInfoFlags, CarInfoFlags2, MapObjectDefinition, ObjectInfo, PedSpriteSet, Style } from './models/style';
export type { Pixels } from '../assets/pixels';


export function decodeCarInfoFlags(flags: number): CarInfoFlags {
  return {
    pedJump: !!(flags & 0x01),
    emergencyLights: !!(flags & 0x02),
    roofLights: !!(flags & 0x04),
    cab: !!(flags & 0x08),
    trailer: !!(flags & 0x10),
    forHireLights: !!(flags & 0x20),
    roofDecal: !!(flags & 0x40),
    rearEmergencyLights: !!(flags & 0x80),
  };
}

export function decodeCarInfoFlags2(flags: number): CarInfoFlags2 {
  return { collideOver: !!(flags & 0x01), popupHeadlights: !!(flags & 0x02) };
}

/** RECY stores ascending model ids followed by the 255 sentinel. */
export function parseCarRecycling(bytes?: Uint8Array): number[] {
  if (!bytes) return [];
  const models: number[] = [];
  for (const model of bytes) {
    if (model === 255) break;
    models.push(model);
  }
  return models;
}

/** Decode into RGBA buffers only; texture creation belongs to the client. */
export function parseStyle(bytes: Uint8Array, tileNumbers: number[] = []): Style {
  const { chunks } = readChunks(bytes, 'GBST');
  const tile = requiredChunk(chunks, 'TILE'), ppal = requiredChunk(chunks, 'PPAL');
  const palx = new BinaryReader(requiredChunk(chunks, 'PALX'));
  const palettes = Array.from({ length: palx.length / 2 }, () => palx.u16());
  const palb = new BinaryReader(requiredChunk(chunks, 'PALB'));
  const tilePalette = palb.u16();
  const spriteCount = palb.u16();
  const carCount = palb.u16();
  const pedCount = palb.u16();
  const codeObjectRemapCount = palb.u16();
  // The remaining PALB entries are still consumed as part of the documented
  // eight-field palette_base structure. Map-object sprites use their authored
  // palettes, but their remap area still contributes to later palette bases.
  const mapObjectCount = palb.u16();
  const userCount = palb.u16();
  const fontCount = palb.u16();
  void mapObjectCount; void userCount; void fontCount;
  const spriteBase = tilePalette;
  const carRemap = spriteBase + spriteCount;
  const pedRemap = carRemap + carCount;
  const codeObjectRemapBase = pedRemap + pedCount;
  const sprx = new BinaryReader(requiredChunk(chunks, 'SPRX'));
  const indices: { ptr: number; w: number; h: number }[] = [];
  while (sprx.offset < sprx.length) {
    indices.push({ ptr: sprx.u32(), w: sprx.u8(), h: sprx.u8() }); sprx.u16();
  }
  const graphics = requiredChunk(chunks, 'SPRG');
  const cars: CarInfo[] = [];
  const carBytes = chunks.get('CARI');
  if (carBytes) {
    const carReader = new BinaryReader(carBytes);
    while (carReader.offset < carReader.length) {
      if (carReader.length - carReader.offset < 14) throw new Error('Invalid CARI chunk');
      const model = carReader.u8(), sprite = carReader.u8(), width = carReader.u8(), height = carReader.u8(), remapCount = carReader.u8(), passengers = carReader.u8(), wreck = carReader.u8(), rating = carReader.u8();
      const signed = () => carReader.i8();
      const frontWheelOffset = signed(), rearWheelOffset = signed(), frontWindowOffset = signed(), rearWindowOffset = signed();
      const flags = carReader.u8(), flags2 = carReader.u8();
      const remaps = Array.from({ length: remapCount }, () => carReader.u8());
      const doorCount = carReader.u8();
      const doors = Array.from({ length: doorCount }, () => {
        const rx = carReader.i8(), ry = carReader.i8();
        // CarDoorAlignmentSolver_545AF0 treats the marker as inclusive:
        // values at +/-64 are the straight-entry encoding too.
        const straightEntry = rx >= 64 || rx <= -64;
        // +/-64 is an inclusive marker, not part of the authored coordinate.
        // The executable removes one marker unit in the direction of travel.
        let positionX = rx;
        if (straightEntry) {
          if (rx > 0) positionX = rx - 64;
          else positionX = rx + 64;
        }
        return { rx, ry, positionX, positionY: ry, straightEntry };
      });
      cars.push({ model, spriteCount: sprite, sprite, width, height, remaps, passengers, wreck, rating, frontWheelOffset, rearWheelOffset, frontWindowOffset, rearWindowOffset, flags, flags2, infoFlags: decodeCarInfoFlags(flags), infoFlags2: decodeCarInfoFlags2(flags2), doors });
    }
  }
  const objects: ObjectInfo[] = [];
  const objectBytes = chunks.get('OBJI');
  if (objectBytes) { const objectReader = new BinaryReader(objectBytes); while (objectReader.offset + 2 <= objectReader.length) objects.push({ model: objectReader.u8(), sprites: objectReader.u8() }); }
  const spriteBases = new Uint16Array(Math.floor((chunks.get('SPRB')?.length ?? 0) / 2));
  if (chunks.get('SPRB')) { const bases = new BinaryReader(chunks.get('SPRB')!); let total = 0; for (let i = 0; i < spriteBases.length; i++) { const count = bases.u16(); spriteBases[i] = total; total += count; } }
  const paletteAt = (index: number) => {
    const palette = palettes[index];
    if (palette === undefined) throw new Error(`Invalid style palette ${index}`);
    return palette;
  };
  const colorAt = (palette: number, color: number): [number, number, number, number] => {
    const id = ((Math.floor(palette / 64) * 256 * 64) + palette % 64 + color * 64) * 4;
    if (!Number.isInteger(id) || id < 0 || id + 3 >= ppal.length) throw new Error('Invalid style palette index');
    const b = ppal[id]!, g = ppal[id + 1]!, r = ppal[id + 2]!;
    let alpha = 255;
    if (r + g + b < 13) alpha = 0;
    return [r, g, b, alpha];
  };
  const pixel = (source: Uint8Array, index: number) => {
    if (index < 0 || index >= source.length) throw new Error('Invalid style pixel offset');
    return source[index]!;
  };
  const selected = new Set(tileNumbers);
  if (tile.length % 4096 !== 0) throw new Error('Invalid TILE chunk size');
  const tiles = Array.from({ length: tile.length / 4096 }, (_, id) => {
    if (selected.size && !selected.has(id)) return undefined;
    const data = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const index = (y + Math.floor(id / 4) * 64) * 256 + x + id % 4 * 64;
      data.set(colorAt(paletteAt(id), pixel(tile, index)), (y * 64 + x) * 4);
    }
    return { width: 64, height: 64, data };
  });
  const colorForSprite = (palette: number, color: number, remap?: number): [number, number, number, number] => {
    let rgba = colorAt(paletteAt(palette), color);
    if (remap !== undefined) {
      const mapped = colorAt(paletteAt(remap), color);
      if (mapped[0] + mapped[1] + mapped[2] > 0) rgba = mapped;
    }
    return rgba;
  };
  const sprite = (id: number, remap?: number): Pixels => {
    const entry = indices[id];
    if (!entry || !entry.w || !entry.h) throw new Error(`Missing player sprite ${id}`);
    // SPRX dimensions are the logical dimensions used by the retail renderer.
    // Keep the decoded buffer at that size: adding a safety border here changes
    // the Three.js plane scale because Pixels.width/height are also the world
    // dimensions used by SpriteEngine.  Retail shadows are a separate draw of the
    // same texture, so they must not be baked into the sprite's dimensions.
    const width = entry.w, height = entry.h, data = new Uint8Array(width * height * 4);
    for (let y = 0; y < entry.h; y++) for (let x = 0; x < entry.w; x++) {
      const color = pixel(graphics, entry.ptr + y * 256 + x);
      const rgba = colorForSprite(id + spriteBase, color, remap);
      if (rgba[3]) data.set(rgba, (y * width + x) * 4);
    }
    return { width, height, data };
  };
  const deltaSets = new Map<number, Uint8Array[]>();
  const deltaIndex = chunks.get('DELX');
  const deltaStore = chunks.get('DELS');
  if (deltaIndex && deltaStore) {
    let indexOffset = 0, storeOffset = 0;
    while (indexOffset + 4 <= deltaIndex.length) {
      const whichSprite = deltaIndex[indexOffset]! | (deltaIndex[indexOffset + 1]! << 8);
      const deltaCount = deltaIndex[indexOffset + 2]!;
      indexOffset += 4;
      if (indexOffset + deltaCount * 2 > deltaIndex.length) break;
      const sizes = Array.from({ length: deltaCount }, () => {
        const size = deltaIndex[indexOffset]! | (deltaIndex[indexOffset + 1]! << 8);
        indexOffset += 2;
        return size;
      });
      const deltas: Uint8Array[] = [];
      for (const size of sizes) {
        if (storeOffset + size > deltaStore.length) { storeOffset = deltaStore.length; break; }
        deltas.push(deltaStore.slice(storeOffset, storeOffset + size));
        storeOffset += size;
      }
      if (deltas.length === sizes.length) deltaSets.set(whichSprite, deltas);
    }
  }
  /**
   * Apply one source DELS run list to a decoded sprite.  The right-hand car
   * deltas (logical slots 22..31) are not stored separately in STY: the
   * executable calls Delta_5ABA40, which writes each run backwards from the
   * right edge of the authored sprite row.  Keeping that mirror operation in
   * the decoder is important because simply reusing the left-side bytes makes
   * every opened right door appear on the left side of the rendered car.
   */
  const applyDelta = (base: Pixels, spriteId: number, delta: Uint8Array, remap?: number, mirror = false) => {
    const entry = indices[spriteId];
    if (!entry) return base;
    const output = new Uint8Array(base.data);
    let deltaOffset = 0, cursor = 0;
    while (deltaOffset + 3 <= delta.length) {
      cursor += delta[deltaOffset]! | (delta[deltaOffset + 1]! << 8);
      const length = delta[deltaOffset + 2]!;
      deltaOffset += 3;
      for (let i = 0; i < length && deltaOffset + i < delta.length; i++) {
        const relative = cursor + i;
        const sourceX = relative % 256, y = Math.floor(relative / 256);
        // Delta_5ABA40 receives the CARI sprite width, not the padded canvas
        // width used by this loader.  The visible source row is therefore the
        // first `entry.w` pixels, and the run is mirrored within that range.
        let x = sourceX;
        if (mirror) x = entry.w - 1 - sourceX;
        if (x < 0 || x >= entry.w || y < 0 || y >= entry.h) continue;
        output.set(colorForSprite(spriteId + spriteBase, delta[deltaOffset + i]!, remap), (y * base.width + x) * 4);
      }
      cursor += length;
      deltaOffset += length;
    }
    return { width: base.width, height: base.height, data: output };
  };
  const carSprites: Record<number, Pixels[]> = {};
  const carPaints: Record<number, Pixels[]> = {};
  const carDamage: Record<number, Pixels[]> = {};
  // CARI.sprite is stored as 0/1: 1 allocates the next car graphic and 0
  // shares the preceding graphic. Each car uses one rotatable sprite.
  let totalCarSprite = 0;
  let lastCarSprite = 0;
  const spriteBaseAt = (index: number) => spriteBases[index] ?? 0;
  for (const car of cars) {
    if (car.sprite) {
      totalCarSprite += lastCarSprite;
      lastCarSprite = car.sprite;
    }
    car.sprite = totalCarSprite;
    const base = spriteBaseAt(0) + car.sprite;
    const remaps: (number | undefined)[] = [];
    if (car.remaps.length) remaps.push(...car.remaps.map(value => carRemap + value));
    else remaps.push(undefined);
    try { carPaints[car.model] = remaps.map(remap => sprite(base, remap)); }
    catch { carPaints[car.model] = [sprite(spriteBaseAt(0))]; }
    const paintFrames = carPaints[car.model]!;
    const firstPaint = paintFrames[0];
    if (!firstPaint) continue;
    carSprites[car.model] = [firstPaint];
    const deltasForCar = deltaSets.get(car.sprite);
    if (deltasForCar && carSprites[car.model]?.[0]) {
      const remap = remaps[0];
      carDamage[car.model] = deltasForCar.map(delta => applyDelta(firstPaint, base, delta, remap));
    }
  }
  const carCompositeCache = new Map<string, Pixels>();
  /**
   * DELX stores the mirror-side door groups only once.  Car_Door_10 refers to
   * the mirrored groups as logical bits 24..31, which map back to stored bits
   * 7..14.  Compose the selected paint first, then apply every active source
   * delta in logical order so damage and an animated door can coexist.
   */
  const composeCarSprite = (model: number, paintIndex: number | undefined, logicalDeltas: readonly number[]) => {
    const car = cars.find(candidate => candidate.model === model);
    const paints = carPaints[model];
    const selectedPaint = paints?.[((paintIndex ?? 0) % Math.max(1, paints.length) + Math.max(1, paints.length)) % Math.max(1, paints.length)] ?? carSprites[model]?.[0];
    if (!car || !selectedPaint) return undefined;
    // GameObject state keeps the source's damaged-area mask unchanged. The
    // car plane is rendered with the shared actor 180-degree placement offset,
    // so swap paired left/right door groups at this final texture boundary.
    // This makes an authored CARI door 0 (source "bottom right") open on the
    // visible right side while preserving the source delta mask everywhere
    // else in the world runtime and wire protocol.
    const renderLogicalDoor = (logical: number) => {
      if (logical >= 7 && logical <= 10) return logical + 17;
      if (logical >= 11 && logical <= 14) return logical + 17;
      if (logical >= 24 && logical <= 27) return logical - 17;
      if (logical >= 28 && logical <= 31) return logical - 17;
      return logical;
    };
    const unique = [...new Set(logicalDeltas.filter(Number.isFinite).map(value => renderLogicalDoor(Math.trunc(value))))].sort((a, b) => a - b);
    if (!unique.length) return selectedPaint;
    const cacheKey = `${model}:${paintIndex ?? 0}:${unique.join(',')}`;
    const cached = carCompositeCache.get(cacheKey);
    if (cached) return cached;
    const deltas = deltaSets.get(car.sprite);
    if (!deltas?.length) return selectedPaint;
    const baseSpriteId = spriteBaseAt(0) + car.sprite;
    let remap: number | undefined;
    if (car.remaps.length) {
      const selectedIndex = ((paintIndex ?? 0) % car.remaps.length + car.remaps.length) % car.remaps.length;
      remap = carRemap + car.remaps[selectedIndex]!;
    }
    let composed = selectedPaint;
    for (const logical of unique) {
      // Source DELS omits mirrored door groups; 24..31 mirror 7..14.
      let stored = logical;
      if (logical >= 22 && logical <= 31) stored = logical - 17;
      if (stored < 0 || stored >= deltas.length) continue;
      composed = applyDelta(composed, baseSpriteId, deltas[stored]!, remap, logical >= 22 && logical <= 31);
    }
    carCompositeCache.set(cacheKey, composed);
    return composed;
  };
  const objectSprites: Record<number, Pixels[]> = {};
  let objectSpriteOffset = 0;
  for (const object of objects) {
    // OBJI's sprite records are packed in table order. The model id is a
    // lookup key, not a sprite offset; using it directly shifts every object
    // after the first few entries onto another model's artwork.
    const base = spriteBaseAt(3) + objectSpriteOffset;
    objectSpriteOffset += object.sprites;
    // Map objects carry their own sprite palettes. The map-object remap area
    // is for optional colour remapping and is not the default object artwork.
    objectSprites[object.model] = Array.from({ length: Math.max(1, object.sprites) }, (_, frame) => { try { return sprite(base + frame); } catch { return sprite(base); } });
  }
  const codeObjectSprites: Record<number, Pixels[]> = {};
  const codeObjectCount = spriteBaseAt(3) - spriteBaseAt(2);
  for (let model = 0; model < codeObjectCount; model++) {
    const base = spriteBaseAt(2) + model;
    try { codeObjectSprites[model] = [sprite(base)]; } catch { /* unused code-object slots */ }
  }
  const codeObjectRemaps: Record<number, Record<number, Pixels[]>> = {};
  for (let remap = 0; remap < codeObjectRemapCount; remap++) {
    const remappedSprites: Record<number, Pixels[]> = {};
    const palette = codeObjectRemapBase + remap;
    for (let model = 0; model < codeObjectCount; model++) {
      const base = spriteBaseAt(2) + model;
      try { remappedSprites[model] = [sprite(base, palette)]; } catch { /* unused code-object slots */ }
    }
    codeObjectRemaps[remap] = remappedSprites;
  }
  // Char_B4 selects one of three graphic sets: civilian base+0, the player
  // character base+158, and police base+316. Decode all three from the same
  // source ranges so NPCs use their authored weapon/fall/entry artwork.
  const makePedSet = (characterBase: number, remap = pedRemap + 25): PedSpriteSet => {
    const pedFrames = (offset: number, count: number) => Array.from({ length: count }, (_, i) => {
      try { return sprite(characterBase + offset + i, remap); }
      catch {
        // Keep small synthetic styles usable in tests and editor previews. Real
        // GTA2 styles contain the complete character animation ranges above.
        return sprite(Math.min(243 + i, indices.length - 1), remap);
      }
    });
    const walking = pedFrames(0, 8);
    const running = pedFrames(8, 8);
    const idleFrames = pedFrames(53, 4);
    const idle = idleFrames[0]!;
    const armedWalking = pedFrames(37, 8);
    const armedRunning = pedFrames(45, 8);
    const firing = pedFrames(139, 1);
    const throwing = pedFrames(123, 8);
    const throwingIdle = pedFrames(115, 8);
    const jumping = [...pedFrames(16, 7), pedFrames(23, 1)[0]!];
    // Normal entry skips the four source alignment poses at base+28..31.
    const entering = [...pedFrames(24, 4), ...pedFrames(32, 4)];
    const exiting = [pedFrames(36, 1)[0]!, pedFrames(35, 1)[0]!, pedFrames(34, 1)[0]!, pedFrames(33, 1)[0]!, ...pedFrames(28, 4)];
    const pulledOut = pedFrames(36, 1);
    const falling = pedFrames(81, 17);
    const dead = pedFrames(72, 1);
    const lying = pedFrames(65, 8);
    const lyingReverse = pedFrames(73, 8);
    const electrocuted = pedFrames(151, 5);
    return { walking, running, idle, idleFrames, armedRunning, armedWalking, firing, throwing, throwingIdle, jumping, entering, exiting, pulledOut, falling, dead, lying, lyingReverse, electrocuted };
  };
  const pedBase = spriteBases[1] ?? 77;
  const player = makePedSet(pedBase + 158);
  const civilian = makePedSet(pedBase);
  const civilianRemaps = Object.fromEntries(CIVILIAN_PED_REMAPS.map(remap => [remap, makePedSet(pedBase, pedRemap + remap)]));
  const cop = makePedSet(pedBase + 316, pedRemap + POLICE_PED_REMAP);
  const recycling = chunks.get('RECY');
  const carDeltaSets: Record<number, Uint8Array[]> = {};
  for (const car of cars) {
    const deltas = deltaSets.get(car.sprite);
    if (deltas) carDeltaSets[car.sprite] = deltas;
  }
  return { tiles, spriteBases, deltas: { data: chunks.get('DELS') ?? new Uint8Array(), index: chunks.get('DELX') }, carDeltaSets, carInfo: chunks.get('CARI'), objectInfo: chunks.get('OBJI'), fontInfo: chunks.get('FONB'), recycling, recyclingModels: parseCarRecycling(recycling), psxTiles: chunks.get('PSXT'), cars, objects, mapObjects: createMapObjectDefinitions(objects, objectSprites), composeCarSprite, sprites: { player, civilian, civilianRemaps, cop, cars: carSprites, carPaints, carDamage, codeObjects: codeObjectSprites, codeObjectRemaps, objects: objectSprites } };
}
