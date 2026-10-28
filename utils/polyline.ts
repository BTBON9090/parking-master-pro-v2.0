import { LevelData, Obstacle, CurvedRoadSurface, Vector2, Intersection, JunctionType, JunctionArm } from '../types';

/** 折线节点。radius=倒圆角半径覆盖；width=节点路宽覆盖(渐变)；lanes/direction=节点级覆盖 */
export interface PolyNode {
  x: number; y: number; sharp?: boolean; radius?: number;
  width?: number; lanes?: number; direction?: 'two-way' | 'one-way';
}

export type RoadDirection = 'two-way' | 'one-way';

/** 折线元素（道路/墙壁）。cornerRadius 默认倒圆角半径；lanes/direction 车道模型 */
export interface Polyline {
  id: string;
  kind: 'road' | 'wall';
  nodes: PolyNode[];
  width: number;
  color: string;
  closed?: boolean;
  cornerRadius?: number;
  lanes?: number;            // 车道总数(缺省按 width 推断)
  direction?: RoadDirection; // 行驶方向(纯视觉)
}

/** 节点有效倒圆角半径：sharp 或 radius<=0 → 0(直角)，否则 radius ?? 折线默认 ?? fallback */
export function nodeRadius(nd: PolyNode, defaultR: number, fallback = 24): number {
  if (nd.sharp) return 0;
  if (nd.radius !== undefined) return Math.max(0, nd.radius);
  return Math.max(0, defaultR ?? fallback);
}

/** 节点有效路宽：node.width ?? 折线宽 */
export function nodeWidth(nd: PolyNode, plWidth: number): number {
  return nd.width !== undefined && nd.width > 0 ? nd.width : plWidth;
}

/** 按路宽推断车道数(标准车道约 35 宽)，clamp 1..6 */
export function inferLanes(width: number, explicit?: number): number {
  if (explicit && explicit > 0) return Math.max(1, Math.min(6, Math.round(explicit)));
  return Math.max(1, Math.min(6, Math.round(width / 35)));
}

export interface Pt { x: number; y: number; }

// ---- 几何辅助 ----
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (a: Pt, s: number): Pt => ({ x: a.x * s, y: a.y * s });
const len = (a: Pt): number => Math.hypot(a.x, a.y);
const norm = (a: Pt): Pt => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
const EPS = 1e-4;
const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** 去除重合节点（相邻过近的点、闭合时首尾重合点），从源头避免 Catmull-Rom 退化 */
export function sanitizeNodes(nodes: PolyNode[], closed: boolean, eps = 0.5): PolyNode[] {
  const out: PolyNode[] = [];
  for (const nd of nodes) {
    const last = out[out.length - 1];
    if (last && Math.hypot(nd.x - last.x, nd.y - last.y) < eps) continue;
    out.push({ ...nd });
  }
  if (closed && out.length >= 2) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) < eps) out.pop();
  }
  return out;
}

/** 去重后的纯点版本 */
function sanitizePts(pts: Pt[], closed: boolean, eps = 0.5): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < eps) continue;
    out.push({ x: p.x, y: p.y });
  }
  if (closed && out.length >= 2 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) < eps) out.pop();
  return out;
}

/**
 * 向心 Catmull-Rom 采样（alpha=0.5），de Boor 递推形式。
 * 对重合点稳健：零长节点区间退化为线性插值，绝不产生 NaN。
 * @param pts 控制点（2D，y 向下）
 * @param samples 每段采样数
 * @param closed 是否闭合
 * @param tangent 若提供，输出每点的切线方向
 */
export function catmullRom2D(ptsIn: Pt[], samples = 18, closed = false, tangent?: Pt[]): Pt[] {
  const pts = sanitizePts(ptsIn, closed);
  const n = pts.length;
  if (n === 0) return [];
  if (n === 1) return tangent ? (tangent.push({ x: 1, y: 0 }), [{ ...pts[0] }]) : [{ ...pts[0] }];

  const P = (i: number): Pt => {
    if (closed) return pts[((i % n) + n) % n];
    if (i < 0) return { x: 2 * pts[0].x - pts[1].x, y: 2 * pts[0].y - pts[1].y };
    if (i >= n) return { x: 2 * pts[n - 1].x - pts[n - 2].x, y: 2 * pts[n - 1].y - pts[n - 2].y };
    return pts[i];
  };
  const knot = (ti: number, p0: Pt, p1: Pt): number => {
    const d = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    return ti + Math.pow(d, 0.5); // alpha=0.5 向心
  };

  const out: Pt[] = [];
  const pushTan = (a: Pt, b: Pt) => {
    if (!tangent) return;
    const tg = sub(b, a);
    tangent.push(len(tg) < 1e-6 ? { x: 1, y: 0 } : norm(tg));
  };

  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const t0 = 0;
    const t1 = knot(t0, p0, p1);
    const t2 = knot(t1, p1, p2);
    const t3 = knot(t2, p2, p3);
    for (let s = 0; s < samples; s++) {
      const t = t1 + (t2 - t1) * (s / samples);
      // de Boor 递推，零区间安全退化
      const A1 = (t1 - t0) > EPS ? lerpPt(p0, p1, (t - t0) / (t1 - t0)) : { ...p1 };
      const A2 = (t2 - t1) > EPS ? lerpPt(p1, p2, (t - t1) / (t2 - t1)) : { ...p1 };
      const A3 = (t3 - t2) > EPS ? lerpPt(p2, p3, (t - t2) / (t3 - t2)) : { ...p2 };
      const B1 = (t2 - t0) > EPS ? lerpPt(A1, A2, (t - t0) / (t2 - t0)) : { ...A1 };
      const B2 = (t3 - t1) > EPS ? lerpPt(A2, A3, (t - t1) / (t3 - t1)) : { ...A2 };
      const C = (t2 - t1) > EPS ? lerpPt(B1, B2, (t - t1) / (t2 - t1)) : { ...B1 };
      out.push(C);
      pushTan(B1, B2);
    }
  }
  const last = closed ? { ...pts[0] } : { ...pts[n - 1] };
  out.push(last);
  pushTan(out[out.length - 2], last);
  return out;
}

/**
 * 沿中心线构建左右边缘点（带状），段间使用真正的斜接(miter)连接。
 * - 直角拐角：斜接延长外侧边缘至交点，内侧边缘自然收拢 → 拐角被完整填充，无缺口/凹角。
 * - 圆角(倒角弧)：相邻采样点转角极小，斜接量≈half，平滑连续。
 * 斜接量设上限(MITER_LIMIT)防止极锐角产生尖刺。
 */
const MITER_LIMIT = 1.8;
export function buildRibbon(centerline: Pt[], width: number | number[]): { left: Pt[]; right: Pt[] } {
  const left: Pt[] = [];
  const right: Pt[] = [];
  const widthArr = Array.isArray(width) ? width : null;
  const scalarHalf = widthArr ? 0 : (width as number) / 2;
  const n0 = centerline.length;
  if (n0 === 0) return { left, right };
  // 闭合判定：首尾点重合（serializeSampled 对闭合折线会补回起点）
  const closed = n0 > 2 && Math.hypot(centerline[0].x - centerline[n0 - 1].x, centerline[0].y - centerline[n0 - 1].y) < 0.75;
  // 去除连续重合点（点+宽度同步去重，零切线会让斜接爆炸）
  const cl: Pt[] = [];
  const wCl: number[] = [];
  for (let k = 0; k < n0; k++) {
    const p = centerline[k];
    const last = cl[cl.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.5) continue;
    cl.push(p); wCl.push(widthArr ? widthArr[k] : (width as number));
  }
  if (closed && cl.length > 1 && Math.hypot(cl[0].x - cl[cl.length - 1].x, cl[0].y - cl[cl.length - 1].y) < 0.5) { cl.pop(); wCl.pop(); }
  const m = cl.length; // 唯一点数
  if (m < 2) return { left: cl.map(p => ({ ...p })), right: cl.map(p => ({ ...p })) };
  const at = (i: number): Pt => cl[((i % m) + m) % m];
  const halfAt = (i: number): number => widthArr ? wCl[((i % m) + m) % m] / 2 : scalarHalf;

  // 逐点计算左右两侧的几何：外侧斜接(过长则倒角 bevel)，内侧夹紧，保证内外边缘均不自交。
  interface Vtx { end?: boolean; nb: Pt; ni?: Pt; no?: Pt; sL: number; sR: number; leftOuter: boolean; rawMiter: number; }
  const vtx: Vtx[] = [];
  for (let i = 0; i < m; i++) {
    const p = at(i);
    const half = halfAt(i);
    if (!closed && (i === 0 || i === m - 1)) {
      // 端点法线必须与内部顶点同向约定：用"沿行进方向"的切线。
      // 起点用出射切线(at(1)-p)，终点用入射切线(p-at(m-2))；方向取反会让左右边交换 → 末端交叉成 X。
      const t = i === 0 ? norm(sub(at(1), p)) : norm(sub(p, at(m - 2)));
      vtx.push({ end: true, nb: { x: -t.y, y: t.x }, sL: 1, sR: 1, leftOuter: false, rawMiter: 1 });
      continue;
    }
    const tIn = norm(sub(p, at(i - 1)));
    const tOut = norm(sub(at(i + 1), p));
    const ni: Pt = { x: -tIn.y, y: tIn.x };   // 入射左法线
    const no: Pt = { x: -tOut.y, y: tOut.x }; // 出射左法线
    let mL = add(ni, no);
    if (len(mL) < 1e-6) mL = ni;              // 180° 回头弯退化
    mL = norm(mL);
    const cL = Math.max(0.12, Math.abs(mL.x * ni.x + mL.y * ni.y)); // cos(半转角)
    const rawMiter = 1 / cL;
    const outer = Math.min(MITER_LIMIT, rawMiter);
    // 内侧夹紧：取"转角夹紧"与"局部曲率夹紧"的较小者，保证内缘永不自交/交错（用当地路宽）
    let inner = Math.max(0.4, cL);
    const dotT = tIn.x * tOut.x + tIn.y * tOut.y;
    const turn = Math.acos(Math.max(-1, Math.min(1, dotT)));
    if (turn > 1e-3) {
      const Rcurv = half / Math.max(1e-3, 2 * Math.sin(turn / 2)); // 局部曲率半径
      inner = Math.min(inner, Math.max(0.25, (Rcurv - 1.5) / half)); // 内缘半径≥1.5
    }
    inner = Math.min(MITER_LIMIT, inner);
    const cross = tIn.x * tOut.y - tIn.y * tOut.x;            // >0 左转 → 左侧为内
    const nb = mL.x * ni.x + mL.y * ni.y >= 0 ? mL : scale(mL, -1);
    const leftOuter = cross <= 0;
    vtx.push({ nb, ni, no, sL: leftOuter ? outer : inner, sR: leftOuter ? inner : outer, leftOuter, rawMiter });
  }
  const count = closed ? m + 1 : m; // 闭合时补回起点，使带面环绕一周
  for (let i = 0; i < count; i++) {
    const idx = i % m;
    const v = vtx[idx];
    const p = at(idx);
    const half = halfAt(idx);
    if (v.end || !v.ni || !v.no || v.rawMiter <= MITER_LIMIT) {
      left.push(add(p, scale(v.nb, half * v.sL)));
      right.push(add(p, scale(v.nb, -half * v.sR)));
    } else {
      // 外侧斜接过长 → 倒角(bevel)：外缘取入射/出射两段偏移角点；内缘仍单点
      if (v.leftOuter) {
        left.push(add(p, scale(v.ni, half))); left.push(add(p, scale(v.no, half)));
        right.push(add(p, scale(v.nb, -half * v.sR)));
      } else {
        right.push(add(p, scale(v.ni, -half))); right.push(add(p, scale(v.no, -half)));
        left.push(add(p, scale(v.nb, half * v.sL)));
      }
    }
  }
  return { left, right };
}

// ===================== 分段（run）几何：直角/圆角统一处理 =====================
export interface Run { pts: Pt[]; nodes: PolyNode[]; closed: boolean; }

/**
 * 统一中心线生成：圆角节点用"倒圆角"(恒定半径圆弧，与两侧线段相切)，
 * 直角节点保留折点(配合 buildRibbon 的斜接填充)。直线段保持笔直。
 * 这是替代 Catmull-Rom 平滑的核心：拐角连续且半径恒定，视觉上是真正的倒圆角。
 */
export function buildCenterline(nodesIn: PolyNode[], closed: boolean, perSeg = 16, defaultRadius = 26, width = 0): { pts: Pt[]; widths: number[] } {
  const nodes = sanitizeNodes(nodesIn, closed);
  const n = nodes.length;
  if (n === 0) return { pts: [], widths: [] };
  if (n === 1) return { pts: [{ x: nodes[0].x, y: nodes[0].y }], widths: [nodeWidth(nodes[0], width)] };
  const P = (i: number): Pt => { const j = ((i % n) + n) % n; return { x: nodes[j].x, y: nodes[j].y }; };
  const W = (i: number): number => nodeWidth(nodes[((i % n) + n) % n], width); // 节点有效路宽
  const Rraw = (i: number) => nodeRadius(nodes[((i % n) + n) % n], defaultRadius);
  // 倒角半径不得小于"该节点"半路宽，否则内缘半径为负会自交；<=0(直角)不夹紧
  const R = (i: number) => { const r = Rraw(i); const w = W(i); return (r > 0 && w > 0) ? Math.max(r, w / 2 + 2) : r; };
  const edgeLen = (i: number) => len(sub(P(i + 1), P(i)));
  const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;

  // 每个节点处的倒圆角切点偏移量 t（沿入射边回退 / 沿出射边前进的距离）。R<=0 → 直角，不倒角
  const T: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const isCorner = closed ? true : (i > 0 && i < n - 1);
    const r = R(i);
    if (!isCorner || r <= 0) continue;
    const uIn = norm(sub(P(i), P(i - 1)));
    const uOut = norm(sub(P(i + 1), P(i)));
    const cosA = Math.max(-1, Math.min(1, uIn.x * uOut.x + uIn.y * uOut.y));
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    if (sinA < 1e-3) continue; // 近似直线，不倒角
    const t = r * (1 - cosA) / sinA; // R / tan(半内角)
    if (!isFinite(t) || t <= 0) continue;
    const maxT = Math.min(edgeLen(i - 1), edgeLen(i)) / 2;
    T[i] = Math.min(t, maxT);
  }

  const out: Pt[] = [];
  const outW: number[] = [];
  const push = (p: Pt, w: number) => { out.push(p); outW.push(w); };
  const arcSamples = Math.max(4, Math.round(perSeg / 2));
  const steps = closed ? n : n - 1;
  for (let i = 0; i < steps; i++) {
    const j = (i + 1) % n;
    let A = P(i), B = P(j);
    const wN_i = W(i), wN_j = W(j);
    const paramA = T[i] > 0 ? T[i] / edgeLen(i) : 0;
    const paramB = T[j] > 0 ? 1 - T[j] / edgeLen(i) : 1;
    if (T[i] > 0) A = lerpPt(P(i), P(i + 1), paramA);
    if (T[j] > 0) B = lerpPt(P(j), P(i), T[j] / edgeLen(i));
    const wA = lerpN(wN_i, wN_j, paramA);
    const wB = lerpN(wN_i, wN_j, paramB);
    push(A, wA);
    // 直线段细分（宽度同步线性插值 → 渐变）
    for (let s = 1; s < perSeg; s++) push(lerpPt(A, B, s / perSeg), lerpN(wA, wB, s / perSeg));
    // j 处的倒圆角弧（切于入射边与出射边），弧上宽度=该节点宽
    if (T[j] > 0) {
      const uIn = norm(sub(P(j), P(j - 1)));
      const uOut = norm(sub(P(j + 1), P(j)));
      const cosA = Math.max(-1, Math.min(1, uIn.x * uOut.x + uIn.y * uOut.y));
      const cosB = Math.sqrt(Math.max(1e-6, (1 - cosA) / 2)); // cos(半内角)
      const bis = norm(sub(uOut, uIn)); // 指向拐角内部的角平分线
      const C = add(P(j), scale(bis, T[j] / cosB)); // 弧心
      const Bpt = lerpPt(P(j), P(j + 1), T[j] / edgeLen(j)); // 出射边切点(弧终点)
      const v0 = norm(sub(B, C)); // 弧起点 = 入射边切点 B
      const v1 = norm(sub(Bpt, C));
      const cross = v0.x * v1.y - v0.y * v1.x;
      const dotv = v0.x * v1.x + v0.y * v1.y;
      let delta = Math.atan2(cross, dotv);
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;
      const r = len(sub(B, C));
      const a0 = Math.atan2(v0.y, v0.x);
      for (let s = 0; s <= arcSamples; s++) {
        const ang = a0 + delta * (s / arcSamples);
        push({ x: C.x + r * Math.cos(ang), y: C.y + r * Math.sin(ang) }, wN_j);
      }
    }
  }
  if (!closed) push(P(n - 1), W(n - 1));
  else push({ ...out[0] }, outW[0]);
  // 去重（点+宽度同步）：倒角弧终点与下一段起点会重合，零长切线会让 buildRibbon 斜接爆炸/自交
  const dedup: Pt[] = [];
  const dedupW: number[] = [];
  for (let k = 0; k < out.length; k++) {
    const p = out[k];
    const last = dedup[dedup.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.5) continue;
    dedup.push(p); dedupW.push(outW[k]);
  }
  if (closed && dedup.length > 1 && Math.hypot(dedup[0].x - dedup[dedup.length - 1].x, dedup[0].y - dedup[dedup.length - 1].y) < 0.5) { dedup.pop(); dedupW.pop(); }
  return { pts: dedup, widths: dedupW };
}

/**
 * 按"直角"(有效半径<=0)节点把折线拆分成若干"段(run)"，用于逐段命中/删除与导出。
 * - 直角节点 = 段的边界
 * - 圆角节点 = 段内部
 */
export function splitIntoRuns(nodesIn: PolyNode[], closed: boolean, defaultRadius = 26): Run[] {
  const nodes = sanitizeNodes(nodesIn, closed);
  const n = nodes.length;
  if (n < 2) return [];
  const isSharp = (i: number) => nodeRadius(nodes[((i % n) + n) % n], defaultRadius) <= 0;
  const pt = (i: number): Pt => { const j = ((i % n) + n) % n; return { x: nodes[j].x, y: nodes[j].y }; };
  const nd = (i: number): PolyNode => { const j = ((i % n) + n) % n; return { ...nodes[j] }; };

  if (!closed) {
    const bounds = [0];
    for (let i = 1; i < n - 1; i++) if (isSharp(i)) bounds.push(i);
    bounds.push(n - 1);
    const uniq = [...new Set(bounds)].sort((a, b) => a - b);
    const runs: Run[] = [];
    for (let i = 0; i < uniq.length - 1; i++) {
      const pts: Pt[] = []; const rnodes: PolyNode[] = [];
      for (let j = uniq[i]; j <= uniq[i + 1]; j++) { pts.push(pt(j)); rnodes.push(nd(j)); }
      if (pts.length >= 2) runs.push({ pts, nodes: rnodes, closed: false });
    }
    return runs;
  }
  const sharpIdx: number[] = [];
  for (let i = 0; i < n; i++) if (isSharp(i)) sharpIdx.push(i);
  if (sharpIdx.length === 0) return [{ pts: nodes.map(p => ({ x: p.x, y: p.y })), nodes: nodes.map(p => ({ ...p })), closed: true }];
  const s0 = sharpIdx[0];
  const rel = sharpIdx.map(i => (i - s0 + n) % n).sort((a, b) => a - b);
  const runs: Run[] = [];
  for (let k = 0; k < rel.length; k++) {
    const a = rel[k], b = (k + 1 < rel.length) ? rel[k + 1] : rel[0] + n;
    const pts: Pt[] = []; const rnodes: PolyNode[] = [];
    for (let j = a; j <= b; j++) { pts.push(pt(s0 + j)); rnodes.push(nd(s0 + j)); }
    if (pts.length >= 2) runs.push({ pts, nodes: rnodes, closed: false });
  }
  return runs;
}

/** 折线 → 多段中心线（按 sharp 节点分段，每段用倒圆角中心线；命中/逐段删除用） */
export function polylineToCenterSegments(pl: Polyline, perSeg = 16): Pt[][] {
  const runs = splitIntoRuns(pl.nodes, !!pl.closed, pl.cornerRadius);
  return runs.map(run => buildCenterline(run.nodes, run.closed, perSeg, pl.cornerRadius, pl.width).pts);
}

/** 折线 → 多段 {中心线, 逐点路宽}（渲染/导出渐变用） */
export function polylineToCenterSegmentsW(pl: Polyline, perSeg = 16): { pts: Pt[]; widths: number[] }[] {
  const runs = splitIntoRuns(pl.nodes, !!pl.closed, pl.cornerRadius);
  return runs.map(run => buildCenterline(run.nodes, run.closed, perSeg, pl.cornerRadius, pl.width));
}

/** 多段中心线 → 带状左右边缘（段间斜接，直角处完整填充） */
export function centerSegmentsToRibbon(segs: Pt[][], width: number | number[]): { left: Pt[]; right: Pt[] } {
  const left: Pt[] = [];
  const right: Pt[] = [];
  segs.forEach(seg => {
    const rb = buildRibbon(seg, width);
    left.push(...rb.left);
    right.push(...rb.right);
  });
  return { left, right };
}

/** 折线 → 完整采样中心线（sharp 处保留折角，用于渲染/命中/吸附） */
export function serializeSampled(pl: Polyline, perSeg = 16): Pt[] {
  const segs = polylineToCenterSegments(pl, perSeg);
  const out: Pt[] = [];
  segs.forEach((seg, i) => out.push(...(i === 0 ? seg : seg.slice(1))));
  return out;
}

/** 折线 → 完整采样 {中心线, 逐点路宽}（用于 2D 渲染渐变带状） */
export function serializeSampledW(pl: Polyline, perSeg = 16): { pts: Pt[]; widths: number[] } {
  const segs = polylineToCenterSegmentsW(pl, perSeg);
  const pts: Pt[] = []; const widths: number[] = [];
  segs.forEach((seg, i) => {
    pts.push(...(i === 0 ? seg.pts : seg.pts.slice(1)));
    widths.push(...(i === 0 ? seg.widths : seg.widths.slice(1)));
  });
  return { pts, widths };
}

/** 折线道路 → CurvedRoadSurface[]（直角处拆分为多段；圆角用倒圆角采样；透传 widths/lanes/direction） */
export function polylineToCurvedRoads(pl: Polyline): CurvedRoadSurface[] {
  const nodes = sanitizeNodes(pl.nodes, !!pl.closed);
  const runs = splitIntoRuns(nodes, !!pl.closed, pl.cornerRadius);
  // 环岛：闭合近圆环导出为 kind:'roundabout'，让 3D 用 RingGeometry 渲染真正的环道
  const rbFit = fitCircleIfRoundabout(pl);
  return runs.map(run => {
    // 倒圆角采样：圆角节点呈恒定半径圆弧，直角节点保持折角
    const { pts, widths } = buildCenterline(run.nodes, run.closed, 8, pl.cornerRadius, pl.width);
    const wMin = Math.min(...widths), wMax = Math.max(...widths);
    const tapered = wMax - wMin > 0.5;
    const isRoundabout = !!rbFit && run.closed;
    return {
      points: pts.map(p => ({ x: p.x, y: p.y })),
      width: pl.width,
      widths: tapered ? widths : undefined,
      color: pl.color,
      closed: run.closed,
      kind: isRoundabout ? 'roundabout' as const : 'path' as const,
      center: isRoundabout ? { x: rbFit!.center.x, y: rbFit!.center.y } : undefined,
      radius: isRoundabout ? rbFit!.radius : undefined,
      lanes: pl.lanes,
      direction: pl.direction,
    };
  });
}

/** 折线墙壁 → Obstacle[] 墙段（沿采样路径生成一连串矩形，直角处自然折断） */
export function polylineToWallSegments(pl: Polyline, idBase: string): Obstacle[] {
  const segs = polylineToCenterSegments(pl, 14);
  const segsOut: Obstacle[] = [];
  const targetLen = Math.max(pl.width * 0.9, 18);
  let counter = 0;
  const emit = (pts: Pt[]) => {
    if (pts.length < 2) return;
    const a = pts[0], b = pts[pts.length - 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1) return;
    segsOut.push({
      id: `${idBase}-w${counter++}`,
      x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
      width: segLen + pl.width * 0.35, height: pl.width,
      rotation: Math.atan2(dy, dx),
      type: 'wall', movable: false, weight: 0, color: pl.color,
    });
  };
  for (const center of segs) {
    let acc: Pt[] = [center[0]];
    let accLen = 0;
    for (let i = 1; i < center.length; i++) {
      acc.push(center[i]);
      accLen += Math.hypot(center[i].x - center[i - 1].x, center[i].y - center[i - 1].y);
      if (accLen >= targetLen) { emit(acc); acc = [center[i]]; accLen = 0; }
    }
    emit(acc);
  }
  return segsOut;
}

/** 序列化编辑器数据 → LevelData */
export function serializeToLevelData(state: {
  polylines: Polyline[];
  obstacles: Obstacle[];
  spots: LevelData['spots'];
  markings: LevelData['markings'];
  mapWidth: number;
  mapHeight: number;
  startPos?: LevelData['startPos'];
  intersections?: Intersection[];
}): LevelData {
  const curvedRoads: CurvedRoadSurface[] = [];
  const wallSegs: Obstacle[] = [];
  state.polylines.forEach(pl => {
    if (pl.kind === 'road') curvedRoads.push(...polylineToCurvedRoads(pl));
    else wallSegs.push(...polylineToWallSegments(pl, pl.id));
  });
  return {
    levelId: 0,
    mapWidth: state.mapWidth,
    mapHeight: state.mapHeight,
    spots: state.spots,
    obstacles: [...wallSegs, ...state.obstacles],
    markings: state.markings,
    startPos: state.startPos || { x: state.mapWidth / 2, y: 200, rotation: -Math.PI / 2 },
    roadSurfaces: [],
    curvedRoads,
    intersections: state.intersections || [],
  };
}

/** 从 LevelData 反序列化（导入）：curvedRoads → 道路折线，walls 保留为 obstacle 矩形 */
export function deserializeFromLevelData(ld: LevelData): {
  polylines: Polyline[];
  obstacles: Obstacle[];
  intersections: Intersection[];
} {
  const polylines: Polyline[] = [];
  (ld.curvedRoads || []).forEach((cr, i) => {
    polylines.push({
      id: `road-${i}-${Math.random().toString(36).slice(2, 7)}`,
      kind: 'road',
      nodes: cr.points.map((p, k) => ({ x: p.x, y: p.y, width: cr.widths?.[k] })),
      width: cr.width,
      color: cr.color,
      closed: cr.closed,
      lanes: cr.lanes,
      direction: cr.direction,
    });
  });
  // 矩形道路也转成两点折线
  (ld.roadSurfaces || []).forEach((rs, i) => {
    const cos = Math.cos(rs.rotation), sin = Math.sin(rs.rotation);
    const hw = rs.width / 2;
    polylines.push({
      id: `road-rs-${i}-${Math.random().toString(36).slice(2, 7)}`,
      kind: 'road',
      nodes: [
        { x: rs.x - hw * cos, y: rs.y - hw * sin },
        { x: rs.x + hw * cos, y: rs.y + hw * sin },
      ],
      width: rs.height,
      color: rs.color,
    });
  });
  // 墙壁 obstacle 保持为矩形（不还原为折线）
  const obstacles = ld.obstacles || [];
  return { polylines, obstacles, intersections: ld.intersections || [] };
}

// ===================== 智能路口：交叉检测 + 分类 =====================

/** 段-段相交，返回交点与两段参数 t1/t2∈[0,1]；平行/共线/不相交返回 null */
export function segmentIntersectPt(a: Pt, b: Pt, c: Pt, d: Pt): { x: number; y: number; t1: number; t2: number } | null {
  const rx = b.x - a.x, ry = b.y - a.y;
  const sx = d.x - c.x, sy = d.y - c.y;
  const denom = rx * sy - ry * sx;
  const qx = c.x - a.x, qy = c.y - a.y;
  if (Math.abs(denom) < 1e-9) return null;
  const t = (qx * sy - qy * sx) / denom;
  const u = (qx * ry - qy * rx) / denom;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  return { x: a.x + t * rx, y: a.y + t * ry, t1: t, t2: u };
}

/** 分析得到的路口（analyzeJunctions 的中间/结果结构） */
export interface DetectedJunction { id: string; center: Pt; type: JunctionType; arms: JunctionArm[]; /** 环岛半径（仅 type==='roundabout' 时有值） */ radius?: number; }

const ANG = (p: Pt): number => Math.atan2(p.y, p.x);
const angDiff = (a: number, b: number): number => { let d = Math.abs(a - b) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d; return d; };

interface ArmStub { polyId: string; heading: number; lanes: number; direction: 'two-way' | 'one-way'; width: number; }

function armOf(pl: Polyline): Omit<ArmStub, 'heading'> {
  return { polyId: pl.id, lanes: inferLanes(pl.width, pl.lanes), direction: pl.direction ?? 'two-way', width: pl.width };
}

/** 把方向角合并去重（容差内取均值），并合并同 polyId+近方向的重复臂 */
function dedupArms(stubs: ArmStub[], tol = 0.21 /* ≈12° */): JunctionArm[] {
  const out: JunctionArm[] = [];
  for (const s of stubs) {
    let merged = false;
    for (const o of out) {
      if (o.polyId === s.polyId && angDiff(o.heading, s.heading) < tol) { merged = true; break; }
    }
    if (merged) continue;
    // 不同角度但同向(±180°)的也合并？否——路口臂方向本就两两相反，需保留为不同臂。
    out.push({ polyId: s.polyId, heading: s.heading, lanes: s.lanes, direction: s.direction, width: s.width });
  }
  return out;
}

/**
 * 检测闭合折线是否近似为一个圆（环岛）。
 * 判据：节点到均值圆心距离的标准差远小于半径（够圆），且折线周长接近 2πr（够闭合饱满）。
 * 满足则返回圆心与半径，否则 null（交由普通路口逻辑兜底）。
 */
function fitCircleIfRoundabout(pl: Polyline): { center: Pt; radius: number } | null {
  if (!pl.closed || pl.nodes.length < 6) return null;
  const pts = pl.nodes;
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= pts.length; cy /= pts.length;
  const center = { x: cx, y: cy };
  const dists = pts.map(p => Math.hypot(p.x - cx, p.y - cy));
  const r = dists.reduce((a, b) => a + b, 0) / dists.length;
  if (r < 20) return null; // 太小不构成环岛
  const variance = dists.reduce((a, d) => a + (d - r) * (d - r), 0) / dists.length;
  if (Math.sqrt(variance) > r * 0.22) return null; // 圆度不足
  let perimeter = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    perimeter += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const circ = 2 * Math.PI * r;
  if (Math.abs(perimeter - circ) > circ * 0.35) return null; // 周长偏差过大
  return { center, radius: r };
}

/** 由臂方向集合分类路口类型 */
function classifyArms(arms: JunctionArm[]): JunctionType {
  const n = arms.length;
  if (n < 2) return 'complex';
  const hs = arms.map(a => a.heading).sort((x, y) => x - y);
  const gaps: number[] = [];
  for (let i = 0; i < n; i++) gaps.push(angDiff(hs[i], hs[(i + 1) % n]));
  const near = (g: number, target: number, tol = 0.44 /* ≈25° */) => Math.abs(g - target) <= tol;
  if (n === 4) {
    if (gaps.every(g => near(g, Math.PI / 2))) return 'cross';
    return 'complex';
  }
  if (n === 3) {
    const acute = gaps.some(g => g < 1.22 /* ≈70°：Y 的两分叉夹角明显小于 T 支路夹角 */);
    if (acute) return 'Y';
    const hasStraight = gaps.some(g => near(g, Math.PI, 0.18 /* ≈10°：T 主路两臂须近对向 */));
    return hasStraight ? 'T' : 'T'; // 3 臂非 Y 即 T（含斜交丁字）
  }
  if (n === 2) {
    return angDiff(hs[0], hs[1]) < 0.7 ? 'ramp' : 'complex';
  }
  return 'complex';
}

/**
 * 分析所有道路折线，检测路口（几何交叉 + 共点/分支），并按臂数/夹角分类。
 * 只处理 kind==='road'。返回的路口不含标线（标线由 buildJunctionMarkings 生成）。
 */
export function analyzeJunctions(polylines: Polyline[]): DetectedJunction[] {
  const roads = polylines.filter(p => p.kind === 'road' && p.nodes.length >= 2);
  if (roads.length === 0) return [];

  // 先识别环岛（闭合近圆环）：从常规共点/交叉检测中排除，单独按 roundabout 处理，
  // 否则环上每个节点都会被误判为路口候选。
  const roundabouts: { pl: Polyline; center: Pt; radius: number }[] = [];
  const roundaboutIds = new Set<string>();
  for (const pl of roads) {
    const fit = fitCircleIfRoundabout(pl);
    if (fit) { roundabouts.push({ pl, center: fit.center, radius: fit.radius }); roundaboutIds.add(pl.id); }
  }
  const normalRoads = roads.filter(p => !roundaboutIds.has(p.id));

  // 候选中心 + 臂收集：centerKey 聚类
  type Cand = { cx: number; cy: number; w: number; stubs: ArmStub[] };
  const cands: Cand[] = [];
  const pushStubs = (cx: number, cy: number, w: number, stubs: ArmStub[]): Cand => {
    // 合并到最近候选（半径取两者路宽较大者）
    let best = -1, bestD = Infinity;
    for (let i = 0; i < cands.length; i++) {
      const d = Math.hypot(cands[i].cx - cx, cands[i].cy - cy);
      const r = Math.max(cands[i].w, w) * 0.4; // 仅合并"同一路口"的(A)+(B)重复检测，不合并相邻路口
      if (d < r && d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) {
      const c = cands[best];
      const tw = c.w + w; c.cx = (c.cx * c.w + cx * w) / tw; c.cy = (c.cy * c.w + cy * w) / tw; c.w = tw / 2;
      c.stubs.push(...stubs);
      return c;
    }
    const c: Cand = { cx, cy, w, stubs: [...stubs] };
    cands.push(c);
    return c;
  };

  // (A) 共点/分支：用原始节点，按空间聚类统计 emanating 方向
  const Q = 6; // 量化精度
  const nodeMap = new Map<string, { x: number; y: number; w: number; dirs: { pl: Polyline; a: number }[] }>();
  for (const pl of normalRoads) {
    const meta = armOf(pl);
    pl.nodes.forEach((nd, idx) => {
      const key = `${Math.round(nd.x / Q)}_${Math.round(nd.y / Q)}`;
      let cell = nodeMap.get(key);
      if (!cell) { cell = { x: 0, y: 0, w: 0, dirs: [] }; nodeMap.set(key, cell); }
      cell.x += nd.x; cell.y += nd.y; cell.w += 1;
      if (idx > 0) cell.dirs.push({ pl, a: ANG(sub(pl.nodes[idx - 1], nd)) });
      if (idx < pl.nodes.length - 1) cell.dirs.push({ pl, a: ANG(sub(pl.nodes[idx + 1], nd)) });
    });
  }
  nodeMap.forEach(cell => {
    if (cell.dirs.length < 3) return; // <3 方向不构成路口（普通折点/端点）
    const cx = cell.x / cell.w, cy = cell.y / cell.w;
    // 按方向聚类 arm stubs
    const stubs: ArmStub[] = [];
    const taken: boolean[] = cell.dirs.map(() => false);
    for (let i = 0; i < cell.dirs.length; i++) {
      if (taken[i]) continue;
      const d = cell.dirs[i];
      stubs.push({ ...armOf(d.pl), heading: d.a });
      for (let j = i + 1; j < cell.dirs.length; j++) {
        if (!taken[j] && cell.dirs[j].pl.id === d.pl.id && angDiff(cell.dirs[j].a, d.a) < 0.21) taken[j] = true;
      }
      taken[i] = true;
    }
    // 仅当涉及 ≥2 条折线，或单线但 ≥3 方向(不可能，单线 mid=2 方向) → 这里 dirs≥3 必然 ≥2 折线
    pushStubs(cx, cy, Math.max(...stubs.map(s => s.width)), stubs);
  });

  // (B) 几何交叉：采样段两两相交
  const sampled = normalRoads.map(pl => ({ pl, pts: serializeSampled(pl, 8) }));
  for (let i = 0; i < sampled.length; i++) {
    for (let j = i + 1; j < sampled.length; j++) {
      const A = sampled[i], B = sampled[j];
      for (let a = 0; a < A.pts.length - 1; a++) {
        for (let b = 0; b < B.pts.length - 1; b++) {
          const hit = segmentIntersectPt(A.pts[a], A.pts[a + 1], B.pts[b], B.pts[b + 1]);
          if (!hit) continue;
          const Qc = { x: hit.x, y: hit.y };
          const mA = armOf(A.pl), mB = armOf(B.pl);
          const raw: { s: ArmStub; src: Pt }[] = [
            { s: { ...mA, heading: ANG(sub(A.pts[a], Qc)) }, src: A.pts[a] },
            { s: { ...mA, heading: ANG(sub(A.pts[a + 1], Qc)) }, src: A.pts[a + 1] },
            { s: { ...mB, heading: ANG(sub(B.pts[b], Qc)) }, src: B.pts[b] },
            { s: { ...mB, heading: ANG(sub(B.pts[b + 1], Qc)) }, src: B.pts[b + 1] },
          ];
          // 交点恰在某段端点时该侧为零长臂，方向无意义 → 丢弃
          const stubs = raw.filter(r => Math.hypot(Qc.x - r.src.x, Qc.y - r.src.y) > 1e-3).map(r => r.s);
          if (stubs.length < 2) continue;
          pushStubs(hit.x, hit.y, Math.max(mA.width, mB.width), stubs);
        }
      }
    }
  }

  // (C) 环岛：闭合近圆环 → roundabout 路口；臂 = 接入道路在环周连接处的向外方向
  const roundaboutJunctions: DetectedJunction[] = [];
  for (const rb of roundabouts) {
    const { center, radius, pl } = rb;
    const stubs: ArmStub[] = [];
    for (const other of normalRoads) {
      const endpoints = [other.nodes[0], other.nodes[other.nodes.length - 1]];
      for (const ep of endpoints) {
        const d = Math.hypot(ep.x - center.x, ep.y - center.y);
        // 端点落在环道周长附近 → 视为接入
        if (Math.abs(d - radius) < Math.max(pl.width, other.width) * 0.9 + 14) {
          stubs.push({ ...armOf(other), heading: ANG({ x: ep.x - center.x, y: ep.y - center.y }) });
        }
      }
    }
    const arms = dedupArms(stubs);
    roundaboutJunctions.push({
      id: `j-rb-${Math.random().toString(36).slice(2, 6)}`,
      center: { x: center.x, y: center.y },
      type: 'roundabout',
      arms,
      radius,
    });
  }

  // 生成路口：去重臂 + 过滤臂数 + 分类
  const out: DetectedJunction[] = [];
  cands.forEach((c, idx) => {
    // 落在某环岛范围内的候选交由环岛处理，避免重复
    if (roundabouts.some(rb => Math.hypot(rb.center.x - c.cx, rb.center.y - c.cy) < rb.radius * 1.15)) return;
    const arms = dedupArms(c.stubs);
    if (arms.length < 2) return;
    // 涉及折线种类：共点要求 ≥2 折线；几何交叉天然 ≥2
    const polySet = new Set(arms.map(a => a.polyId));
    if (polySet.size < 2 && arms.length < 3) return;
    const type = classifyArms(arms);
    out.push({ id: `j-${idx}-${Math.random().toString(36).slice(2, 6)}`, center: { x: c.cx, y: c.cy }, type, arms });
  });
  out.push(...roundaboutJunctions);
  return out;
}

/**
 * 路口自适应轮廓（局部坐标，中心=原点）。按实际进口宽度排列道路边缘，
 * 在相邻道路边缘间补转弯圆角，保留十字、丁字、斜交与直角弯的进口完整宽度。
 */
export function buildJunctionPolygon(arms: JunctionArm[]): Pt[] | null {
  // Offset the actual approach edges and fillet the corner BETWEEN them.
  // Intersecting every road's half-planes produced only the central square;
  // rounding that square inward cut away the turning apron.
  const sorted=arms.filter(a=>a.width>0).map(a=>({...a,heading:(a.heading%(Math.PI*2)+Math.PI*2)%(Math.PI*2)})).sort((a,b)=>a.heading-b.heading);
  const n=sorted.length;if(n<2)return null;
  const dirs=sorted.map(a=>({x:Math.cos(a.heading),y:Math.sin(a.heading)}));
  const reach=sorted.map(a=>a.width*.8);
  const corners:(Pt[]|null)[]=sorted.map((a,i)=>{
    const j=(i+1)%n,b=sorted[j],da=dirs[i],db=dirs[j];
    const gap=(b.heading-a.heading+Math.PI*2)%(Math.PI*2);
    if(gap<.12||gap>=Math.PI-.06)return null;
    const pa={x:-da.y*a.width/2,y:da.x*a.width/2},pb={x:db.y*b.width/2,y:-db.x*b.width/2};
    const cross=da.x*db.y-da.y*db.x,dx=pb.x-pa.x,dy=pb.y-pa.y;
    const ta=(dx*db.y-dy*db.x)/cross,tb=(dx*da.y-dy*da.x)/cross;
    const radius=Math.min(35,Math.min(a.width,b.width)*.35),c={x:pa.x+da.x*ta,y:pa.y+da.y*ta};
    reach[i]=Math.max(reach[i],ta+radius+4);reach[j]=Math.max(reach[j],tb+radius+4);
    const start={x:c.x+da.x*radius,y:c.y+da.y*radius},end={x:c.x+db.x*radius,y:c.y+db.y*radius};
    return Array.from({length:13},(_,k)=>{const t=k/12,u=1-t;return{x:u*u*start.x+2*u*t*c.x+t*t*end.x,y:u*u*start.y+2*u*t*c.y+t*t*end.y};});
  });
  const outline:Pt[]=[];
  sorted.forEach((a,i)=>{const d=dirs[i],r=reach[i],w=a.width/2;
    outline.push({x:d.x*r+d.y*w,y:d.y*r-d.x*w},{x:d.x*r-d.y*w,y:d.y*r+d.x*w});
    if(corners[i])outline.push(...corners[i]!);
  });
  return outline;
}

/**
 * 把凸多边形各角倒圆（二次贝塞尔采样），返回平滑轮廓点序列（局部坐标）。
 * 2D/3D 共用同一序列，保证编辑器与游戏路口形状完全一致。
 * radius 为期望圆角半径，按每个角相邻边长自动夹紧，避免越界。
 */
export function roundedPolygonPoints(corners: Pt[], radius: number, segsPerCorner = 6): Pt[] {
  const n = corners.length;
  if (n < 3) return corners.slice();
  const r = Math.max(0, radius);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = corners[(i - 1 + n) % n], c = corners[i], next = corners[(i + 1) % n];
    const dPrev = Math.hypot(prev.x - c.x, prev.y - c.y);
    const dNext = Math.hypot(next.x - c.x, next.y - c.y);
    const rr = Math.min(r, dPrev * 0.45, dNext * 0.45);
    const a = rr > 1e-3
      ? { x: c.x + (prev.x - c.x) / dPrev * rr, y: c.y + (prev.y - c.y) / dPrev * rr }
      : c;
    const b = rr > 1e-3
      ? { x: c.x + (next.x - c.x) / dNext * rr, y: c.y + (next.y - c.y) / dNext * rr }
      : c;
    if (rr <= 1e-3) { out.push(c); continue; }
    out.push(a);
    for (let s = 1; s <= segsPerCorner; s++) {
      const t = s / (segsPerCorner + 1);
      const mt = 1 - t;
      // 二次贝塞尔 a -> c(控制点) -> b
      out.push({
        x: mt * mt * a.x + 2 * mt * t * c.x + t * t * b.x,
        y: mt * mt * a.y + 2 * mt * t * c.y + t * t * b.y,
      });
    }
    out.push(b);
  }
  return out;
}

