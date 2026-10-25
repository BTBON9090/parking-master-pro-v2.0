import assert from 'node:assert/strict';
import {qualityProfile,nextResolution} from '../utils/renderQuality';
import {parkingBrakeApplied} from '../utils/parkingBrake';
import {restoreSettings} from '../utils/settingsStorage';
import {isNewerVersion} from '../utils/releases';
import type {UserSettings} from '../types';
for(const dpr of [1,2,3]){
 const lo=qualityProfile('low',dpr,true),hi=qualityProfile('ultra',dpr);
 assert(lo.initial<hi.initial);assert(lo.mirrorWidth<hi.mirrorWidth);assert(lo.shadowSize<hi.shadowSize);
 let p=qualityProfile('auto',dpr,true),r=p.initial;
 for(let n=0;n<50;n++)r=nextResolution(r,40,p.floor,p.ceiling);
 assert.equal(r,p.floor);
 for(let n=0;n<100;n++)r=nextResolution(r,12,p.floor,p.ceiling);
 assert.equal(r,p.ceiling);assert.equal(nextResolution(r,18,p.floor,p.ceiling),r);
}
// Momentary release never clears a latched parking brake, nor vice versa.
for(const [latched,held,result] of [[false,false,false],[false,true,true],[true,false,true],[true,true,true]])assert.equal(parkingBrakeApplied(latched,held),result);
const defaults={renderQuality:'auto',volume:.8,cabinVolume:.7,exteriorVolume:.85,steeringSensitivity:1,keyBindings:{handbrake:' ',parkingBrake:'p'}} as UserSettings;
assert.deepEqual(restoreSettings(defaults,'invalid'),defaults);
const saved=restoreSettings(defaults,JSON.stringify({renderQuality:'bogus',volume:5,keyBindings:{handbrake:'x'},unexpected:'injected'}));
assert.equal(saved.renderQuality,'auto');assert.equal(saved.volume,1);assert.equal(saved.keyBindings.parkingBrake,'p');assert.equal(saved.keyBindings.handbrake,'x');assert(!('unexpected' in saved));
assert(isNewerVersion('0.23.0','0.22.0'));assert(!isNewerVersion('0.22.0','0.22.0'));assert(!isNewerVersion('0.9.0','0.22.0'));assert(!isNewerVersion('oops','0.22.0'));
console.log('Round 22: quality adaptation, parking latch, settings migration and version ordering passed.');
