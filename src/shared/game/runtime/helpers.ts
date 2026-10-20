export function segmentPointDistanceSquared(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  pointX: number,
  pointY: number,
) {
  const dx = endX - startX;
  const dy = endY - startY;
  const lengthSquared = dx * dx + dy * dy;
  let t = 0;
  if (lengthSquared > 1e-8) t = Math.max(0, Math.min(1, ((pointX - startX) * dx + (pointY - startY) * dy) / lengthSquared));
  const nearestX = startX + dx * t;
  const nearestY = startY + dy * t;
  return {
    distanceSquared: (pointX - nearestX) ** 2 + (pointY - nearestY) ** 2,
    t,
  };
}
