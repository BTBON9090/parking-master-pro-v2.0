import assert from 'node:assert/strict';
import {DEFAULT_DRIVER_SEAT,normalizeDriverSeat,applyDriverSeatToCamera} from '../utils/driverSeat';
import {restoreSettings} from '../utils/settingsStorage';
import {DEFAULT_HOOD_CAMERA_ADJUSTMENT,CAR_MODELS} from '../constants';
import {resolveHoodCameraLocalPose} from '../utils/hoodCamera';
import {CarType,UserSettings} from '../types';
const tune={...DEFAULT_HOOD_CAMERA_ADJUSTMENT};
const defaults={renderQuality:'auto',volume:.8,cabinVolume:.7,exteriorVolume:.85,steeringSensitivity:1,driverSeatAdjustment:{...DEFAULT_DRIVER_SEAT}} as UserSettings;
assert.deepEqual(restoreSettings(defaults,JSON.stringify({})).driverSeatAdjustment,DEFAULT_DRIVER_SEAT,'old settings use neutral seat');
const chosen={forwardCm:12,heightCm:-8,pitchDeg:6};
assert.deepEqual(restoreSettings(defaults,JSON.stringify({driverSeatAdjustment:chosen})).driverSeatAdjustment,chosen,'offsets persist across reload');
assert.deepEqual(normalizeDriverSeat({forwardCm:999,heightCm:-999,pitchDeg:NaN}),{forwardCm:12,heightCm:-8,pitchDeg:0},'out-of-range or invalid values are safe');
assert.deepEqual(applyDriverSeatToCamera(tune,undefined),tune,'neutral seat preserves each car baseline');
for(const id of [CarType.SUV,CarType.US22,CarType.MINING,CarType.TYPE100]){
 const base=resolveHoodCameraLocalPose(CAR_MODELS[id],tune), result=resolveHoodCameraLocalPose(CAR_MODELS[id],applyDriverSeatToCamera(tune,chosen));
 assert(Math.abs(result.z-base.z-1.2)<1e-8,'forward moves eye towards dashboard 12 cm');
 assert(Math.abs(result.y-base.y+.8)<1e-8,'height moves eye down 8 cm');
 assert(Math.abs((Math.atan2(result.targetY-result.y,result.aimDistance)-Math.atan2(base.targetY-base.y,base.aimDistance))*180/Math.PI-6)<1e-8,'pitch tilts aim upward 6 degrees');
 assert.equal(result.x,base.x,'seat does not shift sideways');
}
console.log('Driver-seat view PASS: old settings, persistence, limits, neutral baseline, four vehicle eye/aim offsets');
