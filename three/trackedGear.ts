import * as THREE from 'three';
import type {CarMeshParts} from './geometries';

/** Bind every road wheel to its own suspension knuckle. The existing end
 * wheels are already in parts; the eight intermediate wheels must enter the
 * same contact solver, preserving world pose while moving under the vehicle. */
export function bindTrackedGear(source:THREE.Group,parts:CarMeshParts){
 const rollers:{roll:THREE.Object3D;side:number;radius:number}[]=parts.wheels.map((roll,i)=>({roll,side:Math.sign(parts.wheelMounts[i].position.x),radius:Number(roll.userData.wheelRadius)||5}));
 for(const sideName of ['L','R'])for(let i=1;i<5;i++){
  const node=source.getObjectByName(`WheelRoad${i}${sideName}`);if(!node)continue;
  node.updateWorldMatrix(true,true);
  const center=parts.group.worldToLocal(node.getWorldPosition(new THREE.Vector3()));
  const mount=new THREE.Group();mount.name=`${node.name}-suspension-pivot`;
  mount.position.copy(center);mount.userData.vehicleSideX=center.x;mount.userData.isFront=false;
  parts.group.add(mount);
  const roll=new THREE.Group();roll.name=`${node.name}-roll-pivot`;roll.userData.nativeWheel=true;
  mount.add(roll);roll.updateWorldMatrix(true,false);roll.attach(node);
  node.traverse(child=>{child.userData.nativeWheelPart=true;});
  roll.updateWorldMatrix(true,true);
  const size=new THREE.Box3().setFromObject(roll,true).getSize(new THREE.Vector3());
  roll.userData.wheelRadius=Math.max(.5,size.y/2);roll.userData.wheelWidth=size.x;
  parts.wheels.push(roll);parts.wheelMounts.push(mount);
  rollers.push({roll,side:sideName==='L'?1:-1,radius:roll.userData.wheelRadius});
 }
 // Visible track shoes follow the closed outline in source metres. The thin
 // side-facing blocks make belt movement readable from the driver's side view;
 // they are visual instances, not individual collision bodies.
 const outline=[[-3.25,.60],[-2.8,1.28],[2.8,1.28],[3.25,.60],[2.8,.12],[-2.8,.12]];
 const lengths=outline.map((p,i)=>{const q=outline[(i+1)%outline.length];return Math.hypot(q[0]-p[0],q[1]-p[1]);});
 const perimeter=lengths.reduce((sum,n)=>sum+n,0), shoeCount=36;
 const shoeGeometry=new THREE.BoxGeometry(.055,.11,.18);
 const shoeMaterial=new THREE.MeshStandardMaterial({color:'#858c78',roughness:.88,metalness:.18});
 const shoes=['L','R'].map(side=>{
  const mesh=new THREE.InstancedMesh(shoeGeometry,shoeMaterial,shoeCount);
  mesh.name=`TrackShoes${side}`;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  (source.getObjectByName('CarRoot')??source).add(mesh);
  return {mesh,side:side==='L'?1:-1,distance:0};
 });
 const dummy=new THREE.Object3D();
 const updateShoes=(track:typeof shoes[number])=>{
  for(let i=0;i<shoeCount;i++){
   let d=((i*perimeter/shoeCount+track.distance)%perimeter+perimeter)%perimeter,segment=0;
   while(segment<lengths.length-1&&d>lengths[segment])d-=lengths[segment++];
   const a=outline[segment],b=outline[(segment+1)%outline.length],t=d/lengths[segment];
   dummy.position.set(track.side*1.995,a[1]+(b[1]-a[1])*t,a[0]+(b[0]-a[0])*t);
   dummy.rotation.set(-Math.atan2(b[1]-a[1],b[0]-a[0]),0,0);dummy.updateMatrix();
   track.mesh.setMatrixAt(i,dummy.matrix);
  }
  track.mesh.instanceMatrix.needsUpdate=true;
 };
 shoes.forEach(updateShoes);
 const phases:{value:number}[]=[];
 source.traverse(node=>{
  if(!(node instanceof THREE.Mesh)||!node.name.startsWith('TrackBelt'))return;
  const material=(node.material as THREE.MeshStandardMaterial).clone(),phase={value:0};
  const side=Math.sign(node.getWorldPosition(new THREE.Vector3()).x)|| (node.name.includes('L')?1:-1);
  material.color.set('#343c3e');material.roughness=.94;
  material.onBeforeCompile=shader=>{
   shader.uniforms.trackPhase=phase;
   shader.vertexShader='varying vec3 trackLocal;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntrackLocal=position;');
   shader.fragmentShader='uniform float trackPhase;varying vec3 trackLocal;\n'+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat tread=abs(fract((trackLocal.z+trackLocal.y*.42)*2.5+trackPhase)-.5);float edge=smoothstep(.12,.12+fwidth(tread)*1.5,tread);diffuseColor.rgb*=mix(.48,1.14,edge);');
  };
  material.customProgramCacheKey=()=> 'continuous-track-32';node.material=material;
  phases.push(phase);(phase as any).side=side;
 });
 parts.group.userData.updateTracks=(distance:number,yaw:number)=>{
  for(const wheel of rollers)wheel.roll.rotation.x+=(distance+wheel.side*yaw*16.6)/wheel.radius;
  for(const phase of phases)phase.value=(phase.value+(distance+(phase as any).side*yaw*16.6)*.25)%1;
  for(const track of shoes){track.distance+=(distance+track.side*yaw*16.6)/10;updateShoes(track);}
 };
}
