import * as THREE from 'three';
/** Use the exported glass, including the asset's centering transform. Cameras
 * sit behind its rear-facing surface, never inside the housing in front of it. */
export function measuredMirrorMounts(root:THREE.Group):[THREE.Vector3,THREE.Vector3]|null {
 root.updateWorldMatrix(true,true);
 const inverse=root.matrixWorld.clone().invert(),boxes=[new THREE.Box3(),new THREE.Box3()];
 root.traverse(obj=>{
  if(!(obj instanceof THREE.Mesh)||!obj.name.includes('MirrorGlass'))return;
  const p=obj.geometry.getAttribute('position'),matrix=inverse.clone().multiply(obj.matrixWorld),v=new THREE.Vector3();
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(matrix);boxes[v.x>=0?0:1].expandByPoint(v);}
 });
 if(boxes.some(b=>b.isEmpty()))return null;
 return boxes.map(b=>{const v=b.getCenter(new THREE.Vector3());v.z=b.min.z-.16;return v;}) as [THREE.Vector3,THREE.Vector3];
}
