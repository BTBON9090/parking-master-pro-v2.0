import {RouteHeightIndex} from './routeHeightIndex';
import {CatmullRomCurve3,Vector3} from 'three';
import type {LevelData,Vector2} from '../types';

const specs = [
 {id:8,kind:'mud',name:'泥泞山谷',grip:.58,rolling:1.65,color:'#645646',seed:13,points:[[350,450],[850,480],[1220,850],[1680,650],[2120,1050],[1800,1510],[2360,1850],[3000,1520],[3530,1950],[3160,2500],[2500,2420],[1980,2750],[1250,2470],[760,2050],[420,2480]]},
 {id:9,kind:'snow',name:'雪岭冰路',grip:.34,rolling:1.2,color:'#9ca8a8',seed:29,points:[[350,500],[950,520],[1510,760],[2060,470],[2730,780],[3200,510],[3960,900],[3650,1450],[3050,1330],[2500,1760],[3100,2240],[3850,2450],[2900,2750],[1850,2400],[900,2640]]},
 {id:10,kind:'quarry',name:'矿场碎石路',grip:.70,rolling:1.4,color:'#877663',seed:37,points:[[400,450],[1000,440],[1500,820],[2100,650],[2450,1100],[1950,1350],[2500,1650],[3260,1300],[3830,1800],[3400,2350],[2700,2100],[2150,2600],[1200,2550],[500,2100]]},
 {id:11,kind:'forest',name:'林场窄路',grip:.78,rolling:1.2,color:'#665e4e',seed:53,points:[[350,500],[800,850],[1280,470],[1740,870],[1410,1300],[2070,1050],[2600,1450],[3180,850],[3850,1200],[3390,1650],[3790,2250],[3100,2600],[2410,2150],[1800,2620],[900,2250],[400,2750]]},
 {id:12,kind:'coast',name:'海崖盘山路',grip:.89,rolling:1.05,color:'#44484a',seed:71,points:[[360,450],[980,430],[1450,750],[2000,500],[2580,850],[3100,450],[3840,740],[3580,1250],[3070,1120],[2620,1600],[3150,1890],[3700,2300],[3100,2730],[2230,2350],[1600,2700],[850,2240],[400,2600]]},
] as const;
export const CHALLENGE_MAPS=specs.map(s=>({id:s.id,name:s.name,desc:s.kind==='snow'?'积雪路肩、冰滑斑块、260 米高差与回头弯。':s.kind==='mud'?'窄幅车辙、随机深坑、陡坡与泥泞山谷。':'长距离弯道、窄路与起伏地形。',locked:false,thumbnail:`/thumbnails/map-${s.id}.svg`}));

// Seeded, smooth value noise avoids the visibly regular washboard pattern of
// a stack of sine waves. Its fixed spatial scale also makes tyre contact and
// generated mesh deterministic between sessions.
function terrainNoise(x:number,y:number,seed:number,scale:number):number {
 const px=x/scale,py=y/scale,ix=Math.floor(px),iy=Math.floor(py);
 const smooth=(v:number)=>v*v*(3-2*v),u=smooth(px-ix),v=smooth(py-iy);
 const at=(a:number,b:number)=>{const n=Math.sin(a*127.1+b*311.7+seed*71.2)*43758.5453;return (n-Math.floor(n))*2-1;};
 const a=at(ix,iy)*(1-u)+at(ix+1,iy)*u,b=at(ix,iy+1)*(1-u)+at(ix+1,iy+1)*u;
 return a*(1-v)+b*v;
}
/** Smooth, deterministic terrain in game units; both wheel contact and the
 * rendered ground use this function. Values are game calibration, not survey data. */
const routeCache=new WeakMap<LevelData,Array<{x:number;y:number;h:number}>>();
function heightRoute(level:LevelData){
 let cached=routeCache.get(level);if(cached)return cached;
 const spec=specs.find(s=>s.id===level.levelId)!,n=spec.points.length-1;
 const top=spec.kind==='mud'?1800:spec.kind==='snow'?2600:spec.kind==='quarry'?1600:spec.kind==='forest'?2100:3200;
 const points=spec.points.map(([x,y],i)=>new Vector3(x*2,top*(i/n)*(.72+.28*terrainNoise(i*83,3,spec.seed,210)),y*2));
 const curve=new CatmullRomCurve3(points,false,'centripetal');
 cached=curve.getSpacedPoints(700).map(p=>({x:p.x,y:p.z,h:p.y}));routeCache.set(level,cached);return cached;
}
const heightIndexCache=new WeakMap<LevelData,RouteHeightIndex>();
const vertexCache=new WeakMap<LevelData,Map<string,number>>();
export function challengeHeight(level:LevelData,x:number,y:number):number {
 const t=level.challengeTerrain;if(!t)return 0;
 let cache=vertexCache.get(level);if(!cache){cache=new Map();vertexCache.set(level,cache);}const key=x+','+y,old=cache.get(key);if(old!==undefined)return old;
 let index=heightIndexCache.get(level);if(!index){index=new RouteHeightIndex(heightRoute(level));heightIndexCache.set(level,index);}
 const {distance,height}=index.nearest(x,y);
 const roadWidth=level.curvedRoads![0].width,edge=Math.max(0,distance-roadWidth/2),smooth=(v:number)=>{const z=Math.min(1,Math.max(0,v));return z*z*(3-2*z);};
 const cliff=smooth(edge/(t.kind==='coast'?100:t.kind==='quarry'?135:260));
 const mountain=320*terrainNoise(x,y,t.seed,800)+180*terrainNoise(x,y,t.seed+9,340);
 // A cut shelf on sea cliffs; uneven hills elsewhere. No periodic wave function.
 const land=t.kind==='coast'?-Math.min(height+200,650)*cliff:mountain*cliff;
 const rough=t.kind==='mud'?7.2:t.kind==='quarry'?5.0:t.kind==='forest'?3.8:t.kind==='snow'?1.8:.3;
 const patch=.3+.7*smooth((terrainNoise(x,y,t.seed+22,170)+.3)/1.3);
 const detail=rough*patch*(terrainNoise(x,y,t.seed,54)+.4*terrainNoise(x,y,t.seed+7,29));
 const bank=t.kind==='snow'?10*Math.exp(-(((distance-roadWidth*.65)/17)**2))*(1+.6*terrainNoise(x,y,41,90)):0;
 const result=height+land+detail+bank;cache.set(key,result);return result;
}
export const CHALLENGE_COLUMNS=420,CHALLENGE_ROWS=320;
/** Match the two triangles in the rendered PlaneGeometry, not a different
 * analytic surface between vertices. This keeps tyres on the visible mesh. */
export function challengeMeshHeight(level:LevelData,x:number,y:number):number {
 const sx=level.mapWidth/CHALLENGE_COLUMNS,sy=level.mapHeight/CHALLENGE_ROWS;
 const fx=Math.max(0,Math.min(CHALLENGE_COLUMNS-1e-7,x/sx)),fy=Math.max(0,Math.min(CHALLENGE_ROWS-1e-7,y/sy));
 const ix=Math.floor(fx),iy=Math.floor(fy),u=fx-ix,v=fy-iy;
 const a=challengeHeight(level,ix*sx,iy*sy),b=challengeHeight(level,ix*sx,(iy+1)*sy),
  c=challengeHeight(level,(ix+1)*sx,(iy+1)*sy),d=challengeHeight(level,(ix+1)*sx,iy*sy);
 return u+v<=1?a*(1-u-v)+d*u+b*v:c*(u+v-1)+b*(1-u)+d*(1-v);
}
export function challengeSample(level:LevelData,x:number,y:number){
 const height=challengeMeshHeight(level,x,y),d=.5;
 return {height,gradeX:(challengeMeshHeight(level,x+d,y)-challengeMeshHeight(level,x-d,y))/(2*d),gradeY:(challengeMeshHeight(level,x,y+d)-challengeMeshHeight(level,x,y-d))/(2*d)};
}
export function buildChallengeMap(id:number):LevelData {
 const s=specs.find(v=>v.id===id);if(!s)throw Error('Unknown challenge map');
 const points:Vector2[]=s.points.map(([x,y])=>({x:x*2,y:y*2}));
 const boundaries:LevelData['obstacles']=[
  {id:'north',x:4200,y:0,width:8400,height:10,rotation:0,type:'wall',movable:false,weight:0,color:'#606964',collisionOnly:true},
  {id:'south',x:4200,y:6400,width:8400,height:10,rotation:0,type:'wall',movable:false,weight:0,color:'#606964',collisionOnly:true},
  {id:'west',x:0,y:3200,width:10,height:6400,rotation:0,type:'wall',movable:false,weight:0,color:'#606964',collisionOnly:true},
  {id:'east',x:8400,y:3200,width:10,height:6400,rotation:0,type:'wall',movable:false,weight:0,color:'#606964',collisionOnly:true},
 ];
 const level:LevelData={levelId:id,mapWidth:8400,mapHeight:6400,startPos:{x:points[0].x,y:points[0].y,rotation:Math.atan2(points[1].y-points[0].y,points[1].x-points[0].x)},
  challengeTerrain:{kind:s.kind,seed:s.seed,grip:s.grip,rolling:s.rolling},spots:[],obstacles:boundaries,markings:[],
  curvedRoads:[{points,width:s.kind==='mud'?46:s.kind==='snow'?86:s.kind==='forest'?48:72,color:s.color,lanes:1,direction:'one-way'}],
  training:{title:s.name,tips:[s.kind==='snow'?'积雪路面附着力低，请提前减速并避免急打方向。':'注意弯坡、路面变化和车速，地形与车辆接触共用同一高度场。','路线是虚构训练场景，可自由探索；路面表现为游戏标定。']}};
 const dist=(p:Vector2,a:Vector2,b:Vector2)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
 // Low-cost instanced scenery and matching trunk collision shapes. Keep the
 // full authored route clear, including bends that pass close to each other.
 for(let i=1;i<points.length;i++)for(const side of [-1,1])for(let n=0;n<3;n++){
  const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),u=(n+1)/4;
  const off=110+((i*83+n*59+s.seed)%150),p={x:a.x+dx*u-side*dy/len*off,y:a.y+dy*u+side*dx/len*off};
  if(p.x<40||p.y<40||p.x>8360||p.y>6360||points.slice(1).some((q,j)=>dist(p,points[j],q)<65))continue;
  boundaries.push({id:`challenge-tree-${i}-${side}-${n}`,x:p.x,y:p.y,width:4,height:4,rotation:0,type:'wall',movable:false,weight:0,color:'#514d3e',collisionOnly:true,elevation:challengeMeshHeight(level,p.x,p.y),verticalHeight:35});
 }
 level.startPos.elevation=challengeMeshHeight(level,points[0].x,points[0].y);
 return level;
}

export function challengeGripAt(level:LevelData,x:number,y:number){
 const t=level.challengeTerrain;if(!t)return 1;
 return t.kind==='snow'?t.grip*(.55+.45*Math.max(0,Math.min(1,(terrainNoise(x,y,t.seed,160)+.3)/.9))):t.grip;
}
