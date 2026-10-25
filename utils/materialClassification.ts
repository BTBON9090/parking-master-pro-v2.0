import * as THREE from 'three';
import type { CarType } from '../types';

/** True only for actual glass, never for shared paint on a window-named node. */
export function isCockpitGlassMaterial(carType: CarType, nodeName: string, materialName: string): boolean {
  if (carType === ('SPORTS' as CarType)) {
    return /(^|[^a-z])glass([^a-z]|$)/i.test(materialName);
  }
  const signature = `${nodeName} ${materialName}`.toLowerCase();
  if (/(glass|window|windshield|windscreen|carglass)/i.test(signature)) return true;
  return carType === ('SEDAN' as CarType) && materialName === 'Material.006';
}

/** The only Concept GLB nodes used as real first-person cockpit boundary. */
export function isConceptCockpitFrameNode(nodeName: string): boolean {
  return /^body(pillars|roofpanel|hood)$/i.test(nodeName);
}

/**
 * Concept exterior/mirror glass must not leave KHR_materials_transmission
 * active. The transmission pass renders the whole scene into an extra target;
 * with three mirror cameras this dominated exterior frames. Keep a normal
 * alpha-blended reflective window instead.
 */
export function applyLowCostConceptGlass(material: THREE.Material): void {
  const physical = material as THREE.MeshPhysicalMaterial & { transmission?: number; thickness?: number };
  if (typeof physical.transmission === 'number') physical.transmission = 0;
  if (typeof physical.thickness === 'number') physical.thickness = 0;
  material.transparent = true;
  (material as THREE.Material & { opacity: number }).opacity = 0.30;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  if (material instanceof THREE.MeshStandardMaterial) {
    material.roughness = Math.max(material.roughness, 0.06);
    material.metalness = Math.max(material.metalness, 0.18);
    material.envMapIntensity = 1.0;
  }
  material.needsUpdate = true;
}
