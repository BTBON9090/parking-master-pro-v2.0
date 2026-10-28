import * as THREE from 'three';
/** Two articulated forearms with regrips at the wheel's upper half. Local Y is
 * the column axis; Z points down the rim. 700 triangles shared by all cars. */
export class DriverHands {
 readonly group=new THREE.Group();
 private arms:{hand:THREE.Group;forearm:THREE.Mesh;upper:THREE.Mesh;side:number}[]=[];
 constructor(parent:THREE.Object3D){
  this.group.name='driver-hands';this.group.userData.partRole='driver';parent.add(this.group);
  const skin=new THREE.MeshStandardMaterial({color:'#b89376',roughness:.92}),cloth=new THREE.MeshStandardMaterial({color:'#2f4856',roughness:1});
  const joint=new THREE.SphereGeometry(1,8,4),tube=new THREE.CylinderGeometry(1,1,1,6);
  for(const side of [-1,1]){
   const hand=new THREE.Group();this.group.add(hand);
   const palm=new THREE.Mesh(joint,skin);palm.scale.set(.034,.026,.047);hand.add(palm);
   for(let n=0;n<4;n++){
    const finger=new THREE.Mesh(tube,skin);finger.scale.set(.008,.044,.008);finger.rotation.x=.8;finger.position.set((n-1.5)*.013,-.014,-.025);hand.add(finger);
   }
   const thumb=new THREE.Mesh(joint,skin);thumb.scale.set(.014,.018,.03);thumb.position.set(-side*.029,-.016,.006);hand.add(thumb);
   const forearm=new THREE.Mesh(tube,cloth),upper=new THREE.Mesh(tube,cloth);this.group.add(forearm,upper);
   this.arms.push({hand,forearm,upper,side});
  }
  this.update(0);
 }
 update(angle:number){
  const link=(m:THREE.Mesh,a:THREE.Vector3,b:THREE.Vector3,r:number)=>{m.position.copy(a).add(b).multiplyScalar(.5);m.scale.set(r,a.distanceTo(b),r);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());};
  for(const arm of this.arms){
   // Alternating hand-over-hand cycles preserve a grip without tying the
   // shoulders to a wheel that may rotate through three complete turns.
   const phase=angle+(arm.side<0?Math.PI:0),cycle=Math.atan2(Math.sin(phase),Math.cos(phase));
   const a=arm.side*Math.PI/2+Math.sin(cycle)*.95;
   const grip=new THREE.Vector3(Math.sin(a)*.18,.045,-Math.cos(a)*.18);
   const release=Math.max(0,(Math.abs(cycle)-2.35)/.79);grip.y+=Math.sin(release*Math.PI)*.08;
   arm.hand.position.copy(grip);arm.hand.rotation.y=-a+arm.side*Math.PI/2;
   const elbow=new THREE.Vector3(arm.side*.26,.26,.25),shoulder=new THREE.Vector3(arm.side*.31,.45,.38);
   link(arm.forearm,grip.clone().add(new THREE.Vector3(0,.02,.03)),elbow,.035);link(arm.upper,elbow,shoulder,.044);
  }
 }
}
