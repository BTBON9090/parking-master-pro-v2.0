import * as THREE from 'three';
const offset=new THREE.Vector3(-150,220,-100);
const direction=offset.clone().normalize();
const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize();
const up=new THREE.Vector3().crossVectors(direction,right).normalize();
/** Anchor the light's orthographic raster to world-space texels. Following the
 * car sub-pixel by sub-pixel made hard shadow edges crawl at parking speed. */
export function stableSunTarget(position:THREE.Vector3,extent:number,resolution:number){
 const texel=extent*2/resolution;
 const x=position.dot(right),y=position.dot(up);
 return position.clone().addScaledVector(right,Math.round(x/texel)*texel-x).addScaledVector(up,Math.round(y/texel)*texel-y);
}
