import * as THREE from 'three';
/** Dispose every GPU allocation, including detached streamed floors and textures. */
export function disposeResources(roots:THREE.Object3D[],keep:THREE.Object3D[]=[]){
 const preserved=new Set<unknown>();
 for(const root of keep)root.traverse(obj=>{const n=obj as THREE.Mesh;if(n.geometry)preserved.add(n.geometry);if(n.material)for(const m of Array.isArray(n.material)?n.material:[n.material]){preserved.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)preserved.add(v);}});
 const geometry=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 for(const root of roots)root.traverse(obj=>{
  const node=obj as THREE.Mesh;
  if(node.geometry)geometry.add(node.geometry);
  if(node.material)for(const m of Array.isArray(node.material)?node.material:[node.material])materials.add(m);
  if(obj instanceof THREE.DirectionalLight || obj instanceof THREE.SpotLight || obj instanceof THREE.PointLight)obj.shadow?.dispose();
 });
 for(const material of materials){
  for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);
  if(!preserved.has(material))material.dispose();
 }
 textures.forEach(t=>{if(!preserved.has(t))t.dispose();});geometry.forEach(g=>{if(!preserved.has(g))g.dispose();});
 return {geometries:geometry.size,materials:materials.size,textures:textures.size};
}
