/** Independent-wheel, open-axle traction model. SI units throughout. This is
 * an experimental solver until integrated with the game's chassis loop. */
export type AxleLayout='FWD'|'RWD'|'AWD';
export interface WheelContact {
  /** Wheel angular speed, rad/s; positive rotates toward forward travel. */
  omega:number;
  radius:number;
  inertia:number;
  /** Per-wheel normal load in N and dimensionless tyre/road friction. */
  normalN:number;
  friction:number;
  grounded:boolean;
  /** Non-negative friction-brake torque, Nm, at this wheel. */
  brakeTorqueNm?:number;
}
export interface AxlePair { left:WheelContact; right:WheelContact }
export interface DifferentialInput {
  front:AxlePair;
  rear:AxlePair;
  layout:AxleLayout;
  /** Total signed wheel-side engine torque, Nm, before distribution. */
  driveTorqueNm:number;
  /** Vehicle speed projected along wheel travel, m/s. */
  speedMs:number;
  /** Total body mass, kg. */
  massKg:number;
  /** Integration interval in seconds. */
  dt:number;
  /** Front share of AWD wheel-side torque; defaults to 50/50 game calibration. */
  awdFrontShare?:number;
}
export interface WheelResult {omega:number;forceN:number;slip:number;appliedTorqueNm:number;limitN:number}
export interface DifferentialResult {
  front:{left:WheelResult;right:WheelResult};rear:{left:WheelResult;right:WheelResult};
  forceN:number;deliveredTorqueNm:number;requestedTorqueNm:number;
}
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const safe=(n:number,fallback=0)=>Number.isFinite(n)?n:fallback;
/** Reversible tyre model: tyre force opposes the relative contact velocity.
 * A bounded impulse avoids overshooting rolling equilibrium in one substep. */
function advanceWheel(w:WheelContact, torque:number, speed:number, mass:number, dt:number):WheelResult {
 const radius=clamp(safe(w.radius,.3),.05,4), inertia=clamp(safe(w.inertia,1),.05,10000);
 const limit=w.grounded?clamp(safe(w.normalN),0,1e8)*clamp(safe(w.friction),0,3):0;
 if(dt<=0)return {omega:clamp(safe(w.omega),-10000,10000),forceN:0,slip:0,appliedTorqueNm:torque,limitN:limit};
 let omega=clamp(safe(w.omega),-10000,10000)+torque/inertia*dt;
 // Brakes can stop rotation but never drive it backwards. Road contact then
 // applies the corresponding opposing force to a still-moving vehicle.
 const brakeImpulse=clamp(safe(w.brakeTorqueNm??0),0,1e7)/inertia*dt;
 omega=Math.sign(omega)*Math.max(0,Math.abs(omega)-brakeImpulse);
 const slipVelocity=omega*radius-speed;
 // Wheel and quarter-vehicle effective inverse masses both respond to the
 // contact impulse; limiting it prevents numerical sign-flipping at standstill.
 const effectiveMassInverse=radius*radius/inertia+4/Math.max(100,mass);
 const equilibriumForce=slipVelocity/Math.max(1e-9,dt*effectiveMassInverse);
 const force=clamp(equilibriumForce,-limit,limit);
 omega-=force*radius/inertia*dt;
 const slip=(omega*radius-speed)/Math.max(1,Math.abs(speed),Math.abs(omega*radius));
 return {omega,forceN:force,slip,appliedTorqueNm:torque,limitN:limit};
}
/** Equal-torque open differential with bounded differential acceleration.
 * Weak-side traction plus an inertia reserve limits both shaft torques. The
 * reserve approximates the transient torque required to spin a free wheel;
 * undelivered engine torque represents clutch/engine speed limitation, not a
 * locked differential. This remains a calibrated simplification. */
function axle(pair:AxlePair,torque:number,speed:number,mass:number,dt:number){
 const capacity=(w:WheelContact)=>w.grounded?clamp(safe(w.normalN),0,1e8)*clamp(safe(w.friction),0,3)*clamp(safe(w.radius,.3),.05,4):0;
 const reserve=Math.min(clamp(safe(pair.left.inertia,1),.05,10000),clamp(safe(pair.right.inertia,1),.05,10000))*8;
 const sideTorque=Math.sign(torque)*Math.min(Math.abs(torque)/2,Math.min(capacity(pair.left),capacity(pair.right))+reserve);
 return {left:advanceWheel(pair.left,sideTorque,speed,mass,dt),right:advanceWheel(pair.right,sideTorque,speed,mass,dt)};
}
/** The caller controls fixed substeps and integrates the returned force into
 * chassis speed. The solver does not mutate the caller's contact objects. */
export function solveOpenDifferentials(input:DifferentialInput):DifferentialResult {
 const dt=clamp(safe(input.dt),0,1/120),speed=clamp(safe(input.speedMs),-300,300),mass=clamp(safe(input.massKg,1500),100,1e8);
 const requested=clamp(safe(input.driveTorqueNm),-1e7,1e7),share=clamp(safe(input.awdFrontShare??.5,.5),0,1);
 const frontTorque=input.layout==='FWD'?requested:input.layout==='AWD'?requested*share:0;
 const rearTorque=input.layout==='RWD'?requested:input.layout==='AWD'?requested*(1-share):0;
 const front=axle(input.front,frontTorque,speed,mass,dt),rear=axle(input.rear,rearTorque,speed,mass,dt);
 const all=[front.left,front.right,rear.left,rear.right];
 return {front,rear,forceN:all.reduce((sum,w)=>sum+w.forceN,0),deliveredTorqueNm:all.reduce((sum,w)=>sum+w.appliedTorqueNm,0),requestedTorqueNm:requested};
}
