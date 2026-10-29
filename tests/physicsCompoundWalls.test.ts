import assert from 'node:assert/strict';
import {PhysicsWorld} from '../utils/physicsWorld';
import type {Obstacle} from '../types';

// Every original wall remains an independently rotated box with the same
// elevation; impacts from a movable object should match unbatched Cannon.
for(const rotation of [0,Math.PI/6,Math.PI/2,-Math.PI/3])for(const elevation of [0,1.5]){
 const wall:Obstacle={id:'wall',x:1900,y:2100,width:220,height:8,rotation,type:'wall',weight:0,movable:false,color:'#888',elevation};
 const worlds=[new PhysicsWorld(),new PhysicsWorld()];
 worlds[0].addStaticObstacle(wall.x,wall.y,wall.width,wall.height,30,rotation,elevation);worlds[1].addStaticObstacles([wall]);
 const n={x:Math.sin(rotation),z:Math.cos(rotation)},sep=wall.height/2+4.2;
 const body=worlds.map(w=>w.addMovableObstacle({id:'cone',type:'cone',x:wall.x+n.x*sep,y:wall.y+n.z*sep,width:3,height:3,rotation:0,weight:4,movable:true,color:'#f90',elevation}));
 const hits=[0,0];body.forEach((b,i)=>{b.velocity.set(-n.x*50,0,-n.z*50);b.addEventListener('collide',(e:any)=>{if(e.body!==worlds[i].world.bodies[0])hits[i]++;});});
 for(let step=0;step<90;step++){
  worlds.forEach(w=>w.step(1/60));
  for(const axis of ['x','y','z'] as const){assert(Math.abs(body[0].position[axis]-body[1].position[axis])<1e-5,`position ${axis} differs at ${rotation}/${elevation}/${step}`);assert(Math.abs(body[0].velocity[axis]-body[1].velocity[axis])<1e-5,`velocity ${axis} differs`);}
 }
 assert(hits.every(n=>n>0),`wall contact missing at ${rotation}/${elevation}`);worlds.forEach(w=>{w.dispose();assert.equal(w.world.bodies.length,0,'all physics bodies released on scene change');});
}
console.log('Compound static walls PASS: cone contacts and 90-step trajectories match independent bodies at four rotations and two elevations.');
