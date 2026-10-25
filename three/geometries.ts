import { buildNativeConcept } from './conceptVehicle';
import { softenBodyGeometry } from './softenBodyGeometry';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Mats, flatMat } from './materials';
import { CarConfig, CarType } from '../types';
import { extractWheels } from './modelLoader';

// ---- 确定性伪随机（基于 seed） ----
function seededRand(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

// ============================================================
// 车辆模型
// ============================================================

// ---- Shared, smooth wheel assembly -------------------------------------
// Unit torus lies in XY (axis Z); rotate once to axis X so the existing
// rollPivot.rotation.x animation remains valid. Per-wheel scale supplies the
// radius and tyre width. 36 circumferential / 12 tube segments keeps the tyre
// round without turning it into a high-poly asset.
const WHEEL_TIRE_GEO = new THREE.TorusGeometry(0.8, 0.2, 12, 36);
WHEEL_TIRE_GEO.rotateY(Math.PI / 2);
// Open-ended rim barrel: no solid end caps, so the spokes remain visible from
// both sides. The barrel is only the outer lip/seat, not a white disc.
const WHEEL_RIM_GEO = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true);
WHEEL_RIM_GEO.rotateZ(Math.PI / 2);
const WHEEL_HUB_GEO = new THREE.CylinderGeometry(1, 1, 1, 20);
WHEEL_HUB_GEO.rotateZ(Math.PI / 2);
// Five radial bars, merged into one draw call. Unit dimensions assume R=1,W=1
// and are scaled by the wheel assembly.
const WHEEL_SPOKE_GEO = (() => {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const bar = new THREE.BoxGeometry(0.50, 0.52, 0.10);
    bar.translate(0, 0.29, 0);
    bar.rotateX((i / 5) * Math.PI * 2);
    parts.push(bar);
  }
  const merged = mergeGeometries(parts, false)!;
  parts.forEach(part => part.dispose());
  return merged;
})();
// Two thin rim lips at the outboard faces; one merged draw call.
const WHEEL_LIP_GEO = (() => {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.30, 0.30]) {
    const ring = new THREE.TorusGeometry(1, 0.10, 6, 24);
    ring.rotateY(Math.PI / 2);
    ring.translate(x, 0, 0);
    parts.push(ring);
  }
  const merged = mergeGeometries(parts, false)!;
  parts.forEach(part => part.dispose());
  return merged;
})();
let _tireMaterial: THREE.MeshStandardMaterial | null = null;
let _rimMaterial: THREE.MeshStandardMaterial | null = null;

function tireTreadTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#15171a'; ctx.fillRect(0, 0, 64, 32);
  ctx.strokeStyle = '#24282d'; ctx.lineWidth = 3;
  for (let x = -8; x < 72; x += 12) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 7, 32); ctx.stroke();
  }
  ctx.strokeStyle = '#0c0e10'; ctx.lineWidth = 2;
  for (const y of [6, 26]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(64, y); ctx.stroke(); }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(14, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function wheelMaterials() {
  if (!_tireMaterial) {
    _tireMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: tireTreadTexture(),
      roughness: 0.92,
      metalness: 0.02,
    });
    _rimMaterial = new THREE.MeshStandardMaterial({
      color: '#aeb6c0',
      roughness: 0.30,
      metalness: 0.82,
      flatShading: true,
    });
  }
  return { tire: _tireMaterial!, rim: _rimMaterial! };
}

/** Build a round tyre + metallic rim at the local origin, axis = local X. */
export function buildWheelAssembly(radius: number, width: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'shared-round-wheel';
  const R = Math.max(0.4, radius);
  const W = Math.max(0.35, width);
  const materials = wheelMaterials();
  const tire = new THREE.Mesh(WHEEL_TIRE_GEO, materials.tire);
  tire.name = 'wheel-tire';
  // Torus outer radius 1, tube diameter 0.4. X is the tyre width axis.
  tire.scale.set(W / 0.4, R, R);
  tire.castShadow = true;
  tire.receiveShadow = false;
  group.add(tire);

  const rimRadius = R * 0.58;
  const rim = new THREE.Mesh(WHEEL_RIM_GEO, materials.rim);
  rim.name = 'wheel-rim-barrel';
  rim.scale.set(W * 0.56, rimRadius, rimRadius);
  rim.castShadow = true;
  group.add(rim);

  const spokes = new THREE.Mesh(WHEEL_SPOKE_GEO, materials.rim);
  spokes.name = 'wheel-spokes';
  spokes.scale.set(W, R, R);
  spokes.castShadow = true;
  group.add(spokes);

  const lip = new THREE.Mesh(WHEEL_LIP_GEO, materials.rim);
  lip.name = 'wheel-rim-lip';
  lip.scale.set(W, rimRadius, rimRadius);
  lip.castShadow = true;
  group.add(lip);

  const hub = new THREE.Mesh(WHEEL_HUB_GEO, materials.rim);
  hub.name = 'wheel-hub';
  hub.scale.set(W * 0.55, rimRadius * 0.22, rimRadius * 0.22);
  group.add(hub);
  return group;
}

/** 一扇可动车门：绕垂直铰链旋转，openYaw 为完全打开时的偏航角。 */
export interface VehicleDoorBinding {
  pivot: THREE.Object3D;
  openYaw: number;
}

/** 主动尾翼：closedPitch → openPitch，车速超过 activateSpeed 后展开。 */
export interface VehicleSpoilerBinding {
  pivot: THREE.Object3D;
  closedPitch: number;
  openPitch: number;
  /** 触发车速，单位为游戏速度单位（1 单位 = 15 km/h）。 */
  activateSpeed: number;
}

/** 方向盘：绕自身轴向旋转，ratio 为附加传动比。 */
export interface VehicleSteeringWheelBinding {
  object: THREE.Object3D;
  ratio: number;
  axis?: THREE.Vector3;
}

/** 制动盘热辉绑定：重刹时材质自发光。 */
export interface VehicleBrakeGlowBinding {
  material: THREE.MeshStandardMaterial;
  maxIntensity: number;
}

/**
 * 程序化车模的「可动部件绑定表」。GLB 车型没有这些绑定，
 * 因此它是可选字段；游戏循环只对存在的绑定做每帧更新。
 */
export interface VehicleExtras {
  doors: VehicleDoorBinding[];
  spoilers: VehicleSpoilerBinding[];
  steeringWheels: VehicleSteeringWheelBinding[];
  brakeGlow: VehicleBrakeGlowBinding[];
  /** 日间行车灯（常亮，不参与灯光开关） */
  drl: THREE.Mesh[];
}

export interface CarMeshParts {
  group: THREE.Group;
  wheels: THREE.Object3D[];      // 所有轮子
  wheelMounts: THREE.Object3D[]; // 独立悬架/转向节安装点
  frontWheels: THREE.Object3D[]; // 前轮（用于转向动画）
  headlights: THREE.Mesh[];
  taillights: THREE.Mesh[];
  brakeLights: THREE.Mesh[];
  reverseLights: THREE.Mesh[];
  leftIndicators: THREE.Mesh[];
  rightIndicators: THREE.Mesh[];
  nativeCockpit?: { eye: THREE.Vector3; pitchDeg: number; updateInstruments?: (speedKmh: number, rpm: number) => void };
  updateCollisionFootprint?: () => { x: number; y: number }[];
  isGLB: boolean;                // 是否使用 GLB 模型
  /** 程序化车型的可动部件绑定（GLB 车型为 undefined）。 */
  extras?: VehicleExtras;
}

/**
 * 从已加载的 GLB group 构建 CarMeshParts
 * GLB 模型已经归一化（缩放+坐地+居中）
 */
export function buildCarMeshFromGLB(glbGroup: THREE.Group, cfg?: CarConfig): CarMeshParts {
  if (cfg?.id === CarType.SPORTS) return buildNativeConcept(glbGroup);
  const group = new THREE.Group();
  group.add(glbGroup);

  // Extract each wheel once and put it in a two-pivot rig. The outer pivot
  // steers around Y; the inner pivot rolls around X. attach() preserves the
  // imported mesh transform while letting us rotate about the visual centre.
  const extracted = extractWheels(glbGroup);
  const frontWheels: THREE.Object3D[] = [];
  const allWheels: THREE.Object3D[] = [];
  const wheelMounts: THREE.Object3D[] = [];
  const rigWheel = (wheel: THREE.Object3D, isFront: boolean) => {
    const parent = wheel.parent;
    if (!parent) return;
    group.updateWorldMatrix(true, true);
    parent.updateWorldMatrix(true, true);
    const wheelBox = new THREE.Box3().setFromObject(wheel);
    // Some source assets author both rear tyres as a single mesh. Split their
    // triangles in vehicle coordinates before making independent knuckles.
    if (wheelBox.max.x - wheelBox.min.x > (cfg?.width ?? 19) * 0.65 && !wheel.userData.splitAxle) {
      const inverseVehicle = group.matrixWorld.clone().invert();
      const halves = [new THREE.Group(), new THREE.Group()];
      halves.forEach((half, i) => { half.name = `${isFront ? 'front' : 'rear'}-${i===0?'left':'right'}-wheel`; half.userData.splitAxle = true; group.add(half); });
      wheel.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        const source = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
        source.applyMatrix4(inverseVehicle.clone().multiply(node.matrixWorld));
        const positions = source.getAttribute('position');
        halves.forEach((half, sideIndex) => {
          const selected: number[] = [], materialIds:number[]=[];
          for (let i=0;i<positions.count;i+=3) {
            const x=(positions.getX(i)+positions.getX(i+1)+positions.getX(i+2))/3;
            if ((x>=0) !== (sideIndex===0)) continue;
            selected.push(i,i+1,i+2);
            materialIds.push(source.groups.find(g=>i>=g.start&&i<g.start+g.count)?.materialIndex ?? 0);
          }
          if (!selected.length) return;
          const geometry = new THREE.BufferGeometry();
          for(const name of Object.keys(source.attributes)) {
            const attr=source.getAttribute(name); const values:number[]=[];
            for(const i of selected) for(let c=0;c<attr.itemSize;c++) values.push(attr.array[i*attr.itemSize+c]);
            geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,attr.itemSize));
          }
          materialIds.forEach((m,i)=>geometry.addGroup(i*3,3,m));
          const mesh=new THREE.Mesh(geometry,node.material);mesh.castShadow=true;half.add(mesh);
        });
        source.dispose();
      });
      parent.remove(wheel);
      halves.forEach(half => rigWheel(half,isFront));
      return;
    }
    const centreWorld = wheelBox.getCenter(new THREE.Vector3());
    // Store the side in normalized vehicle coordinates before re-parenting.
    // Imported wheels often have separate parents, so steerPivot.position.x
    // cannot be compared across the left and right sides.
    const vehicleCentre = group.worldToLocal(centreWorld.clone());
    const steerPivot = new THREE.Group();
    steerPivot.name = `${isFront ? 'front' : 'rear'}-${vehicleCentre.x > 0 ? 'left' : 'right'}-steer-pivot`;
    steerPivot.position.copy(vehicleCentre);
    steerPivot.userData.vehicleSideX = vehicleCentre.x;
    steerPivot.userData.isFront = isFront;
    group.add(steerPivot);
    const rollPivot = new THREE.Group();
    rollPivot.name = `${steerPivot.name}-roll`;
    steerPivot.add(rollPivot);
    rollPivot.updateWorldMatrix(true, false);
    // Concept GT already has named, correctly-proportioned wheel/rim assets.
    // Preserve those meshes and rotate them around their own centres instead of
    // replacing them with the generic low-poly wheel. Other GLB training cars
    // keep the shared round assembly.
    const preserveNativeWheel = cfg?.id === CarType.SPORTS;
    const worldSize = wheelBox.getSize(new THREE.Vector3());
    // Use the vertical source radius for the round tyre. The old max(y,z)
    // radius could exceed the wheel-centre height after non-uniform body
    // normalization, sinking the bottom of the tyre into the road.
    const localRadius = Math.max(0.4, worldSize.y / 2);
    const localWidth = Math.max(0.35, worldSize.x);
    rollPivot.userData.wheelWidth = localWidth;
    if (localRadius > steerPivot.position.y + 0.01) {
      steerPivot.position.y = localRadius;
    }
    if (preserveNativeWheel) {
      // attach() preserves the source wheel's world transform while moving it
      // under the roll pivot at the measured axle centre.
      rollPivot.attach(wheel);
      wheel.traverse(node => { node.userData.nativeWheelPart = true; });
      // Brake calipers/discs can protrude a few centimetres below the tyre in
      // the source bbox. Lift the whole native wheel assembly by that amount
      // so the visible bottom of the tyre sits on the authored road height.
      const nativeBox = new THREE.Box3().setFromObject(wheel);
      if (nativeBox.min.y < 0) steerPivot.position.y -= nativeBox.min.y;
      rollPivot.userData.wheelRadius = localRadius;
      rollPivot.userData.nativeWheel = true;
    } else {
      rollPivot.add(buildWheelAssembly(localRadius, localWidth));
      parent.remove(wheel);
      rollPivot.userData.wheelRadius = localRadius;
    }
    allWheels.push(rollPivot);
    wheelMounts.push(steerPivot);
    if (isFront) frontWheels.push(steerPivot);
  };
  extracted.frontWheels.forEach(wheel => rigWheel(wheel, true));
  extracted.rearWheels.forEach(wheel => rigWheel(wheel, false));
  // The authored GLB wheel centres are often inboard of the real track. Apply
  // the model's measured full track once, before axleGeometry/footprint, so
  // visual wheels, steering locks and collision all use the same centres.
  if (cfg?.trackWidth && wheelMounts.length) {
    const halfTrack = cfg.trackWidth / 2;
    wheelMounts.forEach(mount => {
      const side = Math.sign(mount.position.x) || 1;
      mount.position.x = side * halfTrack;
      mount.userData.vehicleSideX = side * halfTrack;
    });
  }
  softenBodyGeometry(glbGroup);

  // 尝试找头灯/尾灯（按名称匹配）
  const headlights: THREE.Mesh[] = [];
  const taillights: THREE.Mesh[] = [];
  glbGroup.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const name = child.name.toLowerCase();
      if (name.includes('headlight') || name.includes('head_light')) {
        headlights.push(child);
      } else if (name.includes('taillight') || name.includes('tail_light') || name.includes('brake')) {
        taillights.push(child);
      }
    }
  });

  return {
    group,
    wheels: allWheels,
    wheelMounts,
    frontWheels,
    headlights,
    taillights,
    brakeLights: taillights,
    reverseLights: [],
    leftIndicators: [],
    rightIndicators: [],
    isGLB: true,
  };
}

/**
 * 构建低多边形汽车模型（代码几何体 fallback）
 * 3D 坐标系: 车头朝 +z, 车宽 w 沿 x 轴, 车长 l 沿 z 轴
 * rotation.y = π/2 - 2D_rotation
 */
export function buildCarMesh(cfg: CarConfig, isTraffic = false): CarMeshParts {
  const group = new THREE.Group();
  const W = cfg.width;
  const L = cfg.length;
  const isTruck = cfg.id === CarType.TRUCK;
  const isSUV = cfg.id === CarType.SUV;
  const isSports = cfg.id === CarType.SPORTS;

  const bodyH = isTruck ? 9 : isSUV ? 8.5 : isSports ? 5.5 : 7;
  const cabinH = isTruck ? 6 : isSUV ? 6.5 : isSports ? 4.5 : 5.5;
  const wheelR = isTruck ? 4.0 : 3.5;

  const bodyMat = flatMat(cfg.color);

  if (isTruck) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, bodyH, L), bodyMat);
    body.position.y = wheelR + bodyH / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
  } else {
    const hoodLen = L * 0.35;
    const hoodH = bodyH * 0.55;
    const rearLen = L * 0.65;
    const rearH = bodyH;

    const hood = new THREE.Mesh(new THREE.BoxGeometry(W, hoodH, hoodLen), bodyMat);
    hood.position.set(0, wheelR + hoodH / 2, L / 2 - hoodLen / 2);
    hood.castShadow = true;
    hood.receiveShadow = true;
    group.add(hood);

    const rear = new THREE.Mesh(new THREE.BoxGeometry(W, rearH, rearLen), bodyMat);
    rear.position.set(0, wheelR + rearH / 2, -rearLen / 2);
    rear.castShadow = true;
    rear.receiveShadow = true;
    group.add(rear);
  }

  if (isTruck) {
    const cabLen = L * 0.25;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, cabinH, cabLen), bodyMat);
    cab.position.set(0, wheelR + bodyH + cabinH / 2, L / 2 - cabLen / 2);
    cab.castShadow = true;
    group.add(cab);

    const bedLen = L * 0.65;
    const bed = new THREE.Mesh(new THREE.BoxGeometry(W * 0.95, cabinH * 1.2, bedLen), flatMat('#5d4037'));
    bed.position.set(0, wheelR + bodyH + cabinH * 0.6, -L * 0.15);
    bed.castShadow = true;
    group.add(bed);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, cabinH * 0.6, 0.5), Mats.carGlass());
    windshield.name = 'windshield';
    windshield.position.set(0, wheelR + bodyH + cabinH * 0.7, L / 2 - cabLen + 0.3);
    windshield.rotation.x = -0.4;
    group.add(windshield);
  } else {
    const cabinLen = isSports ? L * 0.4 : L * 0.5;
    const cabinW = W * 0.85;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(cabinW, cabinH, cabinLen), bodyMat);
    const cabinZ = -L * 0.05;
    cabin.position.set(0, wheelR + bodyH + cabinH / 2, cabinZ);
    cabin.castShadow = true;
    group.add(cabin);

    const wsH = cabinH * 0.75;
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(cabinW * 0.9, wsH, 0.5), Mats.carGlass());
    windshield.name = 'windshield';
    windshield.position.set(0, wheelR + bodyH + cabinH / 2 + 0.5, cabinZ + cabinLen / 2 + 0.1);
    windshield.rotation.x = -0.5;
    group.add(windshield);

    const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(cabinW * 0.9, wsH * 0.8, 0.5), Mats.carGlass());
    rearGlass.name = 'rear-window';
    rearGlass.position.set(0, wheelR + bodyH + cabinH / 2 + 0.5, cabinZ - cabinLen / 2 - 0.1);
    rearGlass.rotation.x = 0.5;
    group.add(rearGlass);

    if (isSports) {
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.8, 2), flatMat('#1a1a1a'));
      spoiler.position.set(0, wheelR + bodyH + 1, -L / 2 + 1);
      spoiler.castShadow = true;
      group.add(spoiler);
    }

    if (isSUV) {
      for (let i = -1; i <= 1; i += 2) {
        const rack = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 0.4, 1), flatMat('#333333'));
        rack.position.set(i * W * 0.15, wheelR + bodyH + cabinH + 0.3, cabinZ);
        group.add(rack);
      }
    }
  }

  // 车轮
  const wheels: THREE.Object3D[] = [];
  const wheelMounts: THREE.Object3D[] = [];
  const frontWheels: THREE.Object3D[] = [];
  const tireWidth = isTruck ? W * 0.17 : W * 0.145;

  const wheelbase = cfg.wheelbase;
  const wheelX = W / 2;
  const wheelY = wheelR;
  const wheelPositions: [number, number, boolean][] = [
    [wheelX, wheelbase / 2, true], [-wheelX, wheelbase / 2, true],
    [wheelX, -wheelbase / 2, false], [-wheelX, -wheelbase / 2, false],
  ];
  if (isTruck) {
    wheelPositions.push([wheelX, -wheelbase / 2 - 14, false], [-wheelX, -wheelbase / 2 - 14, false]);
  }

  wheelPositions.forEach(([wx, wz, isFront]) => {
    const steerGroup = new THREE.Group();
    steerGroup.userData.vehicleSideX = wx;
    const wheelGroup = buildWheelAssembly(wheelR, tireWidth);
    steerGroup.position.set(wx, wheelY, wz);
    steerGroup.add(wheelGroup);
    group.add(steerGroup);
    wheels.push(wheelGroup);
    wheelMounts.push(steerGroup);
    if (isFront) frontWheels.push(steerGroup);
  });

  // 头灯（车头 +z）
  const headlights: THREE.Mesh[] = [];
  const hlGeo = new THREE.BoxGeometry(W * 0.18, 2, 0.8);
  const hlMat = Mats.carHeadlightOff();
  for (let i = -1; i <= 1; i += 2) {
    const hl = new THREE.Mesh(hlGeo, hlMat);
    hl.position.set(i * W * 0.3, wheelR + bodyH * 0.7, L / 2 + 0.1);
    group.add(hl);
    headlights.push(hl);
  }

  // 尾灯（车尾 -z）
  const taillights: THREE.Mesh[] = [];
  const tlGeo = new THREE.BoxGeometry(W * 0.18, 1.5, 0.6);
  for (let i = -1; i <= 1; i += 2) {
    const tl = new THREE.Mesh(tlGeo, Mats.carTaillight());
    tl.position.set(i * W * 0.3, wheelR + bodyH * 0.7, -L / 2 - 0.1);
    group.add(tl);
    taillights.push(tl);
  }

  // 后视镜
  for (let i = -1; i <= 1; i += 2) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 2), Mats.carMirror());
    mirror.position.set(i * (W / 2 + 0.8), wheelR + bodyH + cabinH * 0.3, L * 0.25);
    group.add(mirror);
  }

  // 前格栅
  const grille = new THREE.Mesh(new THREE.BoxGeometry(W * 0.4, 1.5, 0.3), flatMat('#1a1a1a'));
  grille.position.set(0, wheelR + bodyH * 0.5, L / 2 + 0.2);
  group.add(grille);

  return { group, wheels, wheelMounts, frontWheels, headlights, taillights, brakeLights: taillights, reverseLights: [], leftIndicators: [], rightIndicators: [], isGLB: false };
}

// ============================================================
// 建筑模型（代码 fallback，优先用 GLB）
// ============================================================

const BUILDING_COLORS = ['#e8b4b8', '#a8c8e8', '#c8d8a8', '#e8d8a8', '#d8b8e8', '#b8d8d8', '#f0c8a8', '#a8d8c8'];

export function buildBuildingMesh(w: number, h: number, seedStr: string): THREE.Group {
  const group = new THREE.Group();
  const seed = hashStr(seedStr);
  const rand = seededRand(seed);

  const height = 15 + rand() * 30;
  const bodyColor = BUILDING_COLORS[Math.floor(rand() * BUILDING_COLORS.length)];

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, height, h), flatMat(bodyColor));
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  return group;
}

// ============================================================
// 植被
// ============================================================

export function buildTreeMesh(seedStr?: string): THREE.Group {
  const group = new THREE.Group();
  const seed = seedStr ? hashStr(seedStr) : Math.floor(Math.random() * 100000);
  const rand = seededRand(seed);

  const trunkH = 3 + rand() * 2;
  const crownH = 6 + rand() * 4;
  const crownR = 4 + rand() * 2;

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, trunkH, 6), Mats.treeTrunk());
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  group.add(trunk);

  const layers = 2 + Math.floor(rand() * 2);
  const crownColors = ['#5cb85c', '#6ec86e', '#4a9a4a'];
  for (let i = 0; i < layers; i++) {
    const r = crownR * (1 - i * 0.2);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, crownH / layers, 7), Mats.treeCrown(crownColors[Math.floor(rand() * crownColors.length)]));
    cone.position.y = trunkH + i * (crownH / layers) * 0.6;
    cone.castShadow = true;
    group.add(cone);
  }

  return group;
}

export function buildBushMesh(seedStr?: string): THREE.Group {
  const group = new THREE.Group();
  const seed = seedStr ? hashStr(seedStr) : Math.floor(Math.random() * 100000);
  const rand = seededRand(seed);

  const r = 2 + rand() * 1.5;
  const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), Mats.bush());
  bush.position.y = r;
  bush.castShadow = true;
  group.add(bush);

  return group;
}

// ============================================================
// 路灯
// ============================================================

export function buildStreetLightMesh(): THREE.Group {
  const group = new THREE.Group();
  const poleH = 18;

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, poleH, 6), Mats.pole());
  pole.position.y = poleH / 2;
  pole.castShadow = true;
  group.add(pole);

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 4, 6), Mats.pole());
  arm.rotation.z = Math.PI / 2;
  arm.position.set(2, poleH - 1, 0);
  group.add(arm);

  const head = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 2), Mats.streetLightHead());
  head.position.set(4, poleH - 1.5, 0);
  group.add(head);

  return group;
}

// ============================================================
// 电线杆
// ============================================================

export function buildPowerPoleMesh(): THREE.Group {
  const group = new THREE.Group();
  const poleH = 55;
  const poleR = 1.2;

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(poleR * 0.7, poleR, poleH, 6), Mats.powerPole());
  pole.position.y = poleH / 2;
  pole.castShadow = true;
  group.add(pole);

  const cross = new THREE.Mesh(new THREE.CylinderGeometry(poleR * 0.5, poleR * 0.5, 20, 5), Mats.powerPole());
  cross.rotation.z = Math.PI / 2;
  cross.position.y = poleH - 6;
  group.add(cross);

  return group;
}

// ============================================================
// 锥桶 / 箱子
// ============================================================

export function buildConeMesh(): THREE.Group {
  const group = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(3, 8, 6), Mats.cone());
  cone.position.y = 4;
  cone.castShadow = true;
  group.add(cone);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.5, 1.5, 6), Mats.coneStripe());
  stripe.position.y = 5;
  group.add(stripe);
  const base = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 6), Mats.cone());
  base.position.y = 0.25;
  base.castShadow = true;
  group.add(base);
  return group;
}

export function buildBoxMesh(w: number, h: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, w, h), Mats.box());
  mesh.position.y = w / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
