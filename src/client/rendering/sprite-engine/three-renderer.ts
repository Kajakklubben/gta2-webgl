import * as THREE from 'three';
import type { GameObjectDrawCommand, GameObjectSprite, GameObjectSpriteLayer } from '../../../shared/game/gameobjects/gameobject';
import type { Pixels } from '../../../shared/engine/assets/pixels';
import type { SpriteAssetResolver } from '../../../shared/engine/assets/sprites';
import { pixelTexture } from '../textures';
import { AnimationPlayer } from './animation-player';
import { fallbackColor, fallbackSize, renderPolicy } from './render-policy';
import { buildRenderQueue, spriteRenderOrder } from './render-queue';
import { resolveRenderDepth } from '../spatial-depth';
import { spriteRenderPassBand } from '../render-passes';

type SpriteMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

/** Three.js backend for resolved sprite plans. No source-bank mapping lives here. */
export class ThreeSpriteRenderer {
  private readonly meshes = new Map<string, SpriteMesh>();
  private readonly interpolationMeshes = new Map<string, SpriteMesh>();
  private readonly shadowMeshes = new Map<string, SpriteMesh>();
  private readonly shadowInterpolationMeshes = new Map<string, SpriteMesh>();
  private readonly renderOrders = new Map<string, number>();
  private readonly beamMeshes = new Map<string, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[]>();
  private readonly textures = new Map<Pixels, THREE.DataTexture>();
  private readonly animations = new AnimationPlayer();
  private frameInterpolation = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly registry: SpriteAssetResolver<GameObjectSpriteLayer, GameObjectDrawCommand>,
  ) {}

  setFrameInterpolation(enabled: boolean) {
    this.frameInterpolation = enabled;
  }

  getRenderOrder(commandKey: string) {
    return this.renderOrders.get(commandKey);
  }

  private texture(frame: Pixels) {
    let texture = this.textures.get(frame);
    if (!texture) {
      texture = pixelTexture(frame);
      this.textures.set(frame, texture);
    }
    return texture;
  }

  private createMesh(command: GameObjectDrawCommand, sprite: GameObjectSpriteLayer) {
    const policy = renderPolicy(sprite, command);
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      alphaTest: policy.alphaTest,
      blending: sprite.blending === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
      color: fallbackColor(command, sprite),
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.scene.add(mesh);
    return mesh;
  }

  private renderBeam(command: GameObjectDrawCommand, sprite: GameObjectSprite) {
    const beam = sprite.beam;
    if (!beam || beam.points.length < 2) return;
    let meshes = this.beamMeshes.get(command.key);
    if (!meshes) {
      meshes = [];
      this.beamMeshes.set(command.key, meshes);
    }
    const policy = renderPolicy(sprite, command);
    const renderPass = { mapLevel: policy.presentation.mapLevel, band: spriteRenderPassBand(command.kind, policy.presentation.band) };
    const materialFor = () => new THREE.MeshBasicMaterial({
      color: beam.color,
      transparent: true,
      side: THREE.DoubleSide,
    });
    while (meshes.length < beam.points.length - 1) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), materialFor());
      this.scene.add(mesh);
      meshes.push(mesh);
    }
    const active = meshes.slice(0, beam.points.length - 1);
    for (let index = 0; index < active.length; index++) {
      const from = beam.points[index]!, to = beam.points[index + 1]!;
      const dx = to.x - from.x, dy = to.y - from.y;
      const mesh = active[index]!, material = mesh.material, length = Math.hypot(dx, dy);
      material.color.set(beam.color);
      material.opacity = beam.opacity ?? sprite.opacity ?? 1;
      mesh.visible = length > 1e-6 && material.opacity > .001;
      const beamDepth = resolveRenderDepth(command, {
        ...sprite,
        placement: { ...sprite.placement, z: (from.z + to.z) * .5 },
      }, index);
      mesh.position.set((from.x + to.x) * .5, (from.y + to.y) * .5, beamDepth.worldZ);
      mesh.scale.set(length, beam.width, 1);
      mesh.rotation.z = Math.atan2(dy, dx);
      mesh.renderOrder = spriteRenderOrder(command, sprite);
      mesh.userData['gta2RenderPass'] = renderPass;
      mesh.userData['gta2BaseVisible'] = mesh.visible;
    }
    for (const mesh of meshes.slice(active.length)) {
      mesh.visible = false;
      mesh.userData['gta2BaseVisible'] = false;
    }
  }

  private renderSpriteLayer(command: GameObjectDrawCommand, sprite: GameObjectSpriteLayer, now: number, key: string, forcedRenderOrder: number) {
    const resolved = this.registry.resolve(sprite, command);
    const frames = resolved.frames;
    const animation = this.animations.resolve(sprite, frames, now, key);
    const currentFrames = animation.current;
    const nextFrames = animation.next;
    const hasFrame = currentFrames.length > 0;
    const hasNextFrame = nextFrames.length > 0;
    const hasFallback = sprite.fallbackColor !== undefined;
    const rotatingAnimation = sprite.animation === 'rotate';
    const canInterpolate = this.frameInterpolation && hasFrame && hasNextFrame && currentFrames[0] !== nextFrames[0];
    const blend = canInterpolate && !rotatingAnimation ? animation.mix : 0;
    const rotationBlend = canInterpolate && rotatingAnimation ? animation.mix : 0;
    let mesh = this.meshes.get(key);
    if (!mesh) {
      mesh = this.createMesh(command, sprite);
      this.meshes.set(key, mesh);
    }
    let interpolationMesh = this.interpolationMeshes.get(key);
    if (!interpolationMesh) {
      interpolationMesh = this.createMesh(command, sprite);
      this.interpolationMeshes.set(key, interpolationMesh);
    }

    const placement = sprite.placement;
    const mapObjectState = command.kind === 'map-object' && key === command.key
      ? command.state as { model?: number; x?: number; y?: number; z?: number; collisionLayer?: number }
      : undefined;
    const mapObjectPick = mapObjectState && Number.isFinite(mapObjectState.x) && Number.isFinite(mapObjectState.y) && Number.isFinite(mapObjectState.z)
      ? { id: command.id, model: mapObjectState.model, x: mapObjectState.x, y: mapObjectState.y, z: mapObjectState.z, collisionLayer: mapObjectState.collisionLayer }
      : undefined;
    if (mapObjectPick) mesh.userData['gta2MapObject'] = mapObjectPick;
    else delete mesh.userData['gta2MapObject'];
    const policy = renderPolicy(sprite, command);
    const spatialDepth = resolveRenderDepth(command, sprite);
    const renderPass = { mapLevel: policy.presentation.mapLevel, band: spriteRenderPassBand(command.kind, policy.presentation.band) };
    const material = mesh.material;
    material.opacity = (sprite.opacity ?? 1) * (1 - blend);
    material.alphaTest = policy.alphaTest;
    const blending = sprite.blending === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending;
    if (material.blending !== blending) {
      material.blending = blending;
      material.needsUpdate = true;
    }
    material.side = sprite.mirrorY ? THREE.DoubleSide : THREE.FrontSide;
    mesh.renderOrder = forcedRenderOrder;
    mesh.visible = material.opacity > 0.001 && (hasFrame || hasFallback);
    mesh.userData['gta2RenderPass'] = renderPass;
    mesh.userData['gta2BaseVisible'] = mesh.visible;
    const scale = sprite.scale ?? 1;
    if (hasFrame) {
      const current = currentFrames[0]!;
      const texture = this.texture(current);
      if (material.map !== texture) {
        material.map = texture;
        material.color.set(0xffffff);
        material.needsUpdate = true;
      }
      mesh.scale.set(current.width * scale, (sprite.mirrorY ? -1 : 1) * current.height * scale, 1);
    } else {
      material.map = null;
      material.color.set(fallbackColor(command, sprite));
      material.needsUpdate = true;
      const size = fallbackSize(command);
      mesh.scale.set(size.width * scale, (sprite.mirrorY ? -1 : 1) * size.height * scale, 1);
    }
    mesh.position.set(placement.x, placement.y, spatialDepth.worldZ);
    mesh.rotation.z = placement.rotation + rotationBlend * (Math.PI * 2 / Math.max(1, frames.length));

    const interpolationMaterial = interpolationMesh.material;
    interpolationMaterial.opacity = (sprite.opacity ?? 1) * blend;
    interpolationMaterial.alphaTest = policy.alphaTest;
    if (interpolationMaterial.blending !== blending) {
      interpolationMaterial.blending = blending;
      interpolationMaterial.needsUpdate = true;
    }
    interpolationMaterial.side = sprite.mirrorY ? THREE.DoubleSide : THREE.FrontSide;
    interpolationMesh.renderOrder = forcedRenderOrder + .001;
    interpolationMesh.visible = interpolationMaterial.opacity > 0.001 && hasNextFrame && blend > 0;
    interpolationMesh.userData['gta2RenderPass'] = renderPass;
    interpolationMesh.userData['gta2BaseVisible'] = interpolationMesh.visible;
    if (hasNextFrame) {
      const next = nextFrames[0]!;
      const nextTexture = this.texture(next);
      if (interpolationMaterial.map !== nextTexture) {
        interpolationMaterial.map = nextTexture;
        interpolationMaterial.color.set(0xffffff);
        interpolationMaterial.needsUpdate = true;
      }
      interpolationMesh.scale.set(next.width * scale, (sprite.mirrorY ? -1 : 1) * next.height * scale, 1);
    }
    interpolationMesh.position.set(placement.x, placement.y, spatialDepth.worldZ);
    interpolationMesh.rotation.z = placement.rotation;
    if (mapObjectPick) interpolationMesh.userData['gta2MapObject'] = mapObjectPick;
    else delete interpolationMesh.userData['gta2MapObject'];
  }

  render(commands: readonly GameObjectDrawCommand[], now: number) {
    const active = new Set<string>();
    this.renderOrders.clear();
    for (const command of commands) {
      const sprite = command.sprite;
      if ((sprite.opacity ?? 1) <= 0) continue;
      if (sprite.beam) {
        this.renderBeam(command, sprite);
        active.add(command.key);
      }
    }
    for (const job of buildRenderQueue(commands)) {
      const { command, sprite, key } = job;
      active.add(key);
      if (!job.shadow && key === command.key) this.renderOrders.set(command.key, job.renderOrder);
      this.renderSpriteLayer(command, sprite, now, key, job.renderOrder);
      if (job.shadow) {
        const shadowMesh = this.meshes.get(key);
        if (shadowMesh) {
          shadowMesh.material.color.set(0x111111);
          this.shadowMeshes.set(key, shadowMesh);
        }
        const shadowInterpolation = this.interpolationMeshes.get(key);
        if (shadowInterpolation) {
          shadowInterpolation.material.color.set(0x111111);
          this.shadowInterpolationMeshes.set(key, shadowInterpolation);
        }
      }
    }

    for (const [key, mesh] of this.meshes) if (!active.has(key) && !this.shadowMeshes.has(key)) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.meshes.delete(key);
      this.animations.forget(key);
    }
    for (const [key, mesh] of this.interpolationMeshes) if (!active.has(key) && !this.shadowInterpolationMeshes.has(key)) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.interpolationMeshes.delete(key);
    }
    for (const [key, mesh] of this.shadowMeshes) if (!active.has(key)) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.shadowMeshes.delete(key);
      this.meshes.delete(key);
      this.animations.forget(key);
    }
    for (const [key, mesh] of this.shadowInterpolationMeshes) if (!active.has(key)) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.shadowInterpolationMeshes.delete(key);
      this.interpolationMeshes.delete(key);
    }
    for (const [key, meshes] of this.beamMeshes) if (!active.has(key)) {
      for (const mesh of meshes) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      this.beamMeshes.delete(key);
    }
  }

  dispose() {
    for (const [key, mesh] of this.meshes) if (!this.shadowMeshes.has(key)) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.meshes.clear();
    for (const [key, mesh] of this.interpolationMeshes) if (!this.shadowInterpolationMeshes.has(key)) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.interpolationMeshes.clear();
    for (const mesh of this.shadowMeshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.shadowMeshes.clear();
    for (const mesh of this.shadowInterpolationMeshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.shadowInterpolationMeshes.clear();
    for (const meshes of this.beamMeshes.values()) for (const mesh of meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.beamMeshes.clear();
    this.animations.clear();
    this.registry.clear();
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
  }
}
