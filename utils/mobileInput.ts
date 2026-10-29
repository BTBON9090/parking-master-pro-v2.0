const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
import type {InputState} from '../types';
import {resolveKeyboardPedals} from './keyboardPedals';
import {parkingBrakeApplied} from './parkingBrake';
export const PEDAL_TRAVEL_PX = 44;
export type HeldControl = 'steer' | 'gas' | 'brake' | 'handbrake';
/** Map the upper-left to lower-right quadrant of an elliptical control to a
 * linear steering position. Width and height may differ in the HUD editor. */
export function steeringArcPosition(x:number,y:number,left:number,top:number,width:number,height:number){
 if(width<=0||height<=0)return .5;
 const horizontal=Math.max(0,(x-left)/width),vertical=Math.max(0,(top+height-y)/height);
 if(horizontal===0&&vertical===0)return .5;
 const position=Math.atan2(horizontal,vertical)/(Math.PI/2);
 // Drag past either end to allow the high-speed zoomed ruler to pan to lock.
 return position+Math.max(0,(x-left-width)/width)-Math.max(0,(top-y)/height);
}
type Contact = { id: number; x: number; y: number; value: number; start: number };
/** Each control owns its pointer; releasing another finger never cancels it. */
export class MobileInputController {
  private contacts = new Map<HeldControl, Contact>();
  rulerCentre = 0;
  private rulerPosition: number | undefined;
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
  /** The first contact anchors the CURRENT wheel angle. Subsequent arc
   * displacement is relative, so re-gripping never jumps the steering. */
  steerAt(id: number, x: number, left: number, width: number, lock: number, zoom = 1) {
    const c = this.contacts.get('steer');
    if (!c || c.id !== id || width <= 0) return false;
    const position = (x - left) / width;
    if (this.rulerPosition !== undefined) {
      c.value = clamp(c.value + (position - this.rulerPosition) * 2 * lock / Math.max(1, zoom), -lock, lock);
    }
    this.rulerPosition = position;
    this.rulerCentre = this.viewCentre(lock, zoom);
    return true;
  }
  /** Keep the ruler under a stationary finger when speed changes the zoom. */
  viewCentre(lock: number, zoom: number) {
    const c = this.contacts.get('steer');
    return c ? c.value - ((this.rulerPosition ?? .5) * 2 - 1) * lock / Math.max(1, zoom) : this.rulerCentre;
  }
  /** Deliberate dragging beyond an arc end continues turning without having
   * to leave the screen. Relative low-speed control also needs this reach. */
  panSteering(id:number,direction:number,dt:number,lock:number,zoom:number){
    const c=this.contacts.get('steer');
    if(!c||c.id!==id||!direction)return false;
    c.value=clamp(c.value+Math.sign(direction)*lock*.75*clamp(dt,0,.1),-lock,lock);
    this.rulerCentre=this.viewCentre(lock,zoom);
    return true;
  }
  end(control: HeldControl, id: number) {
    if (this.contacts.get(control)?.id !== id) return false;
    this.contacts.delete(control); if(control==='steer')this.rulerPosition=undefined; return true;
  }
  clear() { this.contacts.clear();this.rulerPosition=undefined; }
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
export type MobileSnapshot=ReturnType<MobileInputController['snapshot']>;
export type KeyboardHeld={w:boolean;s:boolean;shift:boolean;handbrake:boolean};
/** Pedals retain independent ownership; releasing a touch never clears a
 * keyboard brake or handbrake, and applying a brake never loses steering. */
export function mergeMobileInput(prev:InputState,snapshot:MobileSnapshot,keys:KeyboardHeld):InputState{
 const keyboard=resolveKeyboardPedals(keys.w,keys.s,keys.shift);
 return {...prev,throttle:keyboard.brake>0?0:snapshot.throttle,gasPressed:keyboard.gasPressed&&snapshot.brake===0&&snapshot.throttle<keyboard.throttle,
  shiftPressed:keyboard.shiftPressed,brake:Math.max(snapshot.brake,keyboard.brake),
  handbrake:parkingBrakeApplied(!!prev.parkingBrake,snapshot.handbrakeHeld||keys.handbrake),
  ...(snapshot.steeringWheelAngle===undefined?{}:{steeringWheelAngle:snapshot.steeringWheelAngle})};
}
export function pedalFeedback(throttle: number, brake: number) {
  return {kind: brake > 0 ? 'brake' : 'gas', force: clamp(brake > 0 ? brake : throttle)};
}

/** Forty-eight equal mechanical divisions; zoom affects only finger travel. */
export function steeringRulerZoom(speedKmh:number){
 const speed=Math.abs(speedKmh),t=clamp((speed-15)/105),fast=clamp((speed-120)/120);
 // Preserve the familiar low-speed travel, then smoothly magnify further
 // above 120 km/h; cap at 10x so the guide never becomes unbounded.
 return 1+4*t*t*(3-2*t)+5*fast*fast*(3-2*fast);
}
export function steeringRulerTicks(lock:number,centre:number,zoom:number){
 return Array.from({length:49},(_,n)=>({n,angle:(n/24-1)*lock,
  left:50+((n/24-1)*lock-centre)/lock*50*zoom,major:n%8===0,medium:n%4===0}));
}
