import assert from 'node:assert/strict';
import {SceneRenderPacer,MirrorRenderPacer,PreviewRenderPacer} from '../utils/renderPacing';
import {CAR_MODELS,DEFAULT_VEHICLE_TUNING,GARAGE_CARS} from '../constants';
import {getPowertrain} from '../utils/powertrain';
import {createLongitudinalState,stepLongitudinal} from '../utils/longitudinal';
import {qualityProfile} from '../utils/renderQuality';
const touchAuto=qualityProfile('auto',3,true), desktopAuto=qualityProfile('auto',3,false);
assert.equal(touchAuto.mirrorWidth,384,'mobile auto bounds each of the three mirror render targets');
assert.equal(touchAuto.shadowSize,1024,'mobile auto bounds the per-frame shadow map');
assert.equal(desktopAuto.mirrorWidth,768,'desktop auto retains mirror detail');
assert.equal(qualityProfile('ultra',3,true).shadowSize,4096,'explicit high quality remains available');
const scene=new SceneRenderPacer();
assert(scene.shouldRender(0,false,false));
assert(scene.shouldRender(1,true,false),'first paused frame draws');
assert(!scene.shouldRender(100,true,false),'paused scene is capped');
assert(scene.shouldRender(201,true,false),'paused scene refreshes');
assert(!scene.shouldRender(250,true,true),'hidden document never renders');
assert(scene.shouldRender(251,true,false),'visible paused scene refreshes immediately');
assert(scene.shouldRender(252,false,false),'resume is immediate');
assert(scene.shouldRender(253,false,false),'active frames are uncapped');
const mirrors=new MirrorRenderPacer();
assert(mirrors.shouldRefresh(0,true,false));
assert(!mirrors.shouldRefresh(16,true,false));
assert(mirrors.shouldRefresh(33,true,false));
assert(mirrors.shouldRefresh(34,true,true),'settings/size invalidation refreshes immediately');
assert(mirrors.shouldRefresh(35,false,false),'desktop mirrors remain full frequency');
for(const fps of [60,120]){
 const p=new MirrorRenderPacer();let refreshes=0;
 for(let i=0;i<fps;i++)if(p.shouldRefresh(i*1000/fps,true,false))refreshes++;
 assert(refreshes>=29&&refreshes<=31,`touch mirrors refresh about 30 times at ${fps} Hz: ${refreshes}`);
}
console.log('Render pacing PASS: desktop unbounded, hidden idle, pause refresh, mobile mirror invalidation');
for (const hz of [30,60,90,120,144]) {
 const p=new SceneRenderPacer();let frames=0,simulated=0,last=0;
 for(let i=0;i<=hz*2;i++){
  const now=i*1000/hz;
  if(p.shouldRender(now,false,false,true)){frames++;simulated+=now-last;last=now;}
 }
 assert(Math.abs(frames-(Math.min(hz,60)*2+1))<=1,`mobile cadence on ${hz} Hz display: ${frames}`);
 assert(Math.abs(simulated-2000)<34,'skipped display frames retain elapsed physics time');
}
const touchScene=new SceneRenderPacer();
assert(touchScene.shouldRender(0,false,false,true));
assert(!touchScene.shouldRender(8,false,false,true));
assert(touchScene.shouldRender(9,true,false,true),'pause draws immediately');
assert(touchScene.shouldRender(10,false,false,true),'resume draws immediately');
assert(!touchScene.shouldRender(500,false,true,true));
assert(touchScene.shouldRender(501,false,false,true),'background resume draws immediately');
for (const hz of [60,90,120,144]) for (const interacting of [false,true]) {
 const p=new PreviewRenderPacer();let frames=0,seconds=0;
 for(let i=0;i<=hz*2;i++){
  const dt=p.sample(i*1000/hz,true,interacting,false);
  if(dt!==null){frames++;seconds+=dt;}
 }
 assert(Math.abs(frames-(2*(interacting?60:30)+1))<=1,'preview meets target cadence without high-refresh overdraw');
 assert(Math.abs(seconds-2)<.05,'rotation follows elapsed time, not display frame count');
}
const preview=new PreviewRenderPacer();
assert.equal(preview.sample(0,true,false,false),0);
assert.equal(preview.sample(1000,true,false,true),null,'offscreen/hidden preview does no GPU work');
assert.equal(preview.sample(9000,true,false,false),0,'resume discards time spent hidden');
assert.equal(preview.sample(9010,true,false,false),null);
assert(preview.sample(9020,true,true,false)!>0,'dragging responds at higher cadence');
assert.equal(preview.sample(19020,true,true,false),.05,'long stall cannot cause a rotation jump');
console.log('Showroom pacing PASS: bounded touch workload, refresh-independent rotation, hidden/resume and input');
const jitter=new PreviewRenderPacer();let jitterFrames=0;
for(let i=0;i<=120;i++)if(jitter.sample(i*1000/60+(i%2?.6:0),true,false,false)!==null)jitterFrames++;
assert(Math.abs(jitterFrames-61)<=1,'sub-millisecond rAF jitter cannot accumulate into lost cadence');

// Real engine/brake integration over the presentation schedule. Capping a
// 120/144 Hz screen must not halve driving speed or lose braking time.
for(const id of GARAGE_CARS){
 const cc=CAR_MODELS[id];
 const drive=(hz:number)=>{
  const p=new SceneRenderPacer();let state=createLongitudinalState(),last=0,metres=0;
  for(let i=0;i<=hz*6;i++){
   const now=i*1000/hz;
   if(!p.shouldRender(now,false,false,true))continue;
   const dt=now-last;last=now;if(dt<=0)continue;
   const speed=state.speed;
   state=stepLongitudinal(state,{gear:1,engineStarted:true,gasPressed:false,shiftPressed:false,throttle:now<=3000?.7:0,brake:now>3000?1:0,handbrake:false,absEnabled:true},
    {carId:id,cc,pt:getPowertrain(id),vehicleTune:DEFAULT_VEHICLE_TUNING[id],weatherGrip:1,slopeAlongCar:0,tunedShiftFrames:10,elapsedFrames:dt*60/1000});
   metres+=(speed+state.speed)/2*(15/3.6)*dt/1000;
  }
  return {metres,speed:state.speed};
 };
 const reference=drive(60);
 for(const hz of [90,120,144]){
  const actual=drive(hz);
  assert(Math.abs(actual.metres-reference.metres)<.3,`${id} at ${hz} Hz lost travelled time`);
  assert(Math.abs(actual.speed-reference.speed)<.04,`${id} at ${hz} Hz altered braking`);
 }
}
console.log(`Mobile cadence physics PASS: ${GARAGE_CARS.length} cars, acceleration/braking at 60/90/120/144 Hz`);
