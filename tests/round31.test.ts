import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CAR_MODELS,GARAGE_CARS,GENERATE_LEVEL} from '../constants';
import {CarType,type Obstacle} from '../types';
import {FLEET30_IDS} from '../utils/fleet30';
import {FLEET31_IDS} from '../utils/fleet31';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
import {convexContact,vehicleContacts,checkVehicleCollision,getVehicleBoundaryPoints} from '../utils/physics';
import {parkedCarImpact} from '../utils/parkedImpact';
import {heavyCrushEligible,crushedCarSupport} from '../utils/heavyContact';
import {MobileInputController,steeringRulerZoom} from '../utils/mobileInput';
import {assignParkedFleet} from '../utils/fleetParking';
import {buildJunctionPolygon} from '../utils/polyline';
import {challengeMeshHeight} from '../utils/challengeMaps';

const report:any={assets:[],contacts:[],routes:[]};
function islands(geometry:THREE.BufferGeometry){
 const p=geometry.getAttribute('position'),idx=geometry.index,parents=new Map<string,string>();
 const root=(k:string):string=>parents.get(k)===k?k:(parents.set(k,root(parents.get(k)!)),parents.get(k)!);
 for(let i=0;i<(idx?.count??p.count);i+=3){
  const keys=[0,1,2].map(j=>{const v=idx?idx.getX(i+j):i+j;return [p.getX(v),p.getY(v),p.getZ(v)].map(n=>n.toFixed(5)).join(',');});
  for(const k of keys)if(!parents.has(k))parents.set(k,k);
  for(const k of keys.slice(1))parents.set(root(k),root(keys[0]));
 }
 return new Set([...parents.keys()].map(root)).size;
}
// A narrow car fully inside a truck must leave the enclosing hull, rather
// than oscillate forever by correcting only the intersection's width.
const small=[{x:-1,y:-1},{x:1,y:-1},{x:1,y:1},{x:-1,y:1}],large=small.map(p=>({x:p.x*5,y:p.y*5}));
const contact=convexContact(small,large)!;assert.equal(contact.depth,6);
assert.equal(convexContact(small.map(p=>({x:p.x+contact.normal.x*6.001,y:p.y+contact.normal.y*6.001})),large),null);
const truck={x:0,y:0,length:80,width:25,rotation:0,articulated:[[{x:-220,y:-12},{x:-50,y:-12},{x:-50,y:12},{x:-220,y:12}]]};
const npc={x:-190,y:0,length:45,width:20,rotation:0};
assert(!checkVehicleCollision({...truck,articulated:undefined},npc));assert(vehicleContacts(truck,npc).length>0,'rear trailer contact cannot be culled by tractor distance');
for(const mass of [1700,44000,260000]){
 const result=parkedCarImpact({x:10,y:3},{x:0,y:0},{x:-1,y:0},mass,1700);
 assert(Math.abs(result.player.x*mass+result.parked.x*1700-10*mass)<1e-6);
 assert.equal(result.player.y,3);assert(result.parked.x>0);assert(result.player.x<10);
 const energy=mass*(result.player.x**2+result.player.y**2)+1700*result.parked.x**2;
 assert(energy<=mass*109+1e-6);report.contacts.push({mass,...result});
}
const target={id:'crush-target',type:'car',carType:CarType.MINI,x:0,y:0,width:17,height:39,rotation:0,weight:1300,verticalHeight:14,crushed:1} as Obstacle;
assert(heavyCrushEligible(CAR_MODELS[CarType.TRACTOR],target));assert(!heavyCrushEligible(CAR_MODELS[CarType.MINI],target));
assert.equal(crushedCarSupport(target,0,0),14);assert.equal(crushedCarSupport(target,30,0),-Infinity);
// Simultaneous accelerator + steering while the speed-dependent ruler zooms.
const mobile=new MobileInputController();mobile.begin('steer',1,100,0,0);mobile.begin('gas',2,600,100);mobile.move('gas',2,600,56,540);
mobile.steerAt(1,100,0,200,540);let previous=0;
for(let i=1;i<=30;i++){
 mobile.steerAt(1,100+i*2,0,200,540,steeringRulerZoom(20+i*2));
 const angle=mobile.snapshot().steeringWheelAngle!;assert(angle>previous,'speed zoom swallowed this steering movement');previous=angle;
 assert.equal(mobile.snapshot().throttle,1);
}
// Full asset budgets include all trailer wheels. Human hands are a separate
// actor; compact door meshes must not retain unused vertices of the whole car.
for(const id of [...FLEET30_IDS,...FLEET31_IDS]){
 const cfg=CAR_MODELS[id],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]],bytes=fs.readFileSync('public/models/'+def.file);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 let triangles=0,tyres=0;gltf.scene.traverse(n=>{if(n instanceof THREE.Mesh){triangles+=(n.geometry.index?.count??n.geometry.getAttribute('position').count)/3;if(n.name.includes('Tyre'))tyres+=islands(n.geometry);}});
 assert(triangles<=8000,`${id} ${triangles} triangle budget`);if(id===CarType.US22)assert.equal(tyres,22);
 normalizeModel(gltf.scene,def);const parts=buildNativeAuthoredVehicle(gltf.scene,cfg);parts.group.updateMatrixWorld(true);
 const eye=parts.nativeCockpit!.eye;
 if(FLEET31_IDS.includes(id as any)||id===CarType.REVUELTO){
   const hits=new THREE.Raycaster(eye,new THREE.Vector3(0,0,1),0,250).intersectObject(parts.group,true).filter(h=>{const mat=(h.object as THREE.Mesh).material;return mat&&!Array.isArray(mat)&&!mat.transparent;});
   assert.equal(hits.length,0,`${id} forward cockpit occluded by ${hits.map(h=>h.object.name)}`);
 }
 let panels=0;parts.group.traverse(n=>{if(n instanceof THREE.Mesh&&n.userData.detachable){panels++;const size=new THREE.Box3().setFromObject(n,true).getSize(new THREE.Vector3());assert(size.z<cfg.length*.65,`${id} door collision extends over the whole body`);}});
 if(id===CarType.US22)assert(panels>=2,'multimaterial truck cab needs detachable doors');
 assert(parts.group.getObjectByName('driver-hands'));
 report.assets.push({id,triangles,tyres,panels,eye:eye.toArray()});
}
const highway=assignParkedFleet(GENERATE_LEVEL(13)),fleet=highway.obstacles.filter(o=>o.id.startsWith('fleet-park-'));
assert(GARAGE_CARS.every(id=>fleet.some(o=>o.carType===id)),'all garage models appear in service apron');
for(let i=0;i<fleet.length;i++)for(let j=0;j<i;j++)assert(!checkVehicleCollision({...fleet[i],length:fleet[i].height},{...fleet[j],length:fleet[j].height}),'NPC placements overlap');
for(const headings of [[0,Math.PI/2],[0,Math.PI/2,Math.PI],[0,Math.PI/2,Math.PI,Math.PI*1.5]]){
 const polygon=buildJunctionPolygon(headings.map(heading=>({heading,width:100} as any)))!;
 assert(polygon.length>8);assert(polygon.every(p=>Number.isFinite(p.x+p.y)));
 for(const a of headings){const d={x:Math.cos(a),y:Math.sin(a)};assert(polygon.filter(p=>p.x*d.x+p.y*d.y>75).length>=2,'junction must meet full-width approaches');}
}
const fingerprints=new Set<string>();
for(const id of [8,9,10,11,12]){
 const level=GENERATE_LEVEL(id),points=level.curvedRoads![0].points;fingerprints.add(JSON.stringify(points));
 const values=Array.from({length:80},(_,i)=>challengeMeshHeight(level,points[1].x+i*3,points[1].y));
 assert(values.every(Number.isFinite));report.routes.push({id,points:points.length,roughness:Math.max(...values)-Math.min(...values)});
}
assert.equal(fingerprints.size,5);
fs.mkdirSync('docs/round31',{recursive:true});fs.writeFileSync('docs/round31/regression.json',JSON.stringify(report,null,2)+'\n');
console.log('Round31 PASS: contained/trailer contacts, mass impulses, crush support, steering during acceleration, model budgets/22 wheels/door bounds/cockpit, NPC fleet and unique routes.');
