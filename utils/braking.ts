/** Tyre-limited arcade brake model; forces use speed units per 60 Hz frame.
 * The mechanical rear handbrake is deliberately outside service-brake ABS. */
export function brakeResponse(pedal:number, handbrake:boolean, speed:number, absEnabled:boolean,
  brakeMax:number, grip:number) {
  const moving=Math.abs(speed)>.06;
  const serviceLock=moving && !absEnabled && pedal>Math.max(.18,.82*grip);
  const frontLocked=serviceLock;
  const rearLocked=moving && (handbrake || serviceLock);
  const service=pedal*brakeMax*grip*(serviceLock?.76:1);
  // Rear axle carries less normal load during deceleration. Four-wheel foot
  // braking remains substantially stronger than a rear-only parking brake.
  const hand=handbrake?brakeMax*grip*.46:0;
  const force=handbrake ? Math.min(brakeMax*grip,hand+service*.64) : service;
  return {force,frontLocked,rearLocked,
    lateralGripScale:frontLocked?.12:rearLocked?.58:1,
    absActive:absEnabled && !serviceLock && pedal>.82 && moving};
}
