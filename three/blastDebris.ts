import * as THREE from 'three';
import type {Obstacle} from '../types';
/** A bounded, local-map visual effect; no real-world blast model. */
export function blastDistance(o:Obstacle,p:THREE.Vector3){
 const dx=p.x-o.x,dy=p.z-o.y,c=Math.cos(o.rotation),s=Math.sin(o.rotation);
 const x=Math.max(0,Math.abs(dx*c+dy*s)-(o.type==='car'?o.height:o.width)/2),z=Math.max(0,Math.abs(-dx*s+dy*c)-(o.type==='car'?o.width:o.height)/2);
 const y=Math.max(0,(o.elevation??0)-p.y,p.y-((o.elevation??0)+(o.verticalHeight??20)));
 return Math.hypot(x,y,z);
}
export class BlastDebris{
 readonly group=new THREE.Group();private mesh:THREE.InstancedMesh;private age=0;private pieces:Array<{p:THREE.Vector3;v:THREE.Vector3;spin:THREE.Vector3;size:THREE.Vector3;floor:number;settled:boolean}>=[];
 constructor(point:THREE.Vector3,obstacles:Obstacle[],private ground:(x:number,z:number)=>number){
  const geo=new THREE.IcosahedronGeometry(1,0),mat=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1,flatShading:true});
  const random=(n:number)=>{const v=Math.sin(n*923.41+point.x*.13+point.z*.07)*43758.5453;return v-Math.floor(v);};
  const add=(origin:THREE.Vector3,size:number,index:number,speedScale=1)=>{const a=random(index+1)*Math.PI*2,speed=(18+random(index+2)*65)*speedScale;this.pieces.push({p:origin.clone(),v:new THREE.Vector3(Math.cos(a)*speed,(24+random(index+4)*85)*speedScale,Math.sin(a)*speed),spin:new THREE.Vector3(random(index+8)*4,random(index+9)*4,random(index+10)*4),size:new THREE.Vector3(size*(.5+random(index+5)),size*(.5+random(index+6)),size*(.5+random(index+7))),floor:ground(origin.x,origin.z),settled:false});};
  // The surface plume exists even when nothing destructible is in range (e.g. a bridge deck).
  // Keep it on the impacted surface and simulate the pieces visually, never as collision bodies.
  for(let i=0;i<240;i++){
   const n=i*13,a=random(n+3)*Math.PI*2,r=Math.sqrt(random(n+4))*24;
   const x=point.x+Math.cos(a)*r,z=point.z+Math.sin(a)*r;
   const surface=ground(x,z),y=Math.abs(surface-point.y)<12?surface:point.y;
   add(new THREE.Vector3(x,y+.4,z),.35+random(n+5)*1.9,n,0.7+random(n+6)*.6);
  }
  const groundCount=this.pieces.length;
  obstacles.slice(0,18).forEach((o,i)=>{
   const size=Math.max(.8,Math.min(9,Math.min(o.width,o.height)*.1));
   for(let j=0;j<20;j++){
    const n=5000+i*300+j*13,dx=(random(n)-.5)*o.width,dz=(random(n+1)-.5)*o.height,c=Math.cos(o.rotation),s=Math.sin(o.rotation);
    const origin=new THREE.Vector3(o.x+dx*c-dz*s,(o.elevation??point.y)+random(n+2)*Math.min(o.verticalHeight??20,45),o.y+dx*s+dz*c);
    add(origin,size*(.45+random(n+3)),n);
   }
  });
  this.mesh=new THREE.InstancedMesh(geo,mat,this.pieces.length);this.mesh.frustumCulled=false;
  const color=new THREE.Color();for(let i=0;i<this.pieces.length;i++){const tint=random(i*11+8000);color.set(i<groundCount?(tint<.45?'#635340':tint<.8?'#897760':'#aba28f'):(tint<.35?'#716d63':tint<.7?'#a39a89':'#c0b8a7'));this.mesh.setColorAt(i,color);}
  this.group.add(this.mesh);this.step(0);
 }
 get finished(){return this.age>12;}
 step(dt:number){this.age+=dt;const m=new THREE.Matrix4(),q=new THREE.Quaternion();this.pieces.forEach((b,i)=>{if(dt>0&&!b.settled){b.v.y-=30*dt;b.p.addScaledVector(b.v,dt);if(b.v.y<0&&b.p.y<b.floor+12){b.floor=this.ground(b.p.x,b.p.z);if(b.p.y<b.floor+1){b.p.y=b.floor+1;b.v.y=Math.abs(b.v.y)*.24;b.v.x*=.65;b.v.z*=.65;if(b.v.length()<3)b.settled=true;}}}q.setFromEuler(new THREE.Euler(b.spin.x*this.age,b.spin.y*this.age,b.spin.z*this.age));m.compose(b.p,q,b.size);this.mesh.setMatrixAt(i,m);});this.mesh.instanceMatrix.needsUpdate=true;}
 dispose(){this.group.removeFromParent();this.mesh.geometry.dispose();(this.mesh.material as THREE.Material).dispose();}
}
