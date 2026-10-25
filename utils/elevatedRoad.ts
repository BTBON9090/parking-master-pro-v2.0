import type { ElevatedRoad } from '../types';

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / Math.max(1e-6, b - a)));
  return t * t * (3 - 2 * t);
};

export interface ElevatedSample {
  height: number;
  gradeX: number;
  gradeY: number;
}

/** Height/profile of one deck/ramp at an XZ point (world units). */
export function elevatedRoadProfile(road: ElevatedRoad, x: number, y: number): ElevatedSample | null {
  const dx = x - road.x;
  const dy = y - road.y;
  const cos = Math.cos(-road.rotation);
  const sin = Math.sin(-road.rotation);
  const lx = dx * cos - dy * sin;
  const lz = dx * sin + dy * cos;
  if (Math.abs(lx) > road.width / 2 || Math.abs(lz) > road.height / 2) return null;
  const inward = road.width / 2 - Math.abs(lx);
  const ramp = Math.max(1, road.rampLength);
  const t = Math.max(0, Math.min(1, inward / ramp));
  const height = road.deckHeight * smoothstep(0, 1, t);
  // Derivative of smoothstep profile along local X, then rotate to world.
  const derivative = t > 0 && t < 1 ? road.deckHeight * 6 * t * (1 - t) / ramp : 0;
  const sign = Math.sign(lx) || 1;
  const localGradeX = -sign * derivative; // inward rises toward centre from either end
  const gradeX = localGradeX * Math.cos(road.rotation);
  const gradeY = localGradeX * Math.sin(road.rotation);
  return { height, gradeX, gradeY };
}

/**
 * Pick the deck only when it belongs to the car's current vertical layer.
 * At ground height the underpass wins; on a ramp/deck the bridge wins.
 */
export function sampleElevatedRoad(
  roads: ElevatedRoad[] | undefined,
  x: number,
  y: number,
  currentHeight: number,
): ElevatedSample | null {
  if (!roads?.length) return null;
  let best: ElevatedSample | null = null;
  for (const road of roads) {
    const candidate = elevatedRoadProfile(road, x, y);
    if (!candidate) continue;
    const tolerance = Math.max(3.5, road.deckHeight * 0.42);
    if (Math.abs(candidate.height - currentHeight) > tolerance) continue;
    if (!best || Math.abs(candidate.height - currentHeight) < Math.abs(best.height - currentHeight)) best = candidate;
  }
  return best;
}
