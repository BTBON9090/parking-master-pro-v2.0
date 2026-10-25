/**
 * 驾驶舱组件库 —— 样式包的"消费者"
 * =================================
 * 后视镜、方向盘、转向指示器、仪表盘全部从这里渲染，视觉令牌来自
 * components/cockpit/stylePacks.ts 中激活的样式包。
 *
 * 铁律：
 *  - 后视镜的位置 / 尺寸 / 成像参数只读 settings.mirrorAdjustments，
 *    与渲染层（GameCanvas3D 的 scissor viewport + 圆角遮罩）逐像素对齐，
 *    样式包绝不改变这些几何数值。
 *  - 组件本身不含功能逻辑（转速平滑、停车判定等仍在 UIOverlay / GameCanvas3D）。
 */

import React from 'react';
import { MirrorAdjustment, MirrorId } from '../../types';
import { CockpitStylePack } from './stylePacks';

// ============================================================
// 后视镜框（视觉外壳；镜面图像由 WebGL 渲染在 canvas 上）
// ============================================================

interface SideMirrorFrameProps {
  id: Exclude<MirrorId, 'centre'>;
  pack: CockpitStylePack;
  adjustment: MirrorAdjustment;
  /** 左槽位 / 右槽位（受 mirrorSwapSides 影响，由调用方算好）。 */
  slot: 'left' | 'right';
  label: string;
}

export const SideMirrorFrame: React.FC<SideMirrorFrameProps> = ({ id, pack, adjustment, slot, label }) => (
  <div
    className="side-mirror-frame absolute z-30 w-[28vw] min-w-[280px] max-w-[440px] aspect-[2.65/1] rounded-[16px] overflow-hidden pointer-events-none"
    style={{
      // —— 几何：与渲染层 viewport 严格一致，禁止随样式包改变 ——
      bottom: Math.max(8, 18 - adjustment.screenY),
      left: slot === 'left' ? 24 + adjustment.screenX : undefined,
      right: slot === 'right' ? 24 - adjustment.screenX : undefined,
      // —— 视觉：样式包 ——
      ...pack.mirrors.frame,
    }}
  >
    {/* 玻璃反光层 */}
    <div data-mirror-glass={id} className="absolute inset-0 rounded-[14px] pointer-events-none" style={pack.mirrors.glassOverlay} />
    {/* 顶部角落氛围点缀 */}
    <div
      className="absolute top-0 left-3 right-3 h-px pointer-events-none"
      style={{ background: `${pack.mirrors.cornerAccent}66` }}
    />
    {/* 标签芯片 */}
    <span
      className="absolute top-1.5 left-2.5 mono text-[8px] font-bold tracking-[0.22em] px-1.5 py-0.5 rounded-md"
      style={pack.mirrors.label}
    >
      {label}
    </span>
  </div>
);

interface CentreMirrorFrameProps {
  pack: CockpitStylePack;
  adjustment: MirrorAdjustment;
  label: string;
  /** 贴在镜框正下方、与镜同宽的组件（转向指示条）。 */
  signals?: React.ReactNode;
}

export const CentreMirrorFrame: React.FC<CentreMirrorFrameProps> = ({ pack, adjustment, label, signals }) => (
  <div
    className="centre-mirror-frame absolute left-1/2 -translate-x-1/2 z-30 w-[26.5vw] min-w-[272px] max-w-[430px] pointer-events-none"
    style={{
      // —— 几何：与渲染层 viewport 严格一致 ——
      top: Math.max(8, 76 + adjustment.screenY),
      marginLeft: adjustment.screenX,
    }}
  >
    <div className="relative w-full aspect-[3.7/1] rounded-[15px] overflow-hidden" style={pack.mirrors.frame}>
      <div data-mirror-glass="centre" className="absolute inset-0 rounded-[13px] pointer-events-none" style={pack.mirrors.glassOverlay} />
      <div
        className="absolute top-0 left-4 right-4 h-px pointer-events-none"
        style={{ background: `${pack.mirrors.cornerAccent}66` }}
      />
      <span
        className="absolute top-1 left-2 mono text-[8px] font-bold tracking-[0.2em] px-1.5 py-0.5 rounded-md"
        style={pack.mirrors.label}
      >
        {label}
      </span>
    </div>
    {/* 转向指示条：紧贴镜框底边缘，与镜同宽 */}
    {signals && (
      <div
        className="mt-[5px] w-full h-[24px] px-4 py-[3px] rounded-md"
        style={{
          background: 'rgba(3,6,11,0.90)',
          border: '1px solid rgba(255,255,255,0.13)',
          boxShadow: '0 7px 18px rgba(0,0,0,0.52), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {signals}
      </div>
    )}
  </div>
);

// ============================================================
// 方向盘（左右各一，随输入角度旋转）
// 空心圆环 + 三辐条：中心透明，圆环与把手层次分明。
// ============================================================

interface SteeringWheelProps {
  pack: CockpitStylePack;
  angleDeg: number;
  size?: number;
}

export const SteeringWheel: React.FC<SteeringWheelProps> = ({ pack, angleDeg, size = 96 }) => {
  const w = pack.steeringWheel;
  const wheelRef = React.useRef<HTMLDivElement>(null);
  const targetAngleRef = React.useRef(angleDeg);
  const displayedAngleRef = React.useRef(angleDeg);
  const ringWidth = Math.max(6, Math.round(size * 0.088));
  const absoluteTurns = Math.min(540, Math.abs(angleDeg));
  // Each 180° of steering travel has its own restrained material cue. The
  // marker remains red, while the rim tells the driver which half-turn they
  // are currently using without turning the wheel into a warning lamp.
  const phase = absoluteTurns <= 180 ? 0 : absoluteTurns <= 360 ? 1 : 2;
  const rimTint = phase === 0 ? '#2a2b31' : phase === 1 ? '#c99b16' : '#cf3346';
  const rimGlow = phase === 0
    ? 'rgba(0,0,0,0)'
    : phase === 1
      ? 'rgba(250,204,21,0.42)'
      : 'rgba(255,51,68,0.46)';

  React.useEffect(() => {
    targetAngleRef.current = angleDeg;
  }, [angleDeg]);

  React.useEffect(() => {
    let frame = 0;
    let previousTime = performance.now();
    const updateWheel = (time: number) => {
      const dt = Math.min(0.05, Math.max(0, (time - previousTime) / 1000));
      previousTime = time;
      // Exponential damping is frame-rate independent and never overshoots.
      // It also absorbs tiny input quantisation without delaying deliberate
      // steering changes or altering the physical steering value.
      const blend = 1 - Math.exp(-22 * dt);
      const difference = targetAngleRef.current - displayedAngleRef.current;
      displayedAngleRef.current = Math.abs(difference) < 0.02
        ? targetAngleRef.current
        : displayedAngleRef.current + difference * blend;
      if (wheelRef.current) {
        wheelRef.current.style.transform = `rotate(${displayedAngleRef.current.toFixed(3)}deg)`;
      }
      frame = requestAnimationFrame(updateWheel);
    };
    frame = requestAnimationFrame(updateWheel);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      ref={wheelRef}
      className="relative shrink-0"
      style={{
        width: size,
        height: size,
        transform: `rotate(${angleDeg}deg)`,
        willChange: 'transform',
      }}
    >
      {/* 标准圆形轮圈，颜色按半圈行程分级 */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          borderWidth: ringWidth,
          ...w.rim,
          borderColor: rimTint,
          boxShadow:
            `inset 0 2px 5px rgba(255,255,255,0.10), ` +
            `inset 0 -4px 8px rgba(0,0,0,0.75), ` +
            `0 8px 22px rgba(0,0,0,0.55), 0 0 14px ${rimGlow}`,
          transition: 'border-color 160ms ease, box-shadow 160ms ease',
        }}
      />
      {/* 水平辐条：比下方竖辐更厚、更有承托感 */}
      <div
        className="absolute"
        style={{
          left: ringWidth * 0.58,
          right: ringWidth * 0.58,
          top: '50%',
          height: size * 0.17,
          transform: 'translateY(-50%)',
          borderRadius: size * 0.065,
          ...w.spoke,
        }}
      />
      {/* 下辐条 */}
      <div
        className="absolute"
        style={{
          bottom: ringWidth * 0.58,
          left: '50%',
          width: size * 0.075,
          height: size * 0.48 - ringWidth * 0.58,
          transform: 'translateX(-50%)',
          borderRadius: size * 0.04,
          ...w.spoke,
        }}
      />
      {/* 上辐条：驾驶室/外部统一四辐偏好 */}
      <div
        className="absolute"
        style={{
          top: ringWidth * 0.58,
          left: '50%',
          width: size * 0.075,
          height: size * 0.20 - ringWidth * 0.58,
          transform: 'translateX(-50%)',
          borderRadius: size * 0.04,
          ...w.spoke,
        }}
      />
      {/* 横向中心盖，对应参考图的宽大气囊区 */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center justify-between px-[10%]"
        style={{ width: size * 0.52, height: size * 0.31, borderRadius: size * 0.105, ...w.hub }}
      >
        <span className="block w-[13%] aspect-square rounded-sm" style={{ background: 'rgba(255,255,255,0.12)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.65)' }} />
        <span className="block w-[13%] aspect-square rounded-sm" style={{ background: 'rgba(255,255,255,0.12)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.65)' }} />
      </div>
      {/* 12 点标记（骑在圆环上） */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-sm z-20"
        style={{
          top: 0,
          width: size * 0.065,
          height: ringWidth * 1.12,
          background: w.markerColor,
          boxShadow: `0 0 8px ${w.markerColor}`,
        }}
      />
    </div>
  );
};

// ============================================================
// 转向指示器（分段箭头，指示方向 + 幅度，打死闪烁）
// 每侧 12 格，每 4 格对应方向盘半圈 180°，三组依次对应深色、黄色、红色。
// ============================================================

interface TurnSignalGaugeProps {
  pack: CockpitStylePack;
  /** -1 .. 1（负 = 左，正 = 右） */
  normalizedSteer: number;
  blink: boolean;
}

export const TurnSignalGauge: React.FC<TurnSignalGaugeProps> = ({
  pack,
  normalizedSteer,
  blink,
}) => {
  const HALF_TURNS = 3; // 单侧 1.5 圈 = 3 个半圈
  const CELLS_PER_HALF_TURN = 4;
  const CELLS_PER_SIDE = HALF_TURNS * CELLS_PER_HALF_TURN;
  const activeCells = Math.min(
    CELLS_PER_SIDE,
    Math.ceil(Math.abs(normalizedSteer) * CELLS_PER_SIDE - 0.001),
  );
  const phaseColors = [
    { fill: '#f7f8fa', glow: 'rgba(255,255,255,0.62)', edge: 'rgba(255,255,255,0.96)' },
    { fill: '#ffd21c', glow: 'rgba(255,210,28,0.66)', edge: 'rgba(255,238,132,0.96)' },
    { fill: '#ff3344', glow: 'rgba(255,51,68,0.68)', edge: 'rgba(255,158,166,0.96)' },
  ];

  const renderSide = (side: 'left' | 'right') => {
    const isActiveSide = side === 'left' ? normalizedSteer < 0 : normalizedSteer > 0;
    const groups = Array.from({ length: HALF_TURNS }, (_, groupIndex) => {
      const palette = phaseColors[groupIndex];
      return (
        <div
          key={groupIndex}
          className={`flex-1 flex ${side === 'left' ? 'flex-row-reverse' : 'flex-row'} items-center gap-[3px]`}
        >
          {Array.from({ length: CELLS_PER_HALF_TURN }, (_, cellIndex) => {
            const absoluteIndex = groupIndex * CELLS_PER_HALF_TURN + cellIndex;
            const isLit = isActiveSide && absoluteIndex < activeCells;
            const atLock = absoluteIndex === CELLS_PER_SIDE - 1 && isLit;
            return (
              <div
                key={absoluteIndex}
                className="flex-1 h-[17px] min-w-[4px] transition-all duration-75"
                style={{
                  clipPath: side === 'left'
                    ? 'polygon(100% 0, 30% 0, 0 50%, 30% 100%, 100% 100%, 70% 50%)'
                    : 'polygon(0 0, 70% 0, 100% 50%, 70% 100%, 0 100%, 30% 50%)',
                  background: isLit ? palette.fill : pack.turnSignals.offColor,
                  boxShadow: isLit
                    ? `inset 0 0 0 1px ${palette.edge}, 0 0 8px ${palette.glow}`
                    : 'inset 0 0 0 1px rgba(255,255,255,0.05)',
                  opacity: atLock && blink ? 0.28 : 1,
                  transform: atLock ? 'scaleY(1.12)' : undefined,
                }}
              />
            );
          })}
        </div>
      );
    });
    return (
      // Three groups per side, four cells per group. The larger group gap is
      // the half-turn marker; the smaller cell gap preserves fine resolution.
      <div className={`flex-1 flex ${side === 'left' ? 'flex-row-reverse' : 'flex-row'} items-center gap-[8px]`}>
        {groups}
      </div>
    );
  };

  return (
    <div className="flex items-center gap-3 w-full">
      {renderSide('left')}
      <div
        className="h-4 w-[2px] rounded-full shrink-0"
        style={{ background: pack.dashboard.ambientColor, boxShadow: `0 0 6px ${pack.dashboard.ambientColor}` }}
      />
      {renderSide('right')}
    </div>
  );
};

// ============================================================
// 双机械圆表 + 中央信息屏
// 参考传统驾驶舱的信息层级：左转速、右时速，中间只保留
// 数字车速、挡位和训练状态。刻度、指针和数字共用同一实时数据源。
// ============================================================

interface DashboardScreenProps {
  pack: CockpitStylePack;
  speedKmh: number;
  /** 平滑后的转速（rpm）。 */
  rpm: number;
  redlineRpm: number;
  gear: number; // -1 R, 0 N, 1-5
  singleSpeed?: boolean;
  rpmCaption: string;
  speedCaption: string;
  /** First-person view already contains a physical wheel; hide the two UI
   *  wheels to avoid a triple-wheel overlay. */
  showSteeringWheels?: boolean;
}

interface AnalogDialProps {
  value: number;
  max: number;
  majorStep: number;
  unit: string;
  caption: string;
  accent: string;
  redFrom?: number;
  valueFormatter?: (value: number) => string;
}

const AnalogDial: React.FC<AnalogDialProps> = ({
  value, max, majorStep, unit, caption, accent, redFrom = Infinity, valueFormatter = value => String(Math.round(value)),
}) => {
  const cx = 76;
  const cy = 76;
  // SVG y 轴向下：135° 是左下方。从左下顺时针扫过 270°，
  // 让零点与真实车速 / 转速表一样落在左下，红区落在右下。
  const start = 135;
  const sweep = 270;
  const clamped = Math.max(0, Math.min(max, value));
  const polar = (radius: number, degrees: number) => {
    const radians = degrees * Math.PI / 180;
    return { x: cx + Math.cos(radians) * radius, y: cy + Math.sin(radians) * radius };
  };
  const needleAngle = start + (clamped / Math.max(1, max)) * sweep;
  const needleTip = polar(48, needleAngle);
  const ticks = Array.from({ length: 49 }, (_, index) => {
    const fraction = index / 48;
    const tickValue = fraction * max;
    const angle = start + fraction * sweep;
    const major = Math.abs(tickValue / majorStep - Math.round(tickValue / majorStep)) < 0.075;
    const outer = polar(65, angle);
    const inner = polar(major ? 56 : 60, angle);
    return { index, tickValue, major, outer, inner };
  });
  const labels = Array.from({ length: Math.floor(max / majorStep) + 1 }, (_, index) => index * majorStep);

  return (
    <div className="relative w-[148px] h-[148px] shrink-0">
      <svg viewBox="0 0 152 152" className="w-full h-full" aria-label={`${caption} ${valueFormatter(clamped)} ${unit}`}>
        <defs>
          <filter id={`needle-glow-${caption}`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="1.8" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx={cx} cy={cy} r="72" fill="#080b11" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
        <circle cx={cx} cy={cy} r="66.5" fill="none" stroke={accent} strokeOpacity="0.54" strokeWidth="2" />
        <circle cx={cx} cy={cy} r="62.5" fill="none" stroke="rgba(100,172,255,0.12)" strokeWidth="6" />
        {ticks.map(tick => (
          <line
            key={tick.index}
            x1={tick.inner.x} y1={tick.inner.y} x2={tick.outer.x} y2={tick.outer.y}
            stroke={tick.tickValue >= redFrom ? '#ef3340' : tick.major ? '#eef6ff' : 'rgba(224,238,255,0.48)'}
            strokeWidth={tick.major ? 2.1 : 1}
            strokeLinecap="round"
          />
        ))}
        {labels.map(label => {
          const angle = start + (label / Math.max(1, max)) * sweep;
          const point = polar(47, angle);
          return (
            <text key={label} x={point.x} y={point.y + 3} textAnchor="middle"
                  fontSize={max > 20 ? 8.5 : 10} fontWeight="700" fontFamily="Rajdhani, sans-serif"
                  fill={label >= redFrom ? '#ff5260' : 'rgba(244,248,255,0.90)'}>
              {valueFormatter(label)}
            </text>
          );
        })}
        <text x={cx} y="49" textAnchor="middle" fontSize="7.2" fontWeight="700" letterSpacing="1.1"
              fill="rgba(180,205,232,0.55)">{caption}</text>
        <text x={cx} y="105" textAnchor="middle" fontSize="7" fontWeight="700" letterSpacing="0.8"
              fill="rgba(180,205,232,0.44)">{unit}</text>
        <line x1={cx} y1={cy} x2={needleTip.x} y2={needleTip.y} stroke="#f7fbff" strokeWidth="3.2"
              strokeLinecap="round" filter={`url(#needle-glow-${caption})`} />
        <circle cx={cx} cy={cy} r="7.5" fill="#111722" stroke="rgba(255,255,255,0.30)" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r="2.6" fill="#dcecff" />
      </svg>
    </div>
  );
};

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  pack,
  speedKmh,
  rpm,
  redlineRpm,
  gear,
  singleSpeed = false,
  rpmCaption,
  speedCaption,
}) => {
  const d = pack.dashboard;
  const gearLabel = gear === -1 ? 'R' : gear === 0 ? 'N' : singleSpeed ? 'D' : String(gear);
  const gearColor = gear === -1 ? d.gearReverse : gear === 0 ? d.gearNeutral : d.gearDrive;
  const rpmMax = Math.max(6, Math.ceil(redlineRpm / 1000));

  return (
    <div className="relative w-[422px] h-[154px] flex items-center justify-center gap-1.5 px-2" style={d.screen}>
      <AnalogDial
        value={rpm / 1000}
        max={rpmMax}
        majorStep={1}
        unit={rpmCaption}
        caption="RPM"
        accent={d.rpmLow}
        redFrom={redlineRpm / 1000 * 0.9}
        valueFormatter={value => String(Math.round(value))}
      />

      <div className="relative h-[112px] w-[98px] shrink-0 flex flex-col items-center justify-between py-2 rounded-[12px] overflow-hidden"
           style={{ background: '#0d1f33', border: '1px solid rgba(132,188,255,0.36)', boxShadow: 'inset 0 0 18px rgba(75,146,255,0.16)' }}>
        <div className="mono text-[7px] font-bold tracking-[0.18em]" style={{ color: 'rgba(200,225,255,0.66)' }}>DRIVE TRAINING</div>
        <div className="flex items-end gap-1">
          <span className="mono text-[38px] font-black tabular-nums leading-none" style={{ color: d.speedColor, textShadow: '0 0 16px rgba(143,211,255,0.28)' }}>
            {Math.round(Math.abs(speedKmh))}
          </span>
          <span className="mono text-[7px] font-bold mb-1" style={{ color: d.captionColor }}>{speedCaption}</span>
        </div>
        <div className="w-[70%] h-px" style={{ background: 'rgba(143,211,255,0.55)' }} />
        <div className="flex items-center gap-2">
          <span className="mono text-[7px] font-bold tracking-[0.18em]" style={{ color: d.captionColor }}>GEAR</span>
          <span className="mono text-[28px] font-black leading-none" style={{ color: gearColor, textShadow: `0 0 12px ${gearColor}66` }}>{gearLabel}</span>
        </div>
      </div>

      <AnalogDial
        value={Math.abs(speedKmh)}
        max={240}
        majorStep={40}
        unit={speedCaption}
        caption="SPEED"
        accent="#5ca8ff"
        valueFormatter={value => String(Math.round(value))}
      />
    </div>
  );
};

// ============================================================
// 完整座舱总成：方向盘 ×2 在仪表盘【之外】两侧环抱，
// 不再包进外壳里；外壳只装中央显示屏。
// ============================================================

interface CockpitClusterProps {
  pack: CockpitStylePack;
  steeringAngleDeg: number;
  normalizedSteer: number;
  blink: boolean;
  speedKmh: number;
  rpm: number;
  redlineRpm: number;
  gear: number;
  singleSpeed?: boolean;
  rpmCaption: string;
  speedCaption: string;
  /** First-person view already contains a physical wheel; hide the two UI
   *  wheels to avoid a triple-wheel overlay. */
  showSteeringWheels?: boolean;
}

export const CockpitCluster: React.FC<CockpitClusterProps> = (props) => {
  const { pack, showSteeringWheels = true } = props;
  return (
    <div className="relative flex items-center pt-7">
      {/* 方向盘幅度指示保留在仪表正上方 */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[422px] h-[24px] px-4 py-[3px] rounded-md"
           style={{ background: 'rgba(3,6,11,0.90)', border: '1px solid rgba(255,255,255,0.13)', boxShadow: '0 7px 18px rgba(0,0,0,0.52), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
        <TurnSignalGauge pack={pack} normalizedSteer={props.normalizedSteer} blink={props.blink} />
      </div>

      {/* 左方向盘（外壳之外，前层压住房檐） */}
      {showSteeringWheels && (
        <div className="relative z-10" style={{ marginRight: 12 }}>
          <SteeringWheel pack={pack} angleDeg={props.steeringAngleDeg} size={92} />
        </div>
      )}

      {/* 双圆表仪表舱外壳 */}
      <div
        className="relative overflow-hidden"
        style={{
          ...pack.dashboard.housing,
          borderRadius: '28px 28px 15px 15px',
        }}
      >
        {/* 顶部冷蓝氛围灯带 */}
        <div
          className="absolute top-0 left-10 right-10 h-[2px] rounded-full pointer-events-none z-10"
          style={{
            background: 'rgba(92,168,255,0.88)',
            boxShadow: '0 0 12px rgba(92,168,255,0.48)',
          }}
        />
        <DashboardScreen {...props} />
      </div>

      {/* 右方向盘（外壳之外） */}
      {showSteeringWheels && (
        <div className="relative z-10" style={{ marginLeft: 12 }}>
          <SteeringWheel pack={pack} angleDeg={props.steeringAngleDeg} size={92} />
        </div>
      )}
    </div>
  );
};
