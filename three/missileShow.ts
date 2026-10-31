import * as THREE from 'three';
import type {LevelData} from '../types';
import {sampleTerrainSurface} from '../utils/terrainSampling';
import {disposeResources} from './disposeResources';
/** Entirely fictional local-map animation. No real targeting or flight model. */
export class MissileShow{
 phase='stowed';time=0;target:THREE.Vector3|null=null;origin=new THREE.Vector3();group=new THREE.Group();rocket=new THREE.Group();blast:THREE.Mesh;flame:THREE.Mesh;last='';speed=0;curve:THREE.CubicBezierCurve3|null=null;launcher:THREE.Object3D|undefined;launchBase=new THREE.Quaternion();legs:THREE.Object3D[]=[];cameraFrom=new THREE.Vector3();cameraRotation=new THREE.Quaternion();orbitAzimuth=.7;orbitPolar=.72;orbitDistance=260;lastWarning=-1;cloud=new THREE.Group();shock:THREE.Mesh;drag:{id:number;x:number;y:number}|null=null;smoke=new THREE.Group();launchShock:THREE.Mesh;hydraulics:Array<{base:THREE.Object3D;top:THREE.Object3D;barrel:THREE.Mesh;rod:THREE.Mesh}>=[];
 launcherStored=true;retractTime:number|null=null;vehicleView=false;
 get locked(){return !this.launcherStored;}
 constructor(private scene:THREE.Scene,private vehicle:THREE.Group,private level:LevelData,private sound?:(kind:'deploy'|'warning'|'launch'|'impact'|'flight-start'|'flight-stop')=>void,private wheels:THREE.Object3D[]=[]){
  this.launcher=vehicle.getObjectByName('LauncherPivot');if(this.launcher)this.launchBase.copy(this.launcher.quaternion);
  vehicle.traverse(n=>{if(n.name.startsWith('Outrigger')){this.legs.push(n);n.userData.baseX=n.position.x;n.userData.baseY=n.position.y;}});
  // Stylised proportions follow the visible tube, with a layered nozzle and
  // rounded ogive rather than a thin pencil silhouette.
  const shell=new THREE.MeshStandardMaterial({color:'#b8b8a6',roughness:.48,metalness:.16});
  const dark=new THREE.MeshStandardMaterial({color:'#566056',roughness:.58,metalness:.22});
  const body=new THREE.Mesh(new THREE.CylinderGeometry(7.3,7.3,82,32),shell);this.rocket.add(body);
  const nose=new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(7.3,0),new THREE.Vector2(6.8,4),new THREE.Vector2(5.8,9),new THREE.Vector2(4.2,14),new THREE.Vector2(2.2,18),new THREE.Vector2(.2,21)],32),shell);nose.position.y=41;this.rocket.add(nose);
  for(const y of [-32,2,32]){const band=new THREE.Mesh(new THREE.CylinderGeometry(7.42,7.42,1.2,32),dark);band.position.y=y;this.rocket.add(band);}
  const nozzle=new THREE.Mesh(new THREE.CylinderGeometry(5.2,6.4,5,24),dark);nozzle.position.y=-43.5;this.rocket.add(nozzle);
  this.flame=new THREE.Mesh(new THREE.ConeGeometry(8,105,32,1,true),new THREE.MeshBasicMaterial({color:'#ff8030',transparent:true,opacity:.66,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));this.flame.position.y=-101;this.flame.rotation.z=Math.PI;this.rocket.add(this.flame);
  const core=new THREE.Mesh(new THREE.ConeGeometry(4.4,70,24,1,true),new THREE.MeshBasicMaterial({color:'#fff2bb',transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));core.position.y=14;this.flame.add(core);
  for(let i=0;i<5;i++){const disk=new THREE.Mesh(new THREE.SphereGeometry(1,20,10),new THREE.MeshBasicMaterial({color:i%2?'#8ddaff':'#fff9cb',transparent:true,opacity:.62,depthWrite:false,blending:THREE.AdditiveBlending}));disk.scale.set(3.8-i*.3,2.1,3.8-i*.3);disk.position.y=36-i*13;this.flame.add(disk);}
  const smokeMat=new THREE.MeshBasicMaterial({color:'#989b97',transparent:true,opacity:.38,depthWrite:false});
  for(let i=0;i<24;i++){const puff=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),smokeMat);puff.userData.index=i;this.smoke.add(puff);}
  this.launchShock=new THREE.Mesh(new THREE.RingGeometry(.88,1,48),new THREE.MeshBasicMaterial({color:'#f5d8a8',transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false}));this.launchShock.rotation.x=-Math.PI/2;this.smoke.add(this.launchShock);this.smoke.visible=false;this.group.add(this.smoke);
  for(const side of [-1,1]){const base=vehicle.getObjectByName('HydraulicBase'+side),top=vehicle.getObjectByName('HydraulicTop'+side);if(!base||!top)continue;
   const material=new THREE.MeshStandardMaterial({color:'#404940',metalness:.4,roughness:.48});
   const barrel=new THREE.Mesh(new THREE.CylinderGeometry(1.7,1.7,1,12),material),rod=new THREE.Mesh(new THREE.CylinderGeometry(.85,.85,1,12),new THREE.MeshStandardMaterial({color:'#b9c1b7',metalness:.8,roughness:.25}));vehicle.add(barrel,rod);this.hydraulics.push({base,top,barrel,rod});}
  this.blast=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),new THREE.MeshBasicMaterial({color:'#ffb258',transparent:true,opacity:.85,depthWrite:false}));
  this.shock=new THREE.Mesh(new THREE.RingGeometry(.94,1,64),new THREE.MeshBasicMaterial({color:'#ffe2ad',transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));this.shock.rotation.x=-Math.PI/2;this.cloud.add(this.shock);
  const smoke=new THREE.MeshStandardMaterial({color:'#a79c95',emissive:'#624b40',emissiveIntensity:.48,roughness:1,transparent:true,opacity:.92});
  for(let i=0;i<25;i++){const m=new THREE.Mesh(new THREE.IcosahedronGeometry(1,2),smoke);m.userData.part=i<9?'stem':'cap';m.userData.index=i;this.cloud.add(m);}
  this.group.add(this.rocket,this.blast,this.cloud);this.rocket.visible=false;this.blast.visible=false;this.cloud.visible=false;scene.add(this.group);window.addEventListener('missile-command',this.command);window.addEventListener('camera-pinch-zoom',this.pinchZoom);window.addEventListener('wheel',this.wheelZoom);window.addEventListener('camera-orbit-change',this.orbitChange);window.addEventListener('pointerdown',this.pointerDown);window.addEventListener('pointermove',this.pointerMove);window.addEventListener('pointerup',this.pointerUp);window.addEventListener('pointercancel',this.pointerUp);
 }
 command=(e:Event)=>{const d=(e as CustomEvent).detail;
  if(d.action==='deploy'&&this.phase==='stowed'&&Math.abs(this.speed)<.05){this.phase='deploying';this.time=0;this.launcherStored=false;this.vehicleView=false;this.sound?.('deploy');}
  if(d.action==='view'&&['ignition','flight','impact'].includes(this.phase))this.vehicleView=!!d.vehicle;
  if(d.action==='retract'&&!this.launcherStored&&this.retractTime===null&&['ready','spent','flight','impact'].includes(this.phase)){
   this.retractTime=0;this.lastWarning=-1;
   if(['ready','spent'].includes(this.phase)){this.phase='retracting';this.time=0;this.target=null;}
  }
  if(d.action==='target'&&this.phase==='ready'&&Number.isFinite(d.x)&&Number.isFinite(d.y)&&d.x>=0&&d.x<=this.level.mapWidth&&d.y>=0&&d.y<=this.level.mapHeight)this.target=new THREE.Vector3(d.x,sampleTerrainSurface(this.level,d.x,d.y).height,d.y);
  if(d.action==='launch'&&this.phase==='ready'&&this.target){this.phase='countdown';this.time=0;this.lastWarning=-1;}
  if(d.action==='cancel'&&this.phase==='countdown'){this.phase='ready';this.time=0;}
 };
 step(dt:number,speed:number,camera:THREE.PerspectiveCamera){
  this.speed=speed;this.time+=dt;
  // Stabilizers extend before the tube rises; retraction reverses that order.
  if(this.retractTime!==null)this.retractTime+=dt;
  let legs=1,tube=1;
  if(this.launcherStored){legs=0;tube=0;}
  else if(this.phase==='deploying'){legs=Math.min(1,this.time/4);tube=THREE.MathUtils.smoothstep(this.time,4,12);}
  else if(this.retractTime!==null){tube=1-THREE.MathUtils.smoothstep(this.retractTime,0,8);legs=1-THREE.MathUtils.smoothstep(this.retractTime,8,12);}
  if(this.launcher)this.launcher.quaternion.copy(this.launchBase).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2*tube));
  const lift=(this.phase==='deploying'?THREE.MathUtils.smoothstep(this.time,2,4):this.retractTime!==null?1-THREE.MathUtils.smoothstep(this.retractTime,8,12):this.launcherStored?0:1)*2;
  this.vehicle.position.y+=lift;for(const wheel of this.wheels)wheel.position.y-=lift;
  this.legs.forEach(n=>{n.position.x=n.userData.baseX+Math.sign(n.userData.baseX)*legs*5.5;n.position.y=n.userData.baseY-legs*4.1-lift;});
  this.vehicle.updateWorldMatrix(true,true);
  for(const h of this.hydraulics){const a=this.vehicle.worldToLocal(h.base.getWorldPosition(new THREE.Vector3())),b=this.vehicle.worldToLocal(h.top.getWorldPosition(new THREE.Vector3())),delta=b.clone().sub(a),len=delta.length(),direction=delta.clone().normalize();const pose=(mesh:THREE.Mesh,start:number,end:number)=>{mesh.position.copy(a).addScaledVector(delta,(start+end)/2);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);mesh.scale.y=len*(end-start);};pose(h.barrel,0,.6);pose(h.rod,.56,1);}

  if(['deploying','countdown'].includes(this.phase)||this.retractTime!==null){const second=Math.floor(this.retractTime??this.time);if(second!==this.lastWarning){this.lastWarning=second;this.sound?.('warning');}}
  if(this.phase==='deploying'&&this.time>=12){this.phase='ready';this.time=0;}
  if(this.retractTime!==null&&this.retractTime>=12){this.retractTime=null;this.launcherStored=true;if(['retracting','spent'].includes(this.phase)){this.phase='stowed';this.time=0;this.target=null;}}
  if(this.phase==='countdown'&&this.time>=5&&this.target){
   this.phase='ignition';this.time=0;this.sound?.('launch');
   this.origin.copy(this.vehicle.position).add(new THREE.Vector3(0,130,0));
   if(this.launcher){this.vehicle.updateWorldMatrix(true,true);const box=new THREE.Box3().setFromObject(this.launcher.getObjectByName('TransportTube')??this.launcher);if(!box.isEmpty()){box.getCenter(this.origin);this.origin.y=box.max.y+35;}}
   const end=this.target,rise=Math.max(this.origin.y,end.y)+Math.max(400,this.origin.distanceTo(end)*.28);
   this.curve=new THREE.CubicBezierCurve3(this.origin.clone().add(new THREE.Vector3(0,35,0)),this.origin.clone().setY(rise),end.clone().setY(rise),end.clone());this.rocket.visible=true;this.smoke.visible=true;this.smoke.position.copy(this.origin).add(new THREE.Vector3(0,-45,0));
  }
  if(this.phase==='ignition'){
   // The flame appears first, followed by a slow emergence from the tube.
   this.rocket.position.copy(this.origin).add(new THREE.Vector3(0,-65+65*THREE.MathUtils.smoothstep(this.time,.7,3),0));
   this.rocket.quaternion.identity();this.flame.scale.setScalar(.7+Math.sin(this.time*50)*.12);
   if(this.time>=3){this.phase='flight';this.time=0;this.sound?.('flight-start');}
  }
  if(this.phase==='flight'&&this.curve){const t=Math.pow(Math.min(1,Math.max(0,this.time-2.5)/14),2.2),p=this.time<2.5?this.origin.clone().add(new THREE.Vector3(0,this.time*14,0)):this.curve.getPoint(t);this.rocket.position.copy(p);this.rocket.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),this.time<2.5?new THREE.Vector3(0,1,0):this.curve.getTangent(Math.max(.0001,t)));this.flame.scale.setScalar(1+Math.sin(this.time*50)*.12);
   if(t===1){this.phase='impact';this.time=0;this.sound?.('flight-stop');this.rocket.visible=false;this.blast.visible=true;this.blast.position.copy(this.target!);this.cloud.visible=true;this.cloud.position.copy(this.target!);this.sound?.('impact');}
  }
  if(this.smoke.visible){const age=this.phase==='ignition'?this.time:this.phase==='flight'?this.time+3:30;
   this.smoke.children.forEach(n=>{if(n===this.launchShock)return;const i=n.userData.index as number,angle=i*2.399,spread=Math.min(130,age*14)*(0.35+(i%5)*.16);n.position.set(Math.cos(angle)*spread,(i%4)*7+age*3,Math.sin(angle)*spread);n.scale.setScalar(Math.min(28,4+age*3+(i%3)*3));});
   this.launchShock.scale.setScalar(12+age*32);(this.launchShock.material as THREE.MeshBasicMaterial).opacity=Math.max(0,.55-age*.14);if(age>10)this.smoke.visible=false;
  }
  if(this.phase==='impact'){
   const t=this.time,growth=Math.min(1,t/6);this.blast.scale.setScalar(20+Math.min(t,2)*105);(this.blast.material as THREE.MeshBasicMaterial).opacity=Math.max(0,.85-t*.45);
   this.shock.scale.setScalar(20+t*85);(this.shock.material as THREE.MeshBasicMaterial).opacity=Math.max(0,.65-t*.12);
   this.cloud.children.slice(1).forEach(n=>{const i=n.userData.index as number,stem=n.userData.part==='stem',angle=i*2.399,ring=stem?25+(i%3)*12:65+(i%4)*22,height=stem?22+i*35:270+(i%4)*20;n.position.set(Math.cos(angle)*ring*growth,height*growth,Math.sin(angle)*ring*growth);n.scale.setScalar((stem?48:85)*Math.max(.01,growth));});
   if(t>=10){this.blast.visible=false;this.cloud.visible=false;this.phase=this.launcherStored?'stowed':'spent';this.time=0;if(this.launcherStored)this.target=null;}
  }
  if(!this.vehicleView&&!['stowed','spent'].includes(this.phase)){
   const focus=this.phase==='impact'?this.target!.clone().add(new THREE.Vector3(0,160*Math.min(1,this.time/6),0)):
     ['ignition','flight'].includes(this.phase)?this.rocket.position.clone():this.vehicle.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,30,0));
   const distance=this.phase==='impact'?Math.max(600,this.orbitDistance):this.orbitDistance;
   camera.position.copy(focus).add(new THREE.Vector3(Math.sin(this.orbitAzimuth)*Math.sin(this.orbitPolar)*distance,Math.cos(this.orbitPolar)*distance,Math.cos(this.orbitAzimuth)*Math.sin(this.orbitPolar)*distance));camera.up.set(0,1,0);camera.lookAt(focus);
  }
  const state={phase:this.phase,countdown:this.phase==='countdown'?Math.max(1,Math.ceil(5-this.time)):0,stopped:Math.abs(speed)<.05,target:!!this.target,vehicleView:this.vehicleView,retracting:this.retractTime!==null,launcherStored:this.launcherStored};const text=JSON.stringify(state);if(text!==this.last){this.last=text;window.dispatchEvent(new CustomEvent('missile-status',{detail:state}));}
 }
 pointerDown=(event:Event)=>{const e=event as PointerEvent;if(this.vehicleView||['stowed','spent'].includes(this.phase)||(typeof Element!=='undefined'&&e.target instanceof Element&&e.target.closest('[data-ui-control],button,input,canvas.route-radar')))return;this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};};
 pointerMove=(event:Event)=>{const e=event as PointerEvent;if(this.vehicleView||['stowed','spent'].includes(this.phase)||!this.drag||this.drag.id!==e.pointerId)return;this.orbitAzimuth-=(e.clientX-this.drag.x)*.006;this.orbitPolar=THREE.MathUtils.clamp(this.orbitPolar+(e.clientY-this.drag.y)*.006,.15,1.45);this.drag.x=e.clientX;this.drag.y=e.clientY;};
 pointerUp=(event:Event)=>{if(this.drag?.id===(event as PointerEvent).pointerId)this.drag=null;};
 rebase(){if(this.launcher)this.launchBase.copy(this.launcher.quaternion);this.legs.forEach(n=>{n.userData.baseX=n.position.x;n.userData.baseY=n.position.y;});}
 pinchZoom=(e:Event)=>{const scale=(e as CustomEvent).detail?.scale;if(!this.vehicleView&&!['stowed','spent'].includes(this.phase)&&Number.isFinite(scale)&&scale>0)this.orbitDistance=THREE.MathUtils.clamp(this.orbitDistance*scale,100,1800);};
 wheelZoom=(e:Event)=>{const event=e as WheelEvent;if(!this.vehicleView&&!['stowed','spent'].includes(this.phase)&&event.target instanceof HTMLCanvasElement)this.orbitDistance=THREE.MathUtils.clamp(this.orbitDistance*(event.deltaY>0?1.1:1/1.1),100,1800);};
 orbitChange=(e:Event)=>{const d=(e as CustomEvent).detail;if(!this.vehicleView&&!['stowed','spent'].includes(this.phase)&&d){this.orbitAzimuth=d.azimuth;this.orbitPolar=THREE.MathUtils.clamp(d.polar,.15,1.45);}};
 dispose(){this.sound?.('flight-stop');window.removeEventListener('pointerdown',this.pointerDown);window.removeEventListener('pointermove',this.pointerMove);window.removeEventListener('pointerup',this.pointerUp);window.removeEventListener('pointercancel',this.pointerUp);window.removeEventListener('camera-pinch-zoom',this.pinchZoom);window.removeEventListener('wheel',this.wheelZoom);window.removeEventListener('camera-orbit-change',this.orbitChange);window.removeEventListener('missile-command',this.command);this.group.removeFromParent();for(const h of this.hydraulics){h.barrel.removeFromParent();h.rod.removeFromParent();disposeResources([h.barrel,h.rod]);}disposeResources([this.group]);}
}
