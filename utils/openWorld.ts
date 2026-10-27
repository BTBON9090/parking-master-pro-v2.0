import { CatmullRomCurve3, Vector3 } from 'three';
import type { CurvedRoadSurface, LevelData } from '../types';

export interface RouteSample { x:number; y:number; h:number; distance:number; nx:number; ny:number; }
export interface WorldRoute { id:string; label:string; width:number; gravel?:boolean; closed?:boolean; points:number[][]; samples:RouteSample[]; }
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
export const CITY_OFFSET=15000;
export const WORLD_TERRAIN_STEP=120;
export const MOUNTAIN_BOUNDS={x0:0,x1:46000,y0:0,y1:44000};
export const inCity=(x:number,y:number)=>x>=CITY_OFFSET&&x<=CITY_OFFSET+8500&&y>=CITY_OFFSET&&y<=CITY_OFFSET+11600;
const expand=(x:number,y:number)=>({x:23600+(x-8600)*2,y:16300+(y-1300)*2});
function route(id:string,label:string,width:number,points:number[][],closed=false,gravel=false):WorldRoute {
 if(!id.startsWith('new-'))points=points.map(([x,y,h])=>{const p=expand(x,y);return[p.x,p.y,h*4];});
 if(id==='gateway')points=[[23185,19500,0],[23650,19500,0],[24200,20000,15],[25000,21600,80],[26000,22300,150],[26800,22300,220]];
 const curve=new CatmullRomCurve3(points.map(p=>new Vector3(p[0],id==='new-cloud'?0:p[2],p[1])),closed,'centripetal');
 curve.arcLengthDivisions=points.length*600;curve.updateArcLengths();
 const samples:RouteSample[]=[];
 const ps=curve.getSpacedPoints(Math.ceil(curve.getLength()/18));
 if(id==='new-cloud')ps.forEach((p,i)=>{const t=curve.getUtoTmapping(i/(ps.length-1),0)*(points.length-1),k=Math.min(points.length-2,Math.floor(t));p.y=points[k][2]+(points[k+1][2]-points[k][2])*smooth(t-k);});
 let distance=0;
 ps.forEach((p,i)=>{
  if(i)distance+=p.distanceTo(ps[i-1]);
  const a=ps[closed&&i===0?ps.length-2:Math.max(0,i-1)],b=ps[closed&&i===ps.length-1?1:Math.min(ps.length-1,i+1)],d=Math.hypot(b.x-a.x,b.z-a.z)||1;
  samples.push({x:p.x,y:p.z,h:Math.max(0,p.y),distance,nx:-(b.z-a.z)/d,ny:(b.x-a.x)/d});
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

 route('new-orbit','环城山脉公路',88,[[42000,29000,1900],[33000,35000,2200],[23000,38000,2500],[10000,34000,2100],[3500,26000,2800],[3000,15000,3200],[10000,6000,2700],[21000,2500,3200],[33000,4500,3400],[39000,13500,3000],[42200,20500,2400]],true),
 route('new-join','北岭联络路',78,[[34200,19500,1880],[34000,17500,2050],[36500,15500,2600],[39000,13500,3000]]),
 route('new-cloud','千米云顶盘山路',65,[[39000,13500,3000],[42000,12700,3500],[40000,11000,4300],[44000,10000,5000],[40500,8300,5800],[43500,6800,6600],[39800,5700,7400],[44000,4100,8300],[40000,2700,9100],[43700,1700,10000]]),
 route('new-cliff','外崖碎石险道',42,[[10000,34000,2100],[11000,31000,2400],[8500,30500,2550],[9000,28400,2700],[6500,27600,2800],[3500,26000,2800]],false,true),
 route('new-summit-pad','云顶停车坪',240,[[43500,1700,10000],[44200,1700,10000]]),
];
export const WORLD_PLACES=[

 {label:'山路入口',x:9220,y:4550,color:'#a8d5a1'},
 {label:'回头弯',x:12380,y:3520,color:'#f6cb73'},
 {label:'云顶观景台',x:15330,y:2410,color:'#b4dfd5'},
 {label:'浅水 / 坑洼',x:11700,y:4800,color:'#8dc6dc'},
 {label:'林场窄路 · 会车让行',x:13000,y:4400,color:'#eac783'},
 {label:'连续回头弯 · 慢行',x:13270,y:4620,color:'#eac783'},
 {label:'青岚山环线',x:13700,y:6500,color:'#a8d5a1'},
].map(p=>({...p,...expand(p.x,p.y)})).concat([{label:'城市 · CBD',x:19300,y:16800,color:'#b3bac2'},{label:'云顶 1000 m',x:43700,y:1700,color:'#f1d39c'},{label:'西岭外崖',x:6500,y:31000,color:'#e9b383'}]);
export const WORLD_DESTINATIONS=[
 {label:'城市起点',x:8190,y:4500,rotation:0},
 {label:'山路入口',x:9160,y:4670,rotation:-.08},
 {label:'山腰回头弯',x:12100,y:4040,rotation:-.15},
 {label:'云顶观景线',x:15100,y:2400,rotation:.28},
 {label:'林场窄路挑战',x:12500,y:4770,rotation:0},
 {label:'溪谷砂石路',x:11750,y:4480,rotation:Math.PI/2},
].map(p=>({...p,...expand(p.x,p.y)})).concat([{label:'千米云顶停车坪',x:43800,y:1700,rotation:0},{label:'西岭外崖险道',x:6500,y:31000,rotation:0}]).map(place=>{
 if(place.label==='城市起点')return {...place,x:23185,y:19522,rotation:0};
 let best=WORLD_ROUTES[0].samples[0],width=90,distance=Infinity;
 for(const r of WORLD_ROUTES)for(const p of r.samples){const d=Math.hypot(place.x-p.x,place.y-p.y);if(d<distance){best=p;width=r.width;distance=d;}}
 return {...place,x:best.x+best.nx*width/4,y:best.y+best.ny*width/4,rotation:Math.atan2(-best.nx,best.ny)};
});
// Puddles are shallow bowls in the actual tyre support surface, not decals on flat tarmac.
export const WORLD_PUDDLES=[{x:13000,y:4400,rx:15,ry:24,depth:.65},{x:11702,y:4790,rx:17,ry:30,depth:.85},{x:12195,y:5200,rx:22,ry:16,depth:.65}].map(p=>({...p,...expand(p.x,p.y)}));
type Segment={a:RouteSample;b:RouteSample;route:WorldRoute;index:number};
const CELL=160,buckets=new Map<string,Segment[]>();
for(const r of WORLD_ROUTES)for(let i=1;i<r.samples.length;i++){
 const a=r.samples[i-1],b=r.samples[i],s={a,b,route:r,index:i-1},pad=r.width/2+100;
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
 const closest:Array<{distance:number;height:number;route:WorldRoute;along:number;index:number}>=[];
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
  if(bestSegment){const s=bestSegment,t=bestT;closest.push({distance:Math.sqrt(best),height:s.a.h+(s.b.h-s.a.h)*t,route:s.route,index:s.index,along:s.a.distance+(s.b.distance-s.a.distance)*t});}
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
 const edge=Math.max(Math.max(15000-x,0,x-23500),Math.max(15000-y,0,y-26600));
 const urbanFade=smooth(edge/1400);
 const raw=envelope*urbanFade*(500+gauss(43500,1700,4400,4200,11000)+gauss(3500,17000,4000,10000,3600)+gauss(20000,37000,15000,3000,3000)+gauss(20000,3500,14000,3300,3800));
 let nearest=Infinity,h=0;
 for(const s of broadSegments){
  if(Math.abs(x-s.a.x)>3000||Math.abs(y-s.a.y)>3000)continue;
  const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,t=clamp(((x-s.a.x)*dx+(y-s.a.y)*dy)/(dx*dx+dy*dy||1));
  const d=Math.hypot(x-s.a.x-t*dx,y-s.a.y-t*dy);
  if(d<nearest){nearest=d;h=s.a.h+(s.b.h-s.a.h)*t;}
 }
 const blend=1-smooth((nearest-45)/650),result=raw*(1-blend)+h*blend;
 bedCache.set(key,result);return result;
}
function terrainBed(x:number,y:number){
 const step=WORLD_TERRAIN_STEP,x0=Math.floor(x/step)*step,y0=Math.floor(y/step)*step,tx=(x-x0)/step,ty=(y-y0)/step;
 return (bedNode(x0,y0)*(1-tx)+bedNode(x0+step,y0)*tx)*(1-ty)+(bedNode(x0,y0+step)*(1-tx)+bedNode(x0+step,y0+step)*tx)*ty;
}
function designHeight(x:number,y:number,contacts=roadContacts(x,y)):number {
 const b=MOUNTAIN_BOUNDS;
 if(inCity(x,y)||x<b.x0||x>b.x1||y<b.y0||y>b.y1)return 0;
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
 const r=nearestWorldRoad(x,y),h=designHeight(x,y)-(r&&r.distance<r.route.width/2+220?40*(1-smooth((r.distance-r.route.width/2-80)/140)):0);
 terrainVertices.set(key,h);return h;
}
function terrainTriangleHeight(x:number,y:number):number {
 const b=MOUNTAIN_BOUNDS;
 if(inCity(x,y)||x<b.x0||x>b.x1||y<b.y0||y>b.y1)return designHeight(x,y);
 const step=WORLD_TERRAIN_STEP,x0=b.x0+Math.floor((x-b.x0)/step)*step,y0=b.y0+Math.floor((y-b.y0)/step)*step;
 const u=(x-x0)/step,v=(y-y0)/step,h00=terrainVertexHeight(x0,y0),h10=terrainVertexHeight(x0+step,y0),h01=terrainVertexHeight(x0,y0+step),h11=terrainVertexHeight(x0+step,y0+step);
 return u+v<=1?h00+(h10-h00)*u+(h01-h00)*v:h11+(h01-h11)*(1-u)+(h10-h11)*(1-v);
}
export function roadVertexHeight(x:number,y:number):number {
 if(inCity(x,y))return 0;
 const contacts=roadContacts(x,y),r=contacts[0],edge=r?r.distance-r.route.width/2:Infinity;
 if(edge<=0)return designHeight(x,y,contacts);
 const terrain=terrainTriangleHeight(x,y);
 if(edge>=60)return terrain;
 const t=smooth(edge/60);return designHeight(x,y,contacts)*(1-t)+terrain*t;
}
const ribbonOffsets=new Map(WORLD_ROUTES.map(r=>[r,Array.from({length:(r.gravel?12:8)+1},(_,j)=>(j/(r.gravel?12:8)-.5)*r.width)]));
for(const [r,offsets] of ribbonOffsets)for(let n=1;n<=12;n++){offsets.unshift(-r.width/2-n*5);offsets.push(r.width/2+n*5);}
const ribbonVertices=new Map<WorldRoute,Array<Array<{x:number;y:number;h:number}>>>();
function ribbonVertex(r:WorldRoute,i:number,j:number){
 let rows=ribbonVertices.get(r);if(!rows){rows=[];ribbonVertices.set(r,rows);}
 const row=rows[i]??(rows[i]=[]);if(row[j])return row[j];
 const off=ribbonOffsets.get(r)![j],p=r.samples[i],x=p.x+p.nx*off,y=p.y+p.ny*off;
 return row[j]={x,y,h:roadVertexHeight(x,y)};
}
function triangleHeight(x:number,y:number,a:{x:number;y:number;h:number},b:typeof a,c:typeof a){
 const d=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(d)<1e-10)return null;
 const u=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/d,v=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/d;
 return u>=-1e-7&&v>=-1e-7&&u+v<=1.0000001?u*a.h+v*b.h+(1-u-v)*c.h:null;
}
/** Exact same strip triangles as rendering. Analytic road design is used only
 * to author vertices; tyre contacts interpolate their faces, including crests. */
export function worldHeight(x:number,y:number):number{
 if(inCity(x,y))return 0;
 let best=-Infinity;
 for(const contact of roadContacts(x,y)){
  const r=contact.route;if(contact.distance>r.width/2+62)continue;
  const offsets=ribbonOffsets.get(r)!;
  // unshift is descending left-to-right; all cells use the road's diagonal.
  for(let i=Math.max(0,contact.index-1);i<=Math.min(r.samples.length-2,contact.index+1);i++){
   for(let j=0;j<offsets.length-1;j++){
    const a=ribbonVertex(r,i,j),b=ribbonVertex(r,i+1,j),c=ribbonVertex(r,i,j+1),d=ribbonVertex(r,i+1,j+1);
    const h=triangleHeight(x,y,a,b,c)??triangleHeight(x,y,c,b,d);if(h!==null)best=Math.max(best,h);
   }
  }
 }
 return Math.max(best,terrainTriangleHeight(x,y));
}
export function worldTreePlacements(){
 const out:{x:number;y:number;h:number;s:number}[]=[];
 for(let i=0;i<700;i++){
  const x=1200+((i*2081)%43000),y=900+((i*1297)%41500),r=nearestWorldRoad(x,y);
  if(inCity(x,y)||(r&&r.distance<r.route.width/2+65))continue;
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
 const offRoad=!inCity(x,y)&&!onRoad;
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
 level.openWorld=true;level.mapWidth=46000;level.mapHeight=44000;
 // Open a real throat through the east curb; no invisible divider across the connection.
 level.curbSegments=level.curbSegments?.filter(c=>!(c.x>8050&&c.x<8500&&Math.abs(c.y-4500)<75));
 level.obstacles=level.obstacles.filter(o=>!(o.x>8150&&o.x<8800&&Math.abs(o.y-4500)<o.height/2+90));
 level.markings=level.markings.filter(m=>!(m.x>8150&&m.x<8410&&Math.abs(m.y-4500)<70));
 // Roadworks stay on the city-side shoulder of the connector, with a
 // clear traffic lane. Their visible cones share the collision objects.

 // Translate the city once; mountain colliders already use expanded coordinates.
 const shifted=new WeakSet<object>();
 const shift=(p:{x:number;y:number})=>{if(shifted.has(p))return;shifted.add(p);p.x+=CITY_OFFSET;p.y+=CITY_OFFSET;};
 for(const key of ['spots','markings','roadSurfaces','slopeZones','elevatedRoads','streetSigns','curbSegments','intersections','terrainZones'] as const)for(const p of level[key]??[])shift(p);
 for(const p of level.obstacles)if(!p.id.startsWith('mountain-'))shift(p);
 shift(level.startPos);
 for(const r of level.curvedRoads??[]){r.points=r.points.map(p=>({...p}));r.points.forEach(shift);if(r.center)shift(r.center);r.markingGaps?.forEach(shift);}
 // Replace selected large city blocks with a varied CBD skyline and outer housing.
 let tower=0;
 for(const o of level.obstacles.filter(o=>o.id.startsWith('bj-building-'))){
   const localX=o.x-CITY_OFFSET,localY=o.y-CITY_OFFSET;
   if(localX<4800&&localY<6400){o.id='bj-building-tower-'+tower;o.verticalHeight=500+(tower*137)%1800;o.color=['#718b96','#8b989e','#617b88'][tower++%3];}
   else {o.id=o.id.replace(/bj-building-[^-]+/,'bj-building-residential');o.verticalHeight=180+(tower++%5)*40;}
 }
 for(const y of [15000+6400,15000+9300])for(let i=0;i<24;i++){
  const x=15000+1950+i*180;
  if(level.obstacles.some(o=>Math.abs(o.x-x)<o.width/2+45&&Math.abs(o.y-y)<o.height/2+65))continue;
  level.roadSurfaces!.push({x,y:y+65,width:160,height:130,rotation:0,color:'#4a4e4d',curbs:false});
  level.spots.push({id:`city-new-bay-${y}-${i}`,x,y,width:32,height:70,rotation:0,occupied:false});
 }
 for(const [x,y,rot] of [[19600,21400,0],[20900,23900,Math.PI/2]]){
  level.elevatedRoads!.push({id:`city-interchange-${x}`,x,y,width:2400,height:110,rotation:rot,deckHeight:65,rampLength:900});
  level.obstacles=level.obstacles.filter(o=>{const dx=o.x-x,dy=o.y-y,c=Math.cos(rot),s=Math.sin(rot);return !(Math.abs(dx*c+dy*s)<1250&&Math.abs(-dx*s+dy*c)<100);});
  level.streetSigns!.push({x:x-1200,y:y-90,rotation:rot,label:'城市快速路 / 居民区',kind:'street'});
 }
 for(let i=0;i<14;i++)level.spots.push({id:'summit-park-'+i,x:43550+i*42,y:1738,width:34,height:70,rotation:Math.PI/2,occupied:false,elevation:10000});
 level.training={title:'城市与环城青岚山 · 云顶 1000 m',tips:['CBD、居民区、立交与环城山脉相连；地图为原创北京风格训练世界','西岭碎石外崖无连续护栏，北岭盘山线通向海拔 1000 米停车坪','地图目的地可直接选择山路入口或云顶；事故后按 R 恢复']};
 return level;
}
