export interface ImpactMotion {x:number;y:number;yaw:number;time:number}
interface RecoveryInput {heading:number;speed:number;beta:number;steeringYaw:number;grip:number;dt:number;brakeDeceleration?:number}
/** SI world velocity after contact. Tyres recover lateral traction continuously;
 * steering is present from the very first frame, not after a crash timeout. */
export function stepImpactRecovery(s:ImpactMotion,i:RecoveryInput){
 const dt=Math.max(0,i.dt),yawRate=i.steeringYaw+s.yaw;
 // Service brakes act on the residual WORLD velocity too. Previously only
 // the requested longitudinal velocity was braked, then this recovery state
 // overwrote it every frame, reducing full braking to a tiny tracking error.
 const magnitude=Math.hypot(s.x,s.y);
 const braking=Math.max(0,i.brakeDeceleration??0)*dt;
 const remainingSpeed=Math.max(0,magnitude-braking);
 if(magnitude>0){s.x*=remainingSpeed/magnitude;s.y*=remainingSpeed/magnitude;}
 const heading=i.heading+yawRate*dt;
 const direction=heading+i.beta;
 const target={x:Math.cos(direction)*i.speed,y:Math.sin(direction)*i.speed};
 const dx=target.x-s.x,dy=target.y-s.y,error=Math.hypot(dx,dy);
 // Bound the tyre impulse by available grip. No instant velocity snapping
 // back toward a wall, and no extra throttle impulse from steering.
 const recovery=Math.min(1-Math.exp(-dt*5),9.80665*Math.max(.15,i.grip)*dt/Math.max(.001,error));
 s.x+=dx*recovery;s.y+=dy*recovery;
 const countersteer=s.yaw*i.steeringYaw<0;
 s.yaw*=Math.exp(-dt*(countersteer?5:3.2));
 const remaining=Math.hypot(target.x-s.x,target.y-s.y);
 s.time=remaining<.08&&Math.abs(s.yaw)<.02?0:Math.max(.05,s.time-dt);
 return {heading,yawRate,velocity:{x:s.x,y:s.y},speed:s.x*Math.cos(heading)+s.y*Math.sin(heading)};
}
