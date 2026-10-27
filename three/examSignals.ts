import * as THREE from 'three';
import type {LevelData} from '../types';
import {examSignalGreen} from '../utils/drivingExam';
/** The lamps and scoring use the same simulation clock, including pause. */
export function addExamSignals(scene:THREE.Scene,level:LevelData,track:(g:THREE.BufferGeometry)=>THREE.BufferGeometry){
 const lamps:{red:THREE.MeshBasicMaterial;green:THREE.MeshBasicMaterial}[]=[];
 for(const station of level.exam??[]){if(station.kind!=='signal')continue;
  const group=new THREE.Group();group.name='ExamTrafficLight';group.position.set(station.x,0,station.y-52);
  const dark=new THREE.MeshStandardMaterial({color:'#283038',roughness:.8});
  const pole=new THREE.Mesh(track(new THREE.CylinderGeometry(1,1.3,45,8)),dark);pole.position.y=22.5;group.add(pole);
  const box=new THREE.Mesh(track(new THREE.BoxGeometry(7,19,4)),dark);box.position.y=47;group.add(box);
  const red=new THREE.MeshBasicMaterial({color:'#ed3333'}),green=new THREE.MeshBasicMaterial({color:'#153329'});
  for(const [mat,h] of [[red,52],[green,42]] as const){const lens=new THREE.Mesh(track(new THREE.SphereGeometry(2.35,12,8)),mat);lens.scale.z=.35;lens.position.set(0,h,2.3);group.add(lens);}
  // Face the incoming lane (from the east for the westbound exam stop line).
  group.rotation.y=Math.PI/2;scene.add(group);lamps.push({red,green});
 }
 let last:boolean|undefined;
 return (time:number)=>{const green=examSignalGreen(time);if(last===green)return;last=green;for(const lamp of lamps){lamp.red.color.set(green?'#42282b':'#ff3934');lamp.green.color.set(green?'#50f294':'#153329');}};
}
