import {CrashDriverReaction} from './crashDriverReaction';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import type { Obstacle } from '../types';
/** Bounded, one-shot arcade breakup. The shell uses the actual authored
 * triangles; it is never replaced by generic boxes. No injury/gore visuals. */
export class CrashDebris {
 readonly group=new THREE.Group();
 readonly world=new CANNON.World({gravity:new CANNON.Vec3(0,-98.1,0)});
 private pieces:Array<{mesh:THREE.Object3D;body:CANNON.Body;ground:CANNON.Body;groundHeight:number}>=[];
 reaction:CrashDriverReaction|null=null;
 private driverRest=0;
 private bounds?:{width:number;height:number};
 private geometries:THREE.BufferGeometry[]=[];
 private materials:THREE.Material[]=[];
 private restTime = new Map<CANNON.Body, number>();
 /** Centre of the shell debris, so inspection follows the wreck rather than the old car. */
 get focus(): THREE.Vector3 {
  const shell=this.pieces.filter(p=>p.mesh.name.startsWith('body-fragment-'));
  const p=new THREE.Vector3();for(const item of shell)p.add(item.mesh.position);
  return shell.length?p.divideScalar(shell.length):this.group.position.clone();
 }
 constructor(source:THREE.Group,velocity:{x:number;y:number},heading:number,obstacles:Obstacle[],private surface:(x:number,z:number,height:number)=>number,normal={x:-Math.cos(heading),y:-Math.sin(heading)}, options:{looseParts?:THREE.Object3D[];yawRate?:number;mass?:number;bounds?:{width:number;height:number}}={}) {
  this.bounds=options.bounds;
  this.group.name=options.looseParts?'impact-loose-parts':'vehicle-wreck-and-driver';this.world.allowSleep=true;this.world.broadphase=new CANNON.SAPBroadphase(this.world);this.world.defaultContactMaterial.friction=.55;this.world.defaultContactMaterial.restitution=.22;
  source.updateWorldMatrix(true,true);
  const origin=source.getWorldPosition(new THREE.Vector3());
  const inherited=(center:THREE.Vector3,seed:number)=>{
   const dx=center.x-origin.x,dz=center.z-origin.z,yaw=options.yawRate??0;
   // Every fragment inherits the full pre-impact translation + angular velocity.
   // Scenery then supplies the collision impulse; never erase momentum here.
   const radial=new THREE.Vector2(dx,dz).normalize().multiplyScalar(8);
   return {x:velocity.x-yaw*dz+radial.x,y:12+(seed%3)*3,z:velocity.y+yaw*dx+radial.y};
  };
  if(options.looseParts){
   options.looseParts.forEach((part,i)=>{
    part.traverse(n=>{if(n instanceof THREE.Mesh){this.geometries.push(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material])this.materials.push(m);}});
    const box=new THREE.Box3().setFromObject(part,true),center=box.getCenter(new THREE.Vector3());
    const chunk=new THREE.Group();chunk.name='loose-part-'+i;chunk.position.copy(center);part.position.sub(center);chunk.add(part);
    this.add(chunk,box.getSize(new THREE.Vector3()),2,inherited(center,i),i);
   });
  }else{
  const inverse=source.matrixWorld.clone().invert();
  const buckets=new Map<string,{positions:number[];normals:number[];material:THREE.Material;region:number}>();
  source.traverse(node=>{
   if(!(node instanceof THREE.Mesh)||node.userData.nativeWheelPart||node.name==='InteriorCabinLiner'||node.name.includes('frame-clone'))return;
   const geom=node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone();
   const pos=geom.getAttribute('position'),norm=geom.getAttribute('normal');
   if(!pos||pos.count>100000){geom.dispose();return;}
   const normalMatrix=new THREE.Matrix3().getNormalMatrix(node.matrixWorld);
   const matArray=Array.isArray(node.material)?node.material:[node.material];
   for(let i=0;i<pos.count;i+=3){
    const vertices=[0,1,2].map(j=>{
      const world=new THREE.Vector3().fromBufferAttribute(pos,i+j).applyMatrix4(node.matrixWorld);
      return {world,local:world.clone().applyMatrix4(inverse),normal:norm?new THREE.Vector3().fromBufferAttribute(norm,i+j).applyMatrix3(normalMatrix).normalize():new THREE.Vector3(0,1,0)};
    });
    const materialIndex=geom.groups.find(g=>i>=g.start&&i<g.start+g.count)?.materialIndex??0;
    const original=matArray[materialIndex]??matArray[0];
    for(let region=0;region<12;region++) {
      let polygon=vertices.slice();
      // Clip crossing triangles at actual fracture planes. Assigning a whole
      // long bonnet/window triangle by its centre creates metre-long spikes.
      const clip=(axis:'x'|'y'|'z',limit:number,keepAbove:boolean)=>{
        const result:typeof polygon=[];
        for(let k=0;k<polygon.length;k++){
          const a=polygon[k],b=polygon[(k+1)%polygon.length];
          const da=(a.local[axis]-limit)*(keepAbove?1:-1),db=(b.local[axis]-limit)*(keepAbove?1:-1);
          if(da>=-1e-7)result.push(a);
          if((da>=0)!==(db>=0)){
            const t=da/(da-db);
            result.push({world:a.world.clone().lerp(b.world,t),local:a.local.clone().lerp(b.local,t),normal:a.normal.clone().lerp(b.normal,t).normalize()});
          }
        }
        polygon=result;
      };
      clip('x',0,region%2===1);
      const band=Math.floor((region%6)/2);
      if(band===0)clip('z',8,true);
      else if(band===1){clip('z',-8,true);clip('z',8,false);}
      else clip('z',-8,false);
      clip('y',9,region>=6);
      if(polygon.length<3)continue;
      const key=`${region}:${original.uuid}`;
      if(!buckets.has(key)){const material=original.clone();material.visible=true;this.materials.push(material);buckets.set(key,{positions:[],normals:[],material,region});}
      const bucket=buckets.get(key)!;
      for(let k=1;k<polygon.length-1;k++)for(const p of [polygon[0],polygon[k],polygon[k+1]]) {
        bucket.positions.push(p.world.x,p.world.y,p.world.z);bucket.normals.push(p.normal.x,p.normal.y,p.normal.z);
      }
    }
   }
   geom.dispose();
  });
  for(let region=0;region<12;region++){
   const chunk=new THREE.Group();chunk.name=`body-fragment-${region}`;
   for(const b of buckets.values())if(b.region===region){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(b.normals,3));this.geometries.push(g);const m=new THREE.Mesh(g,b.material);m.castShadow=true;chunk.add(m);}
   if(!chunk.children.length)continue;
   const box=new THREE.Box3().setFromObject(chunk,true),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
   chunk.children.forEach(n=>n.position.sub(center));chunk.position.copy(center);
   this.add(chunk,size,(options.mass??1800)/12,inherited(center,region),region);
  }
  // Four intact tyres/axles detach independently, preserving the authored mesh.
  let wheelIndex=0;
  source.traverse(node=>{
    if(!node.userData.nativeWheel)return;
    const clone=node.clone(true);clone.name=`detached-wheel-${wheelIndex}`;
    node.matrixWorld.decompose(clone.position,clone.quaternion,clone.scale);
    clone.traverse(n=>{if(n instanceof THREE.Mesh){n.material=Array.isArray(n.material)?n.material.map(m=>m.clone()):n.material.clone();for(const m of Array.isArray(n.material)?n.material:[n.material]){m.visible=true;this.materials.push(m);}}});
    const box=new THREE.Box3().setFromObject(clone,true),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    const chunk=new THREE.Group();chunk.name=clone.name;chunk.position.copy(center);clone.position.sub(center);chunk.add(clone);
    this.add(chunk,size,26,inherited(center,wheelIndex),wheelIndex++);
  });
  // A small clothed crash-test driver, connected by ball joints. All parts
  // leave the seat together and articulate as inertia and gravity act.
  const suit=new THREE.MeshStandardMaterial({color:'#d98036',roughness:1});
  const dark=new THREE.MeshStandardMaterial({color:'#345d7b',roughness:1});this.materials.push(suit,dark);
  const forward=new THREE.Vector3(Math.cos(heading),0,Math.sin(heading));
  const base=origin.clone().add(new THREE.Vector3(0,14,0)).addScaledVector(forward,4);
  const bodyParts=[
   {name:'driver-torso',p:[0,0,0],s:[4.2,5.8,2.5],mass:24},
   {name:'driver-head',p:[0,4.3,0],s:[2.8,2.8,2.8],mass:5},
   {name:'driver-left-arm',p:[-3.3,0,0],s:[1.5,5.5,1.5],mass:4},
   {name:'driver-right-arm',p:[3.3,0,0],s:[1.5,5.5,1.5],mass:4},
   {name:'driver-left-leg',p:[-1.2,-6,0],s:[1.8,6,1.8],mass:8},
   {name:'driver-right-leg',p:[1.2,-6,0],s:[1.8,6,1.8],mass:8},
  ];
  const bodies:CANNON.Body[]=[];
  for(let i=0;i<bodyParts.length;i++){
   const p=bodyParts[i],g=i===1?new THREE.IcosahedronGeometry(1.65,1):new THREE.BoxGeometry(...p.s as [number,number,number]);this.geometries.push(g);
   const mesh=new THREE.Mesh(g,i>3?dark:suit);mesh.name=p.name;mesh.position.copy(base).add(new THREE.Vector3(...p.p as [number,number,number]));mesh.castShadow=true;
   bodies.push(this.add(mesh,new THREE.Vector3(...p.s as [number,number,number]),p.mass,{x:velocity.x*.72+Math.sin(heading)*25,y:38,z:velocity.y*.72-Math.cos(heading)*25},i+6));
  }
  const joints=[{i:1,a:[0,3.1,0],b:[0,-1.4,0]},{i:2,a:[-2,2,0],b:[1.3,2,0]},{i:3,a:[2,2,0],b:[-1.3,2,0]},{i:4,a:[-1.2,-3,0],b:[0,3,0]},{i:5,a:[1.2,-3,0],b:[0,3,0]}];
  joints.forEach(j=>{const c=new CANNON.PointToPointConstraint(bodies[0],new CANNON.Vec3(...j.a as [number,number,number]),bodies[j.i],new CANNON.Vec3(...j.b as [number,number,number]),1e5);c.collideConnected=false;this.world.addConstraint(c);});
  }
  obstacles.filter(o=>(o.type==='wall'||o.type==='car'||o.type==='box')&&Math.hypot(o.x-origin.x,o.y-origin.z)<900).sort((a,b)=>Math.hypot(a.x-origin.x,a.y-origin.z)-Math.hypot(b.x-origin.x,b.y-origin.z)).slice(0,100).forEach(o=>{
   const h=o.verticalHeight??(o.type==='car'?17:30),b=new CANNON.Body({mass:0,shape:new CANNON.Box(new CANNON.Vec3(o.width/2,h/2,o.height/2)),position:new CANNON.Vec3(o.x,(o.elevation??0)+h/2,o.y)});
   b.quaternion.setFromEuler(0,(o.type==='car'?Math.PI/2:0)-o.rotation,0);this.world.addBody(b);
  });
 }
 private add(mesh:THREE.Object3D,size:THREE.Vector3,mass:number,v:{x:number;y:number;z:number},seed:number){
  // A tight convex envelope uses the actual fragment vertices, rather than
  // a rotated empty box holding a thin door/roof half a metre off the floor.
  mesh.updateWorldMatrix(true,true);
  const points:THREE.Vector3[]=[];
  mesh.traverse(n=>{if(n instanceof THREE.Mesh){const p=n.geometry.getAttribute('position');
   if(p)for(let i=0;i<p.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(n.matrixWorld).sub(mesh.position));}});
  let shape:CANNON.Shape=new CANNON.Box(new CANNON.Vec3(Math.max(.15,size.x/2),Math.max(.15,size.y/2),Math.max(.15,size.z/2)));
  if(points.length>=4 && Math.min(size.x,size.y,size.z)>.05){
   const hull=new ConvexHull().setFromPoints(points),vertices:CANNON.Vec3[]=[],faces:number[][]=[];
   const indices=new Map<THREE.Vector3,number>();
   for(const face of hull.faces){let edge=face.edge;const ids:number[]=[];
    do{const p=edge.head().point;if(!indices.has(p)){indices.set(p,vertices.length);vertices.push(new CANNON.Vec3(p.x,p.y,p.z));}ids.push(indices.get(p)!);edge=edge.next;}while(edge!==face.edge);
    faces.push(ids);
   }
   if(faces.length>=4){
    if(mesh instanceof THREE.Group){
     const centre=new THREE.Vector3();vertices.forEach(v=>centre.add(new THREE.Vector3(v.x,v.y,v.z)));centre.divideScalar(vertices.length);
     vertices.forEach(v=>{v.x-=centre.x;v.y-=centre.y;v.z-=centre.z;});
     mesh.children.forEach(n=>n.position.sub(centre));mesh.position.add(centre);
    }
    shape=new CANNON.ConvexPolyhedron({vertices,faces});
   }
  }
  const body=new CANNON.Body({mass,shape,position:new CANNON.Vec3(mesh.position.x,mesh.position.y,mesh.position.z),linearDamping:.055,angularDamping:.4});
  // Freshly split shell chunks have overlapping coarse bounds. They collide
  // with scenery, but never explode against each other at the birth frame.
  const groundBit=1 << (this.pieces.length+2);
  body.collisionFilterGroup=2;body.collisionFilterMask=1|groundBit;
  const ground=new CANNON.Body({mass:0,shape:new CANNON.Plane(),collisionFilterGroup:groundBit,collisionFilterMask:2});
  ground.quaternion.setFromEuler(-Math.PI/2,0,0);
  this.world.addBody(ground);
  body.velocity.set(v.x,v.y,v.z);body.angularVelocity.set((seed%3-1)*1.8,.8*(seed%2?1:-1),1.1);body.allowSleep=true;body.sleepSpeedLimit=1;body.sleepTimeLimit=1;
  this.world.addBody(body);this.group.add(mesh);this.pieces.push({mesh,body,ground,groundHeight:this.surface(mesh.position.x,mesh.position.z,mesh.position.y)});return body;
 }
 step(dt:number){
  this.reaction?.step(Math.min(.1,dt));
  if(!this.reaction){
   const driver=this.pieces.filter(p=>p.mesh.name.startsWith('driver-'));
   if(driver.length===6 && driver.every(p=>p.body.velocity.length()<2.5 && p.body.angularVelocity.length()<1.2))this.driverRest+=dt;else this.driverRest=0;
   if(this.driverRest>1.2){
    const torso=driver[0].mesh.position.clone();torso.y=this.surface(torso.x,torso.z,driver[0].groundHeight);
    const bodies=new Set(driver.map(d=>d.body));
    for(const c of [...this.world.constraints])if(bodies.has(c.bodyA)||bodies.has(c.bodyB))this.world.removeConstraint(c);
    for(const d of driver){this.world.removeBody(d.body);this.world.removeBody(d.ground);}
    this.reaction=new CrashDriverReaction(driver.map(d=>d.mesh),torso,()=>this.focus);
    this.group.add(this.reaction.root);this.pieces=this.pieces.filter(p=>!bodies.has(p.body));
   }
  }
  if(this.pieces.every(p=>p.body.sleepState===CANNON.Body.SLEEPING))return;
  // Continue simulating until bodies sleep naturally, including after 18 s.
  const elapsed=Math.max(0,Math.min(.1,dt));
  const steps=Math.max(1,Math.ceil(elapsed*120)),h=elapsed/steps;
  for(let step=0;step<steps;step++){
   for(const piece of this.pieces){
    const {body,ground}=piece;if(body.sleepState===CANNON.Body.SLEEPING)continue;
    const x=body.position.x,z=body.position.z;
    const floor=this.surface(x,z,piece.groundHeight);piece.groundHeight=floor;
    const dx=(this.surface(x+1,z,floor)-this.surface(x-1,z,floor))/2;
    const dz=(this.surface(x,z+1,floor)-this.surface(x,z-1,floor))/2;
    const normal=new CANNON.Vec3(-dx,1,-dz);normal.normalize();
    ground.position.set(x,floor,z);ground.quaternion.setFromVectors(new CANNON.Vec3(0,0,1),normal);ground.aabbNeedsUpdate=true;
   }
   this.world.step(h);
   for(const {body,groundHeight} of this.pieces){
    if(body.sleepState===CANNON.Body.SLEEPING)continue;
    body.updateAABB();
    // Boundaries remain solid even for a fast fragment that crosses a wall
    // between solver steps. Resolve its actual extent and dissipate impact.
    if(this.bounds){
     for(const [axis,limit] of [['x',this.bounds.width],['z',this.bounds.height]] as const){
      if(body.aabb.lowerBound[axis]<0){body.position[axis]-=body.aabb.lowerBound[axis];body.velocity[axis]=Math.abs(body.velocity[axis])*.18;}
      if(body.aabb.upperBound[axis]>limit){body.position[axis]-=body.aabb.upperBound[axis]-limit;body.velocity[axis]=-Math.abs(body.velocity[axis])*.18;}
     }
    }
    if(body.aabb.lowerBound.y<groundHeight+.3){
     // Rolling/contact resistance, applied only on the floor, not in flight.
     const speed=Math.hypot(body.velocity.x,body.velocity.z),scale=Math.max(0,1-98.1*.07*h/Math.max(.001,speed));
     body.velocity.x*=scale;body.velocity.z*=scale;
     const rest=body.velocity.length()<1 && body.angularVelocity.length()<.4 ? (this.restTime.get(body)??0)+h : 0;
     this.restTime.set(body,rest);if(rest>.7){body.velocity.setZero();body.angularVelocity.setZero();body.sleep();}
    }
   }
  }

  for(const {mesh,body} of this.pieces){
   mesh.position.set(body.position.x,body.position.y,body.position.z);mesh.quaternion.set(body.quaternion.x,body.quaternion.y,body.quaternion.z,body.quaternion.w);
  }
 }

 dispose(){this.reaction?.dispose();this.group.removeFromParent();this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());this.world.constraints.slice().forEach(c=>this.world.removeConstraint(c));this.world.bodies.slice().forEach(b=>this.world.removeBody(b));}
}
