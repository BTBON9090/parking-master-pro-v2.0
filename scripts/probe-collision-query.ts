import assert from 'node:assert/strict';
import {CAR_MODELS,GENERATE_LEVEL} from '../constants';
import {CarType,type Obstacle} from '../types';
import {buildCollisionGrid,queryCollisionGrid} from '../utils/collisionSpatial';
import {VehicleCollisionQuery} from '../utils/vehicleCollisionQuery';
import {getVehicleBoundaryPoints,checkVehicleCollision,checkVehicleRectCollision,vehicleLayersCompatible,type VehicleCollider} from '../utils/physics';

// The previous production static query, retained here solely as a measured
// baseline. No rendering, phone measurements or simulated frame-rate claims.
function previousQuery(grid:ReturnType<typeof buildCollisionGrid>,body:VehicleCollider){
 const candidates=new Map<string,Obstacle>(),hits=new Set<string>();
 if(body.articulated)for(const footprint of body.articulated)for(const p of getVehicleBoundaryPoints({...body,footprint}))queryCollisionGrid(grid,p.x,p.y).forEach(o=>candidates.set(o.id,o));
 queryCollisionGrid(grid,body.x,body.y).forEach(o=>candidates.set(o.id,o));
 for(const o of candidates.values())if(vehicleLayersCompatible(body,o)&&(
  o.type==='car'||o.collisionFootprint?.length?checkVehicleCollision(body,{x:o.x,y:o.y,length:o.height,width:o.width,rotation:o.rotation,footprint:o.collisionFootprint}):checkVehicleRectCollision(body,o)))hits.add(o.id);
 return hits;
}
const distribution=(numbers:number[])=>{numbers.sort((a,b)=>a-b);return {median:numbers[Math.floor(numbers.length*.5)],p95:numbers[Math.floor(numbers.length*.95)],max:numbers.at(-1)};};
for(const levelId of [1,13])for(const id of [CarType.MINI,CarType.US22]){
 const level=GENERATE_LEVEL(levelId),grid=buildCollisionGrid(level.obstacles),query=new VehicleCollisionQuery(),cc=CAR_MODELS[id];
 const walls=level.obstacles.filter(o=>o.type==='wall'),poses:VehicleCollider[]=[];
 for(let n=0;n<240;n++){
  const wall=walls[(n*37)%walls.length],body:VehicleCollider={x:wall.x+Math.cos(wall.rotation)*wall.width*.3,y:wall.y+Math.sin(wall.rotation)*wall.width*.3,rotation:wall.rotation,length:cc.length,width:cc.width,elevation:wall.elevation,verticalHeight:cc.height};
  if(id===CarType.US22)body.articulated=[[{x:-80,y:-13},{x:-220,y:-13},{x:-220,y:13},{x:-80,y:13}]];
  assert.deepEqual([...query.findHits(grid,body)].sort(),[...previousQuery(grid,body)].sort());poses.push(body);
 }
 for(const body of poses){previousQuery(grid,body);query.findHits(grid,body);}
 const old:number[]=[],current:number[]=[];
 for(let batch=0;batch<6;batch++)for(const body of poses){
  // Alternate order to reduce first-run / scheduling bias.
  const runOld=()=>{const t=performance.now();previousQuery(grid,body);old.push(performance.now()-t);};
  const runNew=()=>{const t=performance.now();query.findHits(grid,body);current.push(performance.now()-t);};
  if(batch%2){runOld();runNew();}else{runNew();runOld();}
 }
 console.log(JSON.stringify({levelId,id,samples:old.length,unit:'desktop CPU ms per query',previous:distribution(old),current:distribution(current)}));
}
