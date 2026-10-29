import {FRAME_ACCEL_TO_MS2} from './powertrain';
import {CarType} from '../types';
import {stepLongitudinal,type LongitudinalContext,type LongitudinalInputs,type LongitudinalState} from './longitudinal';
import {solveOpenDifferentials,type WheelContact} from './differentialSolver';

/** Test-only adapter: never imported by the game. Four-wheel, 60 Hz input.
 * Wheel contacts must be sampled from the previous fixed step, not render
 * frames. It compares against the existing motion while replacing (rather
 * than stacking) its propulsion grip cap. No OEM calibration is implied. */
export type ExperimentalContacts = [WheelContact,WheelContact,WheelContact,WheelContact];
export function stepExperimentalDrivetrain(state:LongitudinalState,inputs:LongitudinalInputs,context:LongitudinalContext,contacts:ExperimentalContacts){
 if(![CarType.MINI,CarType.SEAL08,CarType.TRUCK].includes(context.carId))throw new Error('experimental adapter is restricted to three four-wheel test vehicles');
 if(Math.abs(context.elapsedFrames-1)>1e-9||state.pendingFrames>1e-9)throw new Error('experimental adapter requires one fixed 60 Hz step');
 const reference=stepLongitudinal(state,inputs,context);
 // Evaluate the same engine/gear/response model with the aggregate tyre cap
 // removed. Terrain friction is supplied solely by wheel contacts below.
 const uncappedContext={...context,cc:{...context.cc,dynamics:{...context.cc.dynamics,grip:1000}},driveGripBudget:1};
 const uncapped=stepLongitudinal(state,inputs,uncappedContext);
 let wheels=contacts.map(c=>({...c})) as ExperimentalContacts;
 const speedMs=state.speed*15/3.6, mass=context.cc.weight;
 // Existing brake and ABS remain authoritative during this experiment. Wheel
 // force is disabled under brakes: integrating it too would double brake.
 if(reference.brakeForce>0 || inputs.handbrake){
  wheels=wheels.map(w=>({...w,omega:reference.speed*15/3.6/Math.max(.05,w.radius)})) as ExperimentalContacts;
  return {result:reference,wheels,appliedForceN:0,mode:'legacy-braking' as const};
 }
 const driven=[0,1,2,3].filter(i=>context.cc.dynamics.driveLayout==='AWD'||(context.cc.dynamics.driveLayout==='FWD'?i<2:i>=2));
 const radius=driven.reduce((sum,i)=>sum+wheels[i].radius,0)/driven.length;
 const requestedTorque=uncapped.engineForce*FRAME_ACCEL_TO_MS2*mass*radius;
 let v=speedMs,totalForce=0;
 for(let i=0;i<2;i++){
  const solved=solveOpenDifferentials({front:{left:wheels[0],right:wheels[1]},rear:{left:wheels[2],right:wheels[3]},layout:context.cc.dynamics.driveLayout,driveTorqueNm:requestedTorque,speedMs:v,massKg:mass,dt:1/120});
  const next=[solved.front.left,solved.front.right,solved.rear.left,solved.rear.right];
  wheels=wheels.map((w,j)=>({...w,omega:next[j].omega})) as ExperimentalContacts;
  v+=solved.forceN/mass/120;totalForce+=solved.forceN/2;
 }
 const accel=totalForce/mass/FRAME_ACCEL_TO_MS2;
 // The legacy result already added its engine force once. Replace it with
 // per-wheel tyre force, not an additional force on top of it.
 const speed=Math.max(-context.cc.maxSpeed,Math.min(context.cc.maxSpeed,reference.speed-reference.engineForce+accel));
 const direction=Math.sign(Math.abs(speed)>.02?speed:accel||1);
 const longitudinalAcceleration=(speed-state.speed)*direction;
 return {result:{...reference,speed,engineForce:accel,longitudinalAcceleration,prevLongAccelMs2:longitudinalAcceleration*FRAME_ACCEL_TO_MS2},wheels,appliedForceN:totalForce,mode:'experimental-four-wheel' as const};
}

/** Preserve the legacy 60 Hz accumulator under arbitrary render frame pacing. */
export function stepExperimentalFrames(state:LongitudinalState,inputs:LongitudinalInputs,context:LongitudinalContext,contacts:ExperimentalContacts){
 const frames=Math.max(0,Number.isFinite(context.elapsedFrames)?context.elapsedFrames:0);
 const available=Math.max(0,state.pendingFrames)+frames,steps=Math.min(20,Math.floor(available+1e-9));
 if(!steps)return {result:stepLongitudinal(state,inputs,context),wheels:contacts,appliedForceN:0};
 let current={...state,pendingFrames:0},wheels=contacts,force=0,last:ReturnType<typeof stepExperimentalDrivetrain>|undefined;
 for(let i=0;i<steps;i++){
  last=stepExperimentalDrivetrain(current,inputs,{...context,elapsedFrames:1},wheels);
  current={...last.result,pendingFrames:0};wheels=last.wheels;force+=last.appliedForceN;
 }
 const pendingFrames=available>20?0:Math.max(0,available-steps);
 const direction=Math.sign(Math.abs(current.speed)>.02?current.speed:last!.result.engineForce||1);
 const longitudinalAcceleration=(current.speed-state.speed)*direction/steps;
 return {result:{...last!.result,pendingFrames,longitudinalAcceleration,prevLongAccelMs2:longitudinalAcceleration*FRAME_ACCEL_TO_MS2},wheels,appliedForceN:force/steps};
}
