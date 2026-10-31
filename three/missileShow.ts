import * as THREE from 'three';
import type {LevelData} from '../types';
import {sampleTerrainSurface} from '../utils/terrainSampling';
import {disposeResources} from './disposeResources';
/** Entirely fictional local-map animation. No real targeting or flight model. */
export class MissileShow{
 phase='stowed';time=0;target:THREE.Vector3|null=null;origin=new THREE.Vector3();group=new THREE.Group();rocket=new THREE.Group();blast:THREE.Mesh;flame:THREE.Mesh;last='';speed=0;curve:THREE.CubicBezierCurve3|null=null;launcher:THREE.Object3D|undefined;launchBase=new THREE.Quaternion();legs:THREE.Object3D[]=[];cameraFrom=new THREE.Vector3();cameraRotation=new THREE.Quaternion();orbitAzimuth=.7;orbitPolar=.72;orbitDistance=260;lastWarning=-1;cloud=new THREE.Group();shock:THREE.Mesh;drag:{id:number;x:number;y:number}|null=null;
 get locked(){return this.phase!=='stowed';}
 constructor(private scene:THREE.Scene,private vehicle:THREE.Group,private level:LevelData,private sound?:(kind:'deploy'|'warning'|'launch'|'impact')=>void){
  this.launcher=vehicle.getObjectByName('LauncherPivot');if(this.launcher)this.launchBase.copy(this.launcher.quaternion);
  vehicle.traverse(n=>{if(n.name.startsWith('Outrigger')){this.legs.push(n);n.userData.baseX=n.position.x;n.userData.baseY=n.position.y;}});
  const body=new THREE.Mesh(new THREE.CylinderGeometry(2.4,2.4,38,12),new THREE.MeshStandardMaterial({color:'#b6c4b5',roughness:.6}));
  const nose=new THREE.Mesh(new THREE.ConeGeometry(2.4,9,12),body.material);nose.position.y=23;this.rocket.add(body,nose);
  this.flame=new THREE.Mesh(new THREE.ConeGeometry(4,25,12),new THREE.MeshBasicMaterial({color:'#ffc766',transparent:true,opacity:.85}));this.flame.position.y=-31;this.flame.rotation.z=Math.PI;this.rocket.add(this.flame);
  this.blast=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),new THREE.MeshBasicMaterial({color:'#ffb258',transparent:true,opacity:.85,depthWrite:false}));
  this.shock=new THREE.Mesh(new THREE.RingGeometry(.94,1,64),new THREE.MeshBasicMaterial({color:'#ffe2ad',transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));this.shock.rotation.x=-Math.PI/2;this.cloud.add(this.shock);
  const smoke=new THREE.MeshStandardMaterial({color:'#a79c95',emissive:'#624b40',emissiveIntensity:.48,roughness:1,transparent:true,opacity:.92});
  for(let i=0;i<25;i++){const m=new THREE.Mesh(new THREE.IcosahedronGeometry(1,2),smoke);m.userData.part=i<9?'stem':'cap';m.userData.index=i;this.cloud.add(m);}
  this.group.add(this.rocket,this.blast,this.cloud);this.rocket.visible=false;this.blast.visible=false;this.cloud.visible=false;scene.add(this.group);window.addEventListener('missile-command',this.command);window.addEventListener('camera-pinch-zoom',this.pinchZoom);window.addEventListener('wheel',this.wheelZoom);window.addEventListener('camera-orbit-change',this.orbitChange);window.addEventListener('pointerdown',this.pointerDown);window.addEventListener('pointermove',this.pointerMove);window.addEventListener('pointerup',this.pointerUp);window.addEventListener('pointercancel',this.pointerUp);
 }
 command=(e:Event)=>{const d=(e as CustomEvent).detail;
  if(d.action==='deploy'&&this.phase==='stowed'&&Math.abs(this.speed)<.05){this.phase='deploying';this.time=0;this.sound?.('deploy');}
  if(d.action==='retract'&&['ready','spent'].includes(this.phase)){this.phase='retracting';this.time=0;this.lastWarning=-1;this.target=null;}
  if(d.action==='target'&&this.phase==='ready'&&Number.isFinite(d.x)&&Number.isFinite(d.y)&&d.x>=0&&d.x<=this.level.mapWidth&&d.y>=0&&d.y<=this.level.mapHeight)this.target=new THREE.Vector3(d.x,sampleTerrainSurface(this.level,d.x,d.y).height,d.y);
  if(d.action==='launch'&&this.phase==='ready'&&this.target){this.phase='countdown';this.time=0;}
  if(d.action==='cancel'&&this.phase==='countdown'){this.phase='ready';this.time=0;}
 };
 step(dt:number,speed:number,camera:THREE.PerspectiveCamera){
  this.speed=speed;this.time+=dt;
  // Stabilizers extend before the tube rises; retraction reverses that order.
  let legs=1,tube=1;
  if(this.phase==='stowed'){legs=0;tube=0;}
  else if(this.phase==='deploying'){legs=Math.min(1,this.time/4);tube=THREE.MathUtils.smoothstep(this.time,4,12);}
  else if(this.phase==='retracting'){tube=1-THREE.MathUtils.smoothstep(this.time,0,8);legs=1-THREE.MathUtils.smoothstep(this.time,8,12);}
  if(this.launcher)this.launcher.quaternion.copy(this.launchBase).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2*tube));
  this.legs.forEach(n=>{n.position.x=n.userData.baseX+Math.sign(n.userData.baseX)*legs*5.5;n.position.y=n.userData.baseY-legs*4.1;});
  if(['deploying','retracting'].includes(this.phase)){const second=Math.floor(this.time);if(second!==this.lastWarning){this.lastWarning=second;this.sound?.('warning');}}
  if(this.phase==='deploying'&&this.time>=12){this.phase='ready';this.time=0;}
  if(this.phase==='retracting'&&this.time>=12){this.phase='stowed';this.time=0;}
  if(this.phase==='countdown'&&this.time>=5&&this.target){
   this.phase='ignition';this.time=0;this.sound?.('launch');
   this.origin.copy(this.vehicle.position).add(new THREE.Vector3(0,130,0));
   if(this.launcher){this.vehicle.updateWorldMatrix(true,true);const box=new THREE.Box3().setFromObject(this.launcher);if(!box.isEmpty()){box.getCenter(this.origin);this.origin.y=box.max.y+12;}}
   const end=this.target,rise=Math.max(this.origin.y,end.y)+Math.max(400,this.origin.distanceTo(end)*.28);
   this.curve=new THREE.CubicBezierCurve3(this.origin.clone(),this.origin.clone().setY(rise),end.clone().setY(rise),end.clone());this.rocket.visible=true;
  }
  if(this.phase==='ignition'){
   // The flame appears first, followed by a slow emergence from the tube.
   this.rocket.position.copy(this.origin).add(new THREE.Vector3(0,-32+32*THREE.MathUtils.smoothstep(this.time,.7,3),0));
   this.rocket.quaternion.identity();this.flame.scale.setScalar(.7+Math.sin(this.time*50)*.12);
   if(this.time>=3){this.phase='flight';this.time=0;}
  }
  if(this.phase==='flight'&&this.curve){const t=Math.pow(Math.min(1,this.time/14),2.2),p=this.curve.getPoint(t);this.rocket.position.copy(p);this.rocket.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),this.curve.getTangent(Math.max(.0001,t)));this.flame.scale.setScalar(1+Math.sin(this.time*50)*.12);
   if(t===1){this.phase='impact';this.time=0;this.rocket.visible=false;this.blast.visible=true;this.blast.position.copy(this.target!);this.cloud.visible=true;this.cloud.position.copy(this.target!);this.sound?.('impact');}
  }
  if(this.phase==='impact'){
   const t=this.time,growth=Math.min(1,t/6);this.blast.scale.setScalar(20+Math.min(t,2)*105);(this.blast.material as THREE.MeshBasicMaterial).opacity=Math.max(0,.85-t*.45);
   this.shock.scale.setScalar(20+t*85);(this.shock.material as THREE.MeshBasicMaterial).opacity=Math.max(0,.65-t*.12);
   this.cloud.children.slice(1).forEach(n=>{const i=n.userData.index as number,stem=n.userData.part==='stem',angle=i*2.399,ring=stem?25+(i%3)*12:65+(i%4)*22,height=stem?22+i*35:270+(i%4)*20;n.position.set(Math.cos(angle)*ring*growth,height*growth,Math.sin(angle)*ring*growth);n.scale.setScalar((stem?48:85)*Math.max(.01,growth));});
   if(t>=10){this.blast.visible=false;this.cloud.visible=false;this.phase='spent';this.time=0;}
  }
  if(!['stowed','spent'].includes(this.phase)){
   const focus=this.phase==='impact'?this.target!.clone().add(new THREE.Vector3(0,160*Math.min(1,this.time/6),0)):
     ['ignition','flight'].includes(this.phase)?this.rocket.position.clone():this.vehicle.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,30,0));
   const distance=this.phase==='impact'?Math.max(600,this.orbitDistance):this.orbitDistance;
   camera.position.copy(focus).add(new THREE.Vector3(Math.sin(this.orbitAzimuth)*Math.sin(this.orbitPolar)*distance,Math.cos(this.orbitPolar)*distance,Math.cos(this.orbitAzimuth)*Math.sin(this.orbitPolar)*distance));camera.up.set(0,1,0);camera.lookAt(focus);
  }
  const state={phase:this.phase,countdown:this.phase==='countdown'?Math.max(1,Math.ceil(5-this.time)):0,stopped:Math.abs(speed)<.05,target:!!this.target};const text=JSON.stringify(state);if(text!==this.last){this.last=text;window.dispatchEvent(new CustomEvent('missile-status',{detail:state}));}
 }
 pointerDown=(event:Event)=>{const e=event as PointerEvent;if(['stowed','spent'].includes(this.phase)||(typeof Element!=='undefined'&&e.target instanceof Element&&e.target.closest('[data-ui-control],button,input,canvas.route-radar')))return;this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};};
 pointerMove=(event:Event)=>{const e=event as PointerEvent;if(['stowed','spent'].includes(this.phase)||!this.drag||this.drag.id!==e.pointerId)return;this.orbitAzimuth-=(e.clientX-this.drag.x)*.006;this.orbitPolar=THREE.MathUtils.clamp(this.orbitPolar+(e.clientY-this.drag.y)*.006,.15,1.45);this.drag.x=e.clientX;this.drag.y=e.clientY;};
 pointerUp=(event:Event)=>{if(this.drag?.id===(event as PointerEvent).pointerId)this.drag=null;};
 rebase(){if(this.launcher)this.launchBase.copy(this.launcher.quaternion);this.legs.forEach(n=>{n.userData.baseX=n.position.x;n.userData.baseY=n.position.y;});}
 pinchZoom=(e:Event)=>{const scale=(e as CustomEvent).detail?.scale;if(!['stowed','spent'].includes(this.phase)&&Number.isFinite(scale)&&scale>0)this.orbitDistance=THREE.MathUtils.clamp(this.orbitDistance*scale,100,1800);};
 wheelZoom=(e:Event)=>{const event=e as WheelEvent;if(!['stowed','spent'].includes(this.phase)&&event.target instanceof HTMLCanvasElement)this.orbitDistance=THREE.MathUtils.clamp(this.orbitDistance*(event.deltaY>0?1.1:1/1.1),100,1800);};
 orbitChange=(e:Event)=>{const d=(e as CustomEvent).detail;if(!['stowed','spent'].includes(this.phase)&&d){this.orbitAzimuth=d.azimuth;this.orbitPolar=THREE.MathUtils.clamp(d.polar,.15,1.45);}};
 dispose(){window.removeEventListener('pointerdown',this.pointerDown);window.removeEventListener('pointermove',this.pointerMove);window.removeEventListener('pointerup',this.pointerUp);window.removeEventListener('pointercancel',this.pointerUp);window.removeEventListener('camera-pinch-zoom',this.pinchZoom);window.removeEventListener('wheel',this.wheelZoom);window.removeEventListener('camera-orbit-change',this.orbitChange);window.removeEventListener('missile-command',this.command);this.group.removeFromParent();disposeResources([this.group]);}
}
