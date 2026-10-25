import * as THREE from 'three';
import type {DamageTier} from '../utils/impactResponse';

/** Runtime edits of the authored shell only. Cached GLBs are never mutated. */
export class VehicleDamage {
 private originals=new Map<THREE.Mesh,THREE.BufferGeometry>();
 private owned=new Set<THREE.BufferGeometry>();
 private hits=0;
 constructor(private source:THREE.Group){}
 private editable(mesh:THREE.Mesh){
  if(!this.originals.has(mesh)){
   this.originals.set(mesh,mesh.geometry);
   mesh.geometry=mesh.geometry.clone();this.owned.add(mesh.geometry);
  }
  return mesh.geometry;
 }
 apply(tier:DamageTier,contact:THREE.Vector3,normal:THREE.Vector3,closing:number):THREE.Mesh[]{
  if(tier==='none'||tier==='severe')return [];
  this.source.updateWorldMatrix(true,true);
  const detached:THREE.Mesh[]=[];
  const candidates:Array<{mesh:THREE.Mesh;indices:number[];score:number}>=[];
  this.source.traverse(node=>{
   if(!(node instanceof THREE.Mesh)||node.userData.nativeWheelPart||/Interior|frame-clone/.test(node.name))return;
   const mats=Array.isArray(node.material)?node.material:[node.material];
   if(mats.length!==1||!(/Headlight|Taillight|ReverseLight|Indicator|MirrorGlass/.test(mats[0].name)||(tier==='moderate'&&mats[0].name==='Glass')))return;
   const pos=node.geometry.getAttribute('position');
   for(const indices of triangleIslands(node.geometry)){
    const center=new THREE.Vector3();for(const i of new Set(indices))center.add(new THREE.Vector3().fromBufferAttribute(pos,i));center.divideScalar(new Set(indices).size).applyMatrix4(node.matrixWorld);
    const score=center.distanceTo(contact);
    if(score<20)candidates.push({mesh:node,indices,score});
   }
  });
  candidates.sort((a,b)=>a.score-b.score);
  for(const {mesh,indices} of candidates.slice(0,tier==='moderate'?4:1)){
   const g=this.editable(mesh),selection=g.clone();selection.setIndex(indices);selection.clearGroups();
   const part=selection.toNonIndexed();selection.dispose();part.applyMatrix4(mesh.matrixWorld);
   const material=(mesh.material as THREE.Material).clone();material.visible=true;material.side=THREE.DoubleSide;
   const fragment=new THREE.Mesh(part,material);fragment.name='detached-'+material.name;fragment.castShadow=true;detached.push(fragment);
   const remove=new Set(indices);
   const remaining=Array.from(g.index?.array??Array.from({length:g.getAttribute('position').count},(_,i)=>i)).filter(i=>!remove.has(i));
   g.setIndex(remaining);g.clearGroups();
  }
  if(tier==='moderate'){
   const depth=THREE.MathUtils.clamp((closing-4)*.42,1,5),radius=18;
   this.source.traverse(node=>{
    if(!(node instanceof THREE.Mesh)||node.userData.nativeWheelPart||/Interior|frame-clone/.test(node.name))return;
    const mats=Array.isArray(node.material)?node.material:[node.material];
    if(!mats.some(m=>/Paint|Cladding|BlackTrim|Chrome|Plate/.test(m.name)))return;
    const pos=node.geometry.getAttribute('position'),inverse=node.matrixWorld.clone().invert();
    const world=new THREE.Vector3();let geometry:THREE.BufferGeometry|undefined;
    for(let i=0;i<pos.count;i++){
     world.fromBufferAttribute(pos,i).applyMatrix4(node.matrixWorld);
     const distance=world.distanceTo(contact);if(distance>=radius)continue;
     const falloff=Math.pow(1-distance/radius,2);
     if(!geometry)geometry=this.editable(node);
     // A smooth dent, confined to the impacted face; wheels and opposite
     // panels keep their authored positions and the shell remains whole.
     const original=this.originals.get(node)!.getAttribute('position');
     const rest=new THREE.Vector3().fromBufferAttribute(original,i).applyMatrix4(node.matrixWorld);
     world.addScaledVector(normal,depth*falloff);
     const offset=world.clone().sub(rest);if(offset.length()>6)world.copy(rest).add(offset.setLength(6));
     world.applyMatrix4(inverse);(geometry.getAttribute('position') as THREE.BufferAttribute).setXYZ(i,world.x,world.y,world.z);
    }
    if(geometry){geometry.getAttribute('position').needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();}
   });
  }
  this.hits++;this.source.userData.damageRevision=this.hits;
  return detached;
 }
 reset(){
  for(const [mesh,geometry] of this.originals)mesh.geometry=geometry;
  for(const geometry of this.owned)geometry.dispose();
  this.originals.clear();this.owned.clear();this.hits=0;this.source.userData.damageRevision=0;
 }
 dispose(){this.reset();}
}

/** Material batches contain many disconnected lamps/windows. Weld positions
 * across hard normals, then detach complete connected islands, never a whole
 * material batch containing lights on both sides of the car. */
function triangleIslands(geometry:THREE.BufferGeometry):number[][]{
 const pos=geometry.getAttribute('position'),indices=Array.from(geometry.index?.array??Array.from({length:pos.count},(_,i)=>i));
 const owners=new Map<string,number>(),parents=Array.from({length:indices.length/3},(_,i)=>i);
 const root=(n:number):number=>parents[n]===n?n:(parents[n]=root(parents[n]));
 for(let t=0;t<indices.length/3;t++)for(let j=0;j<3;j++){
  const i=indices[t*3+j],key=`${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  const prev=owners.get(key);if(prev!==undefined)parents[root(t)]=root(prev);else owners.set(key,t);
 }
 const groups=new Map<number,number[]>();
 for(let t=0;t<indices.length/3;t++){const id=root(t);if(!groups.has(id))groups.set(id,[]);groups.get(id)!.push(...indices.slice(t*3,t*3+3));}
 return [...groups.values()];
}
