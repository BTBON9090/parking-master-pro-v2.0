import {sampleSlopeProfile} from './slopeProfile';
import {CatmullRomCurve3,Vector3} from 'three';
import type {LevelData,Vector2,Obstacle} from '../types';
export function buildHighway():LevelData{
 const loop=[[2600,1800],[6000,1800],[14000,1800],[24000,1800],[27000,2400],[28100,4200],[27000,6400],[28000,8500],[26600,11400],[23600,12200],[21400,10800],[18400,11200],[15600,12500],[11500,12000],[8200,10800],[5300,11860],[2900,11500],[1700,9400],[2600,7500],[1400,4900],[1500,2800]].map(([x,y])=>({x,y}));
 // Acceleration lanes follow the actual ring tangent for a full 300 metres.
 const ring=new CatmullRomCurve3(loop.map(p=>new Vector3(p.x,0,p.y)),true,'centripetal');
 const ringSamples=ring.getSpacedPoints(1200),ringLength=ring.getLength();
 const merge=(x:number,y:number)=>{let index=0;ringSamples.forEach((p,i)=>{if(Math.hypot(p.x-x,p.z-y)<Math.hypot(ringSamples[index].x-x,ringSamples[index].z-y))index=i;});return [0,1500,3000].map((distance,i)=>{const t=(index/1200+distance/ringLength)%1,p=ring.getPointAt(t),d=ring.getTangentAt(t),off=i===2?138:194;return[p.x-d.z*off,p.z+d.x*off];});};
 const out:LevelData={levelId:13,highway:true,mapWidth:30000,mapHeight:14000,startPos:{x:4000,y:1856,rotation:0},spots:[],obstacles:[],markings:[],curvedRoads:[{points:loop,closed:true,width:320,color:'#3a3a3e',lanes:8,direction:'two-way'}],roadSurfaces:[],slopeZones:[],elevatedRoads:[],streetSigns:[],training:{title:'环线高速 · 双向八车道',tips:['每方向四条车道，主线限速 120 km/h；收费站、匝道降至 30','NPC 会跟车、让行、变道超车，保持安全车距','服务区可停车；互通支线、丘陵坡段与加速车道均可探索']}};
 const road=(p:number[][],width=76)=>out.curvedRoads!.push({points:p.map(([x,y])=>({x,y})),width,color:'#353539',lanes:width>100?4:2,direction:'one-way'});
 // Separate exit, service plaza and acceleration lane, each tangent to mainline.
 road([[3000,1940],[4500,1990],[6000,1990],[6800,2200],[7500,3100],[9200,3400],[10700,2900],[11500,2100],[12600,1990],[14100,1990],[15600,1940]],90);
 out.roadSurfaces!.push({x:8700,y:3370,width:2000,height:650,rotation:0,color:'#414549',curbs:false});
 for(let i=0;i<30;i++)out.spots.push({id:'service-'+i,x:7900+i*48,y:3530,width:34,height:80,rotation:Math.PI/2,occupied:false});
 road([[12800,1940],[14300,1990],[15800,1990],[17200,3000],[19000,5400],[21800,5600],[25000,3900],...merge(27000,2400)],150);
 road([[19000,5400],[16600,6700],[12000,8000],[7000,10200],...merge(5300,11860)],90);
 // A marked turnaround joins the inner lanes. Construct it from the actual
 // ring tangent so the existing connector logic opens the central barrier.
 const turnIndex=ringSamples.reduce((best,p,i)=>Math.hypot(p.x-10500,p.z-1800)<Math.hypot(ringSamples[best].x-10500,ringSamples[best].z-1800)?i:best,0);
 const turnPoint=ringSamples[turnIndex],turnTangent=ring.getTangentAt(turnIndex/1200),turnRadius=112.5;
 const turnaround=Array.from({length:17},(_,i)=>{
  const angle=Math.PI*i/16,along=turnRadius*Math.sin(angle),across=turnRadius*Math.cos(angle);
  return [turnPoint.x+turnTangent.x*along-turnTangent.z*across,turnPoint.z+turnTangent.z*along+turnTangent.x*across];
 });
 road(turnaround,48);
 out.streetSigns!.push({x:turnPoint.x-turnTangent.x*650-turnTangent.z*145,y:turnPoint.z-turnTangent.z*650+turnTangent.x*145,rotation:0,label:'前方掉头路段  减速让行',kind:'street'});
 out.markings.push({type:'arrow-uturn',x:turnaround[0][0]-turnTangent.x*100,y:turnaround[0][1]-turnTangent.z*100,width:24,height:44,rotation:Math.atan2(turnTangent.z,turnTangent.x),color:'#f5e7ae'});
 out.slopeZones!.push({x:21000,y:1800,width:340,length:6500,peakHeight:220,rotation:0});
 // Broad overpass crosses the mainline; its 140 m approaches keep grades sane.
 out.elevatedRoads!.push({id:'motorway-overpass',x:14000,y:1800,width:3400,height:110,rotation:Math.PI/2,deckHeight:65,rampLength:1400});
 const box=(id:string,x:number,y:number,w:number,h:number,z:number,elevation=0)=>out.obstacles.push({id,x,y,width:w,height:h,verticalHeight:z,elevation,rotation:0,type:'wall',movable:false,weight:0,color:'#879390'});
 // Toll array sits across the service bypass, not across a 120 km/h through lane.
 out.roadSurfaces!.push({x:8700,y:3090,width:650,height:600,rotation:0,color:'#3a3a3e',curbs:false});
 for(let n=0;n<6;n++){box('toll-island-'+n,8460+n*96,3130,10,160,12);box('toll-booth-'+n,8460+n*96,3090,18,28,29);}
 box('toll-roof',8700,3100,560,160,5,58);
 for(const [x,y,label] of [[3000,1550,'服务区出口  300m · 减速车道'],[5000,1550,'服务区出口  100m'],[12800,1550,'互通出口  300m · 减速车道'],[14800,1550,'互通出口  100m · 右侧驶出'],[21500,1550,'连续起伏坡  保持车距'],[26000,12300,'环线高速  限速 120'],[9000,3650,'停车休息  服务区']] as const)out.streetSigns!.push({x,y,rotation:0,label,kind:'street'});
 // A compact city skyline beyond the northern highway shoulder. These are
 // real colliders using the same authored dimensions as their instanced visuals;
 // road-clearance checks still remove any that overlap a road.
 for(let row=0;row<3;row++)for(let col=0;col<10;col++){
  const x=3200+col*860+(row%2)*90,y=350+row*290;
  out.obstacles.push({id:`bj-building-highway-${row}-${col}`,x,y,width:140,height:130,rotation:0,type:'wall',movable:false,weight:0,color:['#9b9d92','#8d9795','#aaa69a'][col%3],verticalHeight:90+(col*23+row*17)%110});
 }
 // One barrier per straight run; bends use longer shared segments, not tiny blocks.
 const curve=new CatmullRomCurve3(loop.map(p=>new Vector3(p.x,0,p.y)),true,'centripetal');
 const path=curve.getSpacedPoints(360).slice(0,-1);
 // Cut precise openings wherever an authored connector joins or crosses the
 // ring. Coordinate guesses can leave a guardrail across the merge lane.
 const connectorSamples=out.curvedRoads!.slice(1).map(road=>{
  const curve=new CatmullRomCurve3(road.points.map(p=>new Vector3(p.x,0,p.y)),false,'centripetal');
  return {radius:road.width/2+40,points:curve.getSpacedPoints(Math.ceil(curve.getLength()/60))};
 });
 const opensForConnector=(ax:number,ay:number,bx:number,by:number)=>{
  const dx=bx-ax,dy=by-ay,len2=dx*dx+dy*dy;
  return connectorSamples.some(({radius,points})=>points.some(p=>{
   const t=Math.max(0,Math.min(1,((p.x-ax)*dx+(p.z-ay)*dy)/len2));
   const ex=p.x-(ax+dx*t),ey=p.z-(ay+dy*t);return ex*ex+ey*ey<radius*radius;
  }));
 };
 // Shared long rail segments with openings for actual connector geometry.
 for(let i=0;i<path.length;i++)for(const side of [-1,0,1]){
  const a=path[i],b=path[(i+1)%path.length],dx=b.x-a.x,dy=b.z-a.z,d=Math.hypot(dx,dy);
  const x=(a.x+b.x)/2-dy/d*side*165,y=(a.z+b.z)/2+dx/d*side*165;
  const ox=-dy/d*side*165,oy=dx/d*side*165;
  if(opensForConnector(a.x+ox,a.z+oy,b.x+ox,b.z+oy))continue;
  const id=`motorway-rail-${i}-${side}`;
  const elevation=Math.abs(y-1800)<180&&Math.abs(x-21000)<3250?sampleSlopeProfile(x-21000,6500,220).height:0;
  out.obstacles.push({id,x,y,elevation,width:d+.5,height:side===0?5:4,rotation:Math.atan2(dy,dx),type:'wall',movable:false,weight:0,color:side===0?'#9c9e99':'#a1a8a8',verticalHeight:side===0?8:15});
 }
 // Mountain tunnel aligned to a sampled mainline segment. Side walls stay
 // outside all eight lanes; the roof has an explicit clearance layer.
 const tunnelIndices=[[27100,6400],[2100,9400]].map(([x,y])=>path.reduce((best,p,i)=>Math.abs(p.x-x)+Math.abs(p.z-y)<Math.abs(path[best].x-x)+Math.abs(path[best].z-y)?i:best,0));
 for(const [t,tunnelIndex] of tunnelIndices.entries())for(let j=-2;j<=2;j++){
  const p=path[(tunnelIndex+j+path.length)%path.length],q=path[(tunnelIndex+j+1+path.length)%path.length],dx=q.x-p.x,dy=q.z-p.z,len=Math.hypot(dx,dy),rotation=Math.atan2(dy,dx),x=(p.x+q.x)/2,y=(p.z+q.z)/2;
  for(const side of [-1,1])out.obstacles.push({id:`tunnel-wall-${t}-${j}-${side}`,x:x-dy/len*side*190,y:y+dx/len*side*190,width:len+2,height:25,rotation,type:'wall',weight:0,movable:false,color:'#66716b',verticalHeight:100});
  out.obstacles.push({id:`tunnel-roof-${t}-${j}`,x,y,width:len+2,height:405,rotation,type:'wall',weight:0,movable:false,color:'#66716b',elevation:92,verticalHeight:20});
 }
 // An incident occupies only the outer lane; traffic can merge around it.
 const incident=path[190],next=path[191],heading=Math.atan2(next.z-incident.z,next.x-incident.x);
 for(let i=0;i<9;i++)out.obstacles.push({id:'incident-cone-'+i,x:incident.x+Math.cos(heading)*(i*13-130)-Math.sin(heading)*(135-i*2),y:incident.z+Math.sin(heading)*(i*13-130)+Math.cos(heading)*(135-i*2),width:3,height:3,rotation:0,type:'cone',weight:4,movable:true,color:'#ea8d38',verticalHeight:6});
 out.obstacles.push({id:'incident-stopped-car',x:incident.x-Math.sin(heading)*131,y:incident.z+Math.cos(heading)*131,width:20,height:48,rotation:heading,type:'car',weight:1900,movable:true,color:'#a96042'});
 // Spawn on the authored lane, never a guessed straight-line coordinate.
 const spawn=path.reduce((a,b)=>Math.abs(a.x-4000)+Math.abs(a.z-1800)<Math.abs(b.x-4000)+Math.abs(b.z-1800)?a:b);
 const si=path.indexOf(spawn),sp=path[(si+1)%path.length].clone().sub(path[(si+path.length-1)%path.length]).normalize();
 out.startPos={x:spawn.x-sp.z*56.25,y:spawn.z+sp.x*56.25,rotation:Math.atan2(sp.z,sp.x)};
 const lanePaths:Vector2[][]=[];
 for(let direction=0;direction<2;direction++)for(let lane=0;lane<4;lane++){
  const points=path.map((p,i)=>{const tangent=path[(i+1)%path.length].clone().sub(path[(i+path.length-1)%path.length]).normalize();const off=(18.75+lane*37.5)*(direction?-1:1);return{x:p.x-tangent.z*off,y:p.z+tangent.x*off};});
  lanePaths.push(direction?points.reverse():points);
 }
 for(let n=0;n<48;n++){
  const lane=n%8,points=lanePaths[lane];
  // Extra traffic starts near the entry so the higher density is observable;
  // alternating directions keep cars on their own carriageway.
  const spawnIndex=points.reduce((best,p,i)=>Math.hypot(p.x-out.startPos.x,p.y-out.startPos.y)<Math.hypot(points[best].x-out.startPos.x,points[best].y-out.startPos.y)?i:best,0);
  const rank=Math.floor(n/8),index=(spawnIndex+[4,12,6,8,10,14][rank])%points.length,p=points[index],q=points[(index+1)%points.length];
  const maxSpeed=[115,105,95,85][lane%4]/15;
  const ai:NonNullable<Obstacle['ai']>={path:points,currentPathIndex:(index+1)%points.length,speed:maxSpeed,maxSpeed,state:'drive',laneIndex:lane%4,lanePaths:lanePaths.slice(lane<4?0:4,lane<4?4:8),incidentAt:n===3?240000:undefined};
  out.obstacles.push({id:'highway-traffic-'+n,...p,width:19,height:46,rotation:Math.atan2(q.y-p.y,q.x-p.x),type:'car',movable:true,weight:1350+n%4*180,color:['#bdb8a9','#557487','#95766a','#727f67'][n%4],ai});
 }
 for(const [x,y,w,h] of [[15000,0,30000,10],[15000,14000,30000,10],[0,7000,10,14000],[30000,7000,10,14000]])box('highway-boundary-'+x+'-'+y,x,y,w,h,30);
 return out;
}

/** Reflective curve-direction boards on both carriageways. A turn is measured
 * over a neighbourhood, rather than a single noisy segment. */
export function highwayBendMarkers(level:LevelData):Array<{x:number;y:number;roadX:number;roadY:number;heading:number;arrow:number}>{
 const road=level.highway?level.curvedRoads?.[0]:undefined;
 if(!road||road.points.length<4)return [];
 const points=new CatmullRomCurve3(road.points.map(p=>new Vector3(p.x,0,p.y)),true,'centripetal').getSpacedPoints(360).slice(0,-1);
 const out:Array<{x:number;y:number;roadX:number;roadY:number;heading:number;arrow:number}>=[];
 for(let i=0;i<points.length;i+=2){
  const a=points[(i-3+points.length)%points.length],p=points[i],b=points[(i+3)%points.length];
  const h0=Math.atan2(p.z-a.z,p.x-a.x),h1=Math.atan2(b.z-p.z,b.x-p.x);
  const turn=Math.atan2(Math.sin(h1-h0),Math.cos(h1-h0));
  if(Math.abs(turn)<.14)continue;
  const heading=Math.atan2(b.z-a.z,b.x-a.x);
  for(const side of [-1,1]){
   const direction=side===1?1:-1;
   out.push({x:p.x-Math.sin(heading)*side*186,y:p.z+Math.cos(heading)*side*186,roadX:p.x,roadY:p.z,
    heading:heading+(direction<0?Math.PI:0),arrow:-Math.sign(turn)*direction});
  }
 }
 return out;
}

/** These structures must be rendered from their collider, never as random buildings. */
export function isHighwayStructure(o:Pick<Obstacle,'id'>):boolean {return /^(tunnel-(wall|roof)-|toll-(roof|booth|island)-|motorway-rail-)/.test(o.id);}
