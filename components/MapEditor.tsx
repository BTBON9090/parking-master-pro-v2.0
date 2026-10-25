import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  MousePointer2, LandPlot, Square, Package, Trash2, Magnet,
  ArrowLeft, Save, FolderOpen, Download, Upload, Eraser,
  Plus, Undo2, Redo2, Waypoints, Play, Wand2,
} from 'lucide-react';
import { LevelData, Obstacle, ParkingSpot, Marking, Intersection } from '../types';
import { MODEL_LIBRARY, ModelLibraryItem } from '../three/modelLoader';
import {
  Polyline, PolyNode, Pt, RoadDirection,
  buildRibbon, serializeSampled, serializeSampledW, sanitizeNodes, polylineToCenterSegments, splitIntoRuns,
  serializeToLevelData, deserializeFromLevelData, nodeRadius, nodeWidth, inferLanes, analyzeJunctions,
  buildJunctionPolygon, roundedPolygonPoints,
} from '../utils/polyline';
import { buildJunctionMarkings } from '../utils/junctionMarkings';

// ===================== Types =====================
type Tool = 'select' | 'road' | 'wall' | 'place' | 'delete' | 'intersection';
type ElementType = 'polyline' | 'obstacle' | 'spot' | 'marking' | 'intersection';

interface Camera { x: number; y: number; zoom: number; }

interface DragState {
  mode: 'none' | 'pan' | 'move-poly' | 'move-node' | 'insert-node' | 'move-el' | 'select-box';
  startWorld: Pt;
  startScreen: Pt;
  polyId?: string;
  nodeIndex?: number;
  origNodes?: Pt[];
  origElements?: Map<string, { x: number; y: number; width: number; height: number; rotation: number }>;
  boxEnd?: Pt;
}

interface DrawState {
  kind: 'road' | 'wall';
  targetId: string | null;
  nodes: PolyNode[];
  cursor: Pt | null;
  width: number;
  absorbedIds: string[]; // 被并入的其它折线（提交时删除）
  suffix?: PolyNode[];   // 分支绘制时，分支点之后需接回的原折线尾部
  closed?: boolean;      // 首尾相接成环
  // 从已有道路起笔（支线）时，继承宿主的视觉参数作为新折线初值，之后可在面板单独改
  inheritWidth?: number;
  inheritLanes?: number;
  inheritDirection?: RoadDirection;
  inheritRadius?: number;
}

interface EditorState {
  polylines: Polyline[];
  obstacles: Obstacle[];
  spots: ParkingSpot[];
  markings: Marking[];
  intersections: Intersection[];
  mapWidth: number;
  mapHeight: number;
  selectedIds: Set<string>;
  tool: Tool;
  placeItem: ModelLibraryItem | null;
  clipboard: { type: ElementType; data: any }[];
  snapEnabled: boolean;
  roadWidth: number;
  wallWidth: number;
  cornerRadius: number;          // 默认倒圆角半径(0=直角)
  defaultLanes: number;          // 默认车道数
  defaultDirection: RoadDirection;
  markingType: Marking['type'];  // 当前放置的标线类型
  selNode: { id: string; idx: number } | null; // 选中的节点(用于属性面板调半径/路宽)
  selNodes: Set<string>; // 多选节点，键 `${polyId}:${idx}`（Shift/框选批量调路宽/圆角）
}

// ===================== Constants =====================
const HANDLE_R = 6;
const NODE_R = 6;
const MID_R = 5;
const MIN_ZOOM = 0.06;
const MAX_ZOOM = 6;
const GRID_SIZE = 100;
const SNAP_GRID = 20;
const SNAP_THRESHOLD = 30;

const ROAD_COLOR = '#3a3a3e';
const WALL_COLOR = '#5b6472';
const SEL_COLOR = '#22d3ee';
const ACCENT = '#f59e0b';

const TOOL_META: Record<Tool, { label: string; key: string }> = {
  select: { label: '选择', key: 'V' },
  road: { label: '道路', key: 'R' },
  wall: { label: '墙壁', key: 'W' },
  intersection: { label: '路口/桥', key: 'J' },
  place: { label: '放置', key: 'P' },
  delete: { label: '删除', key: 'D' },
};

// ===================== Helpers =====================
const makeId = (p: string) => `${p}-${Math.random().toString(36).slice(2, 10)}`;

function worldToScreen(wx: number, wy: number, cam: Camera, cw: number, ch: number): Pt {
  return { x: (wx - cam.x) * cam.zoom + cw / 2, y: (wy - cam.y) * cam.zoom + ch / 2 };
}
function screenToWorld(sx: number, sy: number, cam: Camera, cw: number, ch: number): Pt {
  return { x: (sx - cw / 2) / cam.zoom + cam.x, y: (sy - ch / 2) / cam.zoom + cam.y };
}
const snapVal = (v: number) => Math.round(v / SNAP_GRID) * SNAP_GRID;

/** 限制在地图(网格)范围内：不允许在网格外铺设 */
const clampToBounds = (x: number, y: number, s: { mapWidth: number; mapHeight: number }): Pt => ({
  x: Math.max(0, Math.min(s.mapWidth, x)),
  y: Math.max(0, Math.min(s.mapHeight, y)),
});

/** Shift 轴约束：将点 p 约束到相对锚点 anchor 的水平或垂直方向 */
const axisConstrain = (anchor: Pt, p: Pt): Pt =>
  Math.abs(p.x - anchor.x) >= Math.abs(p.y - anchor.y) ? { x: p.x, y: anchor.y } : { x: anchor.x, y: p.y };

function hitRect(px: number, py: number, cx: number, cy: number, w: number, h: number, rot: number): boolean {
  const cos = Math.cos(-rot), sin = Math.sin(-rot);
  const dx = px - cx, dy = py - cy;
  return Math.abs(dx * cos - dy * sin) <= w / 2 && Math.abs(dx * sin + dy * cos) <= h / 2;
}
function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const abx = b.x - a.x, aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

/** 判断点是否在折线带状区域内 */
function hitPolyline(p: Pt, pl: Polyline, tol: number): boolean {
  const center = serializeSampled(pl, 14);
  const half = pl.width / 2 + tol;
  for (let i = 0; i < center.length - 1; i++) {
    if (distToSeg(p, center[i], center[i + 1]) <= half) return true;
  }
  return false;
}

/** 找最近的折线端点（用于续接）。threshold 为吸附半径(世界单位) */
function nearestEndpoint(p: Pt, polylines: Polyline[], kind: 'road' | 'wall', threshold: number, excludeId?: string): { pl: Polyline; end: 'start' | 'end'; dist: number } | null {
  let best: { pl: Polyline; end: 'start' | 'end'; dist: number } | null = null;
  polylines.forEach(pl => {
    if (pl.kind !== kind || pl.closed || pl.nodes.length < 2) return;
    if (excludeId && pl.id === excludeId) return;
    const s = pl.nodes[0], e = pl.nodes[pl.nodes.length - 1];
    const ds = Math.hypot(p.x - s.x, p.y - s.y);
    const de = Math.hypot(p.x - e.x, p.y - e.y);
    if (ds < threshold && (!best || ds < best.dist)) best = { pl, end: 'start', dist: ds };
    if (de < threshold && (!best || de < best.dist)) best = { pl, end: 'end', dist: de };
  });
  return best;
}

/** 命中折线的某一段（用于逐段删除）。返回命中段的前一个节点下标，未命中返回 -1 */
function hitPolylineSegment(p: Pt, pl: Polyline, tol: number): number {
  const segs = polylineToCenterSegments(pl, 14);
  const half = pl.width / 2 + tol;
  // 记录每段对应的起始节点下标
  const runs = splitIntoRuns(pl.nodes, !!pl.closed);
  let nodeCursor = 0;
  for (let r = 0; r < segs.length; r++) {
    const seg = segs[r];
    for (let i = 0; i < seg.length - 1; i++) {
      if (distToSeg(p, seg[i], seg[i + 1]) <= half) {
        // 返回该 run 的起始节点下标
        return nodeCursor;
      }
    }
    // 推进节点游标到该 run 的末尾节点（run 间共享端点）
    nodeCursor += runs[r].pts.length - 1;
  }
  return -1;
}

/** 找最近的节点（任意节点，含中间节点），用于分支衔接 */
function nearestNode(p: Pt, polylines: Polyline[], kind: 'road' | 'wall', threshold: number, excludeId?: string): { pl: Polyline; idx: number; dist: number } | null {
  let best: { pl: Polyline; idx: number; dist: number } | null = null;
  polylines.forEach(pl => {
    if (pl.kind !== kind || pl.closed || pl.nodes.length < 1) return;
    if (excludeId && pl.id === excludeId) return;
    pl.nodes.forEach((nd, idx) => {
      const d = Math.hypot(p.x - nd.x, p.y - nd.y);
      if (d < threshold && (!best || d < best.dist)) best = { pl, idx, dist: d };
    });
  });
  return best;
}

/** 找最近的线段（用于从路段中间分支）。返回插入位置 idx 与命中点 */
function nearestSegmentPoint(p: Pt, polylines: Polyline[], kind: 'road' | 'wall', threshold: number, excludeId?: string): { pl: Polyline; idx: number; pt: Pt; dist: number } | null {
  let best: { pl: Polyline; idx: number; pt: Pt; dist: number } | null = null;
  polylines.forEach(pl => {
    if (pl.kind !== kind || pl.closed || pl.nodes.length < 2) return;
    if (excludeId && pl.id === excludeId) return;
    for (let i = 0; i < pl.nodes.length - 1; i++) {
      const a = pl.nodes[i], b = pl.nodes[i + 1];
      const abx = b.x - a.x, aby = b.y - a.y;
      const l2 = abx * abx + aby * aby;
      if (l2 === 0) continue;
      let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2;
      if (t <= 0.02 || t >= 0.98) continue; // 太靠近端点交给节点吸附
      t = Math.max(0, Math.min(1, t));
      const qx = a.x + t * abx, qy = a.y + t * aby;
      const d = Math.hypot(p.x - qx, p.y - qy);
      if (d < threshold && (!best || d < best.dist)) best = { pl, idx: i + 1, pt: { x: qx, y: qy }, dist: d };
    }
  });
  return best;
}

/** 判断折线的所有节点是否都位于给定端点集合内（分支并入时判断是否只剩尾巴） */
function allNodesInSet(pl: Polyline, endpoints: Set<string>): boolean {
  return pl.nodes.every(nd => endpoints.has(`${nd.x},${nd.y}`));
}

function getDefaultState(): EditorState {
  const W = 2000, H = 2000;
  return {
    polylines: [],
    obstacles: [],
    spots: [],
    markings: [],
    intersections: [],
    mapWidth: W,
    mapHeight: H,
    selectedIds: new Set(),
    tool: 'select',
    placeItem: null,
    clipboard: [],
    snapEnabled: true,
    roadWidth: 120,
    wallWidth: 20,
    cornerRadius: 24,
    defaultLanes: 2,
    defaultDirection: 'two-way',
    markingType: 'line-solid',
    selNode: null,
    selNodes: new Set(),
  };
}

let _anonMk = 0;
/** 保证每条标线都有 id（兼容旧存档 / 外部导入中缺失 id 的自动标线），避免按 id 的逻辑崩溃。 */
function withMarkingIds(ms: Marking[] | undefined): Marking[] {
  if (!ms) return [];
  return ms.map(m => (m && m.id ? m : { ...m, id: `mk-anon-${(_anonMk++).toString(36)}` }));
}

/** 扁平化所有可选元素（用于列表/计数） */
function listElements(st: EditorState): { id: string; type: ElementType; label: string; color: string; kind?: string }[] {
  const out: any[] = [];
  st.polylines.forEach(pl => out.push({ id: pl.id, type: 'polyline', label: pl.kind === 'road' ? '道路' : '墙壁', color: pl.color, kind: pl.kind }));
  st.obstacles.forEach(o => out.push({ id: o.id, type: 'obstacle', label: o.type === 'car' ? '车辆' : o.modelKey ? '建筑' : '障碍', color: o.color, kind: o.type }));
  st.spots.forEach(s => out.push({ id: s.id, type: 'spot', label: '车位', color: '#f59e0b' }));
  st.markings.forEach(m => out.push({ id: m.id, type: 'marking', label: '标线', color: m.color }));
  (st.intersections || []).forEach(it => out.push({ id: it.id!, type: 'intersection', label: it.bridge ? '桥面' : '路口', color: '#22d3ee' }));
  return out;
}

// ===================== Canvas Rendering =====================
/** 2D 车道线/中心线/方向箭头预览（与 3D 渲染布局一致） */
function drawLaneLines2D(ctx: CanvasRenderingContext2D, pts: Pt[], widths: number[], pl: Polyline, cam: Camera) {
  const n = pts.length;
  if (n < 2) return;
  const normals: Pt[] = [];
  let prev: Pt | null = null;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let t = { x: b.x - a.x, y: b.y - a.y }; const l = Math.hypot(t.x, t.y) || 1; t = { x: t.x / l, y: t.y / l };
    let nm = { x: -t.y, y: t.x };
    if (prev && prev.x * nm.x + prev.y * nm.y < 0) nm = { x: -nm.x, y: -nm.y };
    prev = nm; normals.push(nm);
  }
  const halfW = (i: number) => (widths[i] ?? pl.width) / 2;
  const stroke = (off: (i: number) => number, dashed: boolean, color: string, wpx: number) => {
    ctx.strokeStyle = color; ctx.lineWidth = wpx / cam.zoom;
    ctx.setLineDash(dashed ? [18 / cam.zoom, 16 / cam.zoom] : []);
    ctx.beginPath();
    pts.forEach((p, i) => { const q = { x: p.x + normals[i].x * off(i), y: p.y + normals[i].y * off(i) }; i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y); });
    ctx.stroke(); ctx.setLineDash([]);
  };
  const L = inferLanes(pl.width, pl.lanes);
  const dir = pl.direction || 'two-way';
  const bounds: number[] = []; for (let k = 1; k < L; k++) bounds.push(-1 + (2 * k) / L);
  if (dir === 'two-way') {
    if (L % 2 === 0) { stroke(() => 2.5, false, 'rgba(245,200,66,0.85)', 2); stroke(() => -2.5, false, 'rgba(245,200,66,0.85)', 2); }
    else stroke(() => 0, false, 'rgba(245,200,66,0.85)', 2);
    bounds.forEach(f => { if (Math.abs(f) > 1e-6) stroke(i => f * halfW(i), true, 'rgba(255,255,255,0.7)', 2); });
  } else {
    bounds.forEach(f => stroke(i => f * halfW(i), true, 'rgba(255,255,255,0.7)', 2));
  }
  // 方向箭头
  const GAP = 220; const aw = 6;
  for (let k = 1; k <= L; k++) {
    const cfrac = -1 + (2 * k - 1) / L;
    const forward = dir === 'one-way' ? true : cfrac >= 0;
    let acc = 0;
    for (let i = 1; i < n; i++) {
      acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (acc >= GAP) {
        acc = 0;
        const p = { x: pts[i].x + normals[i].x * cfrac * halfW(i), y: pts[i].y + normals[i].y * cfrac * halfW(i) };
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        if (!forward) { tx = -tx; ty = -ty; }
        const ux = -ty, uy = tx;
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath();
        ctx.moveTo(p.x + tx * aw, p.y + ty * aw);
        ctx.lineTo(p.x - tx * aw + ux * aw * 0.7, p.y - ty * aw + uy * aw * 0.7);
        ctx.lineTo(p.x - tx * aw - ux * aw * 0.7, p.y - ty * aw - uy * aw * 0.7);
        ctx.closePath(); ctx.fill();
      }
    }
  }
}

function drawPolylineShape(ctx: CanvasRenderingContext2D, pl: Polyline, cam: Camera) {
  // 逐点路宽(渐变) + 倒圆角/直角中心线
  const { pts: center, widths } = serializeSampledW(pl, 16);
  const { left, right } = buildRibbon(center, widths);

  if (pl.kind === 'road') {
    ctx.beginPath();
    left.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    ctx.fillStyle = pl.color || ROAD_COLOR;
    ctx.fill();
    // 边缘线
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5 / cam.zoom;
    ctx.beginPath();
    left.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.beginPath();
    right.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    // 车道线 / 中心线 / 方向箭头
    drawLaneLines2D(ctx, center, widths, pl, cam);
  } else {
    // 墙壁：沿中心线的粗描边 + 填充带
    ctx.beginPath();
    left.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    ctx.fillStyle = pl.color || WALL_COLOR;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.5 / cam.zoom;
    ctx.stroke();
  }
}

/** 2D 箭头标线字形(本地坐标，朝上=-Y 为前进方向) */
function arrowGlyph2D(ctx: CanvasRenderingContext2D, type: Marking['type'], w: number, h: number, col: string) {
  const sw = w * 0.16;                 // 杆半宽
  const armTop = -h * 0.12;            // 横臂顶
  const armBot = armTop + sw * 2;      // 横臂底(臂厚=2sw)
  const mid = (armTop + armBot) / 2;
  const hl = w * 0.3, hw = sw * 1.6;   // 箭头长/半宽
  const poly = (pts: number[][]) => { ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])); ctx.closePath(); ctx.fill(); };
  ctx.fillStyle = col;
  const leftish = type === 'arrow-left' || type === 'arrow-merge-left' || type === 'arrow-uturn';
  const sgn = leftish ? -1 : 1;
  // L 形弯箭头：直行杆 + 向 sgn 弯出的横臂 + 指向 sgn 的箭头
  poly([
    [-sw, h / 2], [sw, h / 2], [sw, armTop],
    [sgn * (w / 2 - hl), armTop], [sgn * (w / 2 - hl), armTop - hw],
    [sgn * w / 2, mid],
    [sgn * (w / 2 - hl), armBot + hw], [sgn * (w / 2 - hl), armBot],
    [-sw, armBot],
  ]);
  if (type === 'arrow-merge-left' || type === 'arrow-merge-right') {
    // 反方向并入的斜尾
    ctx.save();
    ctx.rotate(sgn * 0.6);
    ctx.translate(-sgn * w * 0.16, h * 0.16);
    poly([[-sw * 0.8, h * 0.18], [sw * 0.8, h * 0.18], [sw * 0.8, -h * 0.22], [0, -h * 0.22 - sw], [-sw * 0.8, -h * 0.22]]);
    ctx.restore();
  }
}

/** 2D 标线预览(按类型)，与 3D 渲染一致 */
function drawMarking2D(ctx: CanvasRenderingContext2D, m: Marking, cam: Camera) {
  ctx.save();
  ctx.translate(m.x, m.y); ctx.rotate(m.rotation);
  const w = m.width, h = m.height, col = m.color || '#fff';
  ctx.fillStyle = col; ctx.strokeStyle = col;
  const along = w >= h;
  switch (m.type) {
    case 'line-dashed': {
      const len = Math.max(w, h), thick = Math.min(w, h) || 3, seg = 20, gap = 16;
      const cnt = Math.max(1, Math.floor(len / (seg + gap)));
      for (let i = 0; i < cnt; i++) { const o = -len / 2 + i * (seg + gap) + seg / 2; if (along) ctx.fillRect(o - seg / 2, -thick / 2, seg, thick); else ctx.fillRect(-thick / 2, o - seg / 2, thick, seg); }
      break;
    }
    case 'line-double': {
      const len = Math.max(w, h), off = 3;
      if (along) { ctx.fillRect(-len / 2, -off - 0.75, len, 1.5); ctx.fillRect(-len / 2, off - 0.75, len, 1.5); }
      else { ctx.fillRect(-off - 0.75, -len / 2, 1.5, len); ctx.fillRect(off - 0.75, -len / 2, 1.5, len); }
      break;
    }
    case 'crosswalk': {
      const sw = 5, gap = 4, span = along ? h : w, cnt = Math.max(1, Math.floor(span / (sw + gap)));
      for (let i = 0; i < cnt; i++) { const o = -span / 2 + i * (sw + gap); if (along) ctx.fillRect(-w / 2, o, w, sw); else ctx.fillRect(o, -h / 2, sw, h); }
      break;
    }
    case 'roundabout': {
      ctx.lineWidth = Math.max(2, h * 0.18); ctx.beginPath(); ctx.arc(0, 0, Math.max(4, Math.min(w, h) / 2 - ctx.lineWidth), 0, Math.PI * 2); ctx.stroke(); break;
    }
    case 'arrow-straight': case 'arrow-left': case 'arrow-right': case 'arrow-merge-left': case 'arrow-merge-right': case 'arrow-uturn':
      arrowGlyph2D(ctx, m.type, w, h, col); break;
    case 'yield': {
      // 倒三角(顶点朝 -Y，与 3D 朝向约定一致)
      ctx.beginPath(); ctx.moveTo(-w / 2, h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(0, -h / 2); ctx.closePath();
      ctx.lineWidth = Math.max(1.5, h * 0.18); ctx.stroke();
      break;
    }
    case 'channelize': {
      // 导流线：三角边框 + clip 内 45° 斜纹
      ctx.save();
      ctx.beginPath(); ctx.moveTo(0, -h / 2); ctx.lineTo(-w / 2, h / 2); ctx.lineTo(w / 2, h / 2); ctx.closePath();
      ctx.lineWidth = Math.max(1.2, h * 0.06); ctx.stroke();
      ctx.clip();
      ctx.lineWidth = Math.max(0.8, h * 0.04);
      for (let c = -h; c <= h + w; c += 7) { ctx.beginPath(); ctx.moveTo(-w, c - w); ctx.lineTo(w, c + w); ctx.stroke(); }
      ctx.restore();
      break;
    }
    default: ctx.fillRect(-w / 2, -h / 2, w, h);
  }
  ctx.restore();
}

/** 在已 translate 到中心的上下文里描出局部多边形路径（不填充） */
function traceLocalPoly(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

/** 路口自适应多边形圆角半径：取最窄臂宽的一定比例并封顶 */
function junctionCornerR(arms: { width: number }[] | undefined): number {
  if (!arms || arms.length === 0) return 0;
  const minW = Math.min(...arms.map(a => a.width));
  return Math.min(20, minW * 0.42);
}

function renderScene(
  ctx: CanvasRenderingContext2D, cw: number, ch: number, cam: Camera,
  st: EditorState, draw: DrawState | null, drag: DragState, hoverNode: { id: string; idx: number } | null,
  snapEndpoint: Pt | null,
) {
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = '#16181d';
  ctx.fillRect(0, 0, cw, ch);

  ctx.save();
  ctx.translate(cw / 2, ch / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  // 地图边界
  ctx.fillStyle = '#1e2127';
  ctx.fillRect(0, 0, st.mapWidth, st.mapHeight);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2 / cam.zoom;
  ctx.strokeRect(0, 0, st.mapWidth, st.mapHeight);

  // 主网格
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1 / cam.zoom;
  for (let x = 0; x <= st.mapWidth; x += GRID_SIZE) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, st.mapHeight); ctx.stroke(); }
  for (let y = 0; y <= st.mapHeight; y += GRID_SIZE) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(st.mapWidth, y); ctx.stroke(); }
  // 细网格
  if (st.snapEnabled && cam.zoom >= 0.3) {
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    for (let x = 0; x <= st.mapWidth; x += SNAP_GRID) { if (x % GRID_SIZE === 0) continue; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, st.mapHeight); ctx.stroke(); }
    for (let y = 0; y <= st.mapHeight; y += SNAP_GRID) { if (y % GRID_SIZE === 0) continue; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(st.mapWidth, y); ctx.stroke(); }
  }

  // 车位
  st.spots.forEach(s => {
    ctx.save();
    ctx.translate(s.x, s.y); ctx.rotate(s.rotation);
    ctx.strokeStyle = st.selectedIds.has(s.id) ? SEL_COLOR : '#f59e0b';
    ctx.lineWidth = (st.selectedIds.has(s.id) ? 3 : 2) / cam.zoom;
    ctx.setLineDash([6 / cam.zoom, 4 / cam.zoom]);
    ctx.strokeRect(-s.width / 2, -s.height / 2, s.width, s.height);
    ctx.setLineDash([]);
    ctx.restore();
  });

  // 折线（道路/墙壁）
  st.polylines.forEach(pl => drawPolylineShape(ctx, pl, cam));

  // 路口/桥面（画在道路之上，作为连接件/上跨）
  (st.intersections || []).forEach(it => {
    const s = it.size;
    // 自适应路口多边形：以道路边线交点为角点、四角倒圆，随交叉角度变化（≥3 臂且几何有效时启用）
    const poly = (it.arms && it.arms.length >= 3) ? buildJunctionPolygon(it.arms) : null;
    const rpoly = poly ? roundedPolygonPoints(poly, junctionCornerR(it.arms)) : null;
    ctx.save();
    ctx.translate(it.x, it.y);
    if (rpoly) {
      if (it.bridge) {
        traceLocalPoly(ctx, rpoly);
        ctx.fillStyle = '#2a2a2e'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2 / cam.zoom; ctx.stroke();
        ctx.fillStyle = 'rgba(34,211,238,0.9)'; ctx.font = `${12 / cam.zoom}px Rajdhani, sans-serif`; ctx.textAlign = 'center';
        ctx.fillText('桥', 0, 4 / cam.zoom);
      } else if (it.junctionType === 'roundabout') {
        const ir = Math.max(10, s * 0.28);
        ctx.beginPath(); ctx.arc(0, 0, ir, 0, Math.PI * 2);
        ctx.fillStyle = '#3f6212'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5 / cam.zoom; ctx.stroke();
      } else {
        traceLocalPoly(ctx, rpoly);
        ctx.fillStyle = '#303034'; ctx.fill();
      }
    } else {
      // 回退：手动连接件 / 两臂 / 退化几何 → 旧旋转方块
      ctx.rotate(it.rotation || 0);
      if (it.bridge) {
        ctx.fillStyle = '#2a2a2e';
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2 / cam.zoom;
        ctx.strokeRect(-s / 2, -s / 2, s, s);
        // 桥侧阴影
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(-s / 2, s / 2, s, 8 / cam.zoom + 4);
        ctx.fillStyle = 'rgba(34,211,238,0.9)'; ctx.font = `${12 / cam.zoom}px Rajdhani, sans-serif`; ctx.textAlign = 'center';
        ctx.fillText('桥', 0, 4 / cam.zoom);
      } else if (it.junctionType === 'roundabout') {
        // 环岛中央岛：环道路面由闭合折线绘制，这里只画中央圆形岛
        const ir = Math.max(10, s * 0.28);
        ctx.beginPath();
        ctx.arc(0, 0, ir, 0, Math.PI * 2);
        ctx.fillStyle = '#3f6212';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5 / cam.zoom;
        ctx.stroke();
      } else {
        ctx.fillStyle = '#303034';
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1 / cam.zoom;
        ctx.strokeRect(-s / 2, -s / 2, s, s);
      }
    }
    ctx.restore();
    if (st.selectedIds.has(it.id!)) {
      ctx.save(); ctx.translate(it.x, it.y);
      ctx.strokeStyle = SEL_COLOR; ctx.lineWidth = 2 / cam.zoom; ctx.setLineDash([6 / cam.zoom, 4 / cam.zoom]);
      if (rpoly) { traceLocalPoly(ctx, rpoly); ctx.stroke(); }
      else { ctx.rotate(it.rotation || 0); ctx.strokeRect(-s / 2 - 4, -s / 2 - 4, s + 8, s + 8); }
      ctx.setLineDash([]);
      ctx.restore();
    }
  });

  // 标线（画在道路/路口之上，避免被路面遮挡；同组内按 layer 升序，layer 大者覆盖在上）
  [...st.markings].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0)).forEach(m => {
    drawMarking2D(ctx, m, cam);
    if (st.selectedIds.has(m.id!)) {
      ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.rotation);
      ctx.strokeStyle = SEL_COLOR; ctx.lineWidth = 2 / cam.zoom;
      ctx.strokeRect(-m.width / 2 - 3, -m.height / 2 - 3, m.width + 6, m.height + 6);
      ctx.restore();
    }
  });

  // 点状障碍物（车辆/建筑/障碍）；同组内按 layer 升序绘制
  [...st.obstacles].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0)).forEach(o => {
    ctx.save();
    ctx.translate(o.x, o.y); ctx.rotate(o.rotation);
    ctx.fillStyle = o.color || '#4b5563';
    ctx.fillRect(-o.width / 2, -o.height / 2, o.width, o.height);
    if (o.type === 'car') {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      const s = Math.min(o.width, o.height) * 0.3;
      ctx.beginPath();
      ctx.moveTo(0, -o.height / 2 + 2);
      ctx.lineTo(-s / 2, -o.height / 2 + s + 2);
      ctx.lineTo(s / 2, -o.height / 2 + s + 2);
      ctx.closePath(); ctx.fill();
    } else if (o.modelKey) {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1.5 / cam.zoom;
      ctx.strokeRect(-o.width / 2 + 6, -o.height / 2 + 6, o.width - 12, o.height - 12);
    }
    ctx.restore();
    ctx.strokeStyle = st.selectedIds.has(o.id) ? SEL_COLOR : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = (st.selectedIds.has(o.id) ? 2.5 : 1) / cam.zoom;
    ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.rotation);
    ctx.strokeRect(-o.width / 2, -o.height / 2, o.width, o.height);
    ctx.restore();
  });

  // 选中折线高亮 + 节点手柄
  st.polylines.forEach(pl => {
    // 选中折线，或含有多选节点的折线，都要画手柄（支持跨折线 Shift/框选节点）
    const hasSelNode = st.selNodes.size > 0 && [...st.selNodes].some(k => k.startsWith(pl.id + ':'));
    if (!st.selectedIds.has(pl.id) && !hasSelNode) return;
    // 边缘青色描边（沿左右边缘，不改变道路形状）
    const center = serializeSampled(pl, 16);
    const { left, right } = buildRibbon(center, pl.width + 6);
    ctx.strokeStyle = SEL_COLOR;
    ctx.lineWidth = 2.5 / cam.zoom;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    left.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.beginPath();
    right.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    // 节点 + 中点手柄
    pl.nodes.forEach((nd, i) => {
      const isHover = hoverNode && hoverNode.id === pl.id && hoverNode.idx === i;
      const isSel = st.selNode && st.selNode.id === pl.id && st.selNode.idx === i;
      const isMulti = st.selNodes.has(`${pl.id}:${i}`);
      const sharp = nodeRadius(nd, pl.cornerRadius) <= 0;
      ctx.beginPath();
      ctx.arc(nd.x, nd.y, (isHover || isSel || isMulti ? NODE_R + 2 : NODE_R) / cam.zoom, 0, Math.PI * 2);
      ctx.fillStyle = sharp ? '#fb923c' : (isMulti ? ACCENT : SEL_COLOR);
      ctx.fill();
      ctx.strokeStyle = (isSel || isMulti) ? ACCENT : '#0d1117';
      ctx.lineWidth = (isSel || isMulti ? 3 : 2) / cam.zoom;
      ctx.stroke();
      // 多选节点外圈白环，明确标示"批量选中"
      if (isMulti) {
        ctx.beginPath();
        ctx.arc(nd.x, nd.y, (NODE_R + 4.5) / cam.zoom, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.5 / cam.zoom;
        ctx.stroke();
      }
      // 直角节点画方框标记
      if (sharp) {
        ctx.strokeStyle = '#0d1117';
        ctx.lineWidth = 1.5 / cam.zoom;
        const r = (NODE_R - 2) / cam.zoom;
        ctx.strokeRect(nd.x - r, nd.y - r, r * 2, r * 2);
      }
    });
    // 中点插入手柄：菱形 + "+"，明确提示"拖拽插入节点"（非曲线手柄）
    for (let i = 0; i < pl.nodes.length - (pl.closed ? 0 : 1); i++) {
      const a = pl.nodes[i], b = pl.nodes[(i + 1) % pl.nodes.length];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const r = MID_R / cam.zoom;
      // 菱形
      ctx.beginPath();
      ctx.moveTo(mx, my - r);
      ctx.lineTo(mx + r, my);
      ctx.lineTo(mx, my + r);
      ctx.lineTo(mx - r, my);
      ctx.closePath();
      ctx.fillStyle = '#0d1117';
      ctx.fill();
      ctx.strokeStyle = SEL_COLOR;
      ctx.lineWidth = 1.5 / cam.zoom;
      ctx.stroke();
      // "+" 号
      const c = r * 0.45;
      ctx.beginPath();
      ctx.moveTo(mx - c, my); ctx.lineTo(mx + c, my);
      ctx.moveTo(mx, my - c); ctx.lineTo(mx, my + c);
      ctx.strokeStyle = SEL_COLOR;
      ctx.lineWidth = 1.2 / cam.zoom;
      ctx.stroke();
    }
  });

  // 绘制中的预览
  if (draw && draw.nodes.length > 0) {
    const previewNodes = [...draw.nodes];
    if (draw.cursor) previewNodes.push({ x: draw.cursor.x, y: draw.cursor.y });
    const previewPl: Polyline = {
      id: 'preview', kind: draw.kind, width: draw.width,
      color: draw.kind === 'road' ? ROAD_COLOR : WALL_COLOR, nodes: previewNodes,
      cornerRadius: st.cornerRadius,
    };
    ctx.globalAlpha = 0.6;
    drawPolylineShape(ctx, previewPl, cam);
    ctx.globalAlpha = 1;
    // 节点
    previewNodes.forEach((nd, i) => {
      ctx.beginPath();
      ctx.arc(nd.x, nd.y, NODE_R / cam.zoom, 0, Math.PI * 2);
      ctx.fillStyle = i === previewNodes.length - 1 && draw.cursor ? ACCENT : SEL_COLOR;
      ctx.fill();
      ctx.strokeStyle = '#0d1117'; ctx.lineWidth = 2 / cam.zoom; ctx.stroke();
    });
  }

  // 端点衔接高亮（绘制时靠近已有端点显示吸附环）
  if (snapEndpoint) {
    ctx.beginPath();
    ctx.arc(snapEndpoint.x, snapEndpoint.y, (NODE_R + 6) / cam.zoom, 0, Math.PI * 2);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2.5 / cam.zoom;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(snapEndpoint.x, snapEndpoint.y, (NODE_R + 1) / cam.zoom, 0, Math.PI * 2);
    ctx.fillStyle = ACCENT;
    ctx.fill();
  }

  // 框选
  if (drag.mode === 'select-box' && drag.boxEnd) {
    const x1 = Math.min(drag.startWorld.x, drag.boxEnd.x), y1 = Math.min(drag.startWorld.y, drag.boxEnd.y);
    const bw = Math.abs(drag.boxEnd.x - drag.startWorld.x), bh = Math.abs(drag.boxEnd.y - drag.startWorld.y);
    ctx.fillStyle = 'rgba(34,211,238,0.1)';
    ctx.fillRect(x1, y1, bw, bh);
    ctx.strokeStyle = SEL_COLOR; ctx.lineWidth = 1 / cam.zoom;
    ctx.setLineDash([4 / cam.zoom, 3 / cam.zoom]);
    ctx.strokeRect(x1, y1, bw, bh);
    ctx.setLineDash([]);
  }

  ctx.restore();
}

// ===================== Main Component =====================
const MapEditor: React.FC<{ onBack: () => void; onPlayLevel?: (ld: LevelData) => void; inactive?: boolean }> = ({ onBack, onPlayLevel, inactive = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<Camera>({ x: 1000, y: 1000, zoom: 0.45 });
  const dragRef = useRef<DragState>({ mode: 'none', startWorld: { x: 0, y: 0 }, startScreen: { x: 0, y: 0 } });
  const drawRef = useRef<DrawState | null>(null);
  const refreshRef = useRef<() => void>(() => {}); // 智能路口自动跟随（赋值于定义后，避免声明顺序问题）
  const hoverNodeRef = useRef<{ id: string; idx: number } | null>(null);
  const snapEndpointRef = useRef<Pt | null>(null);
  const spaceRef = useRef(false);
  const dirtyRef = useRef(true);
  const rafRef = useRef(0);

  const [st, setSt] = useState<EditorState>(getDefaultState);
  const stRef = useRef(st);
  stRef.current = st;
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [, forceRender] = useState(0); // 触发绘制状态重渲染
  const markDirty = useCallback(() => { dirtyRef.current = true; }, []);

  const update = useCallback((patch: Partial<EditorState>) => {
    setSt(prev => ({ ...prev, ...patch }));
    dirtyRef.current = true;
  }, []);

  // ===== 吸附 =====
  const snapPoint = useCallback((wx: number, wy: number): Pt => {
    const s = stRef.current;
    if (!s.snapEnabled) return clampToBounds(wx, wy, s);
    // 轴对齐吸附：光标经过任意已有节点/绘制中节点的水平轴或垂直轴时吸附，保证节点对齐
    let x = wx, y = wy, sx = false, sy = false;
    const thr = SNAP_THRESHOLD / Math.max(0.4, Math.min(2, camRef.current.zoom)); // 屏幕像素阈值→世界
    const consider = (nd: Pt) => {
      if (!sx && Math.abs(wx - nd.x) < thr) { x = nd.x; sx = true; }
      if (!sy && Math.abs(wy - nd.y) < thr) { y = nd.y; sy = true; }
    };
    s.polylines.forEach(pl => pl.nodes.forEach(consider));
    drawRef.current?.nodes.forEach(consider);
    if (!sx) x = snapVal(wx);
    if (!sy) y = snapVal(wy);
    return clampToBounds(x, y, s);
  }, []);

  // ===== 撤销/重做 =====
  const historyRef = useRef<{ undo: string[]; redo: string[] }>({ undo: [], redo: [] });

  const serializeMap = useCallback((): string => {
    const s = stRef.current;
    return JSON.stringify({
      polylines: s.polylines,
      obstacles: s.obstacles,
      spots: s.spots,
      markings: s.markings,
      intersections: s.intersections || [],
      mapWidth: s.mapWidth,
      mapHeight: s.mapHeight,
    });
  }, []);

  const pushHistory = useCallback(() => {
    const h = historyRef.current;
    const snap = serializeMap();
    if (h.undo.length > 0 && h.undo[h.undo.length - 1] === snap) return; // 无变化不记录
    h.undo.push(snap);
    if (h.undo.length > 80) h.undo.shift();
    h.redo = [];
  }, [serializeMap]);

  const applySnapshot = useCallback((snap: string) => {
    const d = JSON.parse(snap);
    setSt(s => ({
      ...s,
      polylines: d.polylines, obstacles: d.obstacles, spots: d.spots,
      markings: withMarkingIds(d.markings), intersections: d.intersections || [], mapWidth: d.mapWidth, mapHeight: d.mapHeight,
      selectedIds: new Set(),
    }));
    dirtyRef.current = true;
  }, []);

  const undo = useCallback(() => {
    const h = historyRef.current;
    const prev = h.undo.pop();
    if (!prev) return;
    h.redo.push(serializeMap());
    applySnapshot(prev);
    drawRef.current = null;
  }, [serializeMap, applySnapshot]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    const next = h.redo.pop();
    if (!next) return;
    h.undo.push(serializeMap());
    applySnapshot(next);
  }, [serializeMap, applySnapshot]);

  // ===== 折线更新 =====
  const updatePolyline = useCallback((id: string, patch: Partial<Polyline>) => {
    setSt(prev => ({ ...prev, polylines: prev.polylines.map(p => p.id === id ? { ...p, ...patch } : p) }));
    dirtyRef.current = true;
    refreshRef.current?.();
  }, []);
  const updateNode = useCallback((id: string, idx: number, patch: Partial<PolyNode>) => {
    setSt(prev => ({
      ...prev,
      polylines: prev.polylines.map(p => p.id === id
        ? { ...p, nodes: p.nodes.map((n, i) => i === idx ? { ...n, ...patch } : n) } : p),
    }));
    dirtyRef.current = true;
    refreshRef.current?.();
  }, []);
  const updateElement = useCallback((id: string, patch: Record<string, any>) => {
    setSt(prev => {
      const patchArr = (arr: any[]) => { const i = arr.findIndex(e => e.id === id); if (i >= 0) arr[i] = { ...arr[i], ...patch }; return arr; };
      return {
        ...prev,
        obstacles: patchArr([...prev.obstacles]),
        spots: patchArr([...prev.spots]),
        markings: patchArr([...prev.markings]),
        intersections: patchArr([...(prev.intersections || [])]),
      };
    });
    dirtyRef.current = true;
  }, []);

  // ===== 删除 =====
  const deleteElements = useCallback((ids: Set<string>) => {
    if (ids.size === 0) return;
    pushHistory();
    const cur = stRef.current;
    const deletedPolylines = cur.polylines.some(p => ids.has(p.id));
    const delIntIds = new Set((cur.intersections || []).filter(it => ids.has(it.id!)).map(it => it.id!));
    // 删除自动标线 → 锁定其路口（避免自动跟随把删掉的标线又生成回来）
    const affectedJunctionIds = new Set<string>();
    cur.markings.forEach(m => { if (m.junctionId && ids.has(m.id!)) affectedJunctionIds.add(m.junctionId); });
    setSt(prev => ({
      ...prev,
      polylines: prev.polylines.filter(p => !ids.has(p.id)),
      obstacles: prev.obstacles.filter(o => !ids.has(o.id)),
      spots: prev.spots.filter(s => !ids.has(s.id)),
      markings: prev.markings.filter(m => !ids.has(m.id!) && !(m.junctionId && delIntIds.has(m.junctionId))),
      intersections: (prev.intersections || []).filter(it => !ids.has(it.id!))
        .map(it => (affectedJunctionIds.has(it.id!) && it.auto && !it.locked) ? { ...it, locked: true } : it),
      selectedIds: new Set(),
    }));
    dirtyRef.current = true;
    if (deletedPolylines || delIntIds.size > 0) refreshRef.current?.();
  }, [pushHistory]);

  // 折线逐段删除：删除 segStart 对应的一段(run)，余下>=2节点则保留/拆分
  const deletePolylineSegment = useCallback((pl: Polyline, segStart: number) => {
    // 全程基于去重后的节点，保证下标一致
    const nodes = sanitizeNodes(pl.nodes, !!pl.closed);
    const runs = splitIntoRuns(nodes, !!pl.closed);
    const bounds: { s: number; e: number }[] = [];
    let cursor = 0;
    runs.forEach(r => { bounds.push({ s: cursor, e: cursor + r.pts.length - 1 }); cursor += r.pts.length - 1; });
    const bi = bounds.findIndex(b => b.s === segStart);
    if (bi < 0) return;
    pushHistory();
    const { s: ds, e: de } = bounds[bi];
    const n = nodes.length;

    if (pl.closed) {
      // 闭合：从 de+1 绕到 ds+n，解开成开放折线
      const rest: PolyNode[] = [];
      for (let j = de + 1; j <= ds + n; j++) rest.push({ ...nodes[((j % n) + n) % n] });
      setSt(prev => ({
        ...prev,
        polylines: rest.length >= 2
          ? prev.polylines.map(p => p.id === pl.id ? { ...p, closed: false, nodes: rest } : p)
          : prev.polylines.filter(p => p.id !== pl.id),
      }));
      dirtyRef.current = true;
      return;
    }

    if (ds === 0) {
      // 删首段
      const rest = nodes.slice(de);
      setSt(prev => ({ ...prev, polylines: rest.length >= 2 ? prev.polylines.map(p => p.id === pl.id ? { ...p, nodes: rest } : p) : prev.polylines.filter(p => p.id !== pl.id) }));
    } else if (de === n - 1) {
      // 删尾段
      const rest = nodes.slice(0, ds + 1);
      setSt(prev => ({ ...prev, polylines: rest.length >= 2 ? prev.polylines.map(p => p.id === pl.id ? { ...p, nodes: rest } : p) : prev.polylines.filter(p => p.id !== pl.id) }));
    } else {
      // 删中段：拆成两条
      const A = nodes.slice(0, ds + 1);
      const B = nodes.slice(de);
      const idB = makeId(pl.kind);
      setSt(prev => ({
        ...prev,
        polylines: [
          ...prev.polylines.map(p => p.id === pl.id ? { ...p, nodes: A } : p),
          { ...pl, id: idB, nodes: B },
        ],
      }));
    }
    dirtyRef.current = true;
  }, [pushHistory]);

  // ===== 复制/粘贴 =====
  const copySelected = useCallback(() => {
    const s = stRef.current;
    const clip: any[] = [];
    s.polylines.filter(p => s.selectedIds.has(p.id)).forEach(p => clip.push({ type: 'polyline', data: { ...p, nodes: p.nodes.map(n => ({ ...n })) } }));
    s.obstacles.filter(o => s.selectedIds.has(o.id)).forEach(o => clip.push({ type: 'obstacle', data: { ...o } }));
    s.spots.filter(sp => s.selectedIds.has(sp.id)).forEach(sp => clip.push({ type: 'spot', data: { ...sp } }));
    s.markings.filter(m => s.selectedIds.has(m.id)).forEach(m => clip.push({ type: 'marking', data: { ...m } }));
    (s.intersections || []).filter(it => s.selectedIds.has(it.id!)).forEach(it => clip.push({ type: 'intersection', data: { ...it } }));
    update({ clipboard: clip });
  }, [update]);
  const pasteClipboard = useCallback(() => {
    const s = stRef.current;
    if (s.clipboard.length === 0) return;
    pushHistory();
    const newIds = new Set<string>();
    setSt(prev => {
      const polylines = [...prev.polylines], obstacles = [...prev.obstacles], spots = [...prev.spots], markings = [...prev.markings], intersections = [...(prev.intersections || [])];
      prev.clipboard.forEach(item => {
        const id = makeId('paste'); newIds.add(id);
        const d = { ...item.data, id };
        if (item.type === 'polyline') { d.nodes = d.nodes.map((n: PolyNode) => ({ ...n, x: n.x + 60, y: n.y + 60 })); polylines.push(d); }
        else if (item.type === 'intersection') { d.x += 60; d.y += 60; intersections.push(d); }
        else { d.x += 60; d.y += 60; if (item.type === 'obstacle') obstacles.push(d); else if (item.type === 'spot') spots.push(d); else markings.push(d); }
      });
      return { ...prev, polylines, obstacles, spots, markings, intersections, selectedIds: newIds };
    });
    dirtyRef.current = true;
  }, [pushHistory]);

  // ===== 添加元素 =====
  const addSpot = useCallback(() => {
    pushHistory();
    const id = makeId('spot');
    const c = camRef.current;
    setSt(prev => ({ ...prev, spots: [...prev.spots, { id, x: snapVal(c.x), y: snapVal(c.y), width: 54, height: 26, rotation: 0, occupied: false }], selectedIds: new Set([id]) }));
    dirtyRef.current = true;
  }, [pushHistory]);
  const addMarking = useCallback((typeOverride?: Marking['type']) => {
    pushHistory();
    const id = makeId('mark');
    const c = camRef.current;
    const type = typeOverride || stRef.current.markingType;
    const isArrow = type.startsWith('arrow-');
    const w = isArrow ? 24 : type === 'crosswalk' ? 60 : type === 'roundabout' ? 120 : type === 'stop' ? 60 : type === 'channelize' ? 40 : type === 'yield' ? 36 : 100;
    const h = isArrow ? 32 : type === 'crosswalk' ? 40 : type === 'roundabout' ? 120 : type === 'stop' ? 6 : type === 'channelize' ? 60 : type === 'yield' ? 30 : 3;
    const color = (type === 'line-double') ? '#f5c842' : '#ffffff';
    setSt(prev => ({ ...prev, markings: [...prev.markings, { id, type, x: snapVal(c.x), y: snapVal(c.y), width: w, height: h, rotation: 0, color }], selectedIds: new Set([id]) }));
    dirtyRef.current = true;
  }, [pushHistory]);
  const addIntersection = useCallback((wx: number, wy: number) => {
    pushHistory();
    const id = makeId('int');
    setSt(prev => ({ ...prev, intersections: [...(prev.intersections || []), { id, x: wx, y: wy, size: 120, rotation: 0, bridge: false, elevation: 60 }], selectedIds: new Set([id]) }));
    dirtyRef.current = true;
  }, [pushHistory]);
  const addCar = useCallback(() => {
    pushHistory();
    const id = makeId('car');
    const c = camRef.current;
    setSt(prev => ({ ...prev, obstacles: [...prev.obstacles, { id, x: snapVal(c.x), y: snapVal(c.y), width: 20, height: 47, rotation: 0, type: 'car', movable: true, weight: 80, color: '#e53e3e' }], selectedIds: new Set([id]) }));
    dirtyRef.current = true;
  }, [pushHistory]);

  // ===== 命中检测 =====
  const hitNode = useCallback((sx: number, sy: number): { id: string; idx: number; isMid: boolean } | null => {
    const s = stRef.current;
    const canvas = canvasRef.current; if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const cam = camRef.current;
    for (const pl of s.polylines) {
      // 节点手柄对任意折线可命中：单击即可选中该节点并单独调路宽/圆角（无需先选中整条路）。
      // 节点
      for (let i = 0; i < pl.nodes.length; i++) {
        const sp = worldToScreen(pl.nodes[i].x, pl.nodes[i].y, cam, rect.width, rect.height);
        if (Math.hypot(sx - sp.x, sy - sp.y) < NODE_R + 5) return { id: pl.id, idx: i, isMid: false };
      }
      // 中点
      for (let i = 0; i < pl.nodes.length - (pl.closed ? 0 : 1); i++) {
        const a = pl.nodes[i], b = pl.nodes[(i + 1) % pl.nodes.length];
        const sp = worldToScreen((a.x + b.x) / 2, (a.y + b.y) / 2, cam, rect.width, rect.height);
        if (Math.hypot(sx - sp.x, sy - sp.y) < MID_R + 5) return { id: pl.id, idx: i, isMid: true };
      }
    }
    return null;
  }, []);

  const hitAny = useCallback((wx: number, wy: number): { id: string; type: ElementType } | null => {
    const s = stRef.current;
    // 点状元素优先（顶层）
    for (let i = s.obstacles.length - 1; i >= 0; i--) {
      const o = s.obstacles[i];
      if (hitRect(wx, wy, o.x, o.y, o.width, o.height, o.rotation)) return { id: o.id, type: 'obstacle' };
    }
    for (let i = s.spots.length - 1; i >= 0; i--) {
      const sp = s.spots[i];
      if (hitRect(wx, wy, sp.x, sp.y, sp.width, sp.height, sp.rotation)) return { id: sp.id, type: 'spot' };
    }
    for (let i = s.markings.length - 1; i >= 0; i--) {
      const m = s.markings[i];
      if (hitRect(wx, wy, m.x, m.y, m.width, m.height, m.rotation)) return { id: m.id!, type: 'marking' };
    }
    for (let i = (s.intersections || []).length - 1; i >= 0; i--) {
      const it = (s.intersections || [])[i];
      if (hitRect(wx, wy, it.x, it.y, it.size, it.size, it.rotation || 0)) return { id: it.id!, type: 'intersection' };
    }
    // 折线
    for (let i = s.polylines.length - 1; i >= 0; i--) {
      if (hitPolyline({ x: wx, y: wy }, s.polylines[i], 6)) return { id: s.polylines[i].id, type: 'polyline' };
    }
    return null;
  }, []);

  // ===== 提交绘制 =====
  const commitDraw = useCallback(() => {
    const draw = drawRef.current;
    if (!draw) return;
    if (draw.nodes.length >= 2) {
      pushHistory();
      // 分支接回尾部：仅当原折线剩余部分都已被并入（只剩尾巴）时才安全接回，
      // 否则会产生错误的"回程"段 → 此时丢弃尾部，保留主干。
      let finalNodes = draw.nodes;
      if (draw.suffix && draw.suffix.length > 0 && draw.targetId) {
        const cur = stRef.current.polylines.find(p => p.id === draw.targetId);
        const endpointKeys = new Set<string>(draw.nodes.map(n => `${n.x},${n.y}`));
        if (cur && allNodesInSet(cur, endpointKeys)) {
          finalNodes = [...draw.nodes, ...draw.suffix];
        }
      }
      if (draw.targetId) {
        const cleaned = sanitizeNodes(finalNodes, !!draw.closed);
        updatePolyline(draw.targetId, { nodes: cleaned, closed: !!draw.closed });
        update({ selectedIds: new Set([draw.targetId]) });
      } else {
        const id = makeId(draw.kind);
        const pl: Polyline = {
          id, kind: draw.kind, nodes: sanitizeNodes(finalNodes, !!draw.closed),
          width: draw.inheritWidth ?? (draw.kind === 'road' ? stRef.current.roadWidth : stRef.current.wallWidth),
          color: draw.kind === 'road' ? ROAD_COLOR : WALL_COLOR,
          closed: !!draw.closed,
          cornerRadius: draw.inheritRadius ?? stRef.current.cornerRadius,
          lanes: draw.inheritLanes ?? stRef.current.defaultLanes,
          direction: draw.inheritDirection ?? stRef.current.defaultDirection,
        };
        setSt(prev => ({ ...prev, polylines: [...prev.polylines, pl], selectedIds: new Set([id]) }));
      }
      // 删除被并入的折线
      if (draw.absorbedIds.length > 0) {
        const absorbed = new Set(draw.absorbedIds);
        setSt(prev => ({ ...prev, polylines: prev.polylines.filter(p => !absorbed.has(p.id)) }));
      }
    }
    drawRef.current = null;
    dirtyRef.current = true;
    forceRender(v => v + 1);
    refreshRef.current?.();
  }, [update, updatePolyline, pushHistory]);

  const cancelDraw = useCallback(() => {
    drawRef.current = null;
    dirtyRef.current = true;
    forceRender(v => v + 1);
  }, []);

  // ===== 鼠标 =====
  const getWorld = useCallback((e: { clientX: number; clientY: number }): { sx: number; sy: number; world: Pt; cw: number; ch: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    return { sx, sy, world: screenToWorld(sx, sy, camRef.current, rect.width, rect.height), cw: rect.width, ch: rect.height };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const { sx, sy, world } = getWorld(e);
    const s = stRef.current;
    const cam = camRef.current;

    // 平移
    if (e.button === 1 || (spaceRef.current && e.button === 0)) {
      dragRef.current = { mode: 'pan', startWorld: world, startScreen: { x: e.clientX, y: e.clientY } };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    // 删除工具：折线逐段删除，点状元素整体删除
    if (s.tool === 'delete') {
      // 先查折线段
      let segHit: { pl: Polyline; segStart: number } | null = null;
      for (let i = s.polylines.length - 1; i >= 0; i--) {
        const pl = s.polylines[i];
        const segStart = hitPolylineSegment({ x: world.x, y: world.y }, pl, 6);
        if (segStart >= 0) { segHit = { pl, segStart }; break; }
      }
      if (segHit) { deletePolylineSegment(segHit.pl, segHit.segStart); return; }
      const hit = hitAny(world.x, world.y);
      if (hit) deleteElements(new Set([hit.id]));
      return;
    }

    // 路口/桥面工具：点击放置
    if (s.tool === 'intersection') {
      const sp = snapPoint(world.x, world.y);
      addIntersection(sp.x, sp.y);
      return;
    }

    // 道路/墙壁绘制
    if (s.tool === 'road' || s.tool === 'wall') {
      const kind = s.tool;
      const thr = 14 / cam.zoom; // 屏幕14px换算的吸附半径
      if (!drawRef.current) {
        // 起笔：可从端点续接，也可从任意节点/路段中间分支（天际线式连接）
        const nn = nearestNode(world, s.polylines, kind, thr);
        if (nn) {
          // 从已有节点起笔 = 新建一条独立支线：共享该节点坐标形成路口，宿主折线保持不变。
          // 继承宿主的路宽/车道/方向/圆角作为初值，提交后是独立折线，可在属性面板单独改车道数等。
          const anchor: PolyNode = { ...nn.pl.nodes[nn.idx] };
          drawRef.current = {
            kind, targetId: null, nodes: [anchor], cursor: null, width: nn.pl.width, absorbedIds: [],
            inheritWidth: nn.pl.width,
            inheritLanes: nn.pl.lanes ?? inferLanes(nn.pl.width),
            inheritDirection: nn.pl.direction ?? 'two-way',
            inheritRadius: nn.pl.cornerRadius,
          };
        } else {
          const seg = nearestSegmentPoint(world, s.polylines, kind, thr);
          if (seg) {
            // 从路段中间起笔 = 在命中点新建独立支线（T 形分叉），宿主折线保持不变
            const splice: PolyNode = { x: seg.pt.x, y: seg.pt.y };
            drawRef.current = {
              kind, targetId: null, nodes: [splice], cursor: null, width: seg.pl.width, absorbedIds: [],
              inheritWidth: seg.pl.width,
              inheritLanes: seg.pl.lanes ?? inferLanes(seg.pl.width),
              inheritDirection: seg.pl.direction ?? 'two-way',
              inheritRadius: seg.pl.cornerRadius,
            };
          } else {
            const sp = snapPoint(world.x, world.y);
            drawRef.current = { kind, targetId: null, nodes: [{ x: sp.x, y: sp.y }], cursor: null, width: kind === 'road' ? s.roadWidth : s.wallWidth, absorbedIds: [] };
          }
        }
      } else {
        // 续接：若点击到"另一条"线的端点 → 并入当前绘制并收尾
        const ep = nearestEndpoint(world, s.polylines, kind, thr, drawRef.current.targetId || undefined);
        if (ep && !drawRef.current.absorbedIds.includes(ep.pl.id)) {
          const otherNodes = ep.end === 'start'
            ? ep.pl.nodes.map(n => ({ ...n }))
            : ep.pl.nodes.map(n => ({ ...n })).reverse();
          drawRef.current.nodes = [...drawRef.current.nodes, ...otherNodes.slice(1)];
          drawRef.current.absorbedIds.push(ep.pl.id);
          commitDraw();
          return;
        }
        // 首尾相接：点击本线第一个节点附近 → 闭合成环
        const first = drawRef.current.nodes[0];
        if (drawRef.current.nodes.length >= 3 && Math.hypot(world.x - first.x, world.y - first.y) < thr) {
          drawRef.current.closed = true;
          drawRef.current.cursor = null;
          commitDraw();
          return;
        }
        let sp = snapPoint(world.x, world.y);
        const last = drawRef.current.nodes[drawRef.current.nodes.length - 1];
        if (e.shiftKey) sp = axisConstrain(last, sp); // Shift：横/竖直铺设
        if (Math.hypot(sp.x - last.x, sp.y - last.y) > 8) {
          drawRef.current.nodes.push({ x: sp.x, y: sp.y });
          drawRef.current.cursor = null;
        }
      }
      dirtyRef.current = true;
      forceRender(v => v + 1);
      return;
    }

    // 放置工具
    if (s.tool === 'place' && s.placeItem) {
      const item = s.placeItem;
      const id = makeId('placed');
      const sp = snapPoint(world.x, world.y);
      const obs: Obstacle = {
        id, x: sp.x, y: sp.y, width: item.defaultWidth || 20, height: item.defaultHeight || 47,
        rotation: 0, type: (item.obstacleType as any) || 'car', movable: false, weight: 0,
        color: item.defaultColor || '#4b5563', modelKey: item.key,
      };
      pushHistory();
      setSt(prev => ({ ...prev, obstacles: [...prev.obstacles, obs], selectedIds: new Set([id]), tool: 'select', placeItem: null }));
      dirtyRef.current = true;
      return;
    }

    // 选择工具
    // 1. 节点/中点手柄
    const nh = hitNode(sx, sy);
    if (nh) {
      if (nh.isMid) {
        // 中点：进入"待插入"拖拽态（拖动才插入，单击不插入）
        dragRef.current = { mode: 'insert-node', startWorld: world, startScreen: { x: sx, y: sy }, polyId: nh.id, nodeIndex: nh.idx };
      } else if (e.altKey) {
        // Alt+点击删除节点
        const pl = s.polylines.find(p => p.id === nh.id)!;
        const minNodes = pl.closed ? 3 : 2;
        if (pl.nodes.length > minNodes) {
          pushHistory();
          updatePolyline(nh.id, { nodes: pl.nodes.filter((_, i) => i !== nh.idx) });
          update({ selNode: null, selNodes: new Set() }); // 节点索引会整体前移，清空多选避免脏键
        }
      } else {
        const pl = s.polylines.find(p => p.id === nh.id)!;
        const key = `${nh.id}:${nh.idx}`;
        let nextNodes: Set<string>;
        if (e.shiftKey) {
          // Shift+点击：切换加入/移出多选集合
          nextNodes = new Set(s.selNodes);
          if (nextNodes.has(key)) nextNodes.delete(key); else nextNodes.add(key);
        } else {
          nextNodes = new Set([key]);
        }
        update({ selNode: { id: nh.id, idx: nh.idx }, selNodes: nextNodes, selectedIds: new Set([nh.id]) });
        pushHistory();
        dragRef.current = { mode: 'move-node', startWorld: world, startScreen: { x: sx, y: sy }, polyId: nh.id, nodeIndex: nh.idx, origNodes: pl.nodes.map(n => ({ x: n.x, y: n.y })) };
      }
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    // 2. 元素命中
    const hit = hitAny(world.x, world.y);
    if (hit) {
      let sel: Set<string>;
      if (e.shiftKey) {
        sel = new Set(s.selectedIds);
        if (sel.has(hit.id)) sel.delete(hit.id); else sel.add(hit.id);
      } else {
        sel = s.selectedIds.has(hit.id) ? s.selectedIds : new Set([hit.id]);
      }
      update({ selectedIds: sel, selNode: null });

      if (hit.type === 'polyline') {
        const pl = s.polylines.find(p => p.id === hit.id)!;
        pushHistory();
        dragRef.current = { mode: 'move-poly', startWorld: world, startScreen: { x: sx, y: sy }, polyId: hit.id, origNodes: pl.nodes.map(n => ({ x: n.x, y: n.y })) };
      } else {
        const orig = new Map<string, any>();
        const moveIds = new Set(sel); moveIds.add(hit.id);
        [...s.obstacles, ...s.spots, ...s.markings, ...(s.intersections || [])].forEach((el: any) => {
          if (moveIds.has(el.id)) orig.set(el.id, { x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation, size: el.size });
        });
        pushHistory();
        dragRef.current = { mode: 'move-el', startWorld: world, startScreen: { x: sx, y: sy }, origElements: orig };
      }
      canvas.setPointerCapture(e.pointerId);
    } else {
      // 3. 框选
      if (!e.shiftKey) update({ selectedIds: new Set(), selNode: null, selNodes: new Set() });
      dragRef.current = { mode: 'select-box', startWorld: world, startScreen: { x: sx, y: sy }, boxEnd: world };
      canvas.setPointerCapture(e.pointerId);
    }
  }, [getWorld, hitAny, hitNode, snapPoint, deleteElements, deletePolylineSegment, update, updatePolyline, pushHistory]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const { sx, sy, world } = getWorld(e);
    setMousePos({ x: Math.round(world.x), y: Math.round(world.y) });
    const s = stRef.current;
    const cam = camRef.current;
    const drag = dragRef.current;

    // 绘制预览光标 + 端点衔接/闭合高亮
    if (s.tool === 'road' || s.tool === 'wall') {
      const thr = 14 / cam.zoom;
      let epPt: Pt | null = null;
      // 优先：靠近本线第一个节点 → 闭合高亮
      if (drawRef.current && drawRef.current.nodes.length >= 3) {
        const first = drawRef.current.nodes[0];
        if (Math.hypot(world.x - first.x, world.y - first.y) < thr) epPt = { x: first.x, y: first.y };
      }
      if (!epPt) {
        const ep = nearestEndpoint(world, s.polylines, s.tool, thr, drawRef.current?.targetId || undefined);
        epPt = ep ? (ep.end === 'start' ? ep.pl.nodes[0] : ep.pl.nodes[ep.pl.nodes.length - 1]) : null;
      }
      if ((epPt?.x !== snapEndpointRef.current?.x) || (epPt?.y !== snapEndpointRef.current?.y)) {
        snapEndpointRef.current = epPt ? { x: epPt.x, y: epPt.y } : null;
        dirtyRef.current = true;
      }
      if (drawRef.current) {
        // 光标吸附到端点或网格/轴
        let cur: Pt = epPt ? { x: epPt.x, y: epPt.y } : snapPoint(world.x, world.y);
        // Shift：相对上一个节点横向或纵向平直铺设
        if (e.shiftKey && !epPt && drawRef.current.nodes.length > 0) {
          cur = axisConstrain(drawRef.current.nodes[drawRef.current.nodes.length - 1], cur);
        }
        drawRef.current.cursor = cur;
        dirtyRef.current = true;
      }
    } else if (snapEndpointRef.current) {
      snapEndpointRef.current = null;
      dirtyRef.current = true;
    }

    // 悬停节点高亮
    if (s.tool === 'select') {
      const nh = hitNode(sx, sy);
      const newHover = nh && !nh.isMid ? { id: nh.id, idx: nh.idx } : null;
      const old = hoverNodeRef.current;
      if ((old?.id !== newHover?.id) || (old?.idx !== newHover?.idx)) {
        hoverNodeRef.current = newHover;
        dirtyRef.current = true;
      }
    }

    if (drag.mode === 'none') { if (s.tool === 'road' || s.tool === 'wall') markDirty(); return; }

    if (drag.mode === 'pan') {
      const dx = (e.clientX - drag.startScreen.x) / cam.zoom;
      const dy = (e.clientY - drag.startScreen.y) / cam.zoom;
      cam.x -= dx; cam.y -= dy;
      drag.startScreen = { x: e.clientX, y: e.clientY };
      markDirty();
      return;
    }
    if (drag.mode === 'select-box') {
      drag.boxEnd = world;
      const x1 = Math.min(drag.startWorld.x, world.x), y1 = Math.min(drag.startWorld.y, world.y);
      const x2 = Math.max(drag.startWorld.x, world.x), y2 = Math.max(drag.startWorld.y, world.y);
      const sel = new Set<string>();
      s.polylines.forEach(pl => { if (pl.nodes.some(n => n.x >= x1 && n.x <= x2 && n.y >= y1 && n.y <= y2)) sel.add(pl.id); });
      s.obstacles.forEach(o => { if (o.x >= x1 && o.x <= x2 && o.y >= y1 && o.y <= y2) sel.add(o.id); });
      s.spots.forEach(sp => { if (sp.x >= x1 && sp.x <= x2 && sp.y >= y1 && sp.y <= y2) sel.add(sp.id); });
      s.markings.forEach(m => { if (m.x >= x1 && m.x <= x2 && m.y >= y1 && m.y <= y2) sel.add(m.id!); });
      // 框选同时收集落在框内的节点手柄 → 批量调路宽/圆角
      const nodeSel = new Set<string>();
      s.polylines.forEach(pl => { pl.nodes.forEach((n, i) => { if (n.x >= x1 && n.x <= x2 && n.y >= y1 && n.y <= y2) nodeSel.add(`${pl.id}:${i}`); }); });
      update({ selectedIds: sel, selNodes: nodeSel, selNode: null });
      return;
    }
    if (drag.mode === 'insert-node' && drag.polyId != null && drag.nodeIndex != null) {
      const moved = Math.hypot(e.clientX - drag.startScreen.x, e.clientY - drag.startScreen.y);
      if (moved > 5) {
        // 达到阈值 → 真正插入节点并转为移动
        const pl = stRef.current.polylines.find(p => p.id === drag.polyId);
        if (pl) {
          pushHistory();
          const segIdx = drag.nodeIndex;
          const sp = snapPoint(world.x, world.y);
          const newNode: PolyNode = { x: sp.x, y: sp.y };
          const newNodes = [...pl.nodes];
          newNodes.splice(segIdx + 1, 0, newNode);
          updatePolyline(pl.id, { nodes: newNodes });
          dragRef.current = { mode: 'move-node', startWorld: world, startScreen: drag.startScreen, polyId: pl.id, nodeIndex: segIdx + 1, origNodes: newNodes.map(n => ({ x: n.x, y: n.y })) };
        } else {
          dragRef.current = { mode: 'none', startWorld: world, startScreen: { x: e.clientX, y: e.clientY } };
        }
      }
      return;
    }
    if (drag.mode === 'move-node' && drag.polyId != null && drag.nodeIndex != null && drag.origNodes) {
      const sp = snapPoint(world.x, world.y);
      const idx = drag.nodeIndex;
      setSt(prev => ({
        ...prev,
        polylines: prev.polylines.map(p => p.id === drag.polyId
          ? { ...p, nodes: p.nodes.map((n, i) => i === idx ? { ...n, x: sp.x, y: sp.y } : n) } : p),
      }));
      dirtyRef.current = true;
      return;
    }
    if (drag.mode === 'move-poly' && drag.polyId && drag.origNodes) {
      let dx = world.x - drag.startWorld.x, dy = world.y - drag.startWorld.y;
      if (s.snapEnabled) { dx = snapVal(drag.origNodes[0].x + dx) - drag.origNodes[0].x; dy = snapVal(drag.origNodes[0].y + dy) - drag.origNodes[0].y; }
      setSt(prev => ({
        ...prev,
        polylines: prev.polylines.map(p => p.id === drag.polyId
          ? { ...p, nodes: drag.origNodes!.map(n => ({ ...n, x: n.x + dx, y: n.y + dy })) } : p),
      }));
      dirtyRef.current = true;
      return;
    }
    if (drag.mode === 'move-el' && drag.origElements) {
      const dx = world.x - drag.startWorld.x, dy = world.y - drag.startWorld.y;
      const snap = s.snapEnabled;
      drag.origElements.forEach((orig, id) => {
        let nx = orig.x + dx, ny = orig.y + dy;
        if (snap) { nx = snapVal(nx); ny = snapVal(ny); }
        updateElement(id, { x: nx, y: ny });
      });
      return;
    }
  }, [getWorld, hitNode, snapPoint, update, updateElement, updatePolyline, pushHistory, markDirty]);

  const onPointerUp = useCallback(() => {
    const wasDrag = ['move-node', 'move-poly', 'move-el'].includes(dragRef.current.mode);
    dragRef.current = { mode: 'none', startWorld: { x: 0, y: 0 }, startScreen: { x: 0, y: 0 } };
    // 拖拽若无实际改动，丢弃拖拽开始时压入的历史
    if (wasDrag) {
      const h = historyRef.current;
      if (h.undo.length > 0 && h.undo[h.undo.length - 1] === serializeMap()) h.undo.pop();
    }
    markDirty();
    if (wasDrag) refreshRef.current?.();
  }, [markDirty, serializeMap]);

  const onDoubleClick = useCallback(() => {
    if (drawRef.current) commitDraw();
  }, [commitDraw]);

  // 右键切换节点圆角/直角
  const onContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const nh = hitNode(sx, sy);
    if (nh && !nh.isMid) {
      const pl = stRef.current.polylines.find(p => p.id === nh.id);
      if (pl) {
        pushHistory();
        const cur = nodeRadius(pl.nodes[nh.idx], pl.cornerRadius);
        // 右键：直角⇄圆角 快捷切换(0 ⇄ 折线默认半径)
        const next = cur <= 0 ? Math.max(pl.cornerRadius || 24, 24) : 0;
        updateNode(nh.id, nh.idx, { radius: next, sharp: next <= 0 });
        update({ selNode: { id: nh.id, idx: nh.idx }, selectedIds: new Set([nh.id]) });
      }
    }
  }, [hitNode, updateNode, pushHistory, update]);

  // ===== 键盘 =====
  useEffect(() => {
    // 测试游玩期间编辑器被隐藏挂载：禁用全局热键，避免与驾驶键冲突
    if (inactive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const s = stRef.current;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === ' ') { spaceRef.current = true; e.preventDefault(); }
      if (e.key === 'v' || e.key === 'V') { update({ tool: 'select', placeItem: null }); cancelDraw(); }
      if (e.key === 'r' || e.key === 'R') { update({ tool: 'road', placeItem: null }); cancelDraw(); }
      if (e.key === 'w' || e.key === 'W') { update({ tool: 'wall', placeItem: null }); cancelDraw(); }
      if (e.key === 'j' || e.key === 'J') { update({ tool: 'intersection', placeItem: null }); cancelDraw(); }
      if (e.key === 'p' || e.key === 'P') update({ tool: 'place' });
      if (e.key === 'd' || e.key === 'D') { if (!e.ctrlKey && !e.metaKey) { update({ tool: 'delete', placeItem: null }); cancelDraw(); } }
      if (e.key === 's' || e.key === 'S') { if (!e.ctrlKey && !e.metaKey) update({ snapEnabled: !s.snapEnabled }); }
      if (e.key === 'Enter' && drawRef.current) { e.preventDefault(); commitDraw(); }
      if (e.key === 'Escape') {
        if (drawRef.current) { cancelDraw(); }
        else update({ selectedIds: new Set(), selNodes: new Set(), selNode: null, tool: 'select', placeItem: null });
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedIds.size > 0) { e.preventDefault(); deleteElements(s.selectedIds); }
      if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        update({ selectedIds: new Set(listElements(s).map(el => el.id)) });
      }
      if (e.key === 'c' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); copySelected(); }
      if (e.key === 'v' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); pasteClipboard(); }
      if (e.key === 'd' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); copySelected(); pasteClipboard(); }
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        // 绘制中：撤销最后一个已布节点；否则全局撤销
        if (drawRef.current && drawRef.current.nodes.length > 0) {
          drawRef.current.nodes.pop();
          dirtyRef.current = true;
          forceRender(v => v + 1);
        } else {
          undo();
        }
      }
      if ((e.key === 'Backspace') && drawRef.current && drawRef.current.nodes.length > 0) {
        e.preventDefault();
        drawRef.current.nodes.pop();
        dirtyRef.current = true;
        forceRender(v => v + 1);
      }
      if ((e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) || (e.key === 'y' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); redo(); }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === ' ') spaceRef.current = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, [inactive, update, cancelDraw, commitDraw, deleteElements, copySelected, pasteClipboard, undo, redo]);

  // ===== Canvas loop + wheel =====
  useEffect(() => {
    // 测试游玩期间隐藏挂载：暂停画布循环，恢复时由 ResizeObserver 重新触发绘制
    if (inactive) return;
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const cam = camRef.current;
      const before = screenToWorld(sx, sy, cam, rect.width, rect.height);
      cam.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      const after = screenToWorld(sx, sy, cam, rect.width, rect.height);
      cam.x += before.x - after.x; cam.y += before.y - after.y;
      dirtyRef.current = true;
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const resize = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (w === 0 || h === 0) return;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirtyRef.current = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap); resize();

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      const w = wrap.clientWidth, h = wrap.clientHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 防御：单帧渲染异常不应导致永久黑屏
      try {
        renderScene(ctx, w, h, camRef.current, stRef.current, drawRef.current, dragRef.current, hoverNodeRef.current, snapEndpointRef.current);
      } catch (err) {
        console.error('[MapEditor] render error:', err);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#16181d';
        ctx.fillRect(0, 0, w, h);
      }
    };
    loop();
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); canvas.removeEventListener('wheel', onWheel); };
  }, [inactive]);

  // ===== 保存/加载/导出/导入 =====
  const buildLevelData = useCallback(() => serializeToLevelData(stRef.current), []);
  const handleSave = useCallback(() => {
    const name = prompt('存档名称：'); if (!name) return;
    const saves = JSON.parse(localStorage.getItem('map-editor-saves-v2') || '{}');
    saves[name] = { polylines: stRef.current.polylines, obstacles: stRef.current.obstacles, spots: stRef.current.spots, markings: stRef.current.markings, intersections: stRef.current.intersections || [], mapWidth: stRef.current.mapWidth, mapHeight: stRef.current.mapHeight };
    localStorage.setItem('map-editor-saves-v2', JSON.stringify(saves));
    alert(`已保存：${name}`);
  }, []);
  const handleLoad = useCallback(() => {
    const saves = JSON.parse(localStorage.getItem('map-editor-saves-v2') || '{}');
    const names = Object.keys(saves);
    if (names.length === 0) { alert('没有存档'); return; }
    const name = prompt(`选择存档：\n${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}\n输入名称：`);
    if (!name || !saves[name]) return;
    const d = saves[name];
    pushHistory();
    update({ polylines: d.polylines || [], obstacles: d.obstacles || [], spots: d.spots || [], markings: withMarkingIds(d.markings), intersections: d.intersections || [], mapWidth: d.mapWidth, mapHeight: d.mapHeight, selectedIds: new Set() });
    refreshRef.current?.();
  }, [update, pushHistory]);
  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(buildLevelData(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'map-export.json'; a.click();
    URL.revokeObjectURL(a.href);
  }, [buildLevelData]);
  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const ld = JSON.parse(reader.result as string) as LevelData;
          const { polylines, obstacles, intersections } = deserializeFromLevelData(ld);
          pushHistory();
          // 导入的墙壁 obstacle 中过滤掉由折线生成的(这里全部保留为点状)
          update({ polylines, obstacles, spots: ld.spots || [], markings: withMarkingIds(ld.markings), intersections, mapWidth: ld.mapWidth, mapHeight: ld.mapHeight, selectedIds: new Set() });
          refreshRef.current?.();
        } catch { alert('文件格式错误'); }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [update, pushHistory]);
  const handleClear = useCallback(() => {
    if (!confirm('确定要清空所有元素吗？')) return;
    pushHistory();
    update({ polylines: [], obstacles: [], spots: [], markings: [], intersections: [], selNode: null, selectedIds: new Set() });
  }, [update, pushHistory]);

  // ===== 智能路口：检测 + 生成/刷新标线集 =====
  const recomputeJunctions = useCallback((recordHistory: boolean) => {
    try {
      const s = stRef.current;
      const js = analyzeJunctions(s.polylines);
      const prev = s.intersections || [];
      const prevAuto = prev.filter(it => it.auto && !it.locked);
      const keep = prev.filter(it => !(it.auto && !it.locked)); // 手动 + locked 保留
      const used = new Set<string>();
      const built: Intersection[] = js.map(j => {
        const size = Math.max(56, Math.min(260, Math.max(...j.arms.map(a => a.width)) * 1.15 + (j.arms.length >= 4 ? 22 : 10)));
        const rotation = j.arms[0]?.heading ?? 0;
        const m = prevAuto.find(p => !used.has(p.id!) && Math.hypot(p.x - j.center.x, p.y - j.center.y) < Math.max(36, (p.size || 120) * 0.5));
        if (m) {
          used.add(m.id!);
          return { ...m, x: j.center.x, y: j.center.y, size, rotation, junctionType: j.type, arms: j.arms };
        }
        return { id: makeId('int'), x: j.center.x, y: j.center.y, size, rotation, bridge: false, elevation: 60, auto: true, junctionType: j.type, arms: j.arms };
      });
      const newIntersections = [...keep, ...built];
      // 自动标线：手动(无 junctionId)保留；locked 路口标线保留；其余(将重建/路口已消失)删除
      const keptMarkings = s.markings.filter(m => {
        if (!m.junctionId) return true;
        const it = newIntersections.find(x => x.id === m.junctionId);
        return !!it && !!it.locked;
      });
      const newMarkings: Marking[] = [...keptMarkings];
      built.forEach(it => {
        if (it.locked) return;
        const j = js.find(jj => Math.hypot(jj.center.x - it.x, jj.center.y - it.y) < 0.5);
        if (j) newMarkings.push(...buildJunctionMarkings(j, it.id!, { bridge: !!it.bridge }));
      });
      if (recordHistory) pushHistory();
      setSt(p => ({ ...p, intersections: newIntersections, markings: newMarkings }));
      dirtyRef.current = true;
      forceRender(v => v + 1);
    } catch (err) {
      // 兜底：路口分析/标线生成任何异常都不应让编辑器黑屏或写坏数据。
      console.error('[recomputeJunctions] 智能路口刷新失败，已跳过本次更新：', err);
    }
  }, [pushHistory]);

  const runAnalyze = useCallback(() => recomputeJunctions(true), [recomputeJunctions]);

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => recomputeJunctions(false), 120);
  }, [recomputeJunctions]);
  useEffect(() => { refreshRef.current = scheduleRefresh; }, [scheduleRefresh]);
  const handleBack = useCallback(() => { if (confirm('确定要返回吗？未保存的编辑将丢失。')) onBack(); }, [onBack]);

  // ===== 派生 =====
  const els = listElements(st);
  const selCount = st.selectedIds.size;
  const selPoly = selCount === 1 ? st.polylines.find(p => st.selectedIds.has(p.id)) : null;
  const selObs = selCount === 1 ? st.obstacles.find(o => st.selectedIds.has(o.id)) : null;
  const selSpot = selCount === 1 ? st.spots.find(sp => st.selectedIds.has(sp.id)) : null;
  const selMark = selCount === 1 ? st.markings.find(m => st.selectedIds.has(m.id)) : null;
  const selIntersection = selCount === 1 ? (st.intersections || []).find(it => st.selectedIds.has(it.id!)) : null;
  const selPointEl = selObs || selSpot;
  const isCar = !!selObs && (selObs.type === 'car' || !!selObs.modelKey);
  const drawing = drawRef.current;

  // 样式 token
  const glass = { background: 'rgba(20,20,22,0.82)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid var(--hairline-strong)', boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)' };

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: '#16181d', fontFamily: 'Rajdhani, system-ui, sans-serif' }}>
      {/* Canvas */}
      <div ref={wrapRef} className="absolute inset-0">
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          style={{
            cursor: st.tool === 'delete' ? 'not-allowed' : st.tool === 'place' ? 'copy'
              : (st.tool === 'road' || st.tool === 'wall') ? 'crosshair' : 'default',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenu}
        />
      </div>

      {/* ===== 顶部细条 ===== */}
      <div className="absolute top-0 left-0 right-0 h-12 flex items-center px-3 gap-2 z-20"
        style={{ background: 'rgba(10,10,11,0.72)' }}>
        <button onClick={handleBack} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-white/5 transition-colors">
          <ArrowLeft size={15} /> 返回
        </button>
        <div className="w-px h-5 bg-white/10" />
        <span className="text-[13px] font-bold tracking-wide text-[var(--text)]">地图编辑器</span>
        <span className="text-[10px] font-semibold tracking-[0.2em] px-2 py-0.5 rounded text-[var(--amber)]" style={{ background: 'var(--amber-dim)' }}>NODE EDIT</span>
        <div className="w-px h-5 bg-white/10 mx-1" />
        <button onClick={undo} title="撤销 (Ctrl+Z)" className="flex items-center justify-center w-8 h-8 rounded-md text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-white/5 transition-colors">
          <Undo2 size={16} />
        </button>
        <button onClick={redo} title="重做 (Ctrl+Shift+Z)" className="flex items-center justify-center w-8 h-8 rounded-md text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-white/5 transition-colors">
          <Redo2 size={16} />
        </button>
        <div className="flex-1" />
        <button onClick={runAnalyze} title="扫描交叉/共点道路，按国标自动生成路口连接件与标线"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-colors"
          style={{ background: 'var(--cyan-dim)', color: 'var(--cyan)', border: '1px solid rgba(34,211,238,0.4)' }}>
          <Wand2 size={14} /> 智能分析路口
        </button>
        {[
          { icon: Save, label: '保存', fn: handleSave },
          { icon: FolderOpen, label: '加载', fn: handleLoad },
          { icon: Download, label: '导出', fn: handleExport },
          { icon: Upload, label: '导入', fn: handleImport },
        ].map(b => (
          <button key={b.label} onClick={b.fn} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-white/5 transition-colors">
            <b.icon size={14} /> {b.label}
          </button>
        ))}
        <button onClick={() => onPlayLevel?.(buildLevelData())}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-colors"
          style={{ background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(34,197,94,0.4)' }}>
          <Play size={14} /> 在游戏中测试
        </button>
        <button onClick={handleClear} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-[var(--red)] hover:bg-[var(--red-dim)] transition-colors">
          <Eraser size={14} /> 清空
        </button>
      </div>

      {/* ===== 左侧面板 ===== */}
      <div className="absolute top-14 bottom-16 left-3 z-20 flex gap-2 items-stretch">
        <div className={`overflow-hidden transition-all duration-300 ${leftOpen ? 'w-[232px]' : 'w-0'}`}>
          <div className="w-[232px] h-full rounded-xl overflow-y-auto flex flex-col" style={glass}>
            <div className="p-3 flex-1">
              {/* 快速添加 */}
              <div className="text-[10px] font-bold tracking-[0.2em] text-[var(--text-mute)] mb-2">快速添加</div>
              <div className="grid grid-cols-3 gap-1.5 mb-3">
                {[
                  { label: '车位', fn: addSpot },
                  { label: '标线', fn: addMarking },
                  { label: '车辆', fn: addCar },
                ].map(b => (
                  <button key={b.label} onClick={b.fn} className="flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-bold text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
                    style={{ background: 'var(--panel-2)', border: '1px solid var(--hairline)' }}>
                    <Plus size={12} /> {b.label}
                  </button>
                ))}
              </div>

              {/* 标线类型：点击即在视图中心放置该类型 */}
              <div className="text-[10px] font-bold tracking-[0.2em] text-[var(--text-mute)] mb-2">标线类型</div>
              <div className="grid grid-cols-3 gap-1 mb-3">
                {([
                  ['line-solid', '实线'], ['line-dashed', '虚线'], ['line-double', '双黄'],
                  ['arrow-straight', '直行'], ['arrow-left', '左转'], ['arrow-right', '右转'],
                  ['arrow-merge-left', '左变道'], ['arrow-merge-right', '右变道'], ['stop', '停止'],
                  ['crosswalk', '斑马线'], ['roundabout', '环岛'], ['arrow-uturn', '掉头'],
                  ['channelize', '导流线'], ['yield', '让行'],
                ] as [Marking['type'], string][]).map(([t, l]) => (
                  <button key={t} onClick={() => { update({ markingType: t }); addMarking(t); }}
                    className="py-1.5 rounded-md text-[9px] font-bold transition-colors"
                    style={{ background: st.markingType === t ? 'var(--amber-dim)' : 'var(--panel-2)', color: st.markingType === t ? 'var(--amber)' : 'var(--text-mute)', border: '1px solid var(--hairline)' }}>
                    {l}
                  </button>
                ))}
              </div>

              {/* 模型库 */}
              <div className="text-[10px] font-bold tracking-[0.2em] text-[var(--text-mute)] mb-2">模型库</div>
              <div className="space-y-1 mb-3">
                {MODEL_LIBRARY.map(cat => (
                  <details key={cat.key} open={cat.key === 'cars'}>
                    <summary className="text-[11px] font-bold cursor-pointer py-1.5 px-2 rounded-lg hover:bg-white/5 text-[var(--text-dim)] list-none flex items-center justify-between">
                      <span>{cat.labelCN}</span>
                      <span className="text-[9px] text-[var(--text-mute)]">{cat.models.length}</span>
                    </summary>
                    <div className="grid grid-cols-2 gap-1 pl-1 pb-1 pt-1">
                      {cat.models.map(item => (
                        <button key={item.key}
                          onClick={() => update({ tool: 'place', placeItem: item, selectedIds: new Set() })}
                          className="text-left px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-colors"
                          style={{
                            background: st.placeItem?.key === item.key ? 'var(--amber-dim)' : 'var(--panel-2)',
                            color: st.placeItem?.key === item.key ? 'var(--amber)' : 'var(--text-dim)',
                            border: `1px solid ${st.placeItem?.key === item.key ? 'var(--amber-glow)' : 'var(--hairline)'}`,
                          }}>
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: item.defaultColor }} />
                            <span className="truncate">{item.name}</span>
                          </span>
                          <span className="text-[8px] text-[var(--text-mute)] font-mono">{item.defaultWidth}×{item.defaultHeight}</span>
                        </button>
                      ))}
                    </div>
                  </details>
                ))}
              </div>

              {/* 元素列表 */}
              <div className="text-[10px] font-bold tracking-[0.2em] text-[var(--text-mute)] mb-2">元素 · {els.length}</div>
              <div className="space-y-0.5">
                {els.map((el, i) => (
                  <button key={el.id ?? `${el.type}-${i}`}
                    onClick={(e) => {
                      if (e.shiftKey) {
                        const ns = new Set(st.selectedIds);
                        if (ns.has(el.id)) ns.delete(el.id); else ns.add(el.id);
                        update({ selectedIds: ns });
                      } else update({ selectedIds: new Set([el.id]) });
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors text-left"
                    style={{
                      background: st.selectedIds.has(el.id) ? 'rgba(34,211,238,0.12)' : 'transparent',
                      color: st.selectedIds.has(el.id) ? SEL_COLOR : 'var(--text-dim)',
                    }}>
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: el.color }} />
                    <span className="truncate">{el.label}</span>
                    <span className="ml-auto text-[9px] font-mono opacity-50">#{el.id ? el.id.slice(-4) : '····'}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <button onClick={() => setLeftOpen(v => !v)}
          className="w-6 rounded-lg flex items-center justify-center text-[var(--text-mute)] hover:text-[var(--text)] hover:bg-white/5 transition-colors self-center"
          style={glass}>
          {leftOpen ? '‹' : '›'}
        </button>
      </div>

      {/* ===== 右侧属性面板 ===== */}
      <div className="absolute top-14 bottom-16 right-3 z-20 flex gap-2 items-stretch">
        <button onClick={() => setRightOpen(v => !v)}
          className="w-6 rounded-lg flex items-center justify-center text-[var(--text-mute)] hover:text-[var(--text)] hover:bg-white/5 transition-colors self-center"
          style={glass}>
          {rightOpen ? '›' : '‹'}
        </button>
        <div className={`overflow-hidden transition-all duration-300 ${rightOpen ? 'w-[248px]' : 'w-0'}`}>
          <div className="w-[248px] h-full rounded-xl overflow-y-auto" style={glass}>
            <div className="p-3">
              <div className="text-[10px] font-bold tracking-[0.2em] text-[var(--text-mute)] mb-3">属性</div>

              {/* 批量节点（Shift/框选多个节点 → 一起调路宽/圆角） */}
              {st.selNodes.size >= 2 && (() => {
                const entries = ([...st.selNodes].map(k => {
                  const ci = k.lastIndexOf(':');
                  const id = k.slice(0, ci), idx = Number(k.slice(ci + 1));
                  const pl = st.polylines.find(p => p.id === id);
                  return pl && idx >= 0 && idx < pl.nodes.length ? { pl, idx } : null;
                }).filter(Boolean)) as { pl: Polyline; idx: number }[];
                if (entries.length < 2) return null;
                const widths = entries.map(e => e.pl.nodes[e.idx].width ?? e.pl.width);
                const radii = entries.map(e => nodeRadius(e.pl.nodes[e.idx], e.pl.cornerRadius));
                const avgW = Math.round(widths.reduce((a, b) => a + b, 0) / widths.length);
                const avgR = Math.round(radii.reduce((a, b) => a + b, 0) / radii.length);
                const applyWidth = (v: number) => { pushHistory(); entries.forEach(e => updateNode(e.pl.id, e.idx, { width: Math.max(6, Math.min(200, v)) })); };
                const applyRadius = (v: number) => { pushHistory(); entries.forEach(e => updateNode(e.pl.id, e.idx, { radius: Math.max(0, Math.min(1000, v)), sharp: v <= 0 })); };
                const resetAll = () => { pushHistory(); entries.forEach(e => updateNode(e.pl.id, e.idx, { radius: undefined, width: undefined, sharp: false })); };
                return (
                  <div className="rounded-lg p-2.5 space-y-1.5 mb-3" style={{ background: 'var(--panel-2)', border: `1px solid ${ACCENT}66` }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[var(--amber)]">已选 {entries.length} 个节点</span>
                      <button onClick={() => update({ selNodes: new Set(), selNode: null })}
                        className="text-[9px] text-[var(--text-mute)] hover:text-[var(--text)]">清除</button>
                    </div>
                    <PropRow label="路宽" value={avgW} onChange={applyWidth} step={2} onDragStart={pushHistory} />
                    <PropRow label="圆角" value={avgR} onChange={applyRadius} step={2} min={0} max={1000} onDragStart={pushHistory} />
                    <button onClick={resetAll}
                      className="w-full py-1.5 rounded-md text-[10px] font-bold text-[var(--text-mute)] hover:text-[var(--text)] transition-colors"
                      style={{ background: 'var(--panel-3)', border: '1px solid var(--hairline)' }}>
                      全部继承复位
                    </button>
                    <div className="text-[9px] text-[var(--text-mute)]">Shift+点击 / 框选多个节点后可批量调整</div>
                  </div>
                );
              })()}

              {/* 无选择 */}
              {selCount === 0 && (
                <div className="space-y-3">
                  <div>
                    <div className="text-[10px] font-bold text-[var(--text-dim)] mb-1.5">地图尺寸</div>
                    <PropRow label="宽" value={st.mapWidth} onChange={v => update({ mapWidth: v })} />
                    <PropRow label="高" value={st.mapHeight} onChange={v => update({ mapHeight: v })} />
                  </div>
                  <div className="border-t border-white/5 pt-3">
                    <div className="text-[10px] font-bold text-[var(--text-dim)] mb-1.5">绘制设置</div>
                    <PropRow label="路宽" value={st.roadWidth} onChange={v => update({ roadWidth: Math.max(20, Math.min(200, v)) })} step={10} />
                    <PropRow label="墙宽" value={st.wallWidth} onChange={v => update({ wallWidth: Math.max(6, Math.min(80, v)) })} step={2} />
                    <PropRow label="圆角" value={st.cornerRadius} onChange={v => update({ cornerRadius: Math.max(0, Math.min(1000, v)) })} step={2} min={0} max={1000} />
                    <div className="text-[9px] text-[var(--text-mute)] mt-1">默认倒圆角半径，0 = 直角</div>
                    <PropRow label="车道" value={st.defaultLanes} onChange={v => update({ defaultLanes: Math.max(1, Math.min(6, Math.round(v))) })} step={1} min={1} max={6} onDragStart={pushHistory} />
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-bold w-10 flex-shrink-0 text-[var(--text-mute)]">方向</span>
                      {(['two-way', 'one-way'] as RoadDirection[]).map(d => (
                        <button key={d} onClick={() => update({ defaultDirection: d })}
                          className="flex-1 py-1 rounded-md text-[10px] font-bold transition-colors"
                          style={{ background: st.defaultDirection === d ? 'var(--amber-dim)' : 'var(--panel-2)', color: st.defaultDirection === d ? 'var(--amber)' : 'var(--text-mute)', border: '1px solid var(--hairline)' }}>
                          {d === 'two-way' ? '双向' : '单向'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-white/5 pt-3 text-[10px] leading-relaxed text-[var(--text-mute)]">
                    <span className="text-[var(--text-dim)] font-bold">快捷键</span><br />
                    V 选择 · R 道路 · W 墙壁<br />
                    P 放置 · D 删除 · S 吸附<br />
                    <span className="text-[var(--text-dim)] font-bold">绘制</span><br />
                    逐点点击布点(规划) · 双击/Enter 确认<br />
                    按住 Shift 横/竖直铺设 · 节点轴对齐吸附<br />
                    仅限网格(地图)范围内铺设<br />
                    点击已有节点/端点 分支衔接<br />
                    <span className="text-[var(--text-dim)] font-bold">编辑</span><br />
                    点击节点 选中→面板调圆角(0=直角)<br />
                    右键节点 直角⇄圆角 · 拖拽节点 移动<br />
                    拖拽◇ 插入节点 · Alt+点击节点 删除<br />
                    Delete 删除选中<br />
                    <span className="text-[var(--text-dim)] font-bold">删除工具</span> 点路段逐段拆<br />
                    Ctrl+Z 撤销 · Ctrl+Shift+Z 重做<br />
                    Ctrl+C/V 复制粘贴 · Ctrl+A 全选<br />
                    空格+拖拽 平移 · 滚轮 缩放
                  </div>
                </div>
              )}

              {/* 多选 */}
              {selCount > 1 && (
                <div className="space-y-2">
                  <div className="text-[12px] font-bold text-[var(--text)]">已选中 {selCount} 个元素</div>
                  <button onClick={() => { copySelected(); pasteClipboard(); }}
                    className="w-full py-2 rounded-lg text-[11px] font-bold text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
                    style={{ background: 'var(--panel-2)', border: '1px solid var(--hairline)' }}>
                    批量复制
                  </button>
                  <button onClick={() => deleteElements(st.selectedIds)}
                    className="w-full py-2 rounded-lg text-[11px] font-bold text-[var(--red)] transition-colors"
                    style={{ background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.3)' }}>
                    批量删除
                  </button>
                </div>
              )}

              {/* 单选折线 */}
              {selPoly && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded" style={{ background: selPoly.color }} />
                    <span className="text-[13px] font-bold text-[var(--text)]">{selPoly.kind === 'road' ? '道路' : '墙壁'}</span>
                    <span className="text-[9px] font-mono text-[var(--text-mute)]">#{selPoly.id.slice(-4)}</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-[var(--text-dim)] mb-1">
                      <span>{selPoly.kind === 'road' ? '路宽' : '墙宽'}</span>
                      <span className="font-mono text-[var(--amber)]">{selPoly.width}</span>
                    </div>
                    <input type="range" min={selPoly.kind === 'road' ? 20 : 6} max={selPoly.kind === 'road' ? 200 : 80} step={2}
                      value={selPoly.width} onChange={e => updatePolyline(selPoly.id, { width: +e.target.value })}
                      className="w-full accent-[var(--amber)]" />
                  </div>
                  {selPoly.kind === 'road' && (
                    <>
                      <div>
                        <div className="text-[10px] font-bold text-[var(--text-dim)] mb-1">道路模型</div>
                        <div className="grid grid-cols-3 gap-1">
                          {([
                            { l: '单向1', w: 50, la: 1, d: 'one-way' as RoadDirection },
                            { l: '双向2', w: 70, la: 2, d: 'two-way' as RoadDirection },
                            { l: '单向2', w: 70, la: 2, d: 'one-way' as RoadDirection },
                            { l: '双向4', w: 120, la: 4, d: 'two-way' as RoadDirection },
                            { l: '单向3', w: 105, la: 3, d: 'one-way' as RoadDirection },
                            { l: '双向6', w: 180, la: 6, d: 'two-way' as RoadDirection },
                          ]).map(m => {
                            const active = selPoly.width === m.w && (selPoly.lanes ?? inferLanes(selPoly.width)) === m.la && (selPoly.direction || 'two-way') === m.d;
                            return (
                              <button key={m.l} onClick={() => { pushHistory(); updatePolyline(selPoly.id, { width: m.w, lanes: m.la, direction: m.d }); }}
                                className="py-1 rounded-md text-[9px] font-bold transition-colors"
                                style={{ background: active ? 'var(--amber-dim)' : 'var(--panel-2)', color: active ? 'var(--amber)' : 'var(--text-mute)', border: '1px solid var(--hairline)' }}>
                                {m.l}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <PropRow label="车道" value={selPoly.lanes ?? inferLanes(selPoly.width)}
                        onChange={v => { pushHistory(); updatePolyline(selPoly.id, { lanes: Math.max(1, Math.min(6, Math.round(v))) }); }} step={1} min={1} max={6} onDragStart={pushHistory} />
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold w-10 flex-shrink-0 text-[var(--text-mute)]">方向</span>
                        {(['two-way', 'one-way'] as RoadDirection[]).map(d => (
                          <button key={d} onClick={() => { pushHistory(); updatePolyline(selPoly.id, { direction: d }); }}
                            className="flex-1 py-1 rounded-md text-[10px] font-bold transition-colors"
                            style={{ background: (selPoly.direction || 'two-way') === d ? 'var(--amber-dim)' : 'var(--panel-2)', color: (selPoly.direction || 'two-way') === d ? 'var(--amber)' : 'var(--text-mute)', border: '1px solid var(--hairline)' }}>
                            {d === 'two-way' ? '双向' : '单向'}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <PropRow label="圆角" value={selPoly.cornerRadius ?? 24}
                    onChange={v => { pushHistory(); updatePolyline(selPoly.id, { cornerRadius: Math.max(0, Math.min(1000, v)) }); }} step={2} min={0} max={1000} />
                  {st.selNode && st.selNode.id === selPoly.id && st.selNode.idx < selPoly.nodes.length && (() => {
                    const nd = selPoly.nodes[st.selNode.idx];
                    const r = nd.radius !== undefined ? nd.radius : (selPoly.cornerRadius ?? 24);
                    const nw = nd.width !== undefined ? nd.width : selPoly.width;
                    return (
                      <div className="rounded-lg p-2 space-y-1" style={{ background: 'var(--panel-2)', border: `1px solid ${ACCENT}55` }}>
                        <div className="flex items-center justify-between text-[10px] font-bold text-[var(--amber)]">
                          <span>节点 #{st.selNode.idx + 1}</span>
                          <button onClick={() => { pushHistory(); updateNode(selPoly.id, st.selNode!.idx, { radius: undefined, width: undefined, sharp: false }); }}
                            className="text-[9px] text-[var(--text-mute)] hover:text-[var(--text)]">继承</button>
                        </div>
                        <PropRow label="圆角" value={r}
                          onChange={v => { pushHistory(); updateNode(selPoly.id, st.selNode!.idx, { radius: Math.max(0, Math.min(1000, v)), sharp: v <= 0 }); }} step={2} min={0} max={1000} onDragStart={pushHistory} />
                        <PropRow label="路宽" value={nw}
                          onChange={v => { pushHistory(); updateNode(selPoly.id, st.selNode!.idx, { width: Math.max(6, Math.min(200, v)) }); }} step={2} onDragStart={pushHistory} />
                        <div className="text-[9px] text-[var(--text-mute)]">圆角 0 = 直角 · 路宽可渐变</div>
                      </div>
                    );
                  })()}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[var(--text-dim)]">闭合环路</span>
                    <button onClick={() => updatePolyline(selPoly.id, { closed: !selPoly.closed })}
                      className="relative w-9 h-5 rounded-full transition-colors"
                      style={{ background: selPoly.closed ? 'var(--amber)' : 'var(--panel-3)' }}>
                      <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                        style={{ left: selPoly.closed ? 18 : 2 }} />
                    </button>
                  </div>
                  <div className="text-[10px] text-[var(--text-mute)]">节点数：<span className="font-mono text-[var(--text-dim)]">{selPoly.nodes.length}</span></div>
                  <button onClick={() => deleteElements(new Set([selPoly.id]))}
                    className="w-full py-2 rounded-lg text-[11px] font-bold text-[var(--red)] transition-colors"
                    style={{ background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.3)' }}>
                    删除
                  </button>
                </div>
              )}

              {/* 单论点状元素 */}
              {/* 单选标线 */}
              {selMark && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded" style={{ background: selMark.color }} />
                    <span className="text-[13px] font-bold text-[var(--text)]">标线</span>
                  </div>
                  {selMark.junctionId && (
                    <div className="rounded-lg p-2 space-y-1.5" style={{ background: 'var(--cyan-dim)', border: '1px solid rgba(34,211,238,0.25)' }}>
                      <div className="text-[9px] font-bold text-[var(--cyan)]">自动标线（随路口刷新）</div>
                      <button onClick={() => { pushHistory(); updateElement(selMark.id!, { junctionId: undefined }); }}
                        className="w-full py-1 rounded text-[9px] font-bold text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
                        style={{ background: 'var(--panel-2)', border: '1px solid var(--hairline)' }}>解除绑定 → 转为手动</button>
                    </div>
                  )}
                  <div>
                    <div className="text-[10px] font-bold text-[var(--text-dim)] mb-1">类型</div>
                    <div className="grid grid-cols-2 gap-1">
                      {([
                        ['line-solid', '实线'], ['line-dashed', '虚线'], ['line-double', '双黄线'],
                        ['arrow-straight', '直行'], ['arrow-left', '左转'], ['arrow-right', '右转'],
                        ['arrow-merge-left', '左变道'], ['arrow-merge-right', '右变道'], ['arrow-uturn', '掉头'],
                        ['stop', '停止线'], ['crosswalk', '斑马线'], ['roundabout', '环岛'],
                        ['channelize', '导流线'], ['yield', '让行'],
                      ] as [Marking['type'], string][]).map(([t, l]) => (
                        <button key={t} onClick={() => { pushHistory(); updateElement(selMark.id!, { type: t }); }}
                          className="py-1 rounded-md text-[9px] font-bold transition-colors"
                          style={{ background: selMark.type === t ? 'var(--amber-dim)' : 'var(--panel-2)', color: selMark.type === t ? 'var(--amber)' : 'var(--text-mute)', border: '1px solid var(--hairline)' }}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold w-10 flex-shrink-0 text-[var(--text-mute)]">颜色</span>
                    {['#ffffff', '#f5c842'].map(c => (
                      <button key={c} onClick={() => updateElement(selMark.id!, { color: c })}
                        className="w-6 h-6 rounded border" style={{ background: c, borderColor: selMark.color.toLowerCase() === c ? 'var(--amber)' : 'var(--hairline)' }} />
                    ))}
                    <input type="color" value={selMark.color} onChange={e => updateElement(selMark.id!, { color: e.target.value })}
                      className="w-7 h-6 rounded border-0 cursor-pointer bg-transparent" />
                  </div>
                  <PropRow label="X" value={Math.round(selMark.x)} onChange={v => updateElement(selMark.id!, { x: v })} />
                  <PropRow label="Y" value={Math.round(selMark.y)} onChange={v => updateElement(selMark.id!, { y: v })} />
                  <PropRow label="宽" value={Math.round(selMark.width)} onChange={v => updateElement(selMark.id!, { width: Math.max(1, v) })} />
                  <PropRow label="高" value={Math.round(selMark.height)} onChange={v => updateElement(selMark.id!, { height: Math.max(1, v) })} />
                  <PropRow label="角度°" value={Math.round((selMark.rotation * 180 / Math.PI) * 10) / 10} onChange={v => updateElement(selMark.id!, { rotation: v * Math.PI / 180 })} />
                  <PropRow label="图层" value={selMark.layer ?? 0} onChange={v => updateElement(selMark.id!, { layer: Math.max(0, Math.min(5, Math.round(v))) })} step={1} min={0} max={5} />
                  <div className="text-[9px] text-[var(--text-mute)] -mt-1">图层越高越靠上，避免被道路/桥面遮挡</div>
                  <button onClick={() => deleteElements(new Set([selMark.id!]))}
                    className="w-full py-2 rounded-lg text-[11px] font-bold text-[var(--red)] transition-colors mt-1"
                    style={{ background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.3)' }}>删除</button>
                </div>
              )}

              {/* 单选路口/桥面 */}
              {selIntersection && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Waypoints size={14} className="text-[var(--cyan)]" />
                    <span className="text-[13px] font-bold text-[var(--text)]">{selIntersection.bridge ? '桥面' : '路口'}</span>
                  </div>
                  {selIntersection.auto && (
                    <div className="rounded-lg p-2 space-y-1.5" style={{ background: 'var(--cyan-dim)', border: '1px solid rgba(34,211,238,0.25)' }}>
                      <div className="text-[9px] font-bold text-[var(--cyan)]">
                        自动路口 · {({ cross: '十字路口', T: 'T形路口', Y: 'Y形分岔', roundabout: '环形路口', ramp: '匝道/分合流', complex: '复杂路口' } as Record<string, string>)[selIntersection.junctionType || 'complex'] || '路口'}
                        {selIntersection.arms ? ` · ${selIntersection.arms.length} 臂` : ''}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-[var(--text-dim)]">锁定自动（接管不被刷新）</span>
                        <button onClick={() => updateElement(selIntersection.id!, { locked: !selIntersection.locked })}
                          className="relative w-9 h-5 rounded-full transition-colors"
                          style={{ background: selIntersection.locked ? 'var(--amber)' : 'var(--panel-3)' }}>
                          <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: selIntersection.locked ? 18 : 2 }} />
                        </button>
                      </div>
                      <button onClick={runAnalyze}
                        className="w-full py-1 rounded text-[9px] font-bold text-[var(--cyan)] transition-colors"
                        style={{ background: 'var(--panel-2)', border: '1px solid rgba(34,211,238,0.3)' }}>重新生成标线</button>
                    </div>
                  )}
                  {selIntersection.bridge && (
                    <div className="text-[9px] font-semibold leading-relaxed text-[var(--text-mute)] px-1">桥面路口为上跨直行，不生成路面标线（停止线/斑马线/箭头）。</div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[var(--text-dim)]">桥面(上跨)</span>
                    <button onClick={() => { pushHistory(); updateElement(selIntersection.id!, { bridge: !selIntersection.bridge }); }}
                      className="relative w-9 h-5 rounded-full transition-colors"
                      style={{ background: selIntersection.bridge ? 'var(--amber)' : 'var(--panel-3)' }}>
                      <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: selIntersection.bridge ? 18 : 2 }} />
                    </button>
                  </div>
                  <PropRow label="尺寸" value={selIntersection.size} onChange={v => { pushHistory(); updateElement(selIntersection.id!, { size: Math.max(20, v) }); }} step={10} onDragStart={pushHistory} />
                  {selIntersection.bridge && (
                    <PropRow label="高度" value={selIntersection.elevation ?? 60} onChange={v => { pushHistory(); updateElement(selIntersection.id!, { elevation: Math.max(10, v) }); }} step={5} onDragStart={pushHistory} />
                  )}
                  <PropRow label="角度°" value={Math.round(((selIntersection.rotation || 0) * 180 / Math.PI) * 10) / 10} onChange={v => updateElement(selIntersection.id!, { rotation: v * Math.PI / 180 })} />
                  <button onClick={() => deleteElements(new Set([selIntersection.id!]))}
                    className="w-full py-2 rounded-lg text-[11px] font-bold text-[var(--red)] transition-colors mt-1"
                    style={{ background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.3)' }}>删除</button>
                </div>
              )}

              {selPointEl && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded" style={{ background: (selPointEl as any).color }} />
                    <span className="text-[13px] font-bold text-[var(--text)]">
                      {selObs ? (selObs.type === 'car' ? '车辆' : selObs.modelKey ? '建筑' : '障碍') : selSpot ? '车位' : '标线'}
                    </span>
                  </div>
                  <PropRow label="X" value={Math.round(selPointEl.x)} onChange={v => updateElement(selPointEl.id!, { x: v })} />
                  <PropRow label="Y" value={Math.round(selPointEl.y)} onChange={v => updateElement(selPointEl.id!, { y: v })} />
                  {isCar ? (
                    <div className="text-[10px] px-2 py-1.5 rounded-lg text-[var(--text-mute)]" style={{ background: 'var(--panel-2)' }}>
                      🔒 固定尺寸 {Math.round(selPointEl.width)}×{Math.round(selPointEl.height)}
                    </div>
                  ) : (
                    <>
                      <PropRow label="宽" value={Math.round(selPointEl.width)} onChange={v => updateElement(selPointEl.id!, { width: Math.max(1, v) })} />
                      <PropRow label="高" value={Math.round(selPointEl.height)} onChange={v => updateElement(selPointEl.id!, { height: Math.max(1, v) })} />
                    </>
                  )}
                  <PropRow label="角度°" value={Math.round((selPointEl.rotation * 180 / Math.PI) * 10) / 10}
                    onChange={v => updateElement(selPointEl.id!, { rotation: v * Math.PI / 180 })} />
                  {selObs && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-[var(--text-mute)] w-10">颜色</span>
                      <input type="color" value={selObs.color} onChange={e => updateElement(selObs.id, { color: e.target.value })}
                        className="w-7 h-6 rounded border-0 cursor-pointer bg-transparent" />
                    </div>
                  )}
                  {selObs && (
                    <>
                      <PropRow label="图层" value={selObs.layer ?? 0} onChange={v => updateElement(selObs.id, { layer: Math.max(0, Math.min(5, Math.round(v))) })} step={1} min={0} max={5} />
                      <div className="text-[9px] text-[var(--text-mute)] -mt-1">图层越高越靠上，避免被道路/桥面遮挡</div>
                    </>
                  )}
                  <button onClick={() => deleteElements(new Set([selPointEl.id!]))}
                    className="w-full py-2 rounded-lg text-[11px] font-bold text-[var(--red)] transition-colors mt-1"
                    style={{ background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.3)' }}>
                    删除
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== 底部工具栏 ===== */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20">
        <div className="flex items-center gap-1 px-2 py-1.5 rounded-2xl" style={glass}>
          {([
            { tool: 'select' as Tool, icon: MousePointer2 },
            { tool: 'road' as Tool, icon: LandPlot },
            { tool: 'wall' as Tool, icon: Square },
            { tool: 'intersection' as Tool, icon: Waypoints },
            { tool: 'place' as Tool, icon: Package },
            { tool: 'delete' as Tool, icon: Trash2 },
          ]).map(({ tool, icon: Icon }) => {
            const active = st.tool === tool;
            return (
              <button key={tool} title={`${TOOL_META[tool].label} (${TOOL_META[tool].key})`}
                onClick={() => { update({ tool, placeItem: null }); cancelDraw(); }}
                className="relative flex items-center justify-center w-10 h-10 rounded-xl transition-all active:scale-95"
                style={{
                  background: active ? (tool === 'delete' ? 'var(--red-dim)' : 'var(--amber-dim)') : 'transparent',
                  color: active ? (tool === 'delete' ? 'var(--red)' : 'var(--amber)') : 'var(--text-dim)',
                  border: `1px solid ${active ? (tool === 'delete' ? 'rgba(239,68,68,0.4)' : 'var(--amber-glow)') : 'transparent'}`,
                }}>
                <Icon size={19} strokeWidth={2} />
                <span className="absolute -bottom-0.5 right-1 text-[7px] font-bold opacity-60">{TOOL_META[tool].key}</span>
              </button>
            );
          })}
          <div className="w-px h-7 bg-white/10 mx-1" />
          <button title="网格吸附 (S)" onClick={() => update({ snapEnabled: !st.snapEnabled })}
            className="flex items-center justify-center w-10 h-10 rounded-xl transition-all active:scale-95"
            style={{
              background: st.snapEnabled ? 'var(--green-dim)' : 'transparent',
              color: st.snapEnabled ? 'var(--green)' : 'var(--text-mute)',
              border: `1px solid ${st.snapEnabled ? 'rgba(34,197,94,0.4)' : 'transparent'}`,
            }}>
            <Magnet size={19} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* ===== 状态栏 ===== */}
      <div className="absolute bottom-0 left-0 right-0 h-6 flex items-center gap-4 px-3 z-10 text-[9px] font-bold font-mono"
        style={{ background: 'rgba(10,10,11,0.7)', color: 'var(--text-mute)' }}>
        <span className="text-[var(--text-dim)]">{TOOL_META[st.tool].label}</span>
        <span>吸附 {st.snapEnabled ? 'ON' : 'OFF'}</span>
        <span>X:{mousePos.x} Y:{mousePos.y}</span>
        <span>{Math.round(camRef.current.zoom * 100)}%</span>
        <span>选中 {selCount}</span>
        <span>元素 {els.length}</span>
        {drawing && <span className="text-[var(--amber)]">绘制中 · {drawing.nodes.length} 节点 · 双击完成</span>}
        <div className="flex-1" />
        <span>{st.mapWidth}×{st.mapHeight}</span>
      </div>

      {/* 放置提示 */}
      {st.tool === 'place' && st.placeItem && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 rounded-full text-xs font-bold pointer-events-none"
          style={{ background: 'var(--amber-dim)', color: 'var(--amber)', border: '1px solid var(--amber-glow)' }}>
          点击放置：{st.placeItem.name}（ESC 取消）
        </div>
      )}
    </div>
  );
};

// ===================== Sub Components =====================
function PropRow({ label, value, onChange, step = 1, min, max, onDragStart }: {
  label: string; value: number; onChange: (v: number) => void; step?: number;
  min?: number; max?: number; onDragStart?: () => void;
}) {
  const drag = useRef<{ x: number; v: number; committed: boolean } | null>(null);
  const clamp = (v: number) => { let r = v; if (min !== undefined) r = Math.max(min, r); if (max !== undefined) r = Math.min(max, r); return r; };
  const onDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    drag.current = { x: e.clientX, v: value, committed: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    if (dx === 0) return;
    if (!drag.current.committed) { onDragStart?.(); drag.current.committed = true; }
    const sens = e.shiftKey ? 0.1 : 1;
    const raw = drag.current.v + dx * step * sens;
    onChange(clamp(Math.round(raw / step) * step));
  };
  const onUp = (e: React.PointerEvent<HTMLSpanElement>) => {
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        title="左右拖拽调节 · Shift 微调"
        className="text-[10px] font-bold w-10 flex-shrink-0 text-[var(--text-mute)] cursor-ew-resize select-none hover:text-[var(--amber)] transition-colors">{label}</span>
      <input type="number" value={value} step={step} min={min} max={max}
        onChange={e => onChange(clamp(parseFloat(e.target.value) || 0))}
        className="flex-1 min-w-0 px-2 py-1 rounded-md text-[11px] font-mono font-bold outline-none focus:border-[var(--amber-glow)] transition-colors"
        style={{ background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--hairline)' }} />
    </div>
  );
}

export default MapEditor;
