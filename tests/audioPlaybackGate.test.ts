import assert from 'node:assert/strict';
import {AudioPlaybackGate} from '../utils/audioPlaybackGate';
import {startGarageAudio} from '../utils/garageAudio';
import {CAR_MODELS} from '../constants';
import {CarType} from '../types';

const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
// Hold an actual transition pending to reproduce the pause/resume ordering
// issue. Backgrounding wins even when a prior resume resolves later.
let finish:()=>void=()=>{},resumes=0,suspends=0;
const slow={state:'suspended',resume(){resumes++;return new Promise<void>(r=>{finish=()=>{slow.state='running';r();};});},
  suspend(){suspends++;slow.state='suspended';return Promise.resolve();}};
const gate=new AudioPlaybackGate(slow as Pick<AudioContext,'state'|'resume'|'suspend'>);
gate.setActive(true);gate.setActive(false);gate.setActive(false);
assert.equal(resumes,1);finish();await settle();assert(suspends<=2,'late resume needs at most one corrective suspend');assert.equal(slow.state,'suspended');
const suspendCount=suspends;gate.setActive(true);gate.dispose();finish();await settle();assert.equal(suspends,suspendCount,'dispose prevents later context operations');
let finishSuspend:()=>void=()=>{};
const delayedSuspend={state:'running',resume(){delayedSuspend.state='running';return Promise.resolve();},suspend(){delayedSuspend.state='suspended';return new Promise<void>(r=>{finishSuspend=r;});}};
const unpauseGate=new AudioPlaybackGate(delayedSuspend as Pick<AudioContext,'state'|'resume'|'suspend'>);
unpauseGate.setActive(false);unpauseGate.setActive(true);await settle();
assert.equal(delayedSuspend.state,'running','resume is not blocked behind a pending suspend');finishSuspend();await settle();unpauseGate.dispose();
let rejected=0;
const denied={state:'suspended',resume(){rejected++;return Promise.reject(new Error('autoplay denied'));},suspend(){return Promise.resolve();}};
const deniedGate=new AudioPlaybackGate(denied as Pick<AudioContext,'state'|'resume'|'suspend'>);
deniedGate.setActive(true);await settle();assert.equal(rejected,1,'no busy retry after rejection');
deniedGate.setActive(true);await settle();assert.equal(rejected,2,'new gesture can retry');deniedGate.dispose();
let unlocks:(()=>void)[]=[],attempts=0;
const awaitingGesture={state:'suspended',resume(){attempts++;const promise=new Promise<void>(r=>unlocks.push(r));if(attempts>1){awaitingGesture.state='running';unlocks.forEach(r=>r());}return promise;},suspend(){awaitingGesture.state='suspended';return Promise.resolve();}};
const unlockGate=new AudioPlaybackGate(awaitingGesture as Pick<AudioContext,'state'|'resume'|'suspend'>);
unlockGate.setActive(true);unlockGate.setActive(true);assert.equal(attempts,1,'no duplicate resume without input');
unlockGate.setActive(true,true);await settle();assert.equal(awaitingGesture.state,'running','trusted input unlocks pending autoplay resume');
unlockGate.setActive(false);await settle();assert.equal(awaitingGesture.state,'suspended');unlockGate.dispose();

// Exercise the real garage lifecycle with a tiny WebAudio host. No audio
// device or browser is needed; assertions inspect resource creation/teardown.
class Host extends EventTarget {hidden=false;focused=true;hasFocus(){return this.focused;}AudioContext:any;}
class Node {connect(n:Node){return n;}disconnect(){}gain={value:0};frequency={value:0};Q={value:0};type='';}
class Source extends Node {buffer:unknown;loop=false;stopped=false;onended:(()=>void)|null=null;start(){}stop(){this.stopped=true;this.onended?.();}}
const contexts:Context[]=[],sources:Source[]=[],gains:Node[]=[];
class Context {
  state='running';currentTime=0;destination=new Node();suspends=0;resumes=0;
  constructor(){contexts.push(this);}
  resume(){this.resumes++;this.state='running';return Promise.resolve();}
  suspend(){this.suspends++;this.state='suspended';return Promise.resolve();}
  close(){this.state='closed';return Promise.resolve();}
  createGain(){const n=new Node();gains.push(n);return n;}
  createBiquadFilter(){return new Node();}
  createBufferSource(){const n=new Source();sources.push(n);return n;}
  decodeAudioData(){return Promise.resolve({duration:2});}
}
const host=new Host(),doc=new Host();host.AudioContext=Context;
const originals={window:Object.getOwnPropertyDescriptor(globalThis,'window'),document:Object.getOwnPropertyDescriptor(globalThis,'document'),fetch:globalThis.fetch};
Object.defineProperty(globalThis,'window',{configurable:true,value:host});
Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
let fetches=0;
globalThis.fetch=async()=>{fetches++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(0)} as Response;};
try{
  const cfg=CAR_MODELS[CarType.MIDIBUS];
  startGarageAudio(cfg,{enabled:false})();startGarageAudio(cfg,{volume:0})();
  assert.equal(contexts.length,0,'muted preview allocates no context');assert.equal(fetches,0,'muted preview fetches no clips');
  const stop=startGarageAudio(cfg,{volume:.4});await settle();
  assert.equal(contexts.length,1);assert.equal(sources.length,2);assert.equal(fetches,2);
  assert(gains.some(g=>Math.abs(g.gain.value-.15*.4)<1e-6),'preview respects the user volume');
  const ctx=contexts[0];doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));await settle();
  assert.equal(ctx.state,'suspended');
  host.dispatchEvent(new Event('pointerdown'));await settle();assert.equal(ctx.resumes,0,'hidden pointer cannot restart audio');
  doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));await settle();assert.equal(ctx.state,'running');
  doc.focused=false;host.dispatchEvent(new Event('blur'));await settle();assert.equal(ctx.state,'suspended');
  stop();assert.equal(ctx.state,'closed');assert(sources.every(s=>s.stopped));
  const previousResumes=ctx.resumes;doc.focused=true;host.dispatchEvent(new Event('focus'));await settle();
  assert.equal(ctx.resumes,previousResumes,'removed preview no longer responds to focus');
  // Leaving during decode must not create late sources on a closed context.
  const previousSources=sources.length,stopEarly=startGarageAudio(cfg);stopEarly();await settle();
  assert.equal(sources.length,previousSources);assert.equal(contexts[1].state,'closed');
}finally{
  globalThis.fetch=originals.fetch;
  for(const key of ['window','document'] as const){const descriptor=originals[key];if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}
}
console.log('Audio lifecycle PASS: muted allocation-free preview, volume, hidden/focus suspension, teardown, late decode, latest-demand resume/pause and autoplay retry.');
