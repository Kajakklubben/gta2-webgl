import { VEHICLE_DOOR_ANIMATION_FRAMES, ensureVehicleOccupancy } from '../../../shared/domain/vehicles/vehicle-occupancy';
import type { EntryLayout } from './vehicle-entry-lab-layout';
import { doorLabel, doorSide } from './vehicle-entry-lab-layout';
import { makePreviewVehicle } from './vehicle-entry-lab-layout';
import type { VehicleEntryScenario, VehicleExitScenario } from './vehicle-entry-scenarios';
import { setTopDownCamera } from '../../rendering/world-projection';
import { VehicleObject } from '../../../shared/game/gameobjects/vehicle';
import type { GameObjectDrawCommand } from '../../../shared/game/gameobjects/gameobject';
import { WORLD } from '../../../shared/domain/world/world';
import { scenarioCameraHeight, scenarioViewScale } from './scenario-view';

function screenPoint(host: any, x: number, y: number, scale: number) {
    const centerX = host.vehicleState?.x ?? host.origin.x, centerY = host.vehicleState?.y ?? host.origin.y;
    return { x: host.overlayCanvas.width / 2 + (x - centerX) * scale, y: host.overlayCanvas.height / 2 - (y - centerY) * scale };
  }

function drawMarker(host: any, x: number, y: number, scale: number, color: string, label: string, filled = true) {
    const point = screenPoint(host, x, y, scale), context = host.overlayContext; context.save(); context.strokeStyle = color;
    if (filled) context.fillStyle = `${color}66`;
    else context.fillStyle = 'transparent';
    context.lineWidth = 2;
    context.beginPath(); context.arc(point.x, point.y, 10, 0, Math.PI * 2);
    if (filled) context.fill();
    else context.stroke();
    context.fillStyle = color; context.font = 'bold 11px system-ui, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(label, point.x, point.y); context.restore();
  }

function drawOverlay(host: any, layout: EntryLayout, scenario: VehicleEntryScenario | VehicleExitScenario, scale: number) {
    const context = host.overlayContext, width = host.overlayCanvas.width, height = host.overlayCanvas.height; context.clearRect(0, 0, width, height); context.strokeStyle = '#1b2a38'; context.lineWidth = 1;
    const car = screenPoint(host, host.vehicleState.x, host.vehicleState.y, scale); context.save(); context.strokeStyle = '#c9d7e4'; context.setLineDash([5, 5]); context.strokeRect(car.x - layout.bounds.width * scale / 2, car.y - layout.bounds.height * scale / 2, layout.bounds.width * scale, layout.bounds.height * scale); context.restore();
    for (const door of layout.doors) {
      const point = layout.points.get(door.index); if (!point) continue;
      const blocked = layout.blockedDoors.has(door.index), occupied = layout.seats.find(seat => seat.door === door.index && layout.occupiedSeats.has(seat.index)), selected = layout.selected?.door === door.index;
      let markerColor = '#72d394';
      if (occupied) markerColor = '#9b9b9b';
      if (blocked) markerColor = '#e56e67';
      if (selected) markerColor = '#f6ca66';
      const outside = screenPoint(host, point.outsideX, point.outsideY, scale); context.save(); context.strokeStyle = markerColor;
      if (selected) context.lineWidth = 3;
      else context.lineWidth = 2;
      if (blocked) context.setLineDash([4, 4]);
      else context.setLineDash([]);
      context.beginPath(); context.moveTo(car.x, car.y); context.lineTo(outside.x, outside.y); context.stroke(); context.restore(); drawMarker(host, point.outsideX, point.outsideY, scale, markerColor, doorLabel(door.index), !blocked && !occupied);
      if (occupied) drawMarker(host, point.seatX, point.seatY, scale, '#b6b6b6', 'P', true);
    }
    const start = screenPoint(host, layout.playerStart.x, layout.playerStart.y, scale); context.save(); context.strokeStyle = '#f6ca66aa'; context.lineWidth = 2; context.setLineDash([6, 5]); if (layout.selected) {
      let target = { x: layout.selected.point.outsideX, y: layout.selected.point.outsideY };
      if (layout.action === 'exit') target = { x: layout.selected.point.exitX, y: layout.selected.point.exitY };
      const outside = screenPoint(host, target.x, target.y, scale); context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(outside.x, outside.y); context.stroke();
    } context.restore(); drawMarker(host, layout.playerStart.x, layout.playerStart.y, scale, '#f6ca66', 'S', false);
    if (host.phase === 'approaching' || host.phase === 'entering' || host.phase === 'exiting') drawMarker(host, host.playerState.x, host.playerState.y, scale, '#f6ca66', 'P', false);
    context.save(); context.fillStyle = '#e8edf2'; context.font = 'bold 14px system-ui, sans-serif'; context.textAlign = 'left'; context.fillText(scenario.title, 14, 22); context.restore();
  }

function rebuildDoorStrip(host: any, selectedDoor: number | undefined, layout: EntryLayout) {
    if (selectedDoor === undefined) { host.stripObjects = []; host.stripModel = host.selectedModel; host.stripDoor = -1; return; }
    if (host.stripModel === host.selectedModel && host.stripDoor === selectedDoor && host.stripObjects.length === VEHICLE_DOOR_ANIMATION_FRAMES + 1) return;
    host.stripModel = host.selectedModel; host.stripDoor = selectedDoor; host.stripObjects = []; const cellWidth = host.doorCanvas.width / (VEHICLE_DOOR_ANIMATION_FRAMES + 1);
    for (let frame = 0; frame <= VEHICLE_DOOR_ANIMATION_FRAMES; frame++) {
      const state = makePreviewVehicle(host.selectedModel, (frame - VEHICLE_DOOR_ANIMATION_FRAMES / 2) * cellWidth, 8, -100 - frame); ensureVehicleOccupancy(state, layout.info, layout.bounds); const door = state.doorStates[selectedDoor];
      if (door && frame > 0) {
        door.frame = frame;
        if (frame === VEHICLE_DOOR_ANIMATION_FRAMES) door.phase = 'open';
        else door.phase = 'opening';
      }
      host.stripObjects.push(new VehicleObject(state, undefined, layout.bounds, host.carPhysics.get(host.selectedModel), layout.info));
    }
  }

function drawDoorOverlay(host: any, selectedFrame: number) {
    const context = host.doorOverlayContext, width = host.doorOverlayCanvas.width, height = host.doorOverlayCanvas.height, cellWidth = width / (VEHICLE_DOOR_ANIMATION_FRAMES + 1); context.clearRect(0, 0, width, height);
    for (let frame = 0; frame <= VEHICLE_DOOR_ANIMATION_FRAMES; frame++) {
      const x = frame * cellWidth;
      if (frame === selectedFrame) context.fillStyle = '#f6ca6624';
      else context.fillStyle = 'transparent';
      context.fillRect(x + 3, 3, cellWidth - 6, height - 6);
      if (frame === selectedFrame) context.strokeStyle = '#f6ca66';
      else context.strokeStyle = '#38526a';
      if (frame === selectedFrame) context.lineWidth = 2;
      else context.lineWidth = 1;
      context.strokeRect(x + 3, 3, cellWidth - 6, height - 6);
      if (frame === selectedFrame) context.fillStyle = '#f6ca66';
      else context.fillStyle = '#c9d7e4';
      let label = `Frame ${frame}`;
      if (frame === 0) label = 'Closed';
      else if (frame === VEHICLE_DOOR_ANIMATION_FRAMES) label = 'Open';
      context.font = '10px system-ui, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'alphabetic'; context.fillText(label, x + cellWidth / 2, height - 6);
    }
  }

export function renderVehicleEntryLab(host: any) {
    const layout = host.layout(), scenario = host.scenario(), scale = scenarioViewScale(host.canvas.width, host.canvas.height), now = performance.now();
    // Each authored layout has its own vehicle placement. Follow that
    // placement so changing a scenario changes the visible map context rather
    // than leaving the car at the shared patch origin.
    const cameraX = host.vehicleState?.x ?? host.origin.x;
    const cameraY = host.vehicleState?.y ?? host.origin.y;
    setTopDownCamera(host.mainCamera, cameraX, cameraY, scenarioCameraHeight(host.canvas.height, scale), host.canvas.width, host.canvas.height);
    const commands: GameObjectDrawCommand[] = [], drawContext = { now, submit: (command: GameObjectDrawCommand) => commands.push(command) }; host.patternMap.render(now); host.game.drawGameObjects(drawContext); host.mainSpriteEngine.render(commands, now); host.mainRenderer.render(host.mainScene, host.mainCamera); drawOverlay(host, layout, scenario, scale);
    const selectedDoor = layout.selected?.door;
    let selectedFrame = 0;
    if (selectedDoor !== undefined) selectedFrame = host.vehicleState.doorStates[selectedDoor]?.frame ?? 0;
    rebuildDoorStrip(host, selectedDoor, layout); const stripCommands: GameObjectDrawCommand[] = [], stripContext = { now, submit: (command: GameObjectDrawCommand) => stripCommands.push(command) }; for (const object of host.stripObjects) object.draw(stripContext); setTopDownCamera(host.doorCamera, 0, 0, WORLD.render.cameraHeight, host.doorCanvas.width, host.doorCanvas.height); host.doorSpriteEngine.render(stripCommands, now); host.doorRenderer.render(host.doorScene, host.doorCamera); drawDoorOverlay(host, selectedFrame);
    const name = host.carNames.get(host.selectedModel) ?? `Model ${host.selectedModel}`;
    let doorFrame = 0;
    if (selectedDoor !== undefined) doorFrame = selectedFrame;
    const physics = host.carPhysics.get(host.selectedModel);
    let outcome = 'active';
    if (host.phase === 'blocked') outcome = 'rejected';
    if (host.phase === 'exited') outcome = 'exited';
    if (host.phase === 'seated' && (layout.action === 'enter' || host.entryInputSent)) outcome = 'seated';
    host.title.textContent = `${name} · ${scenario.title}`;
    const locked = host.selectedAction === 'enter' && (scenario as VehicleEntryScenario).locked;
    let status = 'rejected · no accessible door';
    if (layout.selected) {
      let actionLabel = 'Entry';
      if (layout.action === 'exit') actionLabel = 'Exit';
      status = `${actionLabel} · ${host.phase} · ${layout.selected.role} seat ${layout.selected.seat} · ${doorLabel(layout.selected.door)} ${doorSide(layout.selected.door)}`;
    }
    if (locked) status = 'rejected · locked';
    host.status.textContent = status;
    host.detail.textContent = `${layout.doors.length} doors · ${layout.seats.length} seats · ${layout.blockedDoors.size} blocked · ${layout.occupiedSeats.size} occupied · ${layout.blockades.length} blockers`;
    const flags: string[] = [];
    if (layout.info?.infoFlags.emergencyLights) flags.push('emergency lights');
    if (layout.info?.infoFlags.rearEmergencyLights) flags.push('rear emergency lights');
    if (layout.info?.infoFlags.roofLights) flags.push('roof lights');
    if (layout.info?.infoFlags.forHireLights) flags.push('for-hire lights');
    if (layout.info?.infoFlags.pedJump) flags.push('ped jump');
    if (layout.info?.infoFlags.trailer) flags.push('trailer');
    if (layout.info?.infoFlags2.collideOver) flags.push('collide-over');
    if (layout.info?.infoFlags2.popupHeadlights) flags.push('popup headlights');
    let physicsSummary = '';
    if (physics) physicsSummary = ` · mass ${physics.mass ?? '—'} · max ${physics.maxSpeed ?? '—'} · thrust ${physics.thrust ?? '—'} · turn ${physics.turnRatio ?? '—'}`;
    let flagsSummary = '';
    if (flags.length) flagsSummary = ` · ${flags.join(', ')}`;
    host.propertySummary.textContent = `Decoded CARI/GCI: ${layout.info?.width ?? layout.bounds.width}×${layout.info?.height ?? layout.bounds.height}px · sprite ${layout.info?.sprite ?? '—'}${flagsSummary}${physicsSummary}`;
    for (const button of host.propertyCaseButtons) button.setAttribute('aria-pressed', String(button.dataset['carModel'] === String(host.selectedModel)));
    host.panel.dataset['carModel'] = String(host.selectedModel);
    host.panel.dataset['scenario'] = host.selectedScenario;
    host.panel.dataset['action'] = host.selectedAction;
    host.panel.dataset['approach'] = host.selectedApproach;
    host.panel.dataset['controlMode'] = host.manualControl ? 'manual' : 'scripted';
    host.panel.dataset['simulationSpeed'] = String(host.simulationSpeed);
    host.panel.dataset['phase'] = host.phase;
    host.panel.dataset['outcome'] = outcome;
    host.panel.dataset['progress'] = String(Math.round(host.progress * 100));
    host.panel.dataset['selectedDoor'] = '';
    if (selectedDoor !== undefined) host.panel.dataset['selectedDoor'] = String(selectedDoor);
    host.panel.dataset['doorFrame'] = String(doorFrame);
    host.panel.dataset['entryInputSent'] = String(host.entryInputSent);
    host.panel.dataset['playerX'] = String(layout.playerStart.x);
    host.panel.dataset['playerY'] = String(layout.playerStart.y);
    host.panel.dataset['vehicleX'] = String(host.vehicleState.x);
    host.panel.dataset['vehicleY'] = String(host.vehicleState.y);
    host.panel.dataset['doorCount'] = String(layout.doors.length);
    host.panel.dataset['blockedDoors'] = [...layout.blockedDoors].join(',');
    host.panel.dataset['seatCount'] = String(layout.seats.length);
    host.panel.dataset['straightDoorCount'] = String(layout.doors.filter((door: any) => door.straightEntry).length);
    host.panel.dataset['carWidth'] = String(layout.info?.width ?? layout.bounds.width);
    host.panel.dataset['carHeight'] = String(layout.info?.height ?? layout.bounds.height);
    host.panel.dataset['carSprite'] = String(layout.info?.sprite ?? '');
    host.panel.dataset['carSpriteCount'] = String(layout.info?.spriteCount ?? '');
    host.panel.dataset['carRemapCount'] = String(layout.info?.remaps.length ?? 0);
    host.panel.dataset['carWreck'] = String(layout.info?.wreck ?? '');
    host.panel.dataset['carRating'] = String(layout.info?.rating ?? '');
    host.panel.dataset['carFlags'] = String(layout.info?.flags ?? 0);
    host.panel.dataset['carFlags2'] = String(layout.info?.flags2 ?? 0);
    host.panel.dataset['physicsMass'] = String(physics?.mass ?? '');
    host.panel.dataset['physicsMaxSpeed'] = String(physics?.maxSpeed ?? '');
    host.panel.dataset['physicsThrust'] = String(physics?.thrust ?? '');
    host.panel.dataset['physicsTurnRatio'] = String(physics?.turnRatio ?? '');
    host.progressOutput.value = String(Math.round(host.progress * 100)); host.progressOutput.textContent = `${Math.round(host.progress * 100)}%`;
  }

