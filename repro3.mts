import * as THREE from 'three';
import { polylineToCurvedRoads, type Polyline } from './utils/polyline.ts';

// Faithful copy of addRoadLaneMarkings' addLine tube path
function addLineTube(samples: THREE.Vector3[], normals: THREE.Vector3[], off: (i:number)=>number, dashed: boolean, yLine: number) {
  const ptsAll = samples.map((p, i) => p.clone().addScaledVector(normals[i], off(i)).setY(yLine));
  const runs: THREE.Vector3[][] = [];
  if (!dashed) runs.push(ptsAll);
  else {
    const segLen=20,gapLen=16; let acc=0; let cur:THREE.Vector3[]=[ptsAll[0]]; let drawing=true;
    for (let i=1;i<ptsAll.length;i++){ const d=ptsAll[i].distanceTo(ptsAll[i-1]); acc+=d; const phase=acc%(segLen+gapLen); const nowDraw=phase<segLen;
      if(nowDraw!==drawing){ if(drawing&&cur.length>=2)runs.push(cur); cur=nowDraw?[ptsAll[i-1]]:[]; drawing=nowDraw;} if(drawing)cur.push(ptsAll[i]); }
    if(drawing&&cur.length>=2)runs.push(cur);
  }
  let count=0;
  for (const run of runs) {
    if (run.length<2) continue;
    const curve = new THREE.CatmullRomCurve3(run, false, 'centripetal', 0.35);
    const geo = new THREE.TubeGeometry(curve, Math.max(8, run.length-1), 0.4, 5, false);
    count++;
  }
  return count;
}

function buildRoadTube(pl: Polyline, label: string) {
  try {
    const curveds = polylineToCurvedRoads(pl);
    for (const curved of curveds) {
      if (curved.points.length < 3) { console.log('  skip <3 pts', label); continue; }
      const closed = curved.closed || false;
      const curve = new THREE.CatmullRomCurve3(curved.points.map(p=>new THREE.Vector3(p.x,0.15,p.y)), closed, 'centripetal', 0.45);
      const segments = Math.max(160, curved.points.length*28);
      const samples = curve.getSpacedPoints(segments);
      const tangents = samples.map((pt,idx)=>{ const prev=samples[Math.max(0,idx-1)]; const next=samples[Math.min(samples.length-1,idx+1)]; return next.clone().sub(prev).setY(0).normalize(); });
      const normals: THREE.Vector3[]=[]; let prevN:THREE.Vector3|null=null;
      for(let i=0;i<samples.length;i++){ const t=tangents[i]; const nm=new THREE.Vector3(-t.z,0,t.x).normalize(); if(prevN&&prevN.dot(nm)<0)nm.negate(); prevN=nm.clone(); normals.push(nm); }
      // two-way 2 lanes => double yellow center (solid) + the loop
      const n = addLineTube(samples, normals, ()=>1.5, false, 0.25);
      console.log(`OK    ${label} (closed=${closed}) samples=${samples.length} tubes=${n}`);
      // check NaN in samples
      if (samples.some(s=>!isFinite(s.x)||!isFinite(s.y)||!isFinite(s.z))) console.log(`  !! NaN samples in ${label}`);
    }
  } catch (e) {
    console.log(`THROW ${label} ::`, (e as Error).message);
  }
}

const loop: Polyline = { id:'l', kind:'road', nodes:[{x:100,y:100},{x:300,y:100},{x:300,y:300},{x:100,y:300}], width:70, color:'#3a3f4b', closed:true, cornerRadius:24, lanes:2, direction:'two-way' };
const cross1: Polyline = { id:'c1', kind:'road', nodes:[{x:0,y:200},{x:400,y:200}], width:70, color:'#3a3f4b', cornerRadius:24, lanes:2, direction:'two-way' };
const cross2: Polyline = { id:'c2', kind:'road', nodes:[{x:200,y:0},{x:200,y:400}], width:70, color:'#3a3f4b', cornerRadius:24, lanes:2, direction:'two-way' };
const tiny: Polyline = { id:'t', kind:'road', nodes:[{x:0,y:0},{x:5,y:0}], width:70, color:'#3a3f4b', cornerRadius:24, lanes:2, direction:'two-way' };

buildRoadTube(loop, 'closed loop');
buildRoadTube(cross1, 'cross horizontal');
buildRoadTube(cross2, 'cross vertical');
buildRoadTube(tiny, 'tiny 2-node short');
