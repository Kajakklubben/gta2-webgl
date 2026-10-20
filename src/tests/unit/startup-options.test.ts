import { describe, expect, it } from 'vitest';
import { parseStartupOptions } from '../../client/app/startup-options';

describe('startup URL options', () => {
  it('defaults to a local single-player launch', () => {
    expect(parseStartupOptions('')).toEqual({ mode: 'singleplayer' });
  });

  it('selects multiplayer and parses authored tile coordinates', () => {
    expect(parseStartupOptions('?mode=multiplayer&view=228,38')).toEqual({
      mode: 'multiplayer',
      view: { x: 228, y: 38 },
    });
  });

  it('accepts the boolean multiplayer alias and legacy split-screen option', () => {
    expect(parseStartupOptions('?multiplayer=true')).toMatchObject({ mode: 'multiplayer' });
    expect(parseStartupOptions('?local=split')).toMatchObject({ mode: 'split-screen' });
  });

  it('ignores malformed view coordinates', () => {
    expect(parseStartupOptions('?view=228')).toEqual({ mode: 'singleplayer' });
    expect(parseStartupOptions('?view=west,38')).toEqual({ mode: 'singleplayer' });
  });

  it('recognizes a clear-session launch', () => {
    expect(parseStartupOptions('?clear-session=1')).toEqual({ mode: 'singleplayer', clearSession: true });
  });
});
