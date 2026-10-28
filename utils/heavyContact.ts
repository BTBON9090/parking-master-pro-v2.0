import {CarType,type CarConfig,type Obstacle} from '../types';
/** Arcade damage calibration, not an engineering crushworthiness prediction. */
export function heavyCrushEligible(car:CarConfig,other:Obstacle){
 return [CarType.TRACTOR,CarType.MINING,CarType.TYPE100].includes(car.id)&&other.type==='car'&&!other.ai&&car.weight>other.weight*3.2&&other.height<65&&other.width<26;
}
export function crushedCarSupport(o:Obstacle,x:number,y:number){
 if(!o.crushed)return -Infinity;
 const dx=x-o.x,dy=y-o.y,c=Math.cos(o.rotation),s=Math.sin(o.rotation);
 const u=Math.abs(dx*c+dy*s),v=Math.abs(-dx*s+dy*c);
 const rise=Math.min((o.height/2-u)/12,(o.width/2-v)/7);
 if(rise<=0)return -Infinity;
 const t=Math.min(1,rise),smooth=t*t*(3-2*t);
 return (o.elevation??0)+(o.verticalHeight??14)*smooth;
}
