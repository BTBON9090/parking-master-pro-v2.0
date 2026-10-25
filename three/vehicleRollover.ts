import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/** Whole-vehicle rigid-body takeover after the pressure centre leaves the
 * tyre support polygon. Wheels remain attached; gravity/contact torques,
 * rather than a canned roll animation, determine whether it rolls or rests. */
export class VehicleRollover {
 readonly world=new CANNON.World({gravity:new CANNON.Vec3(0,-98.0665,0)});
 readonly body:CANNON.Body;
 private ground:CANNON.Body;
 private cg=new THREE.Vector3();
 elapsed=0;
 constructor(private source:THREE.Group,options:{mass:number;width:number;length:number;height:number;cgHeight:number;
  wheels:{position:THREE.Vector3;radius:number;width:number;steer:number}[];velocity:THREE.Vector3;tipX:number;tipZ:number;
  surface:(x:number,z:number)=>number}){
  source.updateWorldMatrix(true,true);this.cg.set(0,options.cgHeight,0);
  const center=this.cg.clone().applyQuaternion(source.quaternion).add(source.position);
  this.body=new CANNON.Body({mass:options.mass,position:new CANNON.Vec3(center.x,center.y,center.z),
   linearDamping:.14,angularDamping:.2,allowSleep:true,sleepSpeedLimit:.45,sleepTimeLimit:2});
  this.body.quaternion.set(source.quaternion.x,source.quaternion.y,source.quaternion.z,source.quaternion.w);
  // Outer shell bounds above the floor; intact tyre cylinders provide the
  // lower and lateral contact extent, with actual wheel radius and width.
  const bottom=1.7,bodyHeight=options.height-bottom;
  this.body.addShape(new CANNON.Box(new CANNON.Vec3(options.width*.48,bodyHeight/2,options.length*.47)),
   new CANNON.Vec3(0,bottom+bodyHeight/2-options.cgHeight,0));
  for(const w of options.wheels){
   const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),w.steer)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2));
   this.body.addShape(new CANNON.Cylinder(w.radius,w.radius,w.width,16),
    new CANNON.Vec3(w.position.x,w.position.y-options.cgHeight,w.position.z),new CANNON.Quaternion(q.x,q.y,q.z,q.w));
  }
  this.body.velocity.set(options.velocity.x,options.velocity.y,options.velocity.z);
  const angular=new THREE.Vector3(options.tipZ*.45,0,-options.tipX*.45).applyQuaternion(source.quaternion);
  this.body.angularVelocity.set(angular.x,angular.y,angular.z);
  this.world.defaultContactMaterial.friction=.75;this.world.defaultContactMaterial.restitution=.06;
  (this.world.solver as CANNON.GSSolver).iterations=20;
  this.world.addBody(this.body);
  const spacing=20,half=600,count=half*2/spacing+1;
  const x0=Math.floor((source.position.x-half)/spacing)*spacing,zTop=Math.ceil((source.position.z+half)/spacing)*spacing;
  const heights=Array.from({length:count},(_,x)=>Array.from({length:count},(_,z)=>options.surface(x0+x*spacing,zTop-z*spacing)));
  this.ground=new CANNON.Body({mass:0,shape:new CANNON.Heightfield(heights,{elementSize:spacing}),position:new CANNON.Vec3(x0,0,zTop)});
  this.ground.quaternion.setFromEuler(-Math.PI/2,0,0);this.world.addBody(this.ground);
 }
 step(dt:number){
  this.world.step(1/120,Math.min(.1,dt),12);this.elapsed+=dt;
  const q=this.body.quaternion;this.source.quaternion.set(q.x,q.y,q.z,q.w);
  this.source.position.set(this.body.position.x,this.body.position.y,this.body.position.z)
    .sub(this.cg.clone().applyQuaternion(this.source.quaternion));
  return {position:this.source.position.clone(),up:new THREE.Vector3(0,1,0).applyQuaternion(this.source.quaternion)};
 }
 dispose(){this.world.removeBody(this.body);this.world.removeBody(this.ground);}
}
