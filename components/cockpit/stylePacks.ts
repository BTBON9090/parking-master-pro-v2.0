/**
 * 驾驶舱组件样式包（Cockpit Style Packs）
 * ========================================
 *
 * 把"车上的组件"——后视镜、仪表盘、方向盘、转向指示器——的全部视觉
 * 决策打包成一套可替换的样式包。HUD 组件（components/cockpit/CockpitParts.tsx）
 * 只读取样式包内的令牌渲染，不硬编码颜色 / 阴影。
 *
 * 后续规划：为不同车型提供多套样式包（运动 / 豪华 / 越野……），
 * 玩家可在设置中自由选择，获得个性化的座舱体验。当前先落地一套
 * 默认包 "APEX GT"，架构上支持任意数量扩展。
 *
 * 注意：样式包只管"长相"，后视镜的位置 / 角度 / 成像等参数调校
 * （settings.mirrorAdjustments）与功能逻辑永远不变。
 */

import { CSSProperties } from 'react';

// ---------- 后视镜样式 ----------
export interface MirrorPackStyle {
  /** 外框（边框、圆角、投影）。圆角必须与渲染层角部遮罩保持一致（侧镜 16 / 中镜 14）。 */
  frame: CSSProperties;
  /** 镜面玻璃质感覆盖层（纯色微反光，pointer-events 必须为空）。 */
  glassOverlay: CSSProperties;
  /** 标签芯片样式。 */
  label: CSSProperties;
  /** 角部装饰色（ amber corner tick ）。 */
  cornerAccent: string;
}

// ---------- 仪表盘样式 ----------
export interface DashboardPackStyle {
  /** 整个座舱模块外壳（含两端的方向盘舱）。 */
  housing: CSSProperties;
  /** 中央显示屏区域。 */
  screen: CSSProperties;
  /** 环境氛围灯颜色（边缘辉光）。 */
  ambientColor: string;
  /** 时速数字颜色。 */
  speedColor: string;
  /** 单位 / 次要文字颜色。 */
  captionColor: string;
  /** 转速条轨道 / 填充 / 红区颜色。 */
  rpmTrack: string;
  /** 低转区刻度色（拐角转速表的冷色区）。 */
  rpmLow: string;
  rpmFill: string;
  rpmRedline: string;
  /** 挡位颜色：倒挡 / 空挡 / 前进挡。 */
  gearReverse: string;
  gearNeutral: string;
  gearDrive: string;
}

// ---------- 方向盘样式 ----------
export interface SteeringWheelPackStyle {
  /** 轮圈（随输入角度旋转的部分）。 */
  rim: CSSProperties;
  /** 轮辐。 */
  spoke: CSSProperties;
  /** 中心盖。 */
  hub: CSSProperties;
  /** 12 点标记色。 */
  markerColor: string;
  /** 底座（不旋转的舱体）。 */
  pod: CSSProperties;
}

// ---------- 转向指示器样式 ----------
export interface TurnSignalPackStyle {
  /** 左 / 右方向点亮颜色。 */
  leftColor: string;
  rightColor: string;
  /** 熄灭段颜色。 */
  offColor: string;
  /** 点亮辉光。 */
  glow: string;
  /** 打死方向时的闪烁颜色。 */
  lockColor: string;
}

export interface CockpitStylePack {
  id: string;
  /** 展示名称（中英）。 */
  nameCN: string;
  nameEN: string;
  /** 风格描述。 */
  descCN: string;
  descEN: string;
  /** 适用车型提示（未来按车型绑定）。 */
  forVehicles: string[];
  mirrors: MirrorPackStyle;
  dashboard: DashboardPackStyle;
  steeringWheel: SteeringWheelPackStyle;
  turnSignals: TurnSignalPackStyle;
}

// ============================================================
// 默认样式包：APEX GT
// 深色科技座舱 + 琥珀氛围光，参考新能源性能车（YU7 / 理想）的
// 贯穿式屏幕与纤细氛围灯语言。
// ============================================================
const APEX_GT: CockpitStylePack = {
  id: 'apex-gt',
  nameCN: '巅峰 GT',
  nameEN: 'APEX GT',
  descCN: '深色科技座舱 · 琥珀氛围光 · 贯穿式显示',
  descEN: 'Dark tech cockpit · amber ambient light · pillar-to-pillar display',
  forVehicles: ['SEDAN', 'SUV', 'SPORTS', 'TRUCK'],

  mirrors: {
    frame: {
      // 关键：背景必须透明！镜面图像由 WebGL 渲染在下层 canvas 的
      // scissor viewport 里，CSS 镜框只做"外壳"（边框 + 投影 + 玻璃反光）。
      // 填充不透明底色会把镜像整个盖住 —— 后视镜因此完全不显示。
      background: 'transparent',
      border: '2px solid #17181c',
      boxShadow:
        '0 10px 28px rgba(0,0,0,0.72), ' +
        'inset 0 0 0 1px rgba(255,255,255,0.10), ' +
        '0 0 0 1px rgba(0,0,0,0.85)',
    },
    glassOverlay: {
      background: 'rgba(255,255,255,0.025)',
    },
    label: {
      background: 'rgba(6,7,9,0.72)',
      color: 'rgba(244,244,245,0.66)',
      border: '1px solid rgba(255,255,255,0.10)',
      backdropFilter: 'blur(4px)',
    },
    cornerAccent: '#f59e0b',
  },

  dashboard: {
    housing: {
      background: '#15161b',
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow:
        '0 18px 44px rgba(0,0,0,0.68), ' +
        'inset 0 1px 0 rgba(255,255,255,0.06)',
    },
    screen: {
      background: '#0b0c10',
      boxShadow: 'inset 0 2px 14px rgba(0,0,0,0.75)',
    },
    ambientColor: '#f59e0b',
    speedColor: '#f4f4f5',
    captionColor: '#71717a',
    rpmTrack: 'rgba(255,255,255,0.08)',
    rpmLow: '#8fd3ff',
    rpmFill: '#f59e0b',
    rpmRedline: '#ef4444',
    gearReverse: '#ef4444',
    gearNeutral: '#a1a1aa',
    gearDrive: '#22c55e',
  },

  steeringWheel: {
    rim: {
      // 空心圆环：不填充底色，中心透明 —— 轮辐与圆环层次分明。
      // 环宽由组件按尺寸计算（geometry），颜色 / 阴影由样式包决定。
      background: 'transparent',
      borderStyle: 'solid',
      borderColor: '#2a2b31',
      boxShadow:
        'inset 0 2px 5px rgba(255,255,255,0.10), ' +
        'inset 0 -4px 8px rgba(0,0,0,0.75), ' +
        '0 8px 22px rgba(0,0,0,0.55)',
    },
    spoke: {
      background: '#26272d',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09), 0 2px 6px rgba(0,0,0,0.5)',
    },
    hub: {
      background: '#292a30',
      border: '1px solid rgba(0,0,0,0.9)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
    },
    markerColor: '#ef3340',
    pod: {
      background: '#111216',
      border: '1px solid rgba(255,255,255,0.07)',
      boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.7)',
    },
  },

  turnSignals: {
    leftColor: '#22c55e',
    rightColor: '#f59e0b',
    offColor: 'rgba(255,255,255,0.07)',
    glow: '0 0 6px currentColor',
    lockColor: '#ef4444',
  },
};

// ============================================================
// 注册表 + 解析
// ============================================================
export const COCKPIT_STYLE_PACKS: Record<string, CockpitStylePack> = {
  [APEX_GT.id]: APEX_GT,
};

export const DEFAULT_COCKPIT_PACK_ID = APEX_GT.id;

/** 按 id 取样式包；未知 id 回退默认包（永远有值，HUD 不需要判空）。 */
export function resolveCockpitPack(id?: string): CockpitStylePack {
  if (id && COCKPIT_STYLE_PACKS[id]) return COCKPIT_STYLE_PACKS[id];
  return APEX_GT;
}
