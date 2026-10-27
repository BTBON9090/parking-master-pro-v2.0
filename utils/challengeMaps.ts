import type {LevelData,Vector2} from '../types';

const specs = [
 {id:8,kind:'mud',name:'泥泞山谷',grip:.58,rolling:1.65,color:'#645646',seed:13,points:[[350,450],[850,480],[1220,850],[1680,650],[2120,1050],[1800,1510],[2360,1850],[3000,1520],[3530,1950],[3160,2500],[2500,2420],[1980,2750],[1250,2470],[760,2050],[420,2480]]},
 {id:9,kind:'snow',name:'雪岭冰路',grip:.34,rolling:1.2,color:'#9ca8a8',seed:29,points:[[350,500],[950,520],[1510,760],[2060,470],[2730,780],[3200,510],[3960,900],[3650,1450],[3050,1330],[2500,1760],[3100,2240],[3850,2450],[2900,2750],[1850,2400],[900,2640]]},
 {id:10,kind:'quarry',name:'矿场碎石路',grip:.70,rolling:1.4,color:'#877663',seed:37,points:[[400,450],[1000,440],[1500,820],[2100,650],[2450,1100],[1950,1350],[2500,1650],[3260,1300],[3830,1800],[3400,2350],[2700,2100],[2150,2600],[1200,2550],[500,2100]]},
 {id:11,kind:'forest',name:'林场窄路',grip:.78,rolling:1.2,color:'#665e4e',seed:53,points:[[350,500],[800,850],[1280,470],[1740,870],[1410,1300],[2070,1050],[2600,1450],[3180,850],[3850,1200],[3390,1650],[3790,2250],[3100,2600],[2410,2150],[1800,2620],[900,2250],[400,2750]]},
 {id:12,kind:'coast',name:'海崖盘山路',grip:.89,rolling:1.05,color:'#44484a',seed:71,points:[[360,450],[980,430],[1450,750],[2000,500],[2580,850],[3100,450],[3840,740],[3580,1250],[3070,1120],[2620,1600],[3150,1890],[3700,2300],[3100,2730],[2230,2350],[1600,2700],[850,2240],[400,2600]]},
] as const;
export const CHALLENGE_MAPS=specs.map(s=>({id:s.id,name:s.name,desc:s.kind==='snow'?'低附着力雪路、山脊弯道与缓坡。':s.kind==='mud'?'深浅不一的非铺装山路、坑洼与弯坡。':'长距离弯道、窄路与起伏地形。',locked:false,thumbnail:`/thumbnails/map-${s.id}.svg`}));

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
export function challengeHeight(level:LevelData,x:number,y:number):number {
 const t=level.challengeTerrain;if(!t)return 0;
 const seed=t.seed, rough=t.kind==='mud'?2.5:t.kind==='quarry'?2.0:t.kind==='snow'?.65:1.0;
 const broad=48*Math.sin((x+seed*13)/310)*Math.sin((y-seed*9)/410)+12*Math.sin((x+y)/205+seed);
 const detail=rough*(terrainNoise(x,y,seed,75)+.55*terrainNoise(x,y,seed+17,34));
 const route:readonly (readonly [number,number])[]=specs.find(s=>s.id===level.levelId)?.points??[];
 const holes=route.reduce((sum,p,i)=>{
   if(i===0||i%2===0)return sum;
   const previous=route[i-1],cx=previous[0]*.42+p[0]*.58,cy=previous[1]*.42+p[1]*.58;
   return sum-1.8*Math.exp(-((x-cx)**2+(y-cy)**2)/650);
 },0);
 return broad+detail+(t.kind==='mud'||t.kind==='quarry'?holes:0);
}
export const CHALLENGE_COLUMNS=210,CHALLENGE_ROWS=160;
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
 const points:Vector2[]=s.points.map(([x,y])=>({x,y}));
 const boundaries:LevelData['obstacles']=[
  {id:'north',x:2100,y:0,width:4200,height:10,rotation:0,type:'wall',movable:false,weight:0,color:'#606964',collisionOnly:true},
  {id:'south',x:2100,y:3200,width:4200,height:10,rotation:0,type:'wall',movable:false,weight:0,color:'#606964',collisionOnly:true},
  {id:'west',x:0,y:1600,width:10,height:3200,rotation:0,type:'wall',movable:false,weight:0,color:'#606964',collisionOnly:true},
  {id:'east',x:4200,y:1600,width:10,height:3200,rotation:0,type:'wall',movable:false,weight:0,color:'#606964',collisionOnly:true},
 ];
 const level:LevelData={levelId:id,mapWidth:4200,mapHeight:3200,startPos:{x:points[0].x,y:points[0].y,rotation:Math.atan2(points[1].y-points[0].y,points[1].x-points[0].x)},
  challengeTerrain:{kind:s.kind,seed:s.seed,grip:s.grip,rolling:s.rolling},spots:[],obstacles:boundaries,markings:[],
  curvedRoads:[{points,width:s.kind==='mud'?70:s.kind==='snow'?86:72,color:s.color,lanes:1,direction:'one-way'}],
  training:{title:s.name,tips:[s.kind==='snow'?'积雪路面附着力低，请提前减速并避免急打方向。':'注意弯坡、路面变化和车速，地形与车辆接触共用同一高度场。','路线是虚构训练场景，可自由探索；路面表现为游戏标定。']}};
 const dist=(p:Vector2,a:Vector2,b:Vector2)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
 // Low-cost instanced scenery and matching trunk collision shapes. Keep the
 // full authored route clear, including bends that pass close to each other.
 for(let i=1;i<points.length;i++)for(const side of [-1,1])for(let n=0;n<3;n++){
  const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),u=(n+1)/4;
  const off=110+((i*83+n*59+s.seed)%150),p={x:a.x+dx*u-side*dy/len*off,y:a.y+dy*u+side*dx/len*off};
  if(p.x<40||p.y<40||p.x>4160||p.y>3160||points.slice(1).some((q,j)=>dist(p,points[j],q)<65))continue;
  boundaries.push({id:`challenge-tree-${i}-${side}-${n}`,x:p.x,y:p.y,width:4,height:4,rotation:0,type:'wall',movable:false,weight:0,color:'#514d3e',collisionOnly:true,elevation:challengeMeshHeight(level,p.x,p.y),verticalHeight:35});
 }
 return level;
}
