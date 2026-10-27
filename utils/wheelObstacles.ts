import type { LevelData } from '../types';
import { CURB_HEIGHT, CURB_WIDTH, sampleTerrainSurface } from './terrainSampling';

export type CurbSegment = NonNullable<LevelData['curbSegments']>[number];
export interface WheelShape { x: number; z: number; radius: number; halfWidth: number; steer: number; axis?: { x:number; y:number; z:number }; }
export interface VehiclePose { x: number; y: number; rotation: number; }
interface Point { x: number; y: number; }

/** Clip the curb footprint to the tyre's finite axle width. Coordinates are
 * longitudinal / lateral in the wheel frame. A centre ray misses this area. */
function clipWidth(points: Point[], edge: number, sign: number): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const da = sign * (a.y - edge), db = sign * (b.y - edge);
    if (da <= 0) result.push(a);
    if ((da <= 0) !== (db <= 0)) {
      const t = da / (da - db);
      result.push({ x: a.x + t * (b.x - a.x), y: edge });
    }
  }
  return result;
}

export function wheelWorldPose(pose: VehiclePose, wheel: WheelShape) {
  const c = Math.cos(pose.rotation), s = Math.sin(pose.rotation);
  return { x: pose.x + c * wheel.z + s * wheel.x,
    y: pose.y + s * wheel.z - c * wheel.x, rotation: pose.rotation + wheel.steer };
}

/** Analytic upright-cylinder support against the visible rectangular curb.
 * Returns wheel-centre height minus radius, NOT ground height beneath its
 * centre. The tyre begins climbing when its circumference reaches the corner.
 * Radius / width are taken from the rendered wheel, in game units. */
export function wheelCurbSupport(pose: VehiclePose, wheel: WheelShape, curbs: CurbSegment[]): number {
  const world = wheelWorldPose(pose, wheel);
  const c = Math.cos(world.rotation), s = Math.sin(world.rotation);
  if(wheel.axis && Math.abs(wheel.axis.y)>0.002) return tiltedCurbSupport(world,wheel,curbs);
  let support = 0;
  for (const curb of curbs) {
    const cc = Math.cos(curb.rotation), cs = Math.sin(curb.rotation);
    const dx = world.x - curb.x, dy = world.y - curb.y;
    const range = wheel.radius + wheel.halfWidth;
    if (Math.abs(dx * cc + dy * cs) > curb.length / 2 + range ||
        Math.abs(-dx * cs + dy * cc) > CURB_WIDTH / 2 + range) continue;
    let polygon = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b]) => {
      const x = curb.x + a * curb.length/2 * cc - b * CURB_WIDTH/2 * cs - world.x;
      const y = curb.y + a * curb.length/2 * cs + b * CURB_WIDTH/2 * cc - world.y;
      return { x: x*c+y*s, y: -x*s+y*c };
    });
    polygon = clipWidth(clipWidth(polygon, wheel.halfWidth, 1), -wheel.halfWidth, -1);
    if (!polygon.length) continue;
    const low = Math.min(...polygon.map(p => p.x)), high = Math.max(...polygon.map(p => p.x));
    const distance = low > 0 ? low : high < 0 ? -high : 0;
    if (distance >= wheel.radius) continue;
    support = Math.max(support, CURB_HEIGHT + Math.sqrt(wheel.radius ** 2 - distance ** 2) - wheel.radius);
  }
  return support;
}

/** Conservative 24-sided finite tyre cylinder clipped against the actual
 * kerb top. The upright analytic fast path above remains exact. This path
 * rotates the ENTIRE contact volume with the wheel on banked terrain. */
function tiltedCurbSupport(world:{x:number;y:number},wheel:WheelShape,curbs:CurbSegment[]):number {
 const a=wheel.axis!;
 const length=Math.hypot(a.x,a.z),u=length>1e-7?{x:a.z/length,y:0,z:-a.x/length}:{x:1,y:0,z:0};
 const v={x:a.y*u.z-a.z*u.y,y:a.z*u.x-a.x*u.z,z:a.x*u.y-a.y*u.x};
 const count=24,r=wheel.radius/Math.cos(Math.PI/count),vertices:{x:number;y:number;z:number}[]=[];
 for(const side of [-1,1])for(let i=0;i<count;i++){
  const c=Math.cos(i/count*Math.PI*2)*r,s=Math.sin(i/count*Math.PI*2)*r,t=side*wheel.halfWidth;
  vertices.push({x:a.x*t+u.x*c+v.x*s,y:a.y*t+u.y*c+v.y*s,z:a.z*t+u.z*c+v.z*s});
 }
 let support=0;
 for(const curb of nearbyWheelCurbs(curbs,{x:world.x,y:world.y,rotation:0},r+wheel.halfWidth)){
  const c=Math.cos(curb.rotation),s=Math.sin(curb.rotation);
  const points=vertices.map(p=>{const dx=world.x+p.x-curb.x,dz=world.y+p.z-curb.y;
   return {x:dx*c+dz*s,z:-dx*s+dz*c,y:p.y};});
  const clip=(poly:typeof points,axis:'x'|'z',edge:number,sign:number)=>{
   const out:typeof points=[];for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],da=sign*(a[axis]-edge),db=sign*(b[axis]-edge);
    if(da<=0)out.push(a);
    if((da<=0)!==(db<=0)){const t=da/(da-db);out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});}
   }return out;
  };
  const face=(ids:number[])=>{
   let p=ids.map(i=>points[i]);p=clip(p,'x',curb.length/2,1);p=clip(p,'x',-curb.length/2,-1);
   p=clip(p,'z',CURB_WIDTH/2,1);p=clip(p,'z',-CURB_WIDTH/2,-1);
   for(const q of p)support=Math.max(support,CURB_HEIGHT-q.y-wheel.radius);
  };
  for(let i=0;i<count;i++){const j=(i+1)%count;face([i,j,j+count,i+count]);}
  face(Array.from({length:count},(_,i)=>i));face(Array.from({length:count},(_,i)=>i+count));
 }
 return support;
}

/** Broad phase once per movement; long curbs are tested as oriented boxes. */
export function nearbyWheelCurbs(curbs: CurbSegment[], pose: VehiclePose, range: number): CurbSegment[] {
  return curbs.filter(curb => {
    const dx = pose.x-curb.x, dy = pose.y-curb.y, c=Math.cos(curb.rotation), s=Math.sin(curb.rotation);
    return Math.abs(dx*c+dy*s) <= curb.length/2+range && Math.abs(-dx*s+dy*c) <= CURB_WIDTH/2+range;
  });
}

export function sampleWheelSupport(level: LevelData, pose: VehiclePose, wheel: WheelShape, currentHeight = 0): number {
  const world = wheelWorldPose(pose, wheel);
  // Ramps/bridges/terrain use the common surface; curb contact is a volume
  // query against its exact mesh dimensions, never the softened centre ray.
  const surface=sampleTerrainSurface(level, world.x, world.y, currentHeight, false);
  // Support the circular tread against the slope tangent, not only a point
  // directly beneath its centre (which buries the uphill rim on steep grades).
  const axleGrade=-surface.gradeX*Math.sin(world.rotation)+surface.gradeY*Math.cos(world.rotation);
  const axis=wheel.axis;
  const dot=axis ? axis.y-axis.x*surface.gradeX-axis.z*surface.gradeY : axleGrade;
  const n2=1+surface.gradeX**2+surface.gradeY**2;
  const treadSupport=surface.height+wheel.radius*(Math.sqrt(Math.max(0,n2-dot*dot))-1)
    +wheel.halfWidth*Math.abs(dot);
  // Kerbs are authored on the outdoor ground plane. A missing kerb is not
  // support at height zero above a basement or a negative-height valley.
  if (!level.curbSegments?.length || surface.height < -3) return treadSupport;
  return Math.max(treadSupport, wheelCurbSupport(pose, wheel, level.curbSegments));
}

export interface CurbMotionResult extends VehiclePose {
  speedMps: number;
  distance: number;
  absorbedJoules: number;
  blocked: boolean;
  sideBlocked: boolean;
}

/** Integrate curb work at <= 1/240 s AND <= 2 cm travel per substep.
 * The existing drivetrain supplies free acceleration. Rising wheel supports
 * require m*g*dh work; descending contacts dissipate that energy in the tyres
 * and dampers instead of giving the kinematic car a free launch impulse.
 * A tyre sidewall cannot roll sideways up a sharp kerb.
 * This is a lightweight contact model, not a full rigid-body vehicle solver. */
export function resolveCurbMotion(
  pose: VehiclePose, speedMps: number, freeSpeedMps: number, dt: number,
  massKg: number, wheels: WheelShape[], curbs: CurbSegment[],
  advance: (pose: VehiclePose, distance: number) => VehiclePose,
): CurbMotionResult {
  const freeDistance = (speedMps + freeSpeedMps) * .5 * dt * 10;
  const nearby = nearbyWheelCurbs(curbs, pose, Math.max(...wheels.map(w => Math.hypot(w.x,w.z)+w.radius+w.halfWidth),1) + Math.abs(freeDistance));
  if (!nearby.length || dt <= 0) return { ...advance(pose, freeDistance), speedMps: freeSpeedMps, distance: freeDistance, absorbedJoules: 0, blocked: false,sideBlocked:false };
  const steps = Math.max(1, Math.ceil(dt*240), Math.ceil(Math.abs(freeDistance)/.2));
  const h=dt/steps, acceleration=(freeSpeedMps-speedMps)/dt;
  let current={...pose}, velocity=speedMps, distance=0, absorbedJoules=0, blocked=false,sideBlocked=false;
  let heights=wheels.map(w => wheelCurbSupport(current,w,nearby));
  for (let i=0;i<steps;i++) {
    let predicted=velocity+acceleration*h;
    // Braking is not a reverse motor. Curb losses may stop the car before the
    // free drivetrain would; do not let the remaining brake acceleration reverse it.
    if (speedMps*freeSpeedMps >= 0 && Math.sign(predicted)!==Math.sign(freeSpeedMps || speedMps)) predicted=0;
    const travel=(velocity+predicted)*.5*h*10;
    if (Math.abs(travel)<1e-9) continue;
    const candidate=advance(current,travel);
    const next=wheels.map(w => wheelCurbSupport(candidate,w,nearby));
    const rise=next.reduce((sum,v,index)=>sum+Math.max(0,v-heights[index]),0)/wheels.length/10;
    const available=Math.max(0,.5*velocity**2+acceleration*travel/10);
    const work=9.80665*rise;
    const sideHit=wheels.some((w,index)=> {
      if (next[index]-heights[index]<.06) return false;
      const a=wheelWorldPose(current,w), b=wheelWorldPose(candidate,w);
      const dx=b.x-a.x,dy=b.y-a.y;
      const lateral=Math.abs(-dx*Math.sin(a.rotation)+dy*Math.cos(a.rotation));
      const rolling=Math.abs(dx*Math.cos(a.rotation)+dy*Math.sin(a.rotation));
      return lateral>rolling*1.5;
    });
    if (sideHit || work>available+1e-10) {
      sideBlocked ||= sideHit;
      // Stop at the last admissible pose. Tiny spatial steps prevent tunnelling
      // through the 42 cm kerb even when a render frame is slow.
      absorbedJoules+=.5*massKg*velocity**2;
      velocity=0; blocked=true;
      continue;
    }
    velocity=Math.sign(travel)*Math.sqrt(Math.max(0,2*(available-work)));
    absorbedJoules+=work*massKg;
    current=candidate; heights=next; distance+=travel;
  }
  return {...current,speedMps:velocity,distance,absorbedJoules,blocked,sideBlocked};
}

/** Energy threshold for a sideways tyre catching a curb. Smooth dry asphalt
 * may slide before reaching its rollover limit; a tripping obstacle changes
 * the pivot and can convert lateral momentum into body roll. */
export function curbTripRollover(speedMps:number,beta:number,trackM:number,cgM:number,sideBlocked:boolean){
 if(!sideBlocked||Math.abs(speedMps)<12||Math.abs(beta)<.25)return false;
 const rise=Math.hypot(trackM/2,cgM)-cgM;
 const lateral=Math.abs(speedMps*Math.sin(beta));
 return .25*lateral*lateral/2>9.80665*rise;
}
