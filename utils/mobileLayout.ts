import type {CSSProperties} from 'react';
import {CarType} from '../types';
export const HUD_NAMES={steer:'转向区域',gas:'油门',brake:'刹车',gears:'挡位',dashboard:'仪表盘',mirrorLeft:'左后视镜',mirrorRight:'右后视镜',mirrorCentre:'顶部后视镜',topbar:'常用操作',aux:'灯光与制动'} as const;
export type HudId=keyof typeof HUD_NAMES;
export type HudRect={x:number;y:number;width:number;height:number};
export type HudLayout=Partial<Record<HudId,HudRect>>;
export const isBus=(car:CarType)=>[CarType.COACH,CarType.MIDIBUS,CarType.VAN,CarType.LIGHT_TRUCK,CarType.SEMI,CarType.US22,CarType.MINING].includes(car);
export function clampRect(r:HudRect):HudRect{
 const width=Math.max(.035,Math.min(.8,r.width)),height=Math.max(.04,Math.min(.8,r.height));
 return {width,height,x:Math.max(0,Math.min(1-width,r.x)),y:Math.max(0,Math.min(1-height,r.y))};
}
export function sanitizeHudLayout(saved:unknown):HudLayout{
 if(!saved||typeof saved!=='object')return {};
 const result:HudLayout={};
 for(const id of Object.keys(HUD_NAMES) as HudId[]){const r=(saved as HudLayout)[id];if(r&&[r.x,r.y,r.width,r.height].every(v=>typeof v==='number'&&Number.isFinite(v)))result[id]=clampRect(r);}
 return result;
}
export function resolveHudLayout(w:number,h:number,bus:boolean,saved:HudLayout={}):Record<HudId,HudRect>{
 const px=(x:number,y:number,width:number,height:number)=>clampRect({x:x/w,y:y/h,width:width/w,height:height/h});
 const pedal=Math.min(94,Math.max(66,h*.21)),gap=10,cluster=Math.min(300,w*.28),clusterH=cluster*190/422;
 const steerSize=Math.min(Math.max(136,(w*.5-124)*.75),h*.53-10);
 const sideW=bus?Math.min(72,h*.18):Math.min(158,w*.18),sideH=bus?sideW*1.65:sideW/2.65;
 const result:Record<HudId,HudRect>={
  steer:px(12,h-steerSize-10,steerSize,steerSize),
  gas:px(w-pedal-14,h-pedal-12,pedal,pedal),brake:px(w-pedal*2-gap-14,h-pedal-12,pedal,pedal),
  gears:px(w-pedal*2-gap-14,h-pedal-53,pedal*2+gap,34),
  dashboard:px((w-cluster)/2,h-clusterH-7,cluster,clusterH),
  mirrorLeft:px(12,62,sideW,sideH),mirrorRight:px(w-sideW-12,62,sideW,sideH),
  mirrorCentre:px(w*.5-Math.min(190,w*.23)/2,0,Math.min(190,w*.23),Math.min(190,w*.23)/3.7),
  topbar:px(12,8,176,42),aux:px(w-222,8,210,42),
 };
 for(const id of Object.keys(result) as HudId[])if(saved[id])result[id]=clampRect(saved[id]!);
 return result;
}
export function hudStyle(r:HudRect,w:number,h:number):CSSProperties{
 return {'--hud-x':r.x*w+'px','--hud-y':r.y*h+'px','--hud-w':r.width*w+'px','--hud-h':r.height*h+'px'} as CSSProperties;
}
