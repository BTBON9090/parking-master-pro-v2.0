import assert from 'node:assert/strict';
import {auditCommercialClearance} from '../scripts/probe-commercial-clearance';
import {CarType} from '../types';
import {CAR_MODELS} from '../constants';

// Test the exported assets AND the runtime additions. Shell-only raycasts
// missed the old door cards, flat floor and steering-side seat pedestal.
for(const [id,radius] of [[CarType.MIDIBUS,.43],[CarType.LIGHT_TRUCK,.46]] as const) {
  const {parts,root,report,authoredTriangles}=await auditCommercialClearance(id);
  assert.equal(root?.userData.authored_wheel_cabin_liner,true,`${id}: wheel-well metadata retained`);
  assert(!parts.group.getObjectByName('InteriorCabinLiner'),`${id}: flat fallback must not refill authored cavities`);
  assert(parts.group.getObjectByName('InteriorWheelCabinFloor'),`${id}: retained enclosed cabin floor`);
  assert.equal(parts.wheels.length,4);
  assert(parts.nativeCockpit && parts.nativeCockpit.eye.toArray().every(Number.isFinite));
  const cfg=CAR_MODELS[id],mounts=parts.wheelMounts;
  assert(Math.abs(Math.abs(mounts[0].position.z-mounts[2].position.z)-cfg.wheelbase)<.02,`${id}: wheelbase preserved`);
  assert(Math.abs(Math.abs(mounts[0].position.x-mounts[1].position.x)-cfg.trackWidth)<.02,`${id}: axle track preserved`);
  for(const pose of report){
    assert(Math.abs(pose.radiusM-radius)<.002,`${id}: tyre diameter unchanged`);
    assert.deepEqual(pose.hits,{},`${id}: wheel ${pose.wheel}, steering ${pose.steering}, suspension ${pose.compressionM}m`);
  }
  // The new liner should remain a cheap static mesh; do not silently trade a
  // clipping fix for a large mobile geometry increase.
  assert(authoredTriangles<8000,`${id}: ${authoredTriangles} triangles exceeds mobile asset budget`);
}
console.log('Commercial clearance PASS: 2 GLBs × 4 wheels × 5 steering positions × 3 suspension heights × 192 rays; axle/diameter/cockpit/budget retained.');
