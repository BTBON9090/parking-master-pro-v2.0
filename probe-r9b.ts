import { CarType } from './types';
import { CAR_MODELS } from './constants';
import { getPowertrain } from './utils/powertrain';
const id=CarType.SEDAN, p=getPowertrain(id), c=CAR_MODELS[id];
for(const g of [1,2,3,4,5]) console.log(g,'top',(p.gearTops[g-1]*15).toFixed(1),'peak',p.peakAccel[g-1].toFixed(5),'min',p.gearMins[g-1].toFixed(3));
console.log('resist0',p.resistance(0),'gravity per 1%',9.81/250*0.01,'30% force 3rd',0.3*p.peakAccel[2]*0.72*0.55,'15%',0.15*p.peakAccel[2]*0.72*0.55);
console.log('shiftFrames',p.shiftFrames, 'wheelR', c.dynamics.transmission.wheelRadiusM);
