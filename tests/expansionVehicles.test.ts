import assert from 'node:assert/strict';
import {CAR_MODELS,GARAGE_CARS,DEFAULT_VEHICLE_TUNING,DEFAULT_STEERING_CURVES} from '../constants';
import {CarType} from '../types';
import {simulatedAccelerationSeconds} from '../utils/vehiclePerformance';
import {createLongitudinalState,stepLongitudinal} from '../utils/longitudinal';
import {getPowertrain} from '../utils/powertrain';
assert.deepEqual(GARAGE_CARS,[CarType.SUV,CarType.SEAL08,CarType.TAI7,CarType.LI_I9,CarType.N90,CarType.TRUCK]);
for(const id of GARAGE_CARS){assert(DEFAULT_VEHICLE_TUNING[id]);assert(DEFAULT_STEERING_CURVES[id]);}
for(const id of [CarType.TAI7,CarType.LI_I9,CarType.N90]){
 const cc=CAR_MODELS[id],pt=getPowertrain(id),actual=simulatedAccelerationSeconds(id);
 assert(Math.abs(actual-cc.dynamics.zeroTo100Seconds)<.2,`${id}: full-pedal acceleration matches reference target`);
 const centre=cc.wheelbase/10/(Math.tan(cc.dynamics.maxSteerAngle)+Math.tan((cc.dynamics.rearSteerMaxDeg||0)*Math.PI/180));
 const outer=Math.hypot(centre+cc.trackWidth/20,cc.wheelbase/10);
 assert(Math.abs(outer-cc.turningRadiusTargetM!)<.01,`${id}: low-speed outer turning radius`);
 let finalSpeed=0;
 for(const fps of [30,60,120]){
  let state=createLongitudinalState();
  for(let i=0;i<fps*8;i++)state=stepLongitudinal(state,{gear:1,engineStarted:true,gasPressed:true,shiftPressed:true,throttle:0,brake:0,handbrake:false},
   {carId:id,cc,pt,vehicleTune:DEFAULT_VEHICLE_TUNING[id],weatherGrip:1,slopeAlongCar:.12,tunedShiftFrames:pt.shiftFrames,elapsedFrames:60/fps});
  assert(state.speed*15>10,`${id}: light pedal can start on 12% paved grade`);
  if(finalSpeed)assert(Math.abs(finalSpeed-state.speed)<1e-6,`${id}: identical uphill performance across frame rates`);
  finalSpeed=state.speed;
 }
 console.log(id,{zeroTo100Seconds:actual,outerTurningRadiusM:outer,uphillKmh:finalSpeed*15});
}
