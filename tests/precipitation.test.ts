import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PrecipitationField, syncPrecipitation} from '../three/precipitation';
import {DayTime, WeatherType, type UserSettings} from '../types';
import {restoreSettings} from '../utils/settingsStorage';
import {resolveWeatherOptions} from '../utils/weatherOptions';

const values = (field: PrecipitationField) => field.object.geometry.getAttribute('position').array;
for (const kind of ['rain', 'snow'] as const) {
  const snapshots: number[][] = [];
  for (const fps of [30, 60, 90, 120, 144]) {
    let seed = 42;
    const field = new PrecipitationField(kind, () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32));
    for (let frame = 0; frame < fps * 10; frame++) field.step(1 / fps, 230, 2600, -500);
    assert.equal(field.object.position.y, 2580, 'precipitation follows the 260 m mountain road');
    const points = Array.from(values(field));
    snapshots.push(points);
    const sphere = field.object.geometry.boundingSphere!;
    for (let i = 0; i < points.length; i += 3) {
      assert(points[i] >= -600 && points[i] <= 600);
      assert(points[i + 1] >= -3 && points[i + 1] < 600);
      assert(sphere.containsPoint(new THREE.Vector3(points[i], points[i + 1], points[i + 2])), 'culling bounds cover every animated vertex');
    }
    for (const gap of [0, -1, NaN, 10]) field.step(gap, 230, 2600, -500);
    assert.deepEqual(Array.from(values(field)), points, 'pause/background gaps do not advance weather');
    if (kind === 'rain') for (let i = 0; i < points.length; i += 6) assert(Math.abs(points[i + 1] - points[i + 4] - 3) < .0001);
    field.dispose();
  }
  for (const points of snapshots.slice(1)) assert(points.every((v, i) => Math.abs(v - snapshots[0][i]) < .001), `${kind}: equal trajectories at all refresh rates`);
}

const scene = new THREE.Scene(), replacement = new THREE.Scene();
let rain: PrecipitationField | null = null, snow: PrecipitationField | null = null;
for (let mask = 0; mask < 8; mask++) {
  const options = {weatherEnabled: true, weatherRain: !!(mask & 1), weatherSnow: !!(mask & 2), weatherFog: !!(mask & 4)};
  assert.deepEqual(resolveWeatherOptions(options, WeatherType.SUNNY), {rain: options.weatherRain, snow: options.weatherSnow, fog: options.weatherFog});
  rain = syncPrecipitation(scene, rain, 'rain', options.weatherRain);
  snow = syncPrecipitation(scene, snow, 'snow', options.weatherSnow);
  const identities = scene.children.map(x => x.uuid);
  rain = syncPrecipitation(scene, rain, 'rain', options.weatherRain);
  snow = syncPrecipitation(scene, snow, 'snow', options.weatherSnow);
  assert.deepEqual(scene.children.map(x => x.uuid), identities, 'fog/daylight changes reuse particle buffers');
}
assert(rain && snow);
rain = syncPrecipitation(replacement, rain, 'rain', true);
snow = syncPrecipitation(replacement, snow, 'snow', true);
assert.equal(scene.children.length, 0, 'no particles stranded in the placeholder scene');
assert.equal(replacement.children.length, 2);
let geometryDisposed = 0, materialDisposed = 0;
for (const field of [rain!, snow!]) {
  field.object.geometry.addEventListener('dispose', () => geometryDisposed++);
  (field.object.material as THREE.Material).addEventListener('dispose', () => materialDisposed++);
}
rain = syncPrecipitation(replacement, rain, 'rain', false);
snow = syncPrecipitation(replacement, snow, 'snow', false);
assert.equal(replacement.children.length, 0);
assert.equal(geometryDisposed, 2); assert.equal(materialDisposed, 2);
const defaults = {dayTime: DayTime.DAY, weatherEnabled: false, weatherRain: false, weatherSnow: false, weatherFog: false} as UserSettings;
for (const dayTime of [DayTime.DAY, DayTime.NIGHT]) {
  const restored = restoreSettings(defaults, JSON.stringify({...defaults, dayTime, weatherEnabled: true, weatherSnow: true}));
  assert.equal(restored.dayTime, dayTime);
  assert.deepEqual(resolveWeatherOptions(restored, WeatherType.RAINY), {rain: false, snow: true, fog: false});
}
for (const invalid of [undefined, null, 'random', 123]) assert.equal(restoreSettings(defaults, JSON.stringify({dayTime: invalid})).dayTime, DayTime.DAY);
console.log('Precipitation PASS: 30–144 Hz, altitude, bounded vertices, pause, resource reuse/disposal, 8 weather combinations and saved daylight.');
