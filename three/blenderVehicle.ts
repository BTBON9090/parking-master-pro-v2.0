import {separateExteriorPanels} from './exteriorPanels';
import {DriverHands} from './driverHands';
import {bindTrackedGear} from './trackedGear';
import {ArticulatedTrailer} from './articulatedTrailer';
import * as THREE from 'three';
import { CarType } from '../types';
import type { CarConfig } from '../types';
import type { CarMeshParts } from './geometries';
import { collectVehicleFootprint, convexFootprint } from '../utils/collisionFootprint';

const WHEEL_LABELS = ['FrontL', 'FrontR', 'RearL', 'RearR'] as const;
const WHEEL_NAMES = WHEEL_LABELS.map(label => `Wheel${label}`);

/**
 * Native rig for the Blender-authored Seal 08 / L80 GLBs.
 *
 * The completed asset already contains one closed body shell, real window
 * openings, a full interior, four named wheel assemblies and a steering-wheel
 * pivot. This helper must NOT replace those with the generic low-poly wheel
 * assembly or the generic dashboard: it only splits the authored wheels into
 * steer/roll pivots, exposes the authored cockpit, and builds a collision
 * footprint from the actual meshes.
 *
 * The source is already normalized by modelLoader: uniform 10 units/metre,
 * XZ-centred and sitting on y=0. No per-axis scaling is applied here.
 */
export function buildNativeAuthoredVehicle(source: THREE.Group, cfg: CarConfig): CarMeshParts {
  source.updateWorldMatrix(true, true);
  const group = new THREE.Group();
  group.name = 'authored-vehicle-root';
  group.add(source);

  // Close the footwell below the authored dashboard/door trim. These five
  // interior faces stay inside the body and leave all real windows open.
  const suv = cfg.height > 16;
  const calibration = source.getObjectByName('CarRoot')?.userData ?? {};
  // Exported wheel-well liners already clear the complete suspension travel.
  // Adding the fallback flat floor would fill those cavities again.
  if (!calibration.authored_wheel_cabin_liner) {
    const halfCabin = cfg.width / 10 * .425;
    const floor = calibration.liner_floor_m ?? (suv ? .36 : .29);
    const belt = calibration.liner_belt_m ?? (suv ? 1.15 : .96);
    const rear = calibration.liner_rear_m ?? (suv ? -2.15 : -1.70);
    const front = calibration.liner_front_m ?? 1.02;
    const corners = [
      [-halfCabin,floor,rear],[halfCabin,floor,rear],[halfCabin,floor,front],[-halfCabin,floor,front],
      [-halfCabin,belt-.10,rear],[halfCabin,belt-.10,rear],[halfCabin,belt-.10,front],[-halfCabin,belt-.10,front],
    ];
    const linerGeometry = new THREE.BufferGeometry();
    linerGeometry.setAttribute('position', new THREE.Float32BufferAttribute(corners.flat(),3));
    linerGeometry.setIndex([0,1,2,0,2,3, 0,3,7,0,7,4, 1,5,6,1,6,2, 3,2,6,3,6,7, 0,4,5,0,5,1]);
    linerGeometry.computeVertexNormals();
    const liner = new THREE.Mesh(linerGeometry, new THREE.MeshStandardMaterial({
      color: '#252b2f', roughness: 1, metalness: 0, side: THREE.DoubleSide,
    }));
    liner.name = 'InteriorCabinLiner';
    (source.getObjectByName('CarRoot') ?? source).add(liner);
  }

  // Player-specific material instances (the model cache shares materials).
  const materialMap = new Map<THREE.Material, THREE.Material>();
  source.updateMatrixWorld(true);
  source.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    // The exported black-trim batch contains the physical inside mirror.
    // Its untextured back blocks the windscreen despite the functional HUD
    // mirror above it. Remove only this small isolated upper-centre island.
    if(node.name.startsWith('Interior_CarRoot_') && (Array.isArray(node.material)?node.material:[node.material]).some(m=>m.name==='BlackTrim')){
      const geometry=node.geometry.clone(),p=geometry.getAttribute('position'),idx=geometry.index,keep:number[]=[];
      const inside=(j:number)=>{const v=new THREE.Vector3().fromBufferAttribute(p,j).applyMatrix4(node.matrixWorld);
        return Math.abs(v.x)<1.3 && v.y>cfg.height*.68 && v.z>3 && v.z<cfg.length*.30;};
      for(let t=0;t<(idx?.count??p.count);t+=3){const face=[0,1,2].map(k=>idx?idx.getX(t+k):t+k);if(!face.every(inside))keep.push(...face);}
      geometry.setIndex(keep);geometry.computeBoundingBox();geometry.computeBoundingSphere();node.geometry=geometry;
    }
    const leather = (Array.isArray(node.material)?node.material:[node.material]).some(m=>m.name==='InteriorLeather');
    if(leather){
      node.geometry=node.geometry.clone();
      const pos=node.geometry.getAttribute('position'),colors:number[]=[],v=new THREE.Vector3();
      for(let i=0;i<pos.count;i++){
        v.fromBufferAttribute(pos,i).applyMatrix4(node.matrixWorld);
        const door=Math.abs(v.x)>cfg.width*.37;
        const factor=door?.48:.96;
        colors.push(factor,door?factor*1.08:factor,door?factor*1.17:factor);
      }
      node.geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    }
    const cloneOne = (material: THREE.Material): THREE.Material => {
      const cached = materialMap.get(material);
      if (cached) return cached;
      const cloned = material.clone();
      materialMap.set(material, cloned);
      if (cloned.name === 'Paint') {
        const paint = cloned as THREE.MeshStandardMaterial;
        paint.color.set(cfg.color);
        paint.metalness = 0.06;
        paint.roughness = 0.72;
      }
      if(cloned instanceof THREE.MeshStandardMaterial){
        if(cloned.name==='InteriorLeather'){cloned.vertexColors=true;cloned.color.set('#b49873');cloned.roughness=.95;cloned.metalness=0;}
        if(cloned.name==='InteriorTrim'){cloned.color.set('#515b62');cloned.roughness=.85;cloned.metalness=0;}
        if(cloned.name==='InteriorDark'){cloned.color.set('#263139');cloned.roughness=.92;}
        if(cloned.name==='Tyre'){cloned.color.set(cfg.id===CarType.TYPE100?'#666b5c':'#343b41');cloned.roughness=cfg.id===CarType.TYPE100?.82:.95;cloned.metalness=cfg.id===CarType.TYPE100?.5:0;}
        if(cloned.name==='Rim'){cloned.color.set('#8b969d');cloned.roughness=.68;cloned.metalness=.12;}
      }
      if (cloned.name === 'Glass') {
        cloned.transparent = true;
        cloned.opacity = 0.30;
        cloned.depthWrite = false;
        cloned.side = THREE.DoubleSide;
      }
      return cloned;
    };
    node.material = Array.isArray(node.material)
      ? node.material.map(cloneOne)
      : cloneOne(node.material);
  });

  const parts: CarMeshParts = {
    group,
    wheels: [],
    wheelMounts: [],
    frontWheels: [],
    headlights: [],
    taillights: [],
    brakeLights: [],
    reverseLights: [],
    leftIndicators: [],
    rightIndicators: [],
    extras: { doors: [], spoilers: [], steeringWheels: [], brakeGlow: [], drl: [] },
    isGLB: true,
  };

  // ---- four authored wheel assemblies: steer around Y, roll around X ----
  const labels=cfg.id===CarType.TRIKE?['FrontL','RearL','RearR']:[CarType.SEMI,CarType.US22].includes(cfg.id)?[...WHEEL_LABELS,'Rear2L','Rear2R']:WHEEL_LABELS;
  group.userData.expectedWheelCount=labels.length;
  group.userData.expectedFrontWheelCount=cfg.id===CarType.TRIKE?1:2;
  labels.forEach((label,index)=>{
    const wheelRoot = source.getObjectByName(`Wheel${label}`);
    if (!wheelRoot) throw new Error(`Authored asset missing Wheel${label}`);
    const isFront = label.startsWith('Front');
    const center = wheelRoot.getWorldPosition(new THREE.Vector3());
    const steer = new THREE.Group();
    steer.name = `Wheel${label}-steer-pivot`;
    steer.position.copy(center);
    steer.userData.vehicleSideX = center.x;
    steer.userData.isFront = isFront;
    group.add(steer);
    const roll = new THREE.Group();
    roll.name = `Wheel${label}-roll`;
    roll.userData.nativeWheel = true;
    steer.add(roll);
    roll.updateWorldMatrix(true, false);
    // attach() preserves the authored wheel's world pose; its own local origin
    // is the axle centre, so rotation about X is a true rolling rotation.
    roll.attach(wheelRoot);
    wheelRoot.traverse(node => { node.userData.nativeWheelPart = true; });
    roll.updateWorldMatrix(true, true);
    const size = new THREE.Box3().setFromObject(roll, true).getSize(new THREE.Vector3());
    // The authored tyre is round: use its vertical diameter, not a rotated AABB.
    roll.userData.wheelRadius = Math.max(0.5, size.y / 2);
    roll.userData.wheelWidth = size.x;
    parts.wheels.push(roll);
    parts.wheelMounts.push(steer);
    if (isFront) parts.frontWheels.push(steer);
    // The caliper must steer but never roll; re-parent it to the knuckle.
    const caliper = source.getObjectByName(`BrakeCaliper${label}`);
    if (caliper) {
      steer.attach(caliper);
      caliper.traverse(node => { node.userData.brakeCaliper = true; });
    }
  });

  // ---- authored steering wheel: pivot already points down the column axis ----
  const authoredSteering = source.getObjectByName('SteeringWheelPivot');
  if (authoredSteering) {
    const spin = new THREE.Group();
    spin.name = 'authored-steering-wheel-spin';
    // Blender's local +Z column becomes local +Y in the glTF Y-up basis.
    // Rotating about glTF Z tumbles the rim instead of turning it in-plane.
    for (const child of [...authoredSteering.children]) spin.add(child);
    authoredSteering.add(spin);
    const hands=new DriverHands(authoredSteering);spin.userData.updateHands=(angle:number)=>hands.update(angle);
    // Do not recolour the shared dashboard material. Give the authored rim
    // and spokes their own warm-grey leather / satin-aluminium instances.
    spin.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const recolor = (m: THREE.Material) => {
        const c=m.clone() as THREE.MeshStandardMaterial;
        c.color?.set(/spoke|hub/i.test(node.name) ? '#a5a8aa' : '#967c62');
        c.roughness=.82;c.metalness=/spoke/i.test(node.name)?.15:0;
        return c;
      };
      node.material=Array.isArray(node.material)?node.material.map(recolor):recolor(node.material);
    });
    // A narrow matte leather stripe, not a self-lit dot. Local -Z points
    // radially up the wheel; its long side runs across the rim at 12 o'clock.
    const centreMark=new THREE.Mesh(new THREE.BoxGeometry(.008,.006,.033),new THREE.MeshStandardMaterial({color:'#c8b889',roughness:1,metalness:0}));
    centreMark.name='steering-centre-reference';
    // Authored column uses local +Y; local -Z is the rim's 12 o'clock.
    centreMark.position.set(0,.022,-.185);spin.add(centreMark);
    authoredSteering.userData.partRole = 'steering-wheel-pivot';
    parts.extras!.steeringWheels.push({
      object: spin,
      ratio: 1,
      axis: new THREE.Vector3(0, 1, 0),
    });
  }

  // ---- authored driver eye / instrument screen ----
  const eyeNode = source.getObjectByName('DriverEye');
  if (eyeNode) {
    const eyeWorld = eyeNode.getWorldPosition(new THREE.Vector3());
    const eye = group.worldToLocal(eyeWorld.clone());
    // Runtime seat calibration, in 10 units/metre. The asset eye was almost
    // level with the rim; leave headroom while clearing its upper edge.
    const trainingVehicle = [CarType.JEEP,CarType.MIDIBUS,CarType.COACH,CarType.VAN,CarType.LIGHT_TRUCK].includes(cfg.id);
    eye.y += calibration.seat_lift_game_units ?? (trainingVehicle ? .8 : suv ? 1.8 : 1.5);
    parts.nativeCockpit = {
      eye,
      pitchDeg: trainingVehicle ? -5 : -1,
    };
  }

  const screenMesh = source.getObjectByName('InteriorInstrumentScreen');
  if (screenMesh instanceof THREE.Mesh && parts.nativeCockpit) {
    const material = Array.isArray(screenMesh.material) ? screenMesh.material[0] : screenMesh.material;
    const screenMaterial = material.clone() as THREE.MeshStandardMaterial;
    screenMaterial.name = 'InstrumentScreenLive';
    screenMaterial.color.set('#ffffff');
    screenMaterial.emissive.set('#ffffff');
    screenMaterial.emissiveIntensity = 1.0;
    screenMaterial.map = null;
    screenMaterial.emissiveMap = null;
    // Solid-colour GLB materials do not export unused UVs. Supply the
    // driver's display UVs explicitly for the runtime CanvasTexture.
    screenMesh.geometry = screenMesh.geometry.clone();
    screenMesh.geometry.computeBoundingBox();
    const displayBounds = screenMesh.geometry.boundingBox!;
    const displayPositions = screenMesh.geometry.getAttribute('position');
    const displayUV = new Float32Array(displayPositions.count * 2);
    for (let i = 0; i < displayPositions.count; i++) {
      displayUV[i * 2] = 1 - (displayPositions.getX(i) - displayBounds.min.x) / (displayBounds.max.x - displayBounds.min.x);
      displayUV[i * 2 + 1] = (displayPositions.getY(i) - displayBounds.min.y) / (displayBounds.max.y - displayBounds.min.y);
    }
    screenMesh.geometry.setAttribute('uv', new THREE.BufferAttribute(displayUV, 2));
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        screenMaterial.map = texture;
        screenMaterial.emissiveMap = texture;
        screenMaterial.needsUpdate = true;
        let lastReadout = '';
        parts.nativeCockpit.updateInstruments = (speedKmh: number, rpm: number) => {
          const speed = Math.round(Math.abs(speedKmh));
          const rpmBar = Math.round(Math.min(20, rpm / 900));
          const readout = `${speed}/${rpmBar}`;
          if (readout === lastReadout) return;
          lastReadout = readout;
          ctx.fillStyle = '#05080b';
          ctx.fillRect(0, 0, 512, 256);
          ctx.fillStyle = '#d7f4ff';
          ctx.font = 'bold 112px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(String(speed).padStart(2, '0'), 38, 150);
          ctx.fillStyle = '#6f8a96';
          ctx.font = 'bold 27px sans-serif';
          ctx.fillText('km/h', 300, 145);
          ctx.fillStyle = '#17323e';
          ctx.fillRect(38, 188, 436, 18);
          ctx.fillStyle = rpmBar > 14 ? '#ff8a3d' : '#44d8ff';
          ctx.fillRect(38, 188, (436 * rpmBar) / 20, 18);
          texture.needsUpdate = true;
        };
        parts.nativeCockpit.updateInstruments(0, 0);
      }
    }
    screenMesh.material = screenMaterial;
  }

  source.traverse(node => {
    if (node instanceof THREE.Mesh) {
      const material = Array.isArray(node.material) ? node.material[0] : node.material;
      const materialName = material?.name ?? '';
      if (materialName === 'Headlight') parts.headlights.push(node);
      else if (materialName === 'Taillight') {
        parts.taillights.push(node);
        parts.brakeLights.push(node);
      } else if (materialName === 'ReverseLight') parts.reverseLights.push(node);
      else if (materialName === 'IndicatorL') parts.leftIndicators.push(node);
      else if (materialName === 'IndicatorR') parts.rightIndicators.push(node);
    }
    if (/^Interior/.test(node.name)) node.userData.partRole = 'interior';
  });

  // Reuse the authored light housings. A small lens inside a lamp is a real
  // surface, not a floating marker beyond the bumper/collision boundary.
  if(!parts.reverseLights.length&&parts.taillights.length){
    const housing=parts.taillights[0] as THREE.Mesh;
    if(housing.isMesh){
      const lens=new THREE.Mesh(housing.geometry,new THREE.MeshStandardMaterial({color:'#c5d6da',roughness:.45}));
      lens.name='ReverseLens';housing.add(lens);lens.scale.set(.35,.65,1.04);parts.reverseLights.push(lens);
    }
  }
  if(!parts.leftIndicators.length||!parts.rightIndicators.length){
    const existing:THREE.Mesh[]=[];source.traverse(n=>{if(n instanceof THREE.Mesh&&n.name.startsWith('Indicator'))existing.push(n);});
    for(const housing of existing.length?existing:parts.headlights){
      if(!(housing instanceof THREE.Mesh))continue;
      const lens=existing.length?housing:new THREE.Mesh(housing.geometry,new THREE.MeshStandardMaterial());
      if(!existing.length){lens.name='IndicatorLens';housing.add(lens);lens.scale.set(.24,.75,1.05);}
      lens.material=new THREE.MeshStandardMaterial({name:'IndicatorLens',color:'#c78b27',roughness:.4});
      const side=housing.getWorldPosition(new THREE.Vector3()).x;
      (side>0?parts.leftIndicators:parts.rightIndicators).push(lens);
      parts.taillights=parts.taillights.filter(n=>n!==lens);parts.brakeLights=parts.brakeLights.filter(n=>n!==lens);
    }
  }

  const trailerNode=source.getObjectByName('TrailerRoot');
  if(trailerNode)parts.trailer=new ArticulatedTrailer(group,trailerNode);
  group.updateWorldMatrix(true, true);
  let bodyFootprint = collectVehicleFootprint(group, false);
  const wheelFootprints = parts.wheelMounts.map(mount => collectVehicleFootprint(mount, true));
  let damageRevision=0;
  parts.updateCollisionFootprint = () => {
    if(damageRevision!==(group.userData.damageRevision??0)){
      damageRevision=group.userData.damageRevision??0;
      bodyFootprint=collectVehicleFootprint(group,false);
    }
    return convexFootprint([
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
  };
  if(cfg.id===CarType.TYPE100)bindTrackedGear(source,parts);
  separateExteriorPanels(source,cfg);
  return parts;
}

export function isAuthoredVehicle(carType: CarType): boolean {
  return [CarType.TYPE100,CarType.MINING,CarType.US22,CarType.TRIKE,CarType.TRACTOR,CarType.SEMI,CarType.CYBERTRUCK,CarType.REVUELTO,CarType.VEYRON,CarType.V800,CarType.MINI,CarType.TRUCK,CarType.TAI7,CarType.LI_I9,CarType.N90,CarType.SEDAN,CarType.SEAL08,CarType.SUV,CarType.JEEP,CarType.MIDIBUS,CarType.COACH,CarType.VAN,CarType.LIGHT_TRUCK].includes(carType);
}
