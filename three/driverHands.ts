import * as THREE from 'three';

type GripMode='hold'|'reach';
type Grip={side:number;angle:number;lift:number;regripping:boolean;mode:GripMode};
const HALF_PI=Math.PI/2;

/**
 * Clock positions are measured from the top of the rim: left 9 = -π/2,
 * right 3 = π/2. Positive wheel angle is a left turn (vehicleModels negates
 * the input angle before calling the hands). During a left turn the right
 * hand remains on the rim; the left hand lifts after reaching 6 and rejoins
 * at 3, as the right hand arrives at 9. The motion mirrors for a right turn.
 * Angles stay unwrapped, so palms move continuously across the clock seam.
 * Reversing the wheel retraces the same path without snapping or sliding.
 */
export class SteeringGripController {
 readonly grips:Grip[]=[-1,1].map(side=>({side,angle:side*HALF_PI,lift:0,regripping:false,mode:'hold'}));
 update(angle:number,_elapsed?:number){
  if(!Number.isFinite(angle))return this.grips;
  const magnitude=Math.abs(angle), direction=Math.sign(angle);
  // Lift the lower hand between a quarter and a half turn; repeat after each
  // further full turn. At exactly 6 or 3 o'clock it is on the rim.
  const phase=((magnitude-HALF_PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
  const isReach=magnitude>HALF_PI&&phase>1e-10&&phase<HALF_PI-1e-10;
  for(const g of this.grips){
   g.angle=g.side*HALF_PI-angle;
   const lifting=isReach&&g.side===-direction;
   g.lift=lifting?.075*Math.sin(Math.PI*phase/HALF_PI):0;
   g.regripping=lifting;
   g.mode=lifting?'reach':'hold';
  }
  return this.grips;
 }
}

/** Two fixed-length articulated arms; elbow bends outwards rather than
 * stretching as a hand moves. Local Z points down the wheel. */
export class DriverHands {
 readonly group=new THREE.Group();
 private arms:{hand:THREE.Group;forearm:THREE.Mesh;upper:THREE.Mesh;side:number;displayAngle:number;displayLift:number;visualHolding:boolean;delayedGrip:boolean}[]=[];
 private lastVisualTime=0;
 private previousVisualAngle=0;
 private grips=new SteeringGripController();
 private readonly axis=new THREE.Vector3(0,1,0);
 private readonly grip=new THREE.Vector3();
 private readonly wrist=new THREE.Vector3();
 private readonly shoulder=new THREE.Vector3();
 private readonly direction=new THREE.Vector3();
 private readonly perpendicular=new THREE.Vector3();
 private readonly elbow=new THREE.Vector3();
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
   this.arms.push({hand,forearm,upper,side,displayAngle:side*HALF_PI,displayLift:0,visualHolding:true,delayedGrip:false});
  }
  this.update(0);
 }
 update(angle:number,elapsed?:number){
  const link=(m:THREE.Mesh,a:THREE.Vector3,b:THREE.Vector3,r:number)=>{m.position.copy(a).add(b).multiplyScalar(.5);this.direction.subVectors(b,a);const length=this.direction.length();m.scale.set(r,length,r);m.quaternion.setFromUnitVectors(this.axis,this.direction.multiplyScalar(1/length));};
  const samples=this.grips.update(angle,elapsed);
  const now=typeof performance!=='undefined'?performance.now():Date.now();
  const dt=Math.max(0,Math.min(.05,elapsed??(this.lastVisualTime?(now-this.lastVisualTime)/1000:0)));
  this.lastVisualTime=now;
  const wheelDelta=angle-this.previousVisualAngle;this.previousVisualAngle=angle;
  const heldAtFrameStart=this.arms.map(arm=>arm.visualHolding);
  for(const [index,arm] of this.arms.entries()){
   const sample=samples[index];
   // Bound visible movement when input jumps several degrees in one frame.
   const maxAngle=Math.max(.001,8*dt),maxLift=Math.max(.0005,.5*dt);
   const otherHolding=heldAtFrameStart[1-index];
   const delayRelease=arm.visualHolding&&!otherHolding&&(sample.mode!=='hold'||arm.delayedGrip)&&Math.abs(wheelDelta)>.000001;
   let liftTarget:number;
   if(delayRelease){
    // Keep the last real rim grip until the incoming hand visibly arrives.
    arm.delayedGrip=true;arm.displayAngle-=wheelDelta;
    liftTarget=0;
   }else{
    if(arm.delayedGrip||sample.mode!=='hold')arm.visualHolding=false;
    arm.delayedGrip=false;
    const gap=sample.angle-arm.displayAngle;
    if(arm.visualHolding){
     arm.displayAngle=sample.angle;
     liftTarget=0;
    }else{
     arm.displayAngle+=THREE.MathUtils.clamp(gap,-maxAngle,maxAngle);
     // Reach the target angle first, then lower onto the wheel.  Merely
     // matching the angle does not mean a raised palm is actually gripping.
     const aligned=sample.mode==='hold'&&Math.abs(gap)<=maxAngle;
     liftTarget=aligned?0:sample.mode==='hold'?.06:sample.lift;
    }
   }
   arm.displayLift+=THREE.MathUtils.clamp(liftTarget-arm.displayLift,-maxLift,maxLift);
   // Only report a grip after the palm has reached both the correct point
   // around the rim and its surface; the other hand can then release.
   if(!arm.visualHolding&&sample.mode==='hold'&&Math.abs(sample.angle-arm.displayAngle)<1e-8&&arm.displayLift<1e-8){
    arm.visualHolding=true;arm.displayAngle=sample.angle;arm.displayLift=0;
   }
   const a=arm.displayAngle;
   this.grip.set(Math.sin(a)*.18,.045+arm.displayLift,-Math.cos(a)*.18);
   arm.hand.userData.regripping=!arm.visualHolding;arm.hand.userData.gripMode=arm.visualHolding?'hold':'reach';
   arm.hand.position.copy(this.grip);arm.hand.rotation.y=-a+arm.side*Math.PI/2;
   this.wrist.copy(this.grip).add(new THREE.Vector3(0,.02,.03));
   this.shoulder.set(arm.side*.24,.32,.26);
   this.direction.subVectors(this.wrist,this.shoulder);const distance=this.direction.length();this.direction.multiplyScalar(1/distance);
   // When hands cross, bend elbows into different depth planes so the
   // forearms pass above/below one another instead of occupying the same space.
   const crossing=Math.max(0,-arm.side*Math.sin(a));
   this.perpendicular.set(arm.side,arm.side*crossing*2,0);
   this.perpendicular.addScaledVector(this.direction,-this.perpendicular.dot(this.direction)).normalize();
   this.elbow.copy(this.shoulder).addScaledVector(this.direction,distance/2).addScaledVector(this.perpendicular,Math.sqrt(Math.max(0,.30*.30-distance*distance/4)));
   link(arm.forearm,this.wrist,this.elbow,.035);link(arm.upper,this.elbow,this.shoulder,.044);
  }
 }
}
