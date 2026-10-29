import assert from 'node:assert/strict';
import * as THREE from 'three';
import {addOpenWorldScene} from '../three/openWorldScene';
import { inCity, MOUNTAIN_BOUNDS, WORLD_ROUTES, WORLD_DESTINATIONS, WORLD_PUDDLES, worldHeight, worldSurface, worldSurfaceSample, mapCurveSamples } from '../utils/openWorld';
import { buildBeijingLevel } from '../utils/beijingMap';
import { sampleTerrainSurface } from '../utils/terrainSampling';
const level=buildBeijingLevel();
assert(level.openWorld);assert(level.mapWidth>15000);
let total=0,maxGrade=0,minRadius=Infinity;
for(const r of WORLD_ROUTES){
 total+=r.samples.at(-1)!.distance;
 for(let i=1;i<r.samples.length;i++){
  const a=r.samples[i-1],p=r.samples[i],ds=Math.hypot(p.x-a.x,p.y-a.y);
  assert(ds<18.1&&ds>0,`${r.id}: bounded surface segments`);
  const h=worldHeight(p.x,p.y),support=sampleTerrainSurface(level,p.x,p.y);
  assert(Math.abs(support.height-h)<1e-9,`render and physical height agree at ${p.x},${p.y}: ${support.height}/${h}`);
  const grade=Math.abs(p.h-a.h)/ds;maxGrade=Math.max(maxGrade,grade);
  assert(grade<(r.id==='new-cloud'?.48:r.gravel?.55:.42),`${r.id}: excessive ${grade} gradient`);
  assert(Math.abs(h-worldHeight(a.x,a.y))<Math.max(2.6,ds*.5),'no stair steps or support discontinuity');
  if(!r.gravel&&i<r.samples.length-1){const q=r.samples[i+1],dot=p.nx*a.nx+p.ny*a.ny,angle=Math.acos(Math.min(1,Math.max(-1,dot)));if(angle>.00001){minRadius=Math.min(minRadius,ds/angle);assert(ds/angle>r.width*.75,`${r.id}: inside road strip must not fold`);}}
 }
 if(r.closed){const a=r.samples[0],b=r.samples.at(-1)!;assert(Math.hypot(a.x-b.x,a.y-b.y,a.h-b.h)<.001);}
}
assert(minRadius>50,`inside edge must not fold over: ${minRadius}`);
for(const p of WORLD_DESTINATIONS){assert(Number.isFinite(worldSurfaceSample(p.x,p.y).height));}
for(const p of WORLD_PUDDLES){assert(worldSurface(p.x,p.y).wet);assert(worldSurface(p.x,p.y).grip<.8);assert(worldSurface(p.x,p.y).rolling>1);}
assert(worldHeight(23185,19500)<.001,'city gateway is level');
assert(!level.curbSegments?.some(c=>c.x>23050&&c.x<23500&&Math.abs(c.y-19500)<75),'city throat must be open');
for(const r of level.curvedRoads||[]){assert(mapCurveSamples(r).length>=161,'map uses sampled curves');}
console.log(JSON.stringify({routes:WORLD_ROUTES.length,lengthKm:total/10000,maxGrade,minRadiusM:minRadius/10,railColliders:level.obstacles.filter(o=>o.id.startsWith('mountain-rail')).length}));

// Cast against the actual road triangles, including lane edges and junctions.
const scene=new THREE.Scene();addOpenWorldScene(scene,level,g=>g);scene.updateMatrixWorld(true);
const roads=[scene.getObjectByName('MountainAsphalt')!,scene.getObjectByName('CreekGravel')!,scene.getObjectByName('mountain-lift-deck')!];
const ray=new THREE.Raycaster();let maxError=0,maxGravelError=0;
for(const r of WORLD_ROUTES)for(let i=4;i<r.samples.length;i+=22){
 const p=r.samples[i],prev=r.samples[i-1];
 for(const lane of [-.4,-.25,0,.25,.4]){
  const x=(p.x+prev.x)/2+p.nx*r.width*lane,y=(p.y+prev.y)/2+p.ny*r.width*lane,h=worldHeight(x,y);
  ray.set(new THREE.Vector3(x,h+50,y),new THREE.Vector3(0,-1,0));ray.far=100;
  const hits=ray.intersectObjects(roads,false);assert(hits.length,`${r.id}: visible road under tyre`);
  const error=Math.abs(hits[0].point.y-h);
  if(error>.5&&!r.gravel)console.log("road-height mismatch",{route:r.id,i,lane,x,y,physical:h,visual:hits[0].point.y,mesh:hits[0].object.name});
  if(r.gravel)maxGravelError=Math.max(error,maxGravelError);else maxError=Math.max(error,maxError);
 }
}
assert(maxError<.5,`asphalt visual/contact mismatch ${maxError} units`);
assert(maxGravelError<.8,`gravel visual/contact mismatch ${maxGravelError} units`);
console.log({maxAsphaltContactErrorCm:maxError*10,maxGravelContactErrorCm:maxGravelError*10});
const ground=[...roads,scene.getObjectByName('MountainShoulder')!,...scene.children.filter(n=>n.name==='MountainTerrain')];
let offRoadError=0;
for(const r of WORLD_ROUTES)for(let i=8;i<r.samples.length;i+=100){
 const p=r.samples[i];
 for(const side of [-1,1])for(const distance of [8,25,45,70,125]){
  const off=(r.width/2+distance)*side,x=p.x+p.nx*off,y=p.y+p.ny*off,h=worldHeight(x,y);
  if(inCity(x,y)||x<MOUNTAIN_BOUNDS.x0||x>MOUNTAIN_BOUNDS.x1||y<MOUNTAIN_BOUNDS.y0||y>MOUNTAIN_BOUNDS.y1)continue;
  ray.set(new THREE.Vector3(x,h+50,y),new THREE.Vector3(0,-1,0));ray.far=100;
  const hits=ray.intersectObjects(ground,false);assert(hits.length,`terrain visible below off-road support ${r.id} ${i} ${distance} ${side}: ${x},${y},${h}`);
  offRoadError=Math.max(offRoadError,Math.abs(hits[0].point.y-h));
 }
}
assert(offRoadError<.8,`off-road support must follow rendered triangles: ${offRoadError}`);
assert(level.obstacles.some(o=>o.id.startsWith('mountain-tree')),'tree trunks have collision');
assert(level.obstacles.some(o=>o.id.startsWith('mountain-sign')),'sign posts have collision');
console.log({maxShoulderAndOffRoadErrorCm:offRoadError*10});
