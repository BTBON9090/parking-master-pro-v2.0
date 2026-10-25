/** Quiet stylized EV drive texture, not an OEM recording or an electrical
 * switching-frequency simulation. Speed sets pitch; ACTUAL drive sets level. */
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
export function motorMix(speedAbs:number,throttle:number,cabin:boolean,driving:boolean,insulation=.12) {
 const speed=Math.abs(speedAbs),load=clamp(throttle);
 return {frequency:58+Math.min(speed,12)*5.5,cutoff:cabin?190:330,
  gain:driving&&load>.008 ? .026*Math.sqrt(load)*(cabin?Math.sqrt(insulation):.45):0,
  roadScale:cabin?insulation:1};
}
/** Contact texture advances by distance, so reverse/coasting retain tyre
 * sound. Sparse low-speed grains overlap into a steady bed at higher speed.
 * Coefficients are mix choices, not measured cabin acoustic performance. */
export function roadMix(speedAbs:number,cabin:boolean,distanceM=0,insulation=.12){
 const speed=Math.abs(speedAbs),transition=clamp((speed-.5)/2.5);
 const grainDepth=.7*(1-transition*transition*(3-2*transition));
 const grain=.5+.28*Math.sin(distanceM*23.1)+.14*Math.sin(distanceM*41.7+1.2)+.08*Math.sin(distanceM*67.3+.4);
 const envelope=1-grainDepth+grainDepth*grain;
 return {gain:.22*Math.sqrt(clamp(speed/8))*envelope*(cabin?insulation:1),
  cutoff:cabin?310:1000+Math.min(speed,12)*45,
  rate:.72+clamp(speed/12)*.38,grainDepth,envelope,smoothing:speed<2?.025:.09};
}
export function cabinInsulation(car:string){
 return car==='SUV'?.09:car==='SEAL08'?.11:car==='LI_I9'?.09:car==='N90'?.10:.13;
}
export function hasMotorDrive(engineOn:boolean,gear:number,throttle:number,driveForce:number,brake:number,park:boolean){
 return engineOn&&gear!==0&&throttle>.008&&Math.abs(driveForce)>1e-6&&brake<.02&&!park;
}

/** A render frame without a fixed physics step has no NEW force sample.
 * Hold the last sample instead of amplitude-modulating the motor at 60 Hz.
 * Raw pedal/gear/brake gating still mutes releases immediately. */
export function driveForceForAudio(previous:number,stepForce:number,pendingFrames:number,elapsedFrames:number){
 return pendingFrames+elapsedFrames>=1-1e-9?stepForce:previous;
}
