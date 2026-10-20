export const SCENARIO_SIMULATION_SPEEDS = [1, 2, 4, 8, 16] as const;
export type ScenarioSimulationSpeed = typeof SCENARIO_SIMULATION_SPEEDS[number];

export function populateScenarioSpeedSelect(
  select: HTMLSelectElement,
  onChange: (speed: ScenarioSimulationSpeed) => void,
) {
  select.replaceChildren(...SCENARIO_SIMULATION_SPEEDS.map(speed => new Option(`${speed}×`, String(speed))));
  select.value = '1';
  select.onchange = () => {
    const speed = Number(select.value);
    if ((SCENARIO_SIMULATION_SPEEDS as readonly number[]).includes(speed)) onChange(speed as ScenarioSimulationSpeed);
  };
}
