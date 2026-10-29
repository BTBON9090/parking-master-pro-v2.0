import assert from 'node:assert/strict';
import {solveOpenDifferentials,type AxleLayout,type WheelContact} from '../utils/differentialSolver';
const contact=(friction=1,grounded=true):WheelContact=>({omega:0,radius:.35,inertia:1.2,normalN:3600,friction,grounded});
function simulate(layout:AxleLayout,frontMu:[number,number],rearMu:[number,number],grounded:[boolean,boolean,boolean,boolean]=[true,true,true,true],hz=120){
 const wheels=[contact(frontMu[0],grounded[0]),contact(frontMu[1],grounded[1]),contact(rearMu[0],grounded[2]),contact(rearMu[1],grounded[3])];let speed=0,last:any;
 for(let i=0;i<hz*2;i++){
  const substeps=Math.ceil(120/hz),dt=1/hz/substeps;
  for(let j=0;j<substeps;j++){
   last=solveOpenDifferentials({front:{left:wheels[0],right:wheels[1]},rear:{left:wheels[2],right:wheels[3]},layout,driveTorqueNm:1200,speedMs:speed,massKg:1500,dt});
   const results=[last.front.left,last.front.right,last.rear.left,last.rear.right];
   for(let k=0;k<4;k++){wheels[k].omega=results[k].omega;assert(Math.abs(results[k].forceN)<=results[k].limitN+1e-8);}
   speed+=last.forceN/1500*dt;
  }
 }
 return {speed,wheels,last};
}
const dry=simulate('RWD',[1,1],[1,1]),split=simulate('RWD',[1,1],[1,.08]),air=simulate('RWD',[1,1],[1,1],[true,true,true,false]);
assert(dry.speed>split.speed*1.5,`dry ${dry.speed} vs split ${split.speed}`);
assert(split.wheels[3].omega>split.wheels[2].omega*1.2,'low-grip side should spin faster');
assert(air.speed<dry.speed*.15,`open diff must lose traction with a wheel airborne: ${air.speed}`);
assert(air.wheels[3].omega>air.wheels[2].omega*2,'airborne driven wheel spins');
assert.equal(air.last.rear.left.appliedTorqueNm,air.last.rear.right.appliedTorqueNm);
const fwd=simulate('FWD',[1,1],[1,1]),awd=simulate('AWD',[1,1],[1,1]);
assert(fwd.last.front.left.appliedTorqueNm>0&&fwd.last.rear.left.appliedTorqueNm===0);
assert(dry.last.rear.left.appliedTorqueNm>0&&dry.last.front.left.appliedTorqueNm===0);
assert(awd.last.front.left.appliedTorqueNm>0&&awd.last.rear.left.appliedTorqueNm>0);
const awdSplit=simulate('AWD',[1,1],[1,1],[true,true,true,false]);assert(awdSplit.speed>air.speed*3,'AWD front axle retains traction under fixed-split assumption');
const swapped=simulate('RWD',[1,1],[.08,1]);assert(Math.abs(swapped.speed-split.speed)<1e-7);
for(const hz of [30,60,120]){const r=simulate('RWD',[1,1],[1,.08],[true,true,true,true],hz);assert(Math.abs(r.speed-split.speed)<1e-6);}
// At rolling equilibrium and no torque, a tyre introduces no spurious force.
for(const speed of [-15,0,15]){
 const w=contact();w.omega=speed/w.radius;
 const stable=solveOpenDifferentials({front:{left:w,right:{...w}},rear:{left:{...w},right:{...w}},layout:'AWD',driveTorqueNm:0,speedMs:speed,massKg:1500,dt:1/120});
 assert(Math.abs(stable.forceN)<1e-7);
}
const still=contact();still.omega=4;
const zeroTime=solveOpenDifferentials({front:{left:still,right:still},rear:{left:still,right:still},layout:'AWD',driveTorqueNm:900,speedMs:0,massKg:1500,dt:0});
assert.equal(zeroTime.forceN,0);assert.equal(zeroTime.front.left.omega,4);
// Bad or extreme telemetry must not propagate NaN/Infinity into the chassis.
for(const v of [NaN,Infinity,-Infinity,1e300,-1e300]){
 const w:WheelContact={omega:v,radius:v,inertia:v,normalN:v,friction:v,grounded:true,brakeTorqueNm:v};
 const result=solveOpenDifferentials({front:{left:w,right:w},rear:{left:w,right:w},layout:'AWD',driveTorqueNm:v,speedMs:v,massKg:v,dt:1/120});
 for(const part of [result.front.left,result.front.right,result.rear.left,result.rear.right])for(const number of Object.values(part))assert(Number.isFinite(number));
 assert(Number.isFinite(result.forceN));
}
// In a no-engine, no-slope system, contact impulses must not create energy.
for(let i=0;i<500;i++){
 const speed=Math.sin(i*1.37)*40,ws=Array.from({length:4},(_,j)=>({...contact(),omega:Math.sin(i*2.31+j*8)*200}));
 const energy=(1500*speed**2+1.2*ws.reduce((sum,w)=>sum+w.omega**2,0))/2;
 const out=solveOpenDifferentials({front:{left:ws[0],right:ws[1]},rear:{left:ws[2],right:ws[3]},layout:'AWD',driveTorqueNm:0,speedMs:speed,massKg:1500,dt:1/120});
 const next=speed+out.forceN/1500/120,results=[out.front.left,out.front.right,out.rear.left,out.rear.right];
 const after=(1500*next**2+1.2*results.reduce((sum,w)=>sum+w.omega**2,0))/2;
 assert(after<=energy+1e-6,`contact generated energy: ${after-energy}`);
}
// Braking force opposes either direction of travel; no artificial reversal.
for(const v of [8,-8]){
 const b=contact();b.omega=v/b.radius;b.brakeTorqueNm=7000;
 const noDrive=contact();noDrive.omega=v/noDrive.radius;
 const r=solveOpenDifferentials({front:{left:b,right:{...b}},rear:{left:noDrive,right:{...noDrive}},layout:'RWD',driveTorqueNm:0,speedMs:v,massKg:1500,dt:1/120});
 assert(r.front.left.forceN*Math.sign(v)<0,'braking force must oppose road velocity');
 assert(Math.sign(r.front.left.omega)===Math.sign(v)||r.front.left.omega===0,'brake cannot reverse the wheel');
}
const rwdReverse=solveOpenDifferentials({front:{left:contact(),right:contact()},rear:{left:contact(),right:contact()},layout:'RWD',driveTorqueNm:-1200,speedMs:0,massKg:1500,dt:1/120});
assert(rwdReverse.forceN<0);assert(rwdReverse.rear.left.omega<0);
for(const v of [0,3,-3]){
 const zero=contact(0,false);const bad=solveOpenDifferentials({front:{left:zero,right:zero},rear:{left:zero,right:zero},layout:'AWD',driveTorqueNm:900,speedMs:v,massKg:1500,dt:1/120});
 assert.equal(bad.forceN,0,'airborne contact cannot create road force');
 assert(Number.isFinite(bad.front.left.omega));
}
// Underpowered wheel cannot exceed either contact friction limit.
const overload=simulate('RWD',[1,1],[.01,.01]);assert(overload.speed<dry.speed*.2);
console.log(JSON.stringify({dry:dry.speed,split:split.speed,air:air.speed,awdOneAir:awdSplit.speed,splitOmegas:split.wheels.slice(2).map(w=>w.omega)}));
console.log('Differential solver PASS: FWD/RWD/AWD, split grip, airborne wheel, equal shaft torque, fixed-step stability');
