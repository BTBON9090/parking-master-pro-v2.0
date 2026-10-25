import type {Obstacle} from '../types';
/** Only solid objects on this deck can reach the parking sensors. */
export function sensedObstacle(o:Obstacle,elevation:number,height:number){
 const base=o.elevation??0,top=base+(o.verticalHeight??(o.type==='car'?18:30));
 return ['wall','car','box','cone'].includes(o.type) && top>elevation+1 && base<elevation+height;
}
/** Never sustain a tone. Even contact leaves an audible gap between short pulses. */
export function parkingPulse(distance:number,speedKmh:number,inGear:boolean,stationaryMs:number){
 const enabled=inGear&&speedKmh<15&&distance<15&&stationaryMs<1800;
 return {enabled,intervalMs:260+Math.max(0,Math.min(1,distance/15))*640,duration:.065};
}
