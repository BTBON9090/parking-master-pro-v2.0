import type {LevelData,Vector2} from '../types';
import {openCampusJunctions} from './campusMarkings';
/** Four former practice maps are now connected districts of one campus. */
export function buildTrainingCampus(legacy:(id:number)=>LevelData):LevelData{
 const out:LevelData={levelId:4,mapWidth:4200,mapHeight:2600,startPos:{x:270,y:300,rotation:0},spots:[],obstacles:[],markings:[],roadSurfaces:[],curvedRoads:[],slopeZones:[],training:{title:'综合驾驶试验场',tips:['坡道与窄桥、双 S 弯、紧凑倒库、斜列车位四个区域由环路连通','白色实线沿弯道连续引导；单行项目顺箭头驶入，出项目让行','西侧练坡道，中部练曲线，南侧挑战窄车位；随时自由选择项目']}};
 for(const [id,dx,dy] of [[4,150,150],[5,2100,150],[2,2100,1500],[3,3000,1500]]){
  const src=legacy(id),move=<T extends Vector2>(v:T)=>({...v,x:v.x+dx,y:v.y+dy});
  const isPerimeter=(o:any)=>o.type==='wall'&&((o.width>src.mapWidth*.7)||(o.height>src.mapHeight*.7));
  out.obstacles.push(...src.obstacles.filter(o=>!isPerimeter(o)).map(o=>({...move(o),id:`campus-${id}-${o.id}`})));
  out.spots.push(...src.spots.map(o=>({...move(o),id:`campus-${id}-${o.id}`})));
  out.markings.push(...src.markings.map(move));
  out.roadSurfaces!.push(...(src.roadSurfaces??[]).map(o=>({...move(o),curbs:false})));
  out.slopeZones!.push(...(src.slopeZones??[]).map(move));
  for(const c of src.curvedRoads??[]){
   if(id===5&&c.width<=46)continue; // replace zigzags with properly spaced S lanes
   const points=id===4&&!c.closed?[{x:690,y:650},{x:570,y:740},{x:625,y:855},{x:735,y:940}]:c.points;
   out.curvedRoads!.push({...c,points:points.map(move),center:c.center?move(c.center):undefined,lanes:c.kind==='roundabout'?1:c.width<65?1:2,direction:c.width<65||c.kind==='roundabout'?'one-way':'two-way'});
  }
 }
 const road=(points:Vector2[],width=70,closed=false)=>out.curvedRoads!.push({points,width,color:'#393e42',closed,lanes:width<60?1:2,direction:width<60?'one-way':'two-way',warningEdges:width<60});
 road([{x:150,y:1400},{x:1600,y:1400},{x:2400,y:1400},{x:3900,y:1400}]);
 road([{x:1800,y:1175},{x:1800,y:1300},{x:1700,y:1400}]);
 road([{x:2200,y:1100},{x:2200,y:1270},{x:2300,y:1400}]);
 road([{x:2410,y:1400},{x:2410,y:1600},{x:2410,y:2170}],65);
 road([{x:3160,y:1400},{x:3160,y:1650},{x:3160,y:1900},{x:3400,y:1900},{x:3760,y:1900}],65);
 // Broad, smooth single-lane S courses, with continuous paint along the ribbon.
 road([{x:2890,y:605},{x:2910,y:430},{x:3120,y:360},{x:3360,y:470},{x:3570,y:345},{x:3800,y:355}],46);
 road([{x:2200,y:820},{x:2360,y:770},{x:2560,y:875},{x:2740,y:790},{x:2860,y:850}],46);
 road([{x:2860,y:850},{x:3050,y:780},{x:3270,y:885},{x:3500,y:805},{x:3730,y:900},{x:3800,y:910}],46);
 road([{x:270,y:300},{x:220,y:500},{x:220,y:1150},{x:150,y:1400}],70);
 for(const [x,y] of [[1800,1300],[2200,1270],[2410,1480],[3160,1480]])out.markings.push({type:'arrow-straight',x,y,width:12,height:30,rotation:Math.PI/2,color:'#eee8d7'});
 for(const [x,y,w,h] of [[2100,0,4200,10],[2100,2600,4200,10],[0,1300,10,2600],[4200,1300,10,2600]])out.obstacles.push({id:`campus-boundary-${x}-${y}`,x,y,width:w,height:h,rotation:0,type:'wall',movable:false,weight:0,color:'#737a7f'});
 openCampusJunctions(out);
 return out;
}
