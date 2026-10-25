import { CarType } from './types';
import { CAR_MODELS, DEFAULT_VEHICLE_TUNING } from './constants';
import { getPowertrain } from './utils/powertrain';
import { createLongitudinalState, stepLongitudinal } from './utils/longitudinal';
const carId=CarType.SEDAN, cc=CAR_MODELS[carId], pt=getPowertrain(carId);
const ctx={carId,cc,pt,vehicleTune:{...DEFAULT_VEHICLE_TUNING[carId]},weatherGrip:1,slopeAlongCar:0,tunedShiftFrames:Math.max(4,pt.shiftFrames),elapsedFrames:1};
for(const [label,gas,shift] of [['W',true,false],['ShiftW',true,true]] as const){
 let st=createLongitudinalState(0); let first=-1;
 for(let i=1;i<=60*7;i++){ st=stepLongitudinal(st,{gear:3,engineStarted:true,gasPressed:gas,shiftPressed:shift,throttle:0,brake:0,handbrake:false},ctx); if(first<0 && st.speed>0.01) first=i; if([30,60,120,180,300,420].includes(i)) console.log(label,(i/60).toFixed(1)+'s',st.speed.toFixed(4),(st.speed*15).toFixed(2)+'kmh','thr',st.throttle.toFixed(2)); }
 console.log(label,'first movement frame',first,'final',st.speed.toFixed(3));
}
