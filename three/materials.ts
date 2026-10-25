import * as THREE from 'three';

/**
 * 低多边形风格材质工厂（Bruno Simon 风格）
 * 明亮、柔和、纯色，flatShading
 * 不用 emissive（避免自发光），靠灯光打亮
 */

// ---- 辅助：hex 字符串转 number ----
const colorValue = (c: string | number): THREE.ColorRepresentation => {
  if (typeof c === 'number') return c;
  const rgba = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgba) return (Number(rgba[1]) << 16) | (Number(rgba[2]) << 8) | Number(rgba[3]);
  return c;
};

/** 创建一个 flat-shading 纯色 Lambert 材质 */
export function flatMat(color: string | number, opts: {
  emissive?: string | number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  depthWrite?: boolean;
  polygonOffset?: boolean;
  polygonOffsetFactor?: number;
  polygonOffsetUnits?: number;
} = {}): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({
    color: colorValue(color),
    flatShading: true,
    emissive: opts.emissive ? colorValue(opts.emissive) : 0x000000,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1.0,
    side: opts.side ?? THREE.FrontSide,
    depthWrite: opts.depthWrite ?? true,
    polygonOffset: opts.polygonOffset ?? false,
    polygonOffsetFactor: opts.polygonOffsetFactor ?? 0,
    polygonOffsetUnits: opts.polygonOffsetUnits ?? 0,
  });
  return mat;
}

// ---- 常用材质缓存（避免重复创建） ----
let _cache: Record<string, THREE.MeshLambertMaterial> = {};
let _roadCache: Record<string, THREE.MeshStandardMaterial> = {};
let _garageWallCache: Record<string, THREE.MeshStandardMaterial[]> = {};
let _asphaltTexture: THREE.CanvasTexture | null = null;

function cached(key: string, color: string | number, opts?: Parameters<typeof flatMat>[1]): THREE.MeshLambertMaterial {
  if (_cache[key]) return _cache[key];
  const m = flatMat(color, opts);
  _cache[key] = m;
  return m;
}

function asphaltTexture() {
  if (_asphaltTexture) return _asphaltTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#b8b8b8';
  ctx.fillRect(0, 0, 128, 128);
  let seed = 918273;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 900; i++) {
    const shade = Math.floor(105 + rand() * 115);
    const alpha = 0.12 + rand() * 0.28;
    const size = rand() > 0.82 ? 2 : 1;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${alpha})`;
    ctx.fillRect(rand() * 128, rand() * 128, size, size);
  }
  ctx.strokeStyle = 'rgba(70,70,74,0.2)';
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    const startX = rand() * 128;
    const startY = rand() * 128;
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + (rand() - 0.5) * 28, startY + 12 + rand() * 28);
    ctx.stroke();
  }
  _asphaltTexture = new THREE.CanvasTexture(canvas);
  _asphaltTexture.wrapS = THREE.RepeatWrapping;
  _asphaltTexture.wrapT = THREE.RepeatWrapping;
  _asphaltTexture.repeat.set(10, 5);
  _asphaltTexture.colorSpace = THREE.SRGBColorSpace;
  return _asphaltTexture;
}

let _groundTexture: THREE.CanvasTexture | null = null;
let _contactShadowTexture: THREE.CanvasTexture | null = null;

/** Large-scale muted ground grain with faint expansion joints. */
export function beijingGroundMaterial(): THREE.MeshLambertMaterial {
  if (!_groundTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#b7b0a1'; ctx.fillRect(0, 0, 256, 256);
    let seed = 7319;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 2600; i++) {
      const v = Math.floor(120 + rand() * 70);
      ctx.fillStyle = `rgba(${v},${v - 3},${v - 8},${0.08 + rand() * 0.12})`;
      ctx.fillRect(rand() * 256, rand() * 256, rand() > 0.8 ? 2 : 1, 1);
    }
    ctx.strokeStyle = 'rgba(92,88,80,0.16)';
    ctx.lineWidth = 1;
    for (let p = 0; p < 256; p += 64) {
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 256); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(256, p); ctx.stroke();
    }
    _groundTexture = new THREE.CanvasTexture(canvas);
    _groundTexture.wrapS = _groundTexture.wrapT = THREE.RepeatWrapping;
    _groundTexture.repeat.set(90, 116);
    _groundTexture.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshLambertMaterial({ color: '#ffffff', map: _groundTexture });
}

/** Soft radial blob used as a cheap contact shadow under cars/buildings. */
export function contactShadowTexture(): THREE.CanvasTexture {
  if (!_contactShadowTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    gradient.addColorStop(0, 'rgba(0,0,0,0.52)');
    gradient.addColorStop(0.58, 'rgba(0,0,0,0.25)');
    gradient.addColorStop(0.86, 'rgba(0,0,0,0.07)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    _contactShadowTexture = new THREE.CanvasTexture(canvas);
    _contactShadowTexture.colorSpace = THREE.SRGBColorSpace;
  }
  return _contactShadowTexture;
}

function roadFinish(key: string, color: string): THREE.MeshStandardMaterial {
  if (_roadCache[key]) return _roadCache[key];
  const texture = asphaltTexture();
  const material = new THREE.MeshStandardMaterial({
    color,
    map: texture,
    bumpMap: texture,
    bumpScale: 0.34,
    roughness: 0.68,
    metalness: 0.11,
    emissive: new THREE.Color('#08090b'),
    emissiveIntensity: 0.08,
    // Side-mirror projection is horizontally inverted; double-sided asphalt
    // keeps the road visible after that winding reversal.
    side: THREE.DoubleSide,
  });
  _roadCache[key] = material;
  return material;
}

/**
 * 车库墙体使用六面分色的 PBR 材质。BoxGeometry 的材质顺序是
 * 右 / 左 / 上 / 下 / 前 / 后，侧面的冷暖和明度差可以在拐角处立即给出方向参照。
 */
export function garageWallMaterials(
  baseColor: string,
  isPillar = false,
  isBoundary = false,
): THREE.Material[] {
  const key = `${baseColor}-${isPillar ? 'pillar' : 'wall'}-${isBoundary ? 'boundary' : 'inside'}`;
  if (_garageWallCache[key]) return _garageWallCache[key];

  const base = new THREE.Color(baseColor);
  if (isBoundary) base.set('#252a32');
  const colors = [
    base.clone().offsetHSL(-0.018, 0.04, 0.12),
    base.clone().offsetHSL(0.018, -0.02, -0.08),
    base.clone().offsetHSL(0, -0.05, 0.24),
    base.clone().offsetHSL(0, 0, -0.16),
    base.clone().offsetHSL(0.025, 0.06, 0.07),
    base.clone().offsetHSL(-0.025, -0.02, -0.12),
  ];
  if (isPillar) {
    colors[0].set('#9aa5b4');
    colors[1].set('#596474');
    colors[2].set('#cbd5e1');
    colors[4].set('#7f8b9b');
    colors[5].set('#46515f');
  }
  const materials = colors.map((color, index) => new THREE.MeshStandardMaterial({
    color,
    roughness: index === 2 ? 0.58 : 0.76,
    metalness: isPillar ? 0.12 : 0.04,
    emissive: new THREE.Color(index === 0 || index === 4 ? '#121820' : '#080b10'),
    emissiveIntensity: 0.14,
    flatShading: true,
  }));
  _garageWallCache[key] = materials;
  return materials;
}

/** 清空材质缓存（场景销毁时调用） */
export function disposeMaterials() {
  Object.values(_cache).forEach(m => m.dispose());
  Object.values(_roadCache).forEach(m => m.dispose());
  Object.values(_garageWallCache).forEach(materials => materials.forEach(m => m.dispose()));
  _asphaltTexture?.dispose();
  _cache = {};
  _roadCache = {};
  _garageWallCache = {};
  _asphaltTexture = null;
}

// ---- 预设材质（明亮柔和的 Bruno Simon 风格调色板） ----
/**
 * 车辆专用摄影棚环境贴图
 * ----------------------
 * 车漆 / 玻璃 / 轮毂都是高金属度材质：没有 environment 时只能吃到直射光，
 * 高光会发黑发闷。这里用一个内联的小房间生成 PMREM（不引 examples/jsm，
 * 避免 Vite 解析出第二份 three），只赋给玩家车模的材质，不改变场景光照。
 */
export function createVehicleEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const envScene = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(240, 120, 240),
    new THREE.MeshBasicMaterial({ color: 0x2a3442, side: THREE.BackSide }),
  );
  room.position.y = 40;
  envScene.add(room);

  const panel = (w: number, h: number, x: number, y: number, z: number, color: number, power: number) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }),
    );
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 20, 0);
    envScene.add(mesh);
  };
  panel(150, 90, 0, 92, 0, 0xffffff, 2.6);     // 顶部柔光箱
  panel(120, 70, -110, 40, 60, 0xdbe6f2, 1.9);  // 左前侧冷光
  panel(120, 70, 110, 40, -70, 0xf3ece2, 1.5);  // 右后暖光
  panel(90, 120, 0, 30, -120, 0xb9c6d6, 1.1);   // 背光

  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(envScene, 0.02).texture;
  pmrem.dispose();
  envScene.traverse(node => {
    if (node instanceof THREE.Mesh) {
      node.geometry.dispose();
      (node.material as THREE.Material).dispose();
    }
  });
  return texture;
}

/** 把环境贴图应用到车模的 PBR 材质（车漆、玻璃、镀铬、轮毂）。 */
export function applyVehicleEnvironment(root: THREE.Object3D, envMap: THREE.Texture, intensity = 0.9) {
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach(material => {
      if (!(material instanceof THREE.MeshStandardMaterial)) return;
      // 低模车窗保持纯色平面，不接收环境反射（否则会被高光洗成灰白）。
      if (material.name === 'carGlass') return;
      material.envMap = envMap;
      material.envMapIntensity = intensity;
      material.needsUpdate = true;
    });
  });
}

const _markingMaterialCache = new Map<string, THREE.MeshLambertMaterial>();
const WHITE_MARKING_COLORS = new Set(['#fff', '#ffffff', '#f5f5f5', '#f8fafc', '#fafafa', 'white']);
const YELLOW_MARKING_COLORS = new Set(['#fbbf24', '#facc15', '#f59e0b', '#ffcc00', '#ffff00']);

/**
 * Resolve an authored marking colour without collapsing arbitrary colours to
 * white. White/yellow reuse the cached traffic-paint materials; every other
 * explicit colour (tyre wear, expansion joints, custom markings) gets its own
 * cached material so batching keys cannot merge different colours.
 */
export function markingMaterial(color?: string): THREE.MeshLambertMaterial {
  const raw = (color ?? '#ffffff').trim() || '#ffffff';
  const normalized = raw.toLowerCase().replace(/\s+/g, '');
  if (YELLOW_MARKING_COLORS.has(normalized)) return Mats.lineYellow();
  if (WHITE_MARKING_COLORS.has(normalized)) return Mats.lineWhite();
  const rgba = raw.match(/rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/i);
  const key = `marking:${normalized}:${rgba?.[1] ?? '1'}`;
  const existing = _markingMaterialCache.get(key);
  if (existing) return existing;
  const material = flatMat(raw, {
    transparent: Boolean(rgba),
    opacity: rgba ? Number(rgba[1]) : 1,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: THREE.DoubleSide,
  });
  _markingMaterialCache.set(key, material);
  return material;
}

/** Batch key must retain the actual material colour, not just object identity. */
export function markingMaterialKey(material: THREE.Material, renderOrder: number): string {
  const lambert = material as THREE.MeshLambertMaterial;
  return `${material.uuid}:${lambert.color?.getHexString() ?? 'none'}:${material.opacity}:${renderOrder}`;
}

export const Mats = {
  // 地面 — 草地用柔和的浅黄绿
  // 后视镜通过水平翻转投影矩阵实现真实镜像，会同时反转面的
  // 绕序。地面必须双面可见，否则主视角正常、镜中却只剩天空。
  ground: () => cached('ground', '#a8c84e', { side: THREE.DoubleSide }),
  // 非道路沥青 — 深暖灰
  asphalt: () => cached('asphalt', '#3a3a3e'),
  // 道路路面 — 偏暖的灰色调（不再纯黑灰）
  roadMain: () => roadFinish('roadMain', '#686870'),
  roadSec: () => roadFinish('roadSec', '#606068'),
  roadMinor: () => roadFinish('roadMinor', '#585860'),
  roadSingle: () => roadFinish('roadSingle', '#52525a'),
  roadBridge: () => roadFinish('roadBridge', '#4c4c54'),
  // 标线 — 纯白和暖黄
  lineWhite: () => cached('lineWhite', '#f5f5f5', { depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide }),
  lineYellow: () => cached('lineYellow', '#f5c842', { depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide }),
  // 车位 — 亮绿和暖橙
  spotGreen: () => cached('spotGreen', '#4ade80', { depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5, side: THREE.DoubleSide }),
  spotAmber: () => cached('spotAmber', '#fbbf24', { depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5, side: THREE.DoubleSide }),
  // 建筑 — 柔和的彩色调色板
  buildingWall: (color?: string) => color ? flatMat(color) : cached('bldWall', '#e8b4b8'),
  buildingRoof: (color?: string) => color ? flatMat(color) : cached('bldRoof', '#d4948e'),
  buildingWindowWarm: () => cached('bldWinW', '#f5deb3'),
  buildingWindowCool: () => cached('bldWinC', '#b0c4de'),
  // 车辆通用
  carGlass: () => cached('carGlass', '#2c3e50'),
  carWheel: () => cached('carWheel', '#1a1a1a'),
  carHub: () => cached('carHub', '#b0b0b0'),
  carHeadlight: () => cached('carHeadlight', '#fffacd'),
  carHeadlightOff: () => cached('carHeadlightOff', '#888888'),
  carTaillight: () => cached('carTaillight', '#8b0000'),
  carTaillightOn: () => cached('carTaillightOn', '#ef4444'),
  carMirror: () => cached('carMirror', '#333333'),
  // 植被
  treeTrunk: () => cached('treeTrunk', '#8b6f47'),
  treeCrown: (color?: string) => color ? flatMat(color) : cached('treeCrown', '#5cb85c'),
  bush: () => cached('bush', '#4a9a4a'),
  // 路灯 / 电线杆
  pole: () => cached('pole', '#6a6a6e'),
  streetLightHead: () => cached('slHead', '#fff8dc'),
  powerPole: () => cached('powerPole', '#8b6f47'),
  insulator: () => cached('insulator', '#aaaaaa'),
  // 锥桶 / 箱子
  cone: () => cached('cone', '#f97316'),
  coneStripe: () => cached('coneStripe', '#ffffff'),
  box: () => cached('box', '#c4956a'),
  // 自动泊车路径
  pathLine: () => flatMat('#22d3ee', { transparent: true, opacity: 0.6 }),
  // 路缘石
  curb: () => cached('curb', '#8a8a8e'),
  roadStud: () => cached('roadStud', '#dce7ef', { emissive: '#526472' }),
};
