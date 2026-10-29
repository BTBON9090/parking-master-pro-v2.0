import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CAR_MODELS} from '../constants';
import {CarType} from '../types';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
import {suspensionForCar} from '../utils/suspension';
import {fourWheelAckermannAngles} from '../utils/driving';

// Exported geometry audit. Units below are metres; this is model clearance,
// not a claim of manufacturer geometry or a complete collision-volume proof.
export async function auditCommercialClearance(id:CarType, file?:string) {
 const cfg=CAR_MODELS[id],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]],bytes=fs.readFileSync(file??('public/models/'+def.file));
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 let authoredTriangles=0;
 gltf.scene.traverse(n=>{if(n instanceof THREE.Mesh)authoredTriangles+=(n.geometry.index?.count??n.geometry.getAttribute('position').count)/3;});
 normalizeModel(gltf.scene,def);
 const parts=buildNativeAuthoredVehicle(gltf.scene,cfg);parts.group.updateMatrixWorld(true);
 // Calipers legitimately occupy the rim cavity and follow the knuckle.
 const wheelNodes=new Set<THREE.Object3D>();parts.wheelMounts.forEach(w=>w.traverse(n=>wheelNodes.add(n)));
 const bodies:THREE.Mesh[]=[];
 parts.group.traverse(n=>{if(n instanceof THREE.Mesh&&!wheelNodes.has(n)){
  const bothSides=(m:THREE.Material)=>{const copy=m.clone();copy.side=THREE.DoubleSide;return copy;};
  n.material=Array.isArray(n.material)?n.material.map(bothSides):bothSides(n.material);bodies.push(n);
 }});
 const report=[];
 for(const [i,w] of parts.wheels.entries())for(const steering of [-1,-.5,0,.5,1])for(const compression of [-suspensionForCar(id).droopTravel!,0,suspensionForCar(id).bumpTravel!]) {
  const front=parts.frontWheels.includes(parts.wheelMounts[i]);
  const angles=fourWheelAckermannAngles(steering*cfg.dynamics.maxSteerAngle!,0,cfg.wheelbase,cfg.trackWidth/2);
  const steer=front?-(parts.wheelMounts[i].position.x>0?angles.frontLeft:angles.frontRight):0;
  const rotation=new THREE.Matrix4().makeRotationY(steer);
  const centre=w.getWorldPosition(new THREE.Vector3());centre.y+=compression;
  const radius=Number(w.userData.wheelRadius),width=Number(w.userData.wheelWidth);
  const hits=new Map<string,{depthM:number;point:number[]}>();
  for(const lateral of [-.45,0,.45])for(let j=0;j<64;j++){
   const a=j*Math.PI/32,origin=centre.clone().add(new THREE.Vector3(lateral*width,0,0).applyMatrix4(rotation));
   const direction=new THREE.Vector3(0,Math.sin(a),Math.cos(a)).transformDirection(rotation);
   const ray=new THREE.Raycaster(origin,direction,.01,radius-.02);
   for(const hit of ray.intersectObjects(bodies,false)) {
    const depthM=(radius-hit.distance)/10,old=hits.get(hit.object.name);
    if(!old||depthM>old.depthM)hits.set(hit.object.name,{depthM,point:hit.point.toArray().map(v=>v/10)});
   }
  }
  report.push({wheel:i,steering,steerDeg:steer*180/Math.PI,centreM:centre.toArray().map(v=>v/10),radiusM:radius/10,widthM:width/10,compressionM:compression/10,hits:Object.fromEntries(hits)});
 }
 return {id,report,parts,authoredTriangles,root:gltf.scene.getObjectByName('CarRoot')};
}
if(process.argv[1]?.endsWith('probe-commercial-clearance.ts')) {
 const cars=[];
 for(const id of [CarType.MIDIBUS,CarType.LIGHT_TRUCK]){
  const {report}=await auditCommercialClearance(id);cars.push({id,report});
 }
 console.log(JSON.stringify(cars,null,2));
}
