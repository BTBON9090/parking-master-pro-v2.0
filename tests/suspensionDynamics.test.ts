import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CAR_MODELS,GARAGE_CARS} from '../constants';
import {CarType} from '../types';
import {createChassisState,stepChassis,chassisRotation,type RigWheel} from '../utils/chassisSupport';
import {suspensionForCar} from '../utils/suspension';
import {advanceGripLimitedCenter} from '../utils/driving';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
const wheels:RigWheel[]=[[-8.4,15],[8.4,15],[-8.4,-15],[8.4,-15]].map(([x,z])=>({x,z,y:4,radius:4,halfWidth:1.3,steer:0}));
const base={wheels,spec:suspensionForCar(CarType.TAI7),mass:2495,cgM:.67,frontBias:.51,longG:0,latG:0,deltaLeft:0,rideHeight:0};
function simulate(speed:number,terrain:(z:number)=>number,damping=.84,fps=120){
 const state=createChassisState();let z=-200;const records=[];
 const support=(i:number,p:THREE.Vector3,a:THREE.Vector3)=>{
   let best=-Infinity;
   for(let dx=-1;dx<=1;dx+=.125){const t=dx*4;best=Math.max(best,terrain(z+p.z+t)+Math.sqrt(16-t*t)-4);}
   return best+Math.abs(a.y)*1.3;
 };
 stepChassis(state,{...base,support,dt:1/120,deltaForward:0});
 const movingTime=400/(speed*10),count=Math.ceil((movingTime+3)*fps);
 for(let i=0;i<count;i++){
  const distance=i/fps<movingTime?speed*10/fps:0;
  const steps=Math.max(1,Math.ceil(120/fps),Math.ceil(distance/2));
  let pose!:ReturnType<typeof stepChassis>;
  for(let sub=0;sub<steps;sub++){
   z+=distance/steps;pose=stepChassis(state,{...base,spec:{...base.spec,damping},support,dt:1/fps/steps,deltaForward:distance/steps});
   assert(pose.contacts.every(c=>c.gap>-.001),'tyre must not penetrate the road');
   assert(pose.offsets.every(o=>o>=-base.spec.droopTravel!-.0001&&o<=base.spec.bumpTravel!+.0001),'suspension travel bounded');
   assert(!pose.unstable,'vertical bump alone must not trigger rollover');
  }
  records.push({t:i/fps,z,height:pose.height,target:pose.neutralHeight,pitch:pose.pitch,air:pose.airborne,velocity:pose.verticalVelocity});
 }
 return records;
}
const kerb=(z:number)=>z<0?2.6:0;
const crest=(z:number)=>20*Math.exp(-((z/80)**2));
const good=simulate(2,kerb),poor=simulate(2,kerb,.35),slow=simulate(3,crest);
assert(!good.some(r=>r.air)&&!slow.some(r=>r.air),'slow step-down / crest is not a jump');
// After the rear wheels clear the edge, the sprung body continues beyond
// equilibrium and rebounds; compare the SAME car with different dampers.
const tail=(rows:typeof good)=>rows.filter(r=>r.z>24&&r.z<75);
const travel=(rows:typeof good)=>tail(rows).reduce((sum,r,i,a)=>sum+(i?Math.abs(r.height-a[i-1].height):0),0);
const crossings=(rows:typeof good)=>tail(rows).filter((r,i,a)=>i&&r.height*a[i-1].height<0).length;
assert(Math.min(...tail(good).map(r=>r.height))<-.005,'body dips below rest after kerb descent');
assert(crossings(good)>=1,'body rebounds through equilibrium');
assert(crossings(poor)>crossings(good)&&travel(poor)>travel(good)*1.3,'lower damping has larger, longer oscillation');
const crestResults=[];
for(const fps of [15,30,60,120]){
 const rows=simulate(25,crest,.84,fps),air=rows.filter(r=>r.air),last=rows.at(-1)!;
 assert(air.length/fps>.25,'fast crest launches the car');
 assert(air[0].velocity>0,'launch retains upward road velocity');
 assert(!last.air&&Math.abs(last.height-last.target)<.01,'landing settles through springs');
 for(let i=1;i<rows.length;i++)if(rows[i].air&&rows[i-1].air)
   assert(Math.abs((rows[i].velocity-rows[i-1].velocity)*fps+98.0665)<.02,'airborne acceleration is gravity');
 crestResults.push({fps,airtime:air.length/fps,peakHeightM:Math.max(...rows.map(r=>r.height))/10});
}
assert(Math.max(...crestResults.map(r=>r.peakHeightM))-Math.min(...crestResults.map(r=>r.peakHeightM))<.15,'launch not render-frame dependent');
const cars=[];
for(const id of GARAGE_CARS){
 const cfg=CAR_MODELS[id],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]];
 const b=fs.readFileSync(new URL(`../public/models/${def.file}`,import.meta.url));
 const g=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 normalizeModel(g.scene,def);const parts=buildNativeAuthoredVehicle(g.scene,cfg);
 const rig=parts.wheelMounts.map((m,i)=>({x:m.position.x,y:m.position.y,z:m.position.z,radius:Number(parts.wheels[i].userData.wheelRadius),halfWidth:Number(parts.wheels[i].userData.wheelWidth)/2,steer:0}));
 const track=Math.max(...rig.map(w=>w.x))-Math.min(...rig.map(w=>w.x));
 const wb=Math.max(...rig.map(w=>w.z))-Math.min(...rig.map(w=>w.z));
 const rearOffset=-Math.min(...rig.map(w=>w.z)),state=createChassisState();let maxRoll=0,minBody=Infinity;
 const protectedNodes=new Set<THREE.Object3D>();parts.wheelMounts.forEach(m=>m.traverse(o=>protectedNodes.add(o)));
 for(const speed of [20,35,55])for(const sign of [-1,1]){
  let pose={x:0,y:0,rotation:0};
  for(let frame=0;frame<240;frame++){
   const next=advanceGripLimitedCenter(pose.x,pose.y,pose.rotation,speed*10/120,wb,sign*.5,rearOffset,-sign*.1,speed,cfg.dynamics.grip);
   const latG=(next.rotation-pose.rotation)*120*speed/9.80665;
   assert(Math.abs(latG)<=cfg.dynamics.grip+1e-8,'both-axle trajectory respects tyre grip');
   const p=stepChassis(state,{wheels:rig,spec:suspensionForCar(id),mass:cfg.weight,cgM:cfg.dynamics.cgHeightM,frontBias:cfg.dynamics.frontWeightBias,
     longG:0,latG,deltaLeft:0,deltaForward:0,rideHeight:0,dt:1/120,support:(i,h,a)=>rig[i].radius*(Math.sqrt(1-a.y*a.y)-1)+rig[i].halfWidth*Math.abs(a.y)});
   assert(!p.unstable&&!p.airborne,`${id} ordinary grip-limited turning must slide before tipping`);
   maxRoll=Math.max(maxRoll,Math.abs(p.roll));pose=next;
   parts.group.position.set(0,p.height,0);parts.group.quaternion.copy(chassisRotation(p.pitch,p.roll));
  }
  parts.group.updateWorldMatrix(true,true);
  parts.group.traverse(o=>{
   if(!(o instanceof THREE.Mesh)||protectedNodes.has(o))return;
   const positions=o.geometry.getAttribute('position');if(!positions)return;
   for(let i=0;i<positions.count;i++)minBody=Math.min(minBody,new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld).y);
  });
 }
 assert(minBody>0,`${id} body underside must clear flat road while cornering: ${minBody}`);
 cars.push({id,trackM:track/10,maxRollDeg:maxRoll*180/Math.PI,minBodyClearanceCm:minBody*10});
}
const report={kerb:{goodDamping:{crossings:crossings(good),totalHeaveM:travel(good)/10},poorDamping:{crossings:crossings(poor),totalHeaveM:travel(poor)/10}},crestResults,cars};
fs.mkdirSync('docs/round18',{recursive:true});fs.writeFileSync('docs/round18/dynamic-regression.json',JSON.stringify(report,null,2));
console.log('Suspension rebound, damping, ballistic crest/landing, frame rate and actual-model high-speed clearance PASS',report);
