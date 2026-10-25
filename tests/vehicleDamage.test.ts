import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {VehicleDamage} from '../three/vehicleDamage';
import {CrashDebris} from '../three/crashDebris';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
import {CAR_MODELS} from '../constants';
import {CarType} from '../types';
import {classifyImpact,solveVehicleImpact} from '../utils/impactResponse';
import {cameraDragMode,resolveInspectionView,stepOrbitDrag} from '../utils/cameraLook';

assert.equal(classifyImpact(1),'none');assert.equal(classifyImpact(3),'light');
assert.equal(classifyImpact(10),'moderate');assert.equal(classifyImpact(20),'severe');
assert.equal(solveVehicleImpact({x:3,y:30},{x:-1,y:0},{x:0,y:0},5,2).tier,'light','fast shallow scrape is not catastrophic');
assert.equal(cameraDragMode('HOOD',true),'orbit');assert.equal(cameraDragMode('HOOD',false),'head');
for(const disabled of [true,false])assert.equal(resolveInspectionView('FOLLOW_FAR',true,disabled),'ORBIT');
assert.equal(resolveInspectionView('HOOD',false,true),'FOLLOW_FAR');
assert.notEqual(stepOrbitDrag({azimuth:0,polar:1},100,0).azimuth,0);

const results=[];
for(const id of [CarType.SUV,CarType.SEDAN,CarType.TAI7,CarType.LI_I9,CarType.N90]){
 const cfg=CAR_MODELS[id],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]],data=fs.readFileSync('public/models/'+def.file);
 const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
 normalizeModel(gltf.scene,def);const parts=buildNativeAuthoredVehicle(gltf.scene,cfg);
 // A rotated/translated car catches accidental world/local deformation errors.
 parts.group.rotation.y=.7;parts.group.position.set(430,0,270);parts.group.updateWorldMatrix(true,true);
 const normal=new THREE.Vector3(0,0,-1).transformDirection(parts.group.matrixWorld);
 const contact=new THREE.Vector3(0,cfg.height*.42,cfg.length*.48).applyMatrix4(parts.group.matrixWorld);
 const original=new Map<THREE.Mesh,THREE.BufferGeometry>();parts.group.traverse(n=>{if(n instanceof THREE.Mesh)original.set(n,n.geometry);});
 const damage=new VehicleDamage(parts.group),light=damage.apply('light',contact,normal,3);
 assert(light.length>0 && light.length<=1,'light impact detaches a lamp island');
 for(const [node,g] of original)if(node.name==='Body')assert.deepEqual(node.geometry.getAttribute('position').array,g.getAttribute('position').array,'light impact keeps whole shell');
 const fragments=damage.apply('moderate',contact,normal,10);
 let displaced=0,maxDisplacement=0;
 for(const [node,g] of original){
  if(node.userData.nativeWheelPart)assert.equal(node.geometry,g,'wheels remain attached and unmodified in medium impact');
  const now=node.geometry.getAttribute('position'),was=g.getAttribute('position');
  for(let i=0;i<now.count;i++){
   const before=new THREE.Vector3().fromBufferAttribute(was,i).applyMatrix4(node.matrixWorld);
   const after=new THREE.Vector3().fromBufferAttribute(now,i).applyMatrix4(node.matrixWorld);
   const d=before.distanceTo(after);if(d>.0001)displaced++;maxDisplacement=Math.max(maxDisplacement,d);
   if(before.distanceTo(contact)>18.01)assert(d<.0001,'deformation is local to impact side');
  }
 }
 assert(displaced>20 && maxDisplacement>.5 && maxDisplacement<6.01);
 parts.updateCollisionFootprint!();assert((parts.group.userData.damageRevision??0)>0);
 for(const piece of [...light,...fragments]){
  const box=new THREE.Box3().setFromObject(piece,true);assert(box.getSize(new THREE.Vector3()).length()<cfg.length,'detached lamp does not retain whole vehicle bounds');
 }
 const debris=new CrashDebris(parts.group,{x:80,y:30},0,[],()=>0,{x:-1,y:0},{looseParts:[...light,...fragments]});
 assert.equal(debris.group.children.length,light.length+fragments.length);assert.equal(debris.world.constraints.length,0,'no driver ejection in minor/medium impact');
 const first=debris.world.bodies.find(b=>b.mass>0)!;assert(first.velocity.x>65 && first.velocity.z>15,'loose parts inherit motion');
 for(let i=0;i<240;i++)debris.step(1/60);
 debris.dispose();assert.equal(debris.world.bodies.length,0);
 damage.reset();for(const [node,g] of original)assert.equal(node.geometry,g,'reset restores pristine cached geometry');
 results.push({id,light:light.length,moderate:fragments.length,displaced,maxDisplacement});
}
// A rigid wall must still block incoming pieces. Momentum is not permission
// to pass through scenery. Test all fragments, including their launch frame.
const cfg=CAR_MODELS[CarType.TAI7],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[cfg.id]],data=fs.readFileSync('public/models/'+def.file);
const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');normalizeModel(gltf.scene,def);
const car=buildNativeAuthoredVehicle(gltf.scene,cfg);car.group.rotation.y=Math.PI/2;
const wall={id:'test-wall',x:36,y:0,width:10,height:500,rotation:0,type:'wall' as const,movable:false,weight:0,color:'#888',verticalHeight:80};
const wreck=new CrashDebris(car.group,{x:200,y:0},0,[wall],()=>0);
const shells=wreck.group.children.filter(n=>n.name.startsWith('body-fragment-'));
for(const mesh of shells){const b=wreck.world.bodies.find(b=>b.mass>100 && b.position.x===mesh.position.x && b.position.z===mesh.position.z)!;assert(b.velocity.x>190,'severe pieces inherit forward speed even at a wall');}
for(let i=0;i<60*22;i++)wreck.step(1/60);
for(const b of wreck.world.bodies.filter(b=>b.mass>0))assert(b.position.x<36,'no wall tunnelling');
// Explicitly wake a resting fragment after 18 s. The scene must still tick.
const body=wreck.world.bodies.find(b=>b.mass>100)!;
// Isolate continued integration from wall/ground contact impulses: a tight
// convex fragment can be wedged at rest, unlike the previous loose box.
body.position.x-=50;body.position.y+=50;body.aabbNeedsUpdate=true;
body.wakeUp();body.velocity.set(-40,30,0);const x=body.position.x;
for(let i=0;i<10;i++)wreck.step(1/60);
assert(body.position.x<x-3,'physics must not freeze at an age cutoff');
wreck.dispose();assert.equal(wreck.world.constraints.length,0);
console.log('Damage tiers, five authored shells, bounded dents/reset, momentum, solid wall and inspection controls PASS',results);
fs.writeFileSync('docs/round17/damage-regression.json',JSON.stringify(results,null,2));
