/** Vehicle-local X is left, Y up, Z forward. Suspension travel changes only
 * mount Y: locking the WORLD footprint by moving local Z slid hubs out of
 * their wheel arches on hills. All support queries use the pitched footprint. */
export function projectedWheelZ(mountY: number, localZ: number, pitchRad: number): number {
  return mountY * Math.sin(pitchRad) + localZ * Math.cos(pitchRad);
}

export function requiredWheelMountY(contactHeight: number, rootY: number, wheelRadius: number,
  localZ: number, pitchRad: number): number {
  return (contactHeight + wheelRadius - rootY + localZ * Math.sin(pitchRad))
    / Math.max(0.2, Math.cos(pitchRad));
}

export function requiredWheelOffset(contactHeight: number, rootY: number, wheelRadius: number,
  baseMountY: number, localZ: number, pitchRad: number): number {
  return requiredWheelMountY(contactHeight, rootY, wheelRadius, localZ, pitchRad) - baseMountY;
}

/** Re-sample the road/solid kerb along the actual suspension axis. The upper
 * end must be collision-free (raise the chassis to its bump-stop bound first).
 * A bounded bracket also handles kerb corners, where a single height sample
 * or an unconstrained fixed-point iteration can oscillate across the edge. */
export function solveWheelContact(rootY: number, radius: number, localZ: number, pitch: number,
  minY: number, maxY: number, supportAtZ: (z: number) => number): number {
  const c=Math.cos(pitch), s=Math.sin(pitch);
  const gap=(y:number)=>rootY+y*c-localZ*s-radius-supportAtZ(projectedWheelZ(y,localZ,pitch));
  let low=minY, high=maxY, a=gap(low), b=gap(high);
  if(a>=0) return low; // road beyond full droop: genuinely airborne wheel
  if(b<=0) return high;
  // Flat road normally finishes after one secant. Bisect periodically to
  // guarantee progress on discontinuous edges rather than spending frames.
  for(let i=0;i<20;i++) {
    const y=i%3===2 ? (low+high)/2 : low+(high-low)*(-a)/(b-a);
    const g=gap(y);
    if(g>=0){high=y;b=g;}else{low=y;a=g;}
    if(Math.abs(g)<1e-6) return y;
    if(high-low<1e-5) break;
  }
  return high;
}

/** Lowest root height at full compression. Contact heights must be sampled
 * at projectedWheelZ(baseY + bump, localZ, pitch), not the unpitched axle. */
export function minimumContactRootHeight(contacts: number[], radii: number[], baseY: number[],
  localZ: number[], bump: number, pitch: number): number {
  return Math.max(...contacts.map((height,i)=>height+radii[i]
    -(baseY[i]+bump)*Math.cos(pitch)+localZ[i]*Math.sin(pitch)));
}

export function wheelContactGap(worldCenterY: number, wheelRadius: number, surfaceHeight: number): number {
  return worldCenterY - wheelRadius - surfaceHeight;
}

export function isWheelGroundedByGap(gap: number, liftTolerance = 0.10, penetrationLimit = 0.30): boolean {
  return Number.isFinite(gap) && gap <= liftTolerance && gap >= -penetrationLimit;
}
