import assert from 'node:assert/strict';
import {MobileInputController, steeringRulerZoom} from '../utils/mobileInput';
for (const angle of [-500, -30, 0, 30, 500]) for (const fraction of [.05, .3, .7, .95]) {
  const c = new MobileInputController(), x = fraction * 200;
  c.begin('steer', 1, x, 0, angle);
  c.steerAt(1, x, 0, 200, 540);
  assert.equal(c.snapshot().steeringWheelAngle, angle, 'landing anywhere preserves current steering');
  for (const speed of [30, 120, 160, 240, 80, 0]) {
    const zoom = steeringRulerZoom(speed);
    c.steerAt(1, x, 0, 200, 540, zoom);
    assert.equal(c.snapshot().steeringWheelAngle, angle, 'stationary finger cannot steer as zoom changes');
    assert(Math.abs((angle - c.viewCentre(540, zoom)) / 540 * zoom / 2 + .5 - fraction) < 1e-9);
  }
  c.steerAt(1, x + 5, 0, 200, 540, 5);
  assert(Math.abs(c.snapshot().steeringWheelAngle! - angle - 5.4) < 1e-8);
  const current = c.snapshot().steeringWheelAngle!;
  c.end('steer', 1); c.begin('steer', 2, 20, 0, current); c.steerAt(2, 20, 0, 200, 540, 5);
  assert.equal(c.snapshot().steeringWheelAngle, current, 'regrip stays continuous');
  assert(!c.steerAt(1, 100, 0, 200, 540));
}
console.log('Steering anchor PASS: offset landing, regrip, zoom-only changes, relative precision and pointer ownership.');
