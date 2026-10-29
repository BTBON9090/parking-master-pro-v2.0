import assert from 'node:assert/strict';
import * as THREE from 'three';
import {steeringArcPosition,MobileInputController,steeringRulerZoom,mergeMobileInput} from '../utils/mobileInput';
import type {InputState} from '../types';
import {resolveHudLayout} from '../utils/mobileLayout';
import {DriverHands,SteeringGripController} from '../three/driverHands';
import {brakeResponse} from '../utils/braking';

// A resized elliptical guide must map each endpoint and the 45-degree grip to
// the same steering as a circular guide, even when pedals are held.
for(const [w,h] of [[200,200],[300,160],[120,240]]){
 const left=20,top=30,mid=Math.SQRT1_2;
 assert.equal(steeringArcPosition(left,top,left,top,w,h),0);
 assert(Math.abs(steeringArcPosition(left+mid*w,top+(1-mid)*h,left,top,w,h)-.5)<1e-9);
 assert.equal(steeringArcPosition(left+w,top+h,left,top,w,h),1);
 assert(steeringArcPosition(left+w*1.4,top+h,left,top,w,h)>1);
 const c=new MobileInputController();c.begin('steer',1,left,top,0);c.begin('gas',2,500,200);c.move('gas',2,500,156,540);
 for(const [fraction,expected] of [[0,-540],[.5,0],[1,540]]){
  const a=fraction*Math.PI/2,x=left+Math.sin(a)*w,y=top+h-Math.cos(a)*h;
  c.steerAt(1,left+steeringArcPosition(x,y,left,top,w,h)*w,left,w,540);
  assert(Math.abs(c.snapshot().steeringWheelAngle!-expected)<1e-8);assert.equal(c.snapshot().throttle,1);
 }
 c.end('steer',1);assert.equal(c.snapshot().throttle,1);c.clear();assert.equal(c.snapshot().throttle,0);
}
assert(steeringRulerZoom(120)>1);
assert.equal(steeringRulerZoom(120),5);
assert(steeringRulerZoom(130)>steeringRulerZoom(80),'high-speed fine steering uses more travel');
assert(steeringRulerZoom(160)>5&&steeringRulerZoom(200)>steeringRulerZoom(160));
assert.equal(steeringRulerZoom(240),10);assert.equal(steeringRulerZoom(350),10);
for(let speed=119;speed<241;speed+=.1)assert(Math.abs(steeringRulerZoom(speed+.1)-steeringRulerZoom(speed))<.01,'speed changes cannot jump the zoom');
// With full brake held, moving outside the zoomed guide can still pan all the
// way to mechanical lock; releasing brake must not release the steering finger.
for(const speed of [120,160,200,350]){
 const c=new MobileInputController(),zoom=steeringRulerZoom(speed);c.begin('steer',1,100,0,0);c.begin('brake',2,500,100);
 c.move('brake',2,500,56,540);c.steerAt(1,100,0,200,540,zoom);
 for(let x=102;x<=2200;x+=2)c.steerAt(1,x,0,200,540,zoom);
 assert(Math.abs(c.snapshot().steeringWheelAngle!-540)<1e-6,`lock reachable at ${speed} km/h`);
 assert.equal(c.snapshot().brake,1);c.end('brake',2);assert(c.held('steer'));assert.equal(c.snapshot().brake,0);
 for(const direction of [-1,1]){
  const edge=new MobileInputController();edge.begin('steer',5,100,0,0);edge.begin('brake',6,500,100);edge.move('brake',6,500,56,540);
  edge.steerAt(5,100,0,200,540,zoom);edge.steerAt(5,direction>0?204:-4,0,200,540,zoom);
  for(let n=0;n<50;n++)assert(edge.panSteering(5,direction,.05,540,zoom));
  assert(Math.abs(edge.snapshot().steeringWheelAngle!-direction*540)<1e-6,`held screen edge reaches ${direction} lock at ${speed}`);
  assert.equal(edge.snapshot().brake,1);edge.end('steer',5);assert(!edge.panSteering(5,direction,.05,540,zoom));
 }
}
// Independent steering and braking contacts must survive each other's moves,
// releases and cancellation, including when keyboard pedals are also held.
const simultaneous=new MobileInputController();
const input:InputState={steeringWheelAngle:0,gear:1,parkingBrake:false,handbrake:false,throttle:0,gasPressed:false,shiftPressed:false,brake:0,lights:false,engineStarted:true};
const keys={w:false,s:false,shift:false,handbrake:false};
assert(simultaneous.begin('steer',11,100,100));
assert(simultaneous.begin('brake',22,500,200));
assert(simultaneous.move('brake',22,500,156,540));
assert(simultaneous.steerAt(11,180,0,200,540));
let mixed=mergeMobileInput(input,simultaneous.snapshot(),keys);
assert.equal(mixed.brake,1);assert(mixed.steeringWheelAngle>0,'braking must not cancel steering');
simultaneous.end('brake',22);mixed=mergeMobileInput(mixed,simultaneous.snapshot(),keys);
assert.equal(mixed.brake,0);assert(mixed.steeringWheelAngle>0,'releasing brake retains the held steering');
simultaneous.begin('brake',23,500,200);keys.w=true;
mixed=mergeMobileInput(mixed,simultaneous.snapshot(),keys);assert(!mixed.gasPressed&&mixed.brake>0);
simultaneous.end('brake',23);mixed=mergeMobileInput(mixed,simultaneous.snapshot(),keys);assert(mixed.gasPressed&&mixed.brake===0);
keys.s=true;mixed=mergeMobileInput(mixed,simultaneous.snapshot(),keys);assert(mixed.brake>0,'keyboard brake survives touch moves');
simultaneous.begin('gas',24,700,200);simultaneous.move('gas',24,700,156,540);
mixed=mergeMobileInput(mixed,simultaneous.snapshot(),keys);assert.equal(mixed.throttle,0,'keyboard brake suppresses held touch throttle');
keys.s=false;mixed=mergeMobileInput(mixed,simultaneous.snapshot(),keys);assert.equal(mixed.throttle,1,'held touch throttle returns when keyboard brake releases');
keys.handbrake=true;simultaneous.end('steer',11);mixed=mergeMobileInput(mixed,simultaneous.snapshot(),keys);assert(mixed.handbrake);
simultaneous.clear();keys.w=false;keys.s=false;keys.handbrake=false;
mixed=mergeMobileInput(mixed,simultaneous.snapshot(),keys);assert.equal(mixed.brake,0);assert.equal(mixed.handbrake,false);
for(const [w,h] of [[844,390],[1280,800],[720,360]]){
 const r=resolveHudLayout(w,h,false).steer;
 assert(r.x+r.width<.5&&r.y+r.height<1,'steering fits on the lower left');
}
// One side of the rim rises and the opposite side falls when the wheel
// rotates; both should reverse when rotation reverses.
const hands=new DriverHands(new THREE.Group());
const grips=hands.group.children.filter(n=>n instanceof THREE.Group);
assert.equal(grips.length,2);
for(let i=0;i<20;i++)hands.update(.3,1/120);const positive=grips.map(g=>g.position.z);
for(let i=0;i<20;i++)hands.update(-.3,1/120);const negative=grips.map(g=>g.position.z);
assert(positive[0]*positive[1]<0);assert(negative[0]*negative[1]<0);
assert(positive[0]*negative[0]<0&&positive[1]*negative[1]<0);
// Clock-face choreography: 9/3 at centre, descend to 6 and 12 at a
// quarter turn. The lower hand lifts, reaches 3 while its partner stays at
// 9 at the half turn. Both continue through 12/6 and repeat the crossed
// 3/9 grip after one and a half turns. Mirror the complete sequence.
const clock=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
const closeAngle=(a:number,b:number)=>Math.abs(clock(a-b))<1e-7;
for(const direction of [-1,1]){
 const c=new SteeringGripController();
 const down=c.grips.find(g=>g.side===-direction)!,up=c.grips.find(g=>g.side===direction)!;
 c.update(0,1/120);
 assert(closeAngle(down.angle,-direction*Math.PI/2)&&closeAngle(up.angle,direction*Math.PI/2));
 for(let i=1;i<=100;i++){
  c.update(direction*i*.005,1/120);
  assert(c.grips.every(g=>g.mode==='hold'),'small steering keeps both hands on the wheel');
 }
 c.update(direction*Math.PI/2,1/120);
 assert(closeAngle(down.angle,-direction*Math.PI)&&down.mode==='hold','lower hand reaches 6 before release');
 assert(closeAngle(up.angle,0)&&up.mode==='hold','opposite hand grips at 12');
 c.update(direction*Math.PI*.75,1/120);
 assert(String(down.mode)==='reach'&&down.lift>0&&up.mode==='hold','lower hand lifts while opposite hand keeps holding');
 c.update(direction*Math.PI,1/120);
 assert(closeAngle(down.angle,direction*Math.PI/2)&&down.mode==='hold','lower hand regrips at 3 or 9');
 assert(closeAngle(up.angle,-direction*Math.PI/2)&&up.mode==='hold','opposite hand remains on rim at 9 or 3');
 c.update(direction*Math.PI*1.5,1/120);
 assert(closeAngle(down.angle,0)&&closeAngle(up.angle,-direction*Math.PI),'hands continue to 12 and 6');
 assert(c.grips.every(g=>g.mode==='hold'),'neither hand lets go at 12/6');
 c.update(direction*Math.PI*2,1/120);
 assert(closeAngle(down.angle,-direction*Math.PI/2)&&closeAngle(up.angle,direction*Math.PI/2),'both return to 9/3 after one full turn');
 c.update(direction*Math.PI*2.5,1/120);
 assert(closeAngle(down.angle,-direction*Math.PI)&&closeAngle(up.angle,0),'second cycle reaches 6/12');
 c.update(direction*Math.PI*2.75,1/120);
 assert(String(down.mode)==='reach'&&up.mode==='hold','lower hand lifts for second crossing');
 c.update(direction*Math.PI*3,1/120);
 assert(closeAngle(down.angle,direction*Math.PI/2)&&closeAngle(up.angle,-direction*Math.PI/2),'second crossing at one and a half turns');
 assert(c.grips.every(g=>g.mode==='hold'),'both hands grip at second crossing');
 for(let i=1;i<=1260;i++)c.update(direction*i*.01,1/120);
 assert(c.grips.every(g=>Number.isFinite(g.angle)&&Number.isFinite(g.lift)),'turning past one and a half turns remains finite');
 for(let i=1259;i>=0;i--)c.update(direction*i*.01,1/120);
 assert(c.grips.every(g=>g.mode==='hold'&&closeAngle(g.angle,g.side*Math.PI/2)),'return to centre restores 9 and 3');
}
// Stopping and reversing mid-handover must remain continuous and recover.
for(const direction of [-1,1]){
 const c=new SteeringGripController();let previous=c.update(0,1/120).map(g=>({...g}));
 const values=[...Array.from({length:500},(_,i)=>direction*(i+1)*.005),...Array(60).fill(direction*2.5),...Array.from({length:500},(_,i)=>direction*(499-i)*.005),...Array(240).fill(0)];
 for(const wheel of values){
  const current=c.update(wheel,1/120).map(g=>({...g}));
  for(let i=0;i<2;i++){
   assert(Number.isFinite(current[i].angle)&&Number.isFinite(current[i].lift));
   assert(Math.abs(current[i].angle-previous[i].angle)<.12&&Math.abs(current[i].lift-previous[i].lift)<.02,'no discontinuous hand or lift movement');
  }
  previous=current;
 }
 assert(c.grips.every(g=>g.mode==='hold'&&Math.abs(g.angle-g.side*Math.PI/2)<.003),'reversal returns to the resting grip');
}
// Fixed-length arm segments remain reachable even during regrips and reversal.
const visual=new DriverHands(new THREE.Group());
for(let i=0;i<=3200;i++){
 const angle=i<=1600?i*.005:(3200-i)*.005;
 visual.update(angle,1/120);
 for(const index of [1,2,4,5])assert(Math.abs((visual.group.children[index] as THREE.Mesh).scale.y-.30)<1e-6,'arm segments must not stretch');
}
// Large input steps are smoothed visually rather than teleporting palms.
for(const direction of [-1,1]){
 const rig=new DriverHands(new THREE.Group());
 const handGroups=rig.group.children.filter(n=>n instanceof THREE.Group);
 let previous=handGroups.map(n=>Math.atan2(n.position.x,-n.position.z));
 let previousMode=handGroups.map(n=>n.userData.gripMode);
 for(let i=1;i<=100;i++){
  rig.update(direction*i*.3,1/60);
  const current=handGroups.map(n=>Math.atan2(n.position.x,-n.position.z));
  assert(handGroups.some(n=>n.userData.gripMode==='hold'),'one hand remains on the rim during active turning');
  for(let h=0;h<2;h++){
   const delta=Math.atan2(Math.sin(current[h]-previous[h]),Math.cos(current[h]-previous[h]));
   if(handGroups[h].userData.gripMode!=='hold'||previousMode[h]!=='hold')
    assert(Math.abs(delta)<=8/60+1e-6,'released hand movement is bounded per frame');
   else assert(Math.abs(delta+direction*.3)<1e-6,'gripping hand follows quick wheel rotation exactly');
  }
  previous=current;previousMode=handGroups.map(n=>n.userData.gripMode);
 }
}
// A hand is not gripping merely because its angular position matches: its
// palm must actually have lowered onto the wheel. Keep the other hand on the
// surface while the returning hand completes that movement, including at
// the frame rates that previously produced a falsely labelled grip.
for(const direction of [-1,1])for(const step of [.01,.08,.10,.12,.30]){
 const rig=new DriverHands(new THREE.Group());
 const hands=rig.group.children.filter(n=>n instanceof THREE.Group);
 const frames=Math.ceil(12/step);
 for(let i=1;i<=frames;i++){
  rig.update(direction*i*step,1/60);
  assert(hands.some(hand=>hand.userData.gripMode==='hold'&&Math.abs(hand.position.y-.045)<1e-8),'turning retains an actual grip on the rim');
  for(const hand of hands)if(hand.userData.gripMode==='hold')
   assert(Math.abs(hand.position.y-.045)<1e-8,'a gripping palm must touch the rim surface');
 }
}
// Distinguish simultaneous input from physical loss of steering on locked
// tyres; ABS must not be assumed to be on or force-enabled by the UI.
for(const abs of [false,true])for(const pedal of [.12,1]){
 const r=brakeResponse(pedal,false,3,abs,1,1);
 assert.equal(r.frontLocked,!abs&&pedal===1);
 assert.equal(r.rearLocked,!abs&&pedal===1);
 assert.equal(r.absActive,abs&&pedal===1);
}
console.log('PASS: resizable steering arc, multitouch input and opposing wheel grip motion');
