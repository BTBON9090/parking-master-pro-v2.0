import * as THREE from 'three';
import type {Vector2} from '../types';
import {collectVehicleFootprint} from '../utils/collisionFootprint';
const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
/** Passive semitrailer axle follows the fifth wheel, including reverse jackknife.
 * Pose is solved in world space and converted back through the tractor's tilt. */
export class ArticulatedTrailer {
 readonly root=new THREE.Group(); readonly footprint:Vector2[];
 private attached=true;
 private axleDistance=94.5;
 private heading:number|undefined;private last=new THREE.Vector3();
 private hitch:THREE.Vector3;private wheels:{node:THREE.Object3D;rest:THREE.Vector3;roll:THREE.Group;radius:number}[]=[];
 constructor(private vehicle:THREE.Group,node:THREE.Object3D){
  this.axleDistance=10*(node.userData.axle_from_hitch_m??9.45);
  vehicle.updateWorldMatrix(true,true);this.hitch=vehicle.worldToLocal(node.getWorldPosition(new THREE.Vector3()));
  this.root.name='articulated-semitrailer';this.root.userData.partRole='articulated-trailer';vehicle.add(this.root);this.root.attach(node);
  this.root.position.copy(this.hitch);node.position.set(0,0,0);
  // The source glTF inherited a 10x SI scale; attach preserved it.
  const nodes:THREE.Object3D[]=[];node.traverse(o=>{if(o.name.startsWith('TrailerWheel')&&!o.parent?.name.startsWith('TrailerWheel'))nodes.push(o);});
  this.root.updateWorldMatrix(true,true);
  for(const wheel of nodes){
   // World-space vertical diameter remains valid regardless of tractor yaw.
   // Use each authored tyre so different wheel sizes remain grounded and roll correctly.
   const radius=new THREE.Box3().setFromObject(wheel,true).getSize(new THREE.Vector3()).y/2;
   const rest=this.root.worldToLocal(wheel.getWorldPosition(new THREE.Vector3()));
   const mount=new THREE.Group();this.root.add(mount);mount.position.copy(rest);
   const roll=new THREE.Group();mount.add(roll);roll.attach(wheel);this.wheels.push({node:mount,rest,roll,radius:Math.max(.1,radius)});
  }
  this.footprint=collectVehicleFootprint(this.root,true);
 }
 reset(){this.heading=undefined;}
 get isAttached(){return this.attached;}
 hitchWorld(){this.vehicle.updateWorldMatrix(true,false);return this.vehicle.localToWorld(this.hitch.clone());}
 trailerHitchWorld(){this.root.updateWorldMatrix(true,false);return this.root.getWorldPosition(new THREE.Vector3());}
 alignment(){
  this.vehicle.updateWorldMatrix(true,false);this.root.updateWorldMatrix(true,false);
  const tractor=new THREE.Vector3(0,0,1).transformDirection(this.vehicle.matrixWorld);
  const trailer=new THREE.Vector3(0,0,1).transformDirection(this.root.matrixWorld);
  return tractor.dot(trailer);
 }
 detach(scene:THREE.Scene){if(!this.attached)return false;scene.attach(this.root);this.attached=false;return true;}
 couple(){
  if(this.attached||this.hitchWorld().distanceTo(this.trailerHitchWorld())>6||this.alignment()<Math.cos(Math.PI/12))return false;
  this.vehicle.attach(this.root);this.attached=true;this.last.copy(this.hitchWorld());
  const forward=new THREE.Vector3(0,0,1).transformDirection(this.root.matrixWorld);this.heading=Math.atan2(forward.x,forward.z);return true;
 }
 step(dt:number,surface:(x:number,z:number)=>number){
  if(!this.attached)return;
  this.vehicle.updateWorldMatrix(true,true);
  const hitch=this.vehicle.localToWorld(this.hitch.clone());
  const forward=new THREE.Vector3(0,0,1).transformDirection(this.vehicle.matrixWorld),tractorYaw=Math.atan2(forward.x,forward.z);
  if(this.heading===undefined||hitch.distanceTo(this.last)>250){this.heading=tractorYaw;this.last.copy(hitch);}
  const travel=hitch.clone().sub(this.last),angle=this.heading!;
  const side=travel.x*Math.cos(angle)-travel.z*Math.sin(angle);
  this.heading=tractorYaw+THREE.MathUtils.clamp(wrap(angle+side/this.axleDistance-tractorYaw),-1.35,1.35);
  const qYaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),this.heading);
  const axle=new THREE.Vector3(0,0,-this.axleDistance).applyQuaternion(qYaw).add(hitch);
  const rearHeight=surface(axle.x,axle.z);
  const pitch=Math.atan2(rearHeight-hitch.y,this.axleDistance);
  const desiredQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,this.heading,0,'YXZ'));
  const parentQ=this.root.parent!.getWorldQuaternion(new THREE.Quaternion());
  this.root.quaternion.copy(parentQ.invert().multiply(desiredQ));
  this.root.position.copy(this.root.parent!.worldToLocal(hitch.clone()));this.root.updateWorldMatrix(true,true);
  const signedTravel=travel.x*Math.sin(this.heading)+travel.z*Math.cos(this.heading);
  for(const w of this.wheels){
   const target=this.root.localToWorld(w.rest.clone());target.y=surface(target.x,target.z)+w.radius;
   const local=this.root.worldToLocal(target);w.node.position.copy(w.rest);w.node.position.y+=THREE.MathUtils.clamp(local.y-w.rest.y,-2.5,2.5);
   w.roll.rotation.x+=signedTravel/w.radius;
  }
  this.last.copy(hitch);this.root.updateWorldMatrix(true,true);
 }
 /** Trailer polygon in tractor-local forward/right coordinates, used as a
  * separate SAT body so an articulated bend doesn't create an invisible wedge. */
 collisionFootprint():Vector2[]{
  const inverse=this.vehicle.matrixWorld.clone().invert().multiply(this.root.matrixWorld);
  return this.footprint.map(p=>{const v=new THREE.Vector3(-p.y,0,p.x).applyMatrix4(inverse);return{x:v.z,y:-v.x};});
 }
}
