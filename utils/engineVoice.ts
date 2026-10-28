import {CarType} from '../types';
/** Low-frequency combustion pulses, not a fixed-frequency electric buzz.
 * Original synthesis, calibrated character rather than manufacturer recordings. */
export class EngineVoice {
 private osc:OscillatorNode;private gain:GainNode;private filter:BiquadFilterNode;
 constructor(private ctx:AudioContext,destination:AudioNode){
  this.osc=ctx.createOscillator();this.gain=ctx.createGain();this.filter=ctx.createBiquadFilter();
  const real=new Float32Array(16),imag=new Float32Array(16);
  for(let i=1;i<16;i++)imag[i]=Math.exp(-i*.30)/i;
  this.osc.setPeriodicWave(ctx.createPeriodicWave(real,imag));
  this.filter.type='lowpass';this.filter.Q.value=.5;this.gain.gain.value=0;
  this.osc.connect(this.filter);this.filter.connect(this.gain);this.gain.connect(destination);this.osc.start();
 }
 update(id:CarType,rpm:number,load:number,enabled:boolean,cabin=false,volume=1,electric=false){
  const single=id===CarType.TRIKE,cyl=single?1:id===CarType.TRACTOR?4:id===CarType.MINING?20:id===CarType.REVUELTO?12:id===CarType.VEYRON?16:6;
  const t=this.ctx.currentTime;
  this.osc.frequency.setTargetAtTime(electric?92+Math.max(0,rpm)*.012:Math.max(7,rpm*cyl/120),t,.07);
  this.filter.frequency.setTargetAtTime(electric?360:cabin?430:single?760:620,t,.1);
  this.gain.gain.setTargetAtTime(enabled?volume*(electric?.022:single?.17:.12)*(.65+load*.35)*(cabin?.8:1):0,t,.08);
 }
 dispose(){try{this.osc.stop();}catch{}this.osc.disconnect();this.filter.disconnect();this.gain.disconnect();}
}
