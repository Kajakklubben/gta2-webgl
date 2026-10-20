import type { Scene, Camera, Object3D, Vector2, Material } from 'three';
import type { GameMap, Block, Face } from '../../../shared/loader/map-parser';
import type { Style } from '../../../shared/loader/style-parser';
import type { FaceGeometry } from '../textures';
export interface MapRenderOptions {
  renderOrder?: number;
  materialFactory?: (face: Face, type: number, block: Block) => Material | undefined;
}
/** Typed boundary for the preserved slope construction rules. */
export class MapRender {
  scene: Scene;
  camera: Camera;
  style: Style;
  sceneObjects: (Object3D | undefined)[][];
  animations: import('../../../shared/loader/map-parser').TileAnimation[];
  CreateMesh(map: GameMap, style: Style, options?: MapRenderOptions): void;
  render(now?: number): void;
  CreateBlock(x: number, y: number, z: number, block: Block): Object3D;
  CreateLid(start: Vector2, slope: number): FaceGeometry;
  CreateEdge(start: Vector2, span: Vector2, slope: number, face: number, partialSpecial?: boolean): FaceGeometry;
  CreatePolygon(x: number, y: number, z: number, face: Face, type: number, block: Block, forceFlat?: boolean, doubleSided?: boolean, outwardFlat?: boolean): Object3D;
  RotateUV(face: FaceGeometry, degrees: number): void;
  MirrorUV(face: FaceGeometry, axis: string): void;
}
