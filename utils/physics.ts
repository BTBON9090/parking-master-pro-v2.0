import { Vector2, Rect } from "../types";

export interface VehicleCollider {
  x: number;
  y: number;
  length: number;
  width: number;
  rotation: number;
  footprint?: Vector2[];
  articulated?: Vector2[][];
  /** Vertical road layer in game units (bridge deck vs ground). */
  elevation?: number;
  /** Vehicle/obstacle vertical extent above its base. */
  verticalHeight?: number;
}

// Rotate a point around a center
export function rotatePoint(point: Vector2, center: Vector2, angle: number): Vector2 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + (dx * cos - dy * sin),
    y: center.y + (dx * sin + dy * cos)
  };
}

// Get corners of a rotated rectangle
export function getRectCorners(rect: Rect): Vector2[] {
  const center = { x: rect.x, y: rect.y };
  const hw = rect.width / 2;
  const hh = rect.height / 2;

  // Unrotated corners relative to center
  const corners = [
    { x: rect.x - hw, y: rect.y - hh }, // Top Left
    { x: rect.x + hw, y: rect.y - hh }, // Top Right
    { x: rect.x + hw, y: rect.y + hh }, // Bottom Right
    { x: rect.x - hw, y: rect.y + hh }  // Bottom Left
  ];

  return corners.map(p => rotatePoint(p, center, rect.rotation));
}

// Check intersection using Separating Axis Theorem (SAT)
export function checkCollision(rectA: Rect, rectB: Rect): boolean {
  const cornersA = getRectCorners(rectA);
  const cornersB = getRectCorners(rectB);

  const axes = [
    ...getAxes(cornersA),
    ...getAxes(cornersB)
  ];

  for (const axis of axes) {
    const projA = project(cornersA, axis);
    const projB = project(cornersB, axis);

    if (!overlap(projA, projB)) {
      return false; // Separating axis found
    }
  }
  return true;
}

/** Convex painted-body outline, with a modest bumper chamfer as fallback. */
export function getVehicleBoundaryPoints(vehicle: VehicleCollider): Vector2[] {
  const l = vehicle.length / 2, w = vehicle.width / 2, c = Math.min(w * 0.15, l * 0.08);
  const points = vehicle.footprint ?? [
    {x:l-c,y:w},{x:-l+c,y:w},{x:-l,y:w-c},{x:-l,y:-w+c},
    {x:-l+c,y:-w},{x:l-c,y:-w},{x:l,y:-w+c},{x:l,y:w-c},
  ];
  const cos = Math.cos(vehicle.rotation), sin = Math.sin(vehicle.rotation);
  return points.map(p => ({x: vehicle.x + p.x*cos-p.y*sin, y:vehicle.y+p.x*sin+p.y*cos}));
}
function polygonsOverlap(a: Vector2[], b: Vector2[]): boolean {
  for (const axis of [...getAxes(a), ...getAxes(b)]) {
    if (!overlap(project(a, axis), project(b, axis))) return false;
  }
  return true;
}
export function checkVehicleCollision(a: VehicleCollider, b: VehicleCollider): boolean {
  return vehicleContacts(a,b).length>0;
}

function toRectLocal(point: Vector2, rect: Rect): Vector2 {
  const dx = point.x - rect.x;
  const dy = point.y - rect.y;
  const cos = Math.cos(-rect.rotation);
  const sin = Math.sin(-rect.rotation);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

function normalizeVector(vector: Vector2, fallback: Vector2 = { x: 1, y: 0 }): Vector2 {
  const length = Math.hypot(vector.x, vector.y);
  if (length < 1e-6) return fallback;
  return { x: vector.x / length, y: vector.y / length };
}

/**
 * Outward contact normal from another vehicle towards the player vehicle.
 * The normal is used to split an impact into normal (crash) and tangential
 * (scrape) velocity instead of stopping the car for every overlap.
 */
export function getVehicleContactNormal(vehicle: VehicleCollider, other: VehicleCollider): Vector2 {
  return normalizeVector(
    { x: vehicle.x - other.x, y: vehicle.y - other.y },
    { x: -Math.sin(other.rotation), y: Math.cos(other.rotation) },
  );
}

/** Outward contact normal from a rotated scenery rectangle to a vehicle. */
export function getVehicleRectContactNormal(vehicle: VehicleCollider, rect: Rect): Vector2 {
  const local = toRectLocal({ x: vehicle.x, y: vehicle.y }, rect);
  const halfW = Math.max(0.001, rect.width / 2);
  const halfH = Math.max(0.001, rect.height / 2);
  const closest = {
    x: Math.max(-halfW, Math.min(halfW, local.x)),
    y: Math.max(-halfH, Math.min(halfH, local.y)),
  };
  let localNormal = { x: local.x - closest.x, y: local.y - closest.y };

  // If the vehicle centre itself lies inside the rectangle, use the nearest
  // face. This also gives stable normals for very thick training barriers.
  if (Math.hypot(localNormal.x, localNormal.y) < 1e-6) {
    const xClearance = halfW - Math.abs(local.x);
    const yClearance = halfH - Math.abs(local.y);
    localNormal = xClearance < yClearance
      ? { x: Math.sign(local.x) || 1, y: 0 }
      : { x: 0, y: Math.sign(local.y) || 1 };
  }

  localNormal = normalizeVector(localNormal);
  const cos = Math.cos(rect.rotation);
  const sin = Math.sin(rect.rotation);
  return normalizeVector({
    x: localNormal.x * cos - localNormal.y * sin,
    y: localNormal.x * sin + localNormal.y * cos,
  });
}

export function checkVehicleRectCollision(vehicle: VehicleCollider, rect: Rect): boolean {
  return [vehicle.footprint,...(vehicle.articulated??[])].some(footprint=>polygonsOverlap(getVehicleBoundaryPoints({...vehicle,footprint}),getRectCorners(rect)));
}

// Get normals of rectangle edges
function getAxes(corners: Vector2[]): Vector2[] {
  const axes: Vector2[] = [];
  for (let i = 0; i < corners.length; i++) {
    const p1 = corners[i];
    const p2 = corners[(i + 1) % corners.length];
    const edge = { x: p2.x - p1.x, y: p2.y - p1.y };
    const normal = { x: -edge.y, y: edge.x };
    // Normalize
    const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y);
    if(length>1e-8)axes.push({ x: normal.x / length, y: normal.y / length });
  }
  return axes;
}

function project(corners: Vector2[], axis: Vector2): { min: number, max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const p of corners) {
    const dot = p.x * axis.x + p.y * axis.y;
    if (dot < min) min = dot;
    if (dot > max) max = dot;
  }
  return { min, max };
}

function overlap(p1: { min: number, max: number }, p2: { min: number, max: number }): boolean {
  return !(p1.max < p2.min || p2.max < p1.min);
}

/** Vertical interval overlap, not a single-height equality. */
export function vehicleLayersCompatible(
  a: VehicleCollider,
  b: { elevation?: number; verticalHeight?: number },
  tolerance = 1,
): boolean {
  const aBase = a.elevation || 0;
  const bBase = b.elevation || 0;
  const aTop = aBase + Math.max(2, a.verticalHeight ?? 15);
  const bTop = bBase + Math.max(2, b.verticalHeight ?? 15);
  return aBase < bTop + tolerance && aTop + tolerance > bBase;
}

export function checkVehicleCollisionLayered(
  a: VehicleCollider,
  b: VehicleCollider,
  tolerance = 4,
): boolean {
  return vehicleLayersCompatible(a, b, tolerance) && checkVehicleCollision(a, b);
}

/** SAT minimum-penetration normal for the real convex outline (not its AABB). */
export function getConvexContactNormal(vehicle:VehicleCollider, other:Vector2[]):Vector2 {
 const own=getVehicleBoundaryPoints(vehicle);let depth=Infinity,result={x:1,y:0};
 const center=other.reduce((s,p)=>({x:s.x+p.x/other.length,y:s.y+p.y/other.length}),{x:0,y:0});
 for(const axis of [...getAxes(own),...getAxes(other)]){
  const a=project(own,axis),b=project(other,axis),overlap=Math.min(a.max,b.max)-Math.max(a.min,b.min);
  if(overlap<depth){depth=overlap;const sign=(vehicle.x-center.x)*axis.x+(vehicle.y-center.y)*axis.y<0?-1:1;result={x:axis.x*sign,y:axis.y*sign};}
 }
 return result;
}

export interface ContactManifold { normal:Vector2; depth:number; point:Vector2 }
/** Minimum translation on each convex body pair. Includes trailer against trailer.
 * Containment uses opposing faces, not intersection width, so a hull can escape. */
export function convexContact(a:Vector2[],b:Vector2[]):ContactManifold|null {
 let depth=Infinity,normal={x:1,y:0};
 for(const axis of [...getAxes(a),...getAxes(b)]){
  const pa=project(a,axis),pb=project(b,axis);
  if(pa.max<=pb.min || pb.max<=pa.min)return null;
  const positive=pb.max-pa.min,negative=pa.max-pb.min;
  const d=Math.min(positive,negative);
  if(d<depth){depth=d;const sign=positive<negative?1:-1;normal={x:axis.x*sign,y:axis.y*sign};}
 }
 const facing=a.reduce((best,p)=>p.x*normal.x+p.y*normal.y<best.x*normal.x+best.y*normal.y?p:best,a[0]);
 return {normal,depth,point:facing};
}
export function vehicleContacts(a:VehicleCollider,b:VehicleCollider):ContactManifold[]{
 const result:ContactManifold[]=[];
 for(const fa of [a.footprint,...(a.articulated??[])])for(const fb of [b.footprint,...(b.articulated??[])]){
  const c=convexContact(getVehicleBoundaryPoints({...a,footprint:fa}),getVehicleBoundaryPoints({...b,footprint:fb}));if(c)result.push(c);
 }
 return result;
}
