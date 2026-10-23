import * as THREE from 'three';
import type { Pixels } from '../../shared/engine/assets/pixels';
import type { PlayerState, PickupState } from '../../shared/protocol/types';
import { WEAPONS } from '../../shared/domain/combat/weapons';
import { WORLD } from '../../shared/domain/world/world';
import { GTA2_MAP_LAYER_COUNT, GTA2_PRESENTATION_PRIORITIES } from '../../shared/domain/world/presentation-order';
import { pixelTexture } from './textures';
import { mapLevelFromGameObjectState, mapLevelFromSupportHeight, presentationSortKey, renderWorldZ as worldEntityZ } from './spatial-depth';
import type { RenderPassMetadata } from './render-passes';

export interface PresentationFrame {
  readonly now: number;
  readonly localId: string;
  readonly players: readonly PlayerState[];
  readonly pickups: readonly PickupState[];
  readonly isMapLevelEnabled?: (mapLevel: number) => boolean;
}

/** Owns transient presentation state that is neither a world object nor map geometry. */
export class PresentationSystem {
  private readonly labels = new Map<string, THREE.Sprite>();
  private readonly pickupLabels = new Map<number, THREE.Sprite>();
  private readonly shots = new THREE.Group();

  constructor(private readonly scene: THREE.Scene, private readonly explosions: readonly Pixels[]) {
    scene.add(this.shots);
  }

  private label(text: string, color: number) {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 32;
    const context = canvas.getContext('2d')!; context.font = 'bold 18px system-ui'; context.textAlign = 'center'; context.fillStyle = '#ffffff'; context.strokeStyle = '#000000'; context.lineWidth = 5;
    context.strokeText(text.slice(0, 24), 128, 22); context.fillText(text.slice(0, 24), 128, 22);
    const material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, color });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = presentationSortKey(GTA2_MAP_LAYER_COUNT - 1, 'overlay', GTA2_PRESENTATION_PRIORITIES.overlay, 0);
    sprite.scale.set(100, 14, 1);
    sprite.userData['gta2RenderPass'] = { mapLevel: GTA2_MAP_LAYER_COUNT - 1, band: 'overlay' } satisfies RenderPassMetadata;
    sprite.userData['gta2BaseVisible'] = sprite.visible;
    return sprite;
  }

  private clearShots() {
    for (const child of [...this.shots.children]) {
      const object = child as THREE.Mesh | THREE.Line; object.geometry.dispose();
      let materials: THREE.Material[];
      if (Array.isArray(object.material)) materials = object.material;
      else materials = [object.material];
      for (const material of materials) {
        (material as THREE.MeshBasicMaterial).map?.dispose(); material.dispose();
      }
      this.shots.remove(object);
    }
  }

  render(frame: PresentationFrame) {
    const isMapLevelEnabled = frame.isMapLevelEnabled ?? (() => true);
    this.clearShots();
    for (const state of frame.players) for (const shot of state.combat.shots) {
      if (!shot.projectile || !shot.impact) continue;
      if (!isMapLevelEnabled(mapLevelFromSupportHeight(shot.z))) continue;
      // Explosive projectiles own an authoritative ExplosionObject. Rendering
      // their compact combat-shot impact here as well produced a second,
      // unsynchronised blast on the local client. Ordinary bullets still use
      // this short impact flash because they do not create a hazard object.
      const weapon = WEAPONS[shot.weapon];
      if (weapon?.kind === 'rocket' || weapon?.kind === 'explosive') continue;
      if (!this.explosions.length) continue;
      const duration = 4;
      const position = Math.max(0, Math.min(this.explosions.length - 1, (duration - shot.life) * this.explosions.length / duration));
      const frameIndex = Math.floor(position);
      const mix = position - frameIndex;
      const explosionFrame = this.explosions[frameIndex];
      if (!explosionFrame) continue;
      const addBurst = (pixels: Pixels, opacity: number) => {
        const burst = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: pixelTexture(pixels), transparent: true, opacity }));
        const mapLevel = mapLevelFromSupportHeight(shot.z);
        burst.renderOrder = presentationSortKey(mapLevel, 'overlay', GTA2_PRESENTATION_PRIORITIES.explosion, worldEntityZ(shot.z) + WORLD.render.projectileZOffset);
        burst.userData['gta2RenderPass'] = { mapLevel, band: 'overlay' } satisfies RenderPassMetadata;
        burst.userData['gta2BaseVisible'] = burst.visible;
        burst.scale.set(pixels.width, pixels.height, 1);
        burst.position.set(shot.endX, shot.endY, worldEntityZ(shot.z) + WORLD.render.projectileZOffset);
        this.shots.add(burst);
      };
      addBurst(explosionFrame, 1 - mix);
      const nextFrame = this.explosions[Math.min(this.explosions.length - 1, frameIndex + 1)];
      if (nextFrame && mix > 0) addBurst(nextFrame, mix);
    }

    const pickupIds = new Set(frame.pickups.filter(pickup => pickup.active && isMapLevelEnabled(mapLevelFromGameObjectState('pickup', pickup.z, pickup.collisionLayer))).map(pickup => pickup.id));
    for (const [id, label] of this.pickupLabels) if (!pickupIds.has(id)) {
      this.scene.remove(label); (label.material as THREE.SpriteMaterial).map?.dispose(); label.material.dispose(); this.pickupLabels.delete(id);
    }
    for (const pickup of frame.pickups) if (pickup.active && isMapLevelEnabled(mapLevelFromGameObjectState('pickup', pickup.z, pickup.collisionLayer))) {
      const color = [0x7dbeff, 0xff884d, 0xffcc55, 0x79e08d][pickup.weapon % 4] ?? 0xffffff;
      let label = this.pickupLabels.get(pickup.id);
      if (!label) { label = this.label(WEAPONS[pickup.weapon]?.name ?? 'Weapon', color); label.scale.set(118, 16, 1); this.scene.add(label); this.pickupLabels.set(pickup.id, label); }
      label.userData['gta2RenderPass'] = { mapLevel: mapLevelFromGameObjectState('pickup', pickup.z, pickup.collisionLayer), band: 'overlay' } satisfies RenderPassMetadata;
      label.userData['gta2BaseVisible'] = label.visible;
      label.position.set(pickup.x, pickup.y + 24, worldEntityZ(pickup.z) + WORLD.render.labelZOffset);
    }

    const playerIds = new Set(frame.players.map(player => player.id));
    for (const [id, label] of this.labels) if (!playerIds.has(id)) {
      this.scene.remove(label); (label.material as THREE.SpriteMaterial).map?.dispose(); label.material.dispose(); this.labels.delete(id);
    }
    for (const state of frame.players) {
      let label = this.labels.get(state.id);
      if (!label) { label = this.label(state.name, state.color); this.scene.add(label); this.labels.set(state.id, label); }
      label.visible = isMapLevelEnabled(mapLevelFromGameObjectState('player', state.z, state.collisionLayer, state.grounded));
      label.userData['gta2RenderPass'] = { mapLevel: mapLevelFromGameObjectState('player', state.z, state.collisionLayer, state.grounded), band: 'overlay' } satisfies RenderPassMetadata;
      label.userData['gta2BaseVisible'] = label.visible;
      label.position.set(state.x, state.y + 28, worldEntityZ(state.z) + WORLD.render.labelZOffset + (state.jump?.height ?? 0));
    }
  }

  dispose() {
    this.clearShots();
    this.scene.remove(this.shots);
    for (const label of [...this.labels.values(), ...this.pickupLabels.values()]) {
      this.scene.remove(label); (label.material as THREE.SpriteMaterial).map?.dispose(); label.material.dispose();
    }
    this.labels.clear(); this.pickupLabels.clear();
  }
}
