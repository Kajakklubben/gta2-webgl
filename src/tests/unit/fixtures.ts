/** Original synthetic binary fixtures: no proprietary GTA2 data. */
export function chunk(name: string, data: Uint8Array) {
  const bytes = new Uint8Array(data.length + 8), view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode(name)); view.setUint32(4, data.length, true); bytes.set(data, 8); return bytes;
}
export function binary(signature: string, chunks: Uint8Array[]) {
  const bytes = new Uint8Array(6 + chunks.reduce((sum, item) => sum + item.length, 0));
  bytes.set(new TextEncoder().encode(signature)); new DataView(bytes.buffer).setUint16(4, 500, true);
  let offset = 6; for (const item of chunks) { bytes.set(item, offset); offset += item.length; } return bytes;
}

export function npcDefaults() {
  return { shockCounter: 0, electrocuted: false, shots: [], onFire: false, fireTimer: 0 };
}

export function mapFixture() {
  // Keep the fixture's useful cells in the same authored locations as the
  // Tiny Town scenario anchors: a road crossing near (80,178) and a water
  // edge beginning at (22,180). The payload is still a small synthetic GMP,
  // but the scenario code consumes the decoded source map unchanged.
  const data = new Uint8Array(256 * 256 * 4 + 4 + 28 + 4 + 36), view = new DataView(data.buffer);
  for (let y = 180; y < 200; y++) for (let x = 75; x < 95; x++) view.setUint32((y * 256 + x) * 4, 1, true);
  for (let y = 177; y <= 179; y++) for (let x = 53; x <= 94; x++) view.setUint32((y * 256 + x) * 4, 3, true);
  for (let y = 161; y <= 200; y++) for (let x = 22; x <= 27; x++) view.setUint32((y * 256 + x) * 4, 5, true);
  let offset = 256 * 256 * 4;
  view.setUint32(offset, 7, true); offset += 4;
  view.setUint32(offset, 0, true);
  view.setUint32(offset + 4, 4 | (3 << 8), true);
  view.setUint32(offset + 8, 0, true);
  view.setUint32(offset + 12, 2 | (1 << 8), true);
  view.setUint32(offset + 16, 1, true);
  view.setUint32(offset + 20, 1, true);
  view.setUint32(offset + 24, 2, true);
  offset += 28;
  view.setUint32(offset, 3, true); offset += 4;
  view.setUint16(offset + 8, 1, true);
  view.setUint16(offset + 12 + 8, 1, true); view.setUint8(offset + 12 + 11, 1);
  view.setUint16(offset + 24 + 8, 608, true); view.setUint8(offset + 24 + 11, 3);
  return binary('GBMP', [chunk('JUNK', new Uint8Array([1, 2])), chunk('DMAP', data)]);
}
export function styleFixture() {
  const tile = new Uint8Array(16384).fill(1), palettes = new Uint8Array(32768), physical = new Uint8Array(65536);
  physical.set([160, 120, 60, 0], 64 * 4);
  physical.set([174, 224, 235, 0], 128 * 4);
  physical.set([130, 92, 48, 0], 192 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 256; x++) {
    let tileValue = 1;
    if ((Math.floor(x / 16) + Math.floor(y / 16)) % 2) tileValue = 3;
    tile[y * 256 + x] = tileValue;
  }
  const index = new Uint8Array(252 * 8), view = new DataView(index.buffer);
  for (let id = 0; id < 252; id++) { view.setUint8(id * 8 + 4, 8); view.setUint8(id * 8 + 5, 8); }
  // Include representative authored vehicles so browser tests exercise the
  // same scenario panel as the playable client. These records mirror the
  // property classes present in bil.sty: compact/two-door, straight-entry
  // van, zero-door trailer, four-door car, high-capacity bus, tank flags, and
  // a shared-sprite pair. The sprite payload is deliberately synthetic; the
  // CARI metadata and occupancy behavior are the contract under test.
  const carRecord = (model: number, sprite: number, width: number, height: number, passengers: number, flags: number, flags2: number, doors: readonly [number, number][], wreck = 0, rating = 0) => [
    model, sprite, width, height, 0, passengers, wreck, rating, 0, 0, 0, 0, flags, flags2, doors.length,
    ...doors.flatMap(([rx, ry]) => [rx & 0xff, ry & 0xff]),
  ];
  const carInfo = new Uint8Array([
    ...carRecord(0, 1, 32, 64, 3, 0, 0, [[8, 0], [-8, 0]], 2, 1),
    ...carRecord(4, 0, 40, 79, 9, 0, 0, [[8, 0], [-8, 0], [64, 8]], 8, 21),
    ...carRecord(6, 0, 42, 128, 0, 1, 0, [], 0, 99),
    ...carRecord(10, 0, 34, 64, 4, 0, 0, [[8, 0], [-8, 0], [8, 8], [-8, 8]], 3, 1),
    ...carRecord(11, 0, 40, 127, 30, 4, 0, [[64, 0], [-64, 0], [64, 8]], 0, 99),
    ...carRecord(12, 0, 32, 63, 4, 2, 0, [[8, 0], [-8, 0], [8, 8], [-8, 8]], 2, 99),
    ...carRecord(34, 0, 32, 95, 4, 0x82, 0, [[8, 0], [-8, 0], [64, 8]], 4, 99),
    ...carRecord(46, 0, 30, 62, 1, 0, 2, [[8, 0], [-8, 0]], 2, 21),
    ...carRecord(51, 0, 36, 64, 5, 0x20, 0, [[8, 0], [-8, 0], [8, 8], [-8, 8]], 3, 11),
    ...carRecord(54, 0, 46, 81, 3, 1, 1, [[8, 0], [-8, 0]], 9, 99),
    ...carRecord(55, 0, 40, 128, 0, 0x11, 0, [], 0, 99),
    ...carRecord(67, 1, 42, 72, 9, 0x40, 0, [[8, 0], [-8, 0], [8, 8], [-8, 8]], 8, 21),
    ...carRecord(68, 0, 42, 72, 9, 0, 0, [[8, 0], [-8, 0], [8, 8], [-8, 8]], 8, 11),
  ]);
  return binary('GBST', [chunk('TILE', tile), chunk('PALX', palettes), chunk('PPAL', physical),
    chunk('PALB', new Uint8Array(16)), chunk('SPRX', index), chunk('SPRG', new Uint8Array(256 * 8).fill(2)), chunk('CARI', carInfo)]);
}

/** Small text GCI catalog using the retail handling values for test models. */
export function gciFixture() {
  return new TextEncoder().encode([
    '{Romero}', '0 {model}', '16.5 {mass}', '0.245 {max_speed}', '0.152 {thrust}', '0.45 {turn ratio}',
    '{G4 Bank Van}', '4 {model}', '24 {mass}', '0.186 {max_speed}', '0.17 {thrust}', '0.4 {turn ratio}',
    '{Box Car}', '6 {model}', '10 {mass}', '0.95 {max_speed}', '0.143 {thrust}', '0.9 {turn ratio}',
    '{Bulwark}', '10 {model}', '17 {mass}', '0.307 {max_speed}', '0.185 {thrust}', '0.45 {turn ratio}',
    '{Bus}', '11 {model}', '30 {mass}', '0.215 {max_speed}', '0.235 {thrust}', '0.65 {turn ratio}',
    '{Cop Car}', '12 {model}', '14.5 {mass}', '0.415 {max_speed}', '0.15 {thrust}', '0.4 {turn ratio}',
    '{Medicar}', '34 {model}', '20 {mass}', '0.338 {max_speed}', '0.231 {thrust}', '0.5 {turn ratio}',
    '{Stinger}', '46 {model}', '15 {mass}', '0.401 {max_speed}', '0.14 {thrust}', '0.65 {turn ratio}',
    '{Taxi Xpress}', '51 {model}', '15 {mass}', '0.27 {max_speed}', '0.145 {thrust}', '0.4 {turn ratio}',
    '{Tank}', '54 {model}', '45 {mass}', '0.1 {max_speed}', '0.29 {thrust}', '0.75 {turn ratio}',
    '{Tanker}', '55 {model}', '30 {mass}', '0.3 {max_speed}', '0 {thrust}', '0.8 {turn ratio}',
    '{TV Van}', '67 {model}', '19 {mass}', '0.205 {max_speed}', '0.15 {thrust}', '0.8 {turn ratio}',
    '{Van}', '68 {model}', '19 {mass}', '0.205 {max_speed}', '0.15 {thrust}', '0.8 {turn ratio}',
  ].join('\n'));
}
