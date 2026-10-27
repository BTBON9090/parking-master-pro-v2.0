const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
export const PEDAL_TRAVEL_PX = 44;
export type HeldControl = 'steer' | 'gas' | 'brake' | 'handbrake';
type Contact = { id: number; x: number; y: number; value: number; start: number };
/** Each control owns its pointer; releasing another finger never cancels it. */
export class MobileInputController {
  private contacts = new Map<HeldControl, Contact>();
  rulerCentre = 0;
  private rulerX: number | undefined;
  private rulerZoom = 1;
  begin(control: HeldControl, id: number, x: number, y: number, angle = 0) {
    if (this.contacts.has(control) || [...this.contacts.values()].some(v => v.id === id)) return false;
    this.contacts.set(control, { id, x, y, start: angle, value: control === 'gas' || control === 'brake' ? .12 : angle });
    return true;
  }
  move(control: HeldControl, id: number, x: number, y: number, lock: number, travel = 130) {
    const c = this.contacts.get(control);
    if (!c || c.id !== id) return false;
    if (control === 'gas' || control === 'brake') c.value = clamp(.12 + (c.y - y) / PEDAL_TRAVEL_PX * .88);
    if (control === 'steer') {
      const origin = Math.sign(c.start) * Math.pow(Math.abs(c.start) / lock, 1 / 1.7);
      const v = clamp(origin + (x - c.x) / travel, -1, 1);
      c.value = Math.sign(v) * Math.pow(Math.abs(v), 1.7) * lock;
    }
    return true;
  }
  /** Absolute steering position; pointer capture keeps the end stops active
   * even after a finger leaves the bar. */
  steerAt(id: number, x: number, left: number, width: number, lock: number, zoom = 1) {
    const c = this.contacts.get('steer');
    if (!c || c.id !== id || width <= 0) return false;
    const position=clamp((x-left)/width*2-1,-1,1),half=lock/zoom;
    if(zoom<=1.001)this.rulerCentre=0;
    else if(this.rulerX===undefined || Math.abs(zoom-this.rulerZoom)>.001)
      this.rulerCentre=clamp(c.value-position*half,-lock+half,lock-half);
    else if(x<left || x>left+width)
      this.rulerCentre=clamp(this.rulerCentre+(x-this.rulerX)/width*2*half,-lock+half,lock-half);
    c.value = clamp(this.rulerCentre+position*half,-lock,lock);
    this.rulerX=x;this.rulerZoom=zoom;
    return true;
  }
  end(control: HeldControl, id: number) {
    if (this.contacts.get(control)?.id !== id) return false;
    this.contacts.delete(control); if(control==='steer')this.rulerX=undefined; return true;
  }
  clear() { this.contacts.clear();this.rulerX=undefined; }
  held(control: HeldControl) { return this.contacts.has(control); }
  snapshot() {
    const brake = this.contacts.get('brake')?.value ?? 0;
    return {
      // gasPressed selects fixed keyboard W force, not analogue touch input.
      throttle: brake > 0 ? 0 : this.contacts.get('gas')?.value ?? 0,
      gasPressed: false, brake, handbrakeHeld: this.held('handbrake'),
      steeringWheelAngle: this.contacts.get('steer')?.value,
    };
  }
}
export function pedalFeedback(throttle: number, brake: number) {
  return {kind: brake > 0 ? 'brake' : 'gas', force: clamp(brake > 0 ? brake : throttle)};
}

/** Forty-eight equal mechanical divisions; zoom affects only finger travel. */
export function steeringRulerZoom(speedKmh:number){
 const t=clamp((Math.abs(speedKmh)-15)/105);return 1+2.5*t*t*(3-2*t);
}
export function steeringRulerTicks(lock:number,centre:number,zoom:number){
 return Array.from({length:49},(_,n)=>({n,angle:(n/24-1)*lock,
  left:50+((n/24-1)*lock-centre)/lock*50*zoom,major:n%8===0,medium:n%4===0}));
}
