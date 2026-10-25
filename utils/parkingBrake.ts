/** Latched parking brake and held handbrake are independent input sources. */
export function parkingBrakeApplied(latched:boolean,held:boolean){return latched||held;}
