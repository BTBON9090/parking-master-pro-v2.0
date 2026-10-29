import type {Obstacle,Vector2} from '../types';
import {getRectCorners,getVehicleBoundaryPoints,vehicleLayersCompatible,type VehicleCollider} from './physics';
import {queryCollisionBounds,type CollisionBounds,type buildCollisionGrid} from './collisionSpatial';

interface Hull {points:Vector2[];bounds:CollisionBounds;axes:Vector2[];intervals:Array<{min:number;max:number}>}
function bounds(points:Vector2[]):CollisionBounds{
 const b={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
 for(const p of points){b.minX=Math.min(b.minX,p.x);b.maxX=Math.max(b.maxX,p.x);b.minY=Math.min(b.minY,p.y);b.maxY=Math.max(b.maxY,p.y);}
 return b;
}
function overlapBounds(a:CollisionBounds,b:CollisionBounds){return a.minX<=b.maxX&&a.maxX>=b.minX&&a.minY<=b.maxY&&a.maxY>=b.minY;}
function project(points:Vector2[],axis:Vector2){
 let min=Infinity,max=-Infinity;
 for(const p of points){const n=p.x*axis.x+p.y*axis.y;min=Math.min(min,n);max=Math.max(max,n);}
 return {min,max};
}
function hull(points:Vector2[]):Hull{
 const axes:Vector2[]=[];
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],x=a.y-b.y,y=b.x-a.x,length=Math.hypot(x,y);
  if(length>1e-8)axes.push({x:x/length,y:y/length});
 }
 return {points,bounds:bounds(points),axes,intervals:axes.map(a=>project(points,a))};
}
function overlaps(a:Hull,b:Hull,inclusive:boolean){
 if(!overlapBounds(a.bounds,b.bounds))return false;
 const separated=(p:{min:number;max:number},q:{min:number;max:number})=>inclusive?p.max<q.min||q.max<p.min:p.max<=q.min||q.max<=p.min;
 for(let i=0;i<a.axes.length;i++)if(separated(a.intervals[i],project(b.points,a.axes[i])))return false;
 for(let i=0;i<b.axes.length;i++)if(separated(b.intervals[i],project(a.points,b.axes[i])))return false;
 return true;
}

/** Boolean sweep queries reuse the player's polygons instead of rebuilding
 * them and contact manifolds for every scenery item. Contact resolution still
 * uses vehicleContacts after a hit; its normal/depth calculation is unchanged. */
export class VehicleCollisionQuery {
 private candidates=new Set<Obstacle>();
 private walls=new WeakMap<Obstacle,{x:number;y:number;rotation:number;width:number;height:number;hull:Hull}>();
 findHits(grid:ReturnType<typeof buildCollisionGrid>,body:VehicleCollider,live:Iterable<Obstacle>=[],movingIds:Iterable<string>=[],ignore?:(o:Obstacle)=>boolean):Set<string>{
  const own=[body.footprint,...(body.articulated??[])].map(footprint=>hull(getVehicleBoundaryPoints({...body,footprint})));
  const assembly:CollisionBounds={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
  for(const h of own){assembly.minX=Math.min(assembly.minX,h.bounds.minX);assembly.maxX=Math.max(assembly.maxX,h.bounds.maxX);assembly.minY=Math.min(assembly.minY,h.bounds.minY);assembly.maxY=Math.max(assembly.maxY,h.bounds.maxY);}
  const candidates=queryCollisionBounds(grid,assembly,this.candidates);
  // The grid is static; moving vehicles must be considered at their live pose.
  for(const o of live)candidates.add(o);
  for(const id of movingIds){const o=grid.byId.get(id);if(o)candidates.add(o);}
  const hits=new Set<string>();
  for(const o of candidates){
   if(!vehicleLayersCompatible(body,o)||ignore?.(o))continue;
   const isVehicle=o.type==='car'||!!o.collisionFootprint?.length;
   let other:Hull;
   if(isVehicle){
    // Authored hulls may be replaced or edited by damage/articulation. Read
    // their current points; never retain a stale vehicle polygon in the cache.
    const points=getVehicleBoundaryPoints({x:o.x,y:o.y,rotation:o.rotation,length:o.height,width:o.width,footprint:o.collisionFootprint});
    if(!overlapBounds(assembly,bounds(points)))continue;
    other=hull(points);
   }else{
    const cached=this.walls.get(o);
    if(cached&&cached.x===o.x&&cached.y===o.y&&cached.rotation===o.rotation&&cached.width===o.width&&cached.height===o.height)other=cached.hull;
    else{other=hull(getRectCorners(o));this.walls.set(o,{x:o.x,y:o.y,rotation:o.rotation,width:o.width,height:o.height,hull:other});}
   }
   if(own.some(h=>overlaps(h,other,!isVehicle)))hits.add(o.id);
  }
  return hits;
 }
}
