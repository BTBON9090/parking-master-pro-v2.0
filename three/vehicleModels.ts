/**
 * 三款全新车型的程序化建模与部件绑定
 * =====================================
 *   · 小米 SU7   （纯电运动轿车，Max 四驱数据）
 *   · 小米 YU7   （纯电中大型 SUV，Max 四驱数据）
 *   · 尊界 V8    （基于尊界 S800 车身的 V8 旗舰）
 *
 * 为什么用代码建模：项目里其余车型来自 public/models/cars/*.glb，
 * 这三款车没有对应的授权资产。为了让它们也能拥有可动的车门、轮拱、
 * 转向节、制动卡钳、灯组与主动尾翼，这里用「截面放样(loft)」重建车身：
 *
 *   1. 车身 = 沿 Z 轴逐站给出「顶线 / 宽度 / 离地间隙」的圆角矩形截面，
 *      相邻截面之间铺四边形。引擎盖、腰线、翼子板、尾部由此连续生成。
 *   2. 轮拱 = 底边在轴距位置沿圆弧抬升，形成真正的轮眉开口，
 *      轮胎不再简单埋进翼子板里；轮拱内衬挡住看穿车身的视线。
 *   3. 座舱 = 独立的第二层放样壳：底面落在腰线上、顶面是车顶，
 *      顶边四边形用材质分组标成车漆，侧/前/后为玻璃；座舱底与车身
 *      顶板同时开孔，因此内饰、座椅和方向盘真的能透过玻璃看到。
 *   4. 每个可动部件都是具名节点，并写入 userData.partRole / partName；
 *      轮胎分「转向节 → 滚动枢轴」两级，正好对上游戏循环里的
 *      阿克曼转向与车轮滚动；制动卡钳挂在转向节上（不随轮毂旋转）。
 *
 * 绑定关系（与 components/GameCanvas3D.tsx 的每帧更新一一对应）：
 *
 *   部位            节点                   驱动来源
 *   --------------  ---------------------  -------------------------------
 *   前轮转向        wheelMounts[*]         car.steeringAngle + 阿克曼几何
 *   车轮滚动        wheels[*]              car.speed / 轮胎半径
 *   制动盘热辉      extras.brakeGlow       input.brake
 *   大灯/尾灯        headlights/taillights  灯光开关 + 制动 + 倒挡
 *   转向灯          left/rightIndicators   方向盘转角 + 闪烁相位
 *   主动尾翼        extras.spoilers        车速 > 阈值时升起
 *   车门            extras.doors           展厅自动开启 / 预留交互
 *   方向盘          extras.steeringWheels  实际前轮角 × 转向比
 *
 * 游戏单位：1 米 = 10 单位；车头朝 +Z，+Y 向上，+X 为车辆左侧。
 */

import * as THREE from 'three';
import { collectVehicleFootprint } from '../utils/collisionFootprint';
import type { VehicleExtras, VehicleDoorBinding, VehicleSteeringWheelBinding, CarMeshParts } from './geometries';
import { buildCarMeshFromGLB } from './geometries';
import { applyPlayerVehicleFinish, CAR_TYPE_TO_MODEL, loadModel } from './modelLoader';
import { buildNativeAuthoredVehicle, isAuthoredVehicle } from './blenderVehicle';
import { CarConfig, CarType } from '../types';

// ============================================================
// 通用工具
// ============================================================

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Vec2 { x: number; y: number; }

/** 沿 Z 轴的一个车身截面。 */
interface Station {
  z: number;
  bottom: number;
  top: number;
  halfWidth: number;
  /** 底部宽度系数（1 = 与顶部同宽） */
  bottomInset: number;
  /** 顶部宽度系数（<1 形成上窄下宽的车身腰线） */
  topInset: number;
  radiusTop: number;
  radiusBottom: number;
}

interface ProfilePoint {
  z: number;
  top: number;
  halfWidth: number;
  /** 缺省使用 HullSpec.defaultBottom */
  bottom?: number;
  topInset?: number;
  bottomInset?: number;
}

/** 轮拱：轴心 z、轮胎半径、轮眉与轮胎之间的间隙。 */
interface WheelArch { z: number; radius: number; clearance: number; }

// ============================================================
// 材质
// ============================================================

interface CarPalette {
  rim: string;
  caliper: string;
  roof?: string;
  interior?: string;
  glassOpacity?: number;
}

interface CarMaterials {
  paint: THREE.MeshStandardMaterial;
  paintDark: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  satin: THREE.MeshStandardMaterial;
  interior: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  rim: THREE.MeshStandardMaterial;
  brakeDisc: THREE.MeshStandardMaterial;
  caliper: THREE.MeshStandardMaterial;
  head: THREE.MeshStandardMaterial;
  tail: THREE.MeshStandardMaterial;
  reverse: THREE.MeshStandardMaterial;
  indicator: THREE.MeshStandardMaterial;
  plate: THREE.MeshStandardMaterial;
  screen: THREE.MeshStandardMaterial;
  drl: THREE.MeshBasicMaterial;
}

function makeCarMaterials(cfg: CarConfig, palette: CarPalette): CarMaterials {
  const paint = new THREE.MeshStandardMaterial({
    color: cfg.color,
    metalness: 0.46,
    roughness: 0.28,
    side: THREE.DoubleSide,
  });
  const paintDark = new THREE.MeshStandardMaterial({
    color: palette.roof ?? new THREE.Color(cfg.color).offsetHSL(0, 0, 0.06),
    metalness: 0.22,
    roughness: 0.46,
    side: THREE.DoubleSide,
  });
  // 车窗：高金属度 + 低粗糙度的深色玻璃。金属度让它在没有环境贴图的
  // 场景里也能吃到大灯/日光的高光，不会像纯透明玻璃那样"消失"。
  // 低模车窗：纯色深蓝灰、几乎不反光，避免整块玻璃被环境高光洗成灰白。
  const glass = new THREE.MeshStandardMaterial({
    color: 0x1b2732,
    metalness: 0,
    roughness: 1,
    flatShading: true,
    transparent: false,
    opacity: 1,
    side: THREE.DoubleSide,
    depthWrite: true,
    emissive: new THREE.Color(0x0a141c),
    emissiveIntensity: 0.35,
  });
  // 玻璃 / 灯组 / 轮胎都显式命名：GameCanvas3D 的「车头视角隐藏玻璃」
  // 逻辑按节点名 + 材质名匹配 glass/window，未命名的玻璃会挡住驾驶视野。
  glass.name = 'carGlass';
  const trim = new THREE.MeshStandardMaterial({ color: 0x14171c, metalness: 0.2, roughness: 0.72, side: THREE.DoubleSide, flatShading: true });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc9d0d8, metalness: 0.75, roughness: 0.35, side: THREE.DoubleSide, flatShading: true });
  const satin = new THREE.MeshStandardMaterial({ color: 0x2a2e35, metalness: 0.4, roughness: 0.55, side: THREE.DoubleSide, flatShading: true });
  const interior = new THREE.MeshStandardMaterial({
    color: palette.interior ? new THREE.Color(palette.interior) : 0x1e2024,
    metalness: 0.1,
    roughness: 0.9,
    side: THREE.DoubleSide,
    flatShading: true,
  });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0d0e10, metalness: 0.05, roughness: 0.94 });
  const rim = new THREE.MeshStandardMaterial({ color: palette.rim, metalness: 0.35, roughness: 0.55, flatShading: true });
  const brakeDisc = new THREE.MeshStandardMaterial({ color: 0x6d747d, metalness: 0.95, roughness: 0.42, emissive: 0x000000 });
  const caliper = new THREE.MeshStandardMaterial({ color: palette.caliper, metalness: 0.45, roughness: 0.4 });
  // 熄灯状态是一块「深色灯罩」而不是亮银色灯条：高金属度 + 低粗糙度
  // 让它吃到环境高光，但底色足够深，点亮后由 emissive 接管控色。
  const head = new THREE.MeshStandardMaterial({ color: 0x161b22, metalness: 0.4, roughness: 0.5, emissive: 0x000000, flatShading: true });
  head.name = 'carHeadlight';
  const tail = new THREE.MeshStandardMaterial({ color: 0x4a0909, metalness: 0.25, roughness: 0.45, emissive: 0x000000, flatShading: true });
  tail.name = 'carTaillight';
  const reverse = new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.3, roughness: 0.3, emissive: 0x000000 });
  const indicator = new THREE.MeshStandardMaterial({ color: 0x5b3200, metalness: 0.3, roughness: 0.3, emissive: 0x000000 });
  const plate = new THREE.MeshStandardMaterial({ color: 0xe8eef5, metalness: 0.1, roughness: 0.55, side: THREE.DoubleSide });
  const screen = new THREE.MeshStandardMaterial({ color: 0x0a1520, emissive: 0x1f6fa8, emissiveIntensity: 0.55, metalness: 0.2, roughness: 0.25 });
  const drl = new THREE.MeshBasicMaterial({ color: 0xdfe7ef, transparent: true, opacity: 0.85 });

  return { paint, paintDark, glass, trim, chrome, satin, interior, rubber, rim, brakeDisc, caliper, head, tail, reverse, indicator, plate, screen, drl };
}

// ============================================================
// 圆角矩形截面（车顶平台是平的，侧壁近乎垂直）
// ============================================================

interface RingResult {
  points: Vec2[];
  /** 「平顶平台」四边形的索引范围（含端点）：座舱区域要在这里开顶。 */
  topQuadStart: number;
  topQuadEnd: number;
}

// 低模 poly 风格：每圈只保留必要的采样点，配合 flatShading 形成硬朗折面。
const SIDE_SAMPLES = 2;
const ARC_SAMPLES = 4;
const EDGE_SAMPLES = 2;

/**
 * 生成一个圆角矩形截面（逆时针，从右侧腰线 1/3 高度开始）。
 * 上下边是平的，四角为圆弧，左右两侧为直线（可内收形成 tumblehome）。
 */
function roundedRectRing(st: Station): RingResult {
  const h = Math.max(0.2, st.top - st.bottom);
  const wBottom = st.halfWidth * st.bottomInset;
  const wTop = st.halfWidth * st.topInset;
  const rTop = Math.min(st.radiusTop, h * 0.4, Math.min(wBottom, wTop) * 0.6);
  const rBottom = Math.min(st.radiusBottom, h * 0.3, wBottom * 0.5);

  const yBottom = st.bottom;
  const yTop = st.top;
  const points: Vec2[] = [];
  const push = (x: number, y: number) => points.push({ x, y });

  // 1) 右侧腰线自下而上
  for (let k = 1; k <= SIDE_SAMPLES; k++) {
    const t = k / SIDE_SAMPLES;
    push(lerp(wBottom, wTop, t), lerp(yBottom + rBottom, yTop - rTop, t));
  }

  // 2) 右上圆角
  const trCX = wTop - rTop;
  const trCY = yTop - rTop;
  for (let k = 1; k <= ARC_SAMPLES; k++) {
    const a = (Math.PI / 2) * (k / ARC_SAMPLES);
    push(trCX + Math.cos(a) * rTop, trCY + Math.sin(a) * rTop);
  }

  // 3) 顶边（右 → 左）
  const topEdgeStart = points.length;
  for (let k = 1; k <= EDGE_SAMPLES; k++) {
    const t = k / EDGE_SAMPLES;
    push(lerp(wTop - rTop, -wTop + rTop, t), yTop);
  }

  // 4) 左上圆角
  const tlCX = -wTop + rTop;
  const tlCY = yTop - rTop;
  for (let k = 1; k <= ARC_SAMPLES; k++) {
    const a = Math.PI / 2 + (Math.PI / 2) * (k / ARC_SAMPLES);
    push(tlCX + Math.cos(a) * rTop, tlCY + Math.sin(a) * rTop);
  }

  // 5) 左侧腰线自上而下
  for (let k = 1; k <= SIDE_SAMPLES; k++) {
    const t = k / SIDE_SAMPLES;
    push(lerp(-wTop, -wBottom, t), lerp(yTop - rTop, yBottom + rBottom, t));
  }

  // 6) 左下圆角
  const blCX = -wBottom + rBottom;
  const blCY = yBottom + rBottom;
  for (let k = 1; k <= ARC_SAMPLES; k++) {
    const a = Math.PI + (Math.PI / 2) * (k / ARC_SAMPLES);
    push(blCX + Math.cos(a) * rBottom, blCY + Math.sin(a) * rBottom);
  }

  // 7) 底边（左 → 右）
  for (let k = 1; k <= EDGE_SAMPLES; k++) {
    const t = k / EDGE_SAMPLES;
    push(lerp(-wBottom + rBottom, wBottom - rBottom, t), yBottom);
  }

  // 8) 右下圆角，最后一点正好回到起点
  const brCX = wBottom - rBottom;
  const brCY = yBottom + rBottom;
  for (let k = 1; k <= ARC_SAMPLES; k++) {
    const a = 1.5 * Math.PI + (Math.PI / 2) * (k / ARC_SAMPLES);
    push(brCX + Math.cos(a) * rBottom, brCY + Math.sin(a) * rBottom);
  }

  return {
    points,
    // 平顶平台：从右侧上圆角末端到左侧上圆角起点
    topQuadStart: topEdgeStart - 1,
    topQuadEnd: topEdgeStart + EDGE_SAMPLES - 2,
  };
}

interface LoftOptions {
  caps: boolean;
  classify?: (quad: { avgY: number; avgZ: number; j: number }) => number;
  omit?: (quad: { avgY: number; avgZ: number; j: number }) => boolean;
}

/**
 * 把一串截面放样成三角网格。截面按 z 从大到小（车头 → 车尾）排列，
 * 环绕方向一致，外侧法线朝外。
 */
function buildLoft(stations: Station[], options: LoftOptions): THREE.BufferGeometry {
  const rings = stations.map(roundedRectRing);
  const segmentCount = rings[0].points.length;
  const positions: number[] = [];
  const indices: number[] = [];
  const quadMaterial: number[] = [];

  rings.forEach((ring, i) => {
    ring.points.forEach(p => positions.push(p.x, p.y, stations[i].z));
  });

  for (let i = 0; i < rings.length - 1; i++) {
    const ringA = rings[i];
    const ringB = rings[i + 1];
    const baseA = i * segmentCount;
    const baseB = (i + 1) * segmentCount;
    for (let j = 0; j < segmentCount; j++) {
      const jn = (j + 1) % segmentCount;
      const avgY = (ringA.points[j].y + ringA.points[jn].y + ringB.points[j].y + ringB.points[jn].y) / 4;
      const avgZ = (stations[i].z + stations[i + 1].z) / 2;
      const quad = { avgY, avgZ, j };
      if (options.omit && options.omit(quad)) continue;
      indices.push(baseA + j, baseB + j, baseB + jn, baseA + j, baseB + jn, baseA + jn);
      quadMaterial.push(options.classify ? options.classify(quad) : 0);
    }
  }

  if (options.caps) {
    const front = stations[0];
    const rear = stations[stations.length - 1];
    const frontCenter = positions.length / 3;
    positions.push(0, (front.top + front.bottom) / 2, front.z);
    const rearCenter = positions.length / 3;
    positions.push(0, (rear.top + rear.bottom) / 2, rear.z);
    const rearBase = (rings.length - 1) * segmentCount;
    for (let j = 0; j < segmentCount; j++) {
      const jn = (j + 1) % segmentCount;
      indices.push(frontCenter, j, jn); // 前盖：法线 +Z
      indices.push(rearCenter, rearBase + jn, rearBase + j); // 尾盖：法线 -Z
      quadMaterial.push(0, 0);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();


  // 按材质索引合并成连续 group。
  // 注意：每个四边形写入 6 个索引（两个三角形），group 的 start/count
  // 以索引为单位，因此必须乘 6——乘 3 会让材质区间错位半个网格。
  const INDICES_PER_QUAD = 6;
  let runStart = 0;
  let runMaterial = quadMaterial[0] ?? 0;
  for (let q = 1; q <= quadMaterial.length; q++) {
    const material = quadMaterial[q] ?? -1;
    if (material !== runMaterial) {
      geometry.addGroup(runStart * INDICES_PER_QUAD, (q - runStart) * INDICES_PER_QUAD, runMaterial);
      runStart = q;
      runMaterial = material;
    }
  }
  if (geometry.groups.length === 0) geometry.addGroup(0, indices.length, 0);
  return geometry;
}

// ============================================================
// 车身轮廓采站
// ============================================================

interface HullSpec {
  length: number;
  defaultBottom: number;
  profile: ProfilePoint[];
  arches: WheelArch[];
  step?: number;
}

interface HullBuild {
  geometry: THREE.BufferGeometry;
  stations: Station[];
  stationAt: (z: number) => Station;
  /** 侧围在给定高度的 X 坐标（门板贴合用）。 */
  sideX: (z: number, y: number) => number;
}

function interpolateProfile(profile: ProfilePoint[], z: number, defaultBottom: number) {
  let a = profile[0];
  let b = profile[profile.length - 1];
  for (let i = 0; i < profile.length - 1; i++) {
    if (profile[i].z >= z && profile[i + 1].z <= z) {
      a = profile[i];
      b = profile[i + 1];
      break;
    }
  }
  const span = a.z - b.z;
  const t = span === 0 ? 0 : clamp((a.z - z) / span, 0, 1);
  return {
    top: lerp(a.top, b.top, t),
    halfWidth: lerp(a.halfWidth, b.halfWidth, t),
    bottom: lerp(a.bottom ?? defaultBottom, b.bottom ?? defaultBottom, t),
    topInset: lerp(a.topInset ?? 0.985, b.topInset ?? 0.985, t),
    bottomInset: lerp(a.bottomInset ?? 0.95, b.bottomInset ?? 0.95, t),
  };
}

function makeStation(z: number, spec: HullSpec): Station {
  const p = interpolateProfile(spec.profile, z, spec.defaultBottom);
  let bottom = p.bottom;
  for (const arch of spec.arches) {
    const R = arch.radius + arch.clearance;
    const dz = z - arch.z;
    if (Math.abs(dz) <= R) {
      const archTop = arch.radius + Math.sqrt(Math.max(0, R * R - dz * dz));
      if (archTop > bottom) bottom = archTop;
    }
  }
  // 轮拱处车身不能塌缩成一条线
  if (p.top - bottom < 1.2) bottom = p.top - 1.2;
  const h = p.top - bottom;
  return {
    z,
    bottom,
    top: p.top,
    halfWidth: p.halfWidth,
    bottomInset: p.bottomInset,
    topInset: p.topInset,
    // 腰线处只留很小的圆角：车身上部是"平的平台"，座舱正好落在上面
    radiusTop: Math.min(0.55, Math.max(0.12, h * 0.1)),
    radiusBottom: Math.min(0.9, Math.max(0.15, h * 0.1)),
  };
}

function collectStationZ(spec: HullSpec): number[] {
  const zs = new Set<number>();
  const add = (z: number) => zs.add(Math.round(z * 1000) / 1000);
  const half = spec.length / 2;
  const step = spec.step ?? 1.1;
  for (let z = -half; z <= half + 1e-6; z += step) add(z);
  add(half);
  add(-half);
  spec.profile.forEach(p => add(p.z));
  spec.arches.forEach(arch => {
    const R = arch.radius + arch.clearance;
    for (let i = 0; i <= 18; i++) {
      const th = -Math.PI / 2 + Math.PI * (i / 18);
      add(arch.z + Math.sin(th) * R);
    }
  });
  return [...zs].sort((a, b) => b - a);
}

function buildBodyHull(spec: HullSpec, cabinZ: { front: number; rear: number }): HullBuild {
  const stations = collectStationZ(spec).map(z => makeStation(z, spec));
  const sampleRing = roundedRectRing(stations[Math.floor(stations.length / 2)]);

  const geometry = buildLoft(stations, {
    caps: true,
    omit: ({ j, avgZ }) => {
      // 座舱区域去掉平顶平台，让玻璃座舱与内饰真正连通
      const inCabin = avgZ <= cabinZ.front && avgZ >= cabinZ.rear;
      return inCabin && j >= sampleRing.topQuadStart && j <= sampleRing.topQuadEnd;
    },
  });

  const stationAt = (z: number): Station => {
    if (z >= stations[0].z) return stations[0];
    if (z <= stations[stations.length - 1].z) return stations[stations.length - 1];
    for (let i = 0; i < stations.length - 1; i++) {
      if (stations[i].z >= z && stations[i + 1].z <= z) {
        const a = stations[i];
        const b = stations[i + 1];
        const span = a.z - b.z;
        const t = span === 0 ? 0 : (a.z - z) / span;
        return {
          z,
          bottom: lerp(a.bottom, b.bottom, t),
          top: lerp(a.top, b.top, t),
          halfWidth: lerp(a.halfWidth, b.halfWidth, t),
          bottomInset: lerp(a.bottomInset, b.bottomInset, t),
          topInset: lerp(a.topInset, b.topInset, t),
          radiusTop: lerp(a.radiusTop, b.radiusTop, t),
          radiusBottom: lerp(a.radiusBottom, b.radiusBottom, t),
        };
      }
    }
    return stations[stations.length - 1];
  };

  const sideX = (z: number, y: number): number => {
    const st = stationAt(z);
    const wBottom = st.halfWidth * st.bottomInset;
    const wTop = st.halfWidth * st.topInset;
    const h = Math.max(0.2, st.top - st.bottom);
    const rTop = Math.min(st.radiusTop, h * 0.4, Math.min(wBottom, wTop) * 0.6);
    const rBottom = Math.min(st.radiusBottom, h * 0.3, wBottom * 0.5);
    const y0 = st.bottom + rBottom;
    const y1 = st.top - rTop;
    const t = clamp((y - y0) / Math.max(0.001, y1 - y0), 0, 1);
    return lerp(wBottom, wTop, t);
  };

  return { geometry, stations, stationAt, sideX };
}

// ============================================================
// 座舱（玻璃罩 + 车顶）
// ============================================================

interface CabinSpec {
  beltY: number;
  beltZFront: number;
  beltZRear: number;
  roofZFront: number;
  roofZRear: number;
  roofY: number;
  crown: number;
  beltHalfWidth: number;
  roofHalfWidth: number;
  roofRadius: number;
  /** B 柱所在的 z 位置（前门与后门之间） */
  pillarBZ: number;
}

function buildCabin(spec: CabinSpec): THREE.BufferGeometry {
  const mk = (z: number, top: number, halfWidth: number, bottom: number): Station => ({
    z, top, bottom, halfWidth,
    topInset: 1,
    bottomInset: 1,
    radiusTop: Math.min(spec.roofRadius, Math.max(0.3, (top - bottom) * 0.42)),
    radiusBottom: 0.1,
  });
  const stations: Station[] = [
    mk(spec.beltZFront, spec.beltY, spec.beltHalfWidth, spec.beltY),
    mk(spec.roofZFront, spec.roofY, spec.roofHalfWidth, spec.beltY),
    mk((spec.roofZFront + spec.roofZRear) / 2, spec.roofY + spec.crown, spec.roofHalfWidth * 1.005, spec.beltY),
    mk(spec.roofZRear, spec.roofY, spec.roofHalfWidth, spec.beltY),
    mk(spec.beltZRear, spec.beltY, spec.beltHalfWidth, spec.beltY),
  ];

  const sample = roundedRectRing(stations[1]);
  const isTopQuad = (j: number) => j >= sample.topQuadStart - 1 && j <= sample.topQuadEnd + 1;
  return buildLoft(stations, {
    caps: false,
    // 材质分区：
    //   · 车顶（roofZFront..roofZRear 的顶平台）= 车漆
    //   · 风挡 / 后窗（车顶前后的顶平台斜面）      = 玻璃
    //   · 座舱两侧：A 柱段、C 柱段 = 车漆实体，中间 = 侧窗玻璃
    // 之前把整个侧壁都当玻璃，侧面看像一整条黑带 + 悬空顶盖；
    // 把前后柱段刷成车漆后才读得出「座舱」而不是「帐篷」。
    classify: ({ avgZ, j }) => {
      const top = isTopQuad(j);
      if (top) {
        return avgZ <= spec.roofZFront + 0.01 && avgZ >= spec.roofZRear - 0.01 ? 1 : 0;
      }
      return avgZ > spec.roofZFront || avgZ < spec.roofZRear ? 1 : 0;
    },
    // 玻璃一直铺到腰线：留 2cm 是为了避开与车身顶面的共面闪烁。
    // 之前留 25cm，会在车门顶端与玻璃之间留下一条能看见内饰的缝。
    omit: ({ avgY }) => avgY < spec.beltY + 0.02,
  });
}

// ============================================================
// 车轮：转向节 → 滚动枢轴 → 轮胎/轮毂/制动盘
// ============================================================

interface WheelStyle {
  radius: number;
  width: number;
}

interface WheelRig {
  mount: THREE.Group;
  roll: THREE.Group;
}

function buildWheel(
  style: WheelStyle,
  side: 1 | -1,
  front: boolean,
  trackX: number,
  axleZ: number,
  materials: CarMaterials,
  index: number,
): WheelRig {
  const { radius: r, width: w } = style;
  const mount = new THREE.Group();
  mount.name = `wheel-${front ? 'front' : 'rear'}-${side > 0 ? 'left' : 'right'}`;
  mount.userData.partRole = 'steer-knuckle';
  mount.userData.partSide = side > 0 ? 'left' : 'right';
  mount.userData.axle = front ? 'front' : 'rear';
  mount.userData.vehicleSideX = side * trackX;
  mount.userData.wheelIndex = index;
  mount.position.set(side * trackX, r, axleZ);

  const roll = new THREE.Group();
  roll.name = `${mount.name}-roll`;
  roll.userData.partRole = 'wheel-roll';
  mount.add(roll);

  // 低模轮胎：16 边圆柱，直接封盖（端面就是轮辋的底）
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 16, 1, false), materials.rubber);
  tyre.rotation.z = Math.PI / 2;
  tyre.castShadow = true;
  tyre.receiveShadow = true;
  roll.add(tyre);

  // 轮辋：一块厚的多边形盘 + 中心盖，不做辐条/卡钳这类细节
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.64, r * 0.64, 0.14, 12), materials.rim);
  rim.rotation.z = Math.PI / 2;
  rim.position.x = side * (w * 0.5 - 0.02);
  roll.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.2, 10), materials.trim);
  hub.rotation.z = Math.PI / 2;
  hub.position.x = side * (w * 0.5 + 0.06);
  roll.add(hub);

  return { mount, roll };
}

// ============================================================
// 细节零件
// ============================================================

function tag<T extends THREE.Object3D>(node: T, role: string, side?: 'left' | 'right' | 'centre'): T {
  node.userData.partRole = role;
  if (side) node.userData.partSide = side;
  return node;
}

function meshBox(
  w: number, h: number, d: number,
  material: THREE.Material,
  x: number, y: number, z: number,
  name: string,
  role: string,
  side?: 'left' | 'right' | 'centre',
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  tag(mesh, role, side);
  return mesh;
}

/** 圆角薄板：灯组、后视镜、进气口等细节。 */
function roundedSlab(w: number, h: number, d: number, radius: number, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  const r = Math.min(radius, w / 2 - 0.01, h / 2 - 0.01);
  shape.moveTo(x0 + r, y0);
  shape.lineTo(x1 - r, y0);
  shape.quadraticCurveTo(x1, y0, x1, y0 + r);
  shape.lineTo(x1, y1 - r);
  shape.quadraticCurveTo(x1, y1, x1 - r, y1);
  shape.lineTo(x0 + r, y1);
  shape.quadraticCurveTo(x0, y1, x0, y1 - r);
  shape.lineTo(x0, y0 + r);
  shape.quadraticCurveTo(x0, y0, x0 + r, y0);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 });
  geometry.translate(0, 0, -d / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

/** 两点之间的连杆（A/B/C 柱、支臂）。 */
function strutBetween(
  a: THREE.Vector3,
  b: THREE.Vector3,
  thickness: number,
  material: THREE.Material,
  name: string,
  role: string,
): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, thickness, length), material);
  mesh.position.copy(a).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.clone().normalize());
  mesh.name = name;
  mesh.castShadow = true;
  tag(mesh, role);
  return mesh;
}

/**
 * 沿车身侧面生成一块贴合车身曲面的面板（车门 / 门框 / 侧裙）。
 * 车身侧壁是「下宽上窄」的直线段，因此面板在高度方向线性跟随。
 */
function buildSidePanel(
  hull: HullBuild,
  zFront: number,
  zRear: number,
  yTop: number,
  side: 1 | -1,
  outward: number,
  material: THREE.Material,
  name: string,
  role: string,
): THREE.Mesh {
  const zSegments = 10;
  const ySegments = 4;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= zSegments; i++) {
    const z = lerp(zFront, zRear, i / zSegments);
    const st = hull.stationAt(z);
    const yBottom = st.bottom + 0.35;
    const top = Math.min(yTop, st.top - 0.12);
    for (let j = 0; j <= ySegments; j++) {
      const y = lerp(yBottom, Math.max(yBottom + 0.05, top), j / ySegments);
      const x = side * (hull.sideX(z, y) + outward);
      positions.push(x, y, z);
    }
  }
  for (let i = 0; i < zSegments; i++) {
    for (let j = 0; j < ySegments; j++) {
      const a = i * (ySegments + 1) + j;
      const b = a + 1;
      const c = a + (ySegments + 1);
      const d = c + 1;
      indices.push(a, c, d, a, d, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  tag(mesh, role, side > 0 ? 'left' : 'right');
  return mesh;
}

/** 车身侧壁在 (z, y) 处的半宽；附加件（保险杠、扩散器、灯组）用它限宽，
 *  否则平直的长条会从收窄的车头/车尾两角戳出来。 */
function bodyHalfWidth(hull: HullBuild, z: number, y: number, margin = 0.12): number {
  return Math.max(0.8, hull.sideX(z, y) - margin);
}

// ============================================================
// 车型通用装配
// ============================================================

interface AssemblySpec {
  cfg: CarConfig;
  key: CarType;
  palette: CarPalette;
  hull: HullSpec;
  cabin: CabinSpec;
  wheel: WheelStyle;
  doors: {
    front: [number, number];
    rear: [number, number];
    topY: number;
    gap?: number;
  };
  /** 主动尾翼（可选） */
  spoiler?: { z: number; y: number; width: number; depth: number; closed: number; open: number; activateSpeed: number };
}

interface AssemblyResult {
  parts: CarMeshParts;
  extras: VehicleExtras;
}

interface BuiltAssembly extends AssemblyResult {
  materials: CarMaterials;
  hull: HullBuild;
}

interface ManifestEntry { name: string; role: string; side?: string; binding: string; }

function buildAssembly(spec: AssemblySpec): BuiltAssembly {
  const { cfg } = spec;
  const materials = makeCarMaterials(cfg, spec.palette);
  const group = new THREE.Group();
  group.name = `vehicle-${spec.key.toLowerCase()}`;
  group.userData.vehicleModel = spec.key;
  group.userData.partRole = 'vehicle-root';

  const manifest: ManifestEntry[] = [];

  // ---- 1. 车身 ----
  const hull = buildBodyHull(spec.hull, { front: spec.cabin.beltZFront, rear: spec.cabin.beltZRear });
  const body = new THREE.Mesh(hull.geometry, materials.paint);
  body.name = 'body-shell';
  body.castShadow = true;
  body.receiveShadow = true;
  tag(body, 'body-shell');
  group.add(body);
  manifest.push({ name: 'body-shell', role: 'body-shell', binding: 'sprung-body-tilt-pivot' });

  // ---- 2. 座舱 ----
  const cabinMesh = new THREE.Mesh(buildCabin(spec.cabin), [materials.glass, materials.paintDark]);
  cabinMesh.name = 'greenhouse';
  cabinMesh.castShadow = true;
  tag(cabinMesh, 'greenhouse');
  group.add(cabinMesh);
  manifest.push({ name: 'greenhouse', role: 'greenhouse', binding: 'sprung-body-tilt-pivot' });

  // A/B/C 柱：贴在玻璃罩外侧，让座舱有明确的窗框结构
  const belt = spec.cabin;
  const pillarTop = belt.beltY + 0.08;
  const addPillar = (zBelt: number, zRoof: number, thickness: number, material: THREE.Material, name: string) => {
    for (const side of [1, -1] as Array<1 | -1>) {
      const a = new THREE.Vector3(side * belt.beltHalfWidth * 0.98, pillarTop, zBelt);
      // 车顶四角是圆弧，立柱必须落在平顶区域内，否则会从车顶戳出来
      const b = new THREE.Vector3(side * belt.roofHalfWidth * 0.8, belt.roofY - 0.12, zRoof);
      group.add(strutBetween(a, b, thickness, material, name, 'pillar'));
    }
  };
  addPillar(belt.beltZFront, belt.roofZFront, 0.34, materials.paintDark, 'a-pillar');
  addPillar(belt.pillarBZ, belt.pillarBZ, 0.24, materials.satin, 'b-pillar');
  addPillar(belt.beltZRear, belt.roofZRear, 0.34, materials.paintDark, 'c-pillar');

  // ---- 3. 车门 + 门框 + 把手 ----
  const doors: VehicleDoorBinding[] = [];
  const doorDefs: Array<{ zFront: number; zRear: number; side: 1 | -1; label: string }> = [
    { zFront: spec.doors.front[0], zRear: spec.doors.front[1], side: 1, label: 'door-front-left' },
    { zFront: spec.doors.front[0], zRear: spec.doors.front[1], side: -1, label: 'door-front-right' },
    { zFront: spec.doors.rear[0], zRear: spec.doors.rear[1], side: 1, label: 'door-rear-left' },
    { zFront: spec.doors.rear[0], zRear: spec.doors.rear[1], side: -1, label: 'door-rear-right' },
  ];
  const gap = spec.doors.gap ?? 0.16;
  for (const def of doorDefs) {
    const frame = buildSidePanel(
      hull,
      def.zFront + gap * 1.6, def.zRear - gap * 1.6,
      spec.doors.topY + gap,
      def.side, 0.03, materials.trim,
      `${def.label}-frame`, 'door-frame',
    );
    group.add(frame);

    const panel = buildSidePanel(
      hull,
      def.zFront, def.zRear, spec.doors.topY,
      def.side, 0.09, materials.paint,
      def.label, 'door',
    );
    const hingeZ = def.zFront;
    const hingeX = def.side * (hull.sideX(hingeZ, spec.doors.topY * 0.62) + 0.09);
    const pivot = new THREE.Group();
    pivot.name = `${def.label}-hinge`;
    pivot.position.set(hingeX, 0, hingeZ);
    pivot.userData.partRole = 'door-hinge';
    pivot.userData.partSide = def.side > 0 ? 'left' : 'right';
    panel.geometry.translate(-hingeX, 0, -hingeZ);
    pivot.add(panel);

    // 车门内板：贴在门外板内侧 3.5cm。开门时看到的是深色门内衬，
    // 而不是一块背面透光的薄壳。
    const card = buildSidePanel(
      hull,
      def.zFront - 0.09, def.zRear + 0.09,
      spec.doors.topY - 0.26,
      def.side, 0.055, materials.interior,
      `${def.label}-card`, 'door-card',
    );
    card.geometry.translate(-hingeX, 0, -hingeZ);
    pivot.add(card);

    group.add(pivot);
    doors.push({ pivot, openYaw: def.side > 0 ? -0.62 : 0.62 });
    manifest.push({ name: def.label, role: 'door', side: def.side > 0 ? 'left' : 'right', binding: 'extras.doors' });
  }

  // ---- 4. 车轮 ----
  const axleZ = cfg.wheelbase / 2;
  const trackX = cfg.width / 2 - spec.wheel.width / 2 - 0.16;
  const wheels: THREE.Object3D[] = [];
  const wheelMounts: THREE.Object3D[] = [];
  const frontWheels: THREE.Object3D[] = [];
  let wheelIndex = 0;
  for (const front of [true, false]) {
    for (const side of [1, -1] as Array<1 | -1>) {
      const rig = buildWheel(spec.wheel, side, front, trackX, front ? axleZ : -axleZ, materials, wheelIndex++);
      group.add(rig.mount);
      wheels.push(rig.roll);
      wheelMounts.push(rig.mount);
      if (front) frontWheels.push(rig.mount);
      manifest.push({
        name: rig.mount.name,
        role: 'steer-knuckle',
        side: side > 0 ? 'left' : 'right',
        binding: front ? 'Ackermann steer + suspension travel' : 'suspension travel',
      });
    }
  }

  // ---- 5. 轮眉外扩饰条（车漆色）+ 内衬 ----
  const archFlareRadius = spec.wheel.radius + spec.hull.arches[0].clearance + 0.08;
  for (const axleSign of [1, -1]) {
    for (const side of [1, -1] as Array<1 | -1>) {
      const flare = new THREE.Mesh(
        new THREE.TorusGeometry(archFlareRadius, 0.22, 6, 24, Math.PI),
        materials.paint,
      );
      flare.rotation.y = Math.PI / 2;
      flare.position.set(
        side * (cfg.width / 2 - 0.28),
        spec.wheel.radius,
        axleSign * axleZ,
      );
      flare.castShadow = true;
      tag(flare, 'arch-flare', side > 0 ? 'left' : 'right');
      group.add(flare);
    }
  }

  for (const axleSign of [1, -1]) {
    for (const side of [1, -1] as Array<1 | -1>) {
      const liner = new THREE.Mesh(
        new THREE.CylinderGeometry(spec.wheel.radius + 0.2, spec.wheel.radius + 0.2, spec.wheel.width * 1.2, 20, 1, true, 0, Math.PI),
        materials.trim,
      );
      liner.rotation.z = Math.PI / 2;
      liner.rotation.x = Math.PI / 2;
      liner.position.set(side * (cfg.width / 2 - spec.wheel.width * 0.6), spec.wheel.radius, axleSign * axleZ);
      tag(liner, 'wheel-arch-liner');
      group.add(liner);
    }
  }

  // ---- 6. 方向盘枢轴（低模不建内饰，仅保留转向绑定）----
  const beltY = spec.cabin.beltY;
  const cockpit = new THREE.Group();
  cockpit.name = 'cockpit-interior';
  tag(cockpit, 'interior');
  group.add(cockpit);
  const wheelPivot = new THREE.Group();
  wheelPivot.name = 'steering-wheel-pivot';
  wheelPivot.position.set(3.25, beltY - 1.35, spec.cabin.beltZFront - 2.1);
  wheelPivot.rotation.x = -0.42;
  wheelPivot.userData.partRole = 'steering-wheel-pivot';
  const steeringRim = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.14, 6, 12), materials.interior);
  steeringRim.name = 'steering-wheel';
  tag(steeringRim, 'steering-wheel');
  wheelPivot.add(steeringRim);
  cockpit.add(wheelPivot);
  const steeringWheels: VehicleSteeringWheelBinding[] = [{ object: wheelPivot, ratio: 1 }];
  manifest.push({ name: 'steering-wheel', role: 'steering-wheel', binding: 'extras.steeringWheels' });

  // ---- 7. 后视镜（低模：支臂 + 镜壳）----
  for (const side of [1, -1] as Array<1 | -1>) {
    const mirrorZ = spec.cabin.beltZFront - 0.5;
    const mirrorY = beltY + 1.15;
    group.add(meshBox(1.0, 0.2, 0.3, materials.satin, side * (spec.cabin.beltHalfWidth + 0.3), mirrorY - 0.25, mirrorZ, 'mirror-arm', 'mirror-arm', side > 0 ? 'left' : 'right'));
    const pod = roundedSlab(1.6, 0.6, 0.7, 0.2, materials.paint);
    pod.position.set(side * (spec.cabin.beltHalfWidth + 0.68), mirrorY, mirrorZ);
    pod.name = side > 0 ? 'mirror-left' : 'mirror-right';
    tag(pod, 'mirror', side > 0 ? 'left' : 'right');
    group.add(pod);
  }

  // ---- 8. 主动尾翼 ----
  const extras: VehicleExtras = { doors, steeringWheels, spoilers: [], brakeGlow: [], drl: [] };
  if (spec.spoiler) {
    const sp = spec.spoiler;
    const spoilerPivot = new THREE.Group();
    spoilerPivot.name = 'active-spoiler-pivot';
    spoilerPivot.position.set(0, sp.y, sp.z);
    spoilerPivot.rotation.x = sp.closed;
    tag(spoilerPivot, 'active-spoiler-pivot');
    const wing = roundedSlab(sp.width, 0.34, sp.depth, 0.14, materials.paintDark);
    wing.name = 'active-spoiler';
    wing.position.set(0, 0, -sp.depth * 0.25);
    tag(wing, 'active-spoiler');
    spoilerPivot.add(wing);
    for (const side of [1, -1]) {
      spoilerPivot.add(meshBox(0.12, 0.42, sp.depth * 0.9, materials.paintDark, side * sp.width * 0.48, 0, -sp.depth * 0.25, 'spoiler-endplate', 'active-spoiler'));
    }
    // 两根小立柱：让尾翼「长在车身上」，而不是悬空漂在后备箱上方。
    // 挂在枢轴上，收起（不可见）时一起隐藏，不会在车尾留两根柱子。
    for (const side of [1, -1]) {
      spoilerPivot.add(meshBox(
        0.34, sp.y * 0.14 + 0.5, 0.62, materials.satin,
        side * sp.width * 0.34, -0.32, sp.depth * 0.05,
        'spoiler-pylon', 'active-spoiler',
      ));
    }
    group.add(spoilerPivot);
    extras.spoilers.push({ pivot: spoilerPivot, closedPitch: sp.closed, openPitch: sp.open, activateSpeed: sp.activateSpeed });
    manifest.push({ name: 'active-spoiler', role: 'active-spoiler', binding: 'extras.spoilers' });
  }

  const parts: CarMeshParts = {
    group,
    wheels,
    wheelMounts,
    frontWheels,
    headlights: [],
    taillights: [],
    brakeLights: [],
    reverseLights: [],
    leftIndicators: [],
    rightIndicators: [],
    isGLB: false,
    extras,
  };

  group.userData.partManifest = manifest;
  return { parts, extras, materials, hull };
}

// ============================================================
// 小米 SU7
// ============================================================

function buildXiaomiSU7(cfg: CarConfig): AssemblyResult {
  const half = cfg.length / 2;
  const spec: AssemblySpec = {
    cfg,
    key: CarType.SU7,
    palette: { rim: '#525960', caliper: '#c0392b', interior: '#232529' },
    hull: {
      length: cfg.length,
      defaultBottom: 1.35,
      // 快背轿车：低鼻、长机盖、车顶后段一直滑到接近尾端，只留很短的鸭尾。
      profile: [
        { z: half, top: 6.65, halfWidth: 7.55, bottom: 2.2, topInset: 0.9 },
        { z: half - 1.2, top: 7.15, halfWidth: 8.35, topInset: 0.93 },
        { z: half - 3.0, top: 7.85, halfWidth: 9.0, topInset: 0.96 },
        { z: half - 5.5, top: 8.45, halfWidth: 9.5, topInset: 0.975 },
        { z: half - 8.8, top: 8.8, halfWidth: 9.75, topInset: 0.985 },
        { z: half - 12.0, top: 8.95, halfWidth: 9.8, topInset: 0.985 },
        { z: half - 15.0, top: 9.0, halfWidth: 9.8, topInset: 0.985 },
        { z: 0, top: 9.0, halfWidth: 9.8, topInset: 0.985 },
        { z: -half + 14.0, top: 9.0, halfWidth: 9.8, topInset: 0.985 },
        { z: -half + 12.0, top: 9.02, halfWidth: 9.78, topInset: 0.98 },
        { z: -half + 8.0, top: 9.12, halfWidth: 9.6, topInset: 0.975 },
        { z: -half + 5.0, top: 9.12, halfWidth: 9.2, topInset: 0.965 },
        { z: -half + 2.2, top: 8.85, halfWidth: 8.6, topInset: 0.94 },
        { z: -half, top: 7.6, halfWidth: 7.3, bottom: 2.5, topInset: 0.9 },
      ],
      arches: [
        { z: cfg.wheelbase / 2, radius: 3.52, clearance: 0.26 },
        { z: -cfg.wheelbase / 2, radius: 3.52, clearance: 0.26 },
      ],
    },
    cabin: {
      beltY: 9.0,
      beltZFront: 10.0,
      beltZRear: -17.6,
      roofZFront: 6.0,
      roofZRear: -9.2,
      roofY: 14.2,
      crown: 0.2,
      beltHalfWidth: 9.1,
      roofHalfWidth: 7.3,
      roofRadius: 1.25,
      pillarBZ: 1.1,
    },
    wheel: { radius: 3.52, width: 2.5 },
    doors: { front: [9.2, 1.2], rear: [1.0, -8.6], topY: 8.78 },
    spoiler: { z: -half + 2.4, y: 9.3, width: 12.4, depth: 1.6, closed: -0.14, open: 0.26, activateSpeed: 6.2 },
  };

  const { parts, extras, materials, hull } = buildAssembly(spec);

  const group = parts.group;
  const headHalfW = bodyHalfWidth(hull, half - 0.12, 6.4);
  const tailZ = -half + 0.55;
  const tailHalfW = bodyHalfWidth(hull, tailZ, 7.25);

  // 低模前脸：两条灯 + 下格栅，不做灯腔、日行灯、牌照
  for (const side of [1, -1] as Array<1 | -1>) {
    const lamp = meshBox(4.8, 0.72, 0.3, materials.head, side * (headHalfW - 2.55), 6.5, half + 0.01, side > 0 ? 'headlight-left' : 'headlight-right', 'headlight', side > 0 ? 'left' : 'right');
    group.add(lamp); parts.headlights.push(lamp);
    const indicator = meshBox(0.9, 0.4, 0.26, materials.indicator, side * (headHalfW - 0.5), 6.5, half + 0.01, 'indicator-front', 'indicator', side > 0 ? 'left' : 'right');
    group.add(indicator);
    (side > 0 ? parts.leftIndicators : parts.rightIndicators).push(indicator);

    const tailEnd = meshBox(1.2, 0.8, 0.3, materials.tail, side * (tailHalfW - 0.7), 7.3, tailZ, 'taillight-end', 'taillight', side > 0 ? 'left' : 'right');
    group.add(tailEnd); parts.taillights.push(tailEnd); parts.brakeLights.push(tailEnd);
    const rearIndicator = meshBox(1.0, 0.32, 0.22, materials.indicator, side * (tailHalfW - 0.55), 6.55, tailZ, 'indicator-rear', 'indicator', side > 0 ? 'left' : 'right');
    group.add(rearIndicator);
    (side > 0 ? parts.leftIndicators : parts.rightIndicators).push(rearIndicator);
    const rev = meshBox(0.9, 0.3, 0.18, materials.reverse, side * 2.2, 6.1, tailZ + 0.02, 'reverse-light', 'reverse-light', side > 0 ? 'left' : 'right');
    group.add(rev); parts.reverseLights.push(rev);
  }
  const tailBar = meshBox((tailHalfW - 0.4) * 2, 0.44, 0.26, materials.tail, 0, 7.3, tailZ, 'taillight-bar', 'taillight');
  group.add(tailBar); parts.taillights.push(tailBar); parts.brakeLights.push(tailBar);

  group.add(meshBox(bodyHalfWidth(hull, half - 0.35, 2.6, 0.05) * 2, 1.0, 0.6, materials.trim, 0, 3.1, half - 0.2, 'front-intake', 'front-intake'));
  group.add(meshBox(bodyHalfWidth(hull, -half + 0.5, 2.6, 0.05) * 2, 0.8, 0.6, materials.trim, 0, 2.6, -half + 0.4, 'rear-diffuser', 'rear-diffuser'));
  return { parts, extras };
}

// ============================================================
// 小米 YU7
// ============================================================

function buildXiaomiYU7(cfg: CarConfig): AssemblyResult {
  const half = cfg.length / 2;
  const spec: AssemblySpec = {
    cfg,
    key: CarType.YU7,
    palette: { rim: '#5b6269', caliper: '#2f6fb3', interior: '#232529' },
    hull: {
      length: cfg.length,
      defaultBottom: 1.65,
      profile: [
        { z: half, top: 8.3, halfWidth: 7.4, bottom: 2.9, topInset: 0.9 },
        { z: half - 1.2, top: 8.85, halfWidth: 8.5, topInset: 0.93 },
        { z: half - 3.0, top: 9.45, halfWidth: 9.3, topInset: 0.96 },
        { z: half - 5.5, top: 10.0, halfWidth: 9.65, topInset: 0.975 },
        { z: half - 9.0, top: 10.3, halfWidth: 9.92, topInset: 0.985 },
        { z: half - 12.5, top: 10.42, halfWidth: 9.98, topInset: 0.985 },
        { z: half - 17.0, top: 10.3, halfWidth: 9.98, topInset: 0.985 },
        { z: 0, top: 10.3, halfWidth: 9.98, topInset: 0.985 },
        { z: -half + 16.0, top: 10.3, halfWidth: 9.98, topInset: 0.985 },
        { z: -half + 11.0, top: 10.35, halfWidth: 9.9, topInset: 0.98 },
        { z: -half + 6.0, top: 10.15, halfWidth: 9.6, topInset: 0.975 },
        { z: -half + 2.6, top: 9.6, halfWidth: 8.9, topInset: 0.95 },
        { z: -half, top: 8.6, halfWidth: 7.9, bottom: 2.95, topInset: 0.9 },
      ],
      arches: [
        { z: cfg.wheelbase / 2, radius: 3.76, clearance: 0.3 },
        { z: -cfg.wheelbase / 2, radius: 3.76, clearance: 0.3 },
      ],
    },
    cabin: {
      beltY: 10.2,
      beltZFront: 8.5,
      beltZRear: -18.6,
      roofZFront: 5.2,
      roofZRear: -9.6,
      roofY: 15.9,
      crown: 0.18,
      beltHalfWidth: 9.2,
      roofHalfWidth: 7.0,
      roofRadius: 1.35,
      pillarBZ: 0.75,
    },
    wheel: { radius: 3.76, width: 2.7 },
    doors: { front: [7.8, 0.85], rear: [0.65, -8.2], topY: 10.05 },
    spoiler: { z: -half + 2.6, y: 10.38, width: 12.8, depth: 1.5, closed: -0.1, open: 0.12, activateSpeed: 7.4 },
  };

  const { parts, extras, materials, hull } = buildAssembly(spec);

  const group = parts.group;
  const headHalfW = bodyHalfWidth(hull, half - 0.1, 7.0);
  const tailZ = -half + 0.6;
  const tailHalfW = bodyHalfWidth(hull, tailZ, 7.2);

  // 低模前脸：贯穿日行灯 + 两条灯 + 下格栅
  const halo = meshBox(headHalfW * 1.9, 0.28, 0.2, materials.drl, 0, 7.75, half + 0.02, 'yu7-halo', 'drl');
  group.add(halo); extras.drl.push(halo);

  for (const side of [1, -1] as Array<1 | -1>) {
    const lamp = meshBox(3.4, 0.62, 0.28, materials.head, side * (headHalfW - 1.85), 7.1, half + 0.01, side > 0 ? 'headlight-left' : 'headlight-right', 'headlight', side > 0 ? 'left' : 'right');
    group.add(lamp); parts.headlights.push(lamp);
    const indicator = meshBox(0.9, 0.36, 0.24, materials.indicator, side * (headHalfW - 0.5), 7.1, half + 0.01, 'indicator-front', 'indicator', side > 0 ? 'left' : 'right');
    group.add(indicator);
    (side > 0 ? parts.leftIndicators : parts.rightIndicators).push(indicator);

    // 轮眉：一圈低模弧线，SUV 特征
    for (const axleSign of [1, -1]) {
      const flare = new THREE.Mesh(
        new THREE.TorusGeometry(spec.wheel.radius + 0.5, 0.28, 4, 12, Math.PI),
        materials.trim,
      );
      flare.rotation.y = Math.PI / 2;
      flare.position.set(side * (cfg.width / 2 - spec.wheel.width * 0.5), spec.wheel.radius, axleSign * (cfg.wheelbase / 2));
      tag(flare, 'arch-trim', side > 0 ? 'left' : 'right');
      group.add(flare);
    }

    const tailEnd = meshBox(1.2, 0.8, 0.3, materials.tail, side * (tailHalfW - 0.7), 7.2, tailZ, 'taillight-end', 'taillight', side > 0 ? 'left' : 'right');
    group.add(tailEnd); parts.taillights.push(tailEnd); parts.brakeLights.push(tailEnd);
    const rearIndicator = meshBox(1.0, 0.3, 0.22, materials.indicator, side * (tailHalfW - 0.55), 6.5, tailZ, 'indicator-rear', 'indicator', side > 0 ? 'left' : 'right');
    group.add(rearIndicator);
    (side > 0 ? parts.leftIndicators : parts.rightIndicators).push(rearIndicator);
    const rev = meshBox(0.9, 0.3, 0.18, materials.reverse, side * 2.2, 6.1, tailZ, 'reverse-light', 'reverse-light', side > 0 ? 'left' : 'right');
    group.add(rev); parts.reverseLights.push(rev);
  }
  const tailBar = meshBox((tailHalfW - 0.4) * 2, 0.4, 0.24, materials.tail, 0, 7.2, tailZ, 'taillight-bar', 'taillight');
  group.add(tailBar); parts.taillights.push(tailBar); parts.brakeLights.push(tailBar);

  group.add(meshBox(bodyHalfWidth(hull, half - 0.3, 3.2, 0.05) * 2, 1.2, 0.6, materials.trim, 0, 3.5, half - 0.15, 'front-intake', 'front-intake'));
  group.add(meshBox(bodyHalfWidth(hull, -half + 0.5, 3.0, 0.05) * 2, 1.0, 0.6, materials.trim, 0, 3.0, -half + 0.4, 'rear-diffuser', 'rear-diffuser'));
  return { parts, extras };
}

// ============================================================
// 尊界 V8
// ============================================================

function buildZunjieV8(cfg: CarConfig): AssemblyResult {
  const half = cfg.length / 2;
  const spec: AssemblySpec = {
    cfg,
    key: CarType.ZUNJIE,
    palette: { rim: '#6d747b', caliper: '#b08d4a', interior: '#3a3128' },
    hull: {
      length: cfg.length,
      defaultBottom: 1.35,
      profile: [
        { z: half, top: 8.3, halfWidth: 7.8, bottom: 2.4, topInset: 0.92 },
        { z: half - 1.0, top: 9.0, halfWidth: 8.8, topInset: 0.94 },
        { z: half - 2.6, top: 9.6, halfWidth: 9.4, topInset: 0.96 },
        { z: half - 5.0, top: 10.0, halfWidth: 9.75, topInset: 0.975 },
        { z: half - 9.5, top: 10.3, halfWidth: 9.95, topInset: 0.985 },
        { z: half - 13.5, top: 10.4, halfWidth: 10.0, topInset: 0.985 },
        { z: half - 19.0, top: 10.4, halfWidth: 10.0, topInset: 0.985 },
        { z: 0, top: 10.4, halfWidth: 10.0, topInset: 0.985 },
        { z: -half + 19.0, top: 10.4, halfWidth: 10.0, topInset: 0.985 },
        { z: -half + 16.0, top: 10.4, halfWidth: 9.98, topInset: 0.985 },
        { z: -half + 11.0, top: 10.35, halfWidth: 9.8, topInset: 0.98 },
        { z: -half + 5.0, top: 10.0, halfWidth: 9.3, topInset: 0.97 },
        { z: -half + 1.8, top: 9.2, halfWidth: 8.5, topInset: 0.94 },
        { z: -half, top: 8.2, halfWidth: 7.6, bottom: 2.7, topInset: 0.9 },
      ],
      arches: [
        { z: cfg.wheelbase / 2, radius: 3.72, clearance: 0.28 },
        { z: -cfg.wheelbase / 2, radius: 3.72, clearance: 0.28 },
      ],
    },
    cabin: {
      beltY: 10.4,
      beltZFront: 8.6,
      beltZRear: -18.5,
      roofZFront: 5.4,
      roofZRear: -10.4,
      roofY: 15.3,
      crown: 0.14,
      beltHalfWidth: 9.3,
      roofHalfWidth: 7.15,
      roofRadius: 1.2,
      pillarBZ: 0.3,
    },
    wheel: { radius: 3.72, width: 2.7 },
    doors: { front: [8.4, 0.4], rear: [0.2, -9.8], topY: 10.15 },
    spoiler: { z: -half + 2.2, y: 10.26, width: 12.0, depth: 1.1, closed: -0.05, open: 0.06, activateSpeed: 9.0 },
  };

  const { parts, extras, materials, hull } = buildAssembly(spec);

  const group = parts.group;
  const headHalfW = bodyHalfWidth(hull, half - 0.1, 7.0);
  const tailZ = -half + 0.6;
  const tailHalfW = bodyHalfWidth(hull, tailZ, 7.4);

  // 低模前脸：直瀑格栅只保留「镀铬边框 + 深色内芯」，不做密条
  const grilleFrame = roundedSlab(9.0, 4.0, 0.45, 0.4, materials.satin);
  grilleFrame.position.set(0, 6.3, half + 0.01);
  tag(grilleFrame, 'grille-frame');
  group.add(grilleFrame);
  group.add(meshBox(8.2, 3.4, 0.5, materials.trim, 0, 6.3, half + 0.06, 'grille-inner', 'grille'));

  for (const side of [1, -1] as Array<1 | -1>) {
    const lamp = meshBox(3.6, 0.6, 0.28, materials.head, side * (headHalfW - 2.0), 7.2, half + 0.01, side > 0 ? 'headlight-left' : 'headlight-right', 'headlight', side > 0 ? 'left' : 'right');
    group.add(lamp); parts.headlights.push(lamp);
    const indicator = meshBox(0.9, 0.34, 0.22, materials.indicator, side * (headHalfW - 0.5), 7.2, half + 0.01, 'indicator-front', 'indicator', side > 0 ? 'left' : 'right');
    group.add(indicator);
    (side > 0 ? parts.leftIndicators : parts.rightIndicators).push(indicator);

    const tailEnd = meshBox(1.2, 0.86, 0.3, materials.tail, side * (tailHalfW - 0.72), 7.5, tailZ, 'taillight-end', 'taillight', side > 0 ? 'left' : 'right');
    group.add(tailEnd); parts.taillights.push(tailEnd); parts.brakeLights.push(tailEnd);
    const rearIndicator = meshBox(1.0, 0.3, 0.2, materials.indicator, side * (tailHalfW - 0.55), 6.7, tailZ, 'indicator-rear', 'indicator', side > 0 ? 'left' : 'right');
    group.add(rearIndicator);
    (side > 0 ? parts.leftIndicators : parts.rightIndicators).push(rearIndicator);
    const rev = meshBox(0.9, 0.28, 0.16, materials.reverse, side * 2.3, 6.2, tailZ, 'reverse-light', 'reverse-light', side > 0 ? 'left' : 'right');
    group.add(rev); parts.reverseLights.push(rev);
  }
  const tailBar = meshBox((tailHalfW - 0.4) * 2, 0.44, 0.24, materials.tail, 0, 7.5, tailZ, 'taillight-bar', 'taillight');
  group.add(tailBar); parts.taillights.push(tailBar); parts.brakeLights.push(tailBar);

  group.add(meshBox(bodyHalfWidth(hull, half - 0.4, 2.6, 0.05) * 2, 0.9, 0.6, materials.trim, 0, 2.9, half - 0.25, 'front-lip', 'front-splitter'));
  group.add(meshBox(bodyHalfWidth(hull, -half + 0.5, 2.7, 0.05) * 2, 0.9, 0.6, materials.trim, 0, 2.7, -half + 0.4, 'rear-diffuser', 'rear-diffuser'));
  return { parts, extras };
}

// ============================================================
// 对外接口
// ============================================================

const BUILDERS: Partial<Record<CarType, (cfg: CarConfig) => AssemblyResult>> = {
  [CarType.SU7]: buildXiaomiSU7,
  [CarType.YU7]: buildXiaomiYU7,
  [CarType.ZUNJIE]: buildZunjieV8,
};

/** 该车型是否使用代码几何体（而非 public/models 下的 GLB）。 */
export function hasProceduralCarModel(carType: CarType): boolean {
  return !!BUILDERS[carType];
}

/** 构建三款新车型之一；其余车型返回 null。 */
export function buildProceduralCar(cfg: CarConfig): AssemblyResult | null {
  const builder = BUILDERS[cfg.id];
  return builder ? builder(cfg) : null;
}

/**
 * 统一的车模装配入口：新车型走程序化建模，其余车型继续使用 GLB。
 * 返回的 CarMeshParts 契约与 buildCarMesh / buildCarMeshFromGLB 完全一致，
 * 因此场景构建、展厅预览与游戏循环都不需要区分模型来源。
 */
export async function buildVehicleParts(carType: CarType, cfg: CarConfig): Promise<CarMeshParts> {
  const procedural = BUILDERS[carType];
  let parts: CarMeshParts;
  if (procedural) {
    parts = procedural(cfg).parts;
  } else if (isAuthoredVehicle(carType)) {
    // Seal 08 / L80: the Blender GLB already contains the full body, interior,
    // doors, wheel assemblies and steering pivot. Do not run the legacy
    // generic-wheel/fake-cockpit path.
    parts = buildNativeAuthoredVehicle(await loadModel(CAR_TYPE_TO_MODEL[carType]), cfg);
  } else {
    parts = buildCarMeshFromGLB(applyPlayerVehicleFinish(await loadModel(CAR_TYPE_TO_MODEL[carType]), carType), cfg);
  }
  parts.group.updateWorldMatrix(true, true);
  const front = parts.wheelMounts.filter(m => parts.frontWheels.includes(m));
  const rear = parts.wheelMounts.filter(m => !parts.frontWheels.includes(m));
  const axleZ = (mounts: THREE.Object3D[]) => mounts.reduce((sum, m) => sum + m.position.z, 0) / mounts.length;
  if (front.length && rear.length) {
    parts.group.userData.axleGeometry = {
      wheelbase: axleZ(front) - axleZ(rear),
      rearOffset: -axleZ(rear),
      halfTrack: Math.max(...parts.wheelMounts.map(m=>Math.abs(m.position.x))),
    };
  }
  parts.group.userData.collisionFootprint = collectVehicleFootprint(parts.group, true);
  return parts;
}

// ============================================================
// 每帧动画：尾翼 / 方向盘 / 制动盘热辉
// ============================================================

/**
 * 出生绑定自检
 * --------------
 * 进关时逐个核对「可动部件 → 游戏循环」的绑定是否齐全：四轮、前轮转向、
 * 大灯/尾灯/刹车灯/倒车灯/转向灯、车门、尾翼、方向盘。缺项会让某一帧
 * 的动画悄悄失效（比如灯不亮、轮不转），这里是最后一道保险。
 */
export interface VehicleBindingReport {
  ok: boolean;
  missing: string[];
  counts: Record<string, number>;
}

export function validateVehicleBindings(parts: CarMeshParts): VehicleBindingReport {
  const counts: Record<string, number> = {
    wheels: parts.wheels.length,
    wheelMounts: parts.wheelMounts.length,
    frontWheels: parts.frontWheels.length,
    headlights: parts.headlights.length,
    taillights: parts.taillights.length,
    brakeLights: parts.brakeLights.length,
    reverseLights: parts.reverseLights.length,
    leftIndicators: parts.leftIndicators.length,
    rightIndicators: parts.rightIndicators.length,
    doors: parts.extras?.doors.length ?? 0,
    spoilers: parts.extras?.spoilers.length ?? 0,
    steeringWheels: parts.extras?.steeringWheels.length ?? 0,
  };
  const missing: string[] = [];
  const require = (key: string, min: number, label: string) => {
    if ((counts[key] ?? 0) < min) missing.push(`${label}(${counts[key] ?? 0}/${min})`);
  };
  require('wheels', 4, '车轮滚动');
  require('wheelMounts', 4, '车轮悬挂');
  require('frontWheels', 2, '前轮转向');
  require('headlights', 2, '大灯');
  require('taillights', 1, '尾灯');
  require('brakeLights', 1, '刹车灯');
  require('reverseLights', 1, '倒车灯');
  require('leftIndicators', 1, '左转向灯');
  require('rightIndicators', 1, '右转向灯');
  return { ok: missing.length === 0, missing, counts };
}

export interface VehicleMotionState {
  /** 当前车速（游戏单位，1 单位 = 15 km/h） */
  speed: number;
  maxSpeed: number;
  /** 前轮实际转角（弧度） */
  steer: number;
  steeringWheelAngle?: number; // radians at the driver steering wheel
  throttle: number;
  brake: number;
  lightsOn: boolean;
  dt?: number;
}

/** 每帧更新与驾驶状态绑定的可动部件。 */
export function updateVehicleExtras(extras: VehicleExtras | undefined, state: VehicleMotionState): void {
  if (!extras) return;
  const dt = state.dt ?? 1 / 60;
  const speedAbs = Math.abs(state.speed);

  // 主动尾翼：超过阈值车速后升起，角度随速度平滑过渡
  extras.spoilers.forEach(sp => {
    const activation = clamp((speedAbs - sp.activateSpeed) / 2.2, 0, 1);
    const eased = activation * activation * (3 - 2 * activation);
    const target = lerp(sp.closedPitch, sp.openPitch, eased);
    sp.pivot.rotation.x += (target - sp.pivot.rotation.x) * Math.min(1, dt * 6);
    // 静止时尾翼完全收起（隐藏），超过阈值才升起；避免停车时后备箱上
    // 一直横着一块板，从侧后视角看像货斗挡板。
    sp.pivot.visible = activation > 0.015;
    sp.pivot.scale.set(1, 0.2 + 0.8 * eased, 1);
  });

  // 方向盘：实际前轮角 × 转向系传动比（约 5.2:1），负号对应视觉方向
  extras.steeringWheels.forEach(binding => {
    const angle = -(state.steeringWheelAngle ?? state.steer * 15.5) * binding.ratio;
    if (binding.axis) binding.object.quaternion.setFromAxisAngle(binding.axis, angle);
    else binding.object.rotation.z = angle;
  });

  // 制动盘：重刹时发红，模拟热辉
  extras.brakeGlow.forEach(item => {
    const intensity = clamp(state.brake * item.maxIntensity, 0, item.maxIntensity);
    item.material.emissive.setHex(intensity > 0.15 ? 0xff3b12 : 0x000000);
    item.material.emissiveIntensity = intensity;
  });
}

/** 展厅姿态：车门半开 + 尾翼抬起，用于选车界面的「部件展示」。 */
export function applyShowroomPose(extras: VehicleExtras | undefined, openAmount = 0.5): void {
  if (!extras) return;
  extras.doors.forEach(door => {
    door.pivot.rotation.y = door.openYaw * openAmount;
  });
  extras.spoilers.forEach(sp => {
    sp.pivot.rotation.x = lerp(sp.closedPitch, sp.openPitch, 0.45);
    sp.pivot.visible = true;
    sp.pivot.scale.set(1, 0.75, 1);
  });
}
