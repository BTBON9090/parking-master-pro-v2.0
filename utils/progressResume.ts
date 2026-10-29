import {CarType,type CarConfig,type LevelData} from '../types';
import {WORLD_REVISION,type GameProgress} from './progressStorage';
import {sampleTerrainSurface} from './terrainSampling';
import {buildCollisionGrid} from './collisionSpatial';
import {VehicleCollisionQuery} from './vehicleCollisionQuery';
/** Stale geometry or a newly occupied position falls back to the map's safe
 * spawn. Resume never restores velocity, an airborne body, or held controls. */
export function progressStart(progress:GameProgress,level:LevelData,car:CarConfig) {
  const p=progress.pose;
  if(progress.worldRevision!==WORLD_REVISION||p.x<car.length||p.y<car.length||p.x>level.mapWidth-car.length||p.y>level.mapHeight-car.length)return {...level.startPos};
  const surface=sampleTerrainSurface(level,p.x,p.y,p.elevation);
  if(!Number.isFinite(surface.height)||Math.abs(surface.height-p.elevation)>25)return {...level.startPos};
  // The articulated trailer restarts straight. Reserve its whole rear envelope
  // rather than trusting a previously jackknifed tractor-only rectangle.
  const articulated=[CarType.SEMI,CarType.US22].includes(car.id)?[[{x:-180,y:-15},{x:10,y:-15},{x:10,y:15},{x:-180,y:15}]]:undefined;
  const hits=new VehicleCollisionQuery().findHits(buildCollisionGrid(level.obstacles),{
    x:p.x,y:p.y,rotation:p.rotation,width:car.width,length:car.length,elevation:surface.height,verticalHeight:car.height,
    articulated,
  });
  return hits.size ? {...level.startPos} : {...p,elevation:surface.height};
}
