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
const size=new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
g.scale.set(22.42/size.x,11.7/size.y,45.7/size.z);
const box=new THREE.Box3().setFromObject(g),center=box.getCenter(new THREE.Vector3());
g.position.set(-center.x,-box.min.y,-center.z);
const parts=buildCarMeshFromGLB(g,CAR_MODELS[CarType.SPORTS]); parts.group.updateWorldMatrix(true,true);
let selectedCount=0;
parts.group.traverse(n=>{
 if(n instanceof THREE.Mesh && isConceptCockpitFrameNode(n.name)) selectedCount++;
 if(/hood|pillar|roof|panel/i.test(n.name)) {
  const mesh=n as THREE.Mesh, b=new THREE.Box3().setFromObject(n);
  console.log(JSON.stringify({name:n.name,type:n.type,parent:n.parent?.name,determinant:n.matrixWorld.determinant(),selected:isConceptCockpitFrameNode(n.name),materials:mesh.material?(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>({name:m.name,visible:m.visible})):[],min:b.min.toArray(),max:b.max.toArray()}));
 }
});
assert.equal(selectedCount,3,'actual processed Concept must retain all three cockpit boundary meshes');
