import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GENERATE_LEVEL,CAR_MODELS} from '../constants';
import {CarType} from '../types';
import {garageSpiralPoint,garageSurface} from '../utils/garage';
import {buildCollisionGrid} from '../utils/collisionSpatial';
import {VehicleCollisionQuery} from '../utils/vehicleCollisionQuery';
import {MAP_PORTALS,portalAt} from '../utils/mapPortals';
import {MOUNTAIN_TUNNEL,MOUNTAIN_LIFT,mountainTunnelSample,liftSurface,setMountainLiftHeight} from '../utils/mountainAdventure';
import {sampleTerrainSurface} from '../utils/terrainSampling';
const garage=GENERATE_LEVEL(6),grid=buildCollisionGrid(garage.obstacles),query=new VehicleCollisionQuery(),car=CAR_MODELS[CarType.SUV];
let maxStep=0;
for(const direction of [1,-1]){
 let height=direction===1?-48:-144;
 for(let i=0;i<=1440;i++){
  const t=direction===1?i/1440:1-i/1440,p=garageSpiralPoint(t),sample=garageSurface(p.x,p.y,height);
  assert(Math.abs(sample.height-p.height)<1e-5,`spiral wrong layer at ${t}: ${sample.height}/${p.height}`);
  maxStep=Math.max(maxStep,Math.abs(sample.height-height));height=sample.height;
  const hits=query.findHits(grid,{x:p.x,y:p.y,rotation:p.angle+direction*Math.PI/2,elevation:height,width:car.width,length:car.length,verticalHeight:car.height});
  assert.equal(hits.size,0,`spiral collision ${t} ${[...hits]}`);
 }
 assert.equal(Math.round(height),direction===1?-144:-48);
}
const levels=new Map([1,6,13].map(id=>[id,GENERATE_LEVEL(id)]));
for(const p of MAP_PORTALS){
 assert.equal(portalAt(p.level,{...p,rotation:p.heading})?.id,p.id);
 assert.equal(portalAt(p.level,{...p,rotation:p.heading+Math.PI}),undefined);
 assert.equal(portalAt(p.level,{...p,elevation:p.elevation-48,rotation:p.heading}),undefined);
 const target=levels.get(p.target)!,a=p.arrival,hits=query.findHits(buildCollisionGrid(target.obstacles),{...a,width:car.width,length:car.length,verticalHeight:car.height});
 assert.equal(hits.size,0,`arrival blocked ${p.id}: ${[...hits]}`);assert(Math.abs(sampleTerrainSurface(target,a.x,a.y,a.elevation).height-a.elevation)<1);
 assert(!portalAt(p.target,a),'arrival must not re-trigger another map');
}
const mountain=levels.get(1)!;
for(const p of MOUNTAIN_TUNNEL){assert.equal(mountainTunnelSample(p.x,p.y,0)?.height,0);assert.equal(mountainTunnelSample(p.x,p.y,3000),null);assert(sampleTerrainSurface(mountain,p.x,p.y,0).height<25);}
for(const h of [0,1500,5000,10000]){setMountainLiftHeight(h);assert.equal(liftSurface(MOUNTAIN_LIFT.x,MOUNTAIN_LIFT.y,h)?.height,h);assert.equal(sampleTerrainSurface(mountain,MOUNTAIN_LIFT.x,MOUNTAIN_LIFT.y,h).height,h);}setMountainLiftHeight(null);
fs.writeFileSync('docs/round43/world-connections.json',JSON.stringify({result:'PASS',helixSamples:2882,maxStep,portals:MAP_PORTALS.length,tunnelSamples:MOUNTAIN_TUNNEL.length,limits:'Numeric collision/support only; independent game view pending.'},null,2));
console.log('World connections PASS: both-way spiral, portal direction/layer/safe arrival, separate mountain/tunnel/lift support.');
