import type { GameplayScenarioDefinition, ScenarioActorDefinition, ScenarioArrange, ScenarioDefinition, ScenarioId, ScenarioPlacement, ScenarioVariantDefinition, VehicleEntryScenarioDefinition, VehicleExitScenarioDefinition } from './scenario-definitions';

const ENTRY_APPROACHES = ['left', 'right', 'front', 'rear'] as const;
const playerPlacements = {
  left: { x: -144, y: 0 },
  right: { x: 144, y: 0 },
  front: { x: 0, y: -144 },
  rear: { x: 0, y: 144 },
} as const;
const centeredVehicle = { x: 0, y: 0, rotation: 0 } as const;
const noBlockades = [] as const;
const leftBlockade = [{ x: -48, y: -6, rotation: 0 }] as const;
const rightBlockade = [{ x: 20, y: -6, rotation: 0 }] as const;
const bothBlockades = [...leftBlockade, ...rightBlockade] as const;
const frontBlockade = [{ x: 0, y: -76, rotation: 0 }] as const;
const rearBlockade = [{ x: 0, y: 76, rotation: 0 }] as const;
const exitFrontBlockade = [{ x: 0, y: -30, rotation: 0 }] as const;
const exitRearBlockade = [{ x: 0, y: 30, rotation: 0 }] as const;
const allExitBlockades = [...leftBlockade, ...rightBlockade, ...exitFrontBlockade, ...exitRearBlockade] as const;
const gameplayForward = Math.PI * 1.5;

function vehicleActor(placement: ScenarioPlacement, id = 'target-vehicle'): ScenarioActorDefinition {
  return { id, kind: 'vehicle', placement, runtimeId: 1, model: 'selected' };
}

function blockadeActors(placements: readonly ScenarioPlacement[]): readonly ScenarioActorDefinition[] {
  return placements.map((placement, index) => ({
    id: `blockade-${index + 1}`,
    kind: 'blockade' as const,
    placement,
    runtimeId: index + 10,
    model: 'selected' as const,
  }));
}

function entryVariants(blockades: readonly ScenarioPlacement[]): readonly ScenarioVariantDefinition[] {
  return ENTRY_APPROACHES.map(approach => ({
    id: approach,
    actors: [
      vehicleActor(centeredVehicle),
      ...blockadeActors(blockades),
      { id: 'entry-scenario-player', kind: 'player' as const, placement: playerPlacements[approach] },
    ],
  }));
}

function exitVariants(blockades: readonly ScenarioPlacement[]): readonly ScenarioVariantDefinition[] {
  return [{ id: 'default', actors: [
    { ...vehicleActor(centeredVehicle), driver: 'entry-scenario-player' },
    ...blockadeActors(blockades),
    { id: 'entry-scenario-player', kind: 'player', vehicleId: 1, placement: centeredVehicle },
  ] }];
}

function arrangeVariants(
  variants: readonly ScenarioVariantDefinition[],
  extras: Omit<ScenarioArrange, 'actors' | 'variants'> = {},
): ScenarioArrange {
  return { actors: variants[0]?.actors ?? [], variants, ...extras };
}

const vehicleEntryDefinitions: readonly VehicleEntryScenarioDefinition[] = [
  {
    id: 'clear', kind: 'vehicle-entry', level: 'entry', title: 'Clear on both sides',
    description: 'The nearest usable door is selected from the authored player and vehicle placements.',
    arrange: arrangeVariants(entryVariants(noBlockades), { occupiedSeats: [] }),
    act: { action: 'enter', maxTicks: 120 },
    assert: { expected: 'player enters the selected seat', completion: 'vehicle-entry-succeeds' },
  },
  {
    id: 'left-blocked', kind: 'vehicle-entry', level: 'entry', title: 'Left side blocked',
    description: 'A locked vehicle blocks the left approach; entry uses the first accessible door on the other side.',
    arrange: arrangeVariants(entryVariants(leftBlockade), { occupiedSeats: [] }),
    act: { action: 'enter', maxTicks: 120 },
    assert: { expected: 'player uses an accessible door', completion: 'vehicle-entry-succeeds' },
  },
  {
    id: 'right-blocked', kind: 'vehicle-entry', level: 'entry', title: 'Right side blocked',
    description: 'A locked vehicle blocks the right approach; entry uses the first accessible door on the other side.',
    arrange: arrangeVariants(entryVariants(rightBlockade), { occupiedSeats: [] }),
    act: { action: 'enter', maxTicks: 120 },
    assert: { expected: 'player uses an accessible door', completion: 'vehicle-entry-succeeds' },
  },
  {
    id: 'both-blocked', kind: 'vehicle-entry', level: 'entry', title: 'Both sides blocked',
    description: 'Locked vehicles block both side approaches while the room walls remain visible.',
    arrange: arrangeVariants(entryVariants(bothBlockades), { occupiedSeats: [] }),
    act: { action: 'enter', maxTicks: 120 },
    assert: { expected: 'player entry is rejected', completion: 'vehicle-entry-rejected' },
  },
  {
    id: 'front-blocked', kind: 'vehicle-entry', level: 'entry', title: 'Front doors blocked',
    description: 'A locked vehicle blocks the front approach; the rear approach remains available.',
    arrange: arrangeVariants(entryVariants(frontBlockade), { occupiedSeats: [] }),
    act: { action: 'enter', maxTicks: 120 },
    assert: { expected: 'player uses the rear route', completion: 'vehicle-entry-succeeds' },
  },
  {
    id: 'rear-blocked', kind: 'vehicle-entry', level: 'entry', title: 'Rear doors blocked',
    description: 'A locked vehicle blocks the rear approach; the front approach remains available.',
    arrange: arrangeVariants(entryVariants(rearBlockade), { occupiedSeats: [] }),
    act: { action: 'enter', maxTicks: 120 },
    assert: { expected: 'player uses the front route', completion: 'vehicle-entry-succeeds' },
  },
  {
    id: 'driver-occupied', kind: 'vehicle-entry', level: 'entry', title: 'Driver already occupied',
    description: 'An NPC driver is ejected and the entering player takes the driver seat.',
    arrange: arrangeVariants(entryVariants(noBlockades), { occupiedSeats: [0] }),
    act: { action: 'enter', maxTicks: 120 },
    assert: { expected: 'player takes the driver seat', completion: 'vehicle-entry-succeeds' },
  },
  {
    id: 'full', kind: 'vehicle-entry', level: 'entry', title: 'All seats occupied',
    description: 'Every authored seat is occupied; the player cannot enter this vehicle.',
    arrange: arrangeVariants(entryVariants(noBlockades), { occupiedSeats: 'all' }),
    act: { action: 'enter', maxTicks: 120 },
    assert: { expected: 'player entry is rejected', completion: 'vehicle-entry-rejected' },
  },
  {
    id: 'locked', kind: 'vehicle-entry', level: 'entry', title: 'Vehicle locked',
    description: 'The authored lock state rejects entry even when a door and route are clear.',
    arrange: arrangeVariants(entryVariants(noBlockades), { occupiedSeats: [], locked: true }),
    act: { action: 'enter', maxTicks: 120 },
    assert: { expected: 'player entry is rejected', completion: 'vehicle-entry-rejected' },
  },
];

const vehicleExitDefinitions: readonly VehicleExitScenarioDefinition[] = [
  {
    id: 'exit-clear', kind: 'vehicle-exit', level: 'entry', title: 'Clear exit',
    description: 'The occupied seat prefers the left-front exit when it is available.',
    arrange: arrangeVariants(exitVariants(noBlockades)),
    act: { action: 'exit', exitSeat: 0, maxTicks: 80 },
    assert: { expected: 'player exits the vehicle', completion: 'vehicle-exit-succeeds' },
  },
  {
    id: 'exit-blocked', kind: 'vehicle-exit', level: 'entry', title: 'One side blocked',
    description: 'A locked car blocks one exit route, so the occupant uses the next usable route.',
    arrange: arrangeVariants(exitVariants(leftBlockade)),
    act: { action: 'exit', exitSeat: 0, maxTicks: 80 },
    assert: { expected: 'player uses the other exit route', completion: 'vehicle-exit-succeeds' },
  },
  {
    id: 'exit-all-blocked', kind: 'vehicle-exit', level: 'entry', title: 'Every exit blocked',
    description: 'Locked cars surround the vehicle, so the occupant remains seated.',
    arrange: arrangeVariants(exitVariants(allExitBlockades)),
    act: { action: 'exit', exitSeat: 0, maxTicks: 80 },
    assert: { expected: 'player remains seated', completion: 'vehicle-exit-rejected' },
  },
];

const gameplayDefinitions: readonly GameplayScenarioDefinition[] = [
  {
    id: 'jump-over-car', kind: 'gameplay', level: 'road', title: 'Player jump over a car',
    description: 'The player jumps across a normal car footprint. Airborne pedestrians ignore ordinary car collision.',
    arrange: { actors: [
      vehicleActor({ x: 0, y: 0, rotation: gameplayForward }),
      { id: 'scenario-player', kind: 'player', placement: { x: -80, y: 0, rotation: gameplayForward } },
    ] },
    act: { input: 'jump-right', inputActor: 'scenario-player', maxTicks: 40 },
    assert: { expected: 'player lands beyond the car alive', completion: 'jump-over-car' },
  },
  {
    id: 'npc-jump-over-car', kind: 'gameplay', level: 'road', title: 'NPC jump over a car',
    description: 'A low-speed car clips an NPC and exercises the source CanJumpOver/DoJump branch.',
    arrange: { actors: [
      { ...vehicleActor({ x: -40, y: 0, rotation: gameplayForward }), velocity: { x: 150, y: 0 } },
      { id: 'scenario-npc', kind: 'npc', runtimeId: 1, placement: { x: 0, y: 0, rotation: gameplayForward } },
    ] },
    act: { input: 'none', maxTicks: 40 },
    assert: { expected: 'NPC jumps and stays alive', completion: 'npc-jump-over-car' },
  },
  {
    id: 'player-car-impact', kind: 'gameplay', level: 'road', title: 'Player killed by car impact',
    description: 'An empty car crosses the player above the unconditional lethal impact threshold.',
    arrange: { actors: [
      { ...vehicleActor({ x: -80, y: 0, rotation: gameplayForward }), velocity: { x: 2_200, y: 0 } },
      { id: 'scenario-player', kind: 'player', placement: { x: 0, y: 0, rotation: gameplayForward } },
    ] },
    act: { input: 'none', maxTicks: 20 },
    assert: { expected: 'player health reaches zero and respawn starts', completion: 'player-car-impact' },
  },
  {
    id: 'npc-car-impact', kind: 'gameplay', level: 'road', title: 'NPC killed by car impact',
    description: 'A fast car crosses an ordinary NPC and records the source run-over cause.',
    arrange: { actors: [
      { ...vehicleActor({ x: -80, y: 0, rotation: gameplayForward }), velocity: { x: 2_200, y: 0 } },
      { id: 'scenario-npc', kind: 'npc', runtimeId: 1, placement: { x: 0, y: 0, rotation: gameplayForward } },
    ] },
    act: { input: 'none', maxTicks: 20 },
    assert: { expected: 'NPC dies with deathCause=run-over', completion: 'npc-car-impact' },
  },
  {
    id: 'player-water', kind: 'gameplay', level: 'water', title: 'Player jumps into water',
    description: 'The player jumps across the dock edge into an AIR/water column and sinks for ten ticks.',
    arrange: { actors: [
      { id: 'scenario-player', kind: 'player', placement: { x: -128, y: 0, rotation: gameplayForward } },
    ] },
    act: { input: 'jump-right', inputActor: 'scenario-player', maxTicks: 80 },
    assert: { expected: 'player drowns after the ten-tick sink', completion: 'player-water' },
  },
  {
    id: 'driver-water', kind: 'gameplay', level: 'water', title: 'Driver enters water',
    description: 'A player drives a car into the dock water; the seated driver uses the same drowning state.',
    arrange: { actors: [
      { id: 'scenario-driver', kind: 'player', vehicleId: 1, placement: { x: -128, y: 0, rotation: gameplayForward } },
      { ...vehicleActor({ x: -128, y: 0, rotation: gameplayForward }), velocity: { x: 180, y: 0 }, driver: 'scenario-driver' },
    ] },
    act: { input: 'drive-right', inputActor: 'scenario-driver', maxTicks: 80 },
    assert: { expected: 'driver drowns and detaches from the car', completion: 'driver-water' },
  },
  {
    id: 'npc-water', kind: 'gameplay', level: 'water', title: 'NPC enters water',
    description: 'An NPC is placed in the dock water to show the Char_B4 sinking_20 path.',
    arrange: { actors: [
      { id: 'scenario-npc', kind: 'npc', runtimeId: 1, placement: { x: 64, y: 0, rotation: gameplayForward } },
    ] },
    act: { input: 'none', maxTicks: 30 },
    assert: { expected: 'NPC dies with deathCause=water', completion: 'npc-water' },
  },
  {
    id: 'tiny-town-rendering', kind: 'gameplay', level: 'tiny-town', title: 'Tiny Town · five drawing positions',
    description: 'Five parked cars share one camera: on the slope, at separate left-side positions below and above the see-through bridge, below the solid structure, and at the additional captured position.',
    arrange: {
      vehicleCatalog: true,
      actors: [
        // These offsets are relative to TINY_TOWN_RENDERING_TILE (78.5, 188.5),
        // whose world origin is (5024, -12064). They are the positions captured
        // from the authored Tiny Town view, rather than synthetic test anchors.
        { id: 'slope-car', kind: 'vehicle', runtimeId: 1, model: 'selected', label: 'Slope', placement: { x: -132.04, y: -62.54, z: 2.47, rotation: gameplayForward } },
        { id: 'bridge-under-car', kind: 'vehicle', runtimeId: 2, model: 'selected', label: 'Under bridge · left', placement: { x: -411.88, y: 5.83, z: 2, rotation: 0 } },
        { id: 'bridge-over-car', kind: 'vehicle', runtimeId: 3, model: 'selected', label: 'Over bridge · left', placement: { x: -240.82, y: 37.05, z: 4, rotation: gameplayForward } },
        { id: 'solid-under-car', kind: 'vehicle', runtimeId: 4, model: 'selected', label: 'Under solid', placement: { x: 362.27, y: 88.54, z: 4, rotation: 0 } },
        { id: 'captured-position-car', kind: 'vehicle', runtimeId: 5, model: 'selected', label: 'Captured position', placement: { x: -65.74, y: -135.39, z: 2.99, rotation: 1.54 } },
      ],
    },
    act: { input: 'none', maxTicks: 1 },
    assert: { expected: 'render order matches z1 lid → Car 2 → z2 lids → z3 lids → Car 1 → Car 5 → Cars 3/4 → z5 lid', completion: 'tiny-town-rendering' },
  },
];

export const VEHICLE_ENTRY_SCENARIO_DEFINITIONS = vehicleEntryDefinitions;
export const VEHICLE_EXIT_SCENARIO_DEFINITIONS = vehicleExitDefinitions;
export const GAMEPLAY_SCENARIO_DEFINITIONS = gameplayDefinitions;
export const SCENARIO_DEFINITIONS: readonly ScenarioDefinition[] = [
  ...vehicleEntryDefinitions,
  ...vehicleExitDefinitions,
  ...gameplayDefinitions,
];

export function scenarioDefinition(id: ScenarioId) {
  return SCENARIO_DEFINITIONS.find(scenario => scenario.id === id) ?? SCENARIO_DEFINITIONS[0]!;
}
