import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CAR_MODELS} from '../constants';
import {CarType} from '../types';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';

// Reproducible horizontal ray sweep from the actual calibrated game eye.
// Measures shell alone, not mirrors, other traffic or the full visual field.
for(const id of [CarType.SUV,CarType.MINING]) {
 const cfg=CAR_MODELS[id],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]];
 const bytes=fs.readFileSync('public/models/'+def.file);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 normalizeModel(gltf.scene,def);
 const parts=buildNativeAuthoredVehicle(gltf.scene,cfg);
 parts.group.updateMatrixWorld(true);
 const eye=parts.nativeCockpit!.eye.clone(),occluders:THREE.Mesh[]=[];
 parts.group.traverse(node=>{
  if(!(node instanceof THREE.Mesh))return;
  const shell=id===CarType.MINING?node.name.startsWith('CabShellMesh'):node.name.startsWith('BodyMesh');
  if(!shell)return;
  const copy=(m:THREE.Material)=>{const cloned=m.clone();cloned.side=THREE.DoubleSide;return cloned};
  node.material=Array.isArray(node.material)?node.material.map(copy):copy(node.material);
  occluders.push(node);
 });
 const hits:number[]=[];
 for(let angle=-90;angle<=90;angle++) {
  const radians=angle*Math.PI/180;
  const ray=new THREE.Raycaster(eye,new THREE.Vector3(Math.sin(radians),0,Math.cos(radians)),.01,300);
  if(ray.intersectObjects(occluders,true).length)hits.push(angle);
 }
 const runs:number[][]=[];
 for(const angle of hits) {
  const last=runs.at(-1);
  if(last&&angle===last[1]+1)last[1]=angle;
  else runs.push([angle,angle]);
 }
 console.log(JSON.stringify({id,eye:eye.toArray(),shells:occluders.map(n=>n.name),blockedYawDeg:runs,blockedCount:hits.length,sampleStepDeg:1}));
}
