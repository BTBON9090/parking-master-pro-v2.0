import {liftSurface,mountainTunnelSample} from './mountainAdventure';
import { garageSurface } from './garage';
import { worldHeight, worldSurfaceSample, inCity, CITY_OFFSET } from './openWorld';
import type { LevelData } from '../types';
import { sampleElevatedRoad } from './elevatedRoad';
import { isTrainingTerrain, trainingTerrainGradient, trainingTerrainHeight } from './trainingTerrain';
import { sampleSlopeProfile } from './slopeProfile';
import {challengeSample} from './challengeMaps';

export interface SurfaceSample { height: number; gradeX: number; gradeY: number; }

/** Visible low curb dimensions (1 game unit = 0.1 m). */
export const CURB_HEIGHT = 2.6;
export const CURB_WIDTH = 4.2;
const CURB_SHOULDER = 0.55;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(1e-9, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Height of the visible low curb at a wheel contact point. The flat top uses
 * the same dimensions as the instanced curb mesh; the short shoulder avoids a
 * discontinuous vertical step while still making a wheel climb the visible
 * top. Curbs are low enough to be traversable and are not collision walls.
 */
export function curbHeightAt(level: LevelData, x: number, y: number): number {
  let best = 0;
  for (const curb of level.curbSegments || []) {
    const dx = x - curb.x;
    const dy = y - curb.y;
    const cos = Math.cos(curb.rotation);
    const sin = Math.sin(curb.rotation);
    const localX = dx * cos + dy * sin;
    const localY = -dx * sin + dy * cos;
    if (Math.abs(localX) > curb.length / 2 || Math.abs(localY) > CURB_WIDTH / 2) continue;
    const top = CURB_HEIGHT * (1 - smoothstep(CURB_WIDTH / 2 - CURB_SHOULDER, CURB_WIDTH / 2, Math.abs(localY)));
    best = Math.max(best, top);
  }
  return best;
}

/**
 * Shared support-height sampler used by the vehicle, wheels, camera helpers
 * and tests. There is deliberately no heading filter: a car turning on a ramp
 * must not lose its support surface.
 */
export function sampleTerrainSurface(level: LevelData, x: number, y: number, currentHeight?: number, includeCurbs = true): SurfaceSample {
  if(level.openWorld&&currentHeight!==undefined){const special=liftSurface(x,y,currentHeight)??mountainTunnelSample(x,y,currentHeight);if(special)return x<24500&&y>18800&&worldHeight(x,y)<25?worldSurfaceSample(x,y):special;}
  if (level.challengeTerrain) return challengeSample(level,x,y);
  if (level.garage) return garageSurface(x,y,currentHeight??-48);
  if (level.openWorld && !inCity(x,y)) return worldSurfaceSample(x, y);
  const elevated = sampleElevatedRoad(level.elevatedRoads, x, y, currentHeight??0);
  if (elevated) return elevated;
  const tx=x-(level.openWorld?CITY_OFFSET:0),ty=y-(level.openWorld?CITY_OFFSET:0);
  if (level.levelId === 1 && isTrainingTerrain(tx, ty)) {
    const grade = trainingTerrainGradient(tx, ty);
    return { height: trainingTerrainHeight(tx, ty), gradeX: grade.gradeX, gradeY: grade.gradeY };
  }
  for (const zone of level.slopeZones || []) {
    const dx = x - zone.x;
    const dy = y - zone.y;
    const cos = Math.cos(zone.rotation);
    const sin = Math.sin(zone.rotation);
    const localX = dx * cos + dy * sin;
    const localY = -dx * sin + dy * cos;
    if (Math.abs(localX) > zone.length / 2 || Math.abs(localY) > zone.width / 2) continue;
    const profile = sampleSlopeProfile(localX, zone.length, zone.peakHeight);
    return { height: profile.height, gradeX: cos * profile.grade, gradeY: sin * profile.grade };
  }
  return { height: includeCurbs ? curbHeightAt(level, x, y) : 0, gradeX: 0, gradeY: 0 };
}

export function sampleWheelSurfaceHeight(level: LevelData, x: number, y: number, currentHeight?: number): number {
  if(level.openWorld){const special=currentHeight===undefined?null:liftSurface(x,y,currentHeight)??mountainTunnelSample(x,y,currentHeight);if(special)return x<24500&&y>18800&&worldHeight(x,y)<25?worldHeight(x,y):special.height;if(!inCity(x,y))return worldHeight(x,y);}
  return sampleTerrainSurface(level, x, y, currentHeight).height;
}
