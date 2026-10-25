/** Simple pinhole projection for driver-eye calibration tests. */
export function projectCockpitVerticalScreenY(
  localY: number,
  localZ: number,
  eyeY: number,
  eyeZ: number,
  fovDeg: number,
  viewportHeight: number,
  pitchDeg = -2,
): number {
  const angle = Math.atan2(localY - eyeY, Math.max(1e-6, localZ - eyeZ));
  const relative = angle - pitchDeg * Math.PI / 180;
  const ndc = Math.tan(relative) / Math.tan(fovDeg * Math.PI / 360);
  return viewportHeight / 2 - ndc * viewportHeight / 2;
}

/** Apply a measured per-car eye offset on top of the user's hood-camera tune. */
export function applyCockpitEyeOffset(
  pose: { x: number; y: number; z: number; targetX: number; targetY: number; targetZ: number },
  offset: { x: number; y: number; z: number },
): { x: number; y: number; z: number; targetX: number; targetY: number; targetZ: number } {
  return {
    ...pose,
    x: pose.x + offset.x,
    y: pose.y + offset.y,
    z: pose.z + offset.z,
    targetX: pose.targetX + offset.x,
    targetY: pose.targetY + offset.y,
    targetZ: pose.targetZ + offset.z,
  };
}
