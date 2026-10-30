import {WORLD_ROUTES} from './openWorld';
import {CatmullRomCurve3,Vector3} from 'three';
import type {Obstacle} from '../types';
export const MOUNTAIN_LIFT={x:44050,y:1700,width:260,depth:180,bottom:0,top:10000,duration:80};
let movingLiftHeight:number|null=null;
export const setMountainLiftHeight=(height:number|null)=>{movingLiftHeight=height;};
export const inMountainLift=(x:number,y:number,margin=0)=>Math.abs(x-MOUNTAIN_LIFT.x)<=MOUNTAIN_LIFT.width/2-margin&&Math.abs(y-MOUNTAIN_LIFT.y)<=MOUNTAIN_LIFT.depth/2-margin;
export function liftSurface(x:number,y:number,hint:number){
 if(!inMountainLift(x,y))return null;
 const height=movingLiftHeight??(hint>5000?MOUNTAIN_LIFT.top:MOUNTAIN_LIFT.bottom);
 return Math.abs(height-hint)<35?{height,gradeX:0,gradeY:0}:null;
}
const tunnelCurve=new CatmullRomCurve3([[44050,0,1700],[44540,0,1700],[44900,0,2550],[43300,0,3900],[42400,0,6000],[39700,0,6500],[38600,0,9100],[35700,0,10400],[36000,0,12700],[32800,0,14400],[30800,0,13600],[28600,0,15300],[27800,0,17900],[25100,0,18200],[24300,0,18210],[23700,0,18210],[23100,0,18210]].map(p=>new Vector3(...p as [number,number,number])),false,'centripetal');
export const MOUNTAIN_TUNNEL_WIDTH=150;
export const MOUNTAIN_TUNNEL=tunnelCurve.getSpacedPoints(Math.ceil(tunnelCurve.getLength()/45)).map((p,i,ps)=>{
 const a=ps[Math.max(0,i-1)],b=ps[Math.min(ps.length-1,i+1)],len=Math.hypot(b.x-a.x,b.z-a.z)||1;
 return {x:p.x,y:p.z,h:p.y,nx:-(b.z-a.z)/len,ny:(b.x-a.x)/len};
});
const cellSize=180,cells=new Map<string,number[]>();
for(let i=1;i<MOUNTAIN_TUNNEL.length;i++){
 const a=MOUNTAIN_TUNNEL[i-1],b=MOUNTAIN_TUNNEL[i],r=MOUNTAIN_TUNNEL_WIDTH/2+8;
 for(let x=Math.floor((Math.min(a.x,b.x)-r)/cellSize);x<=Math.floor((Math.max(a.x,b.x)+r)/cellSize);x++)for(let y=Math.floor((Math.min(a.y,b.y)-r)/cellSize);y<=Math.floor((Math.max(a.y,b.y)+r)/cellSize);y++){
  const key=x+','+y;if(!cells.has(key))cells.set(key,[]);cells.get(key)!.push(i);
 }
}
export function mountainTunnelSample(x:number,y:number,hint:number){
 if(Math.abs(hint)>40)return null;
 let distance=Infinity;
 for(const i of cells.get(Math.floor(x/cellSize)+','+Math.floor(y/cellSize))??[]){const a=MOUNTAIN_TUNNEL[i-1],b=MOUNTAIN_TUNNEL[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));distance=Math.min(distance,Math.hypot(x-a.x-t*dx,y-a.y-t*dy));}
 return distance<=MOUNTAIN_TUNNEL_WIDTH/2+2?{height:0,gradeX:0,gradeY:0}:null;
}
/** Shared opening test for rendered walls and collision walls at the city fork. */
export function mountainTunnelSideOpen(i:number,side:number){
 const a=MOUNTAIN_TUNNEL[i-1],b=MOUNTAIN_TUNNEL[i],off=side*(MOUNTAIN_TUNNEL_WIDTH/2+2);
 const x=(a.x+b.x+(a.nx+b.nx)*off)/2,y=(a.y+b.y+(a.ny+b.ny)*off)/2;
 if(inMountainLift(x,y)||i>MOUNTAIN_TUNNEL.length-5)return true;
 const gateway=WORLD_ROUTES.find(r=>r.id==='gateway')!;
 return x<24600&&gateway.samples.some(p=>p.h<60&&Math.hypot(x-p.x,y-p.y)<gateway.width/2+30);
}
export function mountainAdventureObstacles():Obstacle[]{
 const out:Obstacle[]=[];
 const wall=(id:string,x:number,y:number,width:number,height:number,rotation:number,elevation:number,verticalHeight:number)=>out.push({id,x,y,width,height,rotation,elevation,verticalHeight,type:'wall',movable:false,weight:0,color:'#586168',collisionOnly:true});
 for(let i=1;i<MOUNTAIN_TUNNEL.length;i++){
  const a=MOUNTAIN_TUNNEL[i-1],b=MOUNTAIN_TUNNEL[i];
  for(const side of [-1,1]){const off=side*(MOUNTAIN_TUNNEL_WIDTH/2+2),ax=a.x+a.nx*off,ay=a.y+a.ny*off,bx=b.x+b.nx*off,by=b.y+b.ny*off;
   // Lift platform and city mouth have no lateral wall across their connection.
   if(mountainTunnelSideOpen(i,side))continue;
   wall(`mountain-tunnel-${i}-${side}`,(ax+bx)/2,(ay+by)/2,Math.hypot(bx-ax,by-ay)+.2,4,Math.atan2(by-ay,bx-ax),0,90);
  }
  if(!inMountainLift((a.x+b.x)/2,(a.y+b.y)/2,-25))wall(`mountain-tunnel-roof-${i}`,(a.x+b.x)/2,(a.y+b.y)/2,Math.hypot(b.x-a.x,b.y-a.y)+.2,155,Math.atan2(b.y-a.y,b.x-a.x),90,6);
 }
 wall('mountain-lift-front',MOUNTAIN_LIFT.x+134,MOUNTAIN_LIFT.y,8,200,0,90,9950);
 wall('mountain-lift-rear',MOUNTAIN_LIFT.x-134,MOUNTAIN_LIFT.y,8,200,0,0,9960);
 for(const side of [-1,1])wall('mountain-lift-jamb-'+side,MOUNTAIN_LIFT.x+132,MOUNTAIN_LIFT.y+side*85.5,5,21,0,0,90);
 // Shaft side walls, west door at summit and east door at tunnel floor.
 for(const side of [-1,1])wall('mountain-lift-wall-'+side,MOUNTAIN_LIFT.x,MOUNTAIN_LIFT.y+side*96,280,8,0,0,10050);
 wall("mountain-summit-secret",43650,1608,52,52,0,10000,4);
 return out;
}
/** Clip an exact rectangular shaft out of existing triangles, preserving their
 * original plane and interpolated colours outside the hole. */
export function cutLiftOpening(positions:number[],indices:number[],colors?:number[]){
 const l=MOUNTAIN_LIFT,left=l.x-l.width/2,right=l.x+l.width/2,top=l.y-l.depth/2,bottom=l.y+l.depth/2;
 const output:number[]=[];
 const clip=(poly:number[][],axis:number,bound:number,greater:boolean)=>{
  const result:number[][]=[];
  for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ia=greater?a[axis]>=bound:a[axis]<=bound,ib=greater?b[axis]>=bound:b[axis]<=bound;
   if(ia)result.push(a);if(ia!==ib){const t=(bound-a[axis])/(b[axis]-a[axis]);result.push(a.map((v,j)=>v+(b[j]-v)*t));}}
  return result;
 };
 for(let n=0;n<indices.length;n+=3){
  const ids=indices.slice(n,n+3),xs=ids.map(i=>positions[i*3]),ys=ids.map(i=>positions[i*3+2]);
  if(Math.max(...xs)<=left||Math.min(...xs)>=right||Math.max(...ys)<=top||Math.min(...ys)>=bottom){output.push(...ids);continue;}
  let poly=ids.map(i=>[...positions.slice(i*3,i*3+3),...(colors?.slice(i*3,i*3+3)??[])]);
  for(const [axis,bound,greater] of [[0,left,true],[0,right,false],[2,top,true],[2,bottom,false]] as const){
   const outside=clip(poly,axis,bound,!greater);poly=clip(poly,axis,bound,greater);
   if(outside.length>=3){const start=positions.length/3;for(const v of outside){positions.push(...v.slice(0,3));if(colors)colors.push(...v.slice(3,6));}for(let j=1;j<outside.length-1;j++)output.push(start,start+j,start+j+1);}
   if(!poly.length)break;
  }
 }
 return output;
}
