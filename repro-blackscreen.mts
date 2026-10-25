// Repro: simulate the geometry pipeline that runs after Enter (commitDraw)
// for closed / crossing / branch scenarios, with a hang watchdog.
import { serializeSampledW, serializeSampled, buildRibbon, analyzeJunctions, type Polyline } from './utils/polyline.ts';
import { buildJunctionMarkings } from './utils/junctionMarkings.ts';

const hasBad = (arr: { x: number; y: number }[]) => arr.some(p => !isFinite(p.x) || !isFinite(p.y));

function road(id: string, nodes: { x: number; y: number; width?: number }[], closed = false, width = 70): Polyline {
  return { id, kind: 'road', nodes: nodes.map(n => ({ x: n.x, y: n.y, width: n.width })), width, color: '#3a3f4b', closed, cornerRadius: 24, lanes: 2, direction: 'two-way' };
}

function withWatchdog<T>(label: string, ms: number, fn: () => T): T | undefined {
  // tsx is single-threaded; emulate a soft budget by timing.
  const t0 = Date.now();
  try {
    const r = fn();
    const dt = Date.now() - t0;
    if (dt > ms) console.log(`SLOW  ${label} took ${dt}ms`);
    return r;
  } catch (e) {
    console.log(`THROW ${label}:`, (e as Error).message);
    return undefined;
  }
}

function testScenario(name: string, pls: Polyline[]) {
  console.log(`\n=== ${name} ===`);
  for (const pl of pls) {
    const sw = withWatchdog(`serializeSampledW(${pl.id})`, 200, () => serializeSampledW(pl, 16));
    if (!sw) continue;
    const badC = hasBad(sw.pts);
    const badW = sw.widths.some(w => !isFinite(w));
    console.log(`  ${pl.id}: pts=${sw.pts.length} widthsNaN=${badW} centerNaN=${badC}`);
    const rb = withWatchdog(`buildRibbon(${pl.id})`, 200, () => buildRibbon(sw.pts, sw.widths));
    if (rb) console.log(`    ribbon L=${rb.left.length} R=${rb.right.length} leftNaN=${hasBad(rb.left)} rightNaN=${hasBad(rb.right)}`);
    const s = withWatchdog(`serializeSampled(${pl.id})`, 200, () => serializeSampled(pl, 8));
    if (s) console.log(`    sampled8=${s.length} NaN=${hasBad(s)}`);
  }
  const js = withWatchdog('analyzeJunctions', 400, () => analyzeJunctions(pls));
  if (js) {
    console.log(`  junctions=${js.length} types=${js.map(j => j.type).join(',')}`);
    for (const j of js) {
      const centerBad = !isFinite(j.center.x) || !isFinite(j.center.y);
      const armsBad = j.arms.some(a => !isFinite(a.heading) || !isFinite(a.width) || !isFinite(a.lanes));
      console.log(`    j ${j.type} arms=${j.arms.length} centerNaN=${centerBad} armsNaN=${armsBad}`);
      const mks = withWatchdog(`buildJunctionMarkings(${j.type})`, 200, () => buildJunctionMarkings(j, 'test-' + j.id, {}));
      if (mks) {
        const mkBad = mks.some(m => !isFinite(m.x) || !isFinite(m.y) || !isFinite(m.width) || !isFinite(m.height) || !isFinite(m.rotation));
        console.log(`      markings=${mks.length} NaN=${mkBad} types=${[...new Set(mks.map(m => m.type))].join(',')}`);
      }
    }
  }
}

// 1. closed square loop
testScenario('closed square', [road('loop', [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }], true)]);

// 2. two crossing straight roads
testScenario('crossing', [
  road('h', [{ x: 0, y: 200 }, { x: 400, y: 200 }]),
  road('v', [{ x: 200, y: 0 }, { x: 200, y: 400 }]),
]);

// 3. branch from a node (T via shared node): host horizontal, branch starts at host mid node
testScenario('branch T (shared node)', [
  road('host', [{ x: 0, y: 200 }, { x: 200, y: 200 }, { x: 400, y: 200 }]),
  road('branch', [{ x: 200, y: 200 }, { x: 200, y: 0 }]),
]);

// 4. closed loop that also crosses a road
testScenario('closed loop + crossing road', [
  road('loop2', [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }], true),
  road('through', [{ x: -50, y: 200 }, { x: 450, y: 200 }]),
]);

// 5. degenerate: 2-node very short, and duplicate nodes
testScenario('degenerate short + dup', [
  road('tiny', [{ x: 100, y: 100 }, { x: 100.1, y: 100.1 }]),
  road('dup', [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]),
]);

console.log('\nDONE');
