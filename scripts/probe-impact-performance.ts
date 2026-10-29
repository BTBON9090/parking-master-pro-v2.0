import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CAR_MODELS} from '../constants';
import {CarType} from '../types';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
import {VehicleDamage} from '../three/vehicleDamage';
import {CrashDebris} from '../three/crashDebris';
import {buildHighway} from '../utils/highway';
import {sampleTerrainSurface} from '../utils/terrainSampling';
const percentile=(values:number[],q:number)=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return +sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*q))].toFixed(3);};
const level=buildHighway();
for(const id of [CarType.TAI7,CarType.US22,CarType.MINING]){
 const cfg=CAR_MODELS[id],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]],bytes=fs.readFileSync('public/models/'+def.file);
 const parsed=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const prep=()=>{const scene=parsed.scene.clone(true);normalizeModel(scene,def);const parts=buildNativeAuthoredVehicle(scene,cfg);parts.group.position.set(10000,0,1800);parts.group.updateWorldMatrix(true,true);return parts;};
 const samples:Record<string,number[]>={light:[],moderate:[],debrisBuild:[],debrisStep:[],severeBuild:[],severeStep:[]};let fragmentCount=0;
 for(let i=0;i<12;i++){
  const p=prep(),d=new VehicleDamage(p.group),contact=new THREE.Vector3(0,cfg.height*.42,cfg.length*.48).applyMatrix4(p.group.matrixWorld),normal=new THREE.Vector3(0,0,-1).transformDirection(p.group.matrixWorld);
  let t=performance.now();d.apply('light',contact,normal,3);samples.light.push(performance.now()-t);
  t=performance.now();const pieces=d.apply('moderate',contact,normal,10);samples.moderate.push(performance.now()-t);fragmentCount=pieces.length;
  if(pieces.length){t=performance.now();const debris=new CrashDebris(p.group,{x:80,y:20},0,level.obstacles,(x,z,h)=>sampleTerrainSurface(level,x,z,h).height,{x:-1,y:0},{looseParts:pieces,bounds:{width:level.mapWidth,height:level.mapHeight},spawnDriver:false});samples.debrisBuild.push(performance.now()-t);t=performance.now();for(let n=0;n<30;n++)debris.step(1/60);samples.debrisStep.push((performance.now()-t)/30);debris.dispose();}
  t=performance.now();const wreck=new CrashDebris(p.group,{x:260,y:0},0,level.obstacles,(x,z,h)=>sampleTerrainSurface(level,x,z,h).height,{x:-1,y:0},{mass:cfg.weight,bounds:{width:level.mapWidth,height:level.mapHeight},spawnDriver:false});samples.severeBuild.push(performance.now()-t);
  t=performance.now();for(let n=0;n<30;n++)wreck.step(1/60);samples.severeStep.push((performance.now()-t)/30);wreck.dispose();d.dispose();
 }
 console.log(JSON.stringify({id,units:'ms',samples:12,fragments:fragmentCount,...Object.fromEntries(Object.entries(samples).map(([k,v])=>[k,{median:percentile(v,.5),p95:percentile(v,.95),max:v.length?+Math.max(...v).toFixed(3):null}]))}));
}
