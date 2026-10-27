import {assetUrl} from '../utils/assetUrl';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CarType, CarConfig } from '../types';
import { neutralizeConceptWheels } from './conceptVehicle';
import { applyLowCostConceptGlass } from '../utils/materialClassification';

/**
 * GLB 模型加载与归一化管理
 *
 * 所有 GLB 文件存放在 public/models/，Vite 会原样复制到 dist/。
 * GLTFLoader 通过 URL 加载。
 *
 * 归一化策略：
 *   1. 加载后计算包围盒 Box3
 *   2. 等比缩放到目标尺寸（targetLength = 车长, targetWidth = 车宽）
 *   3. Y 轴对齐地面（minY → 0）
 *   4. X/Z 居中
 */

const loader = new GLTFLoader();

// ---- 模型注册表 ----
export interface ModelDef {
  file: string;
  targetLength?: number;  // Z 轴目标长度（车辆用）
  targetWidth?: number;   // X 轴目标宽度（车辆用）
  targetHeight?: number;  // Y 轴目标高度（建筑/道具用）
  uniformScale?: number;  // 直接指定缩放（不按目标尺寸算）
  yaw?: number;           // 模型自身车头方向修正
}

export const MODEL_REGISTRY: Record<string, ModelDef> = {
 trike:{file:'cars/fleet-trike.glb',uniformScale:10},
 tractor:{file:'cars/fleet-tractor.glb',uniformScale:10},
 semi:{file:'cars/fleet-semi.glb',uniformScale:10},
 cybertruck:{file:'cars/fleet-cybertruck.glb',uniformScale:10},
 revuelto:{file:'cars/fleet-revuelto.glb',uniformScale:10},
 veyron:{file:'cars/fleet-veyron.glb',uniformScale:10},
 v800:{file:'cars/fleet-v800.glb',uniformScale:10},
 mini:{file:'cars/fleet-mini.glb',uniformScale:10},

 tai7:{file:'cars/fangchengbao-tai7.glb',uniformScale:10},
 jeep:{file:'cars/trail-jeep.glb',uniformScale:10},
 midibus:{file:'cars/training-midibus.glb',uniformScale:10},coach:{file:'cars/training-coach.glb',uniformScale:10},
 van:{file:'cars/training-van.glb',uniformScale:10},lightTruck:{file:'cars/training-light-truck.glb',uniformScale:10},
 liI9:{file:'cars/li-i9.glb',uniformScale:10},
 n90:{file:'cars/xiaomi-n90.glb',uniformScale:10},
  // 车辆 — targetLength/targetWidth 对应 CarConfig
  sedan:     { file: 'cars/sedan-red.glb',    targetLength: 51.5, targetWidth: 20.0, targetHeight: 15.1, yaw: Math.PI },
  suv:       { file: 'cars/suv-gray.glb',     targetLength: 51.5, targetWidth: 20.0, targetHeight: 17.7 },
  // Blender-authored production-style assets. Authored in metres with a
  // uniform 10 units/m scale: never per-axis normalisation (that made tyres
  // elliptical). No yaw offset: the Blender nose points -Y, which exports to
  // glTF +Z, matching the game's forward axis.
  seal08:    { file: 'cars/byd-seal-08.glb', uniformScale: 10 },
  l80:       { file: 'cars/onvo-l80.glb',    uniformScale: 10 },
  sports:    { file: 'cars/concept-car.glb', targetLength: 45.7, targetWidth: 22.42, targetHeight: 11.7 },
  truck:     { file: 'cars/trail-pickup.glb', uniformScale: 10 },
  // 交通车额外车型
  taxi:      { file: 'cars/taxi-yellow.glb',  targetLength: 47, targetWidth: 19 },
  police:    { file: 'cars/police-car.glb',   targetLength: 50, targetWidth: 21 },
  bus:       { file: 'cars/bus-city.glb',     targetLength: 90, targetWidth: 26 },
  car2:      { file: 'cars/car-generic.glb',  targetLength: 47, targetWidth: 19 },
  // 建筑
  buildingA: { file: 'buildings/office-large.glb',    targetHeight: 35 },
  buildingB: { file: 'buildings/office-medium.glb',   targetHeight: 40 },
  buildingC: { file: 'buildings/commercial-big.glb',  targetHeight: 30 },
  // 道路
  roadKit:   { file: 'roads/road-kit.glb',            uniformScale: 1.0 },
  roadBits:  { file: 'roads/road-bits.glb',           uniformScale: 1.0 },
  // 道具
  busStop:   { file: 'props/bus-stop-sign.glb',       targetHeight: 14 },
  // 备用车辆
  suvWhite:  { file: 'cars/suv-white.glb',     targetLength: 51.5, targetWidth: 20.0 },
  truckHeavy:{ file: 'cars/truck-heavy.glb',   targetLength: 55, targetWidth: 22 },
  busMontreal:{file: 'cars/montreal-bus.glb',  targetLength: 92, targetWidth: 26 },
  gbBlank:   { file: 'cars/gb-blank.glb',      targetLength: 47, targetWidth: 19 },
};

// CarType → 模型注册名映射
export const CAR_TYPE_TO_MODEL: Record<CarType, string> = {
 [CarType.TRIKE]:'trike',
 [CarType.TRACTOR]:'tractor',
 [CarType.SEMI]:'semi',
 [CarType.CYBERTRUCK]:'cybertruck',
 [CarType.REVUELTO]:'revuelto',
 [CarType.VEYRON]:'veyron',
 [CarType.V800]:'v800',
 [CarType.MINI]:'mini',

 [CarType.TAI7]:'tai7', [CarType.LI_I9]:'liI9', [CarType.N90]:'n90',
 [CarType.JEEP]:'jeep',[CarType.MIDIBUS]:'midibus',[CarType.COACH]:'coach',[CarType.VAN]:'van',[CarType.LIGHT_TRUCK]:'lightTruck',
  [CarType.SEDAN]: 'seal08',
  [CarType.SEAL08]: 'seal08',
  [CarType.SUV]: 'l80',
  [CarType.SPORTS]: 'sports',
  [CarType.TRUCK]: 'truck',
  // 以下三款车没有 GLB 资产，由 three/vehicleModels.ts 程序化建模。
  // 这里保留映射只为让 Record<CarType, string> 完整；真正的构建入口是
  // buildVehicleParts()，它会先判断 hasProceduralCarModel()。
  [CarType.SU7]: 'su7',
  [CarType.YU7]: 'yu7',
  [CarType.ZUNJIE]: 'zunjie',
};

// 交通车可选模型池
// NPC/parked cars use the lower-detail training pool. Concept GT is player-only.
export const TRAFFIC_CAR_MODELS = ['sedan', 'suv', 'taxi', 'police', 'car2'];

// 建筑模型池
export const BUILDING_MODELS = ['buildingA', 'buildingB', 'buildingC'];

// ---- 缓存 ----
const cache = new Map<string, THREE.Group>();

/**
 * 加载 GLB 并归一化
 */
export async function loadModel(name: string): Promise<THREE.Group> {
  // 已缓存则 clone
  if (cache.has(name)) {
    return cache.get(name)!.clone(true);
  }

  const def = MODEL_REGISTRY[name];
  if (!def) throw new Error(`Unknown model: ${name}`);

  const url = assetUrl(`models/${def.file.split('/').map(encodeURIComponent).join('/')}`);
  const gltf = await loader.loadAsync(url);
  const group = gltf.scene;

  // 启用阴影
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  // ---- 归一化 ----
  normalizeModel(group, def);

  // Concept GT's physical transmission glass triggers a whole-scene
  // transmission target for the main render and every mirror camera. Use a
  // normal alpha/reflective window for all Concept views (player + preview).
  if (name === 'sports') {
    const seen = new Set<THREE.Material>();
    group.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!material || seen.has(material)) continue;
        seen.add(material);
        if (/glass/i.test(material.name) || (material as THREE.MeshPhysicalMaterial).transmission > 0) {
          applyLowCostConceptGlass(material);
        }
      }
    });
  }

  // 缓存原始（未 clone 的）
  cache.set(name, group);
  return group.clone(true);
}

/**
 * Apply the player-facing showroom finish without mutating cached GLB
 * materials. The same function is used by the garage preview and the live
 * player vehicle, so the selected car always matches what enters the lesson.
 */
export function applyPlayerVehicleFinish(group: THREE.Group, carType: CarType): THREE.Group {
  if (carType !== CarType.SEDAN) return group;
  group.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    const recolor = (source: THREE.Material) => {
      const material = source.clone();
      if (material instanceof THREE.MeshStandardMaterial) {
        if (material.name === 'Material.001') {
          material.color.set('#f4f4f5');
          material.roughness = 0.38;
          material.metalness = 0.16;
        } else if (material.name === 'Material.006') {
          material.color.set('#05070a');
          material.roughness = 0.2;
          material.metalness = 0.08;
        }
      }
      return material;
    };
    child.material = Array.isArray(child.material)
      ? child.material.map(recolor)
      : recolor(child.material);
  });
  return group;
}

/**
 * 归一化模型：等比缩放到目标尺寸 + Y 坐地 + XZ 居中
 */
export function normalizeModel(group: THREE.Group, def: ModelDef) {
  const nativeConcept = def.file === 'cars/concept-car.glb';
  const authoredCar = def.file.startsWith('cars/fleet-') || ['cars/byd-seal-08.glb','cars/onvo-l80.glb','cars/fangchengbao-tai7.glb','cars/li-i9.glb','cars/xiaomi-n90.glb',
    'cars/trail-jeep.glb','cars/training-midibus.glb','cars/training-coach.glb','cars/training-van.glb','cars/training-light-truck.glb'].includes(def.file);
  const preciseBounds = nativeConcept || authoredCar;
  if (nativeConcept) neutralizeConceptWheels(group);
  const box = new THREE.Box3().setFromObject(group, preciseBounds);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  if (size.x === 0 || size.y === 0 || size.z === 0) return;

  let scale = 1;

  if (nativeConcept) {
    scale = def.targetLength! / size.z;
    group.scale.setScalar(scale);
  } else if (def.uniformScale) {
    scale = def.uniformScale;
  } else if (def.targetLength && def.targetWidth) {
    // Keep the authored vehicle envelope: body width/height/length must agree
    // with cc.width/height/length and the collision footprint. Wheel roundness
    // is handled at the wheel rig (see buildCarMeshFromGLB), not by shrinking
    // the whole car.
    group.scale.set(
      def.targetWidth / size.x,
      def.targetHeight ? def.targetHeight / size.y : def.targetWidth / size.x,
      def.targetLength / size.z,
    );
  } else if (def.targetHeight) {
    // 建筑/道具：按高度缩放
    scale = def.targetHeight / size.y;
  }

  if (!(def.targetLength && def.targetWidth)) group.scale.setScalar(scale);
  if (def.yaw) group.rotation.y = def.yaw;

  // 重新计算包围盒
  // Batched trim meshes can have rotated local boxes extending below the
  // actual tyres. Ground native cars using vertices, not transformed AABBs.
  const box2 = new THREE.Box3().setFromObject(group, preciseBounds);
  const center2 = new THREE.Vector3();
  box2.getCenter(center2);

  // XZ 居中
  if(!group.getObjectByName('CarRoot')?.userData.fixed_origin)group.position.x -= center2.x;
  if(!group.getObjectByName('CarRoot')?.userData.fixed_origin)group.position.z -= center2.z;
  // Y 坐地
  group.position.y -= box2.min.y;
}

/**
 * 预加载所有模型
 */
export async function preloadModels(): Promise<void> {
  const names = Object.keys(MODEL_REGISTRY);
  await Promise.all(names.map(n => loadModel(n).catch(() => null)));
}

/**
 * 从 GLB group 中提取轮子节点
 * 按名称匹配 "wheel" / "Wheel" + "front"/"back"/"rear"
 */
export function extractWheels(group: THREE.Group): { frontWheels: THREE.Object3D[]; rearWheels: THREE.Object3D[] } {
  const frontWheels: THREE.Object3D[] = [];
  const rearWheels: THREE.Object3D[] = [];

  const isWheelName = (name: string) => {
    const n = name.toLowerCase();
    return n.includes('wheel') || n.includes('tyre') || n.includes('tire');
  };

  group.traverse((child) => {
    const name = child.name.toLowerCase();
    // Blender exports often give the wheel group and every mesh below it a
    // wheel-like name. Only keep the highest wheel node, otherwise steering a
    // wheel also rotates its children a second time.
    if (isWheelName(name) && !isWheelName(child.parent?.name || '')) {
      if (name.includes('front') || name.includes('fl') || name.includes('fr')) {
        frontWheels.push(child);
      } else if (name.includes('back') || name.includes('rear') || /(?:_|\b)(rl|rr)(?:_|\b)/.test(name)) {
        rearWheels.push(child);
      }
    }
  });
  return { frontWheels, rearWheels };
}

/**
 * 清理缓存
 */
export function disposeModelCache() {
  cache.forEach((group) => {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
    });
  });
  cache.clear();
}

// ---- 模型库分类（供地图编辑器使用） ----
export interface ModelLibraryCategory {
  key: string;
  label: string;
  labelCN: string;
  models: ModelLibraryItem[];
}
export interface ModelLibraryItem {
  key: string;       // MODEL_REGISTRY key
  name: string;      // display name
  category: string;  // 'car' | 'building' | 'road' | 'prop' | 'marking'
  obstacleType?: ObstacleType; // 放置时创建的 Obstacle type
  defaultWidth?: number;
  defaultHeight?: number;
  defaultColor?: string;
}
type ObstacleType = 'wall' | 'car' | 'cone' | 'box';

export const MODEL_LIBRARY: ModelLibraryCategory[] = [
  {
    key: 'cars', label: 'Cars', labelCN: '汽车模型',
    models: [
      { key: 'sedan',     name: 'Sedan (Red)',       category: 'car', obstacleType: 'car', defaultWidth: 20, defaultHeight: 51, defaultColor: '#e53e3e' },
      { key: 'suv',       name: 'SUV (Gray)',         category: 'car', obstacleType: 'car', defaultWidth: 20, defaultHeight: 51, defaultColor: '#718096' },
      { key: 'suvWhite',  name: 'SUV (White)',        category: 'car', obstacleType: 'car', defaultWidth: 20, defaultHeight: 51, defaultColor: '#f7fafc' },
      { key: 'sports',    name: 'Sports (Orange)',    category: 'car', obstacleType: 'car', defaultWidth: 19, defaultHeight: 46, defaultColor: '#ed8936' },
      { key: 'truck',     name: 'Pickup Truck',       category: 'car', obstacleType: 'car', defaultWidth: 20, defaultHeight: 55, defaultColor: '#2d3748' },
      { key: 'taxi',      name: 'Taxi (Yellow)',      category: 'car', obstacleType: 'car', defaultWidth: 19, defaultHeight: 47, defaultColor: '#ecc94b' },
      { key: 'police',    name: 'Police Car',         category: 'car', obstacleType: 'car', defaultWidth: 21, defaultHeight: 50, defaultColor: '#2b6cb0' },
      { key: 'bus',       name: 'City Bus',           category: 'car', obstacleType: 'car', defaultWidth: 26, defaultHeight: 90, defaultColor: '#2c5282' },
      { key: 'car2',      name: 'Generic Car',        category: 'car', obstacleType: 'car', defaultWidth: 19, defaultHeight: 47, defaultColor: '#4a5568' },
      { key: 'truckHeavy',name: 'Heavy Truck',        category: 'car', obstacleType: 'car', defaultWidth: 22, defaultHeight: 55, defaultColor: '#1a202c' },
      { key: 'busMontreal',name:'Montreal Bus',       category: 'car', obstacleType: 'car', defaultWidth: 26, defaultHeight: 92, defaultColor: '#2a4365' },
      { key: 'gbBlank',   name: 'GB Blank',           category: 'car', obstacleType: 'car', defaultWidth: 19, defaultHeight: 47, defaultColor: '#a0aec0' },
    ],
  },
  {
    key: 'buildings', label: 'Buildings', labelCN: '建筑模型',
    models: [
      { key: 'buildingA', name: 'Office (Large)',     category: 'building', obstacleType: 'wall', defaultWidth: 120, defaultHeight: 80, defaultColor: '#5a6b7a' },
      { key: 'buildingB', name: 'Office (Medium)',    category: 'building', obstacleType: 'wall', defaultWidth: 100, defaultHeight: 70, defaultColor: '#4a5568' },
      { key: 'buildingC', name: 'Commercial (Big)',   category: 'building', obstacleType: 'wall', defaultWidth: 140, defaultHeight: 100, defaultColor: '#6b7c93' },
    ],
  },
  {
    key: 'roads', label: 'Roads', labelCN: '道路模型',
    models: [
      { key: 'roadKit',   name: 'Modular Road Kit',   category: 'road', obstacleType: 'wall', defaultWidth: 200, defaultHeight: 200, defaultColor: '#3a3a3e' },
      { key: 'roadBits',  name: 'Road Bits',          category: 'road', obstacleType: 'wall', defaultWidth: 100, defaultHeight: 100, defaultColor: '#353539' },
    ],
  },
  {
    key: 'props', label: 'Props', labelCN: '道具/标牌',
    models: [
      { key: 'busStop',   name: 'Bus Stop Sign',      category: 'prop', obstacleType: 'wall', defaultWidth: 15, defaultHeight: 15, defaultColor: '#e2e8f0' },
    ],
  },
];
