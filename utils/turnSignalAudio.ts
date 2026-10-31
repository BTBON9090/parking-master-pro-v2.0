/** Emits one click per visible lamp transition; no repeated events between frames. */
export class TurnSignalClock {
  private previous: boolean | null = null;
  step(active: boolean, lit: boolean): 'on' | 'off' | null {
    if (!active) { this.previous = null; return null; }
    if (this.previous === null) { this.previous = lit; return lit ? 'on' : null; }
    if (this.previous === lit) return null;
    this.previous = lit;
    return lit ? 'on' : 'off';
  }
}

/** Short relay-style synthesized click; one-shot nodes disconnect themselves. */
export function playTurnSignalClick(ctx: AudioContext, edge: 'on' | 'off', volume: number) {
  if (ctx.state !== 'running' || volume <= 0) return;
  const osc = ctx.createOscillator(), gain = ctx.createGain(), t = ctx.currentTime;
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(edge === 'on' ? 1350 : 1000, t);
  osc.frequency.exponentialRampToValueAtTime(edge === 'on' ? 540 : 420, t + 0.035);
  gain.gain.setValueAtTime(Math.min(1, volume) * 0.19, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  osc.start(t); osc.stop(t + 0.06);
}
