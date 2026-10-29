import assert from 'node:assert/strict';
import {CAR_MODELS,DEFAULT_VEHICLE_TUNING,GARAGE_CARS} from '../constants';
import {CarType} from '../types';
import {getPowertrain} from '../utils/powertrain';
import {stepLongitudinal,createLongitudinalState,type LongitudinalInputs} from '../utils/longitudinal';
import {stepExperimentalDrivetrain,stepExperimentalFrames,type ExperimentalContacts} from '../utils/experimentalDrivetrain';
const inputs:LongitudinalInputs={gear:1,engineStarted:true,gasPressed:false,shiftPressed:false,throttle:1,brake:0,handbrake:false,absEnabled:true};
function run(id:CarType,split=false){
 const cc=CAR_MODELS[id];const ctx={carId:id,cc,pt:getPowertrain(id),vehicleTune:DEFAULT_VEHICLE_TUNING[id],weatherGrip:1,driveGripBudget:1,slopeAlongCar:0,tunedShiftFrames:10,elapsedFrames:1};
 const r=cc.dynamics.transmission.wheelRadiusM;const front=cc.weight*9.81*cc.dynamics.frontWeightBias/2,rear=cc.weight*9.81*(1-cc.dynamics.frontWeightBias)/2;
 let contacts=[front,front,rear,rear].map((n,i)=>({omega:0,radius:r,inertia:1.2,normalN:n,friction:cc.dynamics.grip*(split&&i===3?.08:1),grounded:true})) as ExperimentalContacts;
 let sample=createLongitudinalState(),baseline=createLongitudinalState();
 for(let i=0;i<180;i++){
  const next=stepExperimentalDrivetrain(sample,inputs,ctx,contacts);sample=next.result;contacts=next.wheels;
  baseline=stepLongitudinal(baseline,inputs,ctx);
  assert(Number.isFinite(sample.speed)&&contacts.every(w=>Number.isFinite(w.omega)));
 }
 const acceleration={sample:sample.speed,baseline:baseline.speed,splitOmega:[contacts[2].omega,contacts[3].omega]};
 const brake={...inputs,throttle:0,brake:1};
 for(let i=0;i<300;i++){
  const next=stepExperimentalDrivetrain(sample,brake,ctx,contacts);sample=next.result;contacts=next.wheels;
  baseline=stepLongitudinal(baseline,brake,ctx);
  assert(next.mode==='legacy-braking');
 }
 assert(Math.abs(sample.speed)<.01&&Math.abs(baseline.speed)<.01,`${id}: stop`);
 return acceleration;
}
for(const id of [CarType.MINI,CarType.SEAL08,CarType.TRUCK]){
 const d=run(id);assert(d.sample>0&&d.baseline>0);assert(d.sample/d.baseline>.35&&d.sample/d.baseline<2,`${id}: sample ${d.sample}, baseline ${d.baseline}`);console.log(id,d);
}
const split=run(CarType.TRUCK,true),dry=run(CarType.TRUCK,false);assert(split.sample<dry.sample*.8);assert(split.splitOmega[1]>split.splitOmega[0]);
// Under identical starting speed, the tested adapter delegates braking exactly
// to legacy ABS and must reproduce the same speed/distance on every frame.
{
 const id=CarType.TRUCK,cc=CAR_MODELS[id];const ctx={carId:id,cc,pt:getPowertrain(id),vehicleTune:DEFAULT_VEHICLE_TUNING[id],weatherGrip:1,slopeAlongCar:0,tunedShiftFrames:10,elapsedFrames:1};
 let sample=createLongitudinalState(4),baseline=createLongitudinalState(4),distA=0,distB=0;
 let wheels=Array.from({length:4},()=>({omega:sample.speed*15/3.6/.4,radius:.4,inertia:1.2,normalN:5500,friction:.8,grounded:true})) as ExperimentalContacts;
 for(let i=0;i<240;i++){
  const brake={...inputs,throttle:0,brake:1},x=stepExperimentalDrivetrain(sample,brake,ctx,wheels);sample=x.result;wheels=x.wheels;baseline=stepLongitudinal(baseline,brake,ctx);
  distA+=sample.speed;distB+=baseline.speed;assert(Math.abs(sample.speed-baseline.speed)<1e-10);
 }
 assert.equal(distA,distB);
}
// Nineteen other garage vehicles cannot accidentally enter the four-wheel
// experiment, including tracked, three-wheel and six-knuckle heavy vehicles.
for(const id of GARAGE_CARS.filter(id=>![CarType.MINI,CarType.SEAL08,CarType.TRUCK].includes(id))){
 const cc=CAR_MODELS[id],ctx={carId:id,cc,pt:getPowertrain(id),vehicleTune:DEFAULT_VEHICLE_TUNING[id],weatherGrip:1,slopeAlongCar:0,tunedShiftFrames:10,elapsedFrames:1};
 const c=Array.from({length:4},()=>({omega:0,radius:.4,inertia:1.2,normalN:5000,friction:1,grounded:true})) as ExperimentalContacts;
 assert.throws(()=>stepExperimentalDrivetrain(createLongitudinalState(),inputs,ctx,c),/restricted/);
}
// Identical fixed-step sequencing from 30/60/120 Hz renderer input.
function byRendererHz(hz:number){
 const id=CarType.MINI,cc=CAR_MODELS[id];const ctx={carId:id,cc,pt:getPowertrain(id),vehicleTune:DEFAULT_VEHICLE_TUNING[id],weatherGrip:1,slopeAlongCar:0,tunedShiftFrames:10,elapsedFrames:1};
 let state=createLongitudinalState(),carry=0;let wheels=Array.from({length:4},()=>({omega:0,radius:.31265,inertia:1.2,normalN:cc.weight*9.81/4,friction:1,grounded:true})) as ExperimentalContacts;
 for(let frame=0;frame<hz*3;frame++){carry+=60/hz;while(carry>=1-1e-9){carry-=1;const out=stepExperimentalDrivetrain(state,inputs,ctx,wheels);state=out.result;wheels=out.wheels;}}
 return state.speed;
}
const speed30=byRendererHz(30),speed60=byRendererHz(60),speed120=byRendererHz(120);
assert(Math.abs(speed30-speed60)<1e-9&&Math.abs(speed60-speed120)<1e-9);
// Exercise the actual render-frame accumulator rather than a test-side loop.
function renderFrames(hz:number){
 const id=CarType.MINI,cc=CAR_MODELS[id];const context={carId:id,cc,pt:getPowertrain(id),vehicleTune:DEFAULT_VEHICLE_TUNING[id],weatherGrip:1,slopeAlongCar:0,tunedShiftFrames:10,elapsedFrames:60/hz};
 let state=createLongitudinalState();let wheels=Array.from({length:4},()=>({omega:0,radius:.31265,inertia:1.2,normalN:cc.weight*9.81/4,friction:1,grounded:true})) as ExperimentalContacts;
 for(let i=0;i<hz*3;i++){const out=stepExperimentalFrames(state,inputs,context,wheels);state=out.result;wheels=out.wheels;}
 return state.speed;
}
assert(Math.abs(renderFrames(30)-renderFrames(60))<1e-9);
assert(Math.abs(renderFrames(120)-renderFrames(60))<1e-9);
// The actual bridge's turn budget reduces available contact friction at speed.
{
 const id=CarType.TRUCK,cc=CAR_MODELS[id];const context={carId:id,cc,pt:getPowertrain(id),vehicleTune:DEFAULT_VEHICLE_TUNING[id],weatherGrip:1,slopeAlongCar:0,tunedShiftFrames:10,elapsedFrames:1};
 const mk=(grip:number)=>Array.from({length:4},()=>({omega:1*15/3.6/.4,radius:.4,inertia:1.2,normalN:5000,friction:grip,grounded:true})) as ExperimentalContacts;
 let a=createLongitudinalState(1),b=createLongitudinalState(1),wa=mk(.8),wb=mk(.008);
 for(let i=0;i<60;i++){const x=stepExperimentalFrames(a,inputs,context,wa),y=stepExperimentalFrames(b,inputs,context,wb);a=x.result;b=y.result;wa=x.wheels;wb=y.wheels;}
 assert(a.speed>b.speed,'constrained turn traction must reduce acceleration');
}
console.log('Experimental integration PASS: bounded dry launch, split-grip slowdown, legacy braking');
