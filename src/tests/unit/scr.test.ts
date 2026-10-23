import { expect, it } from 'vitest';
import { decodeScrPickups } from '../../shared/engine/loader/scr';

function baseWithObject(object: number, x: number, y: number, z: number, type = 47, modelOffset = 24) {
  const bytes = new Uint8Array(82_656);
  const view = new DataView(bytes.buffer);
  view.setUint16(2, 8, true); // pointer 1 -> first command
  const command = 12_000 + 8;
  view.setUint16(command + 2, type, true); // CREATE_OBJ_2D or multiplayer OBJ_DATA
  view.setInt32(command + 12, Math.round(x * 16_384), true);
  view.setInt32(command + 16, Math.round(y * 16_384), true);
  view.setInt32(command + 20, Math.round(z * 16_384), true);
  view.setUint16(command + modelOffset, object, true);
  return bytes;
}

it('decodes authored SCR object pickup coordinates and object IDs', () => {
  const [pickup] = decodeScrPickups(baseWithObject(201, 12.5, 4.25, 2));
  expect(pickup).toEqual({ id: 0, x: 768, y: -240, z: 2, weapon: 1, ammo: 0, active: true });
});

it('ignores non-pickup object models', () => {
  expect(decodeScrPickups(baseWithObject(15, 12, 4, 2))).toEqual([]);
});

it('normalizes multiplayer type-30 object records to the render grid', () => {
  const [pickup] = decodeScrPickups(baseWithObject(208, 59.9, 186.5, 4, 30, 26));
  expect(pickup?.x).toBeCloseTo(59.4 * 64, 2);
  expect(pickup?.y).toBeCloseTo(-186 * 64, 2);
  expect(pickup).toMatchObject({ z: 4, weapon: 2 });
});
