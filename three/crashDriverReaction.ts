import * as THREE from 'three';
/** Cartoon recovery only: uses the same clothed ragdoll meshes, no gore. */
export class CrashDriverReaction {
 readonly root=new THREE.Group();
 elapsed=0;
 phase='爬起来';
 private originals:{p:THREE.Vector3;q:THREE.Quaternion}[];
 private yaw:number;
 private tearGeo=new THREE.IcosahedronGeometry(.16,0);
 private tearMat=new THREE.MeshBasicMaterial({color:0x8bdcf5});
 private tears=[new THREE.Mesh(this.tearGeo,this.tearMat),new THREE.Mesh(this.tearGeo,this.tearMat)];
 constructor(private parts:THREE.Object3D[],position:THREE.Vector3,private wreck:()=>THREE.Vector3){
  this.root.name='driver-recovery-performance';this.root.position.copy(position);
  const toward=wreck().sub(position);this.yaw=Math.atan2(toward.x,toward.z);
  this.root.rotation.y=this.yaw+Math.PI;
  this.root.updateMatrixWorld();
  this.tears.forEach(t=>{t.visible=false;this.root.add(t);});
  this.originals=parts.map(p=>{
   this.root.attach(p);return {p:p.position.clone(),q:p.quaternion.clone()};
  });
 }
 step(dt:number){
  this.elapsed+=dt;const t=this.elapsed;
  const smooth=(n:number)=>{n=THREE.MathUtils.clamp(n,0,1);return n*n*(3-2*n);};
  const rise=smooth(t/2.3),turn=smooth((t-2.5)/1.7),kneel=smooth((t-5.4)/1.8),cry=Math.max(0,t-7.2);
  this.phase=t<2.5?'爬起来':t<5.4?'回头看看残骸':t<7.2?'跪下':'抱头痛哭';
  this.root.rotation.y=this.yaw+Math.PI*(1-turn);
  const bob=cry>0?Math.sin(cry*7)*.13:0;
  const poses=[
   {p:[0,9.4-3.4*kneel+bob,0],r:[.08+ .4*kneel,0,0]},
   {p:[0,13.7-3.9*kneel+bob,1.2*kneel],r:[.1+.5*kneel,Math.sin(cry*3)*.07,0]},
   {p:[-2.6,9.2-1.1*kneel+bob,.9*kneel],r:[.08+.37*kneel,0,-.12-.55*kneel]},
   {p:[2.6,9.2-1.1*kneel+bob,.9*kneel],r:[.08+.37*kneel,0,.12+.55*kneel]},
   {p:[-1.2,3.2-1.2*kneel,-1.8*kneel],r:[1.0*kneel,0,0]},
   {p:[1.2,3.2-1.2*kneel,-1.8*kneel],r:[1.0*kneel,0,0]},
  ];
  this.tears.forEach((tear,i)=>{tear.visible=cry>0;const drop=(cry*1.25+i*.5)%1;tear.position.set((i?1:-1)*.65,9.7+bob-drop*2.4,2.6+drop*.25);});
  this.parts.forEach((part,i)=>{
   const pose=poses[i];part.position.copy(this.originals[i].p).lerp(new THREE.Vector3(...pose.p as [number,number,number]),rise);
   part.quaternion.copy(this.originals[i].q).slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(...pose.r as [number,number,number])),rise);
  });
 }
 dispose(){this.tearGeo.dispose();this.tearMat.dispose();}
}
