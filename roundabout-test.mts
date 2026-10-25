import { analyzeJunctions, polylineToCurvedRoads, type Polyline, type PolyNode } from './utils/polyline.ts';
import { buildJunctionMarkings } from './utils/junctionMarkings.ts';

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  if (!ok) fails++;
};
const ok = (name: string, cond: boolean) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) fails++;
};

const line = (id: string, nodes: [number, number][], width = 70): Polyline => ({
  id, kind: 'road', width, color: '#333',
  nodes: nodes.map(([x, y]) => ({ x, y } as PolyNode)),
});

/** 生成以 (cx,cy) 为圆心、半径 r 的 n 边形闭合环（环岛） */
function ring(id: string, cx: number, cy: number, r: number, n = 16, width = 70): Polyline {
  const nodes: PolyNode[] = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    nodes.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return { id, kind: 'road', width, color: '#333', closed: true, nodes };
}

const CX = 500, CY = 500, R = 120;

// ① 单个环岛 + 1 条接入路
{
  // 接入路：端点 (CX, CY+R) 恰在环周，向外延伸到 (CX, CY+300)
  const rb = ring('rb', CX, CY, R);
  const road = line('r1', [[CX, CY + R], [CX, CY + 300]]);
  const j = analyzeJunctions([rb, road]);
  eq('rb1 count', j.length, 1);
  eq('rb1 type', j[0]?.type, 'roundabout');
  ok('rb1 has radius', typeof j[0]?.radius === 'number' && Math.abs((j[0]?.radius ?? 0) - R) < 6);
  eq('rb1 arms', j[0]?.arms.length, 1);
  ok('rb1 no NaN', !JSON.stringify(j).includes('NaN'));

  // 导出：kind:'roundabout' + center + radius
  const curved = polylineToCurvedRoads(rb);
  eq('rb1 curved kind', curved[0]?.kind, 'roundabout');
  ok('rb1 curved center', !!curved[0]?.center && Math.abs(curved[0]!.center!.x - CX) < 1 && Math.abs(curved[0]!.center!.y - CY) < 1);
  ok('rb1 curved radius', Math.abs((curved[0]?.radius ?? 0) - R) < 6);

  // 标线：含让行线，无 NaN
  const mks = buildJunctionMarkings(j[0]!, 'int-rb1');
  ok('rb1 has yield', mks.some(m => m.type === 'yield'));
  ok('rb1 has crosswalk', mks.some(m => m.type === 'crosswalk'));
  ok('rb1 has arrow', mks.some(m => m.type.startsWith('arrow-')));
  ok('rb1 all tagged', mks.every(m => m.junctionId === 'int-rb1'));
  ok('rb1 markings no NaN', !JSON.stringify(mks).includes('NaN'));
}

// ② 环岛 + 2 条接入路（对向）
{
  const rb = ring('rb', CX, CY, R);
  const r1 = line('r1', [[CX, CY + R], [CX, CY + 300]]);      // 下方接入
  const r2 = line('r2', [[CX, CY - R], [CX, CY - 300]]);      // 上方接入
  const j = analyzeJunctions([rb, r1, r2]);
  eq('rb2 count', j.length, 1);
  eq('rb2 type', j[0]?.type, 'roundabout');
  eq('rb2 arms', j[0]?.arms.length, 2);
  ok('rb2 no NaN', !JSON.stringify(j).includes('NaN'));
  const mks = buildJunctionMarkings(j[0]!, 'int-rb2');
  // 两臂各一组让行线
  eq('rb2 yield count', mks.filter(m => m.type === 'yield').length, 2);
  ok('rb2 markings no NaN', !JSON.stringify(mks).includes('NaN'));
}

// ③ 非圆闭合环（方形）不应误判为环岛
{
  const square: Polyline = {
    id: 'sq', kind: 'road', width: 70, color: '#333', closed: true,
    nodes: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }, { x: 0, y: 100 }, { x: 100, y: 100 }],
  };
  const j = analyzeJunctions([square]);
  ok('square not roundabout', j.every(x => x.type !== 'roundabout'));
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
