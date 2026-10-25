import * as THREE from 'three';
import type { CarMeshParts } from './geometries';
import { collectVehicleFootprint, convexFootprint } from '../utils/collisionFootprint';

const WHEELS = ['WheelFrontL', 'WheelFrontR', 'WheelRearL', 'WheelRearR'];

/** This asset is delivered in a showroom pose, not a neutral rig pose. */
export function neutralizeConceptWheels(source: THREE.Group): void {
  for (const name of WHEELS) {
    const wheel = source.getObjectByName(name);
    if (!wheel) throw new Error(`Concept asset missing ${name}`);
    wheel.quaternion.identity();
    wheel.scale.setScalar(1);
  }
  source.updateWorldMatrix(true, true);
}

/** Bake the imported transforms once. All live pivots have unit scale. */
export function buildNativeConcept(source: THREE.Group): CarMeshParts {
  source.updateWorldMatrix(true, true);
  const group = new THREE.Group();
  const parts: CarMeshParts = {
    group, wheels: [], wheelMounts: [], frontWheels: [], isGLB: true,
    headlights: [], taillights: [], brakeLights: [], reverseLights: [],
    leftIndicators: [], rightIndicators: [],
    extras: { doors: [], spoilers: [], steeringWheels: [], brakeGlow: [], drl: [] },
    nativeCockpit: {
      // The authored Concept has a central driver seat. Coordinates below
      // are in the original Y-up asset space, before length normalization.
      eye: new THREE.Vector3(0, 1.00, 0.28).applyMatrix4(source.matrixWorld),
      pitchDeg: -8,
    },
  };
  const wheelRoots = WHEELS.map(name => source.getObjectByName(name)!);
  const mounts = wheelRoots.map((root, i) => {
    const mount = new THREE.Group();
    mount.name = `${WHEELS[i]}-steer-pivot`;
    mount.position.copy(root.getWorldPosition(new THREE.Vector3()));
    mount.userData.vehicleSideX = mount.position.x;
    mount.userData.isFront = i < 2;
    const roll = new THREE.Group();
    roll.name = `${WHEELS[i]}-roll`;
    roll.userData.nativeWheel = true;
    roll.userData.wheelRadius = new THREE.Box3().setFromObject(root, true).getSize(new THREE.Vector3()).y / 2;
    mount.add(roll);
    group.add(mount);
    parts.wheels.push(roll);
    parts.wheelMounts.push(mount);
    if (i < 2) parts.frontWheels.push(mount);
    return { mount, roll };
  });
  const column = source.getObjectByName('InteriorSteeringCylinder')!;
  const shaftAxis = new THREE.Vector3(0, 1, 0).transformDirection(column.matrixWorld);
  const steering = new THREE.Group();
  steering.name = 'native-steering-wheel-pivot';
  steering.userData.partRole = 'steering-wheel-pivot';
  steering.position.copy(new THREE.Vector3(0, .250249, 0).applyMatrix4(column.matrixWorld));
  group.add(steering);
  parts.extras!.steeringWheels.push({ object: steering, ratio: 1, axis: shaftAxis });
  const neutralRim = new THREE.Matrix4().makeRotationAxis(shaftAxis, Math.PI / 12);

  source.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    let ancestor: THREE.Object3D | null = node;
    let wheelIndex = -1;
    while (ancestor && wheelIndex < 0) {
      wheelIndex = wheelRoots.indexOf(ancestor);
      ancestor = ancestor.parent;
    }
    let parent: THREE.Object3D = group;
    const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld);
    if (wheelIndex >= 0) {
      const { mount, roll } = mounts[wheelIndex];
      geometry.translate(-mount.position.x, -mount.position.y, -mount.position.z);
      parent = /BrakePad/.test(node.name) ? mount : roll;
    } else if (/^InteriorSteering(Wheel|Emblem)/.test(node.name)) {
      geometry.translate(-steering.position.x, -steering.position.y, -steering.position.z);
      geometry.applyMatrix4(neutralRim);
      parent = steering;
    }
    const material = Array.isArray(node.material) ? node.material.map(m => m.clone()) : node.material.clone();
    // The exterior asset uses single-sided panels. Their inner faces must
    // also render from the driver eye; otherwise roof/door skins show holes.
    if (/^(BodyRoofPanel|BodyPillars|BodyDoor.*Color|Interior)/.test(node.name)) {
      (Array.isArray(material) ? material : [material]).forEach(m => { m.side = THREE.DoubleSide; });
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = node.name;
    mesh.castShadow = !/^Interior|Brake/.test(node.name);
    mesh.receiveShadow = true;
    if (wheelIndex >= 0) mesh.userData.nativeWheelPart = true;
    if (/^Interior/.test(node.name)) mesh.userData.partRole = 'interior';
    parent.add(mesh);
    if (node.name === 'InteriorSteeringDash' && typeof document !== 'undefined') {
      const screenMaterial = material as THREE.MeshStandardMaterial;
      const sourceMap = screenMaterial.emissiveMap;
      if (sourceMap?.image) {
        const canvas = document.createElement('canvas');
        canvas.width = 1024; canvas.height = 256;
        const ctx = canvas.getContext('2d')!;
        const texture = new THREE.CanvasTexture(canvas);
        texture.flipY = sourceMap.flipY;
        texture.colorSpace = sourceMap.colorSpace;
        screenMaterial.emissiveMap = texture;
        let lastReadout = '';
        parts.nativeCockpit!.updateInstruments = (speedKmh, rpm) => {
          const speed = Math.round(Math.abs(speedKmh));
          const bars = Math.min(10, Math.max(0, Math.round(rpm / 820)));
          const readout = `${speed}/${bars}`;
          if (readout === lastReadout) return;
          lastReadout = readout;
          ctx.drawImage(sourceMap.image as CanvasImageSource, 0, 0, 1024, 256);
          ctx.fillStyle = '#000'; ctx.fillRect(475, 32, 240, 169);
          ctx.fillStyle = '#fff'; ctx.font = '160px sans-serif';
          ctx.textAlign = 'center'; ctx.fillText(String(speed), 597, 184, 230);
          ctx.fillStyle = '#000'; ctx.fillRect(261, 36, 63, 164);
          ctx.fillStyle = '#fff';
          for (let i = 0; i < bars; i++) ctx.fillRect(261, 187 - i * 16.4, 63, 12);
          texture.needsUpdate = true;
        };
        parts.nativeCockpit!.updateInstruments(0, 0);
      }
    }
    // Split existing lens triangles into independent channels; never append
    // floating lamp boxes outside the model/collision envelope.
    if (/^Body(Headlights|Taillights|TurnsignalsRear)$/.test(mesh.name)) {
      const src = geometry.index ? geometry.toNonIndexed() : geometry;
      const positions = src.getAttribute('position');
      const regions: { indices: number[]; kind: 'left' | 'right' | 'reverse' }[] = [
        { indices: [], kind: 'left' }, { indices: [], kind: 'right' },
        ...(mesh.name === 'BodyTaillights' ? [{ indices: [], kind: 'reverse' as const }] : []),
      ];
      const width = new THREE.Box3().setFromBufferAttribute(positions as THREE.BufferAttribute).getSize(new THREE.Vector3()).x;
      for (let i = 0; i < positions.count; i += 3) {
        const x = (positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3;
        const region = mesh.name === 'BodyTaillights' && Math.abs(x) < width * .12 ? 2 : x >= 0 ? 0 : 1;
        regions[region].indices.push(i, i + 1, i + 2);
      }
      parent.remove(mesh);
      for (const region of regions) {
        if (!region.indices.length) continue;
        const lensGeometry = src.clone();
        lensGeometry.setIndex(region.indices);
        const lamp = new THREE.Mesh(lensGeometry, (material as THREE.Material).clone());
        lamp.name = `${mesh.name}-${region.kind}`;
        parent.add(lamp);
        if (mesh.name === 'BodyHeadlights') parts.headlights.push(lamp);
        else if (region.kind === 'reverse') parts.reverseLights.push(lamp);
        else if (mesh.name === 'BodyTaillights') { parts.taillights.push(lamp); parts.brakeLights.push(lamp); }
        else (region.kind === 'left' ? parts.leftIndicators : parts.rightIndicators).push(lamp);
      }
      if (src !== geometry) src.dispose();
      geometry.dispose();
    }
  });
  group.updateWorldMatrix(true, true);
  const bodyFootprint = collectVehicleFootprint(group, false);
  const wheelFootprints = parts.wheelMounts.map(mount => collectVehicleFootprint(mount, true));
  parts.updateCollisionFootprint = () => convexFootprint([
    ...bodyFootprint,
    ...wheelFootprints.flatMap((points, i) => {
      const mount = parts.wheelMounts[i];
      const c = Math.cos(mount.rotation.y), s = Math.sin(mount.rotation.y);
      return points.map(p => ({
        x: p.x * c + p.y * s + mount.position.z,
        y: p.y * c - p.x * s - mount.position.x,
      }));
    }),
  ]);
  return parts;
}
