import type {LevelData, Obstacle, Marking} from '../types';

/** Metres are converted to game units (10 = 1 m). All three floors share XY. */
export const GARAGE_LEVELS = [-48,-96,-144] as const;
export const garageFloorAt = (height:number) => Math.max(0,Math.min(2,Math.round((-height-48)/48)));
export const GARAGE_PILLAR_X=[384,864,1152];
export const GARAGE_PILLAR_Y=[380,620];
export const GARAGE_SPEED_TABLES=[{x:650,y:220},{x:1250,y:780}];
export function garageBump(x:number,y:number){
 for(const p of GARAGE_SPEED_TABLES){const dx=x-p.x;if(Math.abs(dx)<13&&Math.abs(y-p.y)<47){const t=(dx+13)/26;return {height:.55*Math.sin(Math.PI*t)**2,gradeX:.55*Math.PI/26*Math.sin(2*Math.PI*t)};}}
 return {height:0,gradeX:0};
}
export const GARAGE_RAMP = {x:1600,start:220,end:780,width:100};
export function garageRampHeight(floor:number,y:number){
 const t=Math.max(0,Math.min(1,(y-280)/440));
 return {height:GARAGE_LEVELS[floor]-48*t*t*(3-2*t),grade:-48*6*t*(1-t)/440};
}
/** Opposite the east ramps: a two-turn south tower connects B1 directly to B3. */
export const GARAGE_SPIRAL={x:800,y:1300,radius:200,width:110,turns:2};
export function garageSpiralPoint(t:number,offset=0){
 const s=GARAGE_SPIRAL,a=-Math.PI/2+t*Math.PI*2*s.turns,r=s.radius+offset;
 return {x:s.x+Math.cos(a)*r,y:s.y+Math.sin(a)*r,height:-48-96*t*t*(3-2*t),angle:a};
}
export function garageSpiralSurface(x:number,y:number,hint:number){
 const s=GARAGE_SPIRAL,dx=x-s.x,dy=y-s.y,r=Math.hypot(dx,dy);
 if(Math.abs(r-s.radius)>s.width/2)return null;
 const a=((Math.atan2(dy,dx)+Math.PI/2)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
 const values=[];
 for(let lap=0;lap<=s.turns;lap++){
  const t=(a/(2*Math.PI)+lap)/s.turns;if(t>1+1e-9)continue;
  const gradient=-96*6*t*(1-t)/(Math.PI*2*s.turns);
  values.push({height:garageSpiralPoint(t).height,gradeX:gradient*(-dy)/(r*r),gradeY:gradient*dx/(r*r)});
 }
 return values.sort((a,b)=>Math.abs(a.height-hint)-Math.abs(b.height-hint))[0];
}
/** Select by prior support height, not XY alone: stacked decks never teleport a car. */
export function garageSurface(x:number,y:number,hint:number){
 const spiral=garageSpiralSurface(x,y,hint);if(spiral)return spiral;
 const candidates:Array<{height:number;gradeX:number;gradeY:number}>=[];
 const r=GARAGE_RAMP;
 if(x>=r.x-r.width/2 && x<=r.x+r.width/2 && y>=r.start && y<=r.end){
  for(const f of [0,1]){const p=garageRampHeight(f,y);candidates.push({height:p.height,gradeX:0,gradeY:p.grade});}
 }else {const bump=garageBump(x,y);for(const height of GARAGE_LEVELS)candidates.push({height:height+bump.height,gradeX:bump.gradeX,gradeY:0});}
 return candidates.sort((a,b)=>Math.abs(a.height-hint)-Math.abs(b.height-hint))[0];
}

export function buildGarageLevel():LevelData{
 const level:LevelData={levelId:6,mapWidth:1800,mapHeight:1650,startPos:{x:1360,y:242,rotation:0,elevation:-48},
  garage:true,spots:[],obstacles:[],markings:[],roadSurfaces:[],training:{title:'三层地下车库 · B1 / B2 / B3',tips:[
   '东侧坡道逐层通行；南端双圈螺旋坡道直接连接 B1 与 B3',
   '蓝色 DOWN 指向下层，绿色 UP 指向上层；坡道靠右、限速 10 km/h',
   '每层 12 辆静止车辆，白线为空车位；绿色车位可完成泊车',
   'B1 出发点正前方为下行入口，右转进入坡道；地图显示当前楼层',
  ]}};
 const wall=(id:string,x:number,y:number,w:number,d:number,elevation:number,h=42,rotation=0):Obstacle=>({id,x,y,width:w,height:d,rotation,elevation,verticalHeight:h,type:'wall',movable:false,weight:0,color:'#737f86'});
 const line=(x:number,y:number,w:number,h:number,elevation:number,color='#ece9d9',rotation=0):Marking=>({type:'line-solid',x,y,width:w,height:h,rotation,elevation,color});
 for(let f=0;f<3;f++){
  const e=GARAGE_LEVELS[f],prefix=`garage-${f}`;
  level.roadSurfaces!.push({x:800,y:500,width:1400,height:800,rotation:0,color:['#3c474e','#414b50','#41464e'][f],elevation:e,curbs:false});
  level.obstacles.push(wall(prefix+'-west',95,500,10,810,e),wall(prefix+'-north',800,95,1420,10,e),...(f===1?[wall(prefix+'-south',800,905,1420,10,e)]:[wall(prefix+'-south-left',412.5,905,645,10,e),wall(prefix+'-south-right',1187.5,905,645,10,e)]));
  if(f!==1){
   level.roadSurfaces!.push({x:800,y:1000,width:130,height:220,rotation:0,color:'#384148',elevation:e,curbs:false});
   for(const x of [732,868])level.obstacles.push(wall(prefix+'-spiral-bridge-'+x,x,993,5,185,e,18));
   level.markings.push({...line(800,998,1.2,175,e,'#e6bd54'),type:'line-dashed'});
  }
  // East wall: two 12 m openings, never an invisible collider across a ramp.
  for(const [y,d] of [[127.5,55],[500,440],[872.5,55]]) level.obstacles.push(wall(prefix+'-east-'+y,1505,y,10,d,e));
  for(const y of [220,780]){
   const open=y===220?f<2:f>0;
   if(open){level.roadSurfaces!.push({x:1575,y,width:150,height:120,rotation:0,color:'#384148',elevation:e,curbs:false});
    level.obstacles.push(wall(prefix+'-landing-cap-'+y,1660,y,10,130,e));
    // Outer edge of the turning landing; inner edge meets the ramp opening.
    level.obstacles.push(wall(prefix+'-landing-end-'+y,1575,y+(y===220?-65:65),160,10,e));
   }else level.obstacles.push(wall(prefix+'-closed-'+y,1505,y,10,120,e));
  }
  // Four parking rows, 18 generously sized 2.9 x 5.8 m bays per row.
  for(let row=0;row<4;row++)for(let i=0;i<18;i++){
   const x=360+i*48,y=[330,430,570,670][row],heading=row%2===0?Math.PI/2:-Math.PI/2;
   const occupied=(i+row*3+f)%6===1;
   for(const dx of [-14.5,14.5])level.markings.push(line(x+dx,y,1.2,58,e));
   level.markings.push(line(x,y+(row%2===0?-29:29),29,1.2,e));
   if(occupied)level.obstacles.push({id:prefix+`-car-${row}-${i}`,x,y,width:20,height:47,rotation:heading,elevation:e,verticalHeight:18,type:'car',movable:false,weight:1800,color:['#637e88','#b3aaa0','#3d5864'][i%3]});
   else if(i%6===3)level.spots.push({id:prefix+`-bay-${row}-${i}`,x,y,width:58,height:29,rotation:heading,elevation:e,occupied:false});
  }
  // Pillars sit between paired bay backs, outside the four driving aisles.
  for(const x of GARAGE_PILLAR_X)for(const y of GARAGE_PILLAR_Y)level.obstacles.push(wall(prefix+`-pillar-${x}-${y}`,x,y,10,10,e));
  for(const y of [220,500,780]){
   level.markings.push({...line(850,y,1120,1.2,e,'#e6bd54'),type:'line-dashed'});
   for(const x of [420,900,1330]){
    level.markings.push({type:'arrow-straight',x,y:y+22,width:22,height:32,rotation:0,color:'#f2eee1',elevation:e});
    level.markings.push({type:'arrow-straight',x,y:y-22,width:22,height:32,rotation:Math.PI,color:'#f2eee1',elevation:e});
   }
  }
 }
 // Guard rails have the same sampled elevation as the visible sloped rails.
 for(let f=0;f<2;f++)for(let i=0;i<44;i++){
  const y=285+i*10,e=garageRampHeight(f,y).height;
  for(const x of [1546,1654])level.obstacles.push(wall(`garage-ramp-${f}-${i}-${x}`,x,y,5,10,e,42));
 }
 // Segmented outer/inner walls share the exact helix positions and height.
 for(let i=0;i<360;i++)for(const side of [-1,1]){
  // Leave the tangential turning area open at both connecting decks.
  if((i<9||i>350)&&side===1)continue;
  const a=garageSpiralPoint(i/360,side*57),b=garageSpiralPoint((i+1)/360,side*57);
  level.obstacles.push(wall(`garage-spiral-${i}-${side}`,(a.x+b.x)/2,(a.y+b.y)/2,Math.hypot(b.x-a.x,b.y-a.y)+.2,3,(a.height+b.height)/2,18,Math.atan2(b.y-a.y,b.x-a.x)));
 }
 return level;
}
