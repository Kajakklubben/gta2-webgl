import type { CarPhysics } from './models/vehicles';

export type { CarPhysics } from './models/vehicles';

/** Parse the vehicle model-name records from a GTA2 .gci data file. */
export function parseCarNames(bytes: Uint8Array): Map<number, string> {
  const text = new TextDecoder('windows-1252').decode(bytes);
  const lines = text.split(/\r?\n/);
  const names = new Map<number, string>();
  for (let index = 0; index < lines.length; index++) {
    const match = /^\s*\{([^*][^}]*)\}\s*$/.exec(lines[index]!);
    if (!match) continue;
    const name = match[1]!.trim();
    for (let lookahead = index + 1; lookahead < Math.min(lines.length, index + 5); lookahead++) {
      const model = /^\s*(\d+)\s+\{model\}\s*$/.exec(lines[lookahead]!);
      if (!model) continue;
      names.set(Number(model[1]!), name);
      break;
    }
  }
  return names;
}

/** Read the authored handling values from the text vehicle catalog. */
export function parseCarPhysics(bytes: Uint8Array): Map<number, CarPhysics> {
  const text = new TextDecoder('windows-1252').decode(bytes);
  const lines = text.split(/\r?\n/);
  const result = new Map<number, CarPhysics>();
  let current: CarPhysics | undefined;
  const save = () => { if (current) result.set(current.model, current); };
  for (const line of lines) {
    const name = /^\s*\{([^*][^}]*)\}\s*$/.exec(line);
    if (name) { save(); current = undefined; continue; }
    const model = /^\s*(\d+)\s+\{model\}\s*$/.exec(line);
    if (model) {
      const modelNumber = Number(model[1]!);
      current = { model: modelNumber, name: '', sourceFields: { model: modelNumber } };
      continue;
    }
    if (!current) continue;
    const value = /^\s*f?(-?\d+(?:\.\d+)?)\s+\{([^}]+)\}\s*$/.exec(line);
    if (!value) continue;
    const number = Number(value[1]!), key = value[2]!.trim();
    current.sourceFields = { ...current.sourceFields, [key]: number };
    if (key === 'turbo') current.turbo = number;
    else if (key === 'value') current.value = number;
    else if (key === 'pad') current.pad = number;
    else if (key === 'mass') current.mass = number;
    else if (key === 'turn in') current.turnIn = number;
    else if (key === 'turn ratio') current.turnRatio = number;
    else if (key === 'thrust') current.thrust = number;
    else if (key === 'max_speed') current.maxSpeed = number;
    else if (key === 'front drive bias') current.frontDriveBias = number;
    else if (key === 'front mass bias') current.frontMassBias = number;
    else if (key === 'brake friction') current.brakeFriction = number;
    else if (key === 'rear end stability') current.rearEndStability = number;
    else if (key === 'handbrake slide value') current.handbrakeSlideValue = number;
    else if (key === 'gear1 multiplier') current.gear1Multiplier = number;
    else if (key === 'gear2 multiplier') current.gear2Multiplier = number;
    else if (key === 'gear3 multiplier') current.gear3Multiplier = number;
    else if (key === 'gear2 speed') current.gear2Speed = number;
    else if (key === 'gear3 speed') current.gear3Speed = number;
    else if (key === 'skid threshhold' || key === 'skid threshold') current.skidThreshold = number;
    else if (key === 'anti strength') current.antiStrength = number;
  }
  save();
  const names = parseCarNames(bytes);
  for (const [model, physics] of result) physics.name = names.get(model) ?? `Model ${model}`;
  return result;
}
