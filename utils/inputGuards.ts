/**
 * Keyboard focus isolation.
 *
 * Driving/global hotkeys must never fire while the player is typing in the
 * live-tuning number fields, the key-binding capture, or any other text
 * control. The check deliberately accepts `unknown` because React/browser
 * events may target SVG, shadow hosts or test doubles; it never throws.
 */
const EDITABLE_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[role="textbox"]',
].join(',');

interface EditableLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
  getAttribute?: (name: string) => string | null;
}

/** True when the event target is an editable control that should own keys. */
export function isEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as EditableLike;

  const tag = (element.tagName ?? '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (element.isContentEditable === true) return true;

  // Ancestors matter: a <span> inside a contenteditable region, or a nested
  // label/role=textbox wrapper, must also keep the keystroke.
  if (typeof element.closest === 'function') {
    try {
      if (element.closest(EDITABLE_SELECTOR)) return true;
    } catch {
      // Detached or exotic targets simply fall through to the tag checks.
    }
  }
  if (typeof element.getAttribute === 'function') {
    try {
      const editable = element.getAttribute('contenteditable');
      if (editable === '' || editable === 'true' || editable === 'plaintext-only') return true;
    } catch {
      // Ignore hostile/incomplete targets.
    }
  }
  return false;
}
/** Pointer lock alone is not a held button. Mouse-up outside the window can
 * be lost; the next movement's buttons bitmask is the authoritative release. */
export function pointerButtonStillHeld(started: boolean, buttons: number, mask: number): boolean {
  return started && (buttons & mask) !== 0;
}
