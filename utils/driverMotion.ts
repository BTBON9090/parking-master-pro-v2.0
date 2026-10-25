import type { SuspensionSpec } from './suspension';
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
export interface Spring {p:number;v:number}
export const spring=():Spring=>({p:0,v:0});
/** Semi-implicit SI spring with bounded 240 Hz steps; no periodic fake shake. */
export function dampedSpring(s:Spring,target:number,dt:number,hz:number,damping:number) {
 const steps=Math.max(1,Math.ceil(dt*240)),h=Math.min(.1,dt)/steps,w=2*Math.PI*hz;
 for(let i=0;i<steps;i++){s.v+=(w*w*(target-s.p)-2*damping*w*s.v)*h;s.p+=s.v*h;}
 return s.p;
}
export function corneringRollTarget(lateralG:number,spec:SuspensionSpec) {
 // Local +X is left. Right-turn acceleration gives an outward LEFT lean:
 // negative Z roll lowers the outside (left) shoulder.
 const compliance=(1-spec.antiRoll*.62)*(.10/spec.spring);
 return -clamp(lateralG,-1.2,1.2)*.085*compliance;
}
export function createDriverMotion(){return {x:spring(),y:spring(),z:spring(),pitch:spring(),roll:spring(),lastHeight:NaN,lastVelocity:0,accel:0};}
export type DriverMotion=ReturnType<typeof createDriverMotion>;
export function stepDriverMotion(s:DriverMotion,dt:number,input:{height:number;pitch:number;roll:number;longG:number;latG:number}) {
 dt=clamp(dt,1/1000,.1);
 if(!Number.isFinite(s.lastHeight)) {s.lastHeight=input.height;s.pitch.p=input.pitch;s.roll.p=input.roll;}
 const v=(input.height-s.lastHeight)/10/dt;
 const raw=clamp((v-s.lastVelocity)/dt,-29.4,29.4);
 s.accel+=(raw-s.accel)*(1-Math.exp(-dt*16));
 s.lastHeight=input.height;s.lastVelocity=v;
 // Seat/neck compliance, maximum displacement 4 cm sideways / 3 cm up-down.
 const x=dampedSpring(s.x,clamp(input.latG*.34,-.4,.4),dt,2.5,.82);
 const y=dampedSpring(s.y,clamp(-s.accel*.055,-.30,.30),dt,3,.8);
 const z=dampedSpring(s.z,clamp(-input.longG*.24,-.28,.28),dt,2.7,.85);
 // Follow sustained grades but suppress fast body roll/pitch by 75%.
 const stablePitch=dampedSpring(s.pitch,input.pitch,dt,.85,1);
 const stableRoll=dampedSpring(s.roll,input.roll,dt,.65,1);
 return {x,y,z,pitchCorrection:clamp((stablePitch-input.pitch)*.75,-.07,.07),rollCorrection:clamp((stableRoll-input.roll)*.8,-.09,.09)};
}
