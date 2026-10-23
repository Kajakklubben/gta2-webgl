import * as THREE from 'three';
import type { Pixels } from '../../shared/engine/assets/pixels';
export function pixelTexture(pixels: Pixels | undefined) {
  if (!pixels) throw new Error('Missing decoded tile texture');
  const texture = new THREE.DataTexture(pixels.data, pixels.width, pixels.height, THREE.RGBAFormat);
  texture.flipY = true; texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}
export interface FaceGeometry { vertices: THREE.Vector3[]; indices: number[]; uvs: THREE.Vector2[] }
export function faceGeometry(face: FaceGeometry) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(face.vertices.flatMap(point => point.toArray()), 3));
  // Legacy UV order follows face winding, rather than source vertex order.
  let order = face.indices;
  if (face.indices.length === 6) order = [3, 2, 1, 0];
  const uvs = new Float32Array(face.vertices.length * 2);
  for (let i = 0; i < order.length; i++) {
    const vertex = order[i]!, uv = face.uvs[i]!;
    uvs[vertex * 2] = uv.x; uvs[vertex * 2 + 1] = uv.y;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(face.indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}
