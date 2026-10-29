import * as THREE from 'three';

const WIDTH = 1200, HEIGHT = 600;
const wrap = (value: number, span: number) => ((value % span) + span) % span;

/** A bounded visual field around the current road elevation, in world units.
 * Positions are derived from elapsed simulation time, so FPS and pauses do
 * not change snowfall speed or accumulate floating-point drift. */
export class PrecipitationField {
  readonly object: THREE.LineSegments | THREE.Points;
  private readonly seeds: Float32Array;
  private elapsed = 0;

  constructor(readonly kind: 'rain' | 'snow', random = Math.random) {
    const count = kind === 'rain' ? 900 : 800;
    this.seeds = new Float32Array(count * 3);
    for (let i = 0; i < this.seeds.length; i += 3) {
      this.seeds[i] = (random() - .5) * WIDTH;
      this.seeds[i + 1] = random() * HEIGHT;
      this.seeds[i + 2] = (random() - .5) * WIDTH;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * (kind === 'rain' ? 6 : 3)), 3).setUsage(THREE.DynamicDrawUsage));
    // Vertex updates stay inside this fixed volume; do not retain a bounding
    // sphere calculated from only the first frame's random particle positions.
    geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-600, -3, -600), new THREE.Vector3(600, 600, 600));
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
    this.object = kind === 'rain'
      ? new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({color: 0x99bbdd, transparent: true, opacity: .45, depthWrite: false}))
      : new THREE.Points(geometry, new THREE.PointsMaterial({color: 0xffffff, size: 4, transparent: true, opacity: .7, depthWrite: false}));
    this.object.name = `weather-${kind}`;
    this.writePositions();
  }

  step(dt: number, x: number, roadHeight: number, z: number) {
    this.object.position.set(x, roadHeight - 20, z);
    if (!Number.isFinite(dt) || dt <= 0 || dt > .25) return;
    this.elapsed += dt;
    this.writePositions();
  }

  private writePositions() {
    const attribute = this.object.geometry.getAttribute('position') as THREE.BufferAttribute;
    const positions = attribute.array as Float32Array;
    const stride = this.kind === 'rain' ? 6 : 3;
    const speed = this.kind === 'rain' ? 1080 : 120;
    for (let i = 0, j = 0; i < this.seeds.length; i += 3, j += stride) {
      const sway = this.kind === 'snow' ? 30 * (Math.cos(i * .001) - Math.cos(this.elapsed + i * .001)) : 0;
      positions[j] = wrap(this.seeds[i] + sway + WIDTH / 2, WIDTH) - WIDTH / 2;
      positions[j + 1] = wrap(this.seeds[i + 1] - this.elapsed * speed, HEIGHT);
      positions[j + 2] = this.seeds[i + 2];
      if (stride === 6) {
        positions[j + 3] = positions[j];
        positions[j + 4] = positions[j + 1] - 3;
        positions[j + 5] = positions[j + 2];
      }
    }
    attribute.needsUpdate = true;
  }

  dispose() {
    this.object.removeFromParent();
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
  }
}

/** Fog/daylight changes reuse the same buffers; only changing precipitation
 * itself creates or releases a field. Adding it also migrates placeholder scenes. */
export function syncPrecipitation(scene: THREE.Scene, field: PrecipitationField | null, kind: 'rain' | 'snow', enabled: boolean) {
  if (!enabled) { field?.dispose(); return null; }
  const result = field ?? new PrecipitationField(kind);
  if (result.object.parent !== scene) scene.add(result.object);
  return result;
}
