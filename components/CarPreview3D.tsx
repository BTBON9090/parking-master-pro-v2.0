import {disposeResources} from '../three/disposeResources';
/**
 * 主菜单 3D 车模展示台
 * ====================
 * 选车界面直接把真实车模呈现出来（参考 极限竞速 / 极品飞车 的展厅）：
 *  - 缓慢自动旋转的展台；按住拖拽可手动环视，松手数秒后恢复自动旋转
 *  - 摄影棚三点布光 + 地面发光圆盘 + 软阴影
 *  - 复用游戏同款 loadModel 管线（public/models/*.glb），换车只换模型，
 *    渲染器 / 灯光 / 相机只初始化一次
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CarType } from '../types';
import { CAR_MODELS } from '../constants';
import { buildVehicleParts, applyShowroomPose } from '../three/vehicleModels';
import { isTouchDevice } from '../utils/device';
import { PreviewRenderPacer } from '../utils/renderPacing';

interface CarPreview3DProps {
  carType: CarType;
  accentColor?: string;
}

const CarPreview3D: React.FC<CarPreview3DProps> = ({ carType, accentColor = '#f59e0b' }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState(false);
  const stageRef = useRef<THREE.Group | null>(null);
  const spinRef = useRef({ target: 0.55, current: 0.55, idleAt: 0, dragging: false });

  // —— 初始化一次：渲染器 / 场景 / 相机 / 灯光 / 展台 ——
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    const touchPreview = isTouchDevice();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, touchPreview ? 1.5 : 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 1, 800);
    camera.position.set(70, 32, 70);
    camera.lookAt(0, 6, 0);

    // 三点布光
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1c22, 1.05));
    const key = new THREE.DirectionalLight(0xfff1de, 2.4);
    key.position.set(60, 90, 40);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -70; key.shadow.camera.right = 70;
    key.shadow.camera.top = 70; key.shadow.camera.bottom = -70;
    key.shadow.camera.near = 1; key.shadow.camera.far = 240;
    key.shadow.normalBias = .35; key.shadow.bias = -.0002;
    key.shadow.radius = 2;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb4ff, 1.5);
    rim.position.set(-70, 40, -60);
    scene.add(rim);

    // 展台：深色圆盘 + 发光外环 + 网格纹理
    const stage = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(54, 64),
      new THREE.MeshStandardMaterial({ color: 0x101116, roughness: 0.85, metalness: 0.35 }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.receiveShadow = true;
    stage.add(disc);

    const ringColor = new THREE.Color(accentColor);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(52.8, 54, 96),
      new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    stage.add(ring);

    const gridHelper = new THREE.PolarGridHelper(49, 12, 5, 64, 0x3a3d46, 0x23252c);
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.5;
    gridHelper.position.y = 0.04;
    stage.add(gridHelper);

    // 软阴影承接面
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.ShadowMaterial({ opacity: 0.42 }),
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.02;
    shadowPlane.receiveShadow = true;
    stage.add(shadowPlane);
    scene.add(stage);
    stageRef.current = stage;

    // 尺寸自适应。注意 updateStyle=false：canvas 的 CSS 尺寸交给
    // .cockpit-canvas-host（width/height:100%），避免内联像素宽度撑破
    // 父级网格轨道（曾导致首次进入选车页时右侧车单被挤没）。
    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    let inViewport = true;
    const visibilityObserver = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      inViewport = entries.some(entry => entry.isIntersecting);
    });
    visibilityObserver?.observe(mount);

    // 拖拽环视
    const pointers=new Map<number,{x:number;y:number}>();
    let elevation=.27,radius=125;
    const orbit=()=>{camera.position.set(radius*Math.cos(elevation)*.707,6+radius*Math.sin(elevation),radius*Math.cos(elevation)*.707);camera.lookAt(0,6,0);};
    const dom=renderer.domElement;
    const down=(e:PointerEvent)=>{e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});spinRef.current.dragging=true;dom.setPointerCapture(e.pointerId);};
    const move=(e:PointerEvent)=>{
      const old=pointers.get(e.pointerId);if(!old)return;
      const other=[...pointers.entries()].find(([id])=>id!==e.pointerId)?.[1];
      if(other){const before=Math.hypot(old.x-other.x,old.y-other.y),after=Math.hypot(e.clientX-other.x,e.clientY-other.y);radius=Math.max(52,Math.min(180,radius*before/Math.max(1,after)));}
      else{stage.rotation.y+=(e.clientX-old.x)*.012;elevation=Math.max(.08,Math.min(1.28,elevation+(e.clientY-old.y)*.006));}
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});spinRef.current.idleAt=performance.now()+2600;orbit();
    };
    const up=(e:PointerEvent)=>{pointers.delete(e.pointerId);spinRef.current.dragging=pointers.size>0;spinRef.current.idleAt=performance.now()+2600;};
    const wheel=(e:WheelEvent)=>{e.preventDefault();radius=Math.max(52,Math.min(180,radius*Math.exp(e.deltaY*.001)));orbit();};
    dom.addEventListener('pointerdown',down);dom.addEventListener('pointermove',move);dom.addEventListener('pointerup',up);dom.addEventListener('pointercancel',up);dom.addEventListener('lostpointercapture',up);dom.addEventListener('wheel',wheel,{passive:false});orbit();

    let raf = 0;
    const previewPacer = new PreviewRenderPacer();
    let renderedFrames = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = previewPacer.sample(now,touchPreview,spinRef.current.dragging,
        document.hidden || !inViewport || mount.clientWidth < 1 || mount.clientHeight < 1);
      if (dt === null) return;
      if (!spinRef.current.dragging && now > spinRef.current.idleAt) {
        stage.rotation.y += .0038 * 60 * dt;
      }
      renderer.render(scene, camera);
      if ((import.meta as unknown as {env?:{DEV?:boolean}}).env?.DEV)
        renderer.domElement.dataset.previewFrames = String(++renderedFrames);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      visibilityObserver?.disconnect();
      dom.removeEventListener('pointerdown', down);
      dom.removeEventListener('pointermove', move);
      dom.removeEventListener('pointerup', up);
      dom.removeEventListener('pointercancel', up);
      dom.removeEventListener('lostpointercapture',up);dom.removeEventListener('wheel',wheel);
      stageRef.current = null;
      disposeResources([scene]);
      renderer.dispose();renderer.forceContextLoss();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // —— 换车：只替换模型节点 ——
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let cancelled = false;setLoading(true);setError(false);
    let current: THREE.Group | null = null;
    buildVehicleParts(carType, CAR_MODELS[carType]).then(parts => {
      if (cancelled || !stageRef.current) {disposeResources([parts.group]);return;}
      // 程序化车型在展厅里把车门半开、尾翼抬起，直观展示部件绑定；
      // GLB 车型没有这些绑定，applyShowroomPose 会自动跳过。
      applyShowroomPose(parts.extras, 0.55);
      const model = parts.group;
      current = model;
      // The fixed showroom camera was sized for cars and cropped long buses.
      // Scale the preview uniformly; the actual driving model is untouched.
      const bounds = new THREE.Box3().setFromObject(model, true);
      const size = bounds.getSize(new THREE.Vector3());
      model.scale.multiplyScalar(72 / Math.max(size.x,size.y,size.z));
      model.updateMatrixWorld(true);
      // 重新实测包围盒后落地 + 居中：个别车源（如海豹 08）的原点不在地面，
      // 直接写死 position.y 会覆盖归一化偏移、让轮胎沉进展台。
      const box = new THREE.Box3().setFromObject(model, true);
      const center = box.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= box.min.y;
      model.position.y += 0.12; // 胎壁与盘面之间一点呼吸感
      stageRef.current.add(model);setLoading(false);
    }).catch(() => {if(!cancelled){setError(true);setLoading(false);}});
    return () => {
      cancelled = true;
      if (current) {current.removeFromParent();disposeResources([current]);}
    };
  }, [carType]);

  return (
    <div className="relative w-full h-full"><div ref={mountRef} className="cockpit-canvas-host w-full h-full cursor-grab active:cursor-grabbing touch-none" aria-label="3D car preview" />{(loading||error)&&<div className="stage-loading" role="status">{loading&&<i/>}{error?'车辆装载失败，请重新选择':'正在装载座驾'}</div>}</div>
  );
};

export default CarPreview3D;
