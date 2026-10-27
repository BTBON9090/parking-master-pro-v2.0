import {sampleSlopeProfile} from './slopeProfile';
import {CatmullRomCurve3,Vector3} from 'three';
import type {LevelData,Vector2,Obstacle} from '../types';
export function buildHighway():LevelData{
 const loop=[[2600,1800],[6000,1800],[14000,1800],[24000,1800],[27500,1800],[28500,2800],[28500,6000],[28500,9500],[28500,11000],[27500,12000],[24000,12000],[14000,12000],[6000,12000],[2600,12000],[1500,11000],[1500,8000],[1500,5000],[1500,2800]].map(([x,y])=>({x,y}));
 const out:LevelData={levelId:13,highway:true,mapWidth:30000,mapHeight:14000,startPos:{x:4000,y:1856,rotation:0},spots:[],obstacles:[],markings:[],curvedRoads:[{points:loop,closed:true,width:320,color:'#3a3a3e',lanes:8,direction:'two-way'}],roadSurfaces:[],slopeZones:[],elevatedRoads:[],streetSigns:[],training:{title:'环线高速 · 双向八车道',tips:['每方向四条车道，主线限速 120 km/h；收费站、匝道降至 30','NPC 会跟车、让行、变道超车，保持安全车距','服务区可停车；互通支线、丘陵坡段与加速车道均可探索']}};
 const road=(p:number[][],width=76)=>out.curvedRoads!.push({points:p.map(([x,y])=>({x,y})),width,color:'#353539',lanes:width>100?4:2,direction:'one-way'});
 // Separate exit, service plaza and acceleration lane, each tangent to mainline.
 road([[6000,1940],[6800,2200],[7500,3100],[9200,3400],[10700,2900],[11500,2100],[12600,1940]],90);
 out.roadSurfaces!.push({x:8700,y:3370,width:2000,height:650,rotation:0,color:'#414549',curbs:false});
 for(let i=0;i<30;i++)out.spots.push({id:'service-'+i,x:7900+i*48,y:3530,width:34,height:80,rotation:Math.PI/2,occupied:false});
 road([[15800,1940],[17200,3000],[19000,5400],[21800,5600],[25000,3900],[27000,1940]],150);
 road([[19000,5400],[16600,6700],[12000,8000],[7000,10200],[5300,11860]],90);
 out.slopeZones!.push({x:21000,y:1800,width:340,length:6500,peakHeight:220,rotation:0});
 // Broad overpass crosses the mainline; its 140 m approaches keep grades sane.
 out.elevatedRoads!.push({id:'motorway-overpass',x:14000,y:1800,width:3400,height:110,rotation:Math.PI/2,deckHeight:65,rampLength:1400});
 const box=(id:string,x:number,y:number,w:number,h:number,z:number,elevation=0)=>out.obstacles.push({id,x,y,width:w,height:h,verticalHeight:z,elevation,rotation:0,type:'wall',movable:false,weight:0,color:'#879390'});
 // Toll array sits across the service bypass, not across a 120 km/h through lane.
 out.roadSurfaces!.push({x:8700,y:3090,width:650,height:600,rotation:0,color:'#3a3a3e',curbs:false});
 for(let n=0;n<6;n++){box('toll-island-'+n,8460+n*96,3130,10,160,12);box('toll-booth-'+n,8460+n*96,3090,18,28,29);}
 box('toll-roof',8700,3100,560,160,5,58);
 for(const [x,y,label] of [[5000,1550,'服务区 / 收费站  500m'],[15000,1550,'互通出口  右侧驶出'],[21500,1550,'连续起伏坡  保持车距'],[26000,12300,'环线高速  限速 120'],[9000,3650,'停车休息  服务区']] as const)out.streetSigns!.push({x,y,rotation:0,label,kind:'street'});
 // One barrier per straight run; bends use longer shared segments, not tiny blocks.
 const curve=new CatmullRomCurve3(loop.map(p=>new Vector3(p.x,0,p.y)),true,'centripetal');
 const path=curve.getSpacedPoints(360).slice(0,-1);
 // Shared long rail segments with open acceleration-lane mouths.
 for(let i=0;i<path.length;i++)for(const side of [-1,0,1]){
  const a=path[i],b=path[(i+1)%path.length],dx=b.x-a.x,dy=b.z-a.z,d=Math.hypot(dx,dy);
  const x=(a.x+b.x)/2-dy/d*side*165,y=(a.z+b.z)/2+dx/d*side*165;
  if(side===1 && y<2400 && ((x>5500&&x<13000)||(x>15000&&x<27800)))continue;
  const id=`motorway-rail-${i}-${side}`;
  const elevation=Math.abs(y-1800)<180&&Math.abs(x-21000)<3250?sampleSlopeProfile(x-21000,6500,220).height:0;
  out.obstacles.push({id,x,y,elevation,width:d+.5,height:side===0?5:3,rotation:Math.atan2(dy,dx),type:'wall',movable:false,weight:0,color:side===0?'#9c9e99':'#a1a8a8',verticalHeight:side===0?7:8});
 }
 // Spawn on the authored lane, never a guessed straight-line coordinate.
 const spawn=path.reduce((a,b)=>Math.abs(a.x-4000)+Math.abs(a.z-1800)<Math.abs(b.x-4000)+Math.abs(b.z-1800)?a:b);
 const si=path.indexOf(spawn),sp=path[(si+1)%path.length].clone().sub(path[(si+path.length-1)%path.length]).normalize();
 out.startPos={x:spawn.x-sp.z*56.25,y:spawn.z+sp.x*56.25,rotation:Math.atan2(sp.z,sp.x)};
 const lanePaths:Vector2[][]=[];
 for(let direction=0;direction<2;direction++)for(let lane=0;lane<4;lane++){
  const points=path.map((p,i)=>{const tangent=path[(i+1)%path.length].clone().sub(path[(i+path.length-1)%path.length]).normalize();const off=(18.75+lane*37.5)*(direction?-1:1);return{x:p.x-tangent.z*off,y:p.z+tangent.x*off};});
  lanePaths.push(direction?points.reverse():points);
 }
 for(let n=0;n<16;n++){
  const lane=n%8,points=lanePaths[lane],index=(20+n*23)%points.length,p=points[index],q=points[(index+1)%points.length];
  const ai:NonNullable<Obstacle['ai']>={path:points,currentPathIndex:(index+1)%points.length,speed:3+n%4*.3,maxSpeed:5+(n%4)*.7,state:'drive',laneIndex:lane%4,lanePaths:lanePaths.slice(lane<4?0:4,lane<4?4:8),incidentAt:n===3?240000:undefined};
  out.obstacles.push({id:'highway-traffic-'+n,...p,width:19,height:46,rotation:Math.atan2(q.y-p.y,q.x-p.x),type:'car',movable:true,weight:1350+n%4*180,color:['#bdb8a9','#557487','#95766a','#727f67'][n%4],ai});
 }
 for(const [x,y,w,h] of [[15000,0,30000,10],[15000,14000,30000,10],[0,7000,10,14000],[30000,7000,10,14000]])box('highway-boundary-'+x+'-'+y,x,y,w,h,30);
 return out;
}
