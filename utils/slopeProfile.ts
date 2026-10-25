/**
 * Driving-school hill profile with vertical curves at the toe and crest and
 * a constant-grade straight section between them. `grade` is dh/dx in the
 * slope's local coordinate system.
 */
export function sampleSlopeProfile(localX: number, length: number, peakHeight: number) {
  const half = length / 2;
  if (localX <= -half || localX >= half || half <= 0) return { height: 0, grade: 0 };

  const t = (localX + half) / length;
  const ascending = t <= 0.5;
  const u = (ascending ? t : 1 - t) * 2;
  const transition = 0.22;
  const straightEnd = 1 - transition;
  const maxSlope = 1 / (1 - transition);

  let ratio: number;
  let derivative: number;
  if (u < transition) {
    ratio = maxSlope * u * u / (2 * transition);
    derivative = maxSlope * u / transition;
  } else if (u <= straightEnd) {
    ratio = maxSlope * (u - transition / 2);
    derivative = maxSlope;
  } else {
    const remaining = 1 - u;
    ratio = 1 - maxSlope * remaining * remaining / (2 * transition);
    derivative = maxSlope * remaining / transition;
  }

  const direction = ascending ? 1 : -1;
  return {
    height: peakHeight * ratio,
    grade: direction * peakHeight * derivative * 2 / length,
  };
}
