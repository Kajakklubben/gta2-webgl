import { describe, expect, test } from 'vitest';
import { scenarioCameraHeight, scenarioViewScale } from '../../client/tools/scenarios/scenario-view';

describe('scenario viewer framing', () => {
  test('keeps the vehicle and gameplay viewports on the same world scale', () => {
    expect(scenarioViewScale(720, 480)).toBeCloseTo(scenarioViewScale(900, 480), 8);
  });

  test('derives a perspective camera height from the shared 2D scale', () => {
    const scale = scenarioViewScale(900, 480);
    const height = scenarioCameraHeight(480, scale);
    const verticalWorldSpan = 2 * height * Math.tan((62 * Math.PI / 180) / 2);
    expect(480 / verticalWorldSpan).toBeCloseTo(scale, 8);
  });
});
