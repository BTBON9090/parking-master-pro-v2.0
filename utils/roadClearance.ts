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
 level.obstacles=level.obstacles.filter(o=>!(/bj-building-|school-building|campus-building|warehouse/.test(o.id)&&roads.some(r=>Math.abs(o.x-r.x)<(o.width+r.width)/2+100&&Math.abs(o.y-r.y)<(o.height+r.width)/2+100&&checkCollision(o,r))));
 return level;
}
