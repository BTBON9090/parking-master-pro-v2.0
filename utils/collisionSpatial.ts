import type { Obstacle } from '../types';
import {getVehicleBoundaryPoints} from './physics';

export interface CollisionBounds {minX:number;maxX:number;minY:number;maxY:number}

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
    // Walls use a rectangular footprint: indexing a long thin boundary by
    // its circumscribed circle creates tens of thousands of empty cells.
    // Keep the conservative radius for vehicles and custom collision hulls.
    const radius = Math.hypot(obs.width, obs.height) * 0.5;
    const wall = obs.type === 'wall' && !obs.collisionFootprint?.length;
    const cosine = Math.abs(Math.cos(obs.rotation)), sine = Math.abs(Math.sin(obs.rotation));
    const extentX = wall ? (obs.width * cosine + obs.height * sine) * .5 : radius;
    const extentY = wall ? (obs.width * sine + obs.height * cosine) * .5 : radius;
    const hull=obs.collisionFootprint?.length?getVehicleBoundaryPoints({x:obs.x,y:obs.y,rotation:obs.rotation,length:obs.height,width:obs.width,footprint:obs.collisionFootprint}):null;
    const minX = Math.floor((hull?Math.min(...hull.map(p=>p.x)):obs.x - extentX) / cellSize);
    const maxX = Math.floor((hull?Math.max(...hull.map(p=>p.x)):obs.x + extentX) / cellSize);
    const minY = Math.floor((hull?Math.min(...hull.map(p=>p.y)):obs.y - extentY) / cellSize);
    const maxY = Math.floor((hull?Math.max(...hull.map(p=>p.y)):obs.y + extentY) / cellSize);
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
  return queryCollisionBounds(grid,{minX:x-range,maxX:x+range,minY:y-range,maxY:y+range});
}

/** Visit the assembly's complete bounds once, including the gap between
 * tractor and trailer. Callers may reuse a set between sweep samples. */
export function queryCollisionBounds(grid:ReturnType<typeof buildCollisionGrid>,bounds:CollisionBounds,candidates=new Set<Obstacle>()):Set<Obstacle>{
  candidates.clear();
  const minX = Math.floor(bounds.minX / grid.cellSize);
  const maxX = Math.floor(bounds.maxX / grid.cellSize);
  const minY = Math.floor(bounds.minY / grid.cellSize);
  const maxY = Math.floor(bounds.maxY / grid.cellSize);
  for (let cx = minX; cx <= maxX; cx++) {
    for (let cy = minY; cy <= maxY; cy++) {
      grid.cells.get(`${cx}:${cy}`)?.forEach(obs => candidates.add(obs));
    }
  }
  return candidates;
}
