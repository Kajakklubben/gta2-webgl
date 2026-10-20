import { expect, it } from 'vitest';
import { randomPlayerName } from '../../server/player-names';

it('generates dictionary names and avoids names already in the room', () => {
  const first = randomPlayerName();
  const second = randomPlayerName([first]);
  expect(first).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  expect(second).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  expect(second).not.toBe(first);
});
