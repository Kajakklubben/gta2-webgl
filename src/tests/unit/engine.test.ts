import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../shared/engine/fixed-clock';
import { GameEngine } from '../../shared/engine/game-engine';

describe('engine runtime', () => {
  it('runs a bounded fixed step without knowing the game domain', () => {
    const clock = new FixedClock(.1, .25), ticks: number[] = [];
    expect(clock.advance(0, () => ticks.push(1))).toBe(0);
    expect(clock.advance(.35, () => ticks.push(1))).toBeCloseTo(.5);
    expect(ticks).toHaveLength(2);
  });

  it('allows debug timing to change the fixed-step duration without carrying old partial time', () => {
    const clock = new FixedClock(.1, 2), ticks: number[] = [];
    clock.advance(0, () => ticks.push(1));
    clock.advance(.05, () => ticks.push(1));
    clock.setTickIntervalSeconds(1);
    expect(clock.tickIntervalSeconds).toBe(1);
    expect(clock.advance(.05, () => ticks.push(1))).toBeCloseTo(0);
    expect(ticks).toHaveLength(0);
    expect(clock.advance(1.05, () => ticks.push(1))).toBeCloseTo(0);
    expect(ticks).toHaveLength(1);
  });

  it('owns the game tick while the game supplies each step input', () => {
    const inputs: string[] = [];
    const engine = new GameEngine<string>(input => inputs.push(input), .1);
    engine.advance(0, () => 'ignored');
    const result = engine.advance(.21, () => `tick-${engine.tick}`);
    expect(result.steps).toBe(2);
    expect(result.tick).toBe(2);
    expect(inputs).toEqual(['tick-0', 'tick-1']);
  });
});
