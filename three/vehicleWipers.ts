import * as THREE from 'three';
import type {CarConfig} from '../types';
/** Place an animated pair on the actual front glass, in vehicle-local space. */
export function createVehicleWipers(vehicle:THREE.Group,cfg:CarConfig){
 vehicle.updateWorldMatrix(true,true);
 const inverse=vehicle.matrixWorld.clone().invert();
 const candidates:Array<{points:THREE.Vector3[];z:number;area:number}>=[];
 vehicle.traverse(node=>{
  if(!(node instanceof THREE.Mesh)||!node.geometry?.getAttribute('position'))return;
  const materials=Array.isArray(node.material)?node.material:[node.material];
  if(!(materials.some(m=>/^(glass|carglass)$/i.test(m.name))||node.name==='windshield'))return;
  const geo=node.geometry,pos=geo.getAttribute('position'),index=geo.index,transform=inverse.clone().multiply(node.matrixWorld);
  for(let i=0;i<(index?.count??pos.count);i+=3){
   if(materials.length>1&&node.name!=='windshield'){
    const group=geo.groups.find(g=>i>=g.start&&i<g.start+g.count);
    if(!group||!/^(glass|carglass)$/i.test(materials[group.materialIndex??0]?.name??''))continue;
   }
   const points=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(pos,index?index.getX(i+k):i+k).applyMatrix4(transform));
   const cross=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])),area=cross.length();
   const center=points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1/3);
   if(area>0.1&&Math.abs(cross.z)/area>.35&&center.z>0&&center.y>cfg.height*.35)candidates.push({points,z:center.z,area});
  }
 });
 if(!candidates.length)return null;
 // The front-most glass-facing triangles belong to the windshield; exclude
 // glass behind the driver's cabin and exterior mirror glass.
 const front=Math.max(...candidates.map(c=>c.z)),points=candidates.filter(c=>c.z>=front-Math.max(4,cfg.length*.12)).flatMap(c=>c.points);
 const bounds=new THREE.Box3().setFromPoints(points),width=bounds.max.x-bounds.min.x,height=bounds.max.y-bounds.min.y;
 if(width<2||height<1)return null;
 const meanY=points.reduce((s,p)=>s+p.y,0)/points.length,meanZ=points.reduce((s,p)=>s+p.z,0)/points.length;
 const denominator=points.reduce((s,p)=>s+(p.y-meanY)**2,0),slope=denominator?points.reduce((s,p)=>s+(p.y-meanY)*(p.z-meanZ),0)/denominator:0;
 const angle=Math.atan(THREE.MathUtils.clamp(slope,-2,2)),plane=new THREE.Group();plane.name='vehicle-wipers';
 plane.position.set((bounds.min.x+bounds.max.x)/2,bounds.min.y+height*.08,meanZ+slope*(bounds.min.y+height*.08-meanY)+.35);plane.rotation.x=angle;vehicle.add(plane);
 const bladeMat=new THREE.MeshStandardMaterial({color:'#252b2d',roughness:.85,metalness:.2}),bladeGeo=new THREE.BoxGeometry(width*.37,.28,.28),armGeo=new THREE.BoxGeometry(width*.28,.18,.18);
 const pivots:THREE.Group[]=[];
 for(const side of [-1,1]){const pivot=new THREE.Group();pivot.position.x=side*width*.23;plane.add(pivot);const blade=new THREE.Mesh(bladeGeo,bladeMat);blade.position.set(-side*width*.12,0,.1);pivot.add(blade);const arm=new THREE.Mesh(armGeo,bladeMat);arm.position.set(-side*width*.08,-.23,.02);arm.rotation.z=side*.25;pivot.add(arm);pivots.push(pivot);}
 return {plane,pivots,update(enabled:boolean,time:number){const sweep=enabled?(1-Math.cos(time*4.2))*.5:0;pivots[0].rotation.z=-sweep*.9;pivots[1].rotation.z=-sweep*.9;}};
}
