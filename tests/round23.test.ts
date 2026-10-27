import assert from 'node:assert/strict';
import {MobileInputController,pedalFeedback} from '../utils/mobileInput';
import {ResolutionSampler,nextResolution,qualityProfile,retainedResolution} from '../utils/renderQuality';
import {createLongitudinalState,stepLongitudinal} from '../utils/longitudinal';
import {GARAGE_CARS,CAR_MODELS,DEFAULT_VEHICLE_TUNING} from '../constants';
import {getPowertrain} from '../utils/powertrain';

const fingers=new MobileInputController();
assert(fingers.begin('steer',10,100,200));
fingers.move('steer',10,150,200,540);
const angle=fingers.snapshot().steeringWheelAngle;
assert(angle!>0);
assert(fingers.begin('gas',11,700,300));
let previous=0;
for(let y=300;y>=256;y-=4){
 fingers.move('gas',11,700,y,540);
 const input=fingers.snapshot();assert(input.throttle>previous);previous=input.throttle;
 assert.equal(input.gasPressed,false);assert.equal(input.steeringWheelAngle,angle);
}
assert.equal(fingers.snapshot().throttle,1);
assert(!fingers.end('gas',10),'steering finger cannot release throttle');
assert(!fingers.begin('gas',12,0,0),'third finger cannot steal an active pedal');
assert(fingers.begin('brake',12,600,300));
fingers.move('brake',12,600,200,540);
assert.equal(fingers.snapshot().brake,1);assert.equal(fingers.snapshot().throttle,0);
assert.deepEqual(pedalFeedback(1,1),{kind:'brake',force:1});
fingers.end('steer',10);assert.equal(fingers.snapshot().brake,1);
fingers.end('brake',12);assert.equal(fingers.snapshot().throttle,1,'held throttle resumes after brake release');
assert.deepEqual(pedalFeedback(1,0),{kind:'gas',force:1});
fingers.move('gas',11,700,300,540);assert.equal(fingers.snapshot().throttle,.12,'downward drag reduces force continuously');
fingers.clear();assert.equal(fingers.snapshot().throttle,0);assert.equal(fingers.snapshot().brake,0);assert(!fingers.held('steer'));
// The production powertrain must actually receive the continuous pedal, not W's .15 cap.
for(const id of GARAGE_CARS){
 const pt=getPowertrain(id),ctx={carId:id,cc:CAR_MODELS[id],pt,vehicleTune:DEFAULT_VEHICLE_TUNING[id],weatherGrip:1,slopeAlongCar:0,tunedShiftFrames:pt.shiftFrames,elapsedFrames:1};
 const run=(throttle:number,brake=0)=>{
  let state={...createLongitudinalState(Math.min(.5,pt.gearTops[0]*.12)),throttle,ignitionBlend:1,launchBlend:1};
  for(let n=0;n<(brake?90:12);n++)state=stepLongitudinal(state,{gear:1,engineStarted:true,throttle,gasPressed:false,shiftPressed:false,brake,handbrake:false},ctx);
  return state as ReturnType<typeof stepLongitudinal>;
 };
 const light=run(.12),half=run(.55),full=run(1),stop=run(0,1);
 assert.equal(full.targetThrottle,1,`${id} full analogue throttle`);
 assert(full.speed>=half.speed&&half.speed>light.speed,`${id} increasing pedal increases acceleration up to tyre traction limit`);
 assert(Math.abs(stop.speed)<.02,`${id} full touch brake stops vehicle`);
}
let clock=0,dpr=1;const sampler=new ResolutionSampler();sampler.reset(clock);
const tick=(dt:number,active=true)=>{clock+=dt;const sample=sampler.sample(clock,active);if(sample!==null)dpr=nextResolution(dpr,sample,.6,1.5);};
for(let n=0;n<360;n++)tick(1000/60);
assert(dpr>1,'normal 60 Hz pacing can recover resolution');
const preSwap=dpr;
tick(2000);for(let n=0;n<180;n++)tick(1000/60);
assert.equal(dpr,preSwap,'asset upload/load gap is excluded');
for(let n=0;n<150;n++)tick(33.33);
assert(dpr<preSwap,'sustained low frame rate can still lower resolution');
const degraded=dpr;
for(let n=0;n<420;n++)tick(1000/60);
assert(dpr>degraded,'recovery after load is not permanently blurry');
for(let n=0;n<50;n++)tick(100,false);
assert(dpr>degraded,'paused windows do not reduce resolution');
for(const q of ['auto','low','medium','high','ultra'] as const){
 const profile=qualityProfile(q,3,true);
 assert.equal(retainedResolution({quality:q,dpr:profile.ceiling},q,profile),profile.ceiling,'vehicle switch retains pixel density');
}
console.log('Round 23 PASS: independent pointers, continuous drivetrain/brake force, brake priority, release/cancel, 60 Hz resolution recovery and loading/paused exclusions.');
