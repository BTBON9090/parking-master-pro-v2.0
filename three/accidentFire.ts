import * as THREE from 'three';

/** Lightweight stylised fire/smoke and a clothed driver leaving the wreck.
 * This is an arcade animation, not a real fire/injury simulation. */
export class AccidentFire {
 readonly group=new THREE.Group();
 private elapsed=0;
 private readonly materials:THREE.Material[]=[];
 private readonly geometries:THREE.BufferGeometry[]=[];
 private readonly flame:THREE.Points;
 private readonly smoke:THREE.Points;
 private readonly actor=new THREE.Group();
 private shock:THREE.Mesh|null=null;
 private flash:THREE.Mesh|null=null;
 private readonly limbs:THREE.Mesh[]=[];
 private readonly direction:THREE.Vector3;
 constructor(origin:THREE.Vector3,heading:number,private readonly explosion:boolean){
  this.group.name=explosion?'explosion-and-driver-crawl':'fire-and-driver-exit';
  this.group.position.copy(origin);
  this.direction=new THREE.Vector3(-Math.sin(heading),0,Math.cos(heading));
  const makePoints=(count:number,color:number,size:number,opacity:number)=>{
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*3),3));
   const material=new THREE.PointsMaterial({color,size,opacity,transparent:true,depthWrite:false,sizeAttenuation:true});
   this.geometries.push(geometry);this.materials.push(material);const points=new THREE.Points(geometry,material);points.frustumCulled=false;this.group.add(points);return points;
  };
  this.flame=makePoints(30,0xff952c,5,.72);this.smoke=makePoints(45,0x55575a,8,.30);
  if(explosion){
   const shockGeo=new THREE.RingGeometry(1,1.2,32),shockMat=new THREE.MeshBasicMaterial({color:0xffbc5d,transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false});
   const flashGeo=new THREE.IcosahedronGeometry(1,1),flashMat=new THREE.MeshBasicMaterial({color:0xffc267,transparent:true,opacity:.75,depthWrite:false});
   this.geometries.push(shockGeo,flashGeo);this.materials.push(shockMat,flashMat);
   this.shock=new THREE.Mesh(shockGeo,shockMat);this.shock.rotation.x=-Math.PI/2;this.shock.position.y=.3;this.group.add(this.shock);
   this.flash=new THREE.Mesh(flashGeo,flashMat);this.flash.position.y=8;this.group.add(this.flash);
  }
  const suit=new THREE.MeshLambertMaterial({color:'#d98036'}),dark=new THREE.MeshLambertMaterial({color:'#345d7b'});
  this.materials.push(suit,dark);
  const part=(name:string,w:number,h:number,d:number,x:number,y:number,mat:THREE.Material)=>{
   const geo=new THREE.BoxGeometry(w,h,d);this.geometries.push(geo);const mesh=new THREE.Mesh(geo,mat);mesh.name=name;mesh.position.set(x,y,0);this.actor.add(mesh);return mesh;
  };
  part('escape-torso',3.6,5,2.3,0,8,suit);part('escape-head',2.5,2.5,2.5,0,11.8,suit);
  this.limbs.push(part('escape-left-arm',1.1,4,1.2,-2.5,8,suit),part('escape-right-arm',1.1,4,1.2,2.5,8,suit),
   part('escape-left-leg',1.3,4.5,1.3,-.9,3,dark),part('escape-right-leg',1.3,4.5,1.3,.9,3,dark));
  this.actor.name='escaping-driver';this.actor.rotation.y=-heading;this.group.add(this.actor);
 }
 step(dt:number){
  this.elapsed+=Math.max(0,Math.min(.1,dt));const t=this.elapsed;
  if(this.shock&&this.flash){const k=Math.min(1,t/.7);this.shock.scale.setScalar(1+k*36);(this.shock.material as THREE.MeshBasicMaterial).opacity=.65*(1-k);
   this.flash.scale.setScalar(1+Math.sin(Math.min(1,t/.35)*Math.PI)*13);(this.flash.material as THREE.MeshBasicMaterial).opacity=.75*Math.max(0,1-t/.45);}
  const update=(points:THREE.Points,smoke:boolean)=>{
   const attr=points.geometry.getAttribute('position') as THREE.BufferAttribute;
   for(let i=0;i<attr.count;i++){
    const phase=((t*(smoke?.55:1.25)+i*.137)%1),angle=i*2.399+t*(smoke?.16:.5),spread=(smoke?2+phase*8:2+phase*2);
    attr.setXYZ(i,Math.cos(angle)*spread,4+phase*(smoke?38:17),Math.sin(angle)*spread);
   }attr.needsUpdate=true;
  };update(this.flame,false);update(this.smoke,true);
  const delay=this.explosion?.35:.7,progress=Math.max(0,Math.min(1,(t-delay)/(this.explosion?4:2.6)));
  this.actor.visible=t>=delay;
  this.actor.position.copy(this.direction).multiplyScalar(8+progress*48);
  // After an explosion the driver starts low and crawls before standing;
  // the other accident uses an upright, hurried exit.
  const crawl=this.explosion&&progress<.62;
  this.actor.rotation.z=crawl?-.75*(1-Math.max(0,(progress-.4)/.22)):0;
  this.actor.position.y=crawl?1.5:0;
  const stride=Math.sin(t*(crawl?7:11))*(crawl?.45:.75)*(progress<1?1:0);
  this.limbs[0].rotation.z=stride;this.limbs[1].rotation.z=-stride;
  this.limbs[2].rotation.z=-stride;this.limbs[3].rotation.z=stride;
  // Once safe, turn back towards the wreck and kneel with hands at the head.
  if(progress>=1 && t>delay+(this.explosion?4:2.6)+.8){
   const reaction=Math.min(1,(t-delay-(this.explosion?4:2.6)-.8)/.8);
   this.actor.rotation.y=-headingForDirection(this.direction)+Math.PI*reaction;
   this.actor.position.y=-1.2*reaction;
   this.limbs[0].rotation.z=-1.8*reaction;this.limbs[1].rotation.z=1.8*reaction;
   this.limbs[2].rotation.x=1.05*reaction;this.limbs[3].rotation.x=1.05*reaction;
  }
 }
 dispose(){this.group.removeFromParent();this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());}
}

function headingForDirection(direction:THREE.Vector3){return Math.atan2(-direction.x,direction.z);}
