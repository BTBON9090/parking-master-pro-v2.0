import type {HoodCameraAdjustment} from '../types';

/** Player-selected first-person eye offsets, not physical seat geometry. */
export interface DriverSeatAdjustment { forwardCm:number; heightCm:number; pitchDeg:number }
export const DEFAULT_DRIVER_SEAT:DriverSeatAdjustment={forwardCm:0,heightCm:0,pitchDeg:0};
// Keep the adjustable eye near each authored driver position. Game models use
// 10 scene units per metre, so 10 cm is one scene unit.
export const DRIVER_SEAT_LIMITS={forwardCm:[-50,50],heightCm:[-40,60],pitchDeg:[-30,30]} as const;
export function normalizeDriverSeat(value:Partial<DriverSeatAdjustment>|null|undefined):DriverSeatAdjustment {
 const result={...DEFAULT_DRIVER_SEAT};
 for(const key of Object.keys(result) as (keyof DriverSeatAdjustment)[]){const candidate=value?.[key];const [min,max]=DRIVER_SEAT_LIMITS[key];result[key]=typeof candidate==='number'&&Number.isFinite(candidate)?Math.max(min,Math.min(max,candidate)):0;}
 return result;
}
/** Compose user offsets with the existing per-vehicle and tuning calibration. */
export function applyDriverSeatToCamera(tune:HoodCameraAdjustment,seat:Partial<DriverSeatAdjustment>|null|undefined):HoodCameraAdjustment {
 const a=normalizeDriverSeat(seat);
 return {...tune,forward:tune.forward+a.forwardCm/10,height:tune.height+a.heightCm/10,pitch:tune.pitch+a.pitchDeg};
}
