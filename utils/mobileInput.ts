const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
export const PEDAL_TRAVEL_PX = 70;
export type HeldControl = 'steer' | 'gas' | 'brake' | 'handbrake';
type Contact = { id: number; x: number; y: number; value: number; start: number };
/** Each control owns its pointer; releasing another finger never cancels it. */
export class MobileInputController {
  private contacts = new Map<HeldControl, Contact>();
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
  end(control: HeldControl, id: number) {
    if (this.contacts.get(control)?.id !== id) return false;
    this.contacts.delete(control); return true;
  }
  clear() { this.contacts.clear(); }
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
