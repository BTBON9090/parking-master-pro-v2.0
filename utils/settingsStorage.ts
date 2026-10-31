import {sanitizeHudLayout} from './mobileLayout';
import {normalizeDriverSeat} from './driverSeat';
import {DayTime, CarType, type UserSettings} from '../types';
export const SETTINGS_KEY='parking-master-settings-v1';
// Copy only known keys and matching primitive types. New settings keep their defaults.
function mergeKnown(defaults:any,saved:any):any {
 if(defaults===null||typeof defaults!=='object'){
  return typeof saved===typeof defaults && (typeof saved!=='number'||Number.isFinite(saved))?saved:defaults;
 }
 return Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,mergeKnown(value,saved?.[key])]));
}
export function restoreSettings(defaults:UserSettings,raw:string|null,legacyCar?:CarType):UserSettings {
 try {
  const saved=JSON.parse(raw??'null');
  const result=mergeKnown(defaults,saved) as UserSettings;
  result.mobileHudLayout=sanitizeHudLayout(saved?.mobileHudLayout);
  if (defaults.driverSeatAdjustment) result.driverSeatAdjustment=normalizeDriverSeat(result.driverSeatAdjustment);
  const seats:NonNullable<UserSettings['driverSeatAdjustments']>={};
  if(saved?.driverSeatAdjustments&&typeof saved.driverSeatAdjustments==='object') {
   for(const car of Object.values(CarType)) if(saved.driverSeatAdjustments[car]) seats[car]=normalizeDriverSeat(saved.driverSeatAdjustments[car]);
  } else if(legacyCar&&saved?.driverSeatAdjustment) seats[legacyCar]=normalizeDriverSeat(saved.driverSeatAdjustment);
  result.driverSeatAdjustments=seats;
  if(result.dayTime !== DayTime.DAY && result.dayTime !== DayTime.NIGHT) result.dayTime=DayTime.DAY;
  if(!['auto','low','medium','high','ultra'].includes(result.renderQuality??''))result.renderQuality='auto';
  for(const key of ['volume','cabinVolume','exteriorVolume'] as const)result[key]=Math.max(0,Math.min(1,result[key]??1));
  result.steeringSensitivity=Math.max(0,Math.min(3,result.steeringSensitivity));
  return result;
 }catch{return defaults;}
}
export function loadSettings(defaults:UserSettings,legacyCar?:CarType):UserSettings {
 try{return restoreSettings(defaults,localStorage.getItem(SETTINGS_KEY),legacyCar);}catch{return defaults;}
}
export function saveSettings(settings:UserSettings){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{/* Storage can be unavailable in private mode. */}}
