import { FixedClock } from './fixed-clock';

export interface EngineAdvanceResult {
  readonly alpha: number;
  readonly steps: number;
  readonly tick: number;
}

/**
 * Drives any deterministic fixed-step world. The engine owns real-time tick
 * cadence; the game owns state, rules, input interpretation, and side effects.
 */
export class GameEngine<TInput> {
  private readonly clock: FixedClock;
  private _tick = 0;

  constructor(
    private readonly stepWorld: (input: TInput) => void,
    tickIntervalSeconds: number,
    maxFrameSeconds = 0.25,
  ) {
    this.clock = new FixedClock(tickIntervalSeconds, maxFrameSeconds);
  }

  get tick() { return this._tick; }

  setTickIntervalSeconds(tickIntervalSeconds: number) {
    this.clock.setTickIntervalSeconds(tickIntervalSeconds);
  }

  advance(nowSeconds: number, inputForStep: () => TInput): EngineAdvanceResult {
    let steps = 0;
    const alpha = this.clock.advance(nowSeconds, () => {
      this.stepWorld(inputForStep());
      this._tick++;
      steps++;
    });
    return { alpha, steps, tick: this._tick };
  }

  reset() { this.clock.reset(); this._tick = 0; }
}
