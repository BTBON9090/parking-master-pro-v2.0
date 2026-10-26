import type {MirrorAdjustment,MirrorId} from '../types';
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
/** Mirror images are horizontally reflected. Side yaw is outward-positive on
 * each side, while centre yaw is right-positive in local camera space. */
export function dragMirror(id:MirrorId,start:MirrorAdjustment,dx:number,dy:number){
 return {...start,yaw:clamp(start.yaw+dx*.10*(id==='right'?-1:1),-25,25),pitch:clamp(start.pitch-dy*.10,-18,18)};
}
