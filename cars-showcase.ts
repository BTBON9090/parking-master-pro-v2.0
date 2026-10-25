/**
 * 车模展厅（开发用预览页，不参与 build）
 * =====================================
 * 单独打开 http://localhost:3000/cars-showcase.html 就能把
 * 小米 SU7 / 小米 YU7 / 尊界 V8 三台程序化车模并排看一遍：
 * 转台自动旋转、车门半开、尾翼抬起，可以直接检查车身比例、
 * 轮拱开口、灯组位置与部件绑定关系。
 */

import * as THREE from 'three';
import { CAR_MODELS } from './constants';
import { CarType } from './types';
import { buildProceduralCar } from './three/vehicleModels';

const params = new URLSearchParams(location.search);
if (params.get('debug') === 'mats') (globalThis as { __vehicleDebug?: boolean }).__vehicleDebug = true;
const ONLY = params.get('only');
const DOORS_OPEN = params.get('doors') === 'open';
const LIGHT_BG = params.get('bg') === 'light';
const DEBUG = params.get('debug') ?? '';
const AZ = params.get('az') ? Number(params.get('az')) : null;
console.log('[showcase]', location.search, { ONLY, LIGHT_BG, DOORS_OPEN, DEBUG });
const CARS: CarType[] = ([CarType.SU7, CarType.YU7, CarType.ZUNJIE] as CarType[])
  .filter(carType => !ONLY || carType === ONLY);

const host = document.getElementById('stage') as HTMLDivElement;
const labelHost = document.getElementById('labels') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setSize(window.innerWidth, window.innerHeight);
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(LIGHT_BG ? '#dfe6ee' : '#0a0d13');
scene.fog = new THREE.Fog(LIGHT_BG ? '#dfe6ee' : '#0a0d13', 220, 420);

const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 1, 900);

// 摄影棚环境贴图：车漆/玻璃/轮毂都是高金属度材质，没有 environment
// 就只能吃到直射光，会发黑发闷。这里用一个内联的小房间（不引 addon，
// 避免 Vite 把 examples/jsm 解析成第二份 three）生成 PMREM。
const envScene = new THREE.Scene();
const room = new THREE.Mesh(
  new THREE.BoxGeometry(240, 120, 240),
  new THREE.MeshBasicMaterial({ color: 0x2a3442, side: THREE.BackSide }),
);
room.position.y = 40;
envScene.add(room);
const softbox = (w: number, h: number, x: number, y: number, z: number, color: number, intensity: number) => {
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
  );
  panel.position.set(x, y, z);
  panel.lookAt(0, 20, 0);
  envScene.add(panel);
};
softbox(150, 90, 0, 92, 0, 0xffffff, 2.6);      // 顶部大柔光
softbox(120, 70, -110, 40, 60, 0xdbe6f2, 1.9);   // 左前侧光
softbox(120, 70, 110, 40, -70, 0xf3ece2, 1.5);   // 右后暖光
softbox(90, 120, 0, 30, -120, 0xb9c6d6, 1.1);    // 背光
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(envScene, 0.02).texture;
scene.environmentIntensity = 0.85;
pmrem.dispose();

// ---- 灯光：摄影棚三点 + 顶部柔光 ----
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a3038, LIGHT_BG ? 2.4 : 1.5));
if (LIGHT_BG) scene.add(new THREE.AmbientLight(0xffffff, 1.1));
const key = new THREE.DirectionalLight(0xfff2e2, 3.2);
key.position.set(80, 120, 90);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -140;
key.shadow.camera.right = 140;
key.shadow.camera.top = 140;
key.shadow.camera.bottom = -140;
key.shadow.bias = -0.0006;
scene.add(key);
const rim = new THREE.DirectionalLight(0x8fb4ff, 1.6);
rim.position.set(-110, 60, -100);
scene.add(rim);
const fill = new THREE.DirectionalLight(0xffffff, 1.0);
fill.position.set(-40, 30, 120);
scene.add(fill);

// ---- 地面 ----
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(300, 96),
  new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.82, metalness: 0.35 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.PolarGridHelper(260, 16, 8, 96, 0x2b3340, 0x1b212a);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.55;
grid.position.y = 0.05;
scene.add(grid);

// ---- 三台车 ----
const turntable = new THREE.Group();
scene.add(turntable);
const spacing = ONLY ? 0 : 40;
const labels: Array<{ el: HTMLDivElement; car: THREE.Object3D }> = [];

CARS.forEach((carType, index) => {
  const cfg = CAR_MODELS[carType];
  const built = buildProceduralCar(cfg);
  if (!built) return;
  const car = built.parts.group;
  car.position.x = (index - (CARS.length - 1) / 2) * spacing;
  turntable.add(car);

  if (DEBUG === 'wire') {
    car.traverse(node => {
      if (node instanceof THREE.Mesh) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material: THREE.Material) => {
          (material as THREE.MeshStandardMaterial).wireframe = true;
        });
      }
    });
  }
  if (DEBUG === 'cabin') {
    car.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const isCabin = node.name === 'greenhouse';
      node.visible = isCabin;
      if (isCabin) node.material = new THREE.MeshStandardMaterial({ color: 0xdd5522, side: THREE.DoubleSide });
    });
  }
  if (DEBUG === 'mats') {
    car.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      if (node.name !== 'greenhouse') { node.visible = false; return; }
      node.material = [
        new THREE.MeshStandardMaterial({ color: 0x22dd55, side: THREE.DoubleSide }),
        new THREE.MeshStandardMaterial({ color: 0xee2222, side: THREE.DoubleSide }),
      ];
    });
  }
  if (DEBUG === 'capkeep') {
    car.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      node.visible = node.name === 'greenhouse';
    });
  }
  if (DEBUG === 'noglass') {
    car.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      if (mats.some(m => m.name === 'carGlass')) node.visible = false;
    });
  }
  if (DEBUG === 'wheels') {
    car.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const role = String(node.userData?.partRole ?? '');
      if (node.name === 'body-shell' || node.name === 'greenhouse') {
        node.visible = false;
      }
      void role;
    });
  }

  // 展厅姿态：四门半开、尾翼抬起
  built.extras.doors.forEach(door => {
    door.pivot.rotation.y = DOORS_OPEN ? door.openYaw * 0.5 : 0;
  });
  built.extras.spoilers.forEach(sp => {
    sp.pivot.rotation.x = sp.closedPitch + (sp.openPitch - sp.closedPitch) * 0.6;
  });

  if (DEBUG === 'info') {
    car.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      const box = new THREE.Box3().setFromObject(node);
      const size = box.getSize(new THREE.Vector3());
      console.log('[mesh]', node.name, 'mats=', mats.map(m => `${m.type}:${m.color?.getHexString?.()}:op=${(m as THREE.MeshStandardMaterial).opacity}`).join('|'),
        'groups=', node.geometry.groups.length, 'size=', size.toArray().map(v => v.toFixed(1)).join(','));
    });
  }

  const el = document.createElement('div');
  el.className = 'label';
  el.innerHTML = `<b>${cfg.name}</b><span>${cfg.dynamics.driveLayout} · ${cfg.dynamics.powerKw} kW · ${cfg.dynamics.torqueNm} N·m</span>`;
  labelHost.appendChild(el);
  labels.push({ el, car });
});

// ---- 相机环绕 ----
let azimuth = AZ ?? -0.9;
const radius = ONLY ? 78 : 132;
const height = ONLY ? 30 : 58;
const target = new THREE.Vector3(0, 8, 0);

const resize = () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
};
window.addEventListener('resize', resize);

const projected = new THREE.Vector3();
const tick = () => {
  requestAnimationFrame(tick);
  if (AZ === null) azimuth += 0.0022;
  turntable.rotation.y = 0;
  camera.position.set(Math.sin(azimuth) * radius, height, Math.cos(azimuth) * radius);
  camera.lookAt(target);
  renderer.render(scene, camera);

  // 标签跟随车模在屏幕上的位置
  labels.forEach(({ el, car }) => {
    projected.set(car.position.x, 19, car.position.z);
    projected.x += Math.sin(azimuth) * 0; // 保持世界坐标
    projected.project(camera);
    el.style.transform = `translate(-50%, -50%) translate(${(projected.x * 0.5 + 0.5) * window.innerWidth}px, ${(-projected.y * 0.5 + 0.5) * window.innerHeight}px)`;
  });
};
tick();

// 把运行时错误显示到页面上，方便离屏截图检查
window.addEventListener('error', event => {
  const banner = document.getElementById('error') as HTMLDivElement;
  banner.style.display = 'block';
  banner.textContent = `运行错误: ${event.message}`;
});
