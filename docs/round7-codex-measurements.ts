// Independent QA: run with npx tsx docs/round7-codex-measurements.ts.
import assert from 'node:assert/strict';
import { CAR_MODELS, DEFAULT_VEHICLE_TUNING } from '../constants';
import { CarType } from '../types';
import { createLongitudinalState, stepLongitudinal, type LongitudinalInputs } from '../utils/longitudinal';
import { getPowertrain } from '../utils/powertrain';
import { buildBeijingLevel } from '../utils/beijingMap';
import { elevatedRoadProfile } from '../utils/elevatedRoad';
import { advanceVehicleCenter, fourWheelAckermannAngles, fourWheelSteeringGeometry } from '../utils/driving';
import { rearSteerAngleForSpeed } from '../utils/steering';

const carId = CarType.SEDAN, cc = CAR_MODELS[carId], pt = getPowertrain(carId);
const ctx = { carId, cc, pt, vehicleTune: DEFAULT_VEHICLE_TUNING[carId], weatherGrip: 1, slopeAlongCar: 0, tunedShiftFrames: pt.shiftFrames, elapsedFrames: 1 };
const idle: LongitudinalInputs = { gear: 1, engineStarted: true, gasPressed: false, shiftPressed: false, throttle: 0, brake: 0, handbrake: false };
function run(speed: number, seconds: number, input: Partial<LongitudinalInputs> = {}, grade = 0, fps = 60) {
  let state = createLongitudinalState(speed);
  let maxSpeedJumpKmh = 0;
  for (let i = 0; i < fps * seconds; i++) {
    const before = state.speed;
    state = stepLongitudinal(state, { ...idle, ...input }, { ...ctx, slopeAlongCar: grade, elapsedFrames: 60 / fps });
    maxSpeedJumpKmh = Math.max(maxSpeedJumpKmh, Math.abs(state.speed - before) * 15);
  }
  return { state, kmh: state.speed * 15, maxSpeedJumpKmh };
}
const result: Record<string, unknown> = {};
result.noCreep = [1,-1].map(gear => {
  const measured = run(0, 5, { gear });
  assert.equal(measured.kmh, 0, 'D/R without throttle on level ground must stay still');
  return { gear, kmh: measured.kmh };
});
result.frameRate = [30,60,120].map(fps => ({ fps, kmh: run(0, 5, { gasPressed:true }, 0, fps).kmh }));
const values = (result.frameRate as Array<{kmh:number}>).map(x=>x.kmh);
assert(Math.max(...values)-Math.min(...values)<0.001, 'elapsed-time response must agree');
result.slopeBrakes = [-.07,.07,-.18,.18].map(grade => {
  const held = run(-Math.sign(grade)*.3, 4, { gear:0, brake:1 }, grade);
  assert.equal(held.kmh,0,'heavy foot brake must stop either rolling direction');
  let released=held.state;
  for(let i=0;i<120;i++) released=stepLongitudinal(released,{...idle,gear:0},{...ctx,slopeAlongCar:grade});
  assert(Math.sign(released.speed)===-Math.sign(grade),'release must restore downhill roll');
  const latched=run(0,4,{gasPressed:true,shiftPressed:true,handbrake:true},grade);
  assert.equal(latched.kmh,0,'throttle must not release latched handbrake');
  return {grade,heldKmh:held.kmh,releasedKmh:released.speed*15,latchedKmh:latched.kmh,lightBrakeKmh:run(0,3,{gear:0,brake:.12},grade).kmh};
});
const bridge=buildBeijingLevel().elevatedRoads![0];
const midGrade=elevatedRoadProfile(bridge,bridge.x-bridge.width/2+250,bridge.y)!.gradeX;
const hillStart=run(0,4,{gasPressed:true,shiftPressed:true},midGrade);
assert(hillStart.kmh>0,'first gear with available light throttle must start uphill on actual ramp');
result.hillStart={grade:midGrade,kmh:hillStart.kmh,maxPerFrameJumpKmh:hillStart.maxSpeedJumpKmh};
result.engineBraking=[0,1,2,4].map(gear=>({gear,...run(40/15,3,{gear})})).map(({gear,kmh,maxSpeedJumpKmh})=>({gear,kmh,maxSpeedJumpKmh}));
const eb=result.engineBraking as Array<{gear:number,kmh:number}>;
assert(eb[1].kmh<eb[3].kmh && eb[3].kmh<eb[0].kmh,'low gear should provide stronger engine braking than high gear and neutral');
result.highSpeedLowGear = run(80/15,1,{gear:1});
assert((result.highSpeedLowGear as ReturnType<typeof run>).maxSpeedJumpKmh<1,'low gear must not instantly clamp speed');
result.centerDistance = [0,.2,.6].map(front => {
  const rear=rearSteerAngleForSpeed(7,0,front,.6);
  let pose={x:0,y:0,rotation:0}, traveled=0;
  for(let i=0;i<1000;i++) {
    const next=advanceVehicleCenter(pose.x,pose.y,pose.rotation,.1,30.3,front,15.15,rear);
    traveled+=Math.hypot(next.x-pose.x,next.y-pose.y); pose=next;
  }
  assert(Math.abs(traveled-100)<.001,'turning must not add distance to the same speed');
  return {frontDeg:front*180/Math.PI,traveled};
});
const crab=advanceVehicleCenter(0,0,0,10,30.3,.2,15.15,.2);
assert.equal(crab.rotation,0,'equal front/rear steering should have zero yaw');
assert(Math.abs(Math.atan2(crab.y,crab.x)-.2)<1e-9,'crab travel must follow wheel direction');
for(const front of [.001,.1,.5]) {
  const rear=-front*.2;
  const right=fourWheelAckermannAngles(front,rear,30.3,8.6125);
  const left=fourWheelAckermannAngles(-front,-rear,30.3,8.6125);
  for(const angle of [...Object.values(left),...Object.values(right)]) assert(Math.abs(angle)<Math.PI/2,'negative steering must not flip wheels 180 degrees');
  assert(right.frontRight>right.frontLeft && right.frontLeft>0,'right turn requires larger right/inside angle');
  assert(Math.abs(left.frontLeft+right.frontRight)<1e-8,'left/right steering must mirror');
  assert(Math.abs(left.rearLeft+right.rearRight)<1e-8,'rear left/right steering must mirror');
  const a=fourWheelSteeringGeometry(30.3,8.6125,front,rear);
  const b=fourWheelSteeringGeometry(30.3,8.6125,-front,-rear);
  assert(Math.abs(a.outerFrontRadius-b.outerFrontRadius)<1e-8,'left/right outer turning radii must agree');
}
result.leftRightSteering='physical-angle bounds, mirrored inner/outer wheels and equal radii passed';
result.steeringGeometry=[CarType.SEDAN,CarType.SU7,CarType.YU7].map(id=>{
  const model=CAR_MODELS[id], L=model.wheelbase/10, half=(model.trackWidth??model.width*.86)/20;
  const front=model.dynamics.maxSteerAngle;
  const rear=rearSteerAngleForSpeed(model.dynamics.rearSteerMaxDeg,0,front,front);
  const q=(Math.tan(front)-Math.tan(rear))/L;
  const icrX=-Math.tan(rear)/q, icrY=1/q;
  return {id,frontDeg:front*180/Math.PI,rearDeg:rear*180/Math.PI,centerRadiusM:Math.hypot(L/2-icrX,icrY),outerFrontWheelRadiusM:Math.hypot(L-icrX,icrY+half),targetM:model.turningRadiusTargetM,definition:model.turningRadiusDefinition};
});
console.log(JSON.stringify(result,null,2));
