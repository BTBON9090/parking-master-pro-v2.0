import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CAR_MODELS, GENERATE_LEVEL } from '../constants';
import { CarType } from '../types';
import { advanceVehicleCenter, ackermannAngles } from '../utils/driving';
import { getPowertrain, canSelectGear, computeRpm, isElectricVehicle, TRAVEL_PER_SPEED_FRAME, steeringWheelMaxDeg } from '../utils/powertrain';
import { checkVehicleCollision, checkVehicleRectCollision, getVehicleBoundaryPoints, vehicleLayersCompatible } from '../utils/physics';
import { collectVehicleFootprint, footprintBounds } from '../utils/collisionFootprint';
import { buildCarMeshFromGLB } from '../three/geometries';
import { buildProceduralCar } from '../three/vehicleModels';
import { buildConceptCockpitFrame, collectConceptCockpitFrameMeshes } from '../utils/conceptCockpit';
import { MODEL_REGISTRY, CAR_TYPE_TO_MODEL, normalizeModel } from '../three/modelLoader';
import { buildNativeAuthoredVehicle, isAuthoredVehicle } from '../three/blenderVehicle';

// Reversible parking arcs: time-step size must not alter the turning circle.
for (const car of Object.values(CAR_MODELS)) {
  const steer = car.dynamics.maxSteerAngle;
  let pose={x:0,y:0,rotation:0};
  const q=Math.tan(steer)/car.wheelbase;
  const beta=Math.atan((car.wheelbase/2)*q);
  const centreCurvature=q*Math.cos(beta);
  const radius=1/centreCurvature;
  for(let i=0;i<600;i++) pose=advanceVehicleCenter(pose.x,pose.y,pose.rotation,2*Math.PI*radius/600,car.wheelbase,steer);
  assert(Math.hypot(pose.x,pose.y)<1e-6,`${car.id} circle closure`);
  const forward=advanceVehicleCenter(0,0,0,80,car.wheelbase,steer);
  const reverse=advanceVehicleCenter(forward.x,forward.y,forward.rotation,-80,car.wheelbase,steer);
  assert(Math.hypot(reverse.x,reverse.y)<1e-8,`${car.id} reverse arc`);
  // Centre path length is the distance argument for every steering angle
  // (including rear steer), not a rear-axle path that grows while turning.
  for (const rear of [0, -0.08, 0.08]) {
    let p = { x: 0, y: 0, rotation: 0 };
    let travelled = 0;
    const steps = 240;
    const stepDistance = 40 / steps;
    for (let i = 0; i < steps; i++) {
      const next = advanceVehicleCenter(p.x, p.y, p.rotation, stepDistance, car.wheelbase, 0.45, car.wheelbase / 2, rear);
      travelled += Math.hypot(next.x - p.x, next.y - p.y);
      p = next;
    }
    assert(Math.abs(travelled - 40) < 0.02, `${car.id}: centre path length changed by rear steer (${travelled})`);
  }
  const crab = advanceVehicleCenter(0, 0, 0, 30, car.wheelbase, 0.3, car.wheelbase / 2, 0.3);
  assert(Math.abs(crab.rotation) < 1e-9, `${car.id}: equal front/rear steer must crab without yaw`);
  assert(Math.abs(crab.y - 30 * Math.sin(0.3)) < 1e-6, `${car.id}: crab moves along heading+rear steer`);

  const angles=ackermannAngles(steer,car.wheelbase,car.width*.46);
  assert(angles.right>angles.left && angles.left>0);
  assert(Math.abs(steeringWheelMaxDeg(car) - Math.min(540, car.dynamics.steeringRatio * steer * 180 / Math.PI)) < 1e-7);
  const pt=getPowertrain(car.id);
  assert(pt.gearTops.every(v=>Number.isFinite(v)&&v>0));
  assert(pt.peakAccel.every(v=>Number.isFinite(v)&&v>0));
  assert(pt.shiftUpKmh.length===pt.gearTops.length,`${car.id}: one training upshift suggestion per gear`);
  assert(pt.shiftUpKmh.every((kmh,i)=>kmh>0&&kmh<=pt.gearTops[i]*15),`${car.id}: shift suggestions below redline`);
  assert(pt.normalBandMinKmh.length===pt.gearTops.length&&pt.normalBandMaxKmh.length===pt.gearTops.length,`${car.id}: normal bands per gear`);
  assert(pt.normalBandMinKmh.every((kmh,i)=>kmh>=0&&kmh<pt.normalBandMaxKmh[i]),`${car.id}: normal lower bound below upper`);
  assert(pt.normalBandMaxKmh.every((kmh,i)=>kmh<=pt.gearTops[i]*15),`${car.id}: normal band below redline`);
  assert(pt.gearTops.length<=1||pt.normalBandMinKmh[1]>0,`${car.id}: second-gear normal band must not start at zero`);
  assert(pt.torqueMult(0.98)<pt.torqueMult(0.6),`${car.id}: torque must fade toward redline`);
  if(pt.gearTops.length>1){
    const compareSpeed=Math.min(20/15,pt.gearTops[0]*0.7);
    const low=pt.peakAccel[0]*pt.torqueMult(Math.min(1,compareSpeed/pt.gearTops[0]));
    const high=pt.peakAccel[1]*pt.torqueMult(Math.min(1,compareSpeed/pt.gearTops[1]));
    assert(low>high,`${car.id}: low gear must out-pull next gear at ${(compareSpeed*15).toFixed(0)} km/h`);
  }
  if(car.id===CarType.SEDAN){
    // Manual training gearbox now uses the real 245/45R19 tyre radius
    // (0.35155m), so the physical 1st/2nd redlines move up accordingly.
    assert(pt.gearTops[0]*15>=40&&pt.gearTops[0]*15<=46,`SEDAN first redline ${pt.gearTops[0]*15}`);
    assert(pt.gearTops[1]*15>=75&&pt.gearTops[1]*15<=83,`SEDAN second redline ${pt.gearTops[1]*15}`);
    assert(pt.shiftUpKmh[0]<=22,`SEDAN first normal shift ${pt.shiftUpKmh[0]} km/h`);
    const same20=20/15;
    const first=pt.peakAccel[0]*pt.torqueMult(1);
    const second=pt.peakAccel[1]*pt.torqueMult(Math.min(1,same20/pt.gearTops[1]));
    assert(first>second,`SEDAN first gear must out-pull second at ~20 km/h (${first} vs ${second})`);
    console.log(`SEDAN training: 1st ${ (pt.gearTops[0]*15).toFixed(0)}km/h redline / shift ${pt.shiftUpKmh[0]}; 2nd ${(pt.gearTops[1]*15).toFixed(0)} / shift ${pt.shiftUpKmh[1]}; 20km/h pull 1st=${first.toFixed(4)} vs 2nd=${second.toFixed(4)}.`);
  }
  if(car.id===CarType.SUV){
    // L80 Ultra+ is a single-speed EV. These assertions replace the old
    // manual-gearbox expectations instead of merely relaxing their ranges.
    assert.equal(isElectricVehicle(CarType.SUV), true, 'L80 must be electric');
    assert.equal(pt.gearTops.length, 1, `L80 must expose one reduction gear, got ${pt.gearTops.length}`);
    assert.equal(pt.shiftUpKmh.length, 1, 'L80 has one EV driving band');
    assert(pt.gearTops[0]*15 > 190, `L80 EV top speed ${(pt.gearTops[0]*15).toFixed(0)} km/h`);
  }
  if(car.id===CarType.SEAL08){
    assert.equal(isElectricVehicle(CarType.SEAL08), true, 'Seal 08 EV must be electric');
    assert.equal(pt.gearTops.length, 1, 'Seal 08 EV must expose one reduction gear');
    assert.equal(pt.shiftUpKmh.length, 1, 'Seal 08 EV has one EV driving band');
    assert(pt.gearTops[0]*15 > 230, `Seal 08 EV top speed ${(pt.gearTops[0]*15).toFixed(0)} km/h`);
  }
  if(car.id===CarType.SPORTS){
    assert(pt.gearTops[0]*15>=55&&pt.gearTops[0]*15<=62,`SPORTS first training redline ${pt.gearTops[0]*15}`);
    assert(pt.gearTops[1]*15>=86&&pt.gearTops[1]*15<=95,`SPORTS second training redline ${pt.gearTops[1]*15}`);
  }
  if(car.id===CarType.ZUNJIE){
    assert(pt.gearTops[0]*15>=40&&pt.gearTops[0]*15<=46,`ZUNJIE first training redline ${pt.gearTops[0]*15}`);
    assert(pt.gearTops[1]*15>=70&&pt.gearTops[1]*15<=80,`ZUNJIE second training redline ${pt.gearTops[1]*15}`);
  }
  assert(canSelectGear(pt,1,-1)); assert(canSelectGear(pt,-1,1));
  assert(canSelectGear(pt,0,-1));assert(canSelectGear(pt,0,1));
  assert(canSelectGear(pt,pt.gearTops[0]*1.1,1), `${car.id}: high-speed downshift stays selectable with warning`);
  assert(canSelectGear(pt,-0.2,-1,), `${car.id}: reverse can be selected while rolling backwards`);
  if(pt.gearTops.length>1) assert(computeRpm(pt,1,2,0,true)<computeRpm(pt,1,1,0,true));
  console.log(`${car.id}: road-wheel lock ${(steer*180/Math.PI).toFixed(1)}°, gear redlines ${pt.gearTops.map(v=>(v*15).toFixed(0))} km/h, shift ${pt.shiftUpKmh.join('/')} km/h, sim-0-100 ${pt.zeroTo100Measured.toFixed(2)}s`);
}
assert(Math.abs(TRAVEL_PER_SPEED_FRAME*60/10-15/3.6)<1e-10);
const car={x:0,y:0,length:50,width:20,rotation:0};
assert(checkVehicleRectCollision(car,{x:23,y:8,width:2,height:2,rotation:0}), 'bumper corner contact must not be lost to a capsule');
assert(!checkVehicleCollision(car,{...car,x:100}), 'collinear cars separated by 100 units do not collide');
assert(!checkVehicleRectCollision(car,{x:30,y:0,width:2,height:20,rotation:0}));
for(let level=1;level<=6;level++) {
  const map=GENERATE_LEVEL(level);
  assert(map.spots.length>0);
  assert(map.roadSurfaces.every(r=>r.width>0&&r.height>0));
  const spawn={...car,x:map.startPos.x,y:map.startPos.y,rotation:map.startPos.rotation};
  for(const o of map.obstacles.filter(o=>o.type==='wall'||o.type==='car')) {
    const hit=o.type==='car'?checkVehicleCollision(spawn,{x:o.x,y:o.y,width:o.width,length:o.height,rotation:o.rotation}):checkVehicleRectCollision(spawn,o);
    assert(!hit,`level ${level} spawn overlaps ${o.id}`);
  }
  for(const p of getVehicleBoundaryPoints(spawn)) assert(p.x>=0&&p.y>=0&&p.x<=map.mapWidth&&p.y<=map.mapHeight);
}

// Decode the actual supplied GLB geometry. Images are irrelevant to binding tests.
(globalThis as any).ProgressEvent = class { constructor(public type:string, public init:any){} };
for(const cfg of Object.values(CAR_MODELS)) {
  let parts=buildProceduralCar(cfg)?.parts;
  if(!parts) {
    const def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[cfg.id]];
    const file=await readFile(new URL(`../public/models/${def.file}`,import.meta.url));
    const length=file.readUInt32LE(12); const json=JSON.parse(file.subarray(20,20+length).toString());
    if (isAuthoredVehicle(cfg.id)) {
      // Count rendered instances, not just unique mesh definitions. Includes
      // every interior part and all four complete wheel assemblies.
      const triangles = json.nodes.reduce((sum: number, node: any) => sum + (node.mesh === undefined ? 0 :
        json.meshes[node.mesh].primitives.reduce((n: number, p: any) => {
          assert.equal(p.mode ?? 4, 4, 'authored vehicle primitives must be triangles');
          return n + json.accessors[p.indices ?? p.attributes.POSITION].count / 3;
        }, 0)), 0);
      assert(triangles <= 8000, `${cfg.id}: complete exported car exceeds 8,000 triangles: ${triangles}`);
      console.log(`${cfg.id}: exported complete car ${triangles} triangles (limit 8000)`);
    }
    const bin=file.subarray(28+length);
    json.buffers[0].uri='data:application/octet-stream;base64,'+bin.toString('base64');
    delete json.images;delete json.textures;delete json.samplers;
    json.materials=json.materials?.map((m: any)=>({name:m.name,pbrMetallicRoughness:{baseColorFactor:[.6,.6,.6,1]}}));
    const gltf=await new GLTFLoader().parseAsync(JSON.stringify(json),'');
    const group=gltf.scene;
    normalizeModel(group, def);
    parts=isAuthoredVehicle(cfg.id)
      ? buildNativeAuthoredVehicle(group,cfg)
      : buildCarMeshFromGLB(group,cfg);
  }
  assert.equal(parts.wheels.length,4,`${cfg.id}: four independently rolling wheels`);
  {
    parts.group.updateWorldMatrix(true,true);
    const bodyBox=new THREE.Box3();
    if (isAuthoredVehicle(cfg.id)) {
      // Manufacturer body width excludes the outboard mirror housings.
      bodyBox.setFromObject(parts.group.getObjectByName('Body')!, true);
    } else {
      parts.group.children.filter(child=>!parts.wheelMounts.includes(child)).forEach(child=>bodyBox.expandByObject(child));
    }
    const bodySize=bodyBox.getSize(new THREE.Vector3());
    assert(Math.abs(bodySize.x-cfg.width)<cfg.width*0.12,`${cfg.id}: body width ${bodySize.x.toFixed(2)} vs cfg ${cfg.width}`);
    assert(Math.abs(bodySize.z-cfg.length)<cfg.length*0.12,`${cfg.id}: body length ${bodySize.z.toFixed(2)} vs cfg ${cfg.length}`);
    // The body shell starts above the wheel contact patch; its TOP must still
    // meet the authored vehicle height even though its own bbox is shorter.
    assert(bodyBox.max.y > cfg.height*0.80 && bodyBox.max.y < cfg.height*1.12,
      `${cfg.id}: body top ${bodyBox.max.y.toFixed(2)} vs cfg height ${cfg.height}`);
    console.log(`${cfg.id}: body ${bodySize.x.toFixed(1)}x${bodySize.z.toFixed(1)} top ${bodyBox.max.y.toFixed(1)} vs cfg ${cfg.width}x${cfg.length}/${cfg.height}; half-track ${(parts.wheelMounts.reduce((sum,m)=>sum+Math.abs(m.position.x),0)/parts.wheelMounts.length).toFixed(1)} (full ${(2*parts.wheelMounts.reduce((sum,m)=>sum+Math.abs(m.position.x),0)/parts.wheelMounts.length).toFixed(1)})`);
  }
  parts.wheels.forEach((wheel,index)=>{
    const beforeCentre = new THREE.Box3().setFromObject(wheel, true).getCenter(new THREE.Vector3());
    wheel.rotation.x += 0.61;
    parts.group.updateWorldMatrix(true,true);
    const afterCentre = new THREE.Box3().setFromObject(wheel, true).getCenter(new THREE.Vector3());
    assert(beforeCentre.distanceTo(afterCentre) < 0.35, `${cfg.id}: wheel ${index} must roll around its own axle centre`);
    wheel.rotation.x -= 0.61;
    parts.group.updateWorldMatrix(true,true);
    const wheelSize=new THREE.Box3().setFromObject(wheel, true).getSize(new THREE.Vector3());
    {
      assert(Math.abs(wheelSize.y-wheelSize.z)<Math.max(0.02,wheelSize.y*0.04),`${cfg.id}: wheel ${index} must be circular in its world radial plane (${wheelSize.y.toFixed(3)} vs ${wheelSize.z.toFixed(3)})`);
    }
    assert(wheelSize.y>1.5&&wheelSize.x>0.5,`${cfg.id}: wheel ${index} has a sane radius/width`);
    assert(new THREE.Box3().setFromObject(wheel, true).min.y > -0.25,
      `${cfg.id}: wheel ${index} bottom must not sink below the ground plane`);
  });
  assert.equal(parts.wheelMounts.length,4,`${cfg.id}: four suspension mounts`);
  if (cfg.id === CarType.SPORTS) {
    const frameNodes = collectConceptCockpitFrameMeshes(parts.group);
    assert.equal(frameNodes.length, 3, `Concept: expected 3 real cockpit boundary meshes after buildCarMeshFromGLB, got ${frameNodes.map(n=>n.name).join(',')}`);
    assert.deepEqual(frameNodes.map(n=>n.name).sort(), ['BodyHood','BodyPillars','BodyRoofPanel']);
    assert(parts.nativeCockpit, 'Concept must use the native full interior');
    assert(parts.group.getObjectByName('InteriorSteeringWheel02'), 'Native wheel rim is retained');
    assert(parts.group.getObjectByName('InteriorDashMid'), 'Native dashboard is retained');
    for (const angle of [-.65, 0, .65]) {
      parts.frontWheels.forEach(m => { m.rotation.y = angle; });
      const live = footprintBounds(parts.updateCollisionFootprint!());
      const geometry = footprintBounds(collectVehicleFootprint(parts.group, true));
      for (const key of ['minX', 'maxX', 'minY', 'maxY'] as const) {
        assert(Math.abs(live[key] - geometry[key]) < .01, `Concept steered collider ${key} follows actual geometry`);
      }
    }
    parts.frontWheels.forEach(m => { m.rotation.y = 0; });

    const eye = parts.nativeCockpit.eye;
    const wheel = parts.extras!.steeringWheels[0];
    assert(eye.z < wheel.object.position.z, 'Eye stays on driver side of the steering wheel');
    assert(eye.distanceTo(wheel.object.position) < 10, 'Wheel remains within a plausible reaching distance');
    for (let i = 0; i < 4; i++) {
      const mount = parts.wheelMounts[i];
      const roll = parts.wheels[i];
      for (const steer of [-.65, 0, .65]) for (const angle of [0, .61, 1.7, 3.1]) {
        mount.rotation.y = steer;
        roll.rotation.x = angle;
        parts.group.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(roll, true);
        assert(Math.abs(box.min.y) < .035, `Concept wheel ${i}: ground contact at steer ${steer}/roll ${angle}, y=${box.min.y}`);
        assert(Math.abs(box.getSize(new THREE.Vector3()).y - roll.userData.wheelRadius * 2) < .04, 'Tyre diameter is invariant under steering/rolling');
        const axle = new THREE.Vector3(1, 0, 0).transformDirection(roll.matrixWorld);
        assert(Math.abs(axle.y) < 1e-8, 'Wheel axle must remain horizontal');
      }
      mount.rotation.y = 0;
      roll.rotation.x = 0;
    }

  }
  {
    // Shared runtime boundary generator: actual tyres/mirrors/body vertices,
    // no width/length*0.51 clipping and no 12% tolerance as the contract.
    const footprint = collectVehicleFootprint(parts.group, true);
    assert(footprint.length >= 4, `${cfg.id}: collision footprint hull`);
    const bounds = footprintBounds(footprint);
    const actualBox = new THREE.Box3().setFromObject(parts.group, true);
    const actualSize = actualBox.getSize(new THREE.Vector3());
    assert(Math.abs((bounds.maxX - bounds.minX) - actualSize.z) < 0.75,
      `${cfg.id}: footprint length must follow actual model (${(bounds.maxX-bounds.minX).toFixed(2)} vs ${actualSize.z.toFixed(2)})`);
    assert(Math.abs((bounds.maxY - bounds.minY) - actualSize.x) < 0.75,
      `${cfg.id}: footprint width must follow actual model incl mirrors/tyres (${(bounds.maxY-bounds.minY).toFixed(2)} vs ${actualSize.x.toFixed(2)})`);
    const collider = { x: 0, y: 0, length: cfg.length, width: cfg.width, rotation: 0, footprint, elevation: 0 };
    assert(checkVehicleCollision(collider, { ...collider, x: 2 * bounds.maxX - 0.5 }), `${cfg.id}: actual nose overlap must collide`);
    assert(!checkVehicleCollision(collider, { ...collider, x: 2 * bounds.maxX + 2.5 }), `${cfg.id}: just beyond actual nose must clear`);
    assert(checkVehicleCollision(collider, { ...collider, y: 2 * bounds.maxY - 0.5 }), `${cfg.id}: actual side overlap must collide`);
    assert(!checkVehicleCollision(collider, { ...collider, y: 2 * bounds.maxY + 1.5 }), `${cfg.id}: just beyond actual side must clear`);
    assert(!vehicleLayersCompatible({ ...collider, elevation: 18 }, { elevation: 0 }), `${cfg.id}: bridge layer must not collide with ground layer`);
    assert(vehicleLayersCompatible({ ...collider, elevation: 18 }, { elevation: 18 }), `${cfg.id}: same bridge layer collides`);
  }
  assert.equal(parts.frontWheels.length,2,`${cfg.id}: two front steering knuckles`);
  parts.group.updateWorldMatrix(true,true);
  parts.group.traverse(node=>{
    if(!(node instanceof THREE.Mesh))return;
    const position=node.geometry.getAttribute('position');
    for(let i=0;i<position.count;i++) assert(Number.isFinite(position.getX(i))&&Number.isFinite(position.getY(i))&&Number.isFinite(position.getZ(i)),`${cfg.id}: finite softened body geometry`);
  });
  for(const mount of parts.frontWheels) {
    assert(mount.getWorldPosition(new THREE.Vector3()).z>0,`${cfg.id}: steering knuckle must be on the FRONT axle`);
    assert.equal(mount.parent,parts.group,`${cfg.id}: normalized parent axes`);
  }
  assert(parts.frontWheels.some(w=>w.position.x>0)&&parts.frontWheels.some(w=>w.position.x<0));
  const frontZ = parts.frontWheels.reduce((sum,w)=>sum+w.position.z,0)/2;
  const rearZ = parts.wheelMounts.filter(w=>!parts.frontWheels.includes(w)).reduce((sum,w)=>sum+w.position.z,0)/2;
  const actualBase = frontZ-rearZ;
  const moved = advanceVehicleCenter(0,0,0,60,actualBase,.4,-rearZ);
  const returned = advanceVehicleCenter(moved.x,moved.y,moved.rotation,-60,actualBase,.4,-rearZ);
  assert(Math.hypot(returned.x,returned.y)<1e-8, `${cfg.id}: asymmetric axle offset reverses exactly`);
  console.log(`${cfg.id}: 4 wheels / 2 steering pivots bound correctly; axle z=${parts.wheelMounts.map(w=>w.position.z.toFixed(1)).join(',')}, spec ±${(cfg.wheelbase/2).toFixed(1)}`);
}
console.log('Driving, collision, spawn and actual vehicle binding regressions passed.');
