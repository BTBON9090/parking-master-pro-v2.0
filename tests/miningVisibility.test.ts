import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CAR_MODELS} from '../constants';
import {CarType} from '../types';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';

// Sample the cab shell at actual runtime eye height, from -90° to +90°.
// This checks the aperture and remaining pillars, not mirrors or other traffic.
const id=CarType.MINING,cfg=CAR_MODELS[id],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]],bytes=fs.readFileSync('public/models/'+def.file);
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
normalizeModel(gltf.scene,def);
const parts=buildNativeAuthoredVehicle(gltf.scene,cfg);parts.group.updateMatrixWorld(true);
const shell=parts.group.getObjectByName('CabShell');assert(shell&&parts.nativeCockpit,'mining cab and runtime eye exist');
shell.traverse(node=>{if(node instanceof THREE.Mesh){const copy=(m:THREE.Material)=>{const c=m.clone();c.side=THREE.DoubleSide;return c};node.material=Array.isArray(node.material)?node.material.map(copy):copy(node.material)}});
const blocked:number[]=[];
for(let angle=-90;angle<=90;angle++){const a=angle*Math.PI/180;const ray=new THREE.Raycaster(parts.nativeCockpit.eye,new THREE.Vector3(Math.sin(a),0,Math.cos(a)),.01,300);if(ray.intersectObject(shell,true).length)blocked.push(angle)}
assert(blocked.every(a=>Math.abs(a)>=30&&Math.abs(a)<=40),`unexpected horizontal view obstruction: ${blocked}`);
for(const sign of [-1,1]){const count=blocked.filter(a=>Math.sign(a)===sign).length;assert(count>=3&&count<=7,`pillar aperture changed unexpectedly: ${count} blocked degrees on ${sign}`)}
console.log('Mining driver view PASS: straight ahead clear, both remaining pillars within angular budget.',blocked);
