import { analyzeJunctions, segmentIntersectPt, type Polyline, type PolyNode } from './utils/polyline.ts';
import { buildJunctionMarkings } from './utils/junctionMarkings.ts';

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  if (!ok) fails++;
};
const mk = (id: string, nodes: [number, number][], width = 70): Polyline => ({
  id, kind: 'road', width, color: '#333',
  nodes: nodes.map(([x, y]) => ({ x, y } as PolyNode)),
});

// segmentIntersectPt 基础
const h = segmentIntersectPt({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: -5 }, { x: 5, y: 5 });
eq('segIntersect point', h && { x: Math.round(h.x), y: Math.round(h.y) }, { x: 5, y: 0 });
eq('segIntersect parallel', segmentIntersectPt({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 }), null);

// 十字
{
  const j = analyzeJunctions([mk('a', [[0, 0], [200, 0]]), mk('b', [[100, -100], [100, 100]])]);
  eq('cross count', j.length, 1);
  eq('cross type', j[0]?.type, 'cross');
  eq('cross arms', j[0]?.arms.length, 4);
}
// T（几何：端点贴中线）
{
  const j = analyzeJunctions([mk('a', [[0, 0], [200, 0]]), mk('b', [[100, 0], [100, 100]])]);
  eq('T-geo count', j.length, 1);
  eq('T-geo type', j[0]?.type, 'T');
  eq('T-geo arms', j[0]?.arms.length, 3);
}
// T（共点分支：宿主 mid 节点 + 支线）
{
  const j = analyzeJunctions([mk('a', [[0, 0], [100, 0], [200, 0]]), mk('c', [[100, 0], [100, 100]])]);
  eq('T-node count', j.length, 1);
  eq('T-node type', j[0]?.type, 'T');
  eq('T-node arms', j[0]?.arms.length, 3);
}
// Y（共点 3 线，锐分叉）
{
  const j = analyzeJunctions([mk('a', [[0, 0], [100, 0]]), mk('b', [[100, 0], [194, 34]]), mk('c', [[100, 0], [194, -34]])]);
  eq('Y count', j.length, 1);
  eq('Y type', j[0]?.type, 'Y');
  eq('Y arms', j[0]?.arms.length, 3);
}
// 平行不交叉
{
  const j = analyzeJunctions([mk('a', [[0, 0], [200, 0]]), mk('b', [[0, 60], [200, 60]])]);
  eq('parallel none', j.length, 0);
}
// 无 NaN
{
  const j = analyzeJunctions([mk('a', [[0, 0], [200, 0]]), mk('b', [[100, -100], [100, 100]]), mk('c', [[0, 50], [200, 50]])]);
  const nan = JSON.stringify(j).includes('NaN');
  eq('no NaN', nan, false);
  console.log('multi junctions:', j.map(x => x.type));
}

// —— Phase B：标线集生成 ——
{
  const j = analyzeJunctions([mk('a', [[0, 0], [200, 0]]), mk('b', [[100, -100], [100, 100]])])[0];
  const mks = buildJunctionMarkings(j, 'int1');
  eq('B cross count>0', mks.length > 0, true);
  eq('B all tagged', mks.every(m => m.junctionId === 'int1'), true);
  eq('B has stop', mks.some(m => m.type === 'stop'), true);
  eq('B has crosswalk', mks.some(m => m.type === 'crosswalk'), true);
  eq('B has arrow', mks.some(m => m.type.startsWith('arrow-')), true);
  eq('B no NaN', JSON.stringify(mks).includes('NaN'), false);
  const bridge = buildJunctionMarkings(j, 'int1', { bridge: true });
  eq('B bridge no stop', bridge.some(m => m.type === 'stop'), false);
  eq('B bridge no crosswalk', bridge.some(m => m.type === 'crosswalk'), false);
}
{
  const j = analyzeJunctions([mk('a', [[0, 0], [100, 0]]), mk('b', [[100, 0], [194, 34]]), mk('c', [[100, 0], [194, -34]])])[0];
  const mks = buildJunctionMarkings(j, 'int2');
  eq('B Y has channelize', mks.some(m => m.type === 'channelize'), true);
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
