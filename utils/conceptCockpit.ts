import * as THREE from 'three';
import type { CarConfig } from '../types';
import { isConceptCockpitFrameNode } from './materialClassification';

/** Authored Concept meshes that supply real A-pillars, roof edge and hood top. */
export function collectConceptCockpitFrameMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  root.traverse(node => {
    if (node instanceof THREE.Mesh && isConceptCockpitFrameNode(node.name)) result.push(node);
  });
  return result;
}

function addBar(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, thickness: number, material: THREE.Material, name: string) {
  const direction = b.clone().sub(a);
  const length = direction.length();
  if (length < 0.1) return;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, length, thickness), material);
  mesh.name = name;
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
}

/**
 * Lightweight Concept cockpit derived from the same car boundaries: the real
 * hood top surface plus thin A-pillars/roof header/front cowl built from the
 * measured windshield glass box. The full BodyHood/BodyPillars meshes contain
 * inner wheel arches and a complete front clip, so cloning them shows red
 * interior shells through the windshield.
 */
export function buildConceptCockpitFrame(
  root: THREE.Object3D,
  frameInverse: THREE.Matrix4,
  darkMaterial: THREE.Material,
  glassBox: THREE.Box3,
  car: CarConfig,
  eyeY: number,
): THREE.Group {
  const frame = new THREE.Group();
  frame.name = 'concept-cockpit-boundary-frame';
  root.updateWorldMatrix(true, true);
  const transform = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();

  // Real hood top only: keep upward-facing triangles from BodyHood. Preserve
  // UV and the authored paint material; drop fender/wheel-arch interior faces.
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh) || !/^bodyhood$/i.test(node.name)) return;
    const source = node.geometry;
    const pos = source.getAttribute('position');
    if (!pos) return;
    const uv = source.getAttribute('uv');
    const index = source.index;
    const sourceMaterial = Array.isArray(node.material) ? node.material[0] : node.material;
    transform.multiplyMatrices(frameInverse, node.matrixWorld);
    normalMatrix.getNormalMatrix(transform);
    const outPos: number[] = [], outNormals: number[] = [], outUv: number[] = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const count = index ? index.count : pos.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const ia = index ? index.getX(i) : i;
      const ib = index ? index.getX(i + 1) : i + 1;
      const ic = index ? index.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(transform);
      b.fromBufferAttribute(pos, ib).applyMatrix4(transform);
      c.fromBufferAttribute(pos, ic).applyMatrix4(transform);
      normal.copy(b).sub(a).cross(c.clone().sub(a)).normalize();
      // Car-local +Y is up. Only the upper hood skin belongs in the cockpit.
      if (normal.y < 0.12) continue;
      outPos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      if (uv) {
        outUv.push(uv.getX(ia), uv.getY(ia), uv.getX(ib), uv.getY(ib), uv.getX(ic), uv.getY(ic));
      }
      if (source.getAttribute('normal')) {
        for (const vertexIndex of [ia, ib, ic]) {
          const n = new THREE.Vector3().fromBufferAttribute(source.getAttribute('normal'), vertexIndex).applyMatrix3(normalMatrix).normalize();
          outNormals.push(n.x, n.y, n.z);
        }
      }
    }
    if (outPos.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
    if (outNormals.length) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(outNormals, 3));
    if (outUv.length) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(outUv, 2));
    geometry.computeBoundingSphere();
    const hoodMaterial = sourceMaterial.clone();
    hoodMaterial.side = THREE.DoubleSide;
    hoodMaterial.transparent = false;
    hoodMaterial.opacity = 1;
    hoodMaterial.depthWrite = true;
    hoodMaterial.needsUpdate = true;
    const hood = new THREE.Mesh(geometry, hoodMaterial);
    hood.name = 'concept-real-hood-top';
    hood.frustumCulled = false;
    frame.add(hood);
  });

  // Thin boundary derived from the measured windshield glass box. Same car
  // coordinates, no second car / no generic triangle classifier.
  const halfWidth = Math.max(2, Math.max(Math.abs(glassBox.min.x), Math.abs(glassBox.max.x)));
  const lowerY = glassBox.min.y + Math.max(0.2, car.height * 0.02);
  const upperY = glassBox.max.y - Math.max(0.2, car.height * 0.025);
  const lowerZ = glassBox.max.z - Math.max(0.3, car.length * 0.02);
  const upperZ = Math.max(0, glassBox.min.z + Math.max(0.4, car.length * 0.03));
  const lowerX = halfWidth * 0.93;
  const upperX = halfWidth * 0.72;
  const bar = Math.max(0.22, car.width * 0.018);
  addBar(frame, new THREE.Vector3(-lowerX, lowerY, lowerZ), new THREE.Vector3(-upperX, upperY, upperZ), bar, darkMaterial, 'concept-a-pillar-left');
  addBar(frame, new THREE.Vector3(lowerX, lowerY, lowerZ), new THREE.Vector3(upperX, upperY, upperZ), bar, darkMaterial, 'concept-a-pillar-right');
  addBar(frame, new THREE.Vector3(-upperX, upperY, upperZ), new THREE.Vector3(upperX, upperY, upperZ), bar, darkMaterial, 'concept-roof-header');
  // Low front cowl: behind the wheel disc in eye space and below the hub.
  const wheelZ = car.length * 0.16;
  const wheelRadius = 1.25;
  const cowlDepth = Math.max(0.9, car.length * 0.028);
  const cowlZ = Math.max(lowerZ + 0.4, wheelZ + wheelRadius + cowlDepth / 2 + 0.5);
  // A thin bar cannot occlude the wheel-arch/front-clip interior. Project the
  // cowl top onto the real windshield lower edge, then continue the panel down
  // to the cabin floor. It stays behind the wheel disc, so hub/spokes render
  // first; the tall panel only blocks the lower empty/red interior.
  const projectedTop = eyeY + (lowerY - eyeY) * (cowlZ / Math.max(1, lowerZ));
  const cowlTop = projectedTop + Math.max(0.10, car.height * 0.01);
  const cowlBottom = Math.max(car.height * 0.16, cowlTop - car.height * 0.48);
  const cowlHeight = Math.max(car.height * 0.30, cowlTop - cowlBottom);
  const cowl = new THREE.Mesh(new THREE.BoxGeometry(car.width * 1.02, cowlHeight, cowlDepth), darkMaterial);
  cowl.name = 'concept-continuous-front-bulkhead';
  cowl.position.set(0, cowlTop - cowlHeight / 2, cowlZ);
  cowl.castShadow = false;
  cowl.receiveShadow = false;
  frame.add(cowl);
  frame.updateMatrixWorld(true);
  return frame;
}
