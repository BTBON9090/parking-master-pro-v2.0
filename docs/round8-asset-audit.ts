// Independent asset hierarchy/geometry audit; no browser state access.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CAR_MODELS } from '../constants';
import { CarType } from '../types';
import { buildCarMeshFromGLB } from '../three/geometries';
import { isConceptCockpitFrameNode } from '../utils/materialClassification';
(globalThis as any).ProgressEvent = class { constructor(public type:string, public init:any){} };
const f=await readFile(new URL('../public/models/cars/concept-car.glb',import.meta.url));
const l=f.readUInt32LE(12), j=JSON.parse(f.subarray(20,20+l).toString());
j.buffers[0].uri='data:application/octet-stream;base64,'+f.subarray(28+l).toString('base64');
delete j.images; delete j.textures; delete j.samplers;
j.materials=j.materials.map((m:any)=>({name:m.name,pbrMetallicRoughness:{baseColorFactor:m.pbrMetallicRoughness?.baseColorFactor??[.6,.6,.6,1]}}));
const g=(await new GLTFLoader().parseAsync(JSON.stringify(j),'')).scene;

const rawBox = new THREE.Box3().setFromObject(g);
console.log('RAW',rawBox.min.toArray(),rawBox.max.toArray(),rawBox.getSize(new THREE.Vector3()).toArray());
g.updateWorldMatrix(true,true);
g.traverse(n=>{
 if(n instanceof THREE.Mesh || /wheel|steer|seat|camera/i.test(n.name)) {
 const b=new THREE.Box3().setFromObject(n);
 console.log(JSON.stringify({name:n.name,parent:n.parent?.name,type:n.type,children:n.children.length,pos:n.position.toArray(),scale:n.scale.toArray(),rot:n.rotation.toArray(),min:b.min.toArray(),max:b.max.toArray(),materials:n instanceof THREE.Mesh?(Array.isArray(n.material)?n.material:[n.material]).map(m=>m.name):[]}));
 }
});
for(const name of ['WheelFrontL','WheelFrontR','WheelRearL','WheelRearR']) { const w=g.getObjectByName(name)!; w.quaternion.identity();w.scale.setScalar(1); }
g.updateWorldMatrix(true,true);
console.log('NEUTRAL precise',new THREE.Box3().setFromObject(g,true).min.toArray(),new THREE.Box3().setFromObject(g,true).max.toArray());
for(const name of ['WheelFrontL','WheelFrontR','WheelRearL','WheelRearR','InteriorSteeringCylinder','InteriorSteeringWheel02','BodyWindshield','BodyRoofPanel','InteriorDashMid']) {
 const n=g.getObjectByName(name)!; const b=new THREE.Box3().setFromObject(n,true);
 console.log('NEUTRAL',name,'center',b.getCenter(new THREE.Vector3()).toArray(),'size',b.getSize(new THREE.Vector3()).toArray(),'worldPos',n.getWorldPosition(new THREE.Vector3()).toArray());
}
