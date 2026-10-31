/** Temporary camera-local displacement, in world units (10 units ≈ 1 metre). */
export function blastCameraShake(elapsedSeconds: number, distance: number) {
  if (elapsedSeconds < 0 || elapsedSeconds >= 2.8 || distance >= 3500) return { x: 0, y: 0, z: 0 };
  const distanceGain = Math.pow(Math.max(0, 1 - distance / 3500), 1.4);
  const envelope = Math.exp(-elapsedSeconds * 1.7) * distanceGain;
  return {
    x: 3.2 * envelope * (Math.sin(elapsedSeconds * 31) + .35 * Math.sin(elapsedSeconds * 53)),
    y: 2.4 * envelope * (Math.sin(elapsedSeconds * 37 + 1) + .3 * Math.sin(elapsedSeconds * 61)),
    z: 1.2 * envelope * Math.sin(elapsedSeconds * 27 + 2),
  };
}
