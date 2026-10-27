import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildBeijingLevel} from '../utils/beijingMap';
import {elevatedRoadProfile} from '../utils/elevatedRoad';
import {checkVehicleCollision,checkVehicleRectCollision,vehicleLayersCompatible,getConvexContactNormal,getVehicleBoundaryPoints} from '../utils/physics';
import {CAR_MODELS,DEFAULT_STEERING_CURVES,hoodCameraDefaultForCar} from '../constants';
import {CarType} from '../types';
import {solveVehicleImpact,impactContactArm} from '../utils/impactResponse';
import {createDriverMotion,stepDriverMotion,corneringRollTarget} from '../utils/driverMotion';
import {suspensionForCar} from '../utils/suspension';
import {motorMix} from '../utils/motorAudio';
const l=buildBeijingLevel(),cfg=CAR_MODELS[CarType.TAI7];
const hits=(x:number,y:number,r:number,e:number)=>{
 const body={x,y,length:cfg.length,width:cfg.width,rotation:r,elevation:e,verticalHeight:cfg.height};
 return l.obstacles.filter(o=>vehicleLayersCompatible(body,o)&&(o.collisionFootprint?checkVehicleCollision(body,{x:o.x,y:o.y,length:o.height,width:o.width,rotation:o.rotation,footprint:o.collisionFootprint}):checkVehicleRectCollision(body,o)));
};
let deckChecks=0;
// Both directions, across ALL usable bridge width, especially over pier edges.
for(let x=5300;x<=7800;x+=5)for(const y of [4455,4460,4475,4500,4525,4540,4545])for(const r of [0,Math.PI]){
 const e=elevatedRoadProfile(l.elevatedRoads![0],x+15000,19500)?.height??0;
 assert.equal(hits(x+15000,y+15000,r,e).length,0,`bridge ${x},${y}: ${hits(x+15000,y+15000,r,e).map(o=>o.id)}`);deckChecks++;
}
for(const x of [6104,6896])assert(hits(x+15000,19448,0,0).some(o=>o.id.includes('pier')),'under-deck pillar must remain solid');
for(let y=4200;y<4800;y+=10)assert.equal(hits(21500,y+15000,Math.PI/2,0).length,0,'underpass stays clear');
const ring=l.curvedRoads!.find(r=>r.kind==='roundabout')!;
assert.equal(ring.radius,240);assert.equal(ring.direction,'one-way');assert.equal(ring.lanes,2);
for(const lane of [-21.6,21.6])for(let a=0;a<Math.PI*2;a+=.01){const r=ring.radius!+lane;assert.equal(hits(ring.center!.x+Math.cos(a)*r,ring.center!.y+Math.sin(a)*r,a-Math.PI/2,0).length,0,'both same-direction lanes clear');}
assert.deepEqual(DEFAULT_STEERING_CURVES[CarType.TAI7],{firstHalfGain:.05,secondHalfGain:.09,thirdHalfGain:1,inputSmoothing:.7,highSpeedFloor:.26,centeringGain:1,autoCenteringSpeed:1.11});
assert.deepEqual(hoodCameraDefaultForCar(CarType.TAI7),{forward:-7.5,lateral:3.25,height:-6.75,pitch:7.25,yaw:0,fov:65});
assert.notDeepEqual(hoodCameraDefaultForCar(CarType.SUV),hoodCameraDefaultForCar(CarType.TAI7));
const frontal=solveVehicleImpact({x:20,y:0},{x:-1,y:0},{x:2.5,y:0},5,2);
assert(frontal.velocity.x<0&&frontal.catastrophic&&frontal.yawRate===0);
const glance=solveVehicleImpact({x:5,y:20},{x:-1,y:0},{x:2.3,y:1},5,2);
assert(glance.velocity.x-glance.yawRate<0&&glance.velocity.y>18&&glance.yawRate>0&&!glance.catastrophic);
assert.equal(solveVehicleImpact({x:-10,y:0},{x:-1,y:0},{x:2,y:0},5,2).damage,0,'separating contact cannot add damage');
assert.equal(solveVehicleImpact({x:1,y:0},{x:-1,y:0},{x:2,y:0},5,2).damage,0,'parking touch cannot destroy car');
const body={x:0,y:0,length:50,width:20,rotation:0};
assert.equal(impactContactArm(getVehicleBoundaryPoints(body),body,{x:-1,y:0}).y,0,'centred frontal contact no fake yaw');
assert(corneringRollTarget(.7,suspensionForCar(CarType.TAI7))<0,'right turn lowers left/outside shoulder');
assert(Math.abs(corneringRollTarget(.7,suspensionForCar(CarType.SEAL08)))<Math.abs(corneringRollTarget(.7,suspensionForCar(CarType.TAI7))),'sport sedan supports body more than tall SUV');
const results=[];
for(const hz of [30,60,120]){
 const s=createDriverMotion();let maxX=0,maxY=0,maxCorrection=0;
 for(let i=0;i<hz*6;i++){
  const t=i/hz,bump=t>.4&&t<1.4?Math.sin((t-.4)*Math.PI)*1.2:0;
  const p=stepDriverMotion(s,1/hz,{height:bump,pitch:bump*.03,roll:t<2?.05:0,longG:0,latG:t<2?.7:0});
  maxX=Math.max(maxX,Math.abs(p.x));maxY=Math.max(maxY,Math.abs(p.y));maxCorrection=Math.max(maxCorrection,Math.abs(p.pitchCorrection));
  assert(Math.abs(p.x)<.45&&Math.abs(p.y)<.35&&Math.abs(p.rollCorrection)<=.09,'head remains inside cabin');
 }
 assert(Math.abs(s.x.p)<.001&&Math.abs(s.y.p)<.001,'head settles after road / turn');
 assert(maxX>.1&&maxY>.015&&maxCorrection>.005,'inertial lateral/vertical motion and head stabilization all active');
 results.push({hz,maxX,maxY,maxCorrection});
}
assert(Math.abs(results[0].maxX-results[2].maxX)<.01,'head response frame rate invariant');
assert(motorMix(4,.3,true,true).gain>0,'EV acceleration remains audible inside cabin');
assert(motorMix(4,.3,true,true).cutoff<motorMix(4,.3,false,true).cutoff,'cabin muffles harmonics');
assert.equal(motorMix(4,.3,true,false).gain,0);
fs.mkdirSync('docs/round14',{recursive:true});fs.writeFileSync('docs/round14/regression.json',JSON.stringify({deckChecks,ringRadiusM:24,headMotion:results,frontal,glance},null,2));
console.log('Round14: bridge width/direction + underpass + ring lanes + exact defaults + impact impulses + head dynamics + EV mix PASS');
