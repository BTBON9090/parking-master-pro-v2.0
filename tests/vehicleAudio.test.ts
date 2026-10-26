import assert from 'node:assert/strict';
import fs from 'node:fs';
import {motorMix,roadMix,cabinInsulation,hasMotorDrive,driveForceForAudio} from '../utils/motorAudio';
import {initRecordingAudio,updateRecordingAudio,disposeRecordingAudio,setRecordingAudioFocus,type RecordingAudioParams} from '../utils/recordingAudio';
import {GARAGE_CARS,CAR_MODELS,DEFAULT_VEHICLE_TUNING} from '../constants';
import {getPowertrain} from '../utils/powertrain';
import {createLongitudinalState,stepLongitudinal} from '../utils/longitudinal';
const report=[];
for(const id of GARAGE_CARS){
 const pt=getPowertrain(id),ctx={carId:id,cc:CAR_MODELS[id],pt,vehicleTune:DEFAULT_VEHICLE_TUNING[id],weatherGrip:1,slopeAlongCar:.25,tunedShiftFrames:pt.shiftFrames,elapsedFrames:1};
 const insulation=cabinInsulation(id);
 // Run actual longitudinal output: parked, neutral, forward drive, reverse
 // drive, uphill rollback with no throttle, engine off and braking.
 for(const [name,gear,engineStarted,throttle,brake,handbrake,driving] of [
  ['D parked',1,true,.3,0,true,false],['N rolling',0,true,.3,0,false,false],
  ['D coast',1,true,0,0,false,false],['R coast',-1,true,0,0,false,false],
  ['D powered',1,true,.3,0,false,true],['R powered',-1,true,.3,0,false,true],
  ['power off',1,false,.3,0,false,false],['braking',1,true,.3,1,false,false],
 ] as const){
  let s=createLongitudinalState(-.8),force=0;
  for(let i=0;i<120;i++) {const r=stepLongitudinal(s,{gear,engineStarted,throttle,gasPressed:false,shiftPressed:false,brake,handbrake},{...ctx,slopeAlongCar:name.includes('powered')?0:ctx.slopeAlongCar});s=r;force=r.engineForce;}
  const active=hasMotorDrive(engineStarted,gear,throttle,force,brake,handbrake);
  assert.equal(active,driving,`${id} ${name}`);
  for(const cabin of [false,true])assert.equal(motorMix(Math.abs(s.speed),s.throttle,cabin,active,insulation).gain>0,driving,`${id} ${name} audible`);
 }
 // Keyboard W leaves the analogue field at zero in App; use the actual
 // target pedal reported by the drivetrain, including non-stepping frames.
 for(const fps of [30,60,120,144]){
  let state=createLongitudinalState(1),heldForce=0;
  for(let frame=0;frame<fps*2;frame++){
   const r=stepLongitudinal(state,{gear:1,engineStarted:true,throttle:0,gasPressed:true,shiftPressed:true,brake:0,handbrake:false},{...ctx,slopeAlongCar:0,elapsedFrames:60/fps});
   heldForce=driveForceForAudio(heldForce,r.engineForce,state.pendingFrames,60/fps);state=r;
   if(frame>fps/2)assert(hasMotorDrive(true,1,r.targetThrottle,heldForce,0,false),`${id} keyboard drive cannot flicker at ${fps} Hz`);
  }
 }
 const outside=motorMix(5,.3,false,true,insulation),inside=motorMix(5,.3,true,true,insulation);
 assert(inside.gain<outside.gain&&inside.cutoff<outside.cutoff);
 assert.equal(motorMix(10,0,false,true).gain,0,'no idle floor while coasting');
 assert(motorMix(20,1,false,true).frequency<140,'fundamental never reaches old 700 Hz whine');
 const ext=roadMix(2,false,3,insulation),cab=roadMix(2,true,3,insulation);
 assert(cab.gain/ext.gain<=.3 && cab.gain/ext.gain>=.19&&cab.cutoff<ext.cutoff,'strong cabin tyre attenuation');
 assert(roadMix(.2,false).grainDepth>.6&&roadMix(4,false).grainDepth===0,'low-speed grains merge at speed');
 assert.equal(roadMix(0,false).gain,0);assert.equal(roadMix(4,false,3).gain,roadMix(-4,false,3).gain,'reverse coast rolls identically');
 report.push({id,cabinRoadAmplitudeRatio:cab.gain/ext.gain,driveToneHz:inside.frequency,cabinMotorGain:inside.gain});
}
// Exercise production WebAudio node wiring/scheduling, not a duplicated mixer.
class Param {value=0;setTargetAtTime(v:number){this.value=v;}setValueAtTime(v:number){this.value=v;}exponentialRampToValueAtTime(v:number){this.value=v;}}
class Node {next:Node[]=[];connect(n:Node){this.next.push(n);return n;}disconnect(){}}
class Gain extends Node {gain=new Param();}
class Filter extends Node {frequency=new Param();Q=new Param();type='';}
class Source extends Node {playbackRate=new Param();buffer:any;loop=false;stopped=false;start(){}stop(){this.stopped=true;}}
const sources:Source[]=[],masters:Gain[]=[];
const context={currentTime:0,destination:new Node(),createGain(){const g=new Gain();masters.push(g);return g;},createBufferSource(){const s=new Source();sources.push(s);return s;},
 createBiquadFilter(){return new Filter();},createDynamicsCompressor(){return Object.assign(new Node(),{threshold:new Param(),knee:new Param(),ratio:new Param(),attack:new Param(),release:new Param()});},
 decodeAudioData:async()=>({duration:2})} as unknown as AudioContext;
const realFetch=globalThis.fetch;globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)}) as Response;
await initRecordingAudio(context);globalThis.fetch=realFetch;
const params:RecordingAudioParams={enabled:true,paused:false,engineOn:true,electric:true,cabin:false,rpm:4000,redlineRpm:10000,throttle:0,speedAbs:2,surface:'asphalt',skid:0,volume:.6,distanceM:3};
updateRecordingAudio(params);
const roadFilter=sources[2].next[0] as Filter,roadGain=roadFilter.next[0] as Gain;
assert.equal(roadFilter.type,'lowpass','recording is no longer a highpass hiss');
const external=roadGain.gain.value,cutoff=roadFilter.frequency.value;
assert(external>0,'coasting plays actual road recording');
updateRecordingAudio({...params,cabin:true});assert(roadGain.gain.value<external*.3&&roadFilter.frequency.value<cutoff);
updateRecordingAudio({...params,speedAbs:0});assert.equal(roadGain.gain.value,0,'stationary recordings silent');
const initialCount=sources.length;
updateRecordingAudio(params);assert.equal(sources.length,initialCount,'steady power state never repeats the startup');
const initialStart=sources.at(-1)!;assert.equal(initialStart.loop,false,'ignition must be one-shot');
updateRecordingAudio({...params,engineSoundEnabled:false});assert(initialStart.stopped,'disabling engine sound stops the current startup clip');
updateRecordingAudio(params);assert.equal(sources.length,initialCount,'re-enabling sound does not replay startup');
updateRecordingAudio({...params,engineOn:false});assert.equal(sources.length,initialCount+1,'EV shutdown has its own clip');assert(initialStart.stopped);
const evStop=sources.at(-1)!.buffer;
updateRecordingAudio({...params,electric:false});assert.equal(sources.length,initialCount+2,'fuel startup has its own clip');assert.notEqual(sources.at(-1)!.buffer,evStop);
updateRecordingAudio({...params,electric:false,engineOn:false});assert.equal(sources.length,initialCount+3,'fuel shutdown has its own clip');
updateRecordingAudio({...params,engineSoundEnabled:false});assert.equal(sources.length,initialCount+3,'disabled engine events stay silent');
updateRecordingAudio({...params,paused:true});assert.equal(masters[0].gain.value,0,'pause silences all recordings');
setRecordingAudioFocus(false);updateRecordingAudio(params);assert.equal(masters[0].gain.value,0,'frame update cannot undo focus mute');
disposeRecordingAudio();
fs.mkdirSync('docs/round23',{recursive:true});fs.writeFileSync('docs/round23/audio-regression.json',JSON.stringify(report,null,2));
console.log('All garage powertrains + one-shot ignition: driven/coasting/reverse/brake gating + cabin isolation + granular road + production audio graph/lifecycle PASS',report);
