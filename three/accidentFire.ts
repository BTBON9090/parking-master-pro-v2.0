import * as THREE from 'three';

/** Lightweight stylised fire/smoke and a clothed driver leaving the wreck.
 * This is an arcade animation, not a real fire/injury simulation. */
export class AccidentFire {
 readonly group=new THREE.Group();
 private elapsed=0;
 private readonly soot:{mesh:THREE.Mesh;original:THREE.Material|THREE.Material[];copies:THREE.Material[];colors:(THREE.Color|null)[]}[]=[];
 private readonly sprite:THREE.DataTexture;
 private readonly forward:THREE.Vector3;
 private readonly ground?: (x:number,z:number)=>number;
 private readonly actorBounds=new THREE.Box3();
 private readonly width:number;
 private readonly length:number;
 private readonly height:number;
 private readonly materials:THREE.Material[]=[];
 private readonly geometries:THREE.BufferGeometry[]=[];
 private readonly flame:THREE.Points;
 private readonly smoke:THREE.Points;
 private readonly actor=new THREE.Group();
 private shock:THREE.Mesh|null=null;
 private flash:THREE.Mesh|null=null;
 private readonly limbs:THREE.Mesh[]=[];
 private readonly direction:THREE.Vector3;
 constructor(origin:THREE.Vector3,heading:number,private readonly explosion:boolean,vehicle?:{vehicle:THREE.Group;width:number;length:number;height:number;surface?:(x:number,z:number)=>number}){
  this.ground=vehicle?.surface;this.width=vehicle?.width??20;this.length=vehicle?.length??48;this.height=vehicle?.height??17;
  this.forward=new THREE.Vector3(Math.cos(heading),0,Math.sin(heading));
  // Soft procedural particles avoid opaque square flames without texture downloads.
  const pixels=new Uint8Array(32*32*4);
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){const i=(y*32+x)*4,r=Math.hypot((x-15.5)/15.5,(y-15.5)/15.5);
    pixels[i]=pixels[i+1]=pixels[i+2]=255;pixels[i+3]=Math.round(255*Math.pow(Math.max(0,1-r),1.4));}
  this.sprite=new THREE.DataTexture(pixels,32,32);this.sprite.needsUpdate=true;
  vehicle?.vehicle.traverse(obj=>{
   if(!(obj instanceof THREE.Mesh)||/wheel|glass|tyre|tire/i.test(obj.name))return;
   const original=obj.material,copies=(Array.isArray(original)?original:[original]).map(m=>m.clone());
   const colors=copies.map(m=>'color' in m?(m as THREE.MeshStandardMaterial).color.clone():null);
   obj.material=Array.isArray(original)?copies:copies[0];this.soot.push({mesh:obj,original,copies,colors});
  });
  this.group.name=explosion?'explosion-and-driver-crawl':'fire-and-driver-exit';
  this.group.position.copy(origin);
  this.direction=new THREE.Vector3(-Math.sin(heading),0,Math.cos(heading));
  const makePoints=(count:number,color:number,size:number,opacity:number)=>{
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*3),3));
   const material=new THREE.PointsMaterial({color,size,opacity,transparent:true,depthWrite:false,sizeAttenuation:true,map:this.sprite});
   this.geometries.push(geometry);this.materials.push(material);const points=new THREE.Points(geometry,material);points.frustumCulled=false;this.group.add(points);return points;
  };
  this.flame=makePoints(72,0xffa22c,12,.9);this.smoke=makePoints(60,0x33383a,18,.42);
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
   const geo=new THREE.BoxGeometry(w,h,d);this.geometries.push(geo);const mesh=new THREE.Mesh(geo,mat);mesh.name=name;mesh.castShadow=true;mesh.position.set(x,y,0);this.actor.add(mesh);return mesh;
  };
  part('escape-torso',3.6,5,2.3,0,8,suit);part('escape-head',2.5,2.5,2.5,0,11.8,suit);
  this.limbs.push(part('escape-left-arm',1.1,4,1.2,-2.5,8,suit),part('escape-right-arm',1.1,4,1.2,2.5,8,suit),
   part('escape-left-leg',1.3,4.5,1.3,-.9,3,dark),part('escape-right-leg',1.3,4.5,1.3,.9,3,dark));
  this.actor.name='escaping-driver';this.actor.rotation.y=-heading;this.group.add(this.actor);
 }
 step(dt:number){
  this.elapsed+=Math.max(0,Math.min(.1,dt));const t=this.elapsed;
  if(this.shock&&this.flash){const k=Math.min(1,t/.7);this.shock.scale.setScalar(1+k*70);(this.shock.material as THREE.MeshBasicMaterial).opacity=.65*(1-k);
   this.flash.scale.setScalar(1+Math.sin(Math.min(1,t/.35)*Math.PI)*32);(this.flash.material as THREE.MeshBasicMaterial).opacity=.75*Math.max(0,1-t/.45);}
  const growth=this.explosion?1:Math.min(1,.08+t*t/30);
  this.group.userData.fireGrowth=growth;
  const sootColor=new THREE.Color('#151719');
  for(const item of this.soot)item.copies.forEach((m,i)=>{if(item.colors[i]){
    const material=m as THREE.MeshStandardMaterial;material.color.copy(item.colors[i]!).lerp(sootColor,Math.min(.87,t/12));
    if('roughness' in material)material.roughness=Math.max(material.roughness,.85);
  }});
  const update=(points:THREE.Points,smoke:boolean)=>{
   const attr=points.geometry.getAttribute('position') as THREE.BufferAttribute;
   (points.material as THREE.PointsMaterial).size=(smoke?18:12)*(smoke?.6+growth*.6:.35+growth);
   for(let i=0;i<attr.count;i++){
    const phase=(t*(smoke?.25:.85)+i*.137)%1,angle=i*2.399+t*.16;
    const along=(Math.sin(i*8.37)*.24+.2)*this.length*growth;
    const across=Math.cos(angle)*this.width*(smoke?.22+phase*.4:.30)*growth;
    attr.setXYZ(i,this.forward.x*along+this.direction.x*across,this.height*.32+phase*(smoke?65:28)*growth,this.forward.z*along+this.direction.z*across);
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
  // Kneeling/crawling changes the actor's lowest point; keep the feet/knees
  // on the current surface instead of leaving the posed figure suspended.
  this.group.updateWorldMatrix(true,true);
  this.actorBounds.setFromObject(this.actor);
  const x=this.group.position.x+this.actor.position.x,z=this.group.position.z+this.actor.position.z;
  this.actor.position.y+=(this.ground?.(x,z)??this.group.position.y)-this.actorBounds.min.y+.06;
 }
 dispose(){
  for(const item of this.soot){item.mesh.material=item.original;item.copies.forEach(m=>m.dispose());}this.soot.length=0;
  this.sprite.dispose();this.group.removeFromParent();this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());}
}

function headingForDirection(direction:THREE.Vector3){return Math.atan2(-direction.x,direction.z);}
