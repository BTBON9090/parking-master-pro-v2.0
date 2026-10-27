import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CAR_MODELS,GARAGE_CARS} from '../constants';
import {CarType,UserSettings} from '../types';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
import {measuredMirrorMounts} from '../three/mirrorMounts';
import {createSkidRibbon} from '../three/skidRibbon';
import {AccidentFire} from '../three/accidentFire';
import {resolveHudLayout,sanitizeHudLayout} from '../utils/mobileLayout';
import {steeringWheelMaxDeg} from '../utils/powertrain';
import {rearSteerAngleForSpeed} from '../utils/steering';
import {restoreSettings} from '../utils/settingsStorage';
import {fourWheelSteeringGeometry,limitRearAxleSteer} from '../utils/driving';

// Each vertex must remain on its own surface, including stacked basement slabs.
for(const floor of [0,-48,-96,-144])for(const grade of [0,.22,-.31]){
 const height=(x:number,z:number)=>floor+x*grade+z*.08;
 const geometry=createSkidRibbon({x:10,z:20},{x:14,z:25},2,height),p=geometry.getAttribute('position');
 for(let i=0;i<p.count;i++)assert(Math.abs(p.getY(i)-height(p.getX(i),p.getZ(i))-.22)<.00002);
 assert(geometry.getAttribute('normal').getY(0)>0);geometry.dispose();
}
// Normalized layout is persistent and stays on screen across phone/pad sizes.
const stored={gas:{x:.7,y:.8,width:.12,height:.18},steer:{x:.01,y:.6,width:.22,height:.35}};
const restored=restoreSettings({renderQuality:'auto',volume:.8,cabinVolume:.7,exteriorVolume:.85,steeringSensitivity:1} as UserSettings,JSON.stringify({mobileHudLayout:stored}));
assert.deepEqual(restored.mobileHudLayout,stored);
assert.deepEqual(sanitizeHudLayout({gas:{x:NaN,y:0,width:.1,height:.1},unknown:stored.gas}),{});
for(const [w,h] of [[844,390],[1280,800],[720,360]]){
 const layout=resolveHudLayout(w,h,true,stored);
 assert.deepEqual(layout.steer,stored.steer);
 assert.equal(layout.mirrorCentre.y,0);
 assert(layout.mirrorLeft.height*h>layout.mirrorLeft.width*w,'bus portrait mirror');
 for(const rect of Object.values(layout)){assert(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=1&&rect.y+rect.height<=1);}
 const defaults=resolveHudLayout(w,h,false);assert(defaults.steer.x+defaults.steer.width<.5);
}
// Gradual fire, instant explosion, intact shell, restored materials after reset.
for(const explosion of [false,true]){
 const root=new THREE.Group(),original=new THREE.MeshStandardMaterial({color:'#b0c0d0'});
 const body=new THREE.Mesh(new THREE.BoxGeometry(20,16,48),original);body.name='Body';root.add(body);
 const effect=new AccidentFire(new THREE.Vector3(),0,explosion,{vehicle:root,width:20,length:48,height:16});
 effect.step(.01);const initial=effect.group.userData.fireGrowth;
 assert.equal(root.children.length,1);assert(root.visible&&body.visible);
 for(let i=0;i<360;i++)effect.step(1/60);
 assert.equal(effect.group.userData.fireGrowth,1);
 assert(explosion?initial===1:initial<.1);
 assert((body.material as THREE.MeshStandardMaterial).color.r<original.color.r*.6);
 assert(root.children[0]===body,'fire never replaces the shell with a whole-car debris set');
 effect.dispose();assert.equal(body.material,original);body.geometry.dispose();original.dispose();
}
assert(rearSteerAngleForSpeed(6,0,.5,.7,15,65,2)<0);
assert(rearSteerAngleForSpeed(6,8,.5,.7,15,65,2)>0);
assert.equal(rearSteerAngleForSpeed(0,8,.5,.7,15,65,2),0);
const report:any[]=[];
for(const id of GARAGE_CARS){
 const cc=CAR_MODELS[id],d=cc.dynamics,rearLimit=(d.rearSteerMaxDeg??0)*Math.PI/180;
 const rear=limitRearAxleSteer(d.maxSteerAngle,-rearLimit,cc.wheelbase,cc.trackWidth/2,rearLimit);
 assert(Math.abs(steeringWheelMaxDeg(cc)*Math.PI/180/d.steeringRatio-d.maxSteerAngle)<1e-9,'full user input reaches mechanical lock');
 const actual=fourWheelSteeringGeometry(cc.wheelbase,cc.trackWidth/2,d.maxSteerAngle,rear).outerFrontRadius/10;
 if(cc.turningRadiusTargetM)assert(Math.abs(actual-cc.turningRadiusTargetM)<.015,`${id} turning radius ${actual}`);
 report.push({id,virtualFrontDeg:d.maxSteerAngle*180/Math.PI,rearInnerLimitDeg:d.rearSteerMaxDeg??0,outerFrontRadiusM:actual});
}
for(const id of [CarType.COACH,CarType.MIDIBUS,CarType.VAN,CarType.LIGHT_TRUCK]){
 const cfg=CAR_MODELS[id],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]],bytes=fs.readFileSync(`public/models/${def.file}`);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 normalizeModel(gltf.scene,def);const parts=buildNativeAuthoredVehicle(gltf.scene,cfg);parts.group.updateMatrixWorld(true);
 const mounts=measuredMirrorMounts(parts.group);assert(mounts);
 for(const mount of mounts){
  assert(Math.abs(mount.x)>cfg.width*.5&&mount.z>cfg.length*.45,'front stalk mirror');
  const ray=new THREE.Raycaster(mount,new THREE.Vector3(Math.sign(mount.x)*.1,-.03,-1).normalize(),.05,10);
  assert.equal(ray.intersectObject(parts.group,true).length,0,`${id} mirror camera blocked by own mirror housing`);
 }
 assert(cfg.dynamics.maxSteerAngle>36*Math.PI/180,'bus steering lock must meet its radius');
}
fs.mkdirSync('docs/round29',{recursive:true});fs.writeFileSync('docs/round29/steering-regression.json',JSON.stringify(report,null,2)+'\n');
console.log('Round29 PASS: garage/ramp skid contact, persisted HUD, growing fire/intact shell, all-car turning radius and clear bus mirror camera rays.');
