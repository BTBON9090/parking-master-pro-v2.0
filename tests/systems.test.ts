import {FLEET30_IDS} from '../utils/fleet30';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import fsSync from 'node:fs';
import { CAR_MODELS, DEFAULT_HOOD_CAMERA_ADJUSTMENT, DEFAULT_VEHICLE_TUNING } from '../constants';
import type { CarConfig } from '../types';
import { CarType } from '../types';
import {
  canSelectGear,
  gameSpeedToWorldVelocity,
  gearRejectionReason,
  getPowertrain,
  isElectricVehicle,
  TRAVEL_PER_SPEED_FRAME,
  worldImpactToGameSpeed,
} from '../utils/powertrain';
import { createLongitudinalState, stepLongitudinal, lowSpeedTakeupFactor, LIGHT_THROTTLE, STALL_DELAY_FRAMES, LongitudinalContext, LongitudinalInputs, LongitudinalState } from '../utils/longitudinal';
import { approachExponential, approachLinear, simulationDeltaMs } from '../utils/timeStep';
import { advanceVehicleCenter } from '../utils/driving';
import { applySymmetricSteeringDelta, autoCenterWheelAngle, CENTER_SNAP_DEG, driverWheelRotationZ, driftSlipStep, effectiveSteeringWheelMaxDeg, KEYBOARD_STEER_DELTA_PER_FRAME, KNOB_STEER_STEP_DEG, snapSteeringCenter, speedSteeringFactor, STEER_LEFT_KEY, STEER_RIGHT_KEY, SteeringActivityClock, SteeringInputSmoother } from '../utils/steering';
import { isEditableTarget } from '../utils/inputGuards';
import { PhysicsWorld } from '../utils/physicsWorld';
import { checkCollision } from '../utils/physics';
import { stepTrafficVehicle } from '../utils/traffic';
import { buildBeijingLevel, BEIJING_STREETS } from '../utils/beijingMap';
import { buildDriverInterior } from '../three/driverInterior';
import { buildProceduralCar } from '../three/vehicleModels';
import { buildNativeAuthoredVehicle, isAuthoredVehicle } from '../three/blenderVehicle';
import { MODEL_REGISTRY, CAR_TYPE_TO_MODEL, normalizeModel } from '../three/modelLoader';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { resolveHoodCameraLocalPose } from '../utils/hoodCamera';
import { applyCockpitEyeOffset, projectCockpitVerticalScreenY } from '../utils/cockpitView';
import { calibrateCowlProfile, classifyCockpitPaintTriangle, cockpitProfileFor } from '../utils/cockpitCutout';
import { getHeadLook, resetHeadLook, setHeadLookTarget, stepHeadLook, HEAD_LOOK_PITCH_DOWN_LIMIT_DEG, HEAD_LOOK_PITCH_UP_LIMIT_DEG, HEAD_LOOK_YAW_LIMIT_DEG } from '../utils/headLook';
import { ORBIT_POLAR_MAX, ORBIT_POLAR_MIN, stepOrbitDrag } from '../utils/cameraLook';
import { isWheelGroundedByGap, requiredWheelOffset, wheelContactGap } from '../utils/wheelContact';
import { markingMaterial, markingMaterialKey } from '../three/materials';
import { isRecordingAudible, getRecordingLifecycle, setRecordingAudioFocus, setRecordingAudioPaused, setRecordingAudioVisibility, disposeRecordingAudio, shouldCommitAudioLoad } from '../utils/recordingAudio';
import { TRAINING_TERRAIN, isTrainingTerrain, trainingTerrainGradient, trainingTerrainHeight, trainingTerrainMeshHeight } from '../utils/trainingTerrain';
import { createSuspensionState, simulateSuspensionBump, stepSuspension, suspensionForCar } from '../utils/suspension';
import { resolveKeyboardPedals, shouldHandleHandbrakeKey, heldKeyboardHandbrake, KEYBOARD_LIGHT_THROTTLE, KEYBOARD_SHIFT_THROTTLE, KEYBOARD_LIGHT_BRAKE, KEYBOARD_HARD_BRAKE } from '../utils/keyboardPedals';
import { dynamicPitchTargetRad, filterLongitudinalAccel, stepDynamicPitch } from '../utils/bodyPitch';
import { elevatedRoadProfile, sampleElevatedRoad } from '../utils/elevatedRoad';
import { CURB_HEIGHT, CURB_WIDTH, curbHeightAt, sampleTerrainSurface } from '../utils/terrainSampling';
import { checkVehicleRectCollision, vehicleLayersCompatible } from '../utils/physics';
import { footprintBounds } from '../utils/collisionFootprint';
import { accumulateParkingStable, evaluateParkingSpot } from '../utils/parking';
import { rearSteerAngleForSpeed } from '../utils/steering';
import { fourWheelAckermannAngles, fourWheelSteeringGeometry, limitRearAxleSteer } from '../utils/driving';
import { applyLowCostConceptGlass, isCockpitGlassMaterial, isConceptCockpitFrameNode } from '../utils/materialClassification';
import { sedanCowlLayout } from '../utils/sedanCowl';
import { detectSupportLoss, stepAirborne } from '../utils/airborne';
import { buildCollisionGrid, isStaticCollisionCandidate, queryCollisionGrid } from '../utils/collisionSpatial';
import { buildWheelAssembly } from '../three/geometries';
import { betweenMirrorsWidth, firstPersonClusterFits, firstPersonClusterWidth } from '../utils/hudLayout';
import { DRIVING_TEST_POINTS } from '../utils/testPoints';


// ---------------------------------------------------------------- source hood audit
type TriangleAudit = { hood: number; frame: number; up: number; hoodRearY: number | null; hoodRearZ: number | null };
function auditPaintTriangles(
  meshes: THREE.Mesh[],
  root: THREE.Object3D,
  car: CarConfig,
  profile: ReturnType<typeof cockpitProfileFor>,
): TriangleAudit {
  // The model's normalization group carries scale/translation. Transforming
  // by mesh.matrixWorld gives the same car-root units used by GameCanvas.
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const center = new THREE.Vector3(), normal = new THREE.Vector3();
  let hood = 0, frame = 0, up = 0;
  let hoodRearY: number | null = null;
  let hoodRearZ: number | null = null;
  for (const mesh of meshes) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.some(m => /glass|window|windshield|windscreen|light|lamp|bumper|trim/i.test(m.name))) continue;
    if (car.id === CarType.SUV && materials.some(m => /black|grey/i.test(m.name))) continue;
    const geometry = mesh.geometry;
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const index = geometry.index;
    const transform = mesh.matrixWorld.clone();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(transform);
    for (let t = 0; t + 2 < (index ? index.count : positions.count); t += 3) {
      const ia = index ? index.getX(t) : t, ib = index ? index.getX(t + 1) : t + 1, ic = index ? index.getX(t + 2) : t + 2;
      a.fromBufferAttribute(positions, ia).applyMatrix4(transform);
      b.fromBufferAttribute(positions, ib).applyMatrix4(transform);
      c.fromBufferAttribute(positions, ic).applyMatrix4(transform);
      center.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      normal.set(0, 0, 0);
      if (normals) {
        const n1 = new THREE.Vector3().fromBufferAttribute(normals, ia).applyMatrix3(normalMatrix).normalize();
        const n2 = new THREE.Vector3().fromBufferAttribute(normals, ib).applyMatrix3(normalMatrix).normalize();
        const n3 = new THREE.Vector3().fromBufferAttribute(normals, ic).applyMatrix3(normalMatrix).normalize();
        normal.add(n1).add(n2).add(n3).normalize();
      }
      if (normal.y > 0.85) up++;
      const classification = classifyCockpitPaintTriangle(
        Math.abs(center.x) / car.width,
        center.y / car.height,
        center.z / car.length,
        normal.y,
        0.5,
        0.95,
        profile,
      );
      if (classification === 'hood') {
        hood++;
        for (const vertex of [a, b, c]) {
          const y = vertex.y / car.height;
          const z = vertex.z / car.length;
          if (hoodRearY === null || z < hoodRearZ!) { hoodRearY = y; hoodRearZ = z; }
          else if (Math.abs(z - hoodRearZ!) <= 1e-4) hoodRearY = (hoodRearY + y) / 2;
        }
      } else if (classification === 'frame') frame++;
    }
  }
  return { hood, frame, up, hoodRearY, hoodRearZ };
}

function readGlbPaintCounts(carType: CarType, car: CarConfig, profile: ReturnType<typeof cockpitProfileFor>): TriangleAudit {
  const file = carType === CarType.SEDAN ? 'sedan-red.glb' : carType === CarType.SUV ? 'suv-gray.glb' : carType === CarType.SPORTS ? 'concept-car.glb' : 'pickup-truck.glb';
  const buffer = fsSync.readFileSync(new URL(`../public/models/cars/${file}`, import.meta.url));
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
  let binOffset = 20 + jsonLength;
  while (binOffset < buffer.length) {
    const chunkLength = buffer.readUInt32LE(binOffset);
    const chunkType = buffer.readUInt32LE(binOffset + 4);
    if (chunkType === 0x004E4942) break;
    binOffset += 8 + chunkLength;
  }
  const bin = buffer.subarray(binOffset + 8);
  const accessor = (index: number) => {
    const a = json.accessors[index]; const view = json.bufferViews[a.bufferView];
    const offset = (view.byteOffset || 0) + (a.byteOffset || 0);
    const comps = a.type === 'VEC3' ? 3 : 1;
    const fmt = a.componentType === 5126 ? 'Float32' : a.componentType === 5123 ? 'Uint16' : 'Uint32';
    const dv = new DataView(bin.buffer, bin.byteOffset + offset, a.count * comps * (fmt === 'Float32' ? 4 : fmt === 'Uint16' ? 2 : 4));
    const out: number[][] = [];
    for (let i = 0; i < a.count; i++) {
      const row: number[] = [];
      for (let c = 0; c < comps; c++) row.push(fmt === 'Float32' ? dv.getFloat32((i * comps + c) * 4, true) : fmt === 'Uint16' ? dv.getUint16((i * comps + c) * 2, true) : dv.getUint32((i * comps + c) * 4, true));
      out.push(row);
    }
    return out;
  };
  const bodyPrimitives: Array<{ name: string; positions: number[][]; indices: number[][] }> = [];
  const all: Array<[number, number, number]> = [];
  json.meshes.forEach((mesh: any) => {
    if (/wheel|tyre|tire/i.test(mesh.name || '')) return;
    mesh.primitives.forEach((prim: any) => {
      const positions = accessor(prim.attributes.POSITION) as number[][];
      const indices = prim.indices !== undefined ? accessor(prim.indices) as number[][] : positions.map((_, i) => [i]);
      const material = json.materials[prim.material]?.name || '';
      bodyPrimitives.push({ name: material, positions, indices });
      positions.forEach(p => all.push([p[0], p[1], p[2]]));
    });
  });
  const xs = all.map(p => p[0]), ys = all.map(p => p[1]), zs = all.map(p => p[2]);
  const minX = xs.reduce((a,b)=>Math.min(a,b), Infinity), maxX = xs.reduce((a,b)=>Math.max(a,b), -Infinity);
  const minY = ys.reduce((a,b)=>Math.min(a,b), Infinity), maxY = ys.reduce((a,b)=>Math.max(a,b), -Infinity);
  const minZ = zs.reduce((a,b)=>Math.min(a,b), Infinity), maxZ = zs.reduce((a,b)=>Math.max(a,b), -Infinity);
  const sx = car.width / Math.max(1e-6, maxX - minX), sy = car.height / Math.max(1e-6, maxY - minY), sz = car.length / Math.max(1e-6, maxZ - minZ);
  const yaw = carType === CarType.SEDAN;
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const transform = (p: number[]) => {
    const px = (yaw ? -p[0] : p[0]) * sx;
    const pz = (yaw ? -p[2] : p[2]) * sz;
    return [px - (yaw ? -cx : cx) * sx, (p[1] - minY) * sy, pz - (yaw ? -cz : cz) * sz];
  };
  let hood = 0, frame = 0, up = 0;
  let hoodRearY: number | null = null;
  let hoodRearZ: number | null = null;
  for (const primitive of bodyPrimitives) {
    if (/glass|window|windshield|windscreen|light|lamp|bumper|trim/i.test(primitive.name)) continue;
    if (carType === CarType.SUV && /black|grey/i.test(primitive.name)) continue;
    for (let t = 0; t + 2 < primitive.indices.length; t += 3) {
      const a = transform(primitive.positions[primitive.indices[t][0]]);
      const b = transform(primitive.positions[primitive.indices[t + 1][0]]);
      const c = transform(primitive.positions[primitive.indices[t + 2][0]]);
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      const normalY = ny / len;
      if (normalY > 0.85) up++;
      const center = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      const classification = classifyCockpitPaintTriangle(Math.abs(center[0]) / car.width, center[1] / car.height, center[2] / car.length, normalY, 0.5, 0.95, profile);
      if (classification === 'hood') {
        hood++;
        for (const vertex of [a, b, c]) {
          const y = vertex[1] / car.height;
          const z = vertex[2] / car.length;
          if (hoodRearY === null || z < hoodRearZ!) { hoodRearY = y; hoodRearZ = z; }
          else if (Math.abs(z - hoodRearZ!) <= 1e-4) hoodRearY = (hoodRearY + y) / 2;
        }
      } else if (classification === 'frame') frame++;
    }
  }
  return { hood, frame, up, hoodRearY, hoodRearZ };
}

async function auditCarGeometry(carType: CarType): Promise<TriangleAudit> {
  const car = CAR_MODELS[carType];
  const profile = cockpitProfileFor(carType);
  if (carType === CarType.SU7 || carType === CarType.YU7 || carType === CarType.ZUNJIE) {
    const built = buildProceduralCar(car);
    assert(built, `${carType}: procedural model must build`);
    built.parts.group.updateWorldMatrix(true, true);
    const meshes: THREE.Mesh[] = [];
    built.parts.group.traverse(node => { if (node instanceof THREE.Mesh && !/wheel|tyre|tire/i.test(node.name)) meshes.push(node); });
    return auditPaintTriangles(meshes, built.parts.group, car, profile);
  }
  return readGlbPaintCounts(carType, car, profile);
}

// ---------------------------------------------------------------- head look
{
  resetHeadLook(true);
  setHeadLookTarget(200, 40);
  let look = getHeadLook();
  assert.equal(look.targetYawDeg, HEAD_LOOK_YAW_LIMIT_DEG, 'head yaw clamps to ±80°');
  assert.equal(HEAD_LOOK_YAW_LIMIT_DEG, 80, 'interior head yaw limit is 80°');
  assert.equal(look.targetPitchDeg, HEAD_LOOK_PITCH_UP_LIMIT_DEG, 'head pitch clamps to +10° up');
  setHeadLookTarget(0, -40);
  assert.equal(getHeadLook().targetPitchDeg, -HEAD_LOOK_PITCH_DOWN_LIMIT_DEG, 'head pitch clamps to 15° down');
  setHeadLookTarget(200, 40);
  for (let i = 0; i < 90; i++) stepHeadLook(1 / 60);
  assert(Math.abs(getHeadLook().yawDeg - HEAD_LOOK_YAW_LIMIT_DEG) < 0.5, 'head look converges without drift');
  resetHeadLook();
  for (let i = 0; i < 60; i++) stepHeadLook(1 / 60);
  assert(Math.abs(getHeadLook().yawDeg) < 0.01 && Math.abs(getHeadLook().pitchDeg) < 0.01, 'reset returns head to centre');
  resetHeadLook(true);
  // Plain left-drag orbit: preserve distance, change only the angles, and
  // clamp the horizontal view near the top and the horizon.
  const pose = { azimuth: 0, polar: 0.9 };
  const dragged = stepOrbitDrag(pose, 240, -40);
  assert(dragged.azimuth > pose.azimuth, 'dragging right rotates azimuth');
  assert(dragged.polar < pose.polar, 'dragging up raises the camera');
  const top = stepOrbitDrag(pose, 0, -10000);
  const horizon = stepOrbitDrag(pose, 0, 10000);
  assert(Math.abs(top.polar - ORBIT_POLAR_MIN) < 1e-9, 'orbit pitch clamps at top-down limit');
  assert(Math.abs(horizon.polar - ORBIT_POLAR_MAX) < 1e-9, 'orbit pitch clamps above the horizon');
  assert(ORBIT_POLAR_MIN < ORBIT_POLAR_MAX && ORBIT_POLAR_MIN > 0 && ORBIT_POLAR_MAX < Math.PI / 2);
  console.log('Camera: plain left-drag orbit preserves distance, 360° azimuth, 0.16–1.46 rad polar; head look +10/−15° pitch, ±80° yaw.');
}

// ---------------------------------------------------------------- terrain
{
  const terrainLevel = buildBeijingLevel();
  const centerHeight = trainingTerrainHeight(TRAINING_TERRAIN.centerX, TRAINING_TERRAIN.centerY);
  assert(centerHeight > 0.2, `terrain centre must be raised, got ${centerHeight}`);
  assert.equal(trainingTerrainHeight(TRAINING_TERRAIN.centerX - TRAINING_TERRAIN.width, TRAINING_TERRAIN.centerY), 0, 'terrain edge blends to flat ground');
  const gradient = trainingTerrainGradient(TRAINING_TERRAIN.centerX, TRAINING_TERRAIN.centerY);
  assert(Number.isFinite(gradient.gradeX) && Number.isFinite(gradient.gradeY), 'terrain gradient must be finite');
  assert(isTrainingTerrain(TRAINING_TERRAIN.centerX, TRAINING_TERRAIN.centerY), 'terrain sample point is inside');
  let varied = false;
  for (let i = 0; i < 20; i++) {
    const y = TRAINING_TERRAIN.centerY - 300 + i * 30;
    if (Math.abs(trainingTerrainHeight(TRAINING_TERRAIN.centerX, y) - centerHeight) > 0.02) varied = true;
  }
  assert(varied, 'terrain must contain undulations/potholes, not one flat plane');
  const branch = terrainLevel.roadSurfaces.find(road => road.x === 16300 && road.y === 19315);
  assert(branch, 'visible gravel branch must connect the training lot to the heightfield');
  assert(terrainLevel.streetSigns?.some(sign => sign.label.includes('非铺装')), 'navigable off-road entry sign must exist');
  assert(terrainLevel.terrainZones?.some(zone => zone.label.includes('非铺装')), 'minimap terrain zone must exist');
  let maxGrade = 0;
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let iy = 0; iy < 20; iy++) for (let ix = 0; ix < 20; ix++) {
    const x = TRAINING_TERRAIN.centerX - TRAINING_TERRAIN.width / 2 + (ix + 0.5) * TRAINING_TERRAIN.width / 20;
    const y = TRAINING_TERRAIN.centerY - TRAINING_TERRAIN.length / 2 + (iy + 0.5) * TRAINING_TERRAIN.length / 20;
    const h = trainingTerrainHeight(x, y);
    minHeight = Math.min(minHeight, h);
    maxHeight = Math.max(maxHeight, h);
    const g = trainingTerrainGradient(x, y);
    maxGrade = Math.max(maxGrade, Math.hypot(g.gradeX, g.gradeY));
  }
  assert(maxGrade >= 0.05, `terrain must expose a real 5%+ grade, got ${maxGrade}`);
  assert(maxHeight - minHeight > 1.0, 'terrain must contain metre-scale relief, not a flat slab');
  const gate = terrainLevel.obstacles.filter(obstacle => obstacle.id.startsWith('terrain-gate-') && obstacle.type === 'box');
  assert(gate.length === 2, 'narrow gate must have two static blocks');
  const gap = Math.abs(Math.abs(gate[0].x - gate[1].x) - (gate[0].width + gate[1].width) / 2);
  assert(gap <= 32 && gap >= 28, `terrain gate must be about 3 m wide, got ${gap}`);
  assert(gate.every(block => block.width <= 12), 'terrain gate blocks must be low/1 m stone bollards, not 6 m walls');
  assert(gate.every(block => Math.abs((block.elevation ?? 0) - trainingTerrainHeight(block.x-15000, block.y-15000)) < 0.15), 'terrain gate collision base must match visible terrain height');
  assert(gate.every(block => (block.verticalHeight ?? 0) >= block.width), 'static gate vertical extent must match box height');
  assert(!(terrainLevel.curbSegments ?? []).some(curb => curb.x > 1180 && curb.x < 1420 && curb.y > 3930 && curb.y < 4690), 'training branch curb must be open');
  {
    const directional = terrainLevel.slopeZones?.find(zone => zone.directional);
    assert(directional, 'directional slope fixture must exist');
    const surface = sampleTerrainSurface(terrainLevel, directional.x, directional.y, 0);
    assert(surface.height > 1, 'a vehicle turning on a directional slope must retain its support height');
  }
  for (const edge of [0, 0.5, 1]) {
    const h = trainingTerrainHeight(1480 + edge * 40, 5000);
    assert(Number.isFinite(h), 'terrain contact sampling continuous');
  }
  // Exercise the same spatial index/candidate path as GameCanvas.
  const gateGrid = buildCollisionGrid(terrainLevel.obstacles);
  const gateCandidates = queryCollisionGrid(gateGrid, gate[0].x, gate[0].y, 80);
  assert(Array.from(gateCandidates).some(obs => obs.id === gate[0].id), 'static gate box must be indexed as a kinematic candidate');
  assert(isStaticCollisionCandidate(gate[0]), 'non-movable gate box is a static collision candidate');
  const movingBox = { ...gate[0], id:'moving-box-test', movable:true };
  assert(!isStaticCollisionCandidate(movingBox), 'movable box must not be indexed as a static wall');
  assert(!Array.from(gateCandidates).some(obs => obs.movable && (obs.type === 'box' || obs.type === 'cone')), 'movable props must stay out of the static grid');
  const gateBody = { x: gate[0].x, y: gate[0].y, length: 40, width: 20, rotation: 0, elevation: gate[0].elevation ?? 0, verticalHeight: 15 };
  const gateHit = Array.from(gateCandidates).some(obs =>
    obs.type === 'box'
    && vehicleLayersCompatible(gateBody, obs)
    && checkVehicleRectCollision(gateBody, { x: obs.x, y: obs.y, width: obs.width, height: obs.height, rotation: obs.rotation })
  );
  assert(gateHit, 'same indexed candidate path must reject a car overlapping the terrain gate');
  const terrainBuildings = terrainLevel.obstacles.filter(obstacle => obstacle.id.startsWith('bj-building') && isTrainingTerrain(obstacle.x, obstacle.y));
  assert.equal(terrainBuildings.length, 0, 'terrain pad must not be placed inside a building');
  console.log(`Terrain: centre ${centerHeight.toFixed(2)}u, relief ${(maxHeight-minHeight).toFixed(2)}u, max grade ${(maxGrade*100).toFixed(1)}%, 3m gate, gravel entry + pothole field.`);
}

// ---------------------------------------------------------------- audio lifecycle
{
  const lifecycle = { uiPaused: false, windowFocused: true, pageHidden: false };
  assert(isRecordingAudible({ enabled: true, paused: false }, lifecycle), 'audio audible when enabled/focused');
  assert(!isRecordingAudible({ enabled: true, paused: false }, { ...lifecycle, windowFocused: false }), 'blur must mute');
  assert(!isRecordingAudible({ enabled: true, paused: false }, { ...lifecycle, pageHidden: true }), 'hidden tab must mute');
  assert(!isRecordingAudible({ enabled: true, paused: false }, { ...lifecycle, uiPaused: true }), 'UI pause must mute');
  assert(!isRecordingAudible({ enabled: false, paused: false }, lifecycle), 'disabled audio must mute');
  setRecordingAudioFocus(false, false);
  setRecordingAudioPaused(false);
  assert.equal(getRecordingLifecycle().windowFocused, false, 'blur state persists across update frames');
  setRecordingAudioFocus(true, false);
  setRecordingAudioVisibility(true);
  setRecordingAudioFocus(false, true);
  assert.equal(getRecordingLifecycle().pageHidden, true, 'visibility state persists');
  setRecordingAudioFocus(true, false);
  setRecordingAudioPaused(true);
  assert.equal(getRecordingLifecycle().uiPaused, true, 'UI pause is persistent');
  setRecordingAudioPaused(false);
  setRecordingAudioVisibility(false);
  disposeRecordingAudio();
  assert.equal(shouldCommitAudioLoad(0), false, 'stale async audio load must not commit after dispose');
  console.log('Audio lifecycle: persistent blur/visibility/UI pause, stale-load generation guard.');
}

// ---------------------------------------------------------------- local audio assets
{
  const names = ['engine-idle-loop.wav','engine-load-loop.wav','road-loop.wav','gravel-loop.wav','skid-loop.wav','metal-hit-1.wav','metal-hit-2.wav'];
  for (const name of names) {
    const bytes = await readFile(new URL(`../public/audio/${name}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', `${name} must be WAV`);
    assert.equal(bytes.toString('ascii', 8, 12), 'WAVE', `${name} must be WAVE`);
    assert(bytes.readUInt32LE(24) === 48000, `${name} sample rate 48k`);
    assert(bytes.length > 10000, `${name} must contain real decoded audio`);
    const sampleCount = (bytes.length - 44) / 2;
    let peak = 0;
    for (let i = 0; i < sampleCount; i++) peak = Math.max(peak, Math.abs(bytes.readInt16LE(44 + i * 2)));
    assert(peak < 32767, `${name} must stay below 0 dBFS`);
    if (name.endsWith('-loop.wav')) {
      assert.equal(bytes.readInt16LE(44), 0, `${name} start sample must be a zero crossing/de-click`);
      assert.equal(bytes.readInt16LE(44 + (sampleCount - 1) * 2), 0, `${name} end sample must be a zero crossing/de-click`);
    }
  }
  console.log(`Audio assets: ${names.length} local CC0-derived WAV files, zero-crossing loop endpoints, peaks below 0 dBFS.`);
}

// ---------------------------------------------------------------- suspension dt / travel
{
  const responseByCar = new Map<CarType, number[]>();
  for (const carType of Object.values(CarType)) {
    const spec = suspensionForCar(carType);
    const responses = [15, 30, 60, 120].map(fps => simulateSuspensionBump(spec, fps, 7));
    responses.forEach(response => {
      assert(response.maxTravel <= spec.travel + 1e-6, `${carType}: wheel travel must stay within ${spec.travel}`);
      assert(Number.isFinite(response.finalOffset) && response.finalOffset < spec.travel, `${carType}: suspension must decay`);
      assert(Number.isFinite(response.maxPitch) && Number.isFinite(response.maxRoll) && Number.isFinite(response.maxHeave), `${carType}: body attitude must be finite`);
      assert(response.maxPitch < 0.35 && response.maxRoll < 0.35, `${carType}: body attitude must stay bounded`);
    });
    const peaks = responses.map(response => response.maxTravel);
    const spread = Math.max(...peaks) - Math.min(...peaks);
    assert(spread < Math.max(0.02, Math.max(...peaks) * 0.25), `${carType}: suspension peak must be stable at 15/30/60/120 Hz (${peaks.map(v=>v.toFixed(3)).join('/')})`);
    responseByCar.set(carType, peaks);
    const strong = simulateSuspensionBump(spec, 60, 8);
    assert(strong.maxTravel <= spec.travel + 1e-6, `${carType}: high-speed bump must be travel-limited`);
  }
  const baseSpec = suspensionForCar(CarType.SEDAN);
  const heavySpec = { ...baseSpec, massKg: baseSpec.massKg * 1.7 };
  const lightResponse = simulateSuspensionBump(baseSpec, 60, 7);
  const heavyResponse = simulateSuspensionBump(heavySpec, 60, 7);
  assert(Math.abs(lightResponse.maxTravel - heavyResponse.maxTravel) > 0.001, 'mass must change the wheel response');
  const slowResponse = simulateSuspensionBump(baseSpec, 60, 3);
  const fastResponse = simulateSuspensionBump(baseSpec, 60, 9);
  assert(Math.abs(slowResponse.maxTravel - fastResponse.maxTravel) > 0.001, 'same bump at different speed must change response');
  assert(Math.max(lightResponse.maxTravel, heavyResponse.maxTravel, slowResponse.maxTravel, fastResponse.maxTravel) <= baseSpec.travel + 1e-6, 'mass/speed responses must be travel-limited');
  assert(new Set([...responseByCar.values()].map(peaks => peaks[2].toFixed(3))).size > 1, 'different cars must have different suspension response');
  // Analytic vs 80×100 mesh interpolation must be bounded for the visible potholes.
  let meshError = 0;
  for (let i = 0; i < 200; i++) {
    const x = TRAINING_TERRAIN.centerX - 200 + (i % 20) * 20;
    const y = TRAINING_TERRAIN.centerY - 300 + Math.floor(i / 20) * 35;
    meshError = Math.max(meshError, Math.abs(trainingTerrainHeight(x, y) - trainingTerrainMeshHeight(x, y)));
  }
  assert(meshError < 0.10, `analytic/mesh terrain interpolation error ${meshError.toFixed(3)}u must be bounded`);
  console.log(`Suspension: 15/30/60/120 Hz peaks ${[...responseByCar.values()].map(p=>p[2].toFixed(3)).join('/')} by car; mesh error <=${meshError.toFixed(3)}u.`);
}

// ---------------------------------------------------------------- all-car actual hood/frame geometry
{
  const counts: string[] = [];
  for (const carType of Object.values(CarType)) {
    if (isAuthoredVehicle(carType)) {
      // The authored GLBs are covered by the dedicated native-rig block
      // below (closed shell, real interior, wheels and collision), not by the
      // legacy GLB paint-classifier audit written for the old placeholder
      // assets.
      counts.push(`${carType}:native-authored`);
      continue;
    }
    const audit = await auditCarGeometry(carType);
    assert(audit.hood > 0, `${carType}: actual transformed paint must yield hood triangles, got ${audit.hood}`);
    assert(audit.frame > 0, `${carType}: actual transformed paint must yield frame triangles, got ${audit.frame}`);
    const profile = cockpitProfileFor(carType);
    if (profile.calibrateCowlToHood) {
      assert(audit.hoodRearY !== null && audit.hoodRearZ !== null, `${carType}: actual hood rear must be measurable`);
      const layout = calibrateCowlProfile(profile, audit.hoodRearY, audit.hoodRearZ);
      assert(layout.dashFrontYRatio >= audit.hoodRearY - 0.01 && layout.dashFrontYRatio <= audit.hoodRearY + 0.02,
        `${carType}: dash front must slightly overlap actual hood rear`);
      assert(Math.abs(layout.dashFrontZRatio - audit.hoodRearZ) < 0.035, `${carType}: dash front z must overlap actual hood rear`);
    }
    counts.push(`${carType}:${audit.hood}/${audit.frame}`);
  }
  console.log(`Cockpit source audit (hood/frame): ${counts.join(' ')}.`);
}

// ---------------------------------------------------------------- round 6 keyboard pedals
{
  assert.deepEqual(resolveKeyboardPedals(false, false, false), { gasPressed: false, shiftPressed: false, throttle: 0, brake: 0 });
  assert.deepEqual(resolveKeyboardPedals(true, false, false), { gasPressed: true, shiftPressed: false, throttle: KEYBOARD_LIGHT_THROTTLE, brake: 0 });
  assert.deepEqual(resolveKeyboardPedals(true, false, true), { gasPressed: true, shiftPressed: true, throttle: KEYBOARD_SHIFT_THROTTLE, brake: 0 });
  assert.deepEqual(resolveKeyboardPedals(false, true, false), { gasPressed: false, shiftPressed: false, throttle: 0, brake: KEYBOARD_LIGHT_BRAKE });
  assert.deepEqual(resolveKeyboardPedals(false, true, true), { gasPressed: false, shiftPressed: true, throttle: 0, brake: KEYBOARD_HARD_BRAKE });
  // Brake priority, Shift release, and W+S combinations.
  assert.equal(resolveKeyboardPedals(true, true, false).brake, KEYBOARD_LIGHT_BRAKE);
  assert.equal(resolveKeyboardPedals(true, true, false).gasPressed, false);
  assert.equal(resolveKeyboardPedals(true, false, true).throttle, 0.30);
  assert.equal(resolveKeyboardPedals(true, false, false).throttle, 0.15);
  assert.equal(shouldHandleHandbrakeKey(true, false, false), true, 'Space owns handbrake in active gameplay');
  assert.equal(shouldHandleHandbrakeKey(true, false, true), false, 'Space stays native in editable fields');
  assert.equal(shouldHandleHandbrakeKey(true, true, false), false, 'paused/settings keep native button Space');
  assert.equal(shouldHandleHandbrakeKey(false, false, false), false, 'main menu keeps native button Space');
  assert.equal(heldKeyboardHandbrake(true), true, 'press holds the handbrake');
  assert.equal(heldKeyboardHandbrake(false), false, 'release lets go of the handbrake');
  console.log(`Keyboard pedals: W=${KEYBOARD_LIGHT_THROTTLE} Shift+W=${KEYBOARD_SHIFT_THROTTLE} S=${KEYBOARD_LIGHT_BRAKE} Shift+S=${KEYBOARD_HARD_BRAKE}, brake priority; Space handbrake priority.`);
}

// ---------------------------------------------------------------- dynamic pitch / fps
{
  const run = (fps: number, measuredG: number) => {
    let g = 0; let pitch = 0;
    const frameFrames = 60 / fps;
    for (let i = 0; i < fps; i++) {
      g = filterLongitudinalAccel(g, measuredG, frameFrames);
      pitch = stepDynamicPitch(pitch, dynamicPitchTargetRad(g), frameFrames);
    }
    return { g, pitch };
  };
  const light = [30, 60, 120].map(fps => run(fps, 0.20));
  const heavy = [30, 60, 120].map(fps => run(fps, -0.95));
  light.forEach(v => assert(Math.abs(v.pitch) < 0.025, 'light throttle pitch must stay small'));
  heavy.forEach(v => assert(v.pitch > 0.02 && v.pitch < 0.051, 'heavy braking pitch must be visible but bounded'));
  assert(Math.max(...light.map(v => v.g)) - Math.min(...light.map(v => v.g)) < 0.01, 'pitch filter 30/60/120 Hz convergence');
  assert(Math.max(...heavy.map(v => v.pitch)) - Math.min(...heavy.map(v => v.pitch)) < 0.005, 'dynamic pitch 30/60/120 Hz convergence');
  console.log('Pitch: light<0.025rad, heavy 0.02..0.051rad, 30/60/120 Hz convergent.');
}

// ---------------------------------------------------------------- static NPCs / bridge
{
  const level = buildBeijingLevel();
  assert(!level.obstacles.some(obs => obs.type === 'car' && obs.ai), 'no moving/AI NPC cars remain');
  const staticCars = level.obstacles.filter(obs => obs.type === 'car' && !obs.ai);
  assert(staticCars.length > 0, 'fixed NPC cars must still exist');
  assert(level.elevatedRoads?.length, 'bridge deck definition must exist');
  const bridge = level.elevatedRoads![0];
  const deck = elevatedRoadProfile(bridge, bridge.x, bridge.y)!;
  assert.equal(deck.height, bridge.deckHeight, 'deck centre is at deck height');
  assert(bridge.deckHeight >= 60 && bridge.deckHeight > CAR_MODELS[CarType.TRUCK].height, 'bridge clearance must exceed the tallest training vehicle');
  const under = sampleElevatedRoad(level.elevatedRoads, bridge.x, bridge.y, 0);
  assert.equal(under, null, 'ground layer keeps underpass free of deck height');
  const onDeck = sampleElevatedRoad(level.elevatedRoads, bridge.x, bridge.y, bridge.deckHeight)!;
  assert.equal(onDeck.height, bridge.deckHeight, 'deck layer samples deck height');
  for (const point of DRIVING_TEST_POINTS.filter(p => p.id === 'slope-up' || p.id === 'slope-down')) {
    const profile = elevatedRoadProfile(bridge, point.x, point.y)!;
    assert(Math.abs(profile.height - (point.deckHeight ?? 0)) < 1.0, `${point.id} must be on the real ramp midpoint, got ${profile.height}`);
    assert(profile.height > 20 && profile.height < bridge.deckHeight - 20, `${point.id} must be halfway up/down, not flat entrance or deck`);
  }
  assert(!vehicleLayersCompatible({ x:0,y:0,length:1,width:1,rotation:0,elevation:bridge.deckHeight }, { elevation: 0 }), 'bridge/ground layers are separated');
  const rails = level.obstacles.filter(obs => obs.id.startsWith('challenge-bridge-rail-'));
  assert(rails.length >= 40, 'bridge rails must be segmented along the ramp profile');
  const railHeights = new Set(rails.map(rail => Math.round(rail.elevation || 0)));
  assert(railHeights.size > 3, `bridge ramp rails must follow varying height profile (${[...railHeights].join(',')})`);
  const island = level.obstacles.find(obs => obs.id === 'challenge-roundabout-island')!;
  assert(island.collisionFootprint && island.collisionFootprint.length >= 24, 'roundabout island collision must be a circular polygon, not a 100x100 box');
  assert(Math.abs(Math.max(...island.collisionFootprint!.map(p => Math.hypot(p.x, p.y))) - 193.8) < 0.2, 'island collision radius must match visible 193.8u');
  const piers = level.obstacles.filter(obs => obs.id.startsWith('challenge-pier-'));
  assert(piers.every(pier => pier.width === 22 && (pier.verticalHeight ?? 0) >= 60), 'bridge piers must be 22u wide and span to the deck');
  const deckCar = { x:0,y:0,length:10,width:5,rotation:0,elevation:bridge.deckHeight,verticalHeight:15 };
  const rampRail = { elevation:30, verticalHeight:5 };
  assert(vehicleLayersCompatible({ ...deckCar, elevation:30 }, rampRail), 'ramp rail interval must hit a car on the ramp');
  assert(vehicleLayersCompatible(deckCar, { elevation:65, verticalHeight:5 }), 'deck rail must hit deck car');
  assert(!vehicleLayersCompatible({ ...deckCar, elevation:0 }, { elevation:65, verticalHeight:5 }), 'ground car must pass under deck rail');
  assert(vehicleLayersCompatible({ ...deckCar, elevation:0 }, { elevation:0, verticalHeight:65 }), 'pier must span ground-to-deck');
  const levelAgain = buildBeijingLevel();
  assert.deepEqual(
    levelAgain.obstacles.filter(obs => obs.type === 'car').map(obs => [obs.id, obs.x, obs.y]),
    level.obstacles.filter(obs => obs.type === 'car').map(obs => [obs.id, obs.x, obs.y]),
    'static NPCs must be identical after level rebuild/reset',
  );
  assert(level.terrainZones?.some(zone => zone.label.includes('高架')), 'offline map must include challenge terrain zone');
  console.log(`NPC/bridge: ${staticCars.length} fixed cars; deck ${bridge.deckHeight}u, ${rails.length} profile rails, pier interval 0..${bridge.deckHeight}u; reset positions identical.`);
}

// ---------------------------------------------------------------- movable prop terrain support
{
  const physics = new PhysicsWorld();
  const prop = { id:'terrain-cone-test', type:'cone' as const, x:1500, y:5000, width:4, height:4, rotation:0, movable:true, weight:2, color:'#f00', elevation:17.2 };
  physics.addMovableObstacle(prop);
  for (let i=0;i<30;i++) physics.step(1/60);
  physics.enforceMovableFloor(prop.id, 17.2 + 4);
  const transform = physics.getMovableTransform(prop.id)!;
  assert(transform.y >= 17.2 + 4 - 1e-6, 'dynamic prop must be supported by local terrain/slope height, not Cannon y=0');
  physics.dispose();
  console.log('Movable props: local terrain floor support enforced above Cannon ground plane.');
}

// ---------------------------------------------------------------- airborne/support loss
{
  const normal = detectSupportLoss(17.2, 17.2, 17.05, 17.05);
  assert(!normal.active, 'normal low-speed slope must not launch');
  const front = detectSupportLoss(17, 17, 0, 17);
  const rear = detectSupportLoss(17, 17, 17, 0);
  const both = detectSupportLoss(17, 17, 0, 0);
  assert(front.active && front.pitchSign === 1, 'front leaving edge gives nose-down pitch sign');
  assert(rear.active && rear.pitchSign === -1, 'rear leaving edge gives nose-up pitch sign');
  assert(front.verticalVelocity <= -0.18 && rear.verticalVelocity <= -0.18, 'support loss starts with non-zero downward velocity');
  assert(both.active && both.pitchSign === 0, 'both axles leaving keeps pitch inertia neutral');
  let y = 20, v = -0.2, offset = 0, pitch = 0, pitchV = 0;
  let landed = false;
  for (let i = 0; i < 180 && !landed; i++) {
    const flight = stepAirborne(offset, v, pitch, pitchV, 0, 20, 1);
    offset = flight.offset; v = flight.velocity; pitch = flight.pitch; pitchV = flight.pitchVelocity; landed = flight.landed;
  }
  assert(landed && Math.abs(20 + offset) < 1e-6, 'ballistic body must land on the support surface, not follow low terrain while falling');
  console.log('Airborne: normal slope stays grounded; front/rear edge pitch signs + ballistic landing.');
}

// ---------------------------------------------------------------- curb support
{
  const level = buildBeijingLevel();
  const curb = level.curbSegments![0];
  const top = curbHeightAt(level, curb.x, curb.y);
  assert(Math.abs(top - CURB_HEIGHT) < 1e-6, `visible curb top must enter wheel sampling, got ${top}`);
  const outside = curbHeightAt(level, curb.x - Math.sin(curb.rotation) * (CURB_WIDTH / 2 + 2), curb.y + Math.cos(curb.rotation) * (CURB_WIDTH / 2 + 2));
  assert.equal(outside, 0, 'curb sampling ends outside the visible segment');
  assert(CURB_HEIGHT < 3.0, 'training curbs are low enough to climb, not invisible walls');
  console.log(`Curb: ${CURB_HEIGHT}u top enters wheel sampling; low curb is traversable.`);
}

// ---------------------------------------------------------------- parking feedback
{
  const spot = { id:'p', x:0, y:0, width:60, height:30, rotation:0 };
  const car = { x:0, y:0, rotation:0, width:18, length:45 };
  assert(evaluateParkingSpot(spot, car, 0.1, false).valid, 'centred stationary car must satisfy all-spot parking');
  assert(!evaluateParkingSpot(spot, { ...car, x:40 }, 0.1, false).valid, 'car outside spot must not succeed');
  assert(!evaluateParkingSpot(spot, car, 0.6, false).valid, 'speed >=0.5 km/h must not succeed');
  assert(!evaluateParkingSpot(spot, car, 0.1, true).valid, 'NPC-occupied spot must not succeed');
  assert(!evaluateParkingSpot(spot, { ...car, rotation:0.8 }, 0.1, false).valid, 'partial/angled entry of outside envelope must not succeed');
  assert(evaluateParkingSpot(spot, { ...car, rotation:Math.PI }, 0.1, false).valid, 'ordinary bay accepts the 180° parallel orientation');
  assert(evaluateParkingSpot(spot, { ...car, rotation:Math.PI }, 0.1, false).direction === 'reverse', 'ordinary reverse is reported without a penalty');
  const forwardOnly = { ...spot, requiresDirection:'forward' as const };
  const reverseOnly = { ...spot, requiresDirection:'reverse' as const };
  assert(evaluateParkingSpot(forwardOnly, { ...car, rotation:Math.PI }, 0.1, false).valid === false, 'explicit forward-only task rejects reverse entry');
  assert(evaluateParkingSpot(reverseOnly, { ...car, rotation:Math.PI }, 0.1, false).valid, 'explicit reverse task accepts reverse entry');
  let stable = 0;
  for (let i=0;i<59;i++) stable = accumulateParkingStable(stable, true, 1000/60).stableMs;
  assert(!accumulateParkingStable(stable, true, 1000/60).success, 'parking must not succeed before 1 s');
  assert(accumulateParkingStable(1000, true, 16).success, 'parking succeeds after 1 s stable');
  assert.equal(accumulateParkingStable(500, false, 16).stableMs, 0, 'leaving the box resets stability');
  console.log('Parking: all-four-corners, speed<0.5km/h, no NPC, 1s stability.');
}

// ---------------------------------------------------------------- cockpit material identity
{
  assert.equal(isCockpitGlassMaterial(CarType.SPORTS, 'BodyDoorLWindow', 'Paint 1 Carmine'), false,
    'Concept shared paint on a window-named mesh must not become transparent glass');
  assert.equal(isCockpitGlassMaterial(CarType.SPORTS, 'BodyWindshield', 'Glass'), true,
    'Concept actual KHR transmission glass remains glass');
  assert.equal(isCockpitGlassMaterial(CarType.SEDAN, 'window', 'Material.006'), true,
    'sedan special window material remains classified');
  assert(isConceptCockpitFrameNode('BodyPillars') && isConceptCockpitFrameNode('BodyRoofPanel') && isConceptCockpitFrameNode('BodyHood'), 'Concept real A-pillar/roof/hood nodes must form the frame');
  assert(!isConceptCockpitFrameNode('BodyHoodInterior01') && !isConceptCockpitFrameNode('BodyDoorLWindow'), 'other Concept body nodes must not generate generic frame shards');
  const sedanConfig = CAR_MODELS[CarType.SEDAN];
  const sedanProfile = cockpitProfileFor(CarType.SEDAN);
  const cowl = sedanCowlLayout(sedanConfig, sedanProfile.wheelZRatio, sedanProfile.wheelCenterRatio, 0.72, sedanConfig.height * 0.85, 0.16);
  assert(cowl.frontZ > cowl.wheelZ + cowl.wheelRadius, `cowl must sit behind the wheel disc (${cowl.frontZ} vs ${cowl.wheelZ + cowl.wheelRadius})`);
  assert(cowl.top < cowl.wheelCenterY + 1.25, 'cowl top must not cover the wheel hub/spokes');
  const eyeY = sedanConfig.height * 0.85;
  const hoodRearY = 0.72 * sedanConfig.height;
  const hoodRearZ = 0.16 * sedanConfig.length;
  const hoodScreen = projectCockpitVerticalScreenY(hoodRearY, hoodRearZ, eyeY, 0, 66, 1134);
  const cowlScreen = projectCockpitVerticalScreenY(cowl.top, cowl.z, eyeY, 0, 66, 1134);
  assert(Math.abs(hoodScreen - cowlScreen) < 15, `cowl top must meet hood edge in the eye projection (${hoodScreen.toFixed(1)} vs ${cowlScreen.toFixed(1)}px)`);
  const conceptGlass = new THREE.MeshPhysicalMaterial({ name: 'Glass', transmission: 1, thickness: 0.5, transparent: true });
  applyLowCostConceptGlass(conceptGlass);
  assert.equal(conceptGlass.transmission, 0, 'Concept exterior/mirror glass must not trigger a transmission pass');
  assert.equal(conceptGlass.transparent, true, 'low-cost window must stay transparent');
  assert(conceptGlass.opacity > 0.2 && conceptGlass.opacity < 0.5, 'low-cost window keeps a readable tint');
  console.log('Cockpit materials: paint on window-named Concept meshes stays opaque; only Glass is transparent.');
}

// ---------------------------------------------------------------- rear steer / actual turning geometry
{
  const car = CAR_MODELS[CarType.SEDAN];
  const maxRear = car.dynamics.rearSteerMaxDeg ?? 0;
  const lock = car.dynamics.maxSteerAngle;
  const halfTrack = (car.trackWidth ?? 0) / 2;
  const rear = limitRearAxleSteer(lock, rearSteerAngleForSpeed(maxRear, 0.2, lock, lock), car.wheelbase, halfTrack, maxRear*Math.PI/180);
  const geometry = fourWheelSteeringGeometry(car.wheelbase, halfTrack, lock, rear);
  assert(car.turningRadiusDefinition === 'outer-front-wheel', 'Sea 08 uses the documented game outer-front-wheel interpretation');
  assert(Math.abs(geometry.outerFrontRadius / 10 - 4.95) < 0.08, `outer-front-wheel path must reproduce 4.95m, got ${(geometry.outerFrontRadius/10).toFixed(3)}m`);
  // Actual centre-path trajectory: per-step distance / heading change must
  // equal 1/|q cos beta|, independent of the old misleading 28/tan formula.
  let pose = { x: 0, y: 0, rotation: 0 };
  const step = 0.5;
  for (let i = 0; i < 40; i++) {
    const next = advanceVehicleCenter(pose.x, pose.y, pose.rotation, step, car.wheelbase, lock, car.wheelbase / 2, rear);
    const travelled = Math.hypot(next.x - pose.x, next.y - pose.y);
    const dTheta = Math.abs(next.rotation - pose.rotation);
    const measuredRadius = travelled / Math.max(1e-9, dTheta);
    const expectedRadius = 1 / Math.abs(geometry.q * Math.cos(Math.atan(Math.tan(rear) + (car.wheelbase / 2) * geometry.q)));
    assert(Math.abs(measuredRadius - expectedRadius) < 0.08, `actual centre trajectory radius ${measuredRadius.toFixed(2)} vs ${expectedRadius.toFixed(2)}`);
    pose = next;
  }
  const wheels = fourWheelAckermannAngles(lock, rear, car.wheelbase, halfTrack);
  const geo = fourWheelSteeringGeometry(car.wheelbase, halfTrack, lock, rear);
  const checkTangent = (angle: number, longitudinal: number, lateral: number) => {
    const rx = geo.icrX - longitudinal;
    const ry = geo.icrY - lateral;
    return Math.abs(Math.cos(angle) * rx + Math.sin(angle) * ry) < 1e-8;
  };
  assert(checkTangent(wheels.frontLeft, car.wheelbase, -halfTrack), 'front-left wheel must aim at common ICR');
  assert(checkTangent(wheels.frontRight, car.wheelbase, halfTrack), 'front-right wheel must aim at common ICR');
  assert(checkTangent(wheels.rearLeft, 0, -halfTrack), 'rear-left wheel must aim at common ICR');
  assert(checkTangent(wheels.rearRight, 0, halfTrack), 'rear-right wheel must aim at common ICR');
  for (const steer of [lock, -lock, 0.02, -0.02]) {
    const rearForTurn = limitRearAxleSteer(steer, rearSteerAngleForSpeed(maxRear, 0.2, steer, lock), car.wheelbase, halfTrack, maxRear*Math.PI/180);
    const turn = fourWheelAckermannAngles(steer, rearForTurn, car.wheelbase, halfTrack);
    assert(Math.max(Math.abs(turn.rearLeft),Math.abs(turn.rearRight))<=maxRear*Math.PI/180+1e-7, 'every physical rear wheel stays within the manufacturer 7 degree limit');
    for (const value of Object.values(turn)) {
      assert(Math.abs(value) <= Math.PI / 2 + 1e-9, `wheel angle outside physical range at steer ${steer}: ${value}`);
    }
  }
  // Positive steer = right turn: right wheel is the inner/larger angle;
  // negative steer mirrors that, including the rear pair.
  const rightTurn = fourWheelAckermannAngles(lock, rear, car.wheelbase, halfTrack);
  assert(rightTurn.frontRight > rightTurn.frontLeft, 'positive steer must make right front inner');
  assert(Math.abs(rightTurn.rearRight) > Math.abs(rightTurn.rearLeft), 'positive steer must give right rear the larger counter-phase angle');
  const leftTurn = fourWheelAckermannAngles(-lock, -rear, car.wheelbase, halfTrack);
  assert(leftTurn.frontLeft < leftTurn.frontRight, 'negative steer must make left front inner');
  assert(Math.abs(leftTurn.rearLeft) > Math.abs(leftTurn.rearRight), 'negative steer must give left rear the larger counter-phase angle');
  console.log(`Rear steer: outer-front radius ${(geometry.outerFrontRadius/10).toFixed(2)}m at ${(lock*180/Math.PI).toFixed(2)}° lock, ±${maxRear}° rear; actual trajectory radius tested.`);
}

// ---------------------------------------------------------------- steering continuity
{
  let angle = 0;
  const outbound: number[] = [];
  for (let i = 0; i < 240; i++) {
    angle = applySymmetricSteeringDelta(angle, 0.37, 450, 0.42);
    outbound.push(angle);
  }
  for (let i = 0; i < 240; i++) angle = applySymmetricSteeringDelta(angle, -0.37, 450, 0.42);
  assert(Math.abs(angle) < 1e-8, `equal return input must cross zero and stop at exactly centre, got ${angle}`);
  assert(new Set(outbound.map(value => value.toFixed(6))).size > 200, 'small mouse/keyboard steps must not quantise into 12 detents');
  let crossed = applySymmetricSteeringDelta(0.2, -0.4, 450, 1);
  assert(Math.abs(crossed + 0.2) < 1e-12, 'one delta must pass continuously through zero');
  crossed = applySymmetricSteeringDelta(crossed, 0.4, 450, 1);
  assert(Math.abs(crossed - 0.2) < 1e-12, 'immediate reverse after crossing zero must work');
  assert.equal(autoCenterWheelAngle(CENTER_SNAP_DEG * 0.8, 0, 1), 0, 'sub-degree centre magnet snaps to true zero');
  assert.notEqual(autoCenterWheelAngle(CENTER_SNAP_DEG * 1.5, 0, 1), 0, 'centre magnet must not swallow larger manual corrections');
  assert.equal(KNOB_STEER_STEP_DEG, 12, 'dial detent is small and remains separate from the 12-cell display');
  assert.equal(snapSteeringCenter(0.4, false), 0, 'input-release centre magnet works without speed/auto-centre/knob gates');
  assert.equal(snapSteeringCenter(1.0, false), 0, 'released +1° keyboard nudge snaps to centre');
  assert.equal(snapSteeringCenter(2.0, false), 0, 'released +2° keyboard nudge snaps to centre');
  assert.equal(snapSteeringCenter(-2.0, false), 0, 'released -2° keyboard nudge snaps to centre');
  assert.equal(snapSteeringCenter(2.0, true), 2.0, 'centre magnet never blocks active input crossing');
  assert.equal(snapSteeringCenter(CENTER_SNAP_DEG + 0.4, false), CENTER_SNAP_DEG + 0.4, 'centre magnet does not swallow larger manual corrections');
  console.log('Steering continuity: exact equal-delay return through zero, no 12-step quantisation, input-release 2.2° centre magnet independent of knob/auto-centre.');
// Steering-return clock: only real steering operations may suppress the
// hands-off return. Throttle/gear/camera are not arguments here by design.
{
  const clock = new SteeringActivityClock();
  clock.markSteering(1_000);
  assert.equal(clock.isSteeringActive(1_100, false), true, 'steering grace active after a real steering event');
  assert.equal(clock.isSteeringActive(1_300, false), false, 'steering grace expires after 200ms');
  assert.equal(clock.isSteeringActive(1_300, true), true, 'directly held steering wins regardless of the clock');
  clock.reset();
  assert.equal(clock.isSteeringActive(10_000, false), false, 'reset clears stale steering activity');
  const slow = (() => { let a = 180; for (let i = 0; i < 15; i++) a = autoCenterWheelAngle(a, 0.2, 1, 16); return a; })();
  const fast = (() => { let a = 180; for (let i = 0; i < 15; i++) a = autoCenterWheelAngle(a, 2, 1, 16); return a; })();
  assert(slow < 179 && slow > 5, `low-speed return must be visible, got ${slow}`);
  assert(fast < slow, `road-speed return must be faster than crawl (${fast} vs ${slow})`);
  let crawl = 180; for (let i = 0; i < 2000; i++) crawl = autoCenterWheelAngle(crawl, 0.2, 1, 16);
  assert.equal(crawl, 0, 'low-speed return reaches exact zero');
  console.log(`Steering clock: throttle/gear-independent 200ms grace; 0.24s return crawl ${slow.toFixed(1)}°, road ${fast.toFixed(1)}°.`);
}

}

// ---------------------------------------------------------------- authored GLB native rig + curb contact
{
  const authored = [CarType.SEAL08, CarType.SUV, CarType.SEDAN];
  for (const carType of authored) {
    const cfg = CAR_MODELS[carType];
    const def = MODEL_REGISTRY[CAR_TYPE_TO_MODEL[carType]];
    const file = fsSync.readFileSync(new URL(`../public/models/${def.file}`, import.meta.url));
    const arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    const gltf = await new GLTFLoader().parseAsync(arrayBuffer, '');
    normalizeModel(gltf.scene, def);
    const parts = buildNativeAuthoredVehicle(gltf.scene, cfg);
    assert.equal(parts.wheels.length, 4, `${carType}: four authored rolling wheels`);
    assert.equal(parts.wheelMounts.length, 4, `${carType}: four authored suspension mounts`);
    assert(parts.nativeCockpit, `${carType}: authored driver eye must drive the cockpit camera`);
    assert(parts.extras?.steeringWheels.length === 1, `${carType}: authored steering wheel binding`);
    assert.equal(parts.extras!.steeringWheels[0].axis?.y, 1, `${carType}: Blender Z column converts to glTF local Y`);
    assert(parts.group.getObjectByName('InteriorInstrumentScreen'), `${carType}: authored instrument screen`);
    assert(parts.group.getObjectByName('InteriorSteeringWheel'), `${carType}: authored steering wheel`);
    const rim = parts.group.getObjectByName('InteriorSteeringWheel') as THREE.Mesh;
    const binding = parts.extras!.steeringWheels[0];
    const rimVertices = rim.geometry.getAttribute('position');
    const spin = binding.object;
    parts.group.updateWorldMatrix(true, true);
    // The actual exported torus lies in XZ, with a thin Y cross-section.
    // Its plane must stay fixed while turning; the previous Z axis tumbled it.
    const planeNormal = new THREE.Vector3(0, 1, 0).transformDirection(rim.matrixWorld);
    const planeCenter = rim.getWorldPosition(new THREE.Vector3());
    for (const angle of [0, Math.PI / 3, -Math.PI / 2]) {
      spin.quaternion.setFromAxisAngle(binding.axis!, angle);
      parts.group.updateWorldMatrix(true, true);
      let maxDepth = 0;
      for (let i = 0; i < rimVertices.count; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(rimVertices, i).applyMatrix4(rim.matrixWorld);
        maxDepth = Math.max(maxDepth, Math.abs(vertex.sub(planeCenter).dot(planeNormal)));
      }
      assert(maxDepth < .18, `${carType}: steering rim must rotate in its original plane (${maxDepth})`);
    }
    spin.quaternion.identity();
    parts.group.updateWorldMatrix(true, true);

    assert(parts.group.getObjectByName('InteriorSeatBaseL'), `${carType}: authored driver seat`);
    assert(parts.headlights.length >= 1 && parts.taillights.length >= 1, `${carType}: batched authored lamps bound`);
    assert(parts.leftIndicators.length >= 1 && parts.rightIndicators.length >= 1, `${carType}: authored indicators bound`);
    const size = new THREE.Box3().setFromObject(parts.group, true).getSize(new THREE.Vector3());
    const bodyWidth = new THREE.Box3().setFromObject(parts.group.getObjectByName('Body')!, true).getSize(new THREE.Vector3()).x;
    assert(Math.abs(bodyWidth - cfg.width) < 0.5, `${carType}: body width ${bodyWidth.toFixed(2)} vs ${cfg.width} (official width excludes mirrors)`);
    assert(size.x > bodyWidth && size.x < bodyWidth + 4, `${carType}: mirrors project a realistic distance beyond the body`);
    assert(Math.abs(size.z - cfg.length) < cfg.length * 0.05, `${carType}: authored length ${size.z.toFixed(2)} vs ${cfg.length}`);
    assert(size.y > cfg.height * 0.95 && size.y < cfg.height * 1.08, `${carType}: authored height ${size.y.toFixed(2)} vs ${cfg.height}`);
    const baseY = parts.wheelMounts.map(mount => mount.position.y);
    const radii = parts.wheels.map(wheel => Number(wheel.userData.wheelRadius));
    const wheelbase = Math.abs(
      parts.wheelMounts.filter(m => parts.frontWheels.includes(m)).reduce((sum, m) => sum + m.position.z, 0) / 2
      - parts.wheelMounts.filter(m => !parts.frontWheels.includes(m)).reduce((sum, m) => sum + m.position.z, 0) / 2);
    assert(Math.abs(wheelbase - cfg.wheelbase) < 0.6, `${carType}: authored wheelbase ${wheelbase.toFixed(2)} vs ${cfg.wheelbase}`);
    parts.wheels.forEach((wheel, index) => {
      const box = new THREE.Box3().setFromObject(wheel, true);
      const wheelSize = box.getSize(new THREE.Vector3());
      assert(Math.abs(wheelSize.y - wheelSize.z) < 0.03, `${carType}: wheel ${index} must stay round (${wheelSize.y.toFixed(3)}/${wheelSize.z.toFixed(3)})`);
      assert(wheelSize.x > 2.0, `${carType}: wide car tyre, not a motorcycle tyre (${wheelSize.x.toFixed(2)})`);
      assert(Math.abs(box.min.y) < 0.02, `${carType}: wheel ${index} outer circumference at ground (${box.min.y.toFixed(3)})`);
    });
    const footprint = parts.updateCollisionFootprint!();
    assert(footprint.length >= 4, `${carType}: authored collision hull`);
    const bounds = footprintBounds(footprint);
    assert((bounds.maxX - bounds.minX) > cfg.length * 0.95, `${carType}: collision hull follows nose/tail`);

    // Actual-world curb acceptance: root height from the average support
    // plane, then the live wheel solve. gaps are wheel centre − radius −
    // surface, so positive means the tyre is genuinely floating.
    const spec = suspensionForCar(carType);
    const positions = parts.wheelMounts.map(mount => ({ x: mount.position.x, z: mount.position.z }));
    const settle = (contacts: number[], rootY: number) => {
      const state = createSuspensionState(4);
      let offsets = [0, 0, 0, 0];
      for (let i = 0; i < 720; i++) {
        const desired = parts.wheelMounts.map((mount, index) => requiredWheelOffset(
          contacts[index], rootY, radii[index], baseY[index], mount.position.z, 0,
        ));
        offsets = stepSuspension(state, spec, 1 / 60, desired, positions).offsetsGameUnits;
      }
      parts.group.position.y = rootY;
      parts.wheelMounts.forEach((mount, index) => { mount.position.y = baseY[index] + offsets[index]; });
      parts.group.updateWorldMatrix(true, true);
      return parts.wheels.map((wheel, index) => wheelContactGap(
        wheel.getWorldPosition(new THREE.Vector3()).y, radii[index], contacts[index],
      ));
    };
    // Left pair (indices 0/2) on a 2.6u curb: average support root 1.3u.
    const sideGaps = settle([2.6, 0, 2.6, 0], 1.3);
    assert(Math.max(...sideGaps) < 0.11, `${carType}: two-wheel curb must not float the opposite side (${sideGaps.map(v=>v.toFixed(2)).join('/')})`);
    assert(sideGaps.every(gap => isWheelGroundedByGap(gap)), `${carType}: all four tyres grounded on a one-side curb`);
    // Single corner (front-left) on the same curb: root average 0.65u.
    const cornerGaps = settle([2.6, 0, 0, 0], 0.65);
    assert(Math.max(...cornerGaps) < 0.11, `${carType}: single-corner curb must not float the other tyres (${cornerGaps.map(v=>v.toFixed(2)).join('/')})`);
    assert(cornerGaps.every(gap => isWheelGroundedByGap(gap)), `${carType}: all four tyres grounded on a one-corner curb`);
    console.log(`${carType} authored GLB: ${size.x.toFixed(1)}x${size.z.toFixed(1)}x${size.y.toFixed(1)}u, wheelbase ${wheelbase.toFixed(1)}u, curb gaps side ${sideGaps.map(v=>v.toFixed(2)).join('/')} corner ${cornerGaps.map(v=>v.toFixed(2)).join('/')}.`);
  }
}

// ---------------------------------------------------------------- cockpit frame
{
  for (const car of Object.values(CAR_MODELS)) {
    const cockpit = buildDriverInterior(car).group;
    assert(cockpit.getObjectByName('driver-steering-wheel'), `${car.id}: cockpit adaptation must contain the steering wheel`);
    assert(!cockpit.getObjectByName('driver-hood'), `${car.id}: no fake white hood inside the real-body cockpit`);
    assert(!cockpit.getObjectByName('roof-header'), `${car.id}: no fake rectangular window/roof frame inside the real body`);
    assert(!cockpit.getObjectByName('a-pillar-left'), `${car.id}: no duplicate fake A-pillar inside the real body`);
  }
  const sedan = CAR_MODELS[CarType.SEDAN];
  const eye = resolveHoodCameraLocalPose(sedan, DEFAULT_HOOD_CAMERA_ADJUSTMENT);
  assert(cockpitProfileFor(CarType.SEDAN).eyeGlassFraction > 0.4, 'sedan eye is calibrated inside its glass band');
  const tunedPose = resolveHoodCameraLocalPose(sedan, { ...DEFAULT_HOOD_CAMERA_ADJUSTMENT, height: 1.7, forward: 0.8, lateral: 0.4 });
  const adjustedPose = applyCockpitEyeOffset(tunedPose, { x: 0.2, y: -0.3, z: 0.1 });
  assert(Math.abs(adjustedPose.y - tunedPose.y + 0.3) < 1e-9, 'measured eye offset must preserve user height adjustment');
  assert(Math.abs(adjustedPose.z - tunedPose.z - 0.1) < 1e-9, 'measured eye offset must preserve user forward adjustment');
  const calibratedCockpit = buildDriverInterior(sedan).group;
  const wheel = calibratedCockpit.getObjectByName('driver-steering-wheel');
  const dashboard = calibratedCockpit.getObjectByName('driver-dashboard');
  const firewall = calibratedCockpit.getObjectByName('driver-firewall');
  const dashTop = calibratedCockpit.getObjectByName('driver-dashboard-top');
  assert(wheel && dashboard && firewall && dashTop, 'calibrated dashboard/firewall/wheel must exist');
  const spokes = wheel.children.filter(child => child.name === 'driver-steering-wheel-spoke');
  assert.equal(spokes.length, 4, 'steering wheel must have four radial spokes');
  for (const spoke of spokes) {
    const radial = Math.hypot(spoke.position.x, spoke.position.y);
    assert(radial > 0.55, `spoke must start outside hub, centre radius ${radial}`);
    const spokeGeometry = (spoke as THREE.Mesh).geometry;
    if (!spokeGeometry.boundingBox) spokeGeometry.computeBoundingBox();
    const box = spokeGeometry.boundingBox;
    const length = box ? box.max.x - box.min.x : 0;
    assert(length > 0.45, `spoke must span hub-to-rim, got ${length}`);
  }
  // The wedge itself (not just the small cowl) must consume the profile.
  const customProfile = { ...cockpitProfileFor(CarType.SUV), dashFrontYRatio: 0.56, dashFrontZRatio: 0.13 };
  const customInterior = buildDriverInterior(CAR_MODELS[CarType.SUV], customProfile).group;
  const customTop = customInterior.getObjectByName('driver-dashboard-top') as THREE.Mesh | undefined;
  assert(customTop, 'profile-driven dashboard wedge must exist');
  customTop.geometry.computeBoundingBox();
  const topBox = customTop.geometry.boundingBox!;
  assert(Math.abs(topBox.max.z - CAR_MODELS[CarType.SUV].length * 0.13) < 0.05, 'wedge front Z must follow profile, not hardcoded .19');
  assert(Math.abs(topBox.max.y - CAR_MODELS[CarType.SUV].height * 0.56) < 0.05, 'wedge front Y must follow profile, not hardcoded .735');
  assert(Math.abs(wheel.position.y / sedan.height - cockpitProfileFor(CarType.SEDAN).wheelCenterRatio) < 1e-6, 'wheel centre follows cockpit profile');
  assert(wheel.position.y + 1.3 < eye.y, 'upper wheel rim must stay below eye level');
  assert(dashboard.position.y + 0.95 < eye.y, 'dashboard top below eye level');
  {
    const dashBox = new THREE.Box3().setFromObject(dashTop);
    const wheelCentre = wheel.getWorldPosition(new THREE.Vector3());
    assert(wheelCentre.y > dashBox.max.y + 0.10, `wheel hub must sit above the visible dash, centre ${wheelCentre.y.toFixed(2)} vs dash ${dashBox.max.y.toFixed(2)}`);
    const firewallBox = new THREE.Box3().setFromObject(firewall);
    assert(firewallBox.max.y < wheelCentre.y + 0.20, 'firewall must not occlude the wheel hub/spokes');
  }
  assert(firewall.position.y + sedan.height * 0.06 <= wheel.position.y + 0.2, 'firewall must stay below the wheel hub, not form a black occluding wall');
  assert(calibratedCockpit.getObjectByName('driver-door-lining-left'), 'door lining fills lower side void');
  const sedanProfile = cockpitProfileFor(CarType.SEDAN);
  const hoodRearScreen = projectCockpitVerticalScreenY(0.70 * sedan.height, 0.186 * sedan.length, eye.y, eye.z, 66, 1134);
  const dashFrontScreen = projectCockpitVerticalScreenY(Math.min(0.735, 0.57) * sedan.height, 0.19 * sedan.length, eye.y, eye.z, 66, 1134);
  const wheelTopScreen = projectCockpitVerticalScreenY(sedanProfile.wheelCenterRatio * sedan.height + 1.3, sedanProfile.wheelZRatio * sedan.length, eye.y, eye.z, 66, 1134);
  const wheelCenterScreen = projectCockpitVerticalScreenY(sedanProfile.wheelCenterRatio * sedan.height, sedanProfile.wheelZRatio * sedan.length, eye.y, eye.z, 66, 1134);
  assert(Math.abs(hoodRearScreen - dashFrontScreen) < 220, `hood/visible-dash projected gap ${Math.abs(hoodRearScreen-dashFrontScreen).toFixed(1)}px must stay reasonable`);
  assert(wheelTopScreen > 1134 * 0.50 && wheelTopScreen < 1134 * 0.90, `upper wheel rim must be in main lower view, got y=${wheelTopScreen.toFixed(1)}`);
  assert(wheelCenterScreen > 1134 * 0.55 && wheelCenterScreen < 1134 * 0.90, `wheel hub/spokes must be inside viewport, got y=${wheelCenterScreen.toFixed(1)}`);
  // All seven cars: per-car hood/frame profile, eye fraction, dashboard/wheel
  // layout and a wheel rim inside the main viewport. This is a projection and
  // geometry-contract check, not a substitute for a browser screenshot.
  // New fleet uses native Blender interiors, verified separately in round30.
  for (const carType of Object.values(CarType).filter(id=>!(FLEET30_IDS as readonly CarType[]).includes(id))) {
    const car = CAR_MODELS[carType];
    const profile = cockpitProfileFor(carType);
    const interior = buildDriverInterior(car, profile).group;
    const wheelNode = interior.getObjectByName('driver-steering-wheel');
    assert(wheelNode, `${carType}: generic wheel must exist even when the model has one`);
    const eyePose = resolveHoodCameraLocalPose(car, DEFAULT_HOOD_CAMERA_ADJUSTMENT);
    const eyeRatioApprox = eyePose.y / car.height;
    const eyeY = eyePose.y;
    const wheelTop = car.height * profile.wheelCenterRatio + 1.3;
    const screenY = projectCockpitVerticalScreenY(wheelTop, car.length * profile.wheelZRatio, eyeY, 0, 66, 1134);
    assert(screenY > 1134 * 0.55 && screenY < 1134 * 0.95, `${carType}: wheel rim outside main viewport (${screenY.toFixed(0)})`);
    const hoodClass = classifyCockpitPaintTriangle(
      car.width * 0.02 / car.width,
      (profile.hoodYMin + profile.hoodYMax) * 0.5,
      (profile.hoodZMin + profile.hoodZMax) * 0.5,
      0.99, 0.65, 0.96, profile,
    );
    assert.equal(hoodClass, 'hood', `${carType}: per-car hood band must keep real upward paint`);
    assert(profile.wheelCenterRatio < eyeRatioApprox, `${carType}: wheel centre must be below eye`);
    // Real dashboard occlusion contract: at the wheel's depth the tilted
    // dashboard top must be below the rim, and the wheel must be closer to the
    // eye than the windshield base. This catches a wheel that projects onto
    // screen but is physically hidden by the dashboard.
    const wheelRadius = 1.42;
    const wheelZ = car.length * profile.wheelZRatio;
    const dashFrontZ = car.length * profile.dashFrontZRatio;
    const dashRearZ = car.length * profile.dashRearZRatio;
    const dashAtWheelZ = car.height * (
      profile.dashRearYRatio
      + (profile.dashFrontYRatio - profile.dashRearYRatio)
        * Math.min(1, Math.max(0, (wheelZ - dashRearZ) / Math.max(1, dashFrontZ - dashRearZ)))
    );
    assert(car.height * profile.wheelCenterRatio + wheelRadius > dashAtWheelZ,
      `${carType}: upper rim must clear the dashboard at the same depth`);
    assert(wheelZ < dashFrontZ, `${carType}: wheel must be closer to the eye than the dash front`);
  }
  const glassBelt = 9.86 / sedan.height;
  const hoodClass = classifyCockpitPaintTriangle(0.02, 0.70, 0.28, 0.99, glassBelt);
  assert.equal(hoodClass, 'hood', 'measured sedan hood-top band must be kept');
  assert.equal(classifyCockpitPaintTriangle(0.02, 0.40, 0.35, 0.0, glassBelt), 'discard', 'lower front fascia/lamp back must be discarded');
  assert.equal(classifyCockpitPaintTriangle(0.02, 0.70, 0.28, -0.99, glassBelt), 'discard', 'downward hood underside/front nose must be discarded');
  assert.equal(classifyCockpitPaintTriangle(0.20, 0.80, 0.05, 0.30, glassBelt), 'frame', 'inward A-pillar/roof frame must be kept');
  assert.equal(classifyCockpitPaintTriangle(0.35, 0.45, -0.10, 0.10, glassBelt), 'discard', 'lower central/floor shell must be discarded');
  console.log('Cockpit: source geometry classifies measured hood/frame; lower fascia and floor are discarded.');
}

// ---------------------------------------------------------------- parked wheel asset
{
  const parkedWheel = buildWheelAssembly(3.2, 2.8);
  parkedWheel.updateWorldMatrix(true, true);
  const wheelBox = new THREE.Box3().setFromObject(parkedWheel);
  const wheelSize = wheelBox.getSize(new THREE.Vector3());
  assert(Math.abs(wheelSize.y - wheelSize.z) < 0.04,
    `static parked wheel must be circular (${wheelSize.y.toFixed(3)} vs ${wheelSize.z.toFixed(3)})`);
  assert(wheelSize.x > 1.5 && wheelSize.y > 5, 'static parked wheel must have width and diameter');
  const second = buildWheelAssembly(3.2, 2.8);
  assert.equal((parkedWheel.children[0] as THREE.Mesh).geometry,
    (second.children[0] as THREE.Mesh).geometry,
    'static parked wheel must reuse shared tyre geometry');
  const rimBarrel = parkedWheel.getObjectByName('wheel-rim-barrel') as THREE.Mesh<THREE.CylinderGeometry>;
  const spokes = parkedWheel.getObjectByName('wheel-spokes');
  const rimLip = parkedWheel.getObjectByName('wheel-rim-lip');
  assert(rimBarrel && spokes && rimLip, 'wheel must expose open barrel, spokes and rim lip');
  assert((rimBarrel.geometry as any).parameters.openEnded === true, 'rim barrel must be open-ended, not a solid cap');
  console.log(`Parked wheel: static assembly ${wheelSize.x.toFixed(2)}x${wheelSize.y.toFixed(2)}x${wheelSize.z.toFixed(2)}, open 5-spoke rim, shared geometry/material.`);
}

// ---------------------------------------------------------------- marking colour
{
  const tireWear = markingMaterial('#2b2d31');
  const expansionJoint = markingMaterial('#282a2e');
  const white = markingMaterial('#fff');
  const yellow = markingMaterial('#fbbf24');
  assert.equal(tireWear.color.getHexString(), '2b2d31', 'dark tyre-wear marking must keep its authored colour');
  assert.equal(expansionJoint.color.getHexString(), '282a2e', 'expansion-joint colour must not become white');
  assert.notEqual(tireWear.uuid, expansionJoint.uuid, 'different custom marking colours need distinct materials');
  assert.equal(markingMaterial('#2b2d31'), tireWear, 'custom marking materials must be cached by colour');
  assert.notEqual(white.uuid, tireWear.uuid, 'white and custom markings must not share a material');
  assert.notEqual(yellow.uuid, white.uuid, 'yellow and white traffic paint must remain distinct');
  assert.notEqual(markingMaterialKey(tireWear, 3), markingMaterialKey(expansionJoint, 3), 'batch keys must retain actual colour');
  assert.equal(markingMaterialKey(tireWear, 3), markingMaterialKey(markingMaterial('#2b2d31'), 3), 'same colour/order must batch together');
  console.log('Marking colour: dark tyre wear/seams keep authored colours; white/yellow paint remain distinct.');
}

// ---------------------------------------------------------------- HUD layout
for (const viewport of [1153, 1457, 1731, 2007]) {
  assert(firstPersonClusterFits(viewport), `instrument cluster must fit between mirrors at ${viewport}px`);
  assert(firstPersonClusterWidth(viewport) < betweenMirrorsWidth(viewport), `cluster must not cover mirrors at ${viewport}px`);
}
const rootCss = await readFile(new URL('../index.css', import.meta.url), 'utf8');
assert(!/min-width:\s*1180px/.test(rootCss), 'root must not force a 1180px document wider than a 1153px viewport');
assert(!/min-height:\s*700px/.test(rootCss), 'root must not force a 700px minimum height');
console.log(`HUD layout: 1153px -> ${betweenMirrorsWidth(1153).toFixed(1)}px gap, ${firstPersonClusterWidth(1153).toFixed(1)}px cluster; no horizontal root minimum.`);

// ---------------------------------------------------------------- focus guard
assert.equal(isEditableTarget(null), false);
assert.equal(isEditableTarget({ tagName: 'CANVAS' }), false);
assert.equal(isEditableTarget({ tagName: 'BODY' }), false);
assert.equal(isEditableTarget({ tagName: 'INPUT' }), true, 'number/range inputs own their keys');
assert.equal(isEditableTarget({ tagName: 'TEXTAREA' }), true);
assert.equal(isEditableTarget({ tagName: 'SELECT' }), true);
assert.equal(isEditableTarget({ tagName: 'DIV', isContentEditable: true }), true);
assert.equal(isEditableTarget({ tagName: 'SPAN', closest: (selector: string) => selector.includes('contenteditable') ? {} : null }), true);
assert.equal(isEditableTarget({ tagName: 'DIV', closest: () => null }), false);
assert.equal(isEditableTarget({ tagName: 'DIV', getAttribute: (name: string) => name === 'contenteditable' ? 'plaintext-only' : null }), true);
console.log('Focus guard: input/textarea/select/contenteditable isolated; canvas still drives.');

// ------------------------------------------------------------- time responses
const expTwo = approachExponential(100, 0, 0.075, 2);
let expSplit = 100;
expSplit = approachExponential(expSplit, 0, 0.075, 1);
expSplit = approachExponential(expSplit, 0, 0.075, 1);
assert(Math.abs(expTwo - expSplit) < 1e-9, 'exponential response composes across frame rates');
const expOne = approachExponential(100, 0, 0.075, 1);
let expHalf = 100;
expHalf = approachExponential(expHalf, 0, 0.075, 0.5);
expHalf = approachExponential(expHalf, 0, 0.075, 0.5);
assert(Math.abs(expOne - expHalf) < 1e-9, 'two 120 Hz steps equal one 60 Hz step');
assert.equal(approachLinear(0, 10, 2, 5), 10, 'linear ramp never overshoots');
assert.equal(approachLinear(10, 0, 2, 2), 6);
assert.equal(simulationDeltaMs(16.7, false), 16.7);
assert.equal(simulationDeltaMs(40000, false), 0, 'tab-hide gaps are skipped, not caught up');
assert.equal(simulationDeltaMs(16.7, true), 0, 'settings pause consumes no simulation time');
console.log('Time response: exponential/linear steps compose exactly at 30/60/120 fps; pause/gap clock is deterministic.');

// ----------------------------------------------------------- steering plumbing
const smoother = new SteeringInputSmoother(0.45);
smoother.push(100);
let applied = 0;
for (let i = 0; i < 300 && smoother.hasPending(); i++) applied += smoother.take(1);
assert(Math.abs(applied - 100) < 1e-6, 'smoothed input preserves the full mouse displacement');

const smooth60 = new SteeringInputSmoother(0.45);
const smooth30 = new SteeringInputSmoother(0.45);
const smooth120 = new SteeringInputSmoother(0.45);
smooth60.push(90); smooth30.push(90); smooth120.push(90);
const a60 = smooth60.take(1);
const a60TwoPumps = a60 + smooth60.take(1);
const a30 = smooth30.take(2);
const a120HalfA = smooth120.take(0.5);
const a120HalfB = smooth120.take(0.5);
assert(Math.abs(a60TwoPumps - a30) < 1e-9, '30 fps smoothing advances like two 60 fps pumps');
assert(Math.abs(a60 - (a120HalfA + a120HalfB)) < 1e-9, '120 fps smoothing advances like one 60 fps pump');

const quickFlick = new SteeringInputSmoother(0.3);
quickFlick.push(40);
const firstSlice = quickFlick.take(1);
const flushed = quickFlick.flush();
assert(Math.abs(firstSlice + flushed - 40) < 1e-6, 'mouse-up flush retains the pending flick');
const fallbackKeys: string[] = [STEER_LEFT_KEY, STEER_RIGHT_KEY];
for (const key of fallbackKeys) {
  assert(!['a', 'd', 'arrowleft', 'arrowright'].includes(key), `steering fallback ${key} must not use gear keys`);
}
assert(KEYBOARD_STEER_DELTA_PER_FRAME > 0);

assert.equal(speedSteeringFactor(0), 1, 'full mechanical lock at parking speed');
assert(speedSteeringFactor(120 / 15) < 0.5, 'high speed allowed lock is reduced');
assert.equal(effectiveSteeringWheelMaxDeg(CAR_MODELS[CarType.SEDAN], 0), effectiveSteeringWheelMaxDeg(CAR_MODELS[CarType.SEDAN], 120 / 15), 'full mechanical wheel travel at every speed');
let drift = 0;
for (let i = 0; i < 30; i++) drift = driftSlipStep(drift, 6, 0.2, true, 0.3, 1);
assert(drift > 0.03 && drift <= 0.22, `handbrake high-speed steer should build bounded slip, got ${drift}`);
for (let i = 0; i < 240; i++) drift = driftSlipStep(drift, 6, 0, false, 0.3, 1);
assert(Math.abs(drift) < 1e-3, 'releasing the drift input recovers to zero slip');
assert.equal(driftSlipStep(0, 1, 0.3, true, 0.3, 1), 0, 'low-speed handbrake does not trigger drift');

assert.equal(autoCenterWheelAngle(180, 0, 1), 180, 'parking speed keeps the steering angle');
assert.equal(autoCenterWheelAngle(180, 2, 0), 180, 'auto-centre can be disabled');
const returning = autoCenterWheelAngle(180, 2, 1);
assert(returning > 0 && returning < 180, 'hands-off return moves toward centre');
let centred = 180;
for (let i = 0; i < 2000; i++) centred = autoCenterWheelAngle(centred, 2, 1);
assert.equal(centred, 0, 'hands-off return reaches exactly zero');
console.log('Steering: displacement-preserving smoothing, flush, auto-centre and non-conflicting key fallback.');

// --------------------------------------------------------- steering directions
const sedan = CAR_MODELS[CarType.SEDAN];
const positiveArc = advanceVehicleCenter(0, 0, 0, 40, sedan.wheelbase, 0.35);
const negativeArc = advanceVehicleCenter(0, 0, 0, 40, sedan.wheelbase, -0.35);
// With map +x east and +y south, positive steer is a right-hand arc.
assert(positiveArc.y > 0.5, `positive steer must curve right, y=${positiveArc.y}`);
assert(negativeArc.y < -0.5, `negative steer must curve left, y=${negativeArc.y}`);
assert(Math.abs(positiveArc.y + negativeArc.y) < 1e-9, 'left and right arcs are symmetric');
assert(driverWheelRotationZ(90) > 0 && driverWheelRotationZ(-90) < 0,
  'driver wheel: positive/right input must rotate clockwise (positive local Z)');
assert(Math.abs(driverWheelRotationZ(90) - Math.PI / 2) < 1e-12, 'driver wheel angle converts degrees to radians once');
const reversePositiveArc = advanceVehicleCenter(0, 0, 0, -40, sedan.wheelbase, 0.35);
const reverseNegativeArc = advanceVehicleCenter(0, 0, 0, -40, sedan.wheelbase, -0.35);
assert(reversePositiveArc.rotation < 0 && reverseNegativeArc.rotation > 0, 'reverse flips the heading change');
assert(reversePositiveArc.y > 0.5 && reverseNegativeArc.y < -0.5, 'reverse left/right mirror each other');
const returnedArc = advanceVehicleCenter(positiveArc.x, positiveArc.y, positiveArc.rotation, -40, sedan.wheelbase, 0.35);
assert(Math.hypot(returnedArc.x, returnedArc.y) < 1e-8, 'forward then reverse steering returns exactly to the start');
console.log(`Steering arcs: right y=${positiveArc.y.toFixed(2)}, left y=${negativeArc.y.toFixed(2)}, reverse-right y=${reversePositiveArc.y.toFixed(2)}; driver wheel sign correct.`);

// ---------------------------------------------------------------- gear refusal
const sedanSpec = getPowertrain(CarType.SEDAN);
assert.equal(gearRejectionReason(sedanSpec, 1, -1), null);
assert.equal(gearRejectionReason(sedanSpec, -1, 1), null);
assert.equal(gearRejectionReason(sedanSpec, 999, 1), null, 'high-speed downshift is allowed with warning, not blocked');
assert.equal(gearRejectionReason(sedanSpec, 0, 6), 'invalid-gear');
assert.equal(gearRejectionReason(sedanSpec, 0, 1), null);
assert.equal(canSelectGear(sedanSpec, 1, -1), true);
assert.equal(canSelectGear(sedanSpec, 0, -1), true);
console.log('Gear guard: rolling direction requests accepted; high downshift emits warning without clamping speed.');

// ------------------------------------------------------- longitudinal scenarios
const baseContext = (carId: CarType, overrides: Partial<LongitudinalContext> = {}): LongitudinalContext => {
  const cc = CAR_MODELS[carId];
  return {
    carId,
    cc,
    pt: getPowertrain(carId),
    vehicleTune: { ...DEFAULT_VEHICLE_TUNING[carId] },
    weatherGrip: 1,
    slopeAlongCar: 0,
    tunedShiftFrames: Math.max(4, getPowertrain(carId).shiftFrames),
    elapsedFrames: 1,
    ...overrides,
  };
};
const idleInputs: LongitudinalInputs = {
  gear: 1, engineStarted: true, gasPressed: false, shiftPressed: false,
  throttle: 0, brake: 0, handbrake: false,
};

function runFrames(
  fps: number,
  seconds: number,
  inputs: LongitudinalInputs,
  ctx: LongitudinalContext,
  initial: LongitudinalState = createLongitudinalState(0),
): LongitudinalState & { stalled: boolean } {
  const calls = Math.round(seconds * fps);
  const elapsedFrames = 60 / fps;
  let state = initial;
  let stalled = false;
  for (let i = 0; i < calls; i++) {
    const result = stepLongitudinal(state, inputs, { ...ctx, elapsedFrames });
    stalled ||= result.stalled;
    state = result;
  }
  return { ...state, stalled };
}

const throttleInputs: LongitudinalInputs = { ...idleInputs, throttle: 1.0 };
const speed30 = runFrames(30, 3, throttleInputs, baseContext(CarType.SEDAN)).speed;
const speed60 = runFrames(60, 3, throttleInputs, baseContext(CarType.SEDAN)).speed;
const speed120 = runFrames(120, 3, throttleInputs, baseContext(CarType.SEDAN)).speed;
const speed15 = runFrames(15, 3, throttleInputs, baseContext(CarType.SEDAN)).speed;
assert(Math.abs(speed30 - speed60) < 0.002, `30/60 throttle mismatch ${speed30} vs ${speed60}`);
assert(Math.abs(speed120 - speed60) < 0.002, `120/60 throttle mismatch ${speed120} vs ${speed60}`);
assert(Math.abs(speed15 - speed60) < 0.002, `15/60 throttle mismatch ${speed15} vs ${speed60}`);
console.log(`Longitudinal throttle 3 s: 15fps=${speed15.toFixed(4)}, 30=${speed30.toFixed(4)}, 60=${speed60.toFixed(4)}, 120=${speed120.toFixed(4)} speed units`);

function runDistance(
  fps: number,
  seconds: number,
  inputs: LongitudinalInputs,
  ctx: LongitudinalContext,
): { state: LongitudinalState; distance: number } {
  const calls = Math.round(seconds * fps);
  const elapsedFrames = 60 / fps;
  let state = createLongitudinalState(0);
  let distance = 0;
  for (let i = 0; i < calls; i++) {
    const startSpeed = state.speed;
    state = stepLongitudinal(state, inputs, { ...ctx, elapsedFrames });
    // Same average-speed distance integration the render loop uses.
    distance += ((startSpeed + state.speed) * 0.5) * elapsedFrames * TRAVEL_PER_SPEED_FRAME;
  }
  return { state, distance };
}
const travel30 = runDistance(30, 3, throttleInputs, baseContext(CarType.SEDAN));
const travel60 = runDistance(60, 3, throttleInputs, baseContext(CarType.SEDAN));
const travel120 = runDistance(120, 3, throttleInputs, baseContext(CarType.SEDAN));
assert(Math.abs(travel30.distance - travel60.distance) < travel60.distance * 0.005, `30/60 distance mismatch ${travel30.distance} vs ${travel60.distance}`);
assert(Math.abs(travel120.distance - travel60.distance) < travel60.distance * 0.005, `120/60 distance mismatch ${travel120.distance} vs ${travel60.distance}`);
console.log(`Travel distance 3 s: 30fps=${travel30.distance.toFixed(3)}, 60=${travel60.distance.toFixed(3)}, 120=${travel120.distance.toFixed(3)} world units`);

// Integrated render-loop continuity: variable frame dt -> fixed 60 Hz
// accumulator -> average-speed position integration, not just one helper call.
const runAccumulatedDrive = (fps: number, jitter: number) => {
  const ctx = baseContext(CarType.SEDAN);
  let state = createLongitudinalState(0);
  let pendingFrames = 0;
  let distance = 0;
  let maxSpeedStep = 0;
  let maxPositionStep = 0;
  const frames = Math.round(3 * fps);
  const baseMs = 1000 / fps;
  for (let i = 0; i < frames; i++) {
    const frameMs = baseMs * (1 + jitter * Math.sin(i * 1.7 + 0.4));
    const frameScale = frameMs / (1000 / 60);
    pendingFrames += frameScale;
    const steps = Math.floor(pendingFrames + 1e-9);
    pendingFrames -= steps;
    const startSpeed = state.speed;
    for (let step = 0; step < steps; step++) {
      state = stepLongitudinal(state, throttleInputs, { ...ctx, elapsedFrames: 1 });
    }
    const endSpeed = state.speed;
    const averageSpeed = (startSpeed + endSpeed) / 2;
    const positionStep = Math.abs(averageSpeed) * TRAVEL_PER_SPEED_FRAME * frameScale;
    distance += positionStep;
    maxSpeedStep = Math.max(maxSpeedStep, Math.abs(endSpeed - startSpeed));
    maxPositionStep = Math.max(maxPositionStep, positionStep);
  }
  return { distance, speed: state.speed, maxSpeedStep, maxPositionStep };
};
const accumulated = [15, 30, 60, 120].map(fps => runAccumulatedDrive(fps, 0.12));
for (const [index, run] of accumulated.entries()) {
  const fps = [15, 30, 60, 120][index];
  assert(run.speed > 0.8, `${fps}fps integrated drive must keep accelerating`);
  assert(run.distance > 40, `${fps}fps integrated drive must make continuous forward progress`);
  assert(run.maxSpeedStep < 1.5, `${fps}fps speed step is bounded (${run.maxSpeedStep.toFixed(3)})`);
  assert(run.maxPositionStep < 12, `${fps}fps position step is bounded (${run.maxPositionStep.toFixed(3)})`);
  assert(Math.abs(run.distance - travel60.distance) < travel60.distance * 0.03,
    `${fps}fps integrated distance ${run.distance.toFixed(2)} vs ${travel60.distance.toFixed(2)}`);
}
console.log(`Integrated accumulator (12% jitter): ${accumulated.map((run, i) => `${[15,30,60,120][i]}fps=${run.distance.toFixed(2)}u`).join(', ')}; max single-render step ${Math.max(...accumulated.map(run => run.maxPositionStep)).toFixed(2)}u, max speed step ${Math.max(...accumulated.map(run => run.maxSpeedStep)).toFixed(3)}u.`);

// Low gear must out-climb a tall gear on the shared terrain grade.
{
  const slopeCtx = baseContext(CarType.SEDAN, { slopeAlongCar: 0.18 });
  const low = runFrames(60, 1, { ...throttleInputs, gear: 1 }, slopeCtx, createLongitudinalState(1.2));
  const tall = runFrames(60, 1, { ...throttleInputs, gear: 4 }, slopeCtx, createLongitudinalState(1.2));
  assert(low.speed > tall.speed, `low gear must climb better (${low.speed.toFixed(3)} vs ${tall.speed.toFixed(3)})`);
  console.log(`Terrain grade: 18% slope, 1st speed ${low.speed.toFixed(3)} > 4th ${tall.speed.toFixed(3)} after 1s.`);
}

const brakeInputs: LongitudinalInputs = { ...idleInputs, gear: 0, brake: 1 };
// First-gear take-up must be continuous across both former hard boundaries
// (speed 1.5/2 and throttle 0.05); no duplicated acceleration multipliers.
let previousTakeup = lowSpeedTakeupFactor(-5, 1);
for (let speed = -4.99; speed <= 5.0001; speed += 0.01) {
  const current = lowSpeedTakeupFactor(speed, 1);
  assert(Math.abs(current - previousTakeup) < 0.0032, `first-gear take-up jumps at ${speed.toFixed(2)}: ${previousTakeup} -> ${current}`);
  previousTakeup = current;
}
assert(lowSpeedTakeupFactor(0, -1) > 1, 'reverse gear shares the low-speed take-up');
for (const gear of [2, 3, 4, 5]) assert.equal(lowSpeedTakeupFactor(1.8, gear), 1, 'take-up is first/reverse gear only');
assert(Math.abs(lowSpeedTakeupFactor(5, 1) - 1) < 1e-9, 'take-up fully fades above 3 speed units');
console.log('Torque take-up: continuous first-gear curve across speed 1.5/2 and throttle-independent force.');

const braking30 = runFrames(30, 0.6, brakeInputs, baseContext(CarType.SEDAN), createLongitudinalState(6));
const braking60 = runFrames(60, 0.6, brakeInputs, baseContext(CarType.SEDAN), createLongitudinalState(6));
const braking120 = runFrames(120, 0.6, brakeInputs, baseContext(CarType.SEDAN), createLongitudinalState(6));
assert(Math.abs(braking30.speed - braking60.speed) < 0.01, '30/60 braking agrees');
assert(Math.abs(braking120.speed - braking60.speed) < 0.01, '120/60 braking agrees');
console.log(`Longitudinal braking 0.6 s from 6 units: 30=${braking30.speed.toFixed(4)}, 60=${braking60.speed.toFixed(4)}, 120=${braking120.speed.toFixed(4)}`);

// Flat ground still has no idle creep, without an auto-hold state.
const hold30 = runFrames(30, 8, idleInputs, baseContext(CarType.SEDAN));
const hold60 = runFrames(60, 8, idleInputs, baseContext(CarType.SEDAN));
const hold120 = runFrames(120, 8, idleInputs, baseContext(CarType.SEDAN));
assert.equal(hold30.speed, 0, '30 fps: 8 s in gear without throttle must not creep');
assert.equal(hold60.speed, 0, '60 fps: 8 s in gear without throttle must not creep');
assert.equal(hold120.speed, 0, '120 fps: 8 s in gear without throttle must not creep');
console.log('Flat no-creep: 8 s in gear with no throttle stays exactly at 0 speed (30/60/120 fps).');

// Keyboard light throttle is 15%, Shift+W is 30%, releasing Shift returns to 15%.
const lightInputs: LongitudinalInputs = { ...idleInputs, gasPressed: true };
const lightState = runFrames(60, 1.2, lightInputs, baseContext(CarType.SEDAN));
assert(Math.abs(lightState.throttle - LIGHT_THROTTLE) < 0.01, `light throttle should settle at ${LIGHT_THROTTLE}`);
const fullState = runFrames(60, 1.2, { ...lightInputs, shiftPressed: true }, baseContext(CarType.SEDAN));
assert(fullState.speed > lightState.speed, 'Shift+W must accelerate harder than light W');
assert(fullState.throttle > lightState.throttle + 0.12, 'Shift+W must open the throttle beyond the light pedal');
const releasedShiftState = runFrames(60, 1.0, lightInputs, baseContext(CarType.SEDAN), fullState);
assert(releasedShiftState.throttle < fullState.throttle - 0.12, 'releasing Shift returns to the light throttle band');
console.log(`Throttle: light=${lightState.throttle.toFixed(2)}, shift=${fullState.throttle.toFixed(2)}, released=${releasedShiftState.throttle.toFixed(2)}.`);

// Coasting must preserve inertia, not snap to zero.
const coastState = runFrames(60, 1.0, idleInputs, baseContext(CarType.SEDAN), createLongitudinalState(2));
assert(coastState.speed > 1.5, `coasting from 2 units must keep inertia, got ${coastState.speed}`);
console.log(`Coast: 2.00 -> ${coastState.speed.toFixed(3)} speed units after 1 s.`);

// N + throttle must not move the car.
const neutralState = runFrames(60, 2, { ...lightInputs, gear: 0 }, baseContext(CarType.SEDAN));
assert.equal(neutralState.speed, 0, 'N with throttle must not move');

// High-gear start stall (fuel) and EV exemption.
let stallState = createLongitudinalState(0);
let stalledResult = stepLongitudinal(stallState, { ...lightInputs, gear: 4 }, baseContext(CarType.SEDAN));
for (let i = 0; i < STALL_DELAY_FRAMES + 2 && !stalledResult.stalled; i++) {
  stallState = stalledResult;
  stalledResult = stepLongitudinal(stallState, { ...lightInputs, gear: 4 }, baseContext(CarType.SEDAN));
}
assert.equal(stalledResult.stalled, true, '4th gear from rest must stall after the engagement delay');
assert.equal(stalledResult.speed, 0, 'a stalled car must not keep rolling on flat ground');
const highGearMins = baseContext(CarType.SEDAN).pt.gearMins;
assert(highGearMins[3] > 0 && highGearMins[4] > highGearMins[3], '4th/5th gears expose a lower comfortable band');
assert.equal(isElectricVehicle(CarType.YU7), true);
let evStep = stepLongitudinal(createLongitudinalState(0), lightInputs, baseContext(CarType.YU7));
for (let i = 0; i < 150; i++) evStep = stepLongitudinal(evStep, lightInputs, baseContext(CarType.YU7));
assert.equal(evStep.stalled, false, 'single-speed EV must never report a stall');
console.log('Stall: 4th-gear start stalls after the delay; single-speed EV never stalls.');
// Actual shared longitudinal integration: the exact manual-training sequence
// (N→3rd, light Shift+W, handbrake released) must move the car, not merely
// exercise the lug multiplier in isolation.
{
  const third = runFrames(60, 7, { ...lightInputs, shiftPressed: true, gear: 3 }, baseContext(CarType.SEDAN));
  assert.equal(third.stalled, false, '3rd gear light-throttle flat start must not be treated as a stall');
  assert(third.speed > 0.40, `3rd gear Shift+W 7s must move (>6 km/h), got ${third.speed.toFixed(3)} units`);
  const thirdOneSecond = runFrames(60, 1, { ...lightInputs, shiftPressed: true, gear: 3 }, baseContext(CarType.SEDAN));
  assert(thirdOneSecond.speed > 0, '3rd gear must begin creeping within the first second');
  for (const ev of [CarType.SEAL08, CarType.SUV]) {
    assert.equal(getPowertrain(ev).gearTops.length, 1, `${ev}: single-speed EV`);
    const evRun = runFrames(120, 4, { ...lightInputs, shiftPressed: true, gear: 1 }, baseContext(ev));
    assert.equal(evRun.stalled, false, `${ev}: EV must never fake a fuel stall`);
    assert(evRun.speed > 1, `${ev}: EV must accelerate`);
  }
  console.log(`3rd gear integration: 7s Shift+W=${(third.speed*15).toFixed(1)} km/h, 1s=${(thirdOneSecond.speed*15).toFixed(2)} km/h, no stall.`);
}


// Slope: foot brake holds while pressed; releasing both brakes must roll.
const slopeContext = baseContext(CarType.SEDAN, { slopeAlongCar: 0.2 });
const slopeHoldState = runFrames(60, 2, { ...idleInputs, brake: 1 }, slopeContext, {
  ...createLongitudinalState(0), brakePedal: 1,
});
assert.equal(slopeHoldState.speed, 0, 'foot brake holds the car on a hill with zero creep');
const releasedState = runFrames(60, 1, idleInputs, slopeContext, slopeHoldState);
assert(releasedState.speed < -0.05, 'releasing foot brake and handbrake must let the car roll on the grade');
const handbrakeHold = runFrames(60, 2, { ...idleInputs, handbrake: true }, slopeContext, createLongitudinalState(0));
assert.equal(handbrakeHold.speed, 0, 'handbrake still holds on the hill');
const rollingInNeutral = runFrames(60, 1, { ...idleInputs, gear: 0 }, slopeContext, createLongitudinalState(0));
assert(rollingInNeutral.speed < -0.05, 'N on a hill still allows a realistic rollback');
console.log(`Slope: brake/hold=0, released=${releasedState.speed.toFixed(3)}, handbrake=0, neutral rollback=${rollingInNeutral.speed.toFixed(3)}.`);
// 30% throttle (documented Shift+W) must start and climb a normal 18% grade
// in first gear; no hidden full-throttle.
const climb30 = runFrames(60, 3, { ...idleInputs, throttle: 0.30 }, slopeContext, createLongitudinalState(0));
assert(climb30.speed > 0.05, `30% throttle must climb a normal grade, got ${climb30.speed}`);
// Light brake can stop a gentle grade; a steep grade needs heavier braking.
const gentleSlope = baseContext(CarType.SEDAN, { slopeAlongCar: 0.08 });
const lightGentle = runFrames(60, 3, { ...idleInputs, brake: 0.12 }, gentleSlope, createLongitudinalState(0));
assert.equal(lightGentle.speed, 0, '12% brake must hold a gentle grade');
const lightSteep = runFrames(60, 3, { ...idleInputs, brake: 0.12 }, slopeContext, createLongitudinalState(0));
const hardSteep = runFrames(60, 3, { ...idleInputs, brake: 1 }, slopeContext, createLongitudinalState(0));
assert(lightSteep.speed < 0, '12% brake may not hold a steep grade');
assert.equal(hardSteep.speed, 0, '100% brake must hold the steep grade');
console.log(`Climb/brake: 30% 1st=${climb30.speed.toFixed(3)}, gentle light brake=0, steep light=${lightSteep.speed.toFixed(3)}, hard=0.`);

// ------------------------------------------------------------ NPC traffic logic
const npcPath = [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 300 }, { x: 0, y: 300 }];
const makeAi = (): any => ({ path: npcPath, currentPathIndex: 0, speed: 0.5, maxSpeed: 0.5, state: 'drive' });
let npcAi = makeAi();
let npc = { x: 0, y: 0, rotation: 0 };
let trafficHonks = 0;
for (let i = 0; i < 120; i++) {
  const result = stepTrafficVehicle({
    id: 'npc', ...npc, ai: npcAi,
    blockers: [], player: { x: -1000, y: -1000 },
    dtSeconds: 1 / 60, nowMs: i * (1000 / 60),
  });
  if (result.honked) trafficHonks++;
  npc = { x: result.x, y: result.y, rotation: result.rotation };
  npcAi.speed = result.speed;
  npcAi.currentPathIndex = result.currentPathIndex;
  npcAi.state = result.state;
}
assert(Math.hypot(npc.x, npc.y) > 30, 'NPC should follow its lane path');
const blockerAi = makeAi();
let blocked = null as any;
let blockedNpc = { x: 0, y: 0, rotation: 0 };
for (let i = 0; i < 180; i++) {
  blocked = stepTrafficVehicle({
    id: 'npc', ...blockedNpc, ai: blockerAi,
    blockers: [{ id: 'player', x: 95, y: 0, width: 20, height: 50 }],
    player: { x: 95, y: 0 },
    dtSeconds: 1 / 60, nowMs: i * (1000 / 60),
  });
  if (blocked.honked) trafficHonks++;
  blockedNpc = { x: blocked.x, y: blocked.y, rotation: blocked.rotation };
  blockerAi.speed = blocked.speed;
  blockerAi.currentPathIndex = blocked.currentPathIndex;
}
assert.equal(blocked.blocked, true, 'a car directly ahead must block the NPC');
assert(blocked.speed < 0.05, `blocked NPC should stop, got ${blocked.speed}`);
assert(trafficHonks >= 1, 'a long player block should produce an occasional horn');
const honkCountAfter = trafficHonks;
for (let i = 0; i < 240; i++) {
  const result = stepTrafficVehicle({
    id: 'npc', ...blockedNpc, ai: blockerAi,
    blockers: [{ id: 'player', x: 95, y: 0, width: 20, height: 50 }],
    player: { x: 95, y: 0 },
    dtSeconds: 1 / 60, nowMs: 3000 + i * (1000 / 60),
  });
  if (result.honked) trafficHonks++;
}
assert(trafficHonks <= honkCountAfter + 1, 'horn cooldown must prevent repeated honking');
const overlapResult = stepTrafficVehicle({
  id: 'npc', x: 0, y: 0, rotation: 0, ai: makeAi(),
  blockers: [{ id: 'player', x: 10, y: 0, width: 20, height: 50 }],
  player: { x: 10, y: 0 }, dtSeconds: 1 / 60, nowMs: 1000,
});
assert.equal(overlapResult.collided, true, 'overlapping vehicles must be separated');
assert(overlapResult.x < 0, 'separation must push the NPC away from the player, not teleport through');
console.log(`NPC: follows path, stops behind player, honks ${trafficHonks} time(s) with cooldown, separates on contact.`);

// --------------------------------------------------------------- Beijing scene
const bj = buildBeijingLevel();
const bjBuildings = bj.obstacles.filter(o => o.id.startsWith('bj-building-'));
const bjTraffic = bj.obstacles.filter(o => o.ai);
assert(bjBuildings.length >= 30 && bjBuildings.length <= 60, `Beijing must keep 30-60 large buildings, got ${bjBuildings.length}`);
assert.equal(bjTraffic.length, 0, 'Beijing round 6 ships no active NPC cars');
assert(bj.obstacles.filter(o => o.type === 'car' && !o.ai).length >= 8, 'Beijing must keep fixed roadside NPCs');
assert((bj.curvedRoads?.length ?? 0) >= 2, 'factory loop and S access must exist');
assert((bj.curbSegments?.length ?? 0) > 0, 'curbs must be present');
assert((bj.spots?.length ?? 0) >= 6, 'distributed parking targets must exist');
assert((bj.intersections?.length ?? 0) >= 3, 'major junction aprons must exist');
const mainStreets = BEIJING_STREETS.slice(0, 4);
assert(mainStreets.every(street => street.width >= 200), 'all four main streets must be wide enough for 3+3 lanes');
assert(BEIJING_STREETS.slice(4).every(street => street.width <= 80), 'hutongs must keep narrow shared-street widths');
const mainArmCount = (bj.intersections ?? []).flatMap(junction => junction.arms ?? [])
  .filter(arm => (arm.width ?? 0) >= 200 && (arm.lanes ?? 0) >= 3).length;
assert(mainArmCount >= 6, 'junction arms on main streets must expose 3 lanes and a matching width');
const dashedLaneMarks = bj.markings.filter(mark => mark.type === 'line-dashed' && mark.color.toLowerCase() === '#fff');
const doubleYellow = bj.markings.filter(mark => mark.type === 'line-double' && mark.color.toLowerCase() === '#fbbf24');
assert(dashedLaneMarks.length >= 20, 'six-lane roads need continuous white lane dashes');
assert(dashedLaneMarks.every(mark => Math.max(mark.width, mark.height) >= 24), 'lane dashes must be long runs, not random 24-unit solids');
assert(doubleYellow.length >= 10, 'main roads need double-yellow centre markings');
assert(bj.markings.filter(mark => mark.type === 'line-solid' && mark.color.toLowerCase() === '#fff').length > 0, 'main roads need solid white edge/approach lines');
const loopJunction = bj.intersections?.find(junction => junction.id === 'bj-junction-loop-t');
assert(loopJunction?.arms?.length === 3, 'S access / loop connection must be a clean three-arm T');
assert(loopJunction?.arms?.some(arm => arm.polyId === 'access'), 'T junction must include the S access arm');
assert((bj.curvedRoads?.filter(road => (road.markingGaps?.length ?? 0) > 0).length ?? 0) >= 2, 'factory loop/S access must suppress markings at the T');
for (const building of bjBuildings) {
  for (const road of bj.roadSurfaces || []) {
    assert(!checkCollision(
      { x: building.x, y: building.y, width: building.width, height: building.height, rotation: building.rotation },
      { x: road.x, y: road.y, width: road.width, height: road.height, rotation: road.rotation },
    ), `${building.id} must not overlap a road surface`);
  }
}
assert(bj.curvedRoads?.some(road => road.closed), 'factory loop must be closed');
// Challenge corridor clearance: fixed cars/walls must not sit on the added
// road width. Collision-only bridge rails and elevated piers are excluded.
for (const obs of bj.obstacles) {
  if (obs.collisionOnly || obs.id.includes('roundabout-island')) continue;
  if (obs.elevation && obs.elevation > 2) continue;
  if (obs.x < 3200 || obs.x > 8400 || obs.y < 2900 || obs.y > 6000) continue;
  for (const road of bj.roadSurfaces || []) {
    if (road.x < 3200 || road.x > 8400 || road.y < 2900 || road.y > 6000) continue;
    assert(!checkCollision(
      { x: obs.x, y: obs.y, width: obs.width, height: obs.height, rotation: obs.rotation },
      { x: road.x, y: road.y, width: road.width, height: road.height, rotation: road.rotation },
    ), `${obs.id} must not obstruct challenge roadway`);
  }
}
for (const spot of bj.spots.filter(s => s.id.startsWith('challenge-spot'))) {
  assert((bj.roadSurfaces || []).some(road => {
    const dx = spot.x - road.x, dy = spot.y - road.y;
    const cos = Math.cos(-road.rotation), sin = Math.sin(-road.rotation);
    const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
    return Math.abs(lx) <= road.width / 2 && Math.abs(ly) <= road.height / 2;
  }), `${spot.id} must sit on a paved parking pad`);
}
assert(bjTraffic.length === 0, 'no active AI paths remain in round 6');
for (const traffic of bjTraffic) {
  for (const building of bjBuildings) {
    assert(!checkCollision(
      { x: traffic.x, y: traffic.y, width: traffic.width, height: traffic.height, rotation: traffic.rotation },
      { x: building.x, y: building.y, width: building.width, height: building.height, rotation: building.rotation },
    ), `${traffic.id} must not spawn inside ${building.id}`);
  }
}
const roadsideSpots = bj.spots.filter(spot => spot.id.startsWith('bj-road-bay'));
assert(roadsideSpots.length >= 2, 'roadside parking targets must exist');
for (const spot of roadsideSpots) {
  for (const road of bj.roadSurfaces || []) {
    assert(!checkCollision(
      { x: spot.x, y: spot.y, width: spot.width, height: spot.height, rotation: spot.rotation },
      { x: road.x, y: road.y, width: road.width, height: road.height, rotation: road.rotation },
    ), `${spot.id} must sit outside the carriageway`);
  }
}
console.log(`Beijing scene: ${bjBuildings.length} large buildings (old dense buildings 850 / total wall pieces 853 per review; new building count -96.4%), ${bjTraffic.length} NPCs, ${bj.curvedRoads?.length} curved roads, ${bj.curbSegments?.length} curb segments, ${bj.spots.length} targets; building/road SAT clear, roadside bays off carriageway.`);

// ----------------------------------------------------------- Cannon unit bridge
const world = new PhysicsWorld();
const playerBody = world.addPlayerCar(100, 200, 20, 50, 1400);
world.updatePlayerKinematics(100, 200, 0, 1, 0);
assert(Math.abs(playerBody.velocity.x - 41.6666667) < 1e-4, `Cannon velocity must be 41.67 u/s for 15 km/h, got ${playerBody.velocity.x}`);
// Bridge/ground props must not share the same Cannon vertical layer.
const layerWorld = new PhysicsWorld();
const layerPlayer = layerWorld.addPlayerCar(500, 500, 20, 50, 1400);
layerWorld.updatePlayerKinematics(500, 500, 0, 0, 0, 65);
assert(Math.abs(layerPlayer.position.y - 70) < 1e-9, 'Cannon player y must follow bridge deck height');
const groundProp = { id:'ground-cone-layer', type:'cone' as const, x:300, y:300, width:4, height:4, rotation:0, movable:true, weight:2, color:'#f00', elevation:0 };
const deckProp = { id:'deck-cone-layer', type:'cone' as const, x:700, y:700, width:4, height:4, rotation:0, movable:true, weight:2, color:'#f00', elevation:65 };
layerWorld.addMovableObstacle(groundProp);
layerWorld.addMovableObstacle(deckProp);
assert(Math.abs(layerWorld.getMovableTransform(groundProp.id)!.y - 4) < 1e-9, 'ground prop Cannon y is ground layer');
assert(Math.abs(layerWorld.getMovableTransform(deckProp.id)!.y - 69) < 1e-9, 'deck prop Cannon y is deck layer');
layerWorld.dispose();
assert(Math.abs(playerBody.velocity.z) < 1e-9);
assert(Math.abs(worldImpactToGameSpeed(gameSpeedToWorldVelocity(1)) - 1) < 1e-9);
const beforeX = playerBody.position.x;
world.step(1 / 30);
const moved = playerBody.position.x - beforeX;
assert(moved > 1.0 && moved < 1.6, `30 Hz step should advance roughly 1.39 units, got ${moved}`);
console.log(`Cannon bridge: speed 1 -> ${playerBody.velocity.x.toFixed(2)} u/s, 1/30 s step moves ${moved.toFixed(3)} units.`);

console.log('System regressions passed: focus isolation, time-step composition, steering plumbing, gear feedback, slope hold and Cannon units.');
