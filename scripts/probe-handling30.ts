import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stepLateral,createLateralState} from '../utils/lateralDynamics';
import {stepImpactRecovery} from '../utils/impactRecovery';
import {solveVehicleImpact} from '../utils/impactResponse';
import {GARAGE_CARS,CAR_MODELS} from '../constants';
const handling:any[]=[],impacts:any[]=[];
for(const id of GARAGE_CARS)for(const hz of [30,60,120])for(const mode of ['normal','flick','handbrake']){
 const c=CAR_MODELS[id],s=createLateralState();let speed=Math.min(25,c.maxSpeed*15/3.6*.8),peak=0,after=0,last=0,yaw=0;
 for(let n=0;n<hz*8;n++){
  const t=n/hz,steer=t<.3?0:t<1.1?(mode==='normal'?.04:mode==='flick'?.30:.14):0;
  const r=stepLateral(s,{speed,steer,rearSteer:0,wheelbase:c.wheelbase/10,rearOffset:c.wheelbase/20,
   frontBias:c.dynamics.frontWeightBias,grip:c.dynamics.grip,layout:c.dynamics.driveLayout,throttle:.1,
   handbrake:mode==='handbrake'&&t>.5&&t<1.1,frontLocked:false,dt:1/hz,understeer:c.dynamics.understeerGradient});
  speed=Math.max(0,speed-r.scrubAccel/hz);peak=Math.max(peak,Math.abs(r.beta));
  if(t>4)after=Math.max(after,Math.abs(r.beta));last=r.beta;yaw=r.yawRate;
 }
 console.log(id,hz,mode,peak,after,last,yaw);
 handling.push({id,hz,mode,peakDegrees:peak*180/Math.PI,slipAfter3SecondsDegrees:after*180/Math.PI});
}
