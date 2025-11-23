import { Vector2, Rect } from "../types";

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
    axes.push({ x: normal.x / length, y: normal.y / length });
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

// Check if car is inside parking spot (approximate)
export function checkParked(car: Rect, spot: Rect): boolean {
  // Distance check
  const dx = car.x - spot.x;
  const dy = car.y - spot.y;
  const dist = Math.sqrt(dx*dx + dy*dy);
  
  // Angle check (normalize to -PI to PI)
  let angleDiff = Math.abs(car.rotation - spot.rotation);
  while(angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  angleDiff = Math.abs(angleDiff);

  // Allow parking in reverse (180 degrees off)
  const isReversePark = Math.abs(angleDiff - Math.PI) < 0.2;
  const isForwardPark = angleDiff < 0.2;

  return dist < 10 && (isForwardPark || isReversePark);
}