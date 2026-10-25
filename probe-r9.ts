import { CarType } from './types';
import { CAR_MODELS, DEFAULT_VEHICLE_TUNING } from './constants';
import { getPowertrain } from './utils/powertrain';
import { createLongitudinalState, stepLongitudinal } from './utils/longitudinal';
for (const carId of [CarType.SEDAN, CarType.SEAL08, CarType.SUV]) {
  const cc=CAR_MODELS[carId], pt=getPowertrain(carId);
  const ctx={carId,cc,pt,vehicleTune:{...DEFAULT_VEHICLE_TUNING[carId]},weatherGrip:1,slopeAlongCar:0,tunedShiftFrames:Math.max(4,pt.shiftFrames),elapsedFrames:1};
  for (const gear of [3,4,5]) {
    let st=createLongitudinalState(0);
    let last:any;
    for(let i=0;i<60*7;i++){ last=stepLongitudinal(st,{gear,engineStarted:true,gasPressed:true,shiftPressed:true,throttle:0,brake:0,handbrake:false},ctx); st=last; }
    console.log(carId,'gear',gear,'speed',st.speed.toFixed(4),'kmh',(st.speed*15).toFixed(2),'thr',st.throttle.toFixed(3),'engF',last.engineForce.toFixed(6),'stalled',last.stalled,'rpmRatio', (st.speed/pt.gearTops[gear-1]).toFixed(3));
  }
}
