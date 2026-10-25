import { buildCenterline, serializeSampledW, buildRibbon, sanitizeNodes, splitIntoRuns, type Polyline, type PolyNode } from './utils/polyline.ts';

// Simulate a CLOSED loop drawn then confirmed: nodes where last==first (draw.nodes includes closing point)
function tryCase(label: string, fn: () => void) {
  try { fn(); console.log('OK   ', label); }
  catch (e) { console.log('THROW', label, '::', (e as Error).message); }
}

// closed loop, cornerRadius default 24, with a per-node width override (as new feature allows)
const loopNodes: PolyNode[] = [
  { x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }, { x: 100, y: 100 },
];
const pl: Polyline = { id: 'p', kind: 'road', nodes: sanitizeNodes(loopNodes, true), width: 70, color: '#3a3f4b', closed: true, cornerRadius: 24, lanes: 2, direction: 'two-way' };
console.log('sanitized closed nodes =', pl.nodes.length);

tryCase('buildCenterline closed', () => {
  const r = buildCenterline(pl.nodes, true, 16, pl.cornerRadius, pl.width);
  if (r.pts.some(p => !isFinite(p.x) || !isFinite(p.y))) throw new Error('NaN pts');
  if (r.widths.some(w => !isFinite(w))) throw new Error('NaN widths');
  console.log('   centerline pts', r.pts.length);
});
tryCase('serializeSampledW closed', () => {
  const r = serializeSampledW(pl, 16);
  console.log('   sampled', r.pts.length);
});
tryCase('buildRibbon closed', () => {
  const r = serializeSampledW(pl, 16);
  const rb = buildRibbon(r.pts, r.widths);
  console.log('   ribbon L', rb.left.length, 'R', rb.right.length);
});
tryCase('splitIntoRuns closed all-rounded', () => {
  const runs = splitIntoRuns(pl.nodes, true, pl.cornerRadius);
  console.log('   runs', runs.length, 'closed0', runs[0]?.closed);
});

// Branch: a 3-node host + a branch sharing the middle node, both roads
const host: Polyline = { id: 'h', kind: 'road', nodes: [{x:0,y:200},{x:200,y:200},{x:400,y:200}], width: 70, color:'#3a3f4b', cornerRadius: 24, lanes: 2, direction:'two-way' };
const branch: Polyline = { id: 'b', kind: 'road', nodes: [{x:200,y:200},{x:200,y:0}], width: 70, color:'#3a3f4b', cornerRadius: 24, lanes: 2, direction:'two-way' };
tryCase('branch host centerline', () => { const r = buildCenterline(host.nodes, false, 16, 24, 70); if (r.pts.length<2) throw new Error('too few'); });
tryCase('branch branch centerline', () => { const r = buildCenterline(branch.nodes, false, 16, 24, 70); if (r.pts.length<2) throw new Error('too few'); });

// A road with per-node width = very small then big (gradient) closed
const gradNodes: PolyNode[] = [
  { x: 0, y: 0, width: 20 }, { x: 200, y: 0, width: 120 }, { x: 200, y: 200, width: 20 }, { x: 0, y: 200 },
];
const gpl: Polyline = { id: 'g', kind: 'road', nodes: gradNodes, width: 70, color:'#3a3f4b', closed: true, cornerRadius: 24, lanes: 2, direction:'two-way' };
tryCase('gradient-width closed centerline', () => {
  const r = buildCenterline(gpl.nodes, true, 16, 24, 70);
  if (r.pts.some(p => !isFinite(p.x)||!isFinite(p.y))) throw new Error('NaN');
});
