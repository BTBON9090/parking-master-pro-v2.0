// 路口自适应多边形几何单测：buildJunctionPolygon / roundedPolygonPoints
import { buildJunctionPolygon, roundedPolygonPoints } from './utils/polyline';
import type { JunctionArm } from './types';

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  if (!ok) fails++;
};
const approx = (name: string, got: number, want: number, eps = 1e-6) => {
  const ok = Math.abs(got - want) <= eps;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  got=${got} want=${want}`);
  if (!ok) fails++;
};
const arm = (headingDeg: number, width = 40): JunctionArm => ({
  polyId: 'p', heading: headingDeg * Math.PI / 180, lanes: 2, direction: 'two-way', width,
});

// —— 正交十字：四角应为 (±20,±20) ——
{
  const poly = buildJunctionPolygon([arm(0), arm(90), arm(180), arm(270)]);
  eq('cross not null', !!poly, true);
  const p = poly!;
  eq('cross 4 corners', p.length, 4);
  const set = p.map(c => `${Math.round(c.x)},${Math.round(c.y)}`).sort();
  eq('cross corner set', set, ['-20,-20', '-20,20', '20,-20', '20,20']);
  // 圆角后点数应多于 4 且全部有限
  const rp = roundedPolygonPoints(p, 8);
  eq('cross rounded > 4', rp.length > 4, true);
  eq('cross rounded finite', rp.every(c => isFinite(c.x) && isFinite(c.y)), true);
}

// —— 斜交十字（水平 + 125° 斜路）：4 个不同角点；水平臂上下边 y=±20 上各应有交点 ——
{
  const poly = buildJunctionPolygon([arm(0), arm(180), arm(125), arm(305)]);
  eq('skew not null', !!poly, true);
  const p = poly!;
  eq('skew 4 corners', p.length, 4);
  eq('skew finite', p.every(c => isFinite(c.x) && isFinite(c.y)), true);
  // 角点 y 坐标应只取 ±20（水平路两条边线），且两个 +20 两个 -20
  const ys = p.map(c => Math.round(c.y)).sort((a, b) => a - b);
  eq('skew y on horiz edges', ys, [-20, -20, 20, 20]);
  // x 不应全是 ±20（说明确实随角度倾斜、非正方形）
  const xs = p.map(c => Math.round(c.x)).sort((a, b) => a - b);
  eq('skew not axis square', xs.join(',') === '-20,-20,20,20', false);
}

// —— T 字路口：半平面交 = 中央方块 (±20)，连接横路与直臂 ——
{
  const poly = buildJunctionPolygon([arm(0), arm(180), arm(90)]);
  eq('T not null', !!poly, true);
  eq('T 4 corners', poly!.length, 4);
  const set = poly!.map(c => `${Math.round(c.x)},${Math.round(c.y)}`).sort();
  eq('T corner set', set, ['-20,-20', '-20,20', '20,-20', '20,20']);
}

// —— 退化：2 臂 → null（回退方块） ——
{
  eq('two-arm null', buildJunctionPolygon([arm(0), arm(180)]), null);
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
