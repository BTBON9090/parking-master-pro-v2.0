import type { Obstacle } from '../types';

export const COLLISION_CELL_SIZE = 160;

/** Static kinematic candidates. Movable cones/boxes remain Cannon-owned. */
export function isStaticCollisionCandidate(obs: Obstacle): boolean {
  if (obs.type === 'wall' || obs.type === 'car') return true;
  if ((obs.type === 'box' || obs.type === 'cone') && !obs.movable) return true;
  return false;
}

export function collisionCellKey(x: number, y: number, cellSize = COLLISION_CELL_SIZE): string {
  return `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;
}

export function buildCollisionGrid(obstacles: Obstacle[], cellSize = COLLISION_CELL_SIZE) {
  const cells = new Map<string, Obstacle[]>();
  const byId = new Map<string, Obstacle>();
  obstacles.forEach(obs => {
    byId.set(obs.id, obs);
    if (!isStaticCollisionCandidate(obs)) return;
    const radius = Math.hypot(obs.width, obs.height) * 0.5;
    const minX = Math.floor((obs.x - radius) / cellSize);
    const maxX = Math.floor((obs.x + radius) / cellSize);
    const minY = Math.floor((obs.y - radius) / cellSize);
    const maxY = Math.floor((obs.y + radius) / cellSize);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const key = `${cx}:${cy}`;
        const bucket = cells.get(key);
        if (bucket) bucket.push(obs); else cells.set(key, [obs]);
      }
    }
  });
  return { cells, byId, cellSize };
}

export function queryCollisionGrid(
  grid: ReturnType<typeof buildCollisionGrid>,
  x: number,
  y: number,
  range = 150,
): Set<Obstacle> {
  const candidates = new Set<Obstacle>();
  const minX = Math.floor((x - range) / grid.cellSize);
  const maxX = Math.floor((x + range) / grid.cellSize);
  const minY = Math.floor((y - range) / grid.cellSize);
  const maxY = Math.floor((y + range) / grid.cellSize);
  for (let cx = minX; cx <= maxX; cx++) {
    for (let cy = minY; cy <= maxY; cy++) {
      grid.cells.get(`${cx}:${cy}`)?.forEach(obs => candidates.add(obs));
    }
  }
  return candidates;
}
