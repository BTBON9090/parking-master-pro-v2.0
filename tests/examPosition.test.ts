import assert from 'node:assert/strict';
import {newExam,stepExam,examStationDistance} from '../utils/drivingExam';
import type {ExamStation,InputState} from '../types';
const input:InputState={throttle:0,gasPressed:false,brake:0,steeringWheelAngle:0,gear:1,handbrake:false,engineStarted:true,lights:false};
const tasks:ExamStation[]=[{id:'a',name:'a',kind:'left',x:100,y:100,exit:{x:300,y:100},radius:30,speedLimit:20,hint:'左转'},{id:'b',name:'b',kind:'stop',x:100,y:500,exit:{x:300,y:500},radius:30,speedLimit:10,hint:'停车'}];
const tick=(s:ReturnType<typeof newExam>,x:number,y:number,time=0,speedKmh=5)=>stepExam(s,tasks,{x,y,time,rotation:0,speedKmh,gear:1,manual:false},input);
const s=newExam();tick(s,200,500);assert.equal(s.index,1);assert(s.active,'enter second project without first');
tick(s,200,700,80,100);assert(!s.active);assert.equal(s.score,100,'no stale speed penalty outside exam region');
tick(s,200,100,160);assert.equal(s.index,0);assert(s.active);
tick(s,200,500,240);assert.equal(s.index,1);assert.equal(s.distance,0,'teleport cannot count towards attempt');
// Stopping midway along the corridor does not satisfy stop-at-marker.
for(let n=0;n<40;n++)tick(s,210,500,320+n*80,0);assert(!s.stopped);
for(let n=0;n<40;n++)tick(s,100,500,4000+n*80,0);assert(s.stopped);
tick(s,180,500,8000);tick(s,270,500,8080);tick(s,290,500,8160);assert(s.passed.includes('b'));
assert.equal(examStationDistance({...tasks[0],path:[{x:100,y:100},{x:100,y:300},{x:300,y:300}]},100,250),0);
console.log('Exam position PASS: out-of-order entry, leaving zone, teleport, true stop point, passing, bent path location.');
