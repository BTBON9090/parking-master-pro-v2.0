import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {composeSceneryPose,fitBuildingToObstacle} from '../three/obstacleVisuals';
import {MODEL_REGISTRY,normalizeModel} from '../three/modelLoader';
import type {Obstacle} from '../types';

(globalThis as unknown as {ProgressEvent:unknown}).ProgressEvent ??= class {
 constructor(public type:string,public init:unknown){}
};

const close=(a:number,b:number)=>assert(Math.abs(a-b)<.001,`${a} != ${b}`);
for(const rotation of [0,Math.PI/2,Math.PI,-Math.PI/3]){
 const o={id:'building-alignment-test',x:120,y:300,rotation,width:70,height:130,elevation:15,verticalHeight:90,type:'wall',weight:0,movable:false,color:'#999'} as Obstacle;
 const matrix=new THREE.Matrix4();composeSceneryPose(matrix,o,0,45,0,70,90,130);
 for(const x of [-.5,.5])for(const z of [-.5,.5]){
  const p=new THREE.Vector3(x,-.5,z).applyMatrix4(matrix);
  close(p.y,15);close((p.x-o.x)*Math.cos(rotation)+(p.z-o.y)*Math.sin(rotation),x*70);
  close(-(p.x-o.x)*Math.sin(rotation)+(p.z-o.y)*Math.cos(rotation),z*130);
 }
 composeSceneryPose(matrix,o,7,30,65,2,3,4);
 const window=new THREE.Vector3().applyMatrix4(matrix);
 close(window.x,o.x+7*Math.cos(rotation)-65*Math.sin(rotation));close(window.y,45);
 composeSceneryPose(matrix,o,0,.14,0,70,130,1,true);
 const normal=new THREE.Vector3(0,0,1).transformDirection(matrix);close(normal.y,1);

 for(const name of ['buildingA','buildingB','buildingC']){
  const def=MODEL_REGISTRY[name],bytes=fs.readFileSync('public/models/'+def.file);
  const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length).toString());
  json.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(28+length).toString('base64');
  delete json.images;delete json.textures;delete json.samplers;
  json.materials=json.materials?.map((m:{name:string})=>({name:m.name}));
  const gltf=await new GLTFLoader().parseAsync(JSON.stringify(json),'');normalizeModel(gltf.scene,def);
  fitBuildingToObstacle(gltf.scene,o,90);
  const localBounds=new THREE.Box3();
  gltf.scene.traverse(node=>{if(!(node instanceof THREE.Mesh))return;
   const p=node.geometry.getAttribute('position');
   for(let i=0;i<p.count;i++){
    const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(node.matrixWorld);
    v.sub(new THREE.Vector3(o.x,o.elevation,o.y)).applyAxisAngle(new THREE.Vector3(0,1,0),rotation);
    localBounds.expandByPoint(v);
   }
  });
  close(localBounds.min.x,-35);close(localBounds.max.x,35);
  close(localBounds.min.z,-65);close(localBounds.max.z,65);
  close(localBounds.min.y,0);close(localBounds.max.y,90);
 }
}
console.log('Scenery alignment PASS: actual 3 building GLBs × 4 headings, collider bounds, elevation, attached details and shadow plane');
