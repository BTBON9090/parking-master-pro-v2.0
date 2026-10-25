import { CatmullRomCurve3, Vector3 } from 'three';
import type { CurvedRoadSurface, LevelData } from '../types';

export interface RouteSample { x:number; y:number; h:number; distance:number; nx:number; ny:number; }
export interface WorldRoute { id:string; label:string; width:number; gravel?:boolean; closed?:boolean; points:number[][]; samples:RouteSample[]; }
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
export const MOUNTAIN_BOUNDS={x0:8600,x1:16600,y0:1300,y1:8100};
function route(id:string,label:string,width:number,points:number[][],closed=false,gravel=false):WorldRoute {
 const curve=new CatmullRomCurve3(points.map(p=>new Vector3(p[0],p[2],p[1])),closed,'centripetal');
 curve.arcLengthDivisions=points.length*600;curve.updateArcLengths();
 const samples:RouteSample[]=[];
 const ps=curve.getSpacedPoints(Math.ceil(curve.getLength()/6));
 let distance=0;
 ps.forEach((p,i)=>{
  if(i)distance+=p.distanceTo(ps[i-1]);
  const a=ps[closed&&i===0?ps.length-2:Math.max(0,i-1)],b=ps[closed&&i===ps.length-1?1:Math.min(ps.length-1,i+1)],d=Math.hypot(b.x-a.x,b.z-a.z)||1;
  samples.push({x:p.x,y:p.z,h:id==='gateway'&&p.x<8650?0:Math.max(0,p.y),distance,nx:-(b.z-a.z)/d,ny:(b.x-a.x)/d});
 });
 return {id,label,width,points,closed,gravel,samples};
}
/** Fictional mountain extension, not a claimed survey of Beijing's mountains. */
export const WORLD_ROUTES:WorldRoute[]=[
 route('gateway','城郊连接线',90,[[8185,4500,0],[8650,4500,0],[9100,4680,8],[9600,4650,22],[10200,4300,55]]),
 route('ridge','青岚山环线',78,[[10200,4300,55],[11000,3950,105],[11900,4100,170],[12500,3700,230],[12000,3200,270],[11500,2800,310],[11700,2500,370],[12800,2350,440],[13900,2900,470],[14600,3800,430],[14700,4700,350],[14000,5250,280],[13400,5050,250],[12900,5500,210],[13300,6200,170],[12500,7000,120],[11400,6600,85],[10800,5700,60]],true),
 route('summit','云顶观景线',72,[[13900,2900,470],[14500,2450,520],[15100,2400,580],[15800,3100,560],[15400,3700,480],[14600,3800,430]]),
 route('forestry','林场窄路挑战',46,[[12200,5200,165],[12500,4770,205],[13000,4400,240],[13300,4590,255],[13180,4930,245],[12780,4840,215],[12450,5040,180]],true,true),
 route('creek','溪谷砂石捷径',58,[[11900,4100,170],[11750,4480,158],[11700,4800,150],[12200,5200,165],[12100,5800,190],[12500,5860,200],[12900,5500,210]],false,true),
];
export const WORLD_PLACES=[
 {label:'城市 · 东四',x:4300,y:1800,color:'#b3bac2'},
 {label:'山路入口',x:9220,y:4550,color:'#a8d5a1'},
 {label:'回头弯',x:12380,y:3520,color:'#f6cb73'},
 {label:'云顶观景台',x:15330,y:2410,color:'#b4dfd5'},
 {label:'浅水 / 坑洼',x:11700,y:4800,color:'#8dc6dc'},
 {label:'林场窄路 · 会车让行',x:13000,y:4400,color:'#eac783'},
 {label:'连续回头弯 · 慢行',x:13270,y:4620,color:'#eac783'},
 {label:'青岚山环线',x:13700,y:6500,color:'#a8d5a1'},
];
export const WORLD_DESTINATIONS=[
 {label:'城市起点',x:8190,y:4500,rotation:0},
 {label:'山路入口',x:9160,y:4670,rotation:-.08},
 {label:'山腰回头弯',x:12100,y:4040,rotation:-.15},
 {label:'云顶观景线',x:15100,y:2400,rotation:.28},
 {label:'林场窄路挑战',x:12500,y:4770,rotation:0},
 {label:'溪谷砂石路',x:11750,y:4480,rotation:Math.PI/2},
].map(place=>{
 let best=WORLD_ROUTES[0].samples[0],width=90,distance=Infinity;
 for(const r of WORLD_ROUTES)for(const p of r.samples){const d=Math.hypot(place.x-p.x,place.y-p.y);if(d<distance){best=p;width=r.width;distance=d;}}
 return {...place,x:best.x+best.nx*width/4,y:best.y+best.ny*width/4,rotation:Math.atan2(-best.nx,best.ny)};
});
// Puddles are shallow bowls in the actual tyre support surface, not decals on flat tarmac.
export const WORLD_PUDDLES=[{x:13000,y:4400,rx:15,ry:24,depth:.65},{x:11702,y:4790,rx:17,ry:30,depth:.85},{x:12195,y:5200,rx:22,ry:16,depth:.65}];
type Segment={a:RouteSample;b:RouteSample;route:WorldRoute};
const CELL=160,buckets=new Map<string,Segment[]>();
for(const r of WORLD_ROUTES)for(let i=1;i<r.samples.length;i++){
 const a=r.samples[i-1],b=r.samples[i],s={a,b,route:r},pad=r.width/2+100;
 for(let x=Math.floor((Math.min(a.x,b.x)-pad)/CELL);x<=Math.floor((Math.max(a.x,b.x)+pad)/CELL);x++)
 for(let y=Math.floor((Math.min(a.y,b.y)-pad)/CELL);y<=Math.floor((Math.max(a.y,b.y)+pad)/CELL);y++){
  const key=`${x},${y}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key)!.push(s);
 }
}
// Each grid cell keeps a small nearest-segment tree per route. This returns
// the same closest point as the exhaustive scan, without scanning every
// neighbouring road sample on every suspension iteration.
interface SegmentNode {x0:number;y0:number;x1:number;y1:number;left?:SegmentNode;right?:SegmentNode;segments?:Segment[]}
function segmentTree(segments:Segment[]):SegmentNode {
 const node:SegmentNode={x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity};
 for(const s of segments){node.x0=Math.min(node.x0,s.a.x,s.b.x);node.y0=Math.min(node.y0,s.a.y,s.b.y);node.x1=Math.max(node.x1,s.a.x,s.b.x);node.y1=Math.max(node.y1,s.a.y,s.b.y);}
 if(segments.length<=6){node.segments=segments;return node;}
 const axis=node.x1-node.x0>node.y1-node.y0?'x':'y';
 segments.sort((a,b)=>a.a[axis]+a.b[axis]-b.a[axis]-b.b[axis]);
 const mid=segments.length>>1;node.left=segmentTree(segments.slice(0,mid));node.right=segmentTree(segments.slice(mid));return node;
}
const roadIndex=new Map<string,SegmentNode[]>();
for(const [key,segments] of buckets){
 const routes=new Map<string,Segment[]>();
 for(const s of segments){if(!routes.has(s.route.id))routes.set(s.route.id,[]);routes.get(s.route.id)!.push(s);}
 roadIndex.set(key,[...routes.values()].map(segmentTree));
}
buckets.clear();
function roadContacts(x:number,y:number){
 const closest:Array<{distance:number;height:number;route:WorldRoute;along:number}>=[];
 const bound=(n:SegmentNode)=>Math.max(n.x0-x,0,x-n.x1)**2+Math.max(n.y0-y,0,y-n.y1)**2;
 for(const tree of roadIndex.get(`${Math.floor(x/CELL)},${Math.floor(y/CELL)}`)||[]){
  let best=Infinity,bestSegment:Segment|undefined,bestT=0;
  const visit=(n:SegmentNode)=>{
   if(bound(n)>best)return;
   if(n.segments){for(const s of n.segments){
    const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,t=clamp(((x-s.a.x)*dx+(y-s.a.y)*dy)/(dx*dx+dy*dy||1));
    const d=(x-s.a.x-t*dx)**2+(y-s.a.y-t*dy)**2;
    if(d<best){best=d;bestSegment=s;bestT=t;}
   }}else{const l=n.left!,r=n.right!;if(bound(l)<bound(r)){visit(l);visit(r);}else{visit(r);visit(l);}}
  };
  visit(tree);
  if(bestSegment){const s=bestSegment,t=bestT;closest.push({distance:Math.sqrt(best),height:s.a.h+(s.b.h-s.a.h)*t,route:s.route,along:s.a.distance+(s.b.distance-s.a.distance)*t});}
 }
 return closest.sort((a,b)=>a.distance-b.distance);
}
export function nearestWorldRoad(x:number,y:number){return roadContacts(x,y)[0]??null;}
// Fixed-seed smooth noise: repeatable contact, without periodic washboard waves.
function lattice(x:number,y:number){let n=Math.imul(x,374761393)^Math.imul(y,668265263)^0x45d9f3b;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295*2-1;}
function noise(x:number,y:number,scale:number){const a=Math.floor(x/scale),b=Math.floor(y/scale),u=smooth(x/scale-a),v=smooth(y/scale-b);return (lattice(a,b)*(1-u)+lattice(a+1,b)*u)*(1-v)+(lattice(a,b+1)*(1-u)+lattice(a+1,b+1)*u)*v;}
export function roughness(x:number,y:number){
 const patch=.45+.55*smooth((noise(x,y,125)+1)/2);
 let h=patch*(1.5*noise(x,y,23)+.65*noise(x+531,y-173,9)+.24*noise(x-76,y+911,4));
 for(const p of WORLD_PUDDLES){const q=((x-p.x)/p.rx)**2+((y-p.y)/p.ry)**2;if(q<1)h-=p.depth*(1-q)**2;}
 return h;
}
// A broad, precomputed terrain bed follows the road altitude over 65 metres.
// This avoids cutting each elevated route into a narrow, near-vertical trench.
const broadSegments=WORLD_ROUTES.flatMap(r=>r.samples.filter((_,i)=>i%20===0).map((p,i,ps)=>({a:p,b:ps[Math.min(i+1,ps.length-1)],r})));
const bedCache=new Map<string,number>();
function bedNode(x:number,y:number){
 const key=`${x},${y}`,cached=bedCache.get(key);if(cached!==undefined)return cached;
 const b=MOUNTAIN_BOUNDS,envelope=smooth((x-b.x0)/500)*smooth((b.x1-x)/500)*smooth((y-b.y0)/500)*smooth((b.y1-y)/500);
 const gauss=(cx:number,cy:number,sx:number,sy:number,h:number)=>h*Math.exp(-(((x-cx)/sx)**2+((y-cy)/sy)**2));
 const raw=envelope*(75+gauss(12900,1800,1700,1000,950)+gauss(15300,4600,1000,1400,720)+gauss(11200,5600,1500,1300,220)+gauss(13600,3700,1000,1000,570));
 let nearest=Infinity,h=0;
 for(const s of broadSegments){
  if(Math.abs(x-s.a.x)>1400||Math.abs(y-s.a.y)>1400)continue;
  const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,t=clamp(((x-s.a.x)*dx+(y-s.a.y)*dy)/(dx*dx+dy*dy||1));
  const d=Math.hypot(x-s.a.x-t*dx,y-s.a.y-t*dy);
  if(d<nearest){nearest=d;h=s.a.h+(s.b.h-s.a.h)*t;}
 }
 const blend=1-smooth((nearest-45)/650),result=raw*(1-blend)+h*blend;
 bedCache.set(key,result);return result;
}
function terrainBed(x:number,y:number){
 const step=40,x0=Math.floor(x/step)*step,y0=Math.floor(y/step)*step,tx=(x-x0)/step,ty=(y-y0)/step;
 return (bedNode(x0,y0)*(1-tx)+bedNode(x0+step,y0)*tx)*(1-ty)+(bedNode(x0,y0+step)*(1-tx)+bedNode(x0+step,y0+step)*tx)*ty;
}
function designHeight(x:number,y:number,contacts=roadContacts(x,y)):number {
 const b=MOUNTAIN_BOUNDS;
 if(x<8180||x>b.x1||y<b.y0||y>b.y1)return 0;
 const terrain=terrainBed(x,y);
 const road=contacts[0];
 if(!road)return terrain;
 const blend=Math.max(...contacts.map(r=>1-smooth((r.distance-r.route.width/2)/85)));
 let sum=0,weight=0;
 for(const r of contacts){
  const w=(1-smooth((r.distance-r.route.width*.35)/60))**2;
  const noise=r.route.gravel?roughness(x,y)*smooth(r.along/90)*smooth((r.route.samples.at(-1)!.distance-r.along)/90):0;
  sum+=w*(r.height+noise);weight+=w;
 }
 const roadHeight=weight>1e-9?sum/weight:road.height;
 return terrain*(1-blend)+roadHeight*blend;
}
// The off-road solver samples the exact terrain triangles, not a smooth
// approximation above them. A six-metre shoulder joins that mesh to each road.
const terrainVertices=new Map<string,number>();
export function terrainVertexHeight(x:number,y:number):number {
 const key=`${x},${y}`,cached=terrainVertices.get(key);if(cached!==undefined)return cached;
 const r=nearestWorldRoad(x,y),h=designHeight(x,y)-(r&&r.distance<r.route.width/2+100?8*(1-smooth((r.distance-r.route.width/2-40)/60)):0);
 terrainVertices.set(key,h);return h;
}
function terrainTriangleHeight(x:number,y:number):number {
 const b=MOUNTAIN_BOUNDS;
 if(x<b.x0||x>b.x1||y<b.y0||y>b.y1)return designHeight(x,y);
 const x0=b.x0+Math.floor((x-b.x0)/40)*40,y0=b.y0+Math.floor((y-b.y0)/40)*40;
 const u=(x-x0)/40,v=(y-y0)/40,h00=terrainVertexHeight(x0,y0),h10=terrainVertexHeight(x0+40,y0),h01=terrainVertexHeight(x0,y0+40),h11=terrainVertexHeight(x0+40,y0+40);
 return u+v<=1?h00+(h10-h00)*u+(h01-h00)*v:h11+(h01-h11)*(1-u)+(h10-h11)*(1-v);
}
export function worldHeight(x:number,y:number):number {
 const contacts=roadContacts(x,y),r=contacts[0],edge=r?r.distance-r.route.width/2:Infinity;
 if(edge<=0)return designHeight(x,y,contacts);
 const terrain=terrainTriangleHeight(x,y);
 if(edge>=60)return terrain;
 const t=smooth(edge/60);return designHeight(x,y,contacts)*(1-t)+terrain*t;
}
export function worldTreePlacements(){
 const out:{x:number;y:number;h:number;s:number}[]=[];
 for(let i=0;i<340;i++){
  const x=8900+((i*2081)%7200),y=1700+((i*1297)%5900),r=nearestWorldRoad(x,y);
  if(r&&r.distance<r.route.width/2+65)continue;
  out.push({x,y,h:worldHeight(x,y),s:.7+(i%9)*.1});
 }
 return out;
}
export function worldSignPlacements(){
 return WORLD_PLACES.filter(p=>p.x>8800).flatMap(p=>{
  const r=nearestWorldRoad(p.x,p.y);if(!r)return [];
  const q=r.route.samples.reduce((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)<Math.hypot(b.x-p.x,b.y-p.y)?a:b);
  const x=q.x+q.nx*(r.route.width/2+34),y=q.y+q.ny*(r.route.width/2+34);
  return [{label:p.label,x,y,h:worldHeight(x,y),yaw:Math.atan2(-q.ny,q.nx)}];
 });
}
export function worldSurface(x:number,y:number){
 const r=nearestWorldRoad(x,y);
 const onRoad=r&&r.distance<r.route.width/2;
 const wet=WORLD_PUDDLES.some(p=>((x-p.x)/p.rx)**2+((y-p.y)/p.ry)**2<1);
 const offRoad=x>=8600&&!onRoad;
 return {kind:wet?'wet':onRoad&&r.route.gravel?'gravel':offRoad?'grass':'asphalt',gravel:!!(onRoad&&r.route.gravel),wet,grip:wet?.62:onRoad&&r.route.gravel?.77:offRoad?.68:1,rolling:wet?2.1:onRoad&&r.route.gravel?1.7:offRoad?1.9:1};
}
const surfaceCache=new Map<string,{height:number;gradeX:number;gradeY:number}>();
export function worldSurfaceSample(x:number,y:number){
 const key=x+','+y,cached=surfaceCache.get(key);if(cached)return cached;
 const e=.75,result={height:worldHeight(x,y),gradeX:(worldHeight(x+e,y)-worldHeight(x-e,y))/(2*e),gradeY:(worldHeight(x,y+e)-worldHeight(x,y-e))/(2*e)};
 if(surfaceCache.size>12000)surfaceCache.clear();surfaceCache.set(key,result);return result;
}

/** Same centripetal interpolation used by the rendered city ribbons. */
const curveCache=new WeakMap<CurvedRoadSurface,{x:number;y:number}[]>();
export function mapCurveSamples(r:CurvedRoadSurface){
 const cached=curveCache.get(r);if(cached)return cached;
 const p=new CatmullRomCurve3(r.points.map(p=>new Vector3(p.x,0,p.y)),!!r.closed,'centripetal',.45).getSpacedPoints(Math.max(160,r.points.length*28)).map(p=>({x:p.x,y:p.z}));
 curveCache.set(r,p);return p;
}

export function addOpenWorld(level:LevelData):LevelData {
 level.openWorld=true;level.mapWidth=16600;
 // Open a real throat through the east curb; no invisible divider across the connection.
 level.curbSegments=level.curbSegments?.filter(c=>!(c.x>8050&&c.x<8500&&Math.abs(c.y-4500)<75));
 level.obstacles=level.obstacles.filter(o=>!(o.x>8150&&o.x<8800&&Math.abs(o.y-4500)<o.height/2+90));
 level.markings=level.markings.filter(m=>!(m.x>8150&&m.x<8410&&Math.abs(m.y-4500)<70));
 // Roadworks stay on the city-side shoulder of the connector, with a
 // clear traffic lane. Their visible cones share the collision objects.
 for(let i=0;i<7;i++)level.obstacles.push({id:`gateway-work-${i}`,x:8780+i*14,y:4580,width:4,height:4,rotation:0,elevation:worldHeight(8780+i*14,4580),verticalHeight:6,type:'cone',movable:true,weight:3,color:'#e99038'});
 level.training={title:'自由驾驶 · 城市与青岚山',tips:['东四城市街区连接虚构青岚山，无需完成停车任务即可自由探索','山路实线禁止跨越；弯前减速，注意坡度、砂石与浅水路段','暂停后可原地换车、切换场景，或前往地图上的目的地','青岚山为原创驾驶路线，不是北京真实山区的测绘复刻']};
 return level;
}
