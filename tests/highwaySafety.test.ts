import assert from 'node:assert/strict';
import {buildHighway,highwayBendMarkers,isHighwayStructure} from '../utils/highway';
import {clearRoadBuildings} from '../utils/roadClearance';
import {vehicleLayersCompatible} from '../utils/physics';
import {CatmullRomCurve3,Vector3} from 'three';
import type {LevelData} from '../types';

const level=buildHighway();
const roofs=level.obstacles.filter(o=>o.id.startsWith('tunnel-roof-'));
const walls=level.obstacles.filter(o=>o.id.startsWith('tunnel-wall-'));
assert.equal(roofs.length,10,'two tunnels have continuous roof sections');
assert.equal(walls.length,20,'both tunnel walls run outside the road');
assert(roofs.every(o=>isHighwayStructure(o)&&o.elevation===92&&o.verticalHeight===20));
assert(walls.every(o=>isHighwayStructure(o)&&o.verticalHeight===100));
const rails=level.obstacles.filter(o=>o.id.startsWith('motorway-rail-'));
const centreRails=rails.filter(o=>o.id.endsWith('-0')),outerRails=rails.filter(o=>!o.id.endsWith('-0'));
assert(centreRails.length>0&&outerRails.length>0);
assert(centreRails.every(o=>o.verticalHeight===8),'central divider is 0.8 m high at game scale');
assert(outerRails.every(o=>o.verticalHeight===15),'outer guardrails are 1.5 m high at game scale');
for(const rail of rails){
 const base=rail.elevation??0;
 const vehicle={x:rail.x,y:rail.y,width:20,length:40,rotation:rail.rotation,elevation:base,verticalHeight:15};
 assert(vehicleLayersCompatible(vehicle,rail),`same-level vehicle should collide with ${rail.id}`);
 assert(!vehicleLayersCompatible({...vehicle,elevation:base+rail.verticalHeight!+2},rail),`overhead vehicle must clear ${rail.id}`);
}
assert(rails.some(o=>o.y<2400&&o.x>17000&&o.x<19000&&/motorway-rail-\d+-1$/.test(o.id)),'outer rail must not have a kilometres-long gap');
// All authored connector centrelines must be free of mainline guardrails.
for(const road of level.curvedRoads!.slice(1)){
 const curve=new CatmullRomCurve3(road.points.map(p=>new Vector3(p.x,0,p.y)),false,'centripetal');
 for(const p of curve.getSpacedPoints(Math.ceil(curve.getLength()/15))){
  const hit=rails.find(o=>{const dx=p.x-o.x,dy=p.z-o.y,c=Math.cos(o.rotation),s=Math.sin(o.rotation);return Math.abs(dx*c+dy*s)<o.width/2+8&&Math.abs(-dx*s+dy*c)<o.height/2+8;});
  assert(!hit,`connector blocked by ${hit?.id}`);
 }
}
const markers=highwayBendMarkers(level);
assert(markers.length>20&&markers.length<400,'bounded number of batched bend markers');
assert(markers.every(m=>Number.isFinite(m.x+m.y+m.heading)&&Math.abs(m.arrow)===1));
assert(markers.some(m=>m.arrow===1)&&markers.some(m=>m.arrow===-1),'show both turn directions');
const before=level.obstacles.filter(o=>o.id.startsWith('bj-building-highway-')).length;
clearRoadBuildings(level);
const after=level.obstacles.filter(o=>o.id.startsWith('bj-building-highway-')).length;
assert.equal(before,30);assert(after>=20,'city skyline is outside highway envelopes');
assert(level.obstacles.some(o=>o.id.startsWith('toll-booth-'))&&level.spots.length>=30,'service and toll features retained');
// The road is a tall thin vertical rectangle rotated horizontal: its world X
// extent is much larger than local width. The old bounds incorrectly skipped it.
const test={levelId:99,mapWidth:10000,mapHeight:10000,startPos:{x:0,y:0,rotation:0},spots:[],markings:[],roadSurfaces:[{x:0,y:0,width:20,height:1000,rotation:Math.PI/2,color:'#333'}],obstacles:[{id:'bj-building-test',x:350,y:0,width:60,height:60,rotation:0,type:'wall',weight:0,movable:false,color:'#999'},{id:'legitimate-wall',x:350,y:0,width:60,height:60,rotation:0,type:'wall',weight:0,movable:false,color:'#999'}]} as LevelData;
clearRoadBuildings(test);assert(!test.obstacles.some(o=>o.id==='bj-building-test'));assert(test.obstacles.some(o=>o.id==='legitimate-wall'));
console.log(`Highway safety PASS: ${roofs.length} roof sections, ${rails.length} rails, ${markers.length} bend markers, ${after} city buildings and rotated-road clearance.`);
