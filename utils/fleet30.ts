import {CarType,type CarConfig,type VehicleTuning,type SteeringCurve} from '../types';
import {frontSteerForTurningRadius} from './driving';
export const FLEET30_IDS=[CarType.TRIKE,CarType.TRACTOR,CarType.SEMI,CarType.CYBERTRUCK,CarType.REVUELTO,CarType.VEYRON,CarType.V800,CarType.MINI] as const;
type Id=typeof FLEET30_IDS[number];
type Row={id:Id;name:string;size:number[];wb:number;mass:number;kw:number;nm:number;speed:number;tire:number;grip:number;cg:number;radius:number;layout:'RWD'|'AWD'|'FWD';color:string;ratios:number[];fd:number;rpm:number;idle:number;rear?:number;automatic?:boolean;zero:number;bias:number;drag:number};
// Documented manufacturer figures and explicitly estimated simulator values are
// separated in docs/round30/vehicle-references.md. No OEM suspension curves implied.
// SEMI wheel radius is a representative road-truck game calibration, not an OEM specification.
const rows:Row[]=[
 {id:CarType.TRIKE,name:'农用三轮货车 · 手动',size:[3.65,1.45,1.85],wb:2.35,mass:970,kw:18,nm:85,speed:55,tire:.34,grip:.74,cg:.80,radius:3.8,layout:'RWD',color:'#497d9e',ratios:[4.6,2.55,1.5,1,.8],fd:6.2,rpm:3000,idle:850,zero:99,bias:.32,drag:1.05},
 {id:CarType.TRACTOR,name:'农场 145 · 大小轮四驱',size:[4.85,2.45,2.95],wb:2.765,mass:7800,kw:106.6,nm:650,speed:50,tire:.9086,grip:.84,cg:1.18,radius:5.1,layout:'AWD',color:'#4d7740',ratios:[8,5.4,3.7,2.6,1.9,1.35,1,.75],fd:12,rpm:2200,idle:800,zero:99,bias:.41,drag:2.7},
 {id:CarType.SEMI,name:'洲际重卡 · 18 轮半挂',size:[6.85,2.55,3.75],wb:4.15,mass:36000,kw:377,nm:2373,speed:100,tire:.53,grip:.72,cg:1.32,radius:7.8,layout:'RWD',color:'#43677f',ratios:[12.8,9.3,6.8,4.9,3.6,2.6,1.9,1.4,1,.74],fd:3.7,rpm:2100,idle:600,zero:65,bias:.38,drag:6.8},
 {id:CarType.CYBERTRUCK,name:'Tesla Cybertruck · AWD',size:[5.6829,2.0316,1.7938],wb:3.635,mass:3009,kw:447,nm:1000,speed:180,tire:.4445,grip:1.0,cg:.76,radius:6.625,layout:'AWD',color:'#9aabae',ratios:[1],fd:14,rpm:18000,idle:0,rear:10,automatic:true,zero:4.3,bias:.5,drag:1.15},
 {id:CarType.REVUELTO,name:'Lamborghini Revuelto',size:[4.947,2.033,1.160],wb:2.779,mass:1900,kw:747,nm:850,speed:350,tire:.34675,grip:1.30,cg:.43,radius:5.65,layout:'AWD',color:'#c9a441',ratios:[4.4,2.9,2.1,1.65,1.3,1.05,.85,.70],fd:3.8,rpm:9500,idle:950,rear:3,automatic:true,zero:2.5,bias:.44,drag:.70},
 {id:CarType.VEYRON,name:'Bugatti Veyron 16.4',size:[4.462,1.998,1.204],wb:2.710,mass:1968,kw:736,nm:1250,speed:407,tire:.355,grip:1.28,cg:.46,radius:6.0,layout:'AWD',color:'#587f98',ratios:[3.18,2.26,1.71,1.35,1.10,.91,.76],fd:3.64,rpm:6500,idle:800,automatic:true,zero:2.7,bias:.45,drag:.74},
 {id:CarType.V800,name:'尊界 V800 · 尊享版',size:[5.495,2.006,1.850],wb:3.430,mass:3120,kw:390,nm:604,speed:200,tire:.402,grip:1.04,cg:.73,radius:5.4,layout:'AWD',color:'#565b64',ratios:[1],fd:11.5,rpm:18000,idle:0,rear:12,automatic:true,zero:5.7,bias:.51,drag:.82},
 {id:CarType.MINI,name:'MINI Cooper S · Sport',size:[3.876,1.744,1.432],wb:2.495,mass:1285,kw:150,nm:300,speed:242,tire:.31265,grip:1.10,cg:.49,radius:5.55,layout:'FWD',color:'#6b8a70',ratios:[14.964,8.776,5.456,3.785,2.972,2.345,1.9],fd:1,rpm:6500,idle:850,automatic:true,zero:6.6,bias:.62,drag:.64},
];
export const FLEET30_CARS=Object.fromEntries(rows.map(r=>{const track=r.id===CarType.CYBERTRUCK?1.772:r.size[1]-.27,steer=frontSteerForTurningRadius(r.wb,track,r.radius,r.rear??0);
 const c:CarConfig={id:r.id,name:r.name,price:0,color:r.color,length:r.size[0]*10,width:r.size[1]*10,height:r.size[2]*10,wheelbase:r.wb*10,trackWidth:track*10,weight:r.mass,maxSpeed:r.speed/15,acceleration:.025,turnSpeed:.03,automatic:r.automatic,
 turningRadiusTargetM:r.radius,turningRadiusDefinition:'outer-front-wheel',
 dynamics:{driveLayout:r.layout,enginePosition:r.id===CarType.REVUELTO||r.id===CarType.VEYRON?'MID':'FRONT',powerKw:r.kw,torqueNm:r.nm,zeroTo100Seconds:r.zero,frontWeightBias:r.bias,cgHeightM:r.cg,dragAreaM2:r.drag,grip:r.grip,steeringRatio:r.id===CarType.CYBERTRUCK?170*Math.PI/180/steer:r.id===CarType.SEMI?20:15,throttleResponse:r.id===CarType.SEMI?.02:.045,
 transmission:{gearRatios:r.ratios,finalDrive:r.fd,reverseRatio:r.ratios[0]*1.05,wheelRadiusM:r.tire,idleRpm:r.idle,redlineRpm:r.rpm},steerSpeedSensitivity:.8,steerResponse:r.id===CarType.SEMI?.7:1.1,maxSteerAngle:steer,understeerGradient:r.id===CarType.SEMI?.25:.12,yawResponse:r.id===CarType.SEMI?.65:1.05,rearSteerMaxDeg:r.rear??0,rearSteerFadeStartKmh:15,rearSteerFadeEndKmh:65,rearSteerHighSpeedDeg:r.rear?1:0}};
 return[r.id,c];})) as Record<Id,CarConfig>;
const tune:VehicleTuning={torqueScale:1,throttleResponseScale:1,shiftTimeScale:1,engineBrakeScale:1,steerLockScale:1,steerResponseScale:1,speedSteerScale:1,understeerScale:1};
const steering:SteeringCurve={firstHalfGain:.3,secondHalfGain:.5,thirdHalfGain:1,inputSmoothing:.11,highSpeedFloor:.3,centeringGain:1,autoCenteringSpeed:1.1};
export const FLEET30_TUNING=Object.fromEntries(FLEET30_IDS.map(id=>[id,{...tune}])) as Record<Id,VehicleTuning>;
export const FLEET30_STEERING=Object.fromEntries(FLEET30_IDS.map(id=>[id,{...steering}])) as Record<Id,SteeringCurve>;
