import * as THREE from 'three';
/** Clamp expanded seat travel against the actual cabin, not one limit for all cars.
 * Recomputed only when the player changes the adjustment. Units: 10 / metre. */
export class SeatClearance {
 private key='';private result=new THREE.Vector3();private meshes:THREE.Mesh[]=[];private ray=new THREE.Raycaster();
 constructor(private root:THREE.Object3D,private eye:THREE.Vector3){
  root.traverse(n=>{if(!(n instanceof THREE.Mesh))return;for(let p:THREE.Object3D|null=n;p;p=p.parent)if(p.name==='driver-hands')return;this.meshes.push(n);});
 }
 constrain(desired:THREE.Vector3){
  const key=desired.toArray().join(',');if(key===this.key)return this.result;this.key=key;
  this.root.updateWorldMatrix(true,true);
  const origin=this.root.localToWorld(this.eye.clone()),end=this.root.localToWorld(desired.clone()),delta=end.sub(origin),distance=delta.length();
  if(distance<1e-5){this.result.copy(desired);return this.result;}
  const sides=new Map<THREE.Material,THREE.Side>();
  for(const mesh of this.meshes)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(!sides.has(m)){sides.set(m,m.side);m.side=THREE.DoubleSide;}
  this.ray.set(origin,delta.normalize());this.ray.near=.001;this.ray.far=distance+.35;
  const hit=this.ray.intersectObjects(this.meshes,false)[0];sides.forEach((side,m)=>{m.side=side;});
  const allowed=hit?Math.max(0,Math.min(distance,hit.distance-.35)):distance;
  this.result.copy(this.root.worldToLocal(origin.addScaledVector(delta,allowed)));return this.result;
 }
}
