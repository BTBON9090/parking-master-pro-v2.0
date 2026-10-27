import * as THREE from 'three';
import type { Vector2 } from '../types';

type Point2 = { x: number; y: number };

/**
 * Convex outer footprint of the actual rendered meshes in vehicle-local
 * coordinates (x=forward, y=-left). Includes tyres and mirrors; excludes only
 * contact-shadow/ground helper meshes. Shared by runtime and tests.
 */
export function collectVehicleFootprint(group: THREE.Object3D, includeWheels = true): Vector2[] {
  group.updateWorldMatrix(true, true);
  const inverse = group.matrixWorld.clone().invert();
  const vertex = new THREE.Vector3();
  const points: Point2[] = [];
  group.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    for(let p:THREE.Object3D|null=node;p&&p!==group;p=p.parent)if(p.userData.partRole==='articulated-trailer')return;
    if (/shadow|ground/i.test(node.name)) return;
    if (!includeWheels) {
      let ancestor: THREE.Object3D | null = node;
      while (ancestor && ancestor !== group) {
        if (ancestor.userData.nativeWheelPart || /wheel|tyre|tire/i.test(ancestor.name)) return;
        ancestor = ancestor.parent;
      }
    }
    const positions = node.geometry.getAttribute('position');
    if (!positions) return;
    const transform = inverse.clone().multiply(node.matrixWorld);
    for (const i of node.geometry.index ? new Set<number>(Array.from(node.geometry.index.array as ArrayLike<number>)) : Array.from({length:positions.count},(_,i)=>i)) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(transform);
      if (!Number.isFinite(vertex.x) || !Number.isFinite(vertex.z)) continue;
      points.push({ x: vertex.z, y: -vertex.x });
    }
  });
  return convexFootprint(points);
}

export function convexFootprint(points: Point2[]): Vector2[] {
  const sorted = [...new Map(points.map(p => [`${p.x.toFixed(4)},${p.y.toFixed(4)}`, p])).values()]
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point2, a: Point2, b: Point2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Point2[]) => {
    const hull: Point2[] = [];
    for (const point of list) {
      while (hull.length > 1 && cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0) hull.pop();
      hull.push(point);
    }
    return hull.slice(0, -1);
  };
  return sorted.length >= 3 ? [...half(sorted), ...half([...sorted].reverse())] : [];
}

export function footprintBounds(footprint: Vector2[]): { minX: number; maxX: number; minY: number; maxY: number } {
  return {
    minX: Math.min(...footprint.map(p => p.x)), maxX: Math.max(...footprint.map(p => p.x)),
    minY: Math.min(...footprint.map(p => p.y)), maxY: Math.max(...footprint.map(p => p.y)),
  };
}
