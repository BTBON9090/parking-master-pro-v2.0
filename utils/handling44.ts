import {CarType,type CarConfig} from '../types';
/** Gameplay aero coefficients, not manufacturer wind-tunnel measurements. */
export function aeroGripScale(car:CarConfig,speedMps:number){
 const area=car.id===CarType.REVUELTO?2.8:car.id===CarType.VEYRON?1.9:car.id===CarType.SPORTS?2.2:0;
 return 1+Math.min(.65,.5*1.225*area*speedMps*speedMps/(car.weight*9.80665));
}
/** Every knuckle intersects the same turn centre, including intermediate axles. */
export function multiAxleSteer(x:number,z:number,frontZ:number,rearZ:number,front:number,rear:number){
 const curvature=(Math.tan(front)-Math.tan(rear))/Math.max(1,frontZ-rearZ);
 return Math.atan((Math.tan(rear)+(z-rearZ)*curvature)/Math.max(.25,1+x*curvature));
}
