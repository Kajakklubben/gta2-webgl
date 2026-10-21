export function createGameLoop(options: {
  onFrame(now: number): void;
}) {
  let frame = 0;
  let disposed = false;
  function animate(now: number) {
    if (disposed) return;
    try {
      options.onFrame(now);
    } catch (error) {
      console.error(error);
    }
    frame = requestAnimationFrame(animate);
  }
  return {
    start() { frame = requestAnimationFrame(animate); },
    stop() { disposed = true; cancelAnimationFrame(frame); },
  };
}
