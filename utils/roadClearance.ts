import {CatmullRomCurve3,Vector3} from 'three';
import type {LevelData,Rect} from '../types';
import {checkCollision} from './physics';
/** Shared road envelopes keep buildings out of junctions and bridge approaches. */
export function clearRoadBuildings(level:LevelData){
 const roads:Rect[]=[...(level.roadSurfaces??[]),...(level.elevatedRoads??[])].map(r=>({...r,width:r.width+12,height:r.height+12}));
 for(const road of level.curvedRoads??[]){
  const curve=new CatmullRomCurve3(road.points.map(p=>new Vector3(p.x,0,p.y)),road.closed??false,'centripetal');
  const pts=curve.getSpacedPoints(Math.max(24,Math.ceil(curve.getLength()/50)));
  for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];roads.push({x:(a.x+b.x)/2,y:(a.z+b.z)/2,width:a.distanceTo(b)+5,height:road.width+12,rotation:Math.atan2(b.z-a.z,b.x-a.x)});}
 }
 // A rotated road's world X/Y extents are not its local width/height.
 // Test a conservative axis-aligned bound before the precise SAT; the old
 // check could skip a vertical road that really overlaps a building.
 const extents=(r:Rect)=>{const c=Math.abs(Math.cos(r.rotation)),s=Math.abs(Math.sin(r.rotation));return {x:(r.width*c+r.height*s)/2,y:(r.width*s+r.height*c)/2};};
 const roadBounds=roads.map(r=>({r,e:extents(r)}));
 level.obstacles=level.obstacles.filter(o=>{
  if(!(/bj-building-|school-building|campus-building|warehouse/.test(o.id)))return true;
  const e=extents(o);
  return !roadBounds.some(({r,e:re})=>Math.abs(o.x-r.x)<=e.x+re.x&&Math.abs(o.y-r.y)<=e.y+re.y&&checkCollision(o,r));
 });
 return level;
}
