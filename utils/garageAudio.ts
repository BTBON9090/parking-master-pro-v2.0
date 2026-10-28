import {CarType,type CarConfig} from '../types';
import {assetUrl} from './assetUrl';
import {EngineVoice} from './engineVoice';
import {isElectricVehicle} from './powertrain';
/** A private preview context: no live-game loop, gain or lifecycle is shared. */
export function startGarageAudio(car:CarConfig){
 const context=new AudioContext(),voice=new EngineVoice(context,context.destination),abort=new AbortController();
 const sources:AudioBufferSourceNode[]=[];let disposed=false;
 const electric=isElectricVehicle(car.id),mechanical=[CarType.TRIKE,CarType.TRACTOR,CarType.TYPE100,CarType.MINING].includes(car.id);
 const resume=()=>void context.resume().catch(()=>{});window.addEventListener('pointerdown',resume);resume();
 if(mechanical||electric)voice.update(car.id,car.dynamics.transmission.idleRpm||1000,.15,true,false,.6,electric);
 const sample=async(file:string,loop:boolean,gainValue:number)=>{
  try{
   const response=await fetch(assetUrl('audio/'+file),{signal:abort.signal});if(!response.ok)return;
   const buffer=await context.decodeAudioData(await response.arrayBuffer());if(disposed)return;
   const source=context.createBufferSource(),gain=context.createGain(),filter=context.createBiquadFilter();
   source.buffer=buffer;source.loop=loop;gain.gain.value=gainValue;filter.type='lowpass';filter.frequency.value=1500;
   source.connect(filter);filter.connect(gain);gain.connect(context.destination);sources.push(source);
   source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};source.start();
  }catch{/* Leaving the browser cancels in-flight previews. */}
 };
 void sample(electric?'ev-start.wav':'ice-start.wav',false,.32);
 if(!electric&&!mechanical)void sample('engine-idle-loop.wav',true,.15);
 return()=>{disposed=true;abort.abort();window.removeEventListener('pointerdown',resume);sources.forEach(s=>{try{s.stop();}catch{}s.disconnect();});voice.dispose();void context.close().catch(()=>{});};
}
