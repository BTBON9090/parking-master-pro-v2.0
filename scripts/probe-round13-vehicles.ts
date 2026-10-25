import {CAR_MODELS,DEFAULT_VEHICLE_TUNING} from '../constants';
import {CarType} from '../types';
import {getPowertrain} from '../utils/powertrain';
import {createLongitudinalState,stepLongitudinal} from '../utils/longitudinal';
for(const id of [CarType.TAI7,CarType.LI_I9,CarType.N90]){
 const cc=CAR_MODELS[id],pt=getPowertrain(id); let state=createLongitudinalState(),time=0;
 for(let i=0;i<1800;i++){
  state=stepLongitudinal(state,{gear:1,engineStarted:true,gasPressed:false,shiftPressed:false,throttle:1,brake:0,handbrake:false},{carId:id,cc,pt,vehicleTune:DEFAULT_VEHICLE_TUNING[id],weatherGrip:1,slopeAlongCar:0,tunedShiftFrames:pt.shiftFrames,elapsedFrames:1});
  time=(i+1)/60;if(state.speed*15>=100)break;
 }
 console.log(id,{menu:pt.zeroTo100Measured,actual:time,target:cc.dynamics.zeroTo100Seconds,reduction:cc.dynamics.transmission.finalDrive});
}
