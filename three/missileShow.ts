import * as THREE from 'three';
import type {LevelData} from '../types';
import {sampleTerrainSurface} from '../utils/terrainSampling';
import {disposeResources} from './disposeResources';
/** Entirely fictional local-map animation. No real targeting or flight model. */
export class MissileShow{
 phase='stowed';time=0;target:THREE.Vector3|null=null;origin=new THREE.Vector3();group=new THREE.Group();rocket=new THREE.Group();blast:THREE.Mesh;flame:THREE.Mesh;last='';speed=0;curve:THREE.CubicBezierCurve3|null=null;launcher:THREE.Object3D|undefined;launchBase=new THREE.Quaternion();legs:THREE.Object3D[]=[];cameraFrom=new THREE.Vector3();cameraRotation=new THREE.Quaternion();
 get locked(){return this.phase!=='stowed';}
 constructor(private scene:THREE.Scene,private vehicle:THREE.Group,private level:LevelData){
  this.launcher=vehicle.getObjectByName('LauncherPivot');if(this.launcher)this.launchBase.copy(this.launcher.quaternion);
  vehicle.traverse(n=>{if(n.name.startsWith('Outrigger')){this.legs.push(n);n.userData.baseX=n.position.x;n.userData.baseY=n.position.y;}});
  const body=new THREE.Mesh(new THREE.CylinderGeometry(2.4,2.4,38,12),new THREE.MeshStandardMaterial({color:'#b6c4b5',roughness:.6}));
  const nose=new THREE.Mesh(new THREE.ConeGeometry(2.4,9,12),body.material);nose.position.y=23;this.rocket.add(body,nose);
  this.flame=new THREE.Mesh(new THREE.ConeGeometry(4,25,12),new THREE.MeshBasicMaterial({color:'#ffc766',transparent:true,opacity:.85}));this.flame.position.y=-31;this.flame.rotation.z=Math.PI;this.rocket.add(this.flame);
  this.blast=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),new THREE.MeshBasicMaterial({color:'#ffb258',transparent:true,opacity:.85,depthWrite:false}));
  this.group.add(this.rocket,this.blast);this.rocket.visible=false;this.blast.visible=false;scene.add(this.group);window.addEventListener('missile-command',this.command);
 }
 command=(e:Event)=>{const d=(e as CustomEvent).detail;
  if(d.action==='deploy'&&this.phase==='stowed'&&Math.abs(this.speed)<.05){this.phase='deploying';this.time=0;}
  if(d.action==='retract'&&['ready','spent'].includes(this.phase)){this.phase='stowed';this.time=0;this.target=null;}
  if(d.action==='target'&&this.phase==='ready'&&Number.isFinite(d.x)&&Number.isFinite(d.y)&&d.x>=0&&d.x<=this.level.mapWidth&&d.y>=0&&d.y<=this.level.mapHeight)this.target=new THREE.Vector3(d.x,sampleTerrainSurface(this.level,d.x,d.y).height,d.y);
  if(d.action==='launch'&&this.phase==='ready'&&this.target){this.phase='countdown';this.time=0;}
  if(d.action==='cancel'&&this.phase==='countdown'){this.phase='ready';this.time=0;}
 };
 step(dt:number,speed:number,camera:THREE.PerspectiveCamera){
  this.speed=speed;this.time+=dt;const deployment=this.phase==='stowed'?0:this.phase==='deploying'?Math.min(1,this.time/3):1;
  if(this.launcher)this.launcher.quaternion.copy(this.launchBase).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2*deployment));
  this.legs.forEach(n=>{n.position.x=n.userData.baseX+Math.sign(n.userData.baseX)*deployment*.55;n.position.y=n.userData.baseY-deployment*.41;});
  if(this.phase==='deploying'&&this.time>=3){this.phase='ready';this.time=0;}
  if(this.phase==='countdown'&&this.time>=5&&this.target){this.phase='flight';this.time=0;this.cameraFrom.copy(camera.position);this.cameraRotation.copy(camera.quaternion);this.origin.copy(this.vehicle.position).add(new THREE.Vector3(0,130,0));if(this.launcher){this.vehicle.updateWorldMatrix(true,true);const box=new THREE.Box3().setFromObject(this.launcher);if(!box.isEmpty()){box.getCenter(this.origin);this.origin.y=box.max.y+12;}}const end=this.target;
   const rise=Math.max(this.origin.y,end.y)+Math.max(400,this.origin.distanceTo(end)*.28);this.curve=new THREE.CubicBezierCurve3(this.origin.clone(),this.origin.clone().setY(rise),end.clone().setY(rise),end.clone());this.rocket.visible=true;
  }
  if(this.phase==='flight'&&this.curve){const t=Math.min(1,this.time/12),p=this.curve.getPoint(t);this.rocket.position.copy(p);this.rocket.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),this.curve.getTangent(t));this.flame.scale.setScalar(1+Math.sin(this.time*50)*.12);
   const view=p.clone().add(new THREE.Vector3(180,350,230));camera.position.copy(this.cameraFrom).lerp(view,Math.min(1,this.time/1.5));const look=p.clone().lerp(this.target!,Math.max(0,(t-.7)/.3));camera.lookAt(look);const desired=camera.quaternion.clone();camera.quaternion.copy(this.cameraRotation).slerp(desired,Math.min(1,this.time/1.5));
   if(t===1){this.phase='impact';this.time=0;this.rocket.visible=false;this.blast.visible=true;this.blast.position.copy(this.target!);}
  }
  if(this.phase==='impact'){this.blast.scale.setScalar(10+this.time*55);(this.blast.material as THREE.MeshBasicMaterial).opacity=Math.max(0,.8-this.time*.25);camera.position.copy(this.target!).add(new THREE.Vector3(170,360,240));camera.lookAt(this.target!);if(this.time>=3){this.blast.visible=false;this.phase='spent';this.time=0;}}
  const state={phase:this.phase,countdown:this.phase==='countdown'?Math.max(1,Math.ceil(5-this.time)):0,stopped:Math.abs(speed)<.05,target:!!this.target};const text=JSON.stringify(state);if(text!==this.last){this.last=text;window.dispatchEvent(new CustomEvent('missile-status',{detail:state}));}
 }
 dispose(){window.removeEventListener('missile-command',this.command);this.group.removeFromParent();disposeResources([this.group]);}
}
