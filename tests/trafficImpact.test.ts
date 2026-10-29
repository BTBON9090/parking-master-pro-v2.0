import assert from 'node:assert/strict';
import {obstacleVelocityMps,interruptTrafficForImpact,solveVehiclePairImpact,parkedCarImpact} from '../utils/parkedImpact';
import {stepTrafficVehicle,NPC_COLLISION_RECOVERY_MS} from '../utils/traffic';
import {PhysicsWorld} from '../utils/physicsWorld';
import type {Obstacle} from '../types';

const close=(a:number,b:number)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const npc:Obstacle={id:'traffic',type:'car',x:0,y:0,width:20,height:45,rotation:0,weight:1500,movable:true,color:'#888',ai:{path:[{x:5000,y:0}],currentPathIndex:0,speed:7.2,maxSpeed:8,state:'drive'}};
close(obstacleVelocityMps(npc).x,30);npc.rotation=Math.PI/2;close(obstacleVelocityMps(npc).y,30);
assert.deepEqual(obstacleVelocityMps(npc,{x:0,y:0}),{x:0,y:0},'stopped impact motion takes precedence over old AI velocity');
const solve=(a:{x:number;y:number},b:{x:number;y:number})=>solveVehiclePairImpact(a,b,{x:-1,y:0},{x:0,y:0},4.5,2,0,1800,1500);
const same=solve({x:30,y:0},{x:30,y:0});assert.equal(same.closing,0);assert.equal(same.damage,0);close(same.velocity.x,30);close(same.otherVelocity.x,30);
const gentle=solve({x:31,y:0},{x:30,y:0});assert.equal(gentle.closing,1);assert.equal(gentle.tier,'none','high road speed with 1m/s relative speed is not a wreck');
const oncoming=solve({x:15,y:0},{x:-15,y:0});assert.equal(oncoming.closing,30);assert.equal(oncoming.tier,'severe');
const leaving=solve({x:10,y:0},{x:20,y:0});assert.equal(leaving.closing,0);close(leaving.velocity.x,10);close(leaving.otherVelocity.x,20);
// Translation invariance, momentum, and energy across varied masses/headings.
for(const ma of [500,1800,13000,60000])for(const mb of [800,2200,13000])for(const theta of [0,.7,Math.PI/2]){
 const n={x:-Math.cos(theta),y:-Math.sin(theta)},a={x:20,y:6},b={x:-3,y:1};
 const pair=solveVehiclePairImpact(a,b,n,{x:0,y:0},5,2,0,ma,mb),boost={x:12,y:-4};
 const shifted=solveVehiclePairImpact({x:a.x+boost.x,y:a.y+boost.y},{x:b.x+boost.x,y:b.y+boost.y},n,{x:0,y:0},5,2,0,ma,mb);
 close(pair.closing,shifted.closing);close(pair.damage,shifted.damage);close(pair.velocity.x+boost.x,shifted.velocity.x);
 close(ma*a.x+mb*b.x,ma*pair.velocity.x+mb*pair.otherVelocity.x);close(ma*a.y+mb*b.y,ma*pair.velocity.y+mb*pair.otherVelocity.y);
 const energy=(v:{x:number;y:number})=>v.x*v.x+v.y*v.y;
 assert(ma*energy(pair.velocity)+mb*energy(pair.otherVelocity)<=ma*energy(a)+mb*energy(b)+1e-6);
 const old=parkedCarImpact(a,{x:0,y:0},n,ma,mb),stationary=solveVehiclePairImpact(a,{x:0,y:0},n,{x:0,y:0},5,2,0,ma,mb);
 assert.deepEqual(stationary.velocity,old.player,'parked-car impulse retained');
}
npc.rotation=0;interruptTrafficForImpact(npc,5000);assert.equal(npc.ai!.speed,0);assert.equal(npc.ai!.state,'stop');
const step=(nowMs:number)=>stepTrafficVehicle({id:npc.id,x:0,y:0,rotation:0,ai:npc.ai!,blockers:[],player:{x:-2000,y:-2000},dtSeconds:1/60,nowMs});
assert.equal(step(5001).speed,0);assert.equal(step(5001).x,0);
const restarted=step(5000+NPC_COLLISION_RECOVERY_MS+1);assert(restarted.speed>0&&restarted.speed<.01,'restart accelerates from rest, not the pre-impact 108km/h');
const world=new PhysicsWorld();world.addTrafficCar('traffic',0,0,20,45,1500);
world.updateTrafficKinematics('traffic',20,30,0,7.2,0,12,{x:-2,y:4});
const body=world.world.bodies.find(b=>b.position.x===20&&b.position.z===30)!;
close(body.velocity.x,-20);close(body.velocity.z,40);close(body.position.y,17);
world.dispose();
console.log('Traffic impact PASS: relative closing speed, translating-frame invariance, two-mass momentum/energy, stationary legacy impulse, NPC recovery from rest and lateral Cannon velocity.');
