import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {stepLateral,createLateralState,advanceLateralPose} from '../utils/lateralDynamics';
import {GARAGE_CARS,CAR_MODELS,DEFAULT_VEHICLE_TUNING,DEFAULT_MIRROR_ADJUSTMENTS} from '../constants';
import {CarType} from '../types';
import {getPowertrain,canSelectGear} from '../utils/powertrain';
import {stepLongitudinal,createLongitudinalState} from '../utils/longitudinal';
import {solveVehicleImpact} from '../utils/impactResponse';
import {MobileInputController,PEDAL_TRAVEL_PX} from '../utils/mobileInput';
import {autoCenterWheelAngle,applySymmetricSteeringDelta} from '../utils/steering';
import {dragMirror} from '../utils/mirrorInteraction';
import {stableSunTarget} from '../utils/stableShadow';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
const report:{pedals:any[];handling:any[];assets:any[];reversal:any[];impacts:any[]}={pedals:[],handling:[],assets:[],reversal:[],impacts:[]};
const cfg=CAR_MODELS[CarType.TAI7];
const base={speed:25,steer:0,rearSteer:0,wheelbase:cfg.wheelbase/10,rearOffset:cfg.wheelbase/20,frontBias:cfg.dynamics.frontWeightBias,grip:cfg.dynamics.grip,layout:cfg.dynamics.driveLayout,throttle:0,handbrake:false,frontLocked:false,dt:1/60,understeer:cfg.dynamics.understeerGradient};
function drive(hz:number,steer:number,handbrake=false){const state=createLateralState();let speed=25,maxSlip=0,maxYaw=0,maxG=0,energy=0;
 for(let n=0;n<hz*3;n++){const t=n/hz;const angle=steer*Math.min(1,Math.max(0,(t-.25)/.22));const r=stepLateral(state,{...base,speed,steer:angle,handbrake:handbrake&&t>.7&&t<1.3,dt:1/hz});
 maxSlip=Math.max(maxSlip,Math.abs(r.beta));maxYaw=Math.max(maxYaw,Math.abs(r.yawRate));maxG=Math.max(maxG,Math.abs(r.lateralG));speed=Math.max(0,speed-r.scrubAccel/hz);assert(speed<=25);energy+=r.scrubAccel/hz;
 assert(Number.isFinite(r.beta)&&Number.isFinite(r.yawRate));}
 return {hz,steer,handbrake,maxSlip,maxYaw,maxG,finalSpeed:speed,scrub:energy};}
for(const hz of [30,60,120]){const gentle=drive(hz,.01),sharp=drive(hz,.35),hand=drive(hz,.14,true);
 assert(gentle.maxSlip<.05&&gentle.maxG<.25,'gentle steering remains gentle');
 assert(sharp.maxSlip>.2,'sharp flick creates real tail-out');assert(hand.maxSlip>.25,'rear handbrake breaks rear grip');assert(sharp.scrub>gentle.scrub+.5,'turn scrub loses coasting energy');report.handling.push(gentle,sharp,hand);}
assert(Math.abs(report.handling[1].maxSlip-report.handling[7].maxSlip)<.06,'drift response consistent at 30/120fps');
for(const angle of [Math.PI*2/15,Math.PI*3/15]){const state=createLateralState();for(let n=0;n<60;n++)stepLateral(state,{...base,steer:angle});let last:number|undefined;
 for(let offset=-.01;offset<=.01001;offset+=.0005){const r=stepLateral({...state},{...base,steer:angle+offset});if(last!==undefined)assert(Math.abs(r.yawRate-last)<.08,'no threshold yaw jump at full/1.5 turns');last=r.yawRate;}}
assert.equal(applySymmetricSteeringDelta(360,1,540,1)-360,applySymmetricSteeringDelta(359,1,540,1)-359);
const arc=advanceLateralPose(0,0,0,10,.3,.1);assert(Math.hypot(arc.x,arc.y)<=10,'turn never adds distance');
for(const id of GARAGE_CARS){const c=CAR_MODELS[id],pt=getPowertrain(id),ctx={carId:id,cc:c,pt,vehicleTune:DEFAULT_VEHICLE_TUNING[id],weatherGrip:1,slopeAlongCar:0,tunedShiftFrames:pt.shiftFrames,elapsedFrames:1};
 let last=0;
 for(const throttle of [.08,.15,.30]){let s=createLongitudinalState(),at30=0;for(let j=0;j<40*60;j++){s=stepLongitudinal(s,{gear:1,engineStarted:true,throttle,gasPressed:false,shiftPressed:false,brake:0,handbrake:false},ctx);if(j===30*60)at30=s.speed;}
 const kmh=s.speed*15;assert(kmh>last&&kmh<36,'light pedal has finite low equilibrium');assert(Math.abs(at30-s.speed)<.04,'steady low opening stops accelerating');last=kmh;report.pedals.push({id,throttle,kmh});}
 for(const direction of [-1,1]){let s=createLongitudinalState(2*direction),changed=false,maxStep=0,previous=s.speed;assert(canSelectGear(pt,s.speed,-direction));
 for(let j=0;j<9*60;j++){const reverseAssist=s.speed*direction>.015;s=stepLongitudinal(s,{gear:-direction,engineStarted:true,throttle:.3,gasPressed:false,shiftPressed:false,brake:0,handbrake:false,reverseAssist},ctx);maxStep=Math.max(maxStep,Math.abs(s.speed-previous));changed ||= s.speed*direction<-.1;previous=s.speed;}
 assert(changed&&maxStep<.1,`${id}/${direction}: D/R brakes smoothly then reverses: final=${s.speed}, step=${maxStep}`);report.reversal.push({id,direction,maxStep,finalKmh:s.speed*15});}
 const bytes=fs.readFileSync(`public/models/${MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]].file}`);const g=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');normalizeModel(g.scene,MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]]);const parts=buildNativeAuthoredVehicle(g.scene,c);
 const mark=parts.group.getObjectByName('steering-centre-reference');assert(mark,'all six cars have an authored-wheel reference mark');parts.group.updateWorldMatrix(true,true);
 const marker=mark!.getWorldPosition(new THREE.Vector3()),pivot=parts.extras!.steeringWheels[0].object.getWorldPosition(new THREE.Vector3());assert(marker.y>pivot.y+.8,'mark sits at upper rim');
 let blocked=0;parts.group.traverse(node=>{if(!(node instanceof THREE.Mesh)||!node.name.startsWith('Interior_CarRoot_')||!(Array.isArray(node.material)?node.material:[node.material]).some(m=>m.name==='BlackTrim'))return;
 const p=node.geometry.getAttribute('position'),idx=node.geometry.index;for(let t=0;t<(idx?.count??p.count);t+=3){if([0,1,2].every(k=>{const v=new THREE.Vector3().fromBufferAttribute(p,idx?idx.getX(t+k):t+k).applyMatrix4(node.matrixWorld);return Math.abs(v.x)<1.3&&v.y>c.height*.68&&v.z>3&&v.z<c.length*.30;}))blocked++;}});assert.equal(blocked,0);report.assets.push({id,markerAboveHub:marker.y-pivot.y,blockedTriangles:blocked});}
for(const closing of [.2,2,6])for(const arm of [-2,0,2]){const v={x:20,y:-closing},r=solveVehicleImpact(v,{x:0,y:1},{x:arm,y:-1},5,2);assert(r.velocity.y>0,'glance must leave wall');assert(r.velocity.x>15,'scrape retains tangent');const inertia=29/12;assert(r.velocity.x**2+r.velocity.y**2+inertia*r.yawRate**2<=400+closing**2+1e-6,'bounce cannot add energy');report.impacts.push({closing,arm,outward:r.velocity.y,yaw:r.yawRate});}
const touch=new MobileInputController();touch.begin('gas',1,0,100);touch.move('gas',1,0,100-PEDAL_TRAVEL_PX,540);assert.equal(touch.snapshot().throttle,1);assert(PEDAL_TRAVEL_PX<100);
let a=180;for(let j=0;j<600;j++)a=autoCenterWheelAngle(a,0,1,16,true);assert.equal(a,0);assert.equal(autoCenterWheelAngle(90,0,1,16,false),90);assert(autoCenterWheelAngle(180,4,1,16,true)<autoCenterWheelAngle(180,0,1,16,true));
for(const id of ['left','right','centre'] as const){const d=dragMirror(id,DEFAULT_MIRROR_ADJUSTMENTS[id],1000,-1000);assert(Math.abs(d.yaw)<=25&&d.pitch===18);}
const p=new THREE.Vector3(0,0,0),snap=stableSunTarget(p,200,2048),small=stableSunTarget(new THREE.Vector3(.00001,0,0),200,2048);assert(small.distanceTo(snap)<.00002);
fs.mkdirSync('docs/round24',{recursive:true});fs.writeFileSync('docs/round24/regression.json',JSON.stringify(report,null,2));console.log('Round24 PASS: continuous lateral force, oversteer, scrub, light pedal equilibrium, both rolling shifts, glancing impulse, every cockpit, mirrors and parking return.');
