import type {LevelData,Vector2} from '../types';
import {mapCurveSamples} from './openWorld';
/** Remove paint through junction mouths while leaving the road mesh continuous. */
export function openCampusJunctions(level:LevelData){
 const paths=(level.curvedRoads??[]).map(c=>({points:mapCurveSamples(c),width:c.width}));
 for(const r of level.roadSurfaces??[]){
  if(Math.max(r.width,r.height)<Math.min(r.width,r.height)*2)continue;
  const angle=r.rotation+(r.width<r.height?Math.PI/2:0),d=Math.max(r.width,r.height)/2;
  paths.push({points:[{x:r.x-Math.cos(angle)*d,y:r.y-Math.sin(angle)*d},{x:r.x+Math.cos(angle)*d,y:r.y+Math.sin(angle)*d}],width:Math.min(r.width,r.height)});
 }
 const gaps:Array<Vector2&{radius:number}>=[],cross=(a:Vector2,b:Vector2)=>a.x*b.y-a.y*b.x;
 for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++){
  const a=paths[i],b=paths[j];
  for(let k=1;k<a.points.length;k++)for(let m=1;m<b.points.length;m++){
   const p=a.points[k-1],q=b.points[m-1],u={x:a.points[k].x-p.x,y:a.points[k].y-p.y},v={x:b.points[m].x-q.x,y:b.points[m].y-q.y};
   const den=cross(u,v),len=Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y);
   if(!len||Math.abs(den)/len<.35)continue; // parallel joins retain their edge paint
   const w={x:q.x-p.x,y:q.y-p.y},s=cross(w,v)/den,t=cross(w,u)/den;
   if(s<0||s>1||t<0||t>1)continue;
   const x=p.x+s*u.x,y=p.y+s*u.y,radius=(a.width+b.width)*.55+3;
   const existing=gaps.find(g=>Math.hypot(g.x-x,g.y-y)<15);
   if(existing)existing.radius=Math.max(existing.radius,radius);else gaps.push({x,y,radius});
  }
 }
 for(const c of level.curvedRoads??[])c.markingGaps=[...(c.markingGaps??[]),...gaps];
 level.markings=level.markings.flatMap(m=>{
  if(!['line-solid','line-dashed','line-double'].includes(m.type))return[m];
  const alongX=m.width>=m.height,len=Math.max(m.width,m.height),angle=m.rotation+(alongX?0:Math.PI/2),dx=Math.cos(angle),dy=Math.sin(angle);
  let runs=[[-len/2,len/2]];
  for(const g of gaps){
   const gx=g.x-m.x,gy=g.y-m.y,mid=gx*dx+gy*dy,dist=Math.abs(gx*dy-gy*dx);
   if(dist>=g.radius)continue;
   const half=Math.sqrt(g.radius*g.radius-dist*dist),lo=mid-half,hi=mid+half;
   runs=runs.flatMap(([a,b])=>b<=lo||a>=hi?[[a,b]]:[[a,Math.min(b,lo)],[Math.max(a,hi),b]].filter(([s,e])=>e-s>2));
  }
  return runs.map(([a,b])=>({...m,x:m.x+(a+b)/2*dx,y:m.y+(a+b)/2*dy,width:alongX?b-a:m.width,height:alongX?m.height:b-a}));
 });
 return gaps;
}
