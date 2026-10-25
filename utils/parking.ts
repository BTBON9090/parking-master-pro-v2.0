export interface ParkingSpotLike { x: number; y: number; width: number; height: number; rotation: number; id?: string; requiresDirection?: 'forward' | 'reverse' }

export interface ParkingEvaluation {
  valid: boolean;
  cornersInside: number;
  speedOk: boolean;
  occupied: boolean;
  direction: 'forward' | 'reverse' | 'other';
  directionOk: boolean;
}

export function evaluateParkingSpot(
  spot: ParkingSpotLike,
  car: { x: number; y: number; rotation: number; width: number; length: number },
  speedKmh: number,
  npcOccupied: boolean,
  lineClearance = 0.35,
): ParkingEvaluation {
  const halfL = car.length / 2, halfW = car.width / 2;
  const cosCar = Math.cos(car.rotation), sinCar = Math.sin(car.rotation);
  const corners = [
    { x: halfL, y: halfW }, { x: halfL, y: -halfW },
    { x: -halfL, y: -halfW }, { x: -halfL, y: halfW },
  ].map(p => ({ x: car.x + p.x * cosCar - p.y * sinCar, y: car.y + p.x * sinCar + p.y * cosCar }));
  const cosSpot = Math.cos(-spot.rotation), sinSpot = Math.sin(-spot.rotation);
  const pointIn = (p: { x: number; y: number }) => {
    const dx = p.x - spot.x, dy = p.y - spot.y;
    const lx = dx * cosSpot - dy * sinSpot;
    const ly = dx * sinSpot + dy * cosSpot;
    return Math.abs(lx) <= spot.width / 2 - lineClearance
      && Math.abs(ly) <= spot.height / 2 - lineClearance;
  };
  const cornersInside = corners.filter(pointIn).length;
  const speedOk = Math.abs(speedKmh) < 0.5;
  const angleDiffRaw = Math.abs(car.rotation - spot.rotation) % (Math.PI * 2);
  const angleDiff = Math.min(angleDiffRaw, Math.PI * 2 - angleDiffRaw);
  const direction: ParkingEvaluation['direction'] = angleDiff < 0.35
    ? 'forward'
    : Math.abs(angleDiff - Math.PI) < 0.35 ? 'reverse' : 'other';
  // Ordinary bays accept either parallel heading. Only an explicitly authored
  // task direction rejects the opposite orientation.
  const directionOk = !spot.requiresDirection || direction === spot.requiresDirection;
  return {
    valid: speedOk && !npcOccupied && cornersInside === 4 && directionOk,
    cornersInside, speedOk, occupied: npcOccupied, direction, directionOk,
  };
}

export function accumulateParkingStable(previousMs: number, valid: boolean, frameMs: number, thresholdMs = 1000): { stableMs: number; success: boolean } {
  const stableMs = valid ? previousMs + Math.max(0, frameMs) : 0;
  return { stableMs, success: stableMs >= thresholdMs };
}
