import assert from 'node:assert/strict';
import {CAR_MODELS,DEFAULT_VEHICLE_TUNING} from '../constants';
import {CarType} from '../types';
import {trailerPowertrain,trailerVehicleConfig,TRACTOR_ONLY_MASS_KG} from '../utils/trailerDynamics';
import {createLongitudinalState,stepLongitudinal} from '../utils/longitudinal';
for(const id of [CarType.SEMI,CarType.US22]){
 const base=CAR_MODELS[id],attached=trailerVehicleConfig(base,true),detached=trailerVehicleConfig(base,false),full=trailerPowertrain(base,true),solo=trailerPowertrain(base,false);
 assert.equal(attached.weight,base.weight);assert.equal(detached.weight,TRACTOR_ONLY_MASS_KG[id]);assert(detached.weight<base.weight);
 assert.deepEqual(solo.gearTops,full.gearTops,'unhitching does not change gearing or top speed in a gear');
 assert(solo.peakAccel[5]>full.peakAccel[5]*3);assert(solo.resistance(3)>full.resistance(3),'same drag force yields higher acceleration loss on lighter tractor');
 const run=(withTrailer:boolean)=>{const cc=trailerVehicleConfig(base,withTrailer),pt=trailerPowertrain(base,withTrailer);let state=createLongitudinalState(20/15);state.ignitionBlend=1;
 for(let n=0;n<300;n++)state=stepLongitudinal(state,{gear:6,engineStarted:true,gasPressed:false,shiftPressed:false,throttle:1,brake:0,handbrake:false},{carId:id,cc,pt,vehicleTune:DEFAULT_VEHICLE_TUNING[id],weatherGrip:1,slopeAlongCar:0,tunedShiftFrames:pt.shiftFrames,elapsedFrames:1});return state.speed*15;};
 const combined=run(true),tractor=run(false);assert(tractor>combined+2,`${id}: unloaded tractor ${tractor} should accelerate faster than ${combined}`);
 assert.equal(trailerVehicleConfig(base,true),base,'recoupling immediately restores original combination mass');
 console.log(`${id}: 20 km/h + 5 seconds in sixth gear: combination ${combined.toFixed(1)}, tractor ${tractor.toFixed(1)} km/h`);
}
assert.equal(trailerVehicleConfig(CAR_MODELS[CarType.SUV],false),CAR_MODELS[CarType.SUV],'other cars are unchanged');
console.log('Trailer mass PASS: detached and coupled mass, torque and drag, unchanged gear ratios, real acceleration');
