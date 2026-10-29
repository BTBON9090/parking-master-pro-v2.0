import assert from 'node:assert/strict';
import {CAR_MODELS,GENERATE_LEVEL} from '../constants';
import type {Obstacle,Vector2} from '../types';
import {buildCollisionGrid,isStaticCollisionCandidate,queryCollisionGrid} from '../utils/collisionSpatial';
import {VehicleCollisionQuery} from '../utils/vehicleCollisionQuery';
import {checkVehicleCollision,checkVehicleRectCollision,vehicleLayersCompatible,getVehicleBoundaryPoints,type VehicleCollider} from '../utils/physics';

const sorted=(s:Iterable<string>)=>[...s].sort();
const oracle=(body:VehicleCollider,items:Obstacle[])=>new Set(items.filter(o=>vehicleLayersCompatible(body,o)&&(
 o.type==='car'||o.collisionFootprint?.length?
 checkVehicleCollision(body,{x:o.x,y:o.y,rotation:o.rotation,length:o.height,width:o.width,footprint:o.collisionFootprint}):checkVehicleRectCollision(body,o))).map(o=>o.id));
let seed=713251;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const rectangle=(x:number,y:number,length:number,width:number):Vector2[]=>[{x:x-length/2,y:y-width/2},{x:x+length/2,y:y-width/2},{x:x+length/2,y:y+width/2},{x:x-length/2,y:y+width/2}];
let checks=0;
for(const levelId of [1,4,6,13,8,9,10,11,12]){
 const level=GENERATE_LEVEL(levelId),items=level.obstacles.filter(isStaticCollisionCandidate),grid=buildCollisionGrid(items),query=new VehicleCollisionQuery();
 for(const cc of Object.values(CAR_MODELS))for(let i=0;i<5;i++){
  const obstacle=items[Math.floor(random()*items.length)];if(!obstacle)continue;
  const body:VehicleCollider={x:obstacle.x+(random()-.5)*(cc.length+obstacle.width),y:obstacle.y+(random()-.5)*(cc.length+obstacle.height),rotation:random()*Math.PI*2,length:cc.length,width:cc.width,elevation:(obstacle.elevation??0)+(i===4?100:0),verticalHeight:cc.height};
  if(i%2===0)body.articulated=[rectangle(-cc.length*.9,cc.width*.3,cc.length*1.3,cc.width)];
  assert.deepEqual(sorted(query.findHits(grid,body)),sorted(oracle(body,items)),`${levelId}/${cc.id}/${i}`);checks++;
 }
}
const wall:Obstacle={id:'wall',type:'wall',x:1000,y:500,width:20,height:80,rotation:0,weight:0,movable:false,color:'#777'};
const moving:Obstacle={...wall,id:'moving',type:'car',x:10000,width:20,height:40};
const custom:Obstacle={...wall,id:'offset-hull',x:0,y:0,width:10,height:10,collisionFootprint:rectangle(2000,600,40,30)};
const grid=buildCollisionGrid([wall,moving,custom]),query=new VehicleCollisionQuery();
for(const p of getVehicleBoundaryPoints({x:0,y:0,length:10,width:10,rotation:0,footprint:custom.collisionFootprint}))assert(queryCollisionGrid(grid,p.x,p.y,0).has(custom),'offset authored hull is indexed by actual bounds');
const body:VehicleCollider={x:1000,y:500,length:40,width:20,rotation:0};
assert(query.findHits(grid,body).has('wall'));
wall.x+=400;body.x+=400; // Old bucket is intentionally stale; a live obstacle is still queryable.
assert(query.findHits(grid,body,[wall]).has('wall'),'wall cache responds to translation');
wall.rotation=Math.PI/2;wall.width=200;assert.deepEqual(sorted(query.findHits(grid,body,[wall])),sorted(oracle(body,[wall])));
moving.x=body.x;moving.y=body.y;
assert(query.findHits(grid,body,[moving]).has('moving'),'live NPC moved across grid cells');
assert(query.findHits(grid,body,[],['moving']).has('moving'),'pushed parked vehicle moved across grid cells');
moving.collisionFootprint=rectangle(0,0,40,20);
assert(query.findHits(grid,body,[moving]).has('moving'));
for(const p of moving.collisionFootprint)p.x+=200;
assert(!query.findHits(grid,body,[moving]).has('moving'),'in-place hull deformation is not cached');
assert(!query.findHits(grid,body,[wall],[],()=>true).size,'crushed-object exclusion');
body.x=2000;body.y=600;
assert(query.findHits(grid,body).has('offset-hull'),'offset custom hull is not lost outside nominal dimensions');
const edge:Obstacle={...wall,x:0,y:0,width:20,height:20,rotation:0};
const edgeGrid=buildCollisionGrid([edge]),box:VehicleCollider={x:20,y:0,length:20,width:20,rotation:0,footprint:rectangle(0,0,20,20)};
assert(query.findHits(edgeGrid,box).has('wall'),'scenery edge keeps inclusive touching rule');
edge.type='car';assert.equal(query.findHits(edgeGrid,box).size,0,'vehicle edge keeps strict overlap rule');
console.log(`Vehicle collision query PASS: ${checks} actual-map/vehicle/height/articulation poses match brute-force SAT, live NPC/pushed car, cache invalidation, displaced hull, contact edge rules.`);
