import {CarType,type CarConfig} from '../types';
import type {ExperimentalContacts} from './experimentalDrivetrain';
export interface WheelSample {x:number;y:number;normalN:number;grounded:boolean}
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const finite=(n:number,fallback:number)=>Number.isFinite(n)?n:fallback;
/** Deliberately available only to local Vite development sessions. */
export function experimentalDriveEnabled(dev:boolean,search:string,id:CarType,wheelCount:number):boolean {
 return dev&&new URLSearchParams(search).get('experimentalDrive')==='1'&&wheelCount===4
   &&[CarType.MINI,CarType.SEAL08,CarType.TRUCK].includes(id);
}
/** The suspension's last completed fixed frame supplies world contact and
 * normal load. Ground materials are sampled separately at each contact.
 * cornerBudget is a conservative aggregate limit, not a full friction circle. */
export function experimentalContactsFromSamples(options:{cc:CarConfig; samples:WheelSample[]; radii:number[];previous:ExperimentalContacts|null;speedMs:number;weather:number;cornerBudget:number;sampleSurface:(x:number,y:number)=>number}):ExperimentalContacts {
 const {cc,samples,radii,previous,speedMs}=options;
 if(samples.length!==4||radii.length!==4)throw new Error('experimental bridge requires exactly four contact samples');
 return samples.map((p,i)=>{
  const radius=clamp(finite(radii[i],cc.dynamics.transmission.wheelRadiusM),.05,4);
  const surface=clamp(finite(options.sampleSurface(p.x,p.y),0),0,2);
  return {radius,inertia:1.2,normalN:p.grounded?clamp(finite(p.normalN,0),0,1e8):0,grounded:p.grounded,
   friction:clamp(cc.dynamics.grip*clamp(finite(options.weather,0),0,1)*surface*clamp(finite(options.cornerBudget,0),0,1),0,3),
   omega:previous?finite(previous[i].omega,0):finite(speedMs,0)/radius};
 }) as ExperimentalContacts;
}
