import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {MissileRecordingAudio} from '../utils/missileRecordingAudio';

for(const name of ['launch','flight','impact']) assert(existsSync(`public/audio/missile-${name}.wav`), `${name} recording must be bundled`);
const requested:string[]=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=(async (url:RequestInfo|URL)=>{requested.push(String(url));return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)} as Response;}) as typeof fetch;
const sources:Array<{loop:boolean;stopped:boolean;started:boolean;buffer:unknown;onended:(()=>void)|null;connect:()=>void;disconnect:()=>void;start:()=>void;stop:()=>void}>=[];
const gains:Array<{gain:{value:number;setTargetAtTime:(v:number)=>void};connect:()=>void;disconnect:()=>void}>=[];
const ctx={state:'running',currentTime:1,destination:{},decodeAudioData:async()=>({}),createBufferSource:()=>{const s={loop:false,stopped:false,started:false,buffer:null as unknown,onended:null as (()=>void)|null,connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;this.onended?.();}};sources.push(s);return s;},createGain:()=>{const g={gain:{value:0,setTargetAtTime(v:number){this.value=v;}},connect(){},disconnect(){}};gains.push(g);return g;}} as unknown as AudioContext;
const tick=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
try {
 const audio=new MissileRecordingAudio();audio.preload(ctx);await tick();assert.equal(requested.length,3,'preloads recordings once');
 audio.play('launch',ctx,.8);await tick();assert.equal(sources.length,1);assert(!sources[0].loop&&sources[0].started);
 audio.update(ctx,true,.6,.3);await tick();assert.equal(sources.length,2);assert(sources[1].loop&&sources[1].started);
 audio.update(ctx,true,0,0);await tick();assert.equal(sources.length,2,'flight does not restart every frame');assert.equal(gains[1].gain.value,0,'mute applies to active flight');
 audio.update(ctx,false,.6,.3);assert(sources[1].stopped,'flight stops on impact or when flight ends');
 audio.play('impact',ctx,.6);await tick();assert.equal(sources.length,3);assert(!sources[2].loop);
 audio.dispose();assert(sources[0].stopped&&sources[2].stopped,'disposing stops one-shot voices');
 console.log('Missile recordings PASS: bundled clips, preload, flight loop, mute, stop and disposal');
} finally { globalThis.fetch=originalFetch; }
