import type {LevelData} from '../types';
export interface MapPortal {id:string;level:number;target:number;label:string;x:number;y:number;elevation:number;heading:number;radius:number;arrival:{x:number;y:number;rotation:number;elevation:number}}
export const MAP_PORTALS:MapPortal[]=[
 {id:'city-garage',level:1,target:6,label:'三层地库 · B1',x:23300,y:19850,elevation:0,heading:Math.PI/2,radius:40,arrival:{x:290,y:242,rotation:0,elevation:-48}},
 {id:'garage-city',level:6,target:1,label:'城市与青岚山',x:175,y:220,elevation:-48,heading:Math.PI,radius:34,arrival:{x:23300,y:19640,rotation:-Math.PI/2,elevation:0}},
 {id:'city-highway',level:1,target:13,label:'环线高速 · 服务区',x:23185,y:19050,elevation:0,heading:-Math.PI/2,radius:40,arrival:{x:9510,y:3770,rotation:-Math.PI/2,elevation:0}},
 {id:'highway-city',level:13,target:1,label:'城市与青岚山',x:9510,y:3940,elevation:0,heading:Math.PI/2,radius:40,arrival:{x:23185,y:19300,rotation:Math.PI/2,elevation:0}},
];
export function portalAt(level:number,pose:{x:number;y:number;elevation:number;rotation:number}){
 return MAP_PORTALS.find(p=>p.level===level&&Math.hypot(pose.x-p.x,pose.y-p.y)<=p.radius&&Math.abs(pose.elevation-p.elevation)<12&&Math.cos(pose.rotation-p.heading)>.5);
}
/** Portal lanes are part of the authored road and share physical side walls. */
export function addMapPortals(level:LevelData){
 const portals=MAP_PORTALS.filter(p=>p.level===level.levelId);if(!portals.length)return level;
 level.roadSurfaces??=[];level.streetSigns??=[];
 for(const p of portals){
  const span=p.level===6?110:p.level===13?620:450;
  const dx=Math.cos(p.heading),dy=Math.sin(p.heading),cx=p.x-dx*span/2,cy=p.y-dy*span/2;
  // Clear only this new road corridor; its geometry replaces any buildings/curbs there.
  const overlaps=(o:{x:number;y:number;width:number;height:number})=>Math.abs(o.x-cx)<(Math.abs(dx)*span+Math.abs(dy)*130+o.width)/2&&Math.abs(o.y-cy)<(Math.abs(dy)*span+Math.abs(dx)*130+o.height)/2;
  if(level.openWorld){level.obstacles=level.obstacles.filter(o=>!overlaps(o));level.curbSegments=level.curbSegments?.filter(o=>!overlaps({...o,width:o.length,height:5}));}
  level.roadSurfaces.push({x:cx,y:cy,width:span+80,height:130,rotation:p.heading,elevation:p.elevation,color:'#39484b',curbs:false});
  for(const side of [-1,1])level.obstacles.push({id:p.id+'-wall-'+side,x:p.x-dx*45-dy*side*68,y:p.y-dy*45+dx*side*68,width:130,height:5,rotation:p.heading,elevation:p.elevation,verticalHeight:68,type:'wall',movable:false,weight:0,color:'#53636b'});
  level.obstacles.push({id:p.id+'-roof',x:p.x-dx*45,y:p.y-dy*45,width:130,height:141,rotation:p.heading,elevation:p.elevation+68,verticalHeight:5,type:'wall',movable:false,weight:0,color:'#45555d'});
  level.streetSigns.push({x:p.x-dx*115-dy*84,y:p.y-dy*115+dx*84,rotation:p.heading,label:p.label+'  自动通行',kind:'street'});
 }
 return level;
}
