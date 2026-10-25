/**
 * 主菜单音频引擎（全程序化 WebAudio 合成，零音频文件）
 * =====================================================
 *  - 菜单环境音乐与城市嘈杂声已停用
 *  - UI 按键音：机械键盘式双段咔哒
 *  - 点火转场：启动机带动发动机并稳定到怠速
 *
 * 浏览器自动播放策略：首次用户手势（点击 / 按键）后才允许出声，
 * 因此 start() 由主菜单在第一次交互时调用。
 */

let sharedCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let masterVolume = 0.8;
let soundEnabled = true;

export function configureMenuAudio(opts: { enabled: boolean; volume: number }) {
  soundEnabled = opts.enabled;
  masterVolume = opts.volume;
}

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedCtx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    sharedCtx = new AC();
  }
  if (sharedCtx.state === 'suspended') sharedCtx.resume().catch(() => undefined);
  return sharedCtx;
}

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const len = ctx.sampleRate * 2;
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

const canPlay = () => soundEnabled && masterVolume > 0.001;

// ============================================================
// UI 按键音
// ============================================================
export type UiClickKind = 'tick' | 'confirm' | 'back';

export function playUiClick(kind: UiClickKind = 'tick') {
  if (!canPlay()) return;
  const ctx = ensureContext();
  if (!ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime;
  const strength = kind === 'confirm' ? 1.05 : kind === 'back' ? 0.88 : 1;

  // Switch stem / keycap impact: two very short filtered noise impulses,
  // followed by a quiet low keycap resonance. No electronic high-pitch beep.
  const clickImpulse = (time: number, level: number, centre: number) => {
    const source = ctx.createBufferSource();
    source.buffer = getNoiseBuffer(ctx);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = centre;
    band.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level * strength * masterVolume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.018);
    source.connect(band); band.connect(gain); gain.connect(ctx.destination);
    source.start(time); source.stop(time + 0.024);
  };
  clickImpulse(t0, 0.12, 1750);
  clickImpulse(t0 + 0.027, 0.052, 1180);

  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(kind === 'back' ? 105 : 138, t0);
  body.frequency.exponentialRampToValueAtTime(82, t0 + 0.045);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.035 * strength * masterVolume, t0);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.052);
  body.connect(bodyGain); bodyGain.connect(ctx.destination);
  body.start(t0); body.stop(t0 + 0.058);
}

/** 点火转场：启动继电器、启动机转动，随后发动机稳定到怠速。 */
export function playIgnitionRev() {
  if (!canPlay()) return;
  const ctx = ensureContext();
  if (!ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime;

  // 启动机：较低、更密的机械脉冲，而不是尖锐电子音。
  for (let i = 0; i < 7; i++) {
    const t = t0 + i * 0.048;
    const click = ctx.createOscillator();
    click.type = 'triangle';
    click.frequency.value = 92 + Math.random() * 24;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.046 * masterVolume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    click.connect(g); g.connect(ctx.destination);
    click.start(t); click.stop(t + 0.045);
  }

  // 发动机着车后只轻微越过怠速，再自然落稳，不再做高转速扫频。
  const revStart = t0 + 0.25;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(46, revStart);
  osc.frequency.exponentialRampToValueAtTime(104, revStart + 0.24);
  osc.frequency.exponentialRampToValueAtTime(72, revStart + 0.58);
  const sub = ctx.createOscillator();
  sub.type = 'triangle';
  sub.frequency.setValueAtTime(24, revStart);
  sub.frequency.exponentialRampToValueAtTime(52, revStart + 0.24);
  sub.frequency.exponentialRampToValueAtTime(36, revStart + 0.58);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(280, revStart);
  lp.frequency.exponentialRampToValueAtTime(1150, revStart + 0.24);
  lp.frequency.exponentialRampToValueAtTime(620, revStart + 0.58);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, revStart);
  g.gain.exponentialRampToValueAtTime(0.115 * masterVolume, revStart + 0.10);
  g.gain.setValueAtTime(0.10 * masterVolume, revStart + 0.34);
  g.gain.exponentialRampToValueAtTime(0.0001, revStart + 0.66);
  osc.connect(lp); sub.connect(lp); lp.connect(g); g.connect(ctx.destination);
  osc.start(revStart); osc.stop(revStart + 0.7);
  sub.start(revStart); sub.stop(revStart + 0.7);
}

// ============================================================
// 背景音乐：暗黑合成器（D 小调四和弦循环，92 BPM）
// Dm → Bb → Gm → A，长音垫滑行换和弦 + 八分脉冲低音 + 稀疏回声琶音
// ============================================================
const MUSIC_CHORDS: Array<[number, number, number]> = [
  [73.42, 87.31, 110.0],   // Dm: D2 F2 A2
  [58.27, 73.42, 87.31],   // Bb: Bb1 D2 F2
  [49.0, 58.27, 73.42],    // Gm: G1 Bb1 D2
  [55.0, 69.3, 82.41],     // A:  A1 C#2 E2（悬念属和弦，回到 Dm）
];
const MUSIC_BPM = 92;

// ============================================================
// 环境音床（车流 / 驶过 / 警笛 / 对讲机）
// ============================================================
