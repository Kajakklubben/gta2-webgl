import { GTA2GroundType, GTA2SlopeType } from '../../shared/domain/world/gta2-enums';
import type { Block, Face } from '../../shared/engine/loader/map-parser';
import type { MapTileSelection } from '../rendering/map-tile-selection';

type FaceKey = 'Left' | 'Right' | 'Top' | 'Bottom' | 'Lid';
const faceEntries: readonly [string, FaceKey][] = [
  ['L', 'Left'], ['R', 'Right'], ['T', 'Top'], ['B', 'Bottom'], ['LID', 'Lid'],
];

function enumName(value: number, values: Record<number, string>, fallback: string) {
  return values[value] ?? fallback;
}

function enumNames(values: Record<string, string | number>) {
  const names: Record<number, string> = {};
  for (const [key, value] of Object.entries(values)) if (Number.isNaN(Number(key)) && typeof value === 'number') names[value] = key;
  return names;
}

const groundNames = enumNames(GTA2GroundType);
const slopeNames = enumNames(GTA2SlopeType);

function isActiveBlock(block: Block | undefined): block is Block {
  if (!block) return false;
  if (block.groundType !== GTA2GroundType.Air) return true;
  return [block.Left, block.Right, block.Top, block.Bottom, block.Lid].some(face => face.tileNumber !== 0);
}

function faceText(label: string, face: Face) {
  return `${label} ${face.tileNumber} [w${face.wall ? 1 : 0} b${face.bulletWall ? 1 : 0} flat${face.flat ? 1 : 0} flip${face.flip ? 1 : 0} r${face.rotation}°]`;
}

export function formatMapTileSelection(selection: MapTileSelection) {
  const lines = [`TILE ${selection.x},${selection.y}`];
  if (selection.hit) lines.push(`hit z${selection.hit.layer}/${selection.hit.face} · RO:${selection.hit.renderOrder} · d:${selection.hit.distance.toFixed(1)}`);
  else lines.push('hit none · ground fallback');
  let hasBlock = false;
  for (const [layer, block] of selection.blocks.entries()) {
    if (!isActiveBlock(block)) continue;
    hasBlock = true;
    lines.push(`z${layer} ${enumName(block.groundType, groundNames, String(block.groundType))}(${block.groundType})/${enumName(block.slopeType, slopeNames, String(block.slopeType))}(${block.slopeType}) · a:0x${block.arrows.toString(16).padStart(4, '0')}`);
    for (const [label, key] of faceEntries) lines.push(`  ${faceText(label, block[key])}`);
  }
  if (!hasBlock) lines.push('empty · no active layers');
  return lines.join('\n');
}

export function updateMapTileDebugOverlay(output: HTMLOutputElement, selections: readonly MapTileSelection[]) {
  output.hidden = selections.length === 0;
  output.replaceChildren();
  for (const selection of selections) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const blockCount = selection.blocks.filter(isActiveBlock).length;
    const hit = selection.hit ? ` · z${selection.hit.layer}/${selection.hit.face} · RO:${selection.hit.renderOrder}` : '';
    summary.textContent = `TILE ${selection.x},${selection.y}${hit} · ${blockCount} active`;
    const body = document.createElement('pre');
    body.textContent = formatMapTileSelection(selection);
    details.append(summary, body);
    output.append(details);
  }
}
