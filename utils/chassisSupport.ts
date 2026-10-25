import * as THREE from 'three';
import {dampedSpring,spring} from './driverMotion';
import {SPRING_SCALE,type SuspensionSpec} from './suspension';

export interface RigWheel {x:number;y:number;z:number;radius:number;halfWidth:number;steer:number}
export type SupportQuery=(index:number,hub:THREE.Vector3,axle:THREE.Vector3)=>number;
export function chassisRotation(pitch:number,roll:number){return new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,0,roll,'YXZ'));}
export function hubPose(w:RigWheel,offset:number,q:THREE.Quaternion){
 return {hub:new THREE.Vector3(w.x,w.y+offset,w.z).applyQuaternion(q),
  axle:new THREE.Vector3(Math.cos(w.steer),0,-Math.sin(w.steer)).applyQuaternion(q)};
}
function fitPlane(points:{x:number;z:number;h:number}[]){
 const mean=(key:'x'|'z'|'h')=>points.reduce((sum,p)=>sum+p[key],0)/points.length;
 const x=mean('x'),z=mean('z'),h=mean('h');let xx=0,zz=0,xz=0,xh=0,zh=0;
 for(const p of points){const a=p.x-x,b=p.z-z,c=p.h-h;xx+=a*a;zz+=b*b;xz+=a*b;xh+=a*c;zh+=b*c;}
 const d=xx*zz-xz*xz;return Math.abs(d)<1e-7?{x:0,z:0}:{x:(xh*zz-zh*xz)/d,z:(zh*xx-xh*xz)/d};
}
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
/** Calibrated CoM / spring values, not OEM suspension measurements.
 * Acceleration is signed in vehicle coordinates; reverse velocity alone must
 * never exchange front/rear gravity loads. */
export function cornerLoads(wheels:RigWheel[],mass:number,cgM:number,frontBias:number,pitch:number,roll:number,longG:number,latG:number){
 const front=Math.max(...wheels.map(w=>w.z)),rear=Math.min(...wheels.map(w=>w.z)),wb=(front-rear)/10;
 const left=Math.max(...wheels.map(w=>w.x)),right=Math.min(...wheels.map(w=>w.x)),track=(left-right)/10;
 const normalG=Math.max(.03,Math.cos(pitch)*Math.cos(roll));
 const forwardG=Math.sin(pitch)-longG,leftG=-Math.cos(pitch)*Math.sin(roll)+latG;
 const frontShare=frontBias+cgM*forwardG/(wb*normalG),leftShare=.5+cgM*leftG/(track*normalG);
 const total=mass*9.80665*normalG;
 const forces=wheels.map(w=>total*(w.z>0?clamp(frontShare,0,1):1-clamp(frontShare,0,1))*(w.x>0?clamp(leftShare,0,1):1-clamp(leftShare,0,1)));
 const margin=Math.min(frontShare,1-frontShare,leftShare,1-leftShare);
 return {forces:forces.map(f=>Math.max(0,f)),frontShare,leftShare,normalG,margin,
  tipX:leftShare<0?-1:leftShare>1?1:0,tipZ:frontShare<0?-1:frontShare>1?1:0};
}
export function createChassisState(){return {initialized:false,height:0,velocity:0,pitch:0,roll:0,
 loadPitch:spring(),loadRoll:spring(),loadHeave:spring(),roadPitch:spring(),roadRoll:spring(),lastTarget:0,lastGradient:{x:0,z:0},
 airborne:false,flightPitch:0,flightRoll:0,flightPitchRate:0,flightRollRate:0,worldVelocity:0,unstableTime:0,offsets:[0,0,0,0]};}
export type ChassisState=ReturnType<typeof createChassisState>;
export interface ChassisInput {wheels:RigWheel[];spec:SuspensionSpec;mass:number;cgM:number;frontBias:number;
 longG:number;latG:number;deltaLeft:number;deltaForward:number;rideHeight:number;dt:number;support:SupportQuery}

/** A single support frame carries both the shell and all four knuckles.
 * Suspension changes only local Y; no visual pitch cancellation or detached
 * body-only roll. Absolute road motion is transported before spring response,
 * so descending a plane cannot stretch the suspension through heave lag. */
export function stepChassis(s:ChassisState,input:ChassisInput){
 const {wheels,spec,support}=input,dt=clamp(input.dt,.0001,.1),bump=spec.bumpTravel??spec.travel,droop=spec.droopTravel??spec.travel;
 const previousPitch=s.pitch,previousRoll=s.roll;
 let pitch=s.roadPitch.p,roll=s.roadRoll.p,gradient={x:0,z:0};
 for(let iter=0;iter<3;iter++){
  const q=chassisRotation(pitch,roll);
  const points=wheels.map((w,i)=>{const p=hubPose(w,0,q);return {x:p.hub.x,z:p.hub.z,h:support(i,p.hub,p.axle)};});
  gradient=fitPlane(points);pitch=-Math.atan(gradient.z);roll=Math.atan2(gradient.x,Math.hypot(1,gradient.z));
 }
 let loads=cornerLoads(wheels,input.mass,input.cgM,input.frontBias,pitch,roll,input.longG,input.latG);
 const compression=loads.forces.map((f,i)=>(f-input.mass*9.80665*(wheels[i].z>0?input.frontBias:1-input.frontBias)/2)/(spec.spring*SPRING_SCALE)*10);
 const avg=(values:number[],predicate:(w:RigWheel)=>boolean)=>values.reduce((a,v,i)=>a+(predicate(wheels[i])?v:0),0)/wheels.filter(predicate).length;
 const wb=Math.max(...wheels.map(w=>w.z))-Math.min(...wheels.map(w=>w.z));
 const track=Math.max(...wheels.map(w=>w.x))-Math.min(...wheels.map(w=>w.x));
 const pitchTarget=clamp((avg(compression,w=>w.z>0)-avg(compression,w=>w.z<0))/wb,-.07,.07);
 const gentleRoll=.35+.65*Math.min(1,Math.abs(input.latG)/.65);
 const rollTarget=clamp((avg(compression,w=>w.x<0)-avg(compression,w=>w.x>0))/track/(1+spec.antiRoll*2)*gentleRoll,-.09,.09);
 const heaveTarget=-avg(compression,()=>true)+input.rideHeight;
 if(!s.initialized){s.loadPitch.p=pitchTarget;s.loadRoll.p=rollTarget;s.loadHeave.p=heaveTarget;}
 dampedSpring(s.loadPitch,pitchTarget,dt,1.7,spec.damping);
 dampedSpring(s.loadRoll,rollTarget,dt,1.6,spec.damping);
 dampedSpring(s.loadHeave,heaveTarget,dt,1.8,spec.damping);
 // Terrain excites the sprung body too; instant road-plane rotation made
 // the entire car follow each kerb like a rigid box.
 if(!s.initialized){s.roadPitch.p=pitch;s.roadRoll.p=roll;}
 const hz=Math.sqrt(4*spec.spring*SPRING_SCALE/input.mass)/(2*Math.PI);
 dampedSpring(s.roadPitch,pitch,dt,hz,spec.damping);
 dampedSpring(s.roadRoll,roll,dt,hz*1.08,spec.damping);
 s.pitch=s.roadPitch.p+s.loadPitch.p;s.roll=s.roadRoll.p+s.loadRoll.p;
 let q=chassisRotation(s.pitch,s.roll);
 const heightAt=(i:number,offset:number)=>{const p=hubPose(wheels[i],offset,q);return support(i,p.hub,p.axle)+wheels[i].radius-p.hub.y;};
 const neutral=wheels.map((_,i)=>heightAt(i,0));
 const target=avg(neutral,()=>true)+s.loadHeave.p*Math.cos(s.pitch)*Math.cos(s.roll);
 const minRoot=()=>Math.max(...wheels.map((_,i)=>heightAt(i,bump)));
 const extensionRoot=()=>Math.max(...wheels.map((_,i)=>heightAt(i,-droop)));
 const transport=gradient.x*input.deltaLeft+gradient.z*input.deltaForward;
 const roadVelocity=transport/dt;
 const gradeVelocityChange=!s.initialized?0:((gradient.x-s.lastGradient.x)*input.deltaLeft+(gradient.z-s.lastGradient.z)*input.deltaForward)/dt;
 if(!s.initialized){s.height=target;s.lastTarget=target;s.initialized=true;s.lastGradient=gradient;}
 if(s.airborne){
  // Ballistic motion retains upward velocity from the lip. No suspension
  // force or terrain alignment is allowed while all tyres are unsupported.
  s.height+=s.velocity*dt-.5*98.0665*dt*dt;s.velocity-=98.0665*dt;
  s.flightPitch+=s.flightPitchRate*dt;s.flightRoll+=s.flightRollRate*dt;
  s.pitch=s.flightPitch;s.roll=s.flightRoll;q=chassisRotation(s.pitch,s.roll);
  s.worldVelocity=s.velocity;
  if(s.height<=extensionRoot()+.01 && s.velocity<=roadVelocity){
   s.airborne=false;s.velocity-=roadVelocity;
   s.roadPitch.p=s.pitch-s.loadPitch.p;s.roadRoll.p=s.roll-s.loadRoll.p;
   s.roadPitch.v=s.flightPitchRate;s.roadRoll.v=s.flightRollRate;
  }
 }else{
  // Transport the neutral plane exactly on sustained grades. A change in
  // its slope retains WORLD vertical momentum instead of snapping the body
  // to the downhill tangent. The residual is the spring's velocity.
  s.height+=transport;s.velocity-=gradeVelocityChange;
  const omega=2*Math.PI*hz,steps=Math.ceil(dt*240),h=dt/steps;
  for(let i=0;i<steps;i++){
   const springAcceleration=omega*omega*(target-s.height)-2*spec.damping*omega*s.velocity;
   // Tyres can push up, but cannot pull the car down faster than gravity.
   const acceleration=Math.max(-98.0665,Math.min(98.0665*5,springAcceleration));
   s.velocity+=acceleration*h;s.height+=s.velocity*h;
  }
  s.worldVelocity=s.velocity+roadVelocity;
  if(s.height>extensionRoot()+.04 && s.worldVelocity>roadVelocity){
   s.airborne=true;s.velocity=s.worldVelocity;
   s.flightPitch=s.pitch;s.flightRoll=s.roll;
   s.flightPitchRate=clamp((s.pitch-previousPitch)/dt,-.6,.6);
   s.flightRollRate=clamp((s.roll-previousRoll)/dt,-.6,.6);
  }
 }
 // Suspension reaches a mechanical bump stop, never tyre-ground
 // penetration. Retain a small rebound impulse rather than killing velocity.
 const floor=minRoot();
 if(s.height<floor){
  s.height=floor;
  if(s.velocity<0)s.velocity*=-.08;
  s.worldVelocity=s.airborne?s.velocity:s.velocity+roadVelocity;
 }
 s.offsets=wheels.map((w,i)=>{
  let lo=-droop,hi=bump;
  const gap=(offset:number)=>s.height-heightAt(i,offset);
  if(gap(lo)>=0)return lo;
  if(gap(hi)<=0)return hi;
  let a=gap(lo),b=gap(hi);
  for(let j=0;j<24;j++){
   const m=j%3===2?(lo+hi)/2:lo+(hi-lo)*(-a)/(b-a),g=gap(m);
   if(Math.abs(g)<1e-6)return m;
   if(g>=0){hi=m;b=g;}else{lo=m;a=g;}
  }return hi;
 });
 const contacts=wheels.map((w,i)=>{const p=hubPose(w,s.offsets[i],q),h=support(i,p.hub,p.axle);
  return {height:h,gap:s.height+p.hub.y-w.radius-h,hub:p.hub,axle:p.axle};});
 // Stability follows the actual sprung-body attitude: load roll shifts the
 // centre of mass beyond the road plane before a wheel can support it.
 loads=cornerLoads(wheels,input.mass,input.cgM,input.frontBias,s.pitch,s.roll,input.longG,input.latG);
 if(!s.airborne&&loads.margin<-.005)s.unstableTime+=dt;else s.unstableTime=Math.max(0,s.unstableTime-dt*2);
 s.lastTarget=target;s.lastGradient=gradient;
 return {height:s.height,pitch:s.pitch,roll:s.roll,offsets:s.offsets,contacts,loads,
  unstable:s.unstableTime>.3,airborne:s.airborne,verticalVelocity:s.worldVelocity,roadPitch:pitch,roadRoll:roll,neutralHeight:target};
}
