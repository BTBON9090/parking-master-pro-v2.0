import assert from 'node:assert/strict';
import {blastCameraShake} from '../utils/blastCameraShake';

const magnitude = (v: {x:number;y:number;z:number}) => Math.hypot(v.x,v.y,v.z);
assert(magnitude(blastCameraShake(.2, 0)) > .1, 'nearby impact shakes camera');
assert(magnitude(blastCameraShake(.2, 2000)) < magnitude(blastCameraShake(.2, 0)), 'distance attenuates shake');
assert.equal(magnitude(blastCameraShake(.2, 3500)), 0, 'remote view is unaffected');
assert.equal(magnitude(blastCameraShake(3, 0)), 0, 'shake ends');
assert.equal(magnitude(blastCameraShake(Infinity, 0)), 0, 'paused frame does not shake');
assert(magnitude(blastCameraShake(2.7, 0)) < .1, 'shake fades before ending');
console.log('blast camera shake tests passed');
