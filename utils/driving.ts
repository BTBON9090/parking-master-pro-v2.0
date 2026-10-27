/** Game distances use 10 units/metre. Heading grows clockwise in map space. */
export function advanceVehicleCenter(x: number, y: number, heading: number, distance: number, wheelbase: number, steer: number, rearAxleOffset = wheelbase / 2, rearSteer = 0) {
  // Four-wheel-steer bicycle model, integrated at the body centre. `distance`
  // is the centre-path arc length, not the rear-axle travel, so changing the
  // steering angle cannot secretly add or remove longitudinal distance.
  const q = (Math.tan(steer) - Math.tan(rearSteer)) / wheelbase;
  const b = Math.tan(rearSteer) + rearAxleOffset * q;
  const beta = Math.atan(b);
  const curvatureCenter = q * Math.cos(beta);
  const nextHeading = heading + distance * curvatureCenter;
  const travelHeading = heading + beta;
  if (Math.abs(curvatureCenter) < 1e-9) {
    return {
      x: x + distance * Math.cos(travelHeading),
      y: y + distance * Math.sin(travelHeading),
      rotation: nextHeading,
    };
  }
  // Exact circular arc of the centre: chord length and chord direction.
  const chord = 2 * Math.sin(distance * curvatureCenter / 2) / curvatureCenter;
  const chordHeading = travelHeading + distance * curvatureCenter / 2;
  return {
    x: x + chord * Math.cos(chordHeading),
    y: y + chord * Math.sin(chordHeading),
    rotation: nextHeading,
  };
}

export function ackermannAngles(steer: number, wheelbase: number, halfTrack: number) {
  if (Math.abs(steer) < 1e-8) return { left: 0, right: 0 };
  const radius = wheelbase / Math.abs(Math.tan(steer));
  const inner = Math.atan2(wheelbase, Math.max(0.1, radius - halfTrack));
  const outer = Math.atan2(wheelbase, radius + halfTrack);
  return steer > 0 ? { left: outer, right: inner } : { left: -inner, right: -outer };
}

/** Common instantaneous centre for four-wheel steering. */
export function fourWheelSteeringGeometry(
  wheelbase: number,
  halfTrack: number,
  frontSteer: number,
  rearSteer: number,
  rearAxleOffset = wheelbase / 2,
) {
  const q = (Math.tan(frontSteer) - Math.tan(rearSteer)) / wheelbase;
  if (Math.abs(q) < 1e-9) return { q, icrX: Infinity, icrY: Infinity, outerFrontRadius: Infinity, centreRadius: Infinity };
  const icrX = -Math.tan(rearSteer) / q;
  const icrY = 1 / q;
  // Either side can be the true outer wheel for a signed turn.
  const outerFrontRadius = Math.max(
    Math.hypot(wheelbase - icrX, icrY + halfTrack),
    Math.hypot(wheelbase - icrX, icrY - halfTrack),
  );
  // ICR is expressed from the rear axle; the body centre is rearAxleOffset
  // ahead of it, not a full wheelbase ahead.
  const centreRadius = Math.hypot(icrY, rearAxleOffset - icrX);
  return { q, icrX, icrY, outerFrontRadius, centreRadius };
}

/** Per-wheel steering angles that all point at the common four-wheel ICR. */
export function fourWheelAckermannAngles(
  frontSteer: number,
  rearSteer: number,
  wheelbase: number,
  halfTrack: number,
) {
  const geo = fourWheelSteeringGeometry(wheelbase, halfTrack, frontSteer, rearSteer);
  if (!Number.isFinite(geo.q) || Math.abs(geo.q) < 1e-9) {
    return { frontLeft: frontSteer, frontRight: frontSteer, rearLeft: rearSteer, rearRight: rearSteer };
  }
  // Game convention: positive front steer = right turn; vehicleSideX>0 is the
  // LEFT side. ICR lateral +halfTrack is therefore the RIGHT wheel.
  const angleFor = (longitudinal: number, rightLateral: number) => {
    const rx = geo.icrX - longitudinal;
    const ry = geo.icrY - rightLateral;
    let angle = Math.atan2(-rx, ry);
    // The tangent has two equivalent directions; choose the physical road-wheel
    // range. Without this negative-q turns returned ~±150–180° and flipped.
    if (angle > Math.PI / 2) angle -= Math.PI;
    else if (angle < -Math.PI / 2) angle += Math.PI;
    return angle;
  };
  return {
    frontLeft: angleFor(wheelbase, -halfTrack),
    frontRight: angleFor(wheelbase, halfTrack),
    rearLeft: angleFor(0, -halfTrack),
    rearRight: angleFor(0, halfTrack),
  };
}

/** A published rear-steer limit applies to each real wheel. The virtual
 * bicycle angle is smaller because the inner wheel follows a tighter arc. */
export function limitRearAxleSteer(front: number, requestedRear: number, wheelbase: number, halfTrack: number, wheelLimitRad: number): number {
  if (Math.abs(requestedRear) < 1e-9 || wheelLimitRad <= 0) return 0;
  let low = 0, high = Math.abs(requestedRear);
  const sign = Math.sign(requestedRear);
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    const angles = fourWheelAckermannAngles(front, mid * sign, wheelbase, halfTrack);
    if (Math.max(Math.abs(angles.rearLeft), Math.abs(angles.rearRight)) <= wheelLimitRad) low = mid;
    else high = mid;
  }
  return low * sign;
}

/** Friction-limited centre arc including both axles. A sliding body's extra
 * yaw is not additional tyre grip. Distances are game units, speed is m/s. */
export function advanceGripLimitedCenter(x:number,y:number,heading:number,distance:number,wheelbase:number,
 steer:number,rearAxleOffset:number,rearSteer:number,speedMps:number,grip:number) {
 const q=(Math.tan(steer)-Math.tan(rearSteer))/wheelbase;
 const beta=Math.atan(Math.tan(rearSteer)+rearAxleOffset*q);
 const requested=q*Math.cos(beta),limit=9.80665*Math.max(0,grip)/Math.max(.01,speedMps*speedMps)/10;
 const curvature=Math.max(-limit,Math.min(limit,requested));
 const turn=distance*curvature,chord=Math.abs(curvature)<1e-9?distance:2*Math.sin(turn/2)/curvature;
 return {x:x+chord*Math.cos(heading+beta+turn/2),y:y+chord*Math.sin(heading+beta+turn/2),rotation:heading+turn};
}

/** Solve against the same four-wheel ICR and individual rear-wheel limits used while driving. */
export function frontSteerForTurningRadius(wheelbase:number,track:number,radius:number,rearLimitDeg=0):number{
 const limit=rearLimitDeg*Math.PI/180;let low=.05,high=1.1;
 for(let i=0;i<40;i++){
  const front=(low+high)/2,rear=limitRearAxleSteer(front,-limit,wheelbase,track/2,limit);
  if(fourWheelSteeringGeometry(wheelbase,track/2,front,rear).outerFrontRadius>radius)low=front;else high=front;
 }return (low+high)/2;
}
