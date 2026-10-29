import {CarType,type CarConfig} from '../types';
import {assetUrl} from './assetUrl';
import {EngineVoice} from './engineVoice';
import {isElectricVehicle} from './powertrain';
import {AudioPlaybackGate} from './audioPlaybackGate';
/** A private preview context: no live-game loop, gain or lifecycle is shared. */
export function startGarageAudio(car:CarConfig,options:{enabled?:boolean;volume?:number}={}){
 const volume=Math.min(1,Math.max(0,options.volume??1));
 if(options.enabled===false||volume===0)return()=>{};
 const Context=window.AudioContext||(window as any).webkitAudioContext;
 if(!Context)return()=>{};
 let context:AudioContext;
 try{context=new Context();}catch{return()=>{};}
 const gate=new AudioPlaybackGate(context),abort=new AbortController();
 const sources:AudioBufferSourceNode[]=[];let disposed=false;
 const electric=isElectricVehicle(car.id),mechanical=[CarType.TRIKE,CarType.TRACTOR,CarType.TYPE100,CarType.MINING].includes(car.id);
 const voice=mechanical||electric?new EngineVoice(context,context.destination):null;
 const refresh=(event?:Event)=>gate.setActive(!disposed&&!document.hidden&&document.hasFocus(),!!event?.isTrusted);
 const blur=()=>gate.setActive(false);
 window.addEventListener('pointerdown',refresh);window.addEventListener('keydown',refresh);
 window.addEventListener('focus',refresh);window.addEventListener('blur',blur);
 document.addEventListener('visibilitychange',refresh);refresh();
 voice?.update(car.id,car.dynamics.transmission.idleRpm||1000,.15,true,false,.6*volume,electric);
 const sample=async(file:string,loop:boolean,gainValue:number)=>{
  try{
   const response=await fetch(assetUrl('audio/'+file),{signal:abort.signal});if(!response.ok)return;
   const buffer=await context.decodeAudioData(await response.arrayBuffer());if(disposed)return;
   const source=context.createBufferSource(),gain=context.createGain(),filter=context.createBiquadFilter();
   source.buffer=buffer;source.loop=loop;gain.gain.value=gainValue*volume;filter.type='lowpass';filter.frequency.value=1500;
   source.connect(filter);filter.connect(gain);gain.connect(context.destination);sources.push(source);
   source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};source.start();
  }catch{/* Leaving the browser cancels in-flight previews. */}
 };
 void sample(electric?'ev-start.wav':'ice-start.wav',false,.32);
 if(!electric&&!mechanical)void sample('engine-idle-loop.wav',true,.15);
 return()=>{
  disposed=true;abort.abort();gate.dispose();
  window.removeEventListener('pointerdown',refresh);window.removeEventListener('keydown',refresh);
  window.removeEventListener('focus',refresh);window.removeEventListener('blur',blur);
  document.removeEventListener('visibilitychange',refresh);
  sources.forEach(s=>{try{s.stop();}catch{}s.disconnect();});voice?.dispose();void context.close().catch(()=>{});
 };
}
