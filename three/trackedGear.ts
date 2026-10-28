import * as THREE from 'three';
import type {CarMeshParts} from './geometries';

/** Visual differential for the continuous belts and their road wheels. The
 * four end wheels still provide suspension contacts; the extra rollers are
 * visual only and must not inflate the suspension's supported mass. */
export function bindTrackedGear(source:THREE.Group,parts:CarMeshParts){
 const rollers:{roll:THREE.Object3D;side:number;radius:number}[]=parts.wheels.map((roll,i)=>({roll,side:Math.sign(parts.wheelMounts[i].position.x),radius:Number(roll.userData.wheelRadius)||5}));
 for(const sideName of ['L','R'])for(let i=1;i<5;i++){
  const node=source.getObjectByName(`WheelRoad${i}${sideName}`);if(!node)continue;
  const parent=node.parent!,roll=new THREE.Group();parent.add(roll);roll.position.copy(node.position);roll.quaternion.copy(node.quaternion);roll.scale.copy(node.scale);roll.attach(node);
  rollers.push({roll,side:sideName==='L'?1:-1,radius:5});
 }
 const phases:{value:number}[]=[];
 source.traverse(node=>{
  if(!(node instanceof THREE.Mesh)||!node.name.startsWith('TrackBelt'))return;
  const material=(node.material as THREE.MeshStandardMaterial).clone(),phase={value:0};
  const side=Math.sign(node.getWorldPosition(new THREE.Vector3()).x)|| (node.name.includes('L')?1:-1);
  material.color.set('#343c3e');material.roughness=.94;
  material.onBeforeCompile=shader=>{
   shader.uniforms.trackPhase=phase;
   shader.vertexShader='varying vec3 trackLocal;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntrackLocal=position;');
   shader.fragmentShader='uniform float trackPhase;varying vec3 trackLocal;\n'+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat tread=abs(fract((trackLocal.z+trackLocal.y*.42)*5.8+trackPhase)-.5);float edge=smoothstep(.07,.07+fwidth(tread)*1.5,tread);diffuseColor.rgb*=mix(.48,1.14,edge);');
  };
  material.customProgramCacheKey=()=> 'continuous-track-31';node.material=material;
  phases.push(phase);(phase as any).side=side;
 });
 parts.group.userData.updateTracks=(distance:number,yaw:number)=>{
  for(const wheel of rollers)wheel.roll.rotation.x+=(distance-wheel.side*yaw*16.6)/wheel.radius;
  for(const phase of phases)phase.value=(phase.value+(distance-(phase as any).side*yaw*16.6)*.58)%1;
 };
}
