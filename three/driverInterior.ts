import * as THREE from 'three';
import type { CarConfig } from '../types';
import { cockpitProfileFor, type CockpitProfile } from '../utils/cockpitCutout';

/**
 * Lightweight dashboard/steering adaptation used only by the first-person
 * driver camera. The actual car body supplies the cabin framing, hood and
 * windscreen opening; this group only fills the missing dash/wheel. Exterior
 * views and mirror renders hide it entirely.
 */
export interface DriverInterior {
  group: THREE.Group;
  steeringWheel: THREE.Object3D;
}

export function buildDriverInterior(cc: CarConfig, profile: CockpitProfile = cockpitProfileFor(cc.id)): DriverInterior {
  const group = new THREE.Group();
  group.name = 'generic-driver-interior';
  const width = cc.width;
  const height = cc.height;
  const length = cc.length;
  const driverX = width * 0.16;

  const dark = new THREE.MeshLambertMaterial({ color: '#171a1f' });
  const darker = new THREE.MeshLambertMaterial({ color: '#0e1115' });
  const rimMaterial = new THREE.MeshStandardMaterial({ color: '#687386', roughness: 0.5, metalness: 0.25, emissive: '#111827', emissiveIntensity: 0.25 });
  const trim = new THREE.MeshLambertMaterial({ color: '#2a2f36' });
  const screen = new THREE.MeshStandardMaterial({
    color: '#0a1419',
    emissive: '#0d3b45',
    emissiveIntensity: 0.72,
    roughness: 0.45,
    metalness: 0.1,
  });
  const amber = new THREE.MeshStandardMaterial({
    color: '#3a2606',
    emissive: '#f59e0b',
    emissiveIntensity: 0.55,
    roughness: 0.5,
  });

  const addBox = (
    w: number, h: number, d: number,
    x: number, y: number, z: number,
    material: THREE.Material,
    parent: THREE.Object3D = group,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  };

  // The eye, cowl, dashboard and wheel all come from the per-car profile;
  // no sedan ratios remain here. For calibrated cars the profile's front edge
  // is already fitted to the measured real hood rear.
  const dashFrontZ = length * profile.dashFrontZRatio;
  const dashRearZ = length * profile.dashRearZRatio;
  // Keep the physical dash below the steering-wheel hub. The old profile
  // height (e.g. 0.735h) put a solid black box in front of the entire wheel,
  // so only the upper rim showed. The hood/cowl profile still drives the
  // windshield relation; this is the visible lower dash surface.
  const dashFrontY = Math.min(height * profile.dashFrontYRatio, height * 0.57);
  const dashRearY = Math.min(height * profile.dashRearYRatio, height * 0.545);
  const dashCenterZ = (dashFrontZ + dashRearZ) / 2;
  const dashboard = addBox(
    width * 0.90,
    height * 0.065,
    Math.max(1, Math.abs(dashFrontZ - dashRearZ) * 0.9),
    0,
    (dashFrontY + dashRearY) / 2 - height * 0.015,
    dashCenterZ,
    dark,
  );
  dashboard.name = 'driver-dashboard';
  addBox(
    width * 0.73,
    height * 0.035,
    Math.max(0.8, Math.abs(dashFrontZ - dashRearZ) * 0.6),
    0,
    dashRearY - height * 0.02,
    dashRearZ + length * 0.01,
    darker,
  );
  // Vertical bulkhead, not a thin floating lip. It closes the lower view
  // without producing a detached horizontal bar in the windscreen.
  const firewall = addBox(
    width * 0.90,
    height * 0.12,
    Math.max(0.2, length * 0.012),
    0,
    dashFrontY - height * 0.06,
    dashFrontZ,
    darker,
  );
  firewall.name = 'driver-firewall';
  const dashHalf = width * 0.45;
  const dashThickness = 0.38;
  const wedgeVerts = new Float32Array([
    -dashHalf, dashFrontY, dashFrontZ, dashHalf, dashFrontY, dashFrontZ,
    -dashHalf, dashRearY, dashRearZ, dashHalf, dashRearY, dashRearZ,
    -dashHalf, dashFrontY - dashThickness, dashFrontZ, dashHalf, dashFrontY - dashThickness, dashFrontZ,
    -dashHalf, dashRearY - dashThickness, dashRearZ, dashHalf, dashRearY - dashThickness, dashRearZ,
  ]);
  const wedgeIndices = [
    0,1,2,2,1,3, 4,6,5,5,6,7,
    0,2,4,4,2,6, 1,5,3,3,5,7,
    2,3,6,6,3,7, 0,4,1,1,4,5,
  ];
  const wedgeGeo = new THREE.BufferGeometry();
  wedgeGeo.setAttribute('position', new THREE.BufferAttribute(wedgeVerts, 3));
  wedgeGeo.setIndex(wedgeIndices);
  wedgeGeo.computeVertexNormals();
  const dashboardTopMaterial = dark.clone();
  dashboardTopMaterial.side = THREE.DoubleSide;
  const dashboardTop = new THREE.Mesh(wedgeGeo, dashboardTopMaterial);
  dashboardTop.name = 'driver-dashboard-top';
  dashboardTop.castShadow = false;
  dashboardTop.receiveShadow = false;
  group.add(dashboardTop);
  // Instrument binnacle in front of the driver.
  addBox(width * 0.27, height * 0.045, 0.85, driverX, Math.min(height * profile.dashFrontYRatio, height * 0.57) - height * 0.035, length * profile.dashFrontZRatio * 0.56, darker);
  addBox(width * 0.21, height * 0.025, 0.14, driverX, Math.min(height * profile.dashFrontYRatio, height * 0.57) - height * 0.035, length * profile.dashFrontZRatio * 0.56 + 0.44, screen);
  // A narrow centre screen / vent strip.
  addBox(width * 0.20, height * 0.03, 0.12, -width * 0.10, Math.min(height * profile.dashFrontYRatio, height * 0.57) - height * 0.045, length * profile.dashFrontZRatio * 0.56 + 0.44, screen);
  addBox(width * 0.42, 0.12, 0.55, 0, Math.min(height * profile.dashFrontYRatio, height * 0.57) - height * 0.045, length * profile.dashFrontZRatio * 0.58, amber);

  // Real door inner lining below the side glass; fills the lower side void
  // while leaving the real window frame/roof above it visible.
  for (const side of [-1, 1]) {
    const lining = addBox(0.18, height * 0.24, length * 0.40,
      side * width * 0.445, height * (profile.dashRearYRatio - 0.075), -length * 0.01, dark);
    lining.name = side < 0 ? 'driver-door-lining-left' : 'driver-door-lining-right';
  }

  // Steering column and wheel. The upper rim sits in the lower quarter of the
  // new driver-eye view; the centre is ~0.24h below the eye.
  // Column stays behind the hub; a long forward box read as a fifth spoke.
  addBox(0.34, 0.34, 1.15, driverX, height * (profile.wheelCenterRatio - 0.025), length * profile.wheelZRatio - 0.60, trim);
  const steeringWheel = new THREE.Group();
  steeringWheel.name = 'driver-steering-wheel';
  steeringWheel.position.set(driverX, height * profile.wheelCenterRatio, length * profile.wheelZRatio);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.17, 8, 24), rimMaterial);
  rim.castShadow = false;
  steeringWheel.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.42, 12), trim);
  hub.rotation.x = Math.PI / 2;
  steeringWheel.add(hub);
  const hubRadius = 0.48;
  const rimInnerRadius = 1.25 - 0.17;
  const spokeLength = rimInnerRadius - hubRadius;
  const spokeMidRadius = (hubRadius + rimInnerRadius) / 2;
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const spoke = addBox(spokeLength, 0.18, 0.22, 0, 0, 0, trim, steeringWheel);
    spoke.name = 'driver-steering-wheel-spoke';
    spoke.position.set(Math.cos(angle) * spokeMidRadius, Math.sin(angle) * spokeMidRadius, 0);
    spoke.rotation.z = angle;
  }
  // Small amber marker at 12 o'clock makes rotation readable.
  const marker = addBox(0.18, 0.34, 0.22, 0, 1.20, 0.05, amber, steeringWheel);
  marker.rotation.z = 0;
  group.add(steeringWheel);

  // The real exterior shell now supplies the A-pillars, roof edge, windscreen
  // opening and hood. This group is only the lightweight dashboard/steering
  // adaptation for models without an interior; no rectangular fake window or
  // white hood is added here.

  group.traverse(node => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = false;
      node.receiveShadow = false;
    }
  });
  return { group, steeringWheel };
}
