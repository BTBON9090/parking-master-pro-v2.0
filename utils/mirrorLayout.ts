import type { MirrorId } from '../types';

/**
 * Shared mirror image geometry.
 *
 * The DOM frame is the source of truth: the renderer measures the actual inner
 * glass rect (inside the frame border) and publishes it here. GameCanvas then
 * uses the same CSS-pixel rect for its scissor/viewport, so borders, rounded
 * corners, window resize, browser zoom and scrolling cannot drift apart.
 *
 * Coordinates are relative to the game canvas. Three.js viewport/scissor
 * coordinates are CSS pixels (the renderer applies its own pixel ratio).
 */
export interface MirrorGlassRect {
  left: number;
  top: number;
  width: number;
  height: number;
  /** CSS border radius of the inner glass, in CSS pixels. */
  radius: number;
}

export interface MirrorGlassLayout {
  canvasWidth: number;
  canvasHeight: number;
  dpr: number;
  rects: Partial<Record<MirrorId, MirrorGlassRect>>;
}

let currentLayout: MirrorGlassLayout | null = null;

export function publishMirrorGlassLayout(layout: MirrorGlassLayout | null): void {
  currentLayout = layout;
}

export function getMirrorGlassLayout(): MirrorGlassLayout | null {
  return currentLayout;
}
