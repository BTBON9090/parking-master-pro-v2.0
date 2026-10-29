import type { DriveLayout } from '../types';
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
export const createLateralState=()=>({beta:0,yaw:0,previousSteer:0,breakaway:0});
export type LateralState=ReturnType<typeof createLateralState>;
export interface LateralInput {speed:number;steer:number;rearSteer:number;wheelbase:number;rearOffset:number;frontBias:number;
 grip:number;layout:DriveLayout;throttle:number;handbrake:boolean;frontLocked:boolean;dt:number;understeer:number;driveSlip?:number}
/** SI bicycle tyre forces. Rear slip is a state, never switched on at a wheel-angle
 * threshold. Combined longitudinal/lateral grip and post-peak rear grip allow
 * lift/handbrake oversteer. These are game tyre calibrations, not OEM measurements. */
export function stepLateral(s:LateralState,i:LateralInput){
 const speed=Math.abs(i.speed),direction=Math.sign(i.speed)||1;
 const q=(Math.tan(i.steer)-Math.tan(i.rearSteer))/i.wheelbase;
 const parkingBeta=Math.atan(Math.tan(i.rearSteer)+i.rearOffset*q);
 const parkingYaw=i.speed*q*Math.cos(parkingBeta);
 const blend=smooth(i.grip<.45?1:3,i.grip<.45?4:9,speed),steps=Math.max(1,Math.ceil(i.dt*180)),dt=i.dt/steps;
 const a=i.wheelbase*(1-i.frontBias),b=i.wheelbase*i.frontBias;
 const inertia=(i.wheelbase*i.wheelbase+1.8*1.8)/9;
 const steeringRate=Math.abs(i.steer-s.previousSteer)/Math.max(.001,i.dt);s.previousSteer=i.steer;
 const flick=smooth(.22,.45,Math.abs(i.steer))*smooth(.7,2.2,steeringRate)*smooth(15,26,speed);
 s.breakaway=Math.max(flick,s.breakaway*Math.exp(-i.dt*4));
 let lateral=0,scrub=0,frontSlip=0,rearSlip=0;
 if(blend===0){s.beta=parkingBeta;s.yaw=parkingYaw;}
 else for(let n=0;n<steps;n++){
  const v=Math.max(3,speed),bodyV=direction*v;
  frontSlip=i.steer-Math.atan(s.beta+s.yaw*a/bodyV);
  rearSlip=i.rearSteer-Math.atan(s.beta-s.yaw*b/bodyV);
  // A brief front-tyre reserve during a rapid steering input improves
  // turn-in. It decays after the input, leaving the sustained grip limit and
  // the normal stability-recovery response intact.
  const turnIn=i.handbrake?0:smooth(.06,.22,Math.abs(i.steer));
  const frontMu=i.grip*(1-Math.min(.65,(i.driveSlip??0)*(i.layout==='RWD'?.08:.42)))*(1+.08*s.breakaway)*(i.frontLocked?.16:1)*(1-(i.layout==='FWD'?.18:.04)*i.throttle);
  const rearMu=i.grip*(1-Math.min(.7,(i.driveSlip??0)*(i.layout==='FWD'?.08:.45)))*(i.handbrake?.26:1)*(1-(i.layout==='RWD'?.16:.04)*i.throttle-.14*smooth(.4,1,i.throttle)*(i.layout==='FWD'?0:1))
    *(1-.08*s.breakaway*smooth(.10,.40,Math.abs(rearSlip)));
  const frontLoad=9.80665*i.frontBias,rearLoad=9.80665*(1-i.frontBias);
  const front=frontLoad*frontMu*Math.tanh(frontSlip*((7.5+1.5*turnIn)/(1+i.understeer*.12))/Math.max(.1,frontMu))*direction;
  const rear=rearLoad*rearMu*Math.tanh(rearSlip*(8.1-.4*turnIn)/Math.max(.1,rearMu))*direction;
  lateral=front*Math.cos(i.steer)+rear*Math.cos(i.rearSteer);
  const yawAcceleration=(a*front*Math.cos(i.steer)-b*rear*Math.cos(i.rearSteer))/inertia;
  // Road-car stability assistance: saturated front/rear forces alone can
  // cancel their moments and leave a permanent spin. Once the handbrake is
  // released, oppose excess yaw while preserving the requested corner arc.
  const gripYaw=9.80665*i.grip/v;
  const referenceYaw=clamp(parkingYaw,-gripYaw*(1+.1*turnIn),gripYaw*(1+.1*turnIn));
  const slipRecovery=smooth(.05,.28,Math.abs(Math.atan(s.beta)));
  const yawRecovery=i.handbrake?0:(2.0+slipRecovery*4.8)*Math.min(1,i.grip/.7)*(s.yaw-referenceYaw);
  s.yaw=clamp(s.yaw+(yawAcceleration-.35*s.yaw-yawRecovery)*dt,-2.5,2.5);
  s.beta=clamp(s.beta+(lateral/bodyV-s.yaw)*dt,-1.15,1.15);
  // A smooth low-speed handover preserves accurate parking arcs.
  const settle=1-Math.exp(-(1-blend)*12*dt);
  s.beta+=(parkingBeta-s.beta)*settle;s.yaw+=(parkingYaw-s.yaw)*settle;
  scrub=(Math.abs(front*Math.sin(frontSlip))+Math.abs(rear*Math.sin(rearSlip)))*.42;
 }
 const beta=parkingBeta*(1-blend)+Math.atan(s.beta)*blend;
 const yaw=parkingYaw*(1-blend)+s.yaw*blend;
 const lat=parkingYaw*i.speed*(1-blend)+lateral*blend;
 // Rolling tyre deformation also consumes energy on modest coasting turns.
 const scrubAccel=clamp(scrub*blend+.065*Math.abs(i.steer)*Math.min(speed,12),0,5);
 return {beta,yawRate:yaw,lateralG:lat/9.80665,scrubAccel,frontSlip,rearSlip,blend};
}
/** Integrate trajectory yaw separately from body yaw. Exact arc distance avoids
 * injecting speed when steering, and leaves a true tail-out angle. */
export function advanceLateralPose(x:number,y:number,heading:number,distance:number,beta:number,turn:number){
 const chord=Math.abs(turn)<1e-8?distance:distance*2*Math.sin(turn/2)/turn;
 return {x:x+chord*Math.cos(heading+beta+turn/2),y:y+chord*Math.sin(heading+beta+turn/2),rotation:heading+turn};
}

/** A steering tyre cannot supply its full forward traction at the same time
 * as maximum lateral grip. This reduces DRIVE torque, never road speed: an
 * unpowered downhill car still slides, while a full-lock launch settles into
 * a parking circle instead of accelerating through its own front tyres. */
export function cornerDriveBudget(speedMps:number,steer:number,wb:number,grip:number){
 const demand=speedMps*speedMps*Math.abs(Math.tan(steer))/Math.max(1,wb);
 const utilisation=demand/Math.max(.5,grip*9.80665);
 return 1-smooth(.35,1.25,utilisation)*.98;
}
