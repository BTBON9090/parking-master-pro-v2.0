import {CAR_MODELS,DEFAULT_VEHICLE_TUNING} from '../constants';
import {CarType} from '../types';
import {getPowertrain,SPEED_UNIT_KMH} from './powertrain';
import {createLongitudinalState,stepLongitudinal} from './longitudinal';
const cache=new Map<CarType,number>();
/** Flat, dry full-pedal benchmark using the actual fixed-step driving solver.
 * This is a simulation measurement, not a manufacturer-certified result.
 * Keyboard W / Shift+W remain the user's 15% / 30% light-pedal controls. */
export function simulatedAccelerationSeconds(id:CarType):number {
 const existing=cache.get(id);if(existing!==undefined)return existing;
 const cc=CAR_MODELS[id],pt=getPowertrain(id);let state=createLongitudinalState(),gear=1;
 for(let i=0;i<60*90;i++){
  if(gear<pt.gearTops.length&&state.speed>pt.gearTops[gear-1]*.97){gear++;state.shiftProgress=0;}
  state=stepLongitudinal(state,{gear,engineStarted:true,gasPressed:false,shiftPressed:false,throttle:1,brake:0,handbrake:false},
   {carId:id,cc,pt,vehicleTune:DEFAULT_VEHICLE_TUNING[id],weatherGrip:1,slopeAlongCar:0,tunedShiftFrames:pt.shiftFrames,elapsedFrames:1});
  if(state.speed*SPEED_UNIT_KMH>=100){const seconds=(i+1)/60;cache.set(id,seconds);return seconds;}
 }
 cache.set(id,Infinity);return Infinity;
}
