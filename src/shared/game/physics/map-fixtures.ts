export type MapWallFixtureData = {
  kind?: 'map-wall' | 'map-object' | string;
  layer?: number;
  movement?: boolean;
  bullet?: boolean;
};

export function mapFixtureMatches(fixture: unknown, layer: number, mode: 'movement' | 'bullet') {
  const candidate = fixture as { getUserData?: () => unknown; getFilterCategoryBits?: () => number } | undefined;
  const data = candidate?.getUserData?.() as MapWallFixtureData | undefined;
  if (data?.kind === 'map-wall' || data?.kind === 'map-object') {
    if (mode === 'movement') return data.layer === layer && data.movement === true;
    return data.layer === layer && data.bullet === true;
  }
  // Fixtures from older snapshots/tests have no per-face metadata. Preserve
  // the old layer-bit behavior for those bodies.
  return Boolean((candidate?.getFilterCategoryBits?.() ?? 0) & (1 << layer));
}
