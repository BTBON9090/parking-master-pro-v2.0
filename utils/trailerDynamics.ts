import {CarType,type CarConfig} from '../types';
import {getPowertrain,type PowertrainSpec} from './powertrain';

// Gameplay estimates, not published kerb weights: the original configured
// 36/44 t represented the entire combination, including trailer and cargo.
export const TRACTOR_ONLY_MASS_KG:Partial<Record<CarType,number>>={
 [CarType.SEMI]:8000,
 [CarType.US22]:10500,
};
const configs=new WeakMap<CarConfig,CarConfig>();
const powertrains=new Map<CarType,PowertrainSpec>();
export function trailerVehicleConfig(base:CarConfig,attached:boolean|undefined):CarConfig{
 const mass=TRACTOR_ONLY_MASS_KG[base.id];
 if(attached!==false||!mass)return base;
 let cfg=configs.get(base);if(!cfg){cfg={...base,weight:mass};configs.set(base,cfg);}return cfg;
}
/** Scale the existing torque and aerodynamic load for the actual mass while
 * keeping the very same transmission ratios, redline and engine tuning. */
export function trailerPowertrain(base:CarConfig,attached:boolean|undefined):PowertrainSpec{
 const original=getPowertrain(base.id),mass=TRACTOR_ONLY_MASS_KG[base.id];
 if(attached!==false||!mass)return original;
 let result=powertrains.get(base.id);if(!result){const ratio=base.weight/mass,rolling=original.resistance(0);
  result={...original,peakAccel:original.peakAccel.map(a=>a*ratio),reversePeakAccel:original.reversePeakAccel*ratio,
   resistance:speed=>rolling+(original.resistance(speed)-rolling)*ratio};powertrains.set(base.id,result);
 }
 return result;
}
