import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {CAR_MODELS,DEFAULT_VEHICLE_TUNING,GENERATE_LEVEL} from '../constants';
import {CarType} from '../types';
import {GARAGE_SPIRAL,GARAGE_NARROW_SPIRAL,garageSpiralPoint,garageSurface} from '../utils/garage';
import {buildCollisionGrid} from '../utils/collisionSpatial';
import {VehicleCollisionQuery} from '../utils/vehicleCollisionQuery';
import {stepLongitudinal,createLongitudinalState} from '../utils/longitudinal';
import {stepLateral,createLateralState} from '../utils/lateralDynamics';
import {getPowertrain} from '../utils/powertrain';
import {aeroGripScale,multiAxleSteer} from '../utils/handling44';
import {WORLD_ROUTES} from '../utils/openWorld';
import {MissileShow} from '../three/missileShow';
const report:any={};
const garage=GENERATE_LEVEL(6),grid=buildCollisionGrid(garage.obstacles),query=new VehicleCollisionQuery();
let maxError=0;
for(const spiral of [GARAGE_SPIRAL,GARAGE_NARROW_SPIRAL])for(const direction of [1,-1]){
 let hint=direction===1?-48:-144;
 for(let i=0;i<=1440;i++){
  const t=direction===1?i/1440:1-i/1440,p=garageSpiralPoint(t,0,spiral),floor=garageSurface(p.x,p.y,hint);
  assert(Math.abs(floor.height-p.height)<1e-5,'centre follows exact helix');hint=floor.height;
  const hits=query.findHits(grid,{x:p.x,y:p.y,rotation:p.angle+direction*Math.PI/2,elevation:hint,width:18,length:43,verticalHeight:15});assert.equal(hits.size,0,`helix obstruction: ${spiral.x} ${t} ${[...hits]}`);
  // Every tyre can cross the angular seam without landing one floor below.
  for(const localX of [-8,8])for(const localZ of [-14,14]){const heading=p.angle+direction*Math.PI/2,x=p.x+Math.cos(heading)*localZ-Math.sin(heading)*localX,y=p.y+Math.sin(heading)*localZ+Math.cos(heading)*localX;const h=garageSurface(x,y,hint).height;maxError=Math.max(maxError,Math.abs(h-hint));assert(Math.abs(h-hint)<2,`tyre switched floors: ${spiral.x} ${t} ${h} ${hint}`);}
 }
 // Bridge entry from both decks: outside, seam-straddling, and turning area.
 for(const floor of [-48,-144])for(let y=spiral.y-spiral.radius-50;y<=spiral.y-spiral.radius+10;y+=2)for(const x of [spiral.x-8,spiral.x+8])assert(Math.abs(garageSurface(x,y,floor).height-floor)<.1,'bridge endpoint must not alias B2');
}
report.garage={centreSamples:5764,tyreSamples:23056,maxTyreHeightDifference:maxError};
const inputs={gear:1,engineStarted:true,throttle:1,brake:0,handbrake:false,gasPressed:false,shiftPressed:false};
const id=CarType.TRUCK,cc=CAR_MODELS[id],context={carId:id,cc,pt:getPowertrain(id),vehicleTune:DEFAULT_VEHICLE_TUNING[id],weatherGrip:1,slopeAlongCar:0,tunedShiftFrames:10,elapsedFrames:1};
const drive=(grip:number)=>{let s=createLongitudinalState();for(let i=0;i<120;i++)s=stepLongitudinal(s,inputs,{...context,weatherGrip:grip});return s;};
const dry=drive(1),ice=drive(.2);assert(ice.speed<dry.speed*.8&&ice.driveSlip!>.5,'ice must spin drive tyres and lose acceleration');
let released=ice;for(let i=0;i<120;i++)released=stepLongitudinal(released,{...inputs,throttle:0},{...context,weatherGrip:.2});assert(released.driveSlip!<.01,'wheelspin settles off throttle');
const corner=(grip:number,slip=0)=>{const s=createLateralState();let r:any;for(let i=0;i<180;i++)r=stepLateral(s,{speed:14,steer:.18,rearSteer:0,wheelbase:2.8,rearOffset:1.4,frontBias:.55,grip,layout:'FWD',throttle:1,driveSlip:slip,handbrake:false,frontLocked:false,dt:1/60,understeer:1});return r;};
const normalTurn=corner(.9),iceTurn=corner(.18,1);assert(Math.abs(iceTurn.yawRate)<Math.abs(normalTurn.yawRate)*.6,'ice understeer opens corner radius');assert(Math.abs(iceTurn.frontSlip)>.18*.8,'front tyres slide on ice');
report.ice={drySpeed:dry.speed,iceSpeed:ice.speed,driveSlip:ice.driveSlip,dryYaw:normalTurn.yawRate,iceYaw:iceTurn.yawRate};
assert.equal(aeroGripScale(CAR_MODELS[CarType.SPORTS],0),1);assert(aeroGripScale(CAR_MODELS[CarType.SPORTS],55)>1.25);assert.equal(aeroGripScale(cc,55),1);
const angles=[];for(const z of [56,40,24,8,-8,-24,-40,-56])for(const x of [-13.5,13.5]){const a=multiAxleSteer(x,z,56,-56,.4,-.2),k=(Math.tan(.4)-Math.tan(-.2))/112;assert(Math.abs(Math.tan(a)*(1+x*k)-(Math.tan(-.2)+(z+56)*k))<1e-10);angles.push(a);}
assert(new Set(angles).size===16);report.steering={independentKnuckles:angles.length,front:angles.slice(0,2),rear:angles.slice(-2)};
const city=GENERATE_LEVEL(1),cityGrid=buildCollisionGrid(city.obstacles),gateway=WORLD_ROUTES.find(r=>r.id==='gateway')!;
for(const p of gateway.samples.filter(p=>p.x<24000)){const hits=query.findHits(cityGrid,{x:p.x,y:p.y,rotation:Math.atan2(p.ny,p.nx)-Math.PI/2,elevation:p.h,width:25,length:55,verticalHeight:25});assert.equal(hits.size,0,`gateway blocked ${[...hits]}`);}
report.gateway='clear for a 2.5 m vehicle';
Object.defineProperty(globalThis,'window',{value:new EventTarget(),configurable:true});
const vehicle=new THREE.Group(),launcher=new THREE.Group();launcher.name='LauncherPivot';vehicle.add(launcher);const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),show=new MissileShow(scene,vehicle,city);
const command=(action:string,other={})=>window.dispatchEvent(new CustomEvent('missile-command',{detail:{action,...other}}));
show.step(.1,1,camera);command('deploy');assert.equal(show.phase,'stowed','cannot deploy moving');show.step(.1,0,camera);command('deploy');show.step(3,0,camera);assert.equal(show.phase,'ready');command('target',{x:18000,y:19500});command('launch');show.step(4.9,0,camera);assert.equal(show.phase,'countdown');command('cancel');assert.equal(show.phase,'ready');command('launch');show.step(5,0,camera);assert.equal(show.phase,'flight');show.step(6,0,camera);assert(show.rocket.visible&&camera.position.y>100);show.step(6,0,camera);assert.equal(show.phase,'impact');assert(show.blast.visible);assert.equal(show.blast.position.x,18000);show.step(10,0,camera);assert.equal(show.phase,'spent');command('retract');show.step(.1,0,camera);assert.equal(show.locked,false);show.dispose();assert.equal(scene.children.length,0);report.cinematic='moving lockout, 5s countdown, cancel, flight, exact local target, impact, return and disposal';
fs.writeFileSync('docs/round44/regression.json',JSON.stringify(report,null,2));console.log('Round 44 regression PASS',report);
