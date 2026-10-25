import * as THREE from 'three';
import { polylineToCurvedRoads, type Polyline } from './utils/polyline.ts';

// Faithful reproduction of addRoadLaneMarkings center/lane line tube building,
// focused on CLOSED roads where getSpacedPoints wraps (last point == first point).
function laneTubesForClosed(pl: Polyline, label: string) {
  try {
    const curveds = polylineToCurvedRoads(pl);
    for (const curved of curveds) {
      if (curved.points.length < 3) continue;
      const closed = curved.closed || false;
      const curve = new THREE.CatmullRomCurve3(curved.points.map(p=>new THREE.Vector3(p.x,0.15,p.y)), closed, 'centripetal', 0.45);
      const segments = Math.max(160, curved.points.length*28);
      const samples = curve.getSpacedPoints(segments);
      const tangents = samples.map((pt,idx)=>{ const prev=samples[Math.max(0,idx-1)]; const next=samples[Math.min(samples.length-1,idx+1)]; return next.clone().sub(prev).setY(0).normalize(); });
      const normals: THREE.Vector3[]=[]; let prevN:THREE.Vector3|null=null;
      for(let i=0;i<samples.length;i++){ const t=tangents[i]; const nm=new THREE.Vector3(-t.z,0,t.x).normalize(); if(prevN&&prevN.dot(nm)<0)nm.negate(); prevN=nm.clone(); normals.push(nm); }
      // solid center line: run = ALL samples (closed => first~=last)
      const ptsAll = samples.map((p,i)=>p.clone().addScaledVector(normals[i], 1.5).setY(0.25));
      const first = ptsAll[0], last = ptsAll[ptsAll.length-1];
      const gap = first.distanceTo(last);
      const run = ptsAll;
      const curve2 = new THREE.CatmullRomCurve3(run, false, 'centripetal', 0.35);
      const geo = new THREE.TubeGeometry(curve2, Math.max(8, run.length-1), 0.5, 5, false);
      const pos = geo.getAttribute('position');
      let nanCount = 0;
      for (let i=0;i<pos.count;i++){ if(!isFinite(pos.getX(i))||!isFinite(pos.getY(i))||!isFinite(pos.getZ(i))) nanCount++; }
      console.log(`OK ${label} closed=${closed} samples=${samples.length} firstLastGap=${gap.toFixed(3)} tubeVerts=${pos.count} NaNverts=${nanCount}`);
    }
  } catch (e) {
    console.log(`THROW ${label} ::`, (e as Error).message);
  }
}

const loop: Polyline = { id:'l', kind:'road', nodes:[{x:100,y:100},{x:300,y:100},{x:300,y:300},{x:100,y:300}], width:70, color:'#3a3f4b', closed:true, cornerRadius:24, lanes:2, direction:'two-way' };
laneTubesForClosed(loop, 'closed loop 2-lane');

const loop4: Polyline = { id:'l4', kind:'road', nodes:[{x:100,y:100},{x:300,y:100},{x:300,y:300},{x:100,y:300}], width:140, color:'#3a3f4b', closed:true, cornerRadius:24, lanes:4, direction:'two-way' };
laneTubesForClosed(loop4, 'closed loop 4-lane');
