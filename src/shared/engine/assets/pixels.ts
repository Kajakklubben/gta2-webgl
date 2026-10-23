/** A decoded RGBA bitmap frame usable by any sprite or texture backend. */
export interface PixelFrame {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** Compatibility name used by the existing decoded asset models. */
export type Pixels = PixelFrame;
