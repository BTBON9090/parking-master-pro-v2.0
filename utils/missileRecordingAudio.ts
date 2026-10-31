import {assetUrl} from './assetUrl';

type MissileClip='launch'|'flight'|'impact';
const clips:Record<MissileClip,string>={launch:'/audio/missile-launch.wav',flight:'/audio/missile-flight.wav',impact:'/audio/missile-impact.wav'};
/** Real recorded effects are kept separate from the vehicle's procedural motor. */
export class MissileRecordingAudio {
 private context:AudioContext|null=null;
 private buffers=new Map<MissileClip,AudioBuffer>();
 private loading=new Map<MissileClip,Promise<AudioBuffer|null>>();
 private failed=new Set<MissileClip>();
 private voices=new Set<{source:AudioBufferSourceNode;gain:GainNode;kind:MissileClip}>();
 private flight:AudioBufferSourceNode|null=null;
 private generation=0;
 private disposed=false;
 private volume=0;
 private flightVolume=0;
 private flying=false;
 private bind(context:AudioContext){
  if(this.disposed||context.state==='closed')return false;
  if(this.context!==context){this.stopVoices();this.context=context;this.buffers.clear();this.loading.clear();this.failed.clear();this.generation++;}
  return true;
 }
 private load(kind:MissileClip,context:AudioContext){
  const buffer=this.buffers.get(kind);if(buffer)return Promise.resolve(buffer);
  if(this.failed.has(kind))return Promise.resolve(null);
  const prior=this.loading.get(kind);if(prior)return prior;
  const generation=this.generation;
  const promise=fetch(assetUrl(clips[kind])).then(r=>{if(!r.ok)throw Error(`missile audio ${kind}: ${r.status}`);return r.arrayBuffer();})
   .then(data=>context.decodeAudioData(data)).then(decoded=>{
    if(this.disposed||generation!==this.generation||this.context!==context)return null;
    this.buffers.set(kind,decoded);return decoded;
   }).catch(error=>{if(!this.disposed&&generation===this.generation){this.failed.add(kind);console.warn('Missile recording unavailable',kind,error);}return null;})
   .finally(()=>{if(generation===this.generation)this.loading.delete(kind);});
  this.loading.set(kind,promise);return promise;
 }
 preload(context:AudioContext){if(this.bind(context))for(const kind of Object.keys(clips) as MissileClip[])void this.load(kind,context);}
 private start(context:AudioContext,kind:MissileClip,buffer:AudioBuffer){
  const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;source.loop=kind==='flight';gain.gain.value=kind==='flight'?this.flightVolume:this.volume;
  source.connect(gain);gain.connect(context.destination);const voice={source,gain,kind};this.voices.add(voice);
  source.onended=()=>{this.voices.delete(voice);if(this.flight===source)this.flight=null;source.disconnect();gain.disconnect();};
  source.start();if(kind==='flight')this.flight=source;
 }
 play(kind:'launch'|'impact',context:AudioContext,volume:number){
  if(!this.bind(context))return;this.volume=volume;const generation=this.generation,started=context.currentTime;
  void this.load(kind,context).then(buffer=>{if(buffer&&!this.disposed&&generation===this.generation&&this.context===context&&context.state!=='closed'&&context.currentTime-started<2)this.start(context,kind,buffer);});
 }
 update(context:AudioContext|null,flying:boolean,volume:number,flightVolume:number){
  this.flying=flying;this.volume=Math.max(0,volume);this.flightVolume=Math.max(0,flightVolume);
  if(!context||!this.bind(context)){this.stopVoices();this.context=null;return;}
  this.preload(context);
  for(const voice of this.voices)voice.gain.gain.setTargetAtTime(voice.kind==='flight'?this.flightVolume:this.volume,context.currentTime,.12);
  if(!flying&&this.flight){try{this.flight.stop();}catch{}this.flight=null;}
  if(flying&&!this.flight){const generation=this.generation;void this.load('flight',context).then(buffer=>{if(buffer&&this.flying&&!this.flight&&!this.disposed&&generation===this.generation&&this.context===context&&context.state!=='closed')this.start(context,'flight',buffer);});}
 }
 private stopVoices(){for(const voice of this.voices){try{voice.source.stop();}catch{}voice.source.disconnect();voice.gain.disconnect();}this.voices.clear();this.flight=null;}
 dispose(){this.disposed=true;this.generation++;this.stopVoices();this.buffers.clear();this.loading.clear();this.context=null;}
}
