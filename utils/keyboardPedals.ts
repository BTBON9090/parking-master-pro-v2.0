/** Keyboard pedal intent, kept pure for regression tests. */
export const KEYBOARD_LIGHT_THROTTLE = 0.15;
export const KEYBOARD_SHIFT_THROTTLE = 0.30;
export const KEYBOARD_LIGHT_BRAKE = 0.12;
export const KEYBOARD_HARD_BRAKE = 1.0;

export interface KeyboardPedalIntent {
  gasPressed: boolean;
  shiftPressed: boolean;
  throttle: number;
  brake: number;
}

export function resolveKeyboardPedals(w: boolean, s: boolean, shift: boolean): KeyboardPedalIntent {
  // Brake always wins if both pedals are held. W is never full throttle, even
  // with Shift; Shift only changes light->moderate (30%).
  if (s) return { gasPressed: false, shiftPressed: shift, throttle: 0, brake: shift ? KEYBOARD_HARD_BRAKE : KEYBOARD_LIGHT_BRAKE };
  if (w) return { gasPressed: true, shiftPressed: shift, throttle: shift ? KEYBOARD_SHIFT_THROTTLE : KEYBOARD_LIGHT_THROTTLE, brake: 0 };
  return { gasPressed: false, shiftPressed: false, throttle: 0, brake: 0 };
}

/** Space owns the handbrake; W/Shift must never clear a held Space. */
export function resolveKeyboardHandbrake(spaceHeld: boolean, gasPressed: boolean, previous: boolean): boolean {
  if (spaceHeld) return true;
  if (gasPressed) return false;
  return previous;
}

/** Keyboard parking brake follows the held button, including release. */
export function heldKeyboardHandbrake(pressed: boolean): boolean { return pressed; }

/** Handbrake keyboard owns Space only inside active gameplay, never menus/fields. */
export function shouldHandleHandbrakeKey(isInGame: boolean, isPaused: boolean, isEditable: boolean): boolean {
  return isInGame && !isPaused && !isEditable;
}
