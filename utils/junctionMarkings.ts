import type { Marking, JunctionArm } from '../types';
import type { DetectedJunction, Pt } from './polyline';

/**
 * 国标(GB 5768.3 实践值)智能路口标线集生成器。
 * 给定一个分析得到的路口，返回应自动铺设的路面标线（全部带 junctionId，便于随路口刷新/整体删除）。
 * 约定：arm.heading 为"指向路口外/沿道路"的方向角(rad)；标线本地坐标前进方向=-Y；
 *       故把标线长轴(宽)垂直于道路、使其朝向 travel=heading+π 的旋转角 = heading - π/2。
 * 注意：数值为设计取值，集中在下方常量区，便于后续据标准文本微调。
 */

// —— 设计常量（世界单位）——
const STOP_THICK = 3;          // 停止线厚度
const CROSS_DEEP = 22;         // 人行横道纵深
const CROSS_BAR = 5;           // 斑马条宽（与渲染 crosswalk 一致参考）
const APPROACH_LEN = 46;       // 进口导向实线/箭头区长度
const LANE_W = 35;             // 标准车道宽（与 inferLanes 一致）
const ARROW_W = 22;            // 导向箭头宽
const ARROW_H = 30;            // 导向箭头高
const YIELD_DEEP = 4;          // 让行线纵深

const WHITE = '#ffffff';

const rotFor = (heading: number): number => heading - Math.PI / 2; // 让标线宽轴⊥道路，箭头朝向=heading+π(来车→路口)
const along = (c: Pt, heading: number, dist: number): Pt => ({ x: c.x + Math.cos(heading) * dist, y: c.y + Math.sin(heading) * dist });

/** 一条进口臂上的"车道中心横向偏移"（垂直道路方向），用于放导向箭头 */
function laneCenters(width: number, lanes: number): number[] {
  const n = Math.max(1, Math.min(6, lanes));
  const usable = Math.min(width, n * LANE_W);
  const out: number[] = [];
  for (let k = 0; k < n; k++) out.push(-usable / 2 + (k + 0.5) * (usable / n));
  return out;
}

/** 在垂直道路方向(=heading+π/2)上偏移 off 的点 */
const perp = (c: Pt, heading: number, off: number): Pt => {
  const a = heading + Math.PI / 2;
  return { x: c.x + Math.cos(a) * off, y: c.y + Math.sin(a) * off };
};

interface MkOpts { bridge?: boolean; }

function mk(type: Marking['type'], p: Pt, w: number, h: number, rotation: number, junctionId: string, color = WHITE): Marking {
  // 自动标线也必须有 id：否则元素列表/选择/删除等按 id 的逻辑会在 undefined 上崩溃。
  return { id: `mk-${Math.random().toString(36).slice(2, 9)}`, type, x: p.x, y: p.y, width: w, height: h, rotation, color, junctionId };
}

/** 单臂：停止线 + 人行横道 + 进口白实线分隔 + 导向箭头（箭头类型由 turns 指定，长度对齐车道） */
function armMarkings(c: Pt, arm: JunctionArm, jid: string, turns: ('straight' | 'left' | 'right' | 'uturn')[], opts: MkOpts): Marking[] {
  const out: Marking[] = [];
  const h = arm.heading;
  const r = rotFor(h);
  const sizeHalf = Math.max(arm.width * 0.6, 34); // 路口连接件半径估计
  if (!opts.bridge) {
    // 停止线（垂直道路，宽=路宽）
    const stopD = sizeHalf + CROSS_DEEP + 4;
    out.push(mk('stop', along(c, h, stopD), arm.width, STOP_THICK, r, jid));
    // 人行横道（停止线外）
    out.push(mk('crosswalk', along(c, h, sizeHalf + CROSS_DEEP / 2 + 2), arm.width, CROSS_DEEP, r, jid));
    // 进口白实线分隔（停止线前一段，禁止变道）：在车道边界画 line-solid
    const centers = laneCenters(arm.width, arm.lanes);
    for (let i = 0; i < centers.length - 1; i++) {
      const b = (centers[i] + centers[i + 1]) / 2;
      const base = perp(along(c, h, stopD + 4), h, b);
      out.push(mk('line-solid', along(base, h, APPROACH_LEN / 2), APPROACH_LEN, 1.6, r, jid));
    }
  }
  // 导向箭头（每车道一个；桥面也画直行箭头示意上跨方向，可选——这里桥面跳过箭头，保持干净）
  if (!opts.bridge) {
    const centers = laneCenters(arm.width, arm.lanes);
    const arrowD = sizeHalf + CROSS_DEEP + 4 + 14 + ARROW_H / 2;
    centers.forEach((off, i) => {
      const t = turns[Math.min(i, turns.length - 1)] || 'straight';
      const type: Marking['type'] = t === 'left' ? 'arrow-left' : t === 'right' ? 'arrow-right' : t === 'uturn' ? 'arrow-uturn' : 'arrow-straight';
      const base = perp(along(c, h, arrowD), h, off);
      out.push(mk(type, base, ARROW_W, ARROW_H, r, jid));
    });
  }
  return out;
}

/** 导流线斜纹岛：放在两臂夹角内（鼻端三角），朝向=两臂角平分线 */
function channelize(c: Pt, h1: number, h2: number, jid: string, reach = 70, halfW = 16): Marking {
  const bis = Math.atan2(Math.sin(h1) + Math.sin(h2), Math.cos(h1) + Math.cos(h2));
  const p = along(c, bis, reach * 0.55);
  return mk('channelize', p, reach, halfW * 2, rotFor(bis), jid);
}

/** 减速让行线（双白虚 + 由 drawMarking2D/3D 的 yield 画倒三角） */
function yieldLine(c: Pt, arm: JunctionArm, jid: string, sizeHalf: number): Marking[] {
  const h = arm.heading, r = rotFor(h);
  const d = sizeHalf + 4;
  return [mk('yield', along(c, h, d), arm.width, YIELD_DEEP, r, jid)];
}

/** 路口类型 → 每臂的转向分配（按车道，左→右） */
function turnsFor(type: DetectedJunction['type'], arm: JunctionArm, _arms: JunctionArm[], idx: number): ('straight' | 'left' | 'right' | 'uturn')[] {
  const n = Math.max(1, Math.min(6, arm.lanes));
  if (type === 'T') {
    // 主路臂(有对向臂)给直行(+视车道左右)；支路臂给左+右
    const isBranch = !hasOpposite(_arms, idx);
    if (isBranch) return n >= 2 ? ['left', 'right'] : ['left'];
    return n >= 3 ? ['left', 'straight', 'right'] : n === 2 ? ['straight', 'right'] : ['straight'];
  }
  if (type === 'cross') return n >= 3 ? ['left', 'straight', 'right'] : n === 2 ? ['straight', 'right'] : ['straight'];
  if (type === 'Y' || type === 'ramp') return ['straight']; // 分合流由导流线表达，车道箭头先给直行
  if (type === 'roundabout') return ['right'];
  return ['straight'];
}
function hasOpposite(arms: JunctionArm[], idx: number): boolean {
  const h = arms[idx].heading;
  return arms.some((a, i) => i !== idx && Math.abs(Math.atan2(Math.sin(a.heading - h), Math.cos(a.heading - h))) > Math.PI - 0.5);
}

/** 由路口生成完整标线集 */
export function buildJunctionMarkings(j: DetectedJunction, junctionId: string, opts: MkOpts = {}): Marking[] {
  const out: Marking[] = [];
  const c = j.center;
  const sizeHalf = Math.max(...j.arms.map(a => a.width)) * 0.6 + 6;
  j.arms.forEach((arm, idx) => {
    const turns = turnsFor(j.type, arm, j.arms, idx);
    if (j.type === 'roundabout') {
      // 环道路径半径：让行线/人行横道放在环外缘进口处，环行箭头放在环道上
      const R = j.radius ?? sizeHalf;
      out.push(...yieldLine(c, arm, junctionId, R));
      // 进口外人行横道
      if (!opts.bridge) out.push(mk('crosswalk', along(c, arm.heading, R + CROSS_DEEP / 2 + 8), arm.width, CROSS_DEEP, rotFor(arm.heading), junctionId));
      // 环行方向箭头（置于环道上，示意绕行方向）
      out.push(mk('arrow-right', along(c, arm.heading, R * 0.82), ARROW_W, ARROW_H, rotFor(arm.heading), junctionId));
    } else if (j.type === 'Y' || j.type === 'ramp') {
      out.push(...armMarkings(c, arm, junctionId, turns, opts));
    } else {
      out.push(...armMarkings(c, arm, junctionId, turns, opts));
    }
  });
  // 导流线：Y/分合流/complex 在相邻锐角臂之间补鼻端岛
  if (j.type === 'Y' || j.type === 'ramp' || j.type === 'complex') {
    const hs = [...j.arms].sort((a, b) => a.heading - b.heading);
    for (let i = 0; i < hs.length; i++) {
      const a = hs[i], b = hs[(i + 1) % hs.length];
      let gap = Math.abs(a.heading - b.heading); if (gap > Math.PI) gap = Math.PI * 2 - gap;
      if (gap < 1.3 /* ≈75° 的夹角内放导流岛 */) out.push(channelize(c, a.heading, b.heading, junctionId));
    }
  }
  return out;
}
