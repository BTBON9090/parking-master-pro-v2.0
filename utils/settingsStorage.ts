import type {UserSettings} from '../types';
export const SETTINGS_KEY='parking-master-settings-v1';
// Copy only known keys and matching primitive types. New settings keep their defaults.
function mergeKnown(defaults:any,saved:any):any {
 if(defaults===null||typeof defaults!=='object'){
  return typeof saved===typeof defaults && (typeof saved!=='number'||Number.isFinite(saved))?saved:defaults;
 }
 return Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,mergeKnown(value,saved?.[key])]));
}
export function restoreSettings(defaults:UserSettings,raw:string|null):UserSettings {
 try {
  const result=mergeKnown(defaults,JSON.parse(raw??'null')) as UserSettings;
  if(!['auto','low','medium','high','ultra'].includes(result.renderQuality??''))result.renderQuality='auto';
  for(const key of ['volume','cabinVolume','exteriorVolume'] as const)result[key]=Math.max(0,Math.min(1,result[key]??1));
  result.steeringSensitivity=Math.max(0,Math.min(3,result.steeringSensitivity));
  return result;
 }catch{return defaults;}
}
export function loadSettings(defaults:UserSettings):UserSettings {
 try{return restoreSettings(defaults,localStorage.getItem(SETTINGS_KEY));}catch{return defaults;}
}
export function saveSettings(settings:UserSettings){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{/* Storage can be unavailable in private mode. */}}
