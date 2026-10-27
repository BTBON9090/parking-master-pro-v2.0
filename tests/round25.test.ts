import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stepLateral,createLateralState} from '../utils/lateralDynamics';
import {stepImpactRecovery} from '../utils/impactRecovery';
import {solveVehicleImpact} from '../utils/impactResponse';
import {GARAGE_CARS,CAR_MODELS} from '../constants';
const handling:any[]=[],impacts:any[]=[];
for(const id of GARAGE_CARS)for(const hz of [30,60,120])for(const mode of ['normal','flick','handbrake']){
 const c=CAR_MODELS[id],s=createLateralState();let speed=25,peak=0,after=0,last=0,yaw=0;
 for(let n=0;n<hz*8;n++){
  const t=n/hz,steer=t<.3?0:t<1.1?(mode==='normal'?.04:mode==='flick'?.30:.14):0;
  const r=stepLateral(s,{speed,steer,rearSteer:0,wheelbase:c.wheelbase/10,rearOffset:c.wheelbase/20,
   frontBias:c.dynamics.frontWeightBias,grip:c.dynamics.grip,layout:c.dynamics.driveLayout,throttle:.1,
   handbrake:mode==='handbrake'&&t>.5&&t<1.1,frontLocked:false,dt:1/hz,understeer:c.dynamics.understeerGradient});
  speed=Math.max(0,speed-r.scrubAccel/hz);peak=Math.max(peak,Math.abs(r.beta));
  if(t>4)after=Math.max(after,Math.abs(r.beta));last=r.beta;yaw=r.yawRate;
 }
 assert(peak<(mode==='normal'?.085:mode==='flick'?.25:.85),`${id}: ordinary input must not cause a large drift`);
 if(mode==='handbrake')assert(peak>.3,'deliberate rear lock still allows a drift');
 assert(after<.025&&Math.abs(last)<.001&&Math.abs(yaw)<.001,`${id}: released controls recover instead of drifting forever`);
 handling.push({id,hz,mode,peakDegrees:peak*180/Math.PI,slipAfter3SecondsDegrees:after*180/Math.PI});
}
// The same driver's correction must be active on the very next post-impact
// frame, including a high-energy off-centre hit and either steering direction.
for(const hz of [30,60,120])for(const closing of [.5,3,9]){
 const hit=solveVehicleImpact({x:20,y:-closing},{x:0,y:1},{x:1.8,y:-1},5,2);
 const initial={x:hit.velocity.x,y:hit.velocity.y,yaw:hit.yawRate,time:1};
 const drive=(steeringYaw:number)=>{
  const s={...initial};let heading=0,first=0,maxStep=0;
  for(let n=0;n<hz*4;n++){
   const before={x:s.x,y:s.y};
   const r=stepImpactRecovery(s,{heading,speed:Math.max(0,s.x*Math.cos(heading)+s.y*Math.sin(heading)),beta:0,steeringYaw:n<hz*.4?steeringYaw:0,grip:1,dt:1/hz});
   if(!n){first=r.heading;assert(r.velocity.y>0,'rebound initially points away from guardrail');}
   heading=r.heading;maxStep=Math.max(maxStep,Math.hypot(s.x-before.x,s.y-before.y));
   assert(Math.hypot(s.x,s.y)<=Math.hypot(before.x,before.y)+1e-8,'coasting recovery cannot add kinetic energy');
  }
  assert(maxStep<=9.80665/hz+1e-8,'tyre recovery impulse stays bounded');
  assert(Math.abs(s.yaw)<.001,'impact spin decays');
  return {first,heading,remainingTime:s.time};
 };
 const left=drive(-.25),straight=drive(0),right=drive(.25);
 assert(left.first<straight.first&&right.first>straight.first,'no post-collision steering blackout');
 assert(right.heading-left.heading>.15,'driver can change recovery trajectory during the first second');
 impacts.push({hz,closing,left,straight,right});
}
fs.mkdirSync('docs/round25',{recursive:true});fs.writeFileSync('docs/round25/regression.json',JSON.stringify({handling,impacts},null,2)+'\n');
console.log('Round25 PASS: 54 drift recovery cases and 27 immediate post-impact control trajectories.');
