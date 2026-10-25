/**
 * Fictional, non-paved training extension. The same analytic height function
 * drives the rendered mesh, all four wheel contacts, body attitude and grade.
 * No per-frame raycast or full-map geometry rebuild.
 */
export const TRAINING_TERRAIN = {
  centerX: 1500,
  centerY: 5000,
  width: 500,
  length: 800,
  entranceX: 1300,
  entranceY: 4600,
  // The mesh and the analytic contact field share this resolution; the test
  // bounds their bilinear sampling difference.
  meshColumns: 80,
  meshRows: 100,
} as const;

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export function isTrainingTerrain(x: number, y: number): boolean {
  const u = (x - TRAINING_TERRAIN.centerX) / (TRAINING_TERRAIN.width / 2);
  const v = (y - TRAINING_TERRAIN.centerY) / (TRAINING_TERRAIN.length / 2);
  return Math.abs(u) < 1.02 && Math.abs(v) < 1.02;
}

export function trainingTerrainHeight(x: number, y: number): number {
  const u = (x - TRAINING_TERRAIN.centerX) / (TRAINING_TERRAIN.width / 2);
  const v = (y - TRAINING_TERRAIN.centerY) / (TRAINING_TERRAIN.length / 2);
  const absEdge = Math.max(Math.abs(u), Math.abs(v));
  if (absEdge >= 1.02) return 0;
  const edge = 1 - smoothstep(0.02, 1.02, absEdge);
  // A real 1.6–1.8 m rise over roughly 20–25 m at the entry; clearly playable
  // but not a mountain. The v-ramp is ~7–9% and transitions smoothly.
  const entryRise = 16.5 * smoothstep(-0.90, -0.58, v);
  const broad = entryRise + 1.0
    + 0.75 * Math.sin(v * 2.4 + 0.4)
    + 0.55 * Math.sin(u * 2.9 - 0.7)
    + 0.35 * Math.sin((u + v) * 3.7 + 1.3);
  // Cross ruts plus 0.08–0.18 m potholes with smooth, explicit edges.
  const ruts = -0.55 * Math.cos(u * 8.5) * Math.exp(-v * v * 2.2);
  const potholes =
    -1.45 * Math.exp(-((u + 0.34) ** 2 + (v - 0.20) ** 2) * 26)
    -1.15 * Math.exp(-((u - 0.22) ** 2 + (v + 0.42) ** 2) * 32)
    -0.85 * Math.exp(-((u - 0.48) ** 2 + (v - 0.55) ** 2) * 38);
  return edge * Math.max(0.24, broad + ruts + potholes);
}

export function trainingTerrainGradient(x: number, y: number): { gradeX: number; gradeY: number } {
  const step = 4;
  const hx0 = trainingTerrainHeight(x - step, y);
  const hx1 = trainingTerrainHeight(x + step, y);
  const hy0 = trainingTerrainHeight(x, y - step);
  const hy1 = trainingTerrainHeight(x, y + step);
  return { gradeX: (hx1 - hx0) / (2 * step), gradeY: (hy1 - hy0) / (2 * step) };
}

/** Bilinear mesh height for the static 80×100 grid; bounded against analytic. */
export function trainingTerrainMeshHeight(x: number, y: number): number {
  if (!isTrainingTerrain(x, y)) return 0;
  const u = (x - (TRAINING_TERRAIN.centerX - TRAINING_TERRAIN.width / 2)) / TRAINING_TERRAIN.width;
  const v = (y - (TRAINING_TERRAIN.centerY - TRAINING_TERRAIN.length / 2)) / TRAINING_TERRAIN.length;
  const fx = Math.max(0, Math.min(1, u)) * TRAINING_TERRAIN.meshColumns;
  const fz = Math.max(0, Math.min(1, v)) * TRAINING_TERRAIN.meshRows;
  const ix = Math.min(TRAINING_TERRAIN.meshColumns - 1, Math.floor(fx));
  const iz = Math.min(TRAINING_TERRAIN.meshRows - 1, Math.floor(fz));
  const tx = fx - ix;
  const tz = fz - iz;
  const gx = TRAINING_TERRAIN.width / TRAINING_TERRAIN.meshColumns;
  const gz = TRAINING_TERRAIN.length / TRAINING_TERRAIN.meshRows;
  const x0 = TRAINING_TERRAIN.centerX - TRAINING_TERRAIN.width / 2 + ix * gx;
  const z0 = TRAINING_TERRAIN.centerY - TRAINING_TERRAIN.length / 2 + iz * gz;
  const h00 = trainingTerrainHeight(x0, z0);
  const h10 = trainingTerrainHeight(x0 + gx, z0);
  const h01 = trainingTerrainHeight(x0, z0 + gz);
  const h11 = trainingTerrainHeight(x0 + gx, z0 + gz);
  return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
}

export function isGravelSurface(x: number, y: number): boolean {
  return isTrainingTerrain(x, y)
    || (Math.abs(x - 1300) < 42 && y > 3990 && y < 4625);
}
