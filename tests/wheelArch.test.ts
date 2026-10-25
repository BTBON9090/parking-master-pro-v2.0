import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {GARAGE_CARS,CAR_MODELS} from '../constants';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
import {projectedWheelZ,solveWheelContact,minimumContactRootHeight} from '../utils/wheelContact';
import {suspensionForCar} from '../utils/suspension';

// Recover disconnected trim islands from the EXPORTED triangles, welding
// duplicated normal/material seam vertices. No dependence on Blender names
// for individual skirt pieces (the production meshes are material-batched).
function trimIslands(mesh:THREE.Mesh) {
 const p=mesh.geometry.getAttribute('position'),ids=mesh.geometry.index;
 const unique=new Map<string,number>(),points:THREE.Vector3[]=[],mapped:number[]=[],adj:number[][]=[];
 for(let i=0;i<p.count;i++) {
  const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);
  const key=v.toArray().map(n=>Math.round(n*1e5)).join(',');let id=unique.get(key);
  if(id===undefined){id=points.length;unique.set(key,id);points.push(v);adj.push([]);}mapped.push(id);
 }
 for(let t=0;t<(ids?.count??p.count);t+=3){const a=[0,1,2].map(k=>mapped[ids?ids.getX(t+k):t+k]);
  for(let k=0;k<3;k++){adj[a[k]].push(a[(k+1)%3]);adj[a[(k+1)%3]].push(a[k]);}}
 const remaining=new Set(points.map((_,i)=>i)),islands:THREE.Vector3[][]=[];
 while(remaining.size){const a=remaining.values().next().value!;remaining.delete(a);const stack=[a],found:THREE.Vector3[]=[];
  while(stack.length){const i=stack.pop()!;found.push(points[i]);for(const j of adj[i])if(remaining.delete(j))stack.push(j);}islands.push(found);}
 return islands;
}
const report=[];
for(const id of GARAGE_CARS){
 const cfg=CAR_MODELS[id],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]],spec=suspensionForCar(id);
 const b=fs.readFileSync(new URL(`../public/models/${def.file}`,import.meta.url));
 const gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 normalizeModel(gltf.scene,def);const parts=buildNativeAuthoredVehicle(gltf.scene,cfg);
 parts.group.updateWorldMatrix(true,true);
 const base=parts.wheelMounts.map(m=>m.position.clone());
 const radii=parts.wheels.map(w=>Number(w.userData.wheelRadius));
 const widths=parts.wheels.map(w=>Number(w.userData.wheelWidth));
 const sills:THREE.Vector3[][]=[];
 parts.group.traverse(o=>{if(!(o instanceof THREE.Mesh)||!o.name.startsWith('Surface_CarRoot_')||
  !(Array.isArray(o.material)?o.material:[o.material]).some(m=>['BlackTrim','Cladding'].includes(m.name)))return;
  for(const island of trimIslands(o)){const box=new THREE.Box3().setFromPoints(island),s=box.getSize(new THREE.Vector3()),c=box.getCenter(new THREE.Vector3());
   if(s.x<.9&&s.z>10&&s.y<2.4&&box.max.y<7.5&&Math.abs(c.x)>7)sills.push(island);}
 });
 assert(sills.length>=2,`${id}: actual exported sill geometry located`);
 let minClearance=Infinity,maxDrift=0,minTreadGap=Infinity,cases=0;
 for(const degrees of [-35,-20,-10,0,10,20,35])for(const steer of [-.7,0,.7]){
  const pitch=THREE.MathUtils.degToRad(degrees),grade=-Math.tan(pitch);
  const supports=base.map((v,i)=>(z:number)=>grade*z+radii[i]*(Math.hypot(1,grade*Math.cos(steer))-1)+widths[i]/2*Math.abs(grade*Math.sin(steer)));
  // Average neutral corner height (all four centres in their authored mounts).
  let rootY=base.reduce((sum,v,i)=>sum+supports[i](projectedWheelZ(v.y,v.z,pitch))+radii[i]-v.y*Math.cos(pitch)+v.z*Math.sin(pitch),0)/4;
  const bump=spec.bumpTravel!,droop=spec.droopTravel!;
  rootY=Math.max(rootY,minimumContactRootHeight(base.map((v,i)=>supports[i](projectedWheelZ(v.y+bump,v.z,pitch))),radii,base.map(v=>v.y),base.map(v=>v.z),bump,pitch));
  parts.group.position.set(0,rootY,0);parts.group.rotation.set(pitch,0,0);
  parts.wheelMounts.forEach((m,i)=>{
   m.position.copy(base[i]);m.position.y=solveWheelContact(rootY,radii[i],base[i].z,pitch,base[i].y-droop,base[i].y+bump,supports[i]);
   m.rotation.order='XYZ';m.rotation.set(-pitch,steer,0);parts.wheels[i].rotation.x=.43;
  });parts.group.updateWorldMatrix(true,true);
  parts.wheels.forEach((w,i)=>{
   const hub=w.getWorldPosition(new THREE.Vector3());parts.group.worldToLocal(hub);
   maxDrift=Math.max(maxDrift,Math.abs(hub.z-base[i].z));
   w.traverse(o=>{if(!(o instanceof THREE.Mesh)||!(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.name==='Tyre'))return;
    const p=o.geometry.getAttribute('position');for(let j=0;j<p.count;j++){
     const v=new THREE.Vector3().fromBufferAttribute(p,j).applyMatrix4(o.matrixWorld);
     minTreadGap=Math.min(minTreadGap,(v.y-grade*v.z)/Math.hypot(1,grade));
    }});
   const actualZ=projectedWheelZ(parts.wheelMounts[i].position.y,base[i].z,pitch);
   const centreY=w.getWorldPosition(new THREE.Vector3()).y;
   assert(Math.abs(centreY-radii[i]-supports[i](actualZ))<.02,`${id}: no float at ${degrees}° / steer ${steer}`);
  });
  cases++;
 }
 // Full compression/droop and yaw cannot enter the rocker: use the complete
 // swept tyre cylinder radius, and tilt the actual sill vertices for braking.
 for(const island of sills)for(const bodyPitch of [-.03,0,.03]){
  const bb=new THREE.Box3().setFromPoints(island.map(p=>p.clone().applyAxisAngle(new THREE.Vector3(1,0,0),bodyPitch)));
  for(let i=0;i<4;i++){
   const sweep=Math.hypot(radii[i],widths[i]/2);
   const gap=i<2?base[i].z-sweep-bb.max.z:bb.min.z-(base[i].z+sweep);
   minClearance=Math.min(minClearance,gap);
  }
 }
 assert(minClearance>.15,`${id}: sill intersects full tyre sweep (${minClearance})`);
 assert(maxDrift<1e-5,`${id}: wheel has slid longitudinally in its wheel arch (${maxDrift})`);
 assert(minTreadGap>-.015,`${id}: pitched tread cuts into slope (${minTreadGap})`);
 report.push({id,cases,minSillClearanceCm:minClearance*10,maxAxleDriftMm:maxDrift*100,minSlopeTreadGapCm:minTreadGap*10});
}
fs.mkdirSync('docs/round15',{recursive:true});fs.writeFileSync('docs/round15/wheel-arch-regression.json',JSON.stringify(report,null,2));
console.log('All five actual GLBs: fixed axle through ±35° grades, steered slope contact, and full-travel/steering sill clearance PASS',report);
