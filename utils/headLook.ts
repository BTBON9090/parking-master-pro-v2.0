/** Driver head look is intentionally separate from the vehicle heading. */
export const HEAD_LOOK_YAW_LIMIT_DEG = 80;
/** Up/down split matches the driver's real neck range; positive is up. */
export const HEAD_LOOK_PITCH_UP_LIMIT_DEG = 10;
export const HEAD_LOOK_PITCH_DOWN_LIMIT_DEG = 15;
/** Backwards-compatible magnitude used by older callers/tests. */
export const HEAD_LOOK_PITCH_LIMIT_DEG = HEAD_LOOK_PITCH_DOWN_LIMIT_DEG;

const state = {
  targetYawDeg: 0,
  targetPitchDeg: 0,
  yawDeg: 0,
  pitchDeg: 0,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function setHeadLookTarget(yawDeg: number, pitchDeg = 0): void {
  state.targetYawDeg = clamp(Number.isFinite(yawDeg) ? yawDeg : 0, -HEAD_LOOK_YAW_LIMIT_DEG, HEAD_LOOK_YAW_LIMIT_DEG);
  state.targetPitchDeg = clamp(
    Number.isFinite(pitchDeg) ? pitchDeg : 0,
    -HEAD_LOOK_PITCH_DOWN_LIMIT_DEG,
    HEAD_LOOK_PITCH_UP_LIMIT_DEG,
  );
}

export function adjustHeadLook(deltaYawDeg: number, deltaPitchDeg = 0): void {
  setHeadLookTarget(state.targetYawDeg + deltaYawDeg, state.targetPitchDeg + deltaPitchDeg);
}

export function resetHeadLook(immediate = false): void {
  state.targetYawDeg = 0;
  state.targetPitchDeg = 0;
  if (immediate) {
    state.yawDeg = 0;
    state.pitchDeg = 0;
  }
}

/** Smoothly step the head; call once per rendered frame while in the cockpit. */
export function stepHeadLook(dtSeconds: number): { yawDeg: number; pitchDeg: number } {
  const dt = Number.isFinite(dtSeconds) ? Math.max(0, Math.min(0.1, dtSeconds)) : 0;
  const blend = 1 - Math.exp(-9 * dt);
  state.yawDeg += (state.targetYawDeg - state.yawDeg) * blend;
  state.pitchDeg += (state.targetPitchDeg - state.pitchDeg) * blend;
  if (Math.abs(state.targetYawDeg - state.yawDeg) < 0.01) state.yawDeg = state.targetYawDeg;
  if (Math.abs(state.targetPitchDeg - state.pitchDeg) < 0.01) state.pitchDeg = state.targetPitchDeg;
  return { yawDeg: state.yawDeg, pitchDeg: state.pitchDeg };
}

export function getHeadLook(): { yawDeg: number; pitchDeg: number; targetYawDeg: number; targetPitchDeg: number } {
  return { ...state };
}
