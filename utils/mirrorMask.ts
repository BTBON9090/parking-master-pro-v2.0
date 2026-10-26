import * as THREE from 'three';
/** Discard outside the glass BEFORE compositing; clearing black corner strips
 * paints square patches over the underlying scene, which CSS cannot clip. */
export function createMirrorMaterial(texture: THREE.Texture) {
 const size = {value: new THREE.Vector2(1,1)};
 const radius = {value: 0};
 const material = new THREE.MeshBasicMaterial({map:texture,depthTest:false,depthWrite:false,toneMapped:false});
 material.onBeforeCompile = shader => {
  shader.uniforms.mirrorSize = size; shader.uniforms.mirrorRadius = radius;
  shader.fragmentShader = 'uniform vec2 mirrorSize;\nuniform float mirrorRadius;\n' + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `
   #include <clipping_planes_fragment>
   vec2 q = abs((vMapUv - 0.5) * mirrorSize) - (mirrorSize * 0.5 - mirrorRadius);
   float outsideGlass = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - mirrorRadius;
   if (outsideGlass > 0.0) discard;
  `);
 };
 return {material, setRect(width:number,height:number,r:number) {size.value.set(width,height); radius.value=Math.min(r,width/2,height/2);}};
}
