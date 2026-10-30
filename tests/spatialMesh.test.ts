import assert from 'node:assert/strict';
import {splitSpatialMesh} from '../three/spatialMesh';
const p=[-10,0,0,10,0,0,0,2,10,2500,1,0,2510,1,0,2500,3,10];
const color=p.map((_,i)=>i/20),faces=[0,1,2,3,4,5];
const chunks=splitSpatialMesh(p,faces,color,2000);assert.equal(chunks.length,2);
const output=chunks.flatMap(c=>{assert(c.colors);return c.indices.map(i=>[...c.positions.slice(i*3,i*3+3),...c.colors!.slice(i*3,i*3+3)]);});
assert.deepEqual(output,faces.map(i=>[...p.slice(i*3,i*3+3),...color.slice(i*3,i*3+3)]));
console.log('Spatial road chunks preserve all indexed triangles and vertex colors');
