/**
 * Generic fixed-step clock. It knows nothing about GTA2, networking, or
 * rendering; callers provide the real-time interval between simulation ticks
 * and the work to execute.
 */
export class FixedClock {
  private previous: number | undefined;
  private accumulated = 0;
  private _tickIntervalSeconds: number;

  constructor(
    tickIntervalSeconds: number,
    readonly maxFrameSeconds = 0.25,
  ) {
    this._tickIntervalSeconds = tickIntervalSeconds;
    this.validateInterval(tickIntervalSeconds);
    if (!Number.isFinite(maxFrameSeconds) || maxFrameSeconds <= 0) throw new Error('maxFrameSeconds must be positive');
  }

  get tickIntervalSeconds() { return this._tickIntervalSeconds; }

  setTickIntervalSeconds(tickIntervalSeconds: number) {
    this.validateInterval(tickIntervalSeconds);
    this._tickIntervalSeconds = tickIntervalSeconds;
    this.accumulated = 0;
  }

  private validateInterval(tickIntervalSeconds: number) {
    if (!Number.isFinite(tickIntervalSeconds) || tickIntervalSeconds <= 0) throw new Error('tickIntervalSeconds must be positive');
  }

  advance(nowSeconds: number, step: () => void) {
    if (this.previous === undefined) { this.previous = nowSeconds; return 0; }
    this.accumulated += Math.min(this.maxFrameSeconds, Math.max(0, nowSeconds - this.previous));
    this.previous = nowSeconds;
    while (this.accumulated + 1e-10 >= this.tickIntervalSeconds) {
      step();
      this.accumulated -= this.tickIntervalSeconds;
    }
    return Math.max(0, this.accumulated / this.tickIntervalSeconds);
  }

  reset() { this.previous = undefined; this.accumulated = 0; }
}
