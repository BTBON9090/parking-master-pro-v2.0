import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GENERATE_LEVEL,LEVEL_LIST,CAR_MODELS} from '../constants';
import {CarType} from '../types';
import {roughness,WORLD_ROUTES,worldHeight,nearestWorldRoad} from '../utils/openWorld';
import {createChassisState,stepChassis,RigWheel} from '../utils/chassisSupport';
import {suspensionForCar} from '../utils/suspension';
import {disposeResources} from '../three/disposeResources';
import {CrashDebris} from '../three/crashDebris';
import {VehicleRollover} from '../three/vehicleRollover';
const report:any={};
assert.deepEqual(LEVEL_LIST.map(l=>l.id),[1,4,6,8,9,10,11,12]);
const campus=GENERATE_LEVEL(4);assert(campus.spots.length>=12);for(const id of [2,3,4,5])assert(campus.spots.some(s=>s.id.startsWith(`campus-${id}-`)));assert(campus.slopeZones!.length>0);assert(campus.curvedRoads!.length>=10);
for(const id of [2,3,5])assert.equal(GENERATE_LEVEL(id).levelId,4);
assert.equal(GENERATE_LEVEL(7).levelId,1);
assert(campus.curvedRoads!.every(c=>(c.markingGaps?.length??0)>0));
report.campus={size:[campus.mapWidth,campus.mapHeight],spots:campus.spots.length,curves:campus.curvedRoads!.length,slopes:campus.slopeZones!.length};
// Boundary samples on both sides of all isolated road shoulders. Old max()
// created sudden discontinuities where road and coarse terrain disagreed.
let maxEdgeJump=0,edgeChecks=0;
for(const r of WORLD_ROUTES)for(let i=10;i<r.samples.length-10;i+=13)for(const side of [-1,1]){
 const p=r.samples[i],x=p.x+side*p.nx*r.width/2,y=p.y+side*p.ny*r.width/2;
 if(nearestWorldRoad(x,y)?.route.id!==r.id)continue;
 const a=worldHeight(x-side*p.nx*.001,y-side*p.ny*.001),b=worldHeight(x+side*p.nx*.001,y+side*p.ny*.001);
 maxEdgeJump=Math.max(maxEdgeJump,Math.abs(a-b));edgeChecks++;
}
assert(maxEdgeJump<.015,`road shoulder discontinuity ${maxEdgeJump}`);report.shoulder={edgeChecks,maxEdgeJumpCm:maxEdgeJump*10};
const rough=Array.from({length:500},(_,i)=>roughness(12000+i,4800));
assert(Math.max(...rough)-Math.min(...rough)>1.8,'meaningful unevenness');
for(const period of [10,20,30,60,100])assert(rough.slice(period).some((r,i)=>Math.abs(r-rough[i])>.2),'no repeating wave');
report.roughnessRangeCm=(Math.max(...rough)-Math.min(...rough))*10;
const wheels:RigWheel[]=[[-8.4,15],[8.4,15],[-8.4,-15],[8.4,-15]].map(([x,z])=>({x,z,y:4,radius:4,halfWidth:1.3,steer:0}));
const base={wheels,spec:suspensionForCar(CarType.TAI7),mass:2495,cgM:.67,frontBias:.51,longG:0,deltaLeft:0,deltaForward:0,rideHeight:0,dt:1/120};
const sway=(latG:number)=>{const state=createChassisState();let p:any;for(let i=0;i<600;i++)p=stepChassis(state,{...base,latG,support:(i,h,a)=>4*(Math.sqrt(1-a.y*a.y)-1)+1.3*Math.abs(a.y)});return Math.abs(p.roll)*180/Math.PI;};
const gentle=sway(.1),hard=sway(.8);assert(gentle<hard*.12);report.sway={gentleAtPoint1G:gentle,hardAtPoint8G:hard};
// Disposing shared GPU allocations once, including an invisible detached floor.
const geo=new THREE.BoxGeometry(),texture=new THREE.Texture(),mat=new THREE.MeshStandardMaterial({map:texture});let disposed=[0,0,0];
geo.addEventListener('dispose',()=>disposed[0]++);mat.addEventListener('dispose',()=>disposed[1]++);texture.addEventListener('dispose',()=>disposed[2]++);
const root=new THREE.Group(),detached=new THREE.Group();root.add(new THREE.Mesh(geo,mat));detached.add(new THREE.Mesh(geo,mat));disposeResources([root,detached]);assert.deepEqual(disposed,[1,1,1]);report.disposal=disposed;
// Full accident simulation keeps ticking after pieces sleep, then switches the
// same driver meshes into the get-up/look-back/kneel/head-in-hands performance.
const car=new THREE.Group();car.add(new THREE.Mesh(new THREE.BoxGeometry(18,12,45),new THREE.MeshStandardMaterial()));car.position.set(400,12,400);
const wreck=new CrashDebris(car,{x:150,y:0},0,[],()=>0);let phases=new Set<string>(),recoveryAt=0;
for(let i=0;i<120*60;i++){wreck.step(1/120);if(wreck.reaction){if(!recoveryAt)recoveryAt=i/120;phases.add(wreck.reaction.phase);}}
assert(wreck.reaction,'settled driver must recover');assert.equal(wreck.reaction.phase,'抱头痛哭');assert.equal(phases.size,4);assert.equal(wreck.reaction.root.children.filter(p=>p.name.startsWith('driver-')).length,6);assert.equal(wreck.world.constraints.length,0);
assert(wreck.reaction.root.children.every(p=>Number.isFinite(p.position.y)));report.driver={recoveryAt,phases:[...phases]};wreck.dispose();
// A support-loss event becomes a live rigid body, not a frozen pose.
const source=new THREE.Group();source.position.set(100,180,100);source.rotation.z=1.08;
const roll=new VehicleRollover(source,{mass:2495,width:20,length:50,height:19,cgHeight:6.7,wheels:wheels.map(w=>({position:new THREE.Vector3(w.x,w.y,w.z),radius:w.radius,width:2.6,steer:0})),velocity:new THREE.Vector3(),tipX:1,tipZ:0,surface:()=>0});
const initial=source.position.clone();for(let i=0;i<600;i++)roll.step(1/120);assert(source.position.distanceTo(initial)>80,'gravity continues after rollover');assert(roll.elapsed>4.9);report.rollover={elapsed:roll.elapsed,travel:source.position.distanceTo(initial)};roll.dispose();
fs.mkdirSync('docs/round21',{recursive:true});fs.writeFileSync('docs/round21/regression.json',JSON.stringify(report,null,2));console.log('Round21 PASS',report);
