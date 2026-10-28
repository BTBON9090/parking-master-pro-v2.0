import * as THREE from 'three';
import {CarType,type CarConfig} from '../types';
/** Repartition authored triangles, preserving every vertex and the silhouette.
 * A door is a separate mesh, not a decorative box over the original body. */
export function separateExteriorPanels(root:THREE.Group,cfg:CarConfig){
 const bodyRoot=root.getObjectByName('Body');if(!bodyRoot)return;
 const bodies:THREE.Mesh[]=[];bodyRoot.traverse(n=>{if(n instanceof THREE.Mesh)bodies.push(n);});
 root.updateWorldMatrix(true,true);
 const eye=root.getObjectByName('DriverEye')?.getWorldPosition(new THREE.Vector3());
 const eyeZ=eye?.z??cfg.length*.05;
 const frontMin=[CarType.SEMI,CarType.US22].includes(cfg.id)?-18:-10;
 const frontMax=[CarType.SEMI,CarType.US22].includes(cfg.id)?12:4;
 for(const body of bodies){
 const geom=body.geometry,positions=geom.getAttribute('position'),index=geom.index;
 const groups=new Map<string,number[]>([['Body',[]]]);
 const v=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()],normal=new THREE.Vector3(),center=new THREE.Vector3();
 for(let t=0;t<(index?.count??positions.count);t+=3){
  const ids=[0,1,2].map(k=>index?index.getX(t+k):t+k);
  ids.forEach((id,k)=>v[k].fromBufferAttribute(positions,id).applyMatrix4(body.matrixWorld));
  center.copy(v[0]).add(v[1]).add(v[2]).multiplyScalar(1/3);
  normal.copy(v[1]).sub(v[0]).cross(v[2].clone().sub(v[0])).normalize();
  let key='Body';
  if(Math.abs(normal.x)>.5&&Math.abs(center.x)>cfg.width*.30&&center.y>cfg.height*.13&&center.y<cfg.height*.78){
   const dz=center.z-eyeZ;
   // A long body triangle crossing two doors stays on the shell. Classifying
   // only its centroid accidentally detached the entire side of a small cab.
   const z=v.map(p=>p.z-eyeZ);
   if(dz>frontMin&&dz<frontMax&&Math.min(...z)>frontMin-.3&&Math.max(...z)<frontMax+.3)key='DoorFront'+(center.x>0?'L':'R');
   else if(cfg.length<65&&dz>-22&&dz<=-10&&Math.min(...z)>-22.3&&Math.max(...z)<-9.7)key='DoorRear'+(center.x>0?'L':'R');
  }
  if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(...ids);
 }
 for(const [key,ids] of groups){
  if(!ids.length)continue;
  // Compact vertices too: retaining the whole shell's unused vertices would
  // give a detached door the bounding box and collision hull of an entire car.
  const subset=geom.clone();subset.clearGroups();subset.setIndex(ids);
  const geometry=subset.toNonIndexed();subset.dispose();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  if(key==='Body')body.geometry=geometry;
  else{const panel=new THREE.Mesh(geometry,body.material);panel.name=key;panel.position.copy(body.position);panel.quaternion.copy(body.quaternion);panel.scale.copy(body.scale);panel.castShadow=body.castShadow;panel.receiveShadow=body.receiveShadow;panel.userData.detachable=true;panel.userData.partRole='door-panel';body.parent!.add(panel);}
 }
 }
}
