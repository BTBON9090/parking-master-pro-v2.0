import assert from 'node:assert/strict';
import fs from 'node:fs';
import {WORLD_ROUTES,worldHeight,worldHeightReference,crossingRoadAt} from '../utils/openWorld';
import {mountainRails} from '../three/openWorldScene';
const probes:Array<[number,number]>=[];
for(const r of WORLD_ROUTES)for(let i=1;i<r.samples.length;i+=17){const p=r.samples[i];for(const off of [-r.width/2-54,-r.width*.48,-12,0,r.width*.47,r.width/2+59])probes.push([p.x+p.nx*off,p.y+p.ny*off]);}
let maxError=0;
const first=performance.now();const optimized=probes.map(([x,y])=>worldHeight(x,y));const coldOptimizedMs=performance.now()-first;
for(const [i,[x,y]] of probes.entries()){const ref=worldHeightReference(x,y);maxError=Math.max(maxError,Math.abs(optimized[i]-ref));assert(Math.abs(optimized[i]-ref)<1e-7,`surface differs at ${x},${y}`);}
const measure=(f:typeof worldHeight)=>{const t=performance.now();for(let pass=0;pass<3;pass++)for(const [x,y] of probes)f(x,y);return performance.now()-t;};
const beforeMs=measure(worldHeightReference),afterMs=measure(worldHeight);
let rails=0;for(const o of mountainRails()){
 const r=WORLD_ROUTES.find(r=>o.id.startsWith('mountain-rail-'+r.id+'-'))!;
 for(const t of [-.5,-.25,0,.25,.5]){const x=o.x+Math.cos(o.rotation)*(o.width-.2)*t,y=o.y+Math.sin(o.rotation)*(o.width-.2)*t;assert(!crossingRoadAt(r,x,y,o.elevation!,16),'rail blocks another road: '+o.id);}rails++;
}
const result={probes:probes.length,maxError,coldOptimizedMs,beforeMs,afterMs,ratio:afterMs/beforeMs,rails,environment:'Node CPU sampling, not Android frame-rate'};
fs.mkdirSync('docs/round43',{recursive:true});fs.writeFileSync('docs/round43/mountain-sampling.json',JSON.stringify(result,null,2));console.log(result);
