/** Keep deadlines on a stable timeline: resetting them to each late rAF would
 * turn a 60 Hz target into 45 Hz on a 90 Hz display and drift under tiny jitter.
 * Missed deadlines are skipped, never replayed as catch-up renders. */
class PresentationCadence {
 private last: number | null = null;
 private next = 0;
 private hz = 0;
 reset() { this.last = null; }
 sample(now: number, hz: number): number | null {
  const interval = hz > 0 ? 1000 / hz : 0;
  if (this.last === null) {
   this.last = now; this.next = now + interval; this.hz = hz; return 0;
  }
  if (hz !== this.hz) { this.next = this.last + interval; this.hz = hz; }
  if (interval && now + .25 < this.next) return null;
  const dt = Math.max(0, (now - this.last) / 1000);
  this.last = now;
  if (interval) this.next += interval * Math.max(1, Math.floor((now + .25 - this.next) / interval) + 1);
  return dt;
 }
}

/** Render paused scenes occasionally and never submit hidden GPU work.
 * Touch gameplay has a 60 Hz ceiling; desktop remains uncapped. */
export class SceneRenderPacer {
 private active = new PresentationCadence();
 private lastPausedRender = -Infinity;
 private previousPaused = false;
 private wasHidden = false;
 shouldRender(now: number, paused: boolean, hidden: boolean, mobile = false): boolean {
  if (hidden) { this.wasHidden = true; this.active.reset(); return false; }
  if (!paused) {
   this.previousPaused = false; this.wasHidden = false;
   return this.active.sample(now, mobile ? 60 : 0) !== null;
  }
  this.active.reset();
  if (!this.previousPaused || this.wasHidden || now - this.lastPausedRender >= 200) {
   this.previousPaused = true; this.wasHidden = false; this.lastPausedRender = now; return true;
  }
  return false;
 }
}

/** Cache the three independent rear-view textures on touch devices. They still
 * composite every displayed frame; input and the main scene are never capped. */
export class MirrorRenderPacer {
 private lastRender = -Infinity;
 shouldRefresh(now: number, mobile: boolean, invalidated: boolean): boolean {
  if (!mobile || invalidated || now - this.lastRender >= 30) { this.lastRender = now; return true; }
  return false;
 }
}

/** The showroom is decorative when idle. Return real elapsed seconds only
 * for presented frames, and discard hidden/loading gaps rather than catching up. */
export class PreviewRenderPacer {
 private cadence = new PresentationCadence();
 sample(now: number, mobile: boolean, interacting: boolean, unavailable: boolean): number | null {
  if (unavailable) { this.cadence.reset(); return null; }
  const dt = this.cadence.sample(now, mobile ? (interacting ? 60 : 30) : 0);
  return dt === null ? null : Math.min(dt, .05);
 }
}
