import type {DriveLayout} from '../types';

/** Approximate airborne wheel angular inertia for visuals. Grounded motion remains
 * coupled to measured travel; this is not a per-wheel contact-force solver. */
export function stepAirborneWheelSpin(omega:number, dt:number, driven:boolean, throttle:number, direction:number, braking:boolean):number {
 const seconds=Math.max(0,Math.min(.1,dt));
 const target=driven&&!braking?Math.max(0,Math.min(1,throttle))*Math.sign(direction)*18:0;
 const response=driven&&throttle>0&&!braking?1.8:braking?9:.45;
 return omega+(target-omega)*(1-Math.exp(-response*seconds));
}
export function isDrivenWheel(layout:DriveLayout, isFront:boolean):boolean {
 return layout==='AWD'||(layout==='FWD'&&isFront)||(layout==='RWD'&&!isFront);
}
/** Positive wheel input has the same yaw convention as wheeled cars. */
export function trackedYawRate(steeringWheelAngle:number,wheelMaxDeg:number,throttle:number,gear:number,drive:boolean):number {
 if(!drive)return 0;
 return steeringWheelAngle/Math.max(1,wheelMaxDeg)*Math.min(.52,.14+throttle*.42)*(gear<0?-1:1);
}

/** Missing telemetry occurs briefly during initialization or rig replacement.
 * Prefer chassis airborne state to inventing an airborne individual wheel. */
export function wheelGroundedFromTelemetry(contacts:readonly boolean[],index:number,airborne:boolean,overturned:boolean):boolean {
 return !overturned && (contacts[index] ?? !airborne);
}
