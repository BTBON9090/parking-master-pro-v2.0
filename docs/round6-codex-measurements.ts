// Independent acceptance measurements: npx tsx docs/round6-codex-measurements.ts
import assert from 'node:assert/strict';
import { CAR_MODELS, DEFAULT_VEHICLE_TUNING } from '../constants';
import { CarType } from '../types';
import { createLongitudinalState, stepLongitudinal } from '../utils/longitudinal';
import { getPowertrain, TRAVEL_PER_SPEED_FRAME } from '../utils/powertrain';
import { dynamicPitchTargetRad, filterLongitudinalAccel, stepDynamicPitch } from '../utils/bodyPitch';
import { buildBeijingLevel } from '../utils/beijingMap';
import { elevatedRoadProfile } from '../utils/elevatedRoad';

const carId = CarType.SEDAN;
const cc = CAR_MODELS[carId], pt = getPowertrain(carId);
const context = { carId, cc, pt, vehicleTune: DEFAULT_VEHICLE_TUNING[carId], weatherGrip:1, slopeAlongCar:0, tunedShiftFrames:pt.shiftFrames, elapsedFrames:1 };
const inputs = { gear:1, engineStarted:true, gasPressed:false, shiftPressed:false, throttle:0, brake:0, handbrake:false };
for (const fps of [30,60,120]) {
  const readings = [];
  for (const shift of [false,true]) {
    let state = createLongitudinalState(), g = 0, pitch = 0, peakPitch = 0;
    for(let i=0;i<fps*5;i++) {
      state = stepLongitudinal(state,{...inputs,gasPressed:true,shiftPressed:shift},{...context,elapsedFrames:60/fps});
      g=filterLongitudinalAccel(g,state.prevLongAccelMs2/9.81,60/fps);
      pitch=stepDynamicPitch(pitch,dynamicPitchTargetRad(g),60/fps);
      peakPitch=Math.max(peakPitch,Math.abs(pitch));
    }
    readings.push({pedal:shift?'Shift+W':'W',speedKmh:+(state.speed*15).toFixed(2),peakPitchDeg:+(peakPitch*180/Math.PI).toFixed(3)});
  }
  console.log(JSON.stringify({fps,acceleration:readings}));
}

const stopping=[];
for (const brake of [.12,1]) {
  let state=createLongitudinalState(30/15), distance=0, frames=0, g=0,pitch=0,peakPitch=0;
  for(;frames<6000 && state.speed>.001;frames++) {
    const oldSpeed=state.speed;
    state=stepLongitudinal(state,{...inputs,gear:2,brake},context);
    distance+=(oldSpeed+state.speed)*.5*TRAVEL_PER_SPEED_FRAME/10;
    g=filterLongitudinalAccel(g,state.prevLongAccelMs2/9.81,1);
    pitch=stepDynamicPitch(pitch,dynamicPitchTargetRad(g,brake>.82),1);
    peakPitch=Math.max(peakPitch,pitch);
  }
  stopping.push({brake,meters:+distance.toFixed(2),seconds:+(frames/60).toFixed(2),peakPitchDeg:+(peakPitch*180/Math.PI).toFixed(3)});
}
assert(stopping[0].meters>stopping[1].meters*2,'very light brake must stop substantially more gently');
assert(stopping[0].peakPitchDeg<1,'very light brake should not dive severely');
console.log(JSON.stringify({fromKmh:30,stopping}));

const bridge=buildBeijingLevel().elevatedRoads![0];
// Drive the actual approach/ramp profile with only the available light pedal.
for(const approachSpeedKmh of [0,20]) {
  let x=bridge.x-bridge.width/2-150, state=createLongitudinalState(approachSpeedKmh/15), peakHeight=0, minSpeed=Infinity;
  for(let i=0;i<60*180;i++) {
    const profile=elevatedRoadProfile(bridge,x,bridge.y);
    state=stepLongitudinal(state,{...inputs,gasPressed:true,shiftPressed:true},{...context,slopeAlongCar:profile?.gradeX||0});
    x+=state.speed*TRAVEL_PER_SPEED_FRAME;
    peakHeight=Math.max(peakHeight,profile?.height||0);
    if(profile && profile.height>1) minSpeed=Math.min(minSpeed,state.speed*15);
    if(x>bridge.x)break;
  }
  console.log(JSON.stringify({bridgeClimb:{approachSpeedKmh,endX:+x.toFixed(1),targetX:bridge.x,peakHeight:+peakHeight.toFixed(2),minKmh:+minSpeed.toFixed(2),reachedDeck:x>=bridge.x}}));
}
