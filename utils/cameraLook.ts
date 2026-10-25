/**
 * Plain left-drag camera look.
 *
 * Exterior: the drag rotates a full 360° azimuth around the car. Polar is
 * clamped to a meaningful range: near-top-down at the low end and slightly
 * above the horizon at the high end (never under the ground).
 * Interior: the same gesture is deliberately low-sensitivity head look, with
 * the asymmetric neck limits from utils/headLook.ts.
 */

export const ORBIT_POLAR_MIN = 0.16;
export const ORBIT_POLAR_MAX = 1.46;
/** Radians of azimuth per horizontal pixel. */
export const ORBIT_AZIMUTH_PER_PX = 0.0065;
/** Radians of polar per vertical pixel. */
export const ORBIT_POLAR_PER_PX = 0.0042;
/** Low-sensitivity head-look degrees per pixel. */
export const HEAD_LOOK_YAW_PER_PX = 0.11;
export const HEAD_LOOK_PITCH_PER_PX = 0.05;

export interface OrbitPose {
  azimuth: number;
  polar: number;
}

export function stepOrbitDrag(current: OrbitPose, dxPx: number, dyPx: number): OrbitPose {
  const dx = Number.isFinite(dxPx) ? dxPx : 0;
  const dy = Number.isFinite(dyPx) ? dyPx : 0;
  const azimuth = current.azimuth + dx * ORBIT_AZIMUTH_PER_PX;
  const polar = Math.max(
    ORBIT_POLAR_MIN,
    Math.min(ORBIT_POLAR_MAX, current.polar + dy * ORBIT_POLAR_PER_PX),
  );
  return { azimuth, polar };
}

export function isInteriorCamera(view: string): boolean {
  return view === 'HOOD';
}

export function canOrbitCamera(view: string): boolean {
  return view !== 'HOOD';
}

/** Translate with the vehicle exactly; damp only changes in relative offset.
 * Smoothing a world position produces a frame-dependent following distance. */
export function followRelativeCoordinate(current: number, vehicleDelta: number, target: number, blend: number): number {
  const translated = current + vehicleDelta;
  return translated + (target - translated) * blend;
}

/** A small, continuous peripheral effect; parking and normal city speeds stay sharp. */
export function speedVisualStrength(speedKmh: number): number {
  const t = Math.max(0, Math.min(1, (Math.abs(speedKmh) - 70) / 100));
  return t * t * (3 - 2 * t);
}

/** Destruction changes control mode once; it must never override a manual orbit. */
export function resolveInspectionView(view:string,manualOrbit:boolean,disabled:boolean):string {
  return manualOrbit ? 'ORBIT' : disabled && view === 'HOOD' ? 'FOLLOW_FAR' : view;
}
export function cameraDragMode(view:string,disabled:boolean):'head'|'orbit' {
  return view === 'HOOD' && !disabled ? 'head' : 'orbit';
}
