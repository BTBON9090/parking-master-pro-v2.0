import {CarType,type CarConfig,type VehicleTuning,type SteeringCurve} from '../types';
import {FLEET30_CARS} from './fleet30';
import {frontSteerForTurningRadius} from './driving';
export const FLEET31_IDS=[CarType.TYPE100,CarType.MINING,CarType.US22] as const;
const heavy=(id:CarType,name:string,size:number[],mass:number,kw:number,nm:number,wb:number,radius:number,top:number):CarConfig=>{
 const source=structuredClone(FLEET30_CARS[CarType.SEMI]);
 const track=size[1]-(id===CarType.MINING?1.5:.5);
 return {...source,id,name,length:size[0]*10,width:size[1]*10,height:size[2]*10,wheelbase:wb*10,trackWidth:track*10,weight:mass,maxSpeed:top/15,turningRadiusTargetM:id===CarType.TYPE100?undefined:radius,color:id===CarType.TYPE100?'#677853':id===CarType.MINING?'#bf912c':'#8c4936',automatic:true,
 dynamics:{...source.dynamics,powerKw:kw,torqueNm:nm,cgHeightM:id===CarType.MINING?2.8:id===CarType.TYPE100?1.05:1.4,grip:id===CarType.TYPE100?1.05:.78,frontWeightBias:.42,dragAreaM2:id===CarType.MINING?24:6.5,driveLayout:id===CarType.TYPE100?'AWD':'RWD',steeringRatio:20,maxSteerAngle:id===CarType.TYPE100?.7:frontSteerForTurningRadius(wb,track,radius,0),rearSteerMaxDeg:0,
 transmission:{...source.dynamics.transmission,wheelRadiusM:id===CarType.MINING?2.02:id===CarType.TYPE100?.5:.53,redlineRpm:id===CarType.TYPE100?2600:2100,gearRatios:id===CarType.MINING?[7.2,5.2,3.6,2.5,1.8,1.3,1]:source.dynamics.transmission.gearRatios,finalDrive:id===CarType.MINING?35:id===CarType.TYPE100?8:3.7}}};
};
// Type 100 dimensions/drivetrain and the complete 22-wheel combination are
// simulation estimates. Mining power is the published Cat 797F gross rating.
export const FLEET31_CARS={
 [CarType.TYPE100]:heavy(CarType.TYPE100,'100 式 · 履带驾驶演示',[7.3,4,2.7],42000,1000,4200,5.1,6,70),
 [CarType.MINING]:heavy(CarType.MINING,'巨岩 797 · 矿用自卸车',[14.8,9.53,6.8],260000,2983,18000,8.4,20,67),
 [CarType.US22]:heavy(CarType.US22,'洲际长头 · 22 轮超长半挂',[8.2,2.55,3.85],44000,450,2800,5.4,10,100),
};
const tune:VehicleTuning={torqueScale:1,throttleResponseScale:1,shiftTimeScale:1,engineBrakeScale:1,steerLockScale:1,steerResponseScale:1,speedSteerScale:1,understeerScale:1};
const curve:SteeringCurve={firstHalfGain:.3,secondHalfGain:.5,thirdHalfGain:1,inputSmoothing:.11,highSpeedFloor:.3,centeringGain:1,autoCenteringSpeed:1.1};
export const FLEET31_TUNING=Object.fromEntries(FLEET31_IDS.map(id=>[id,{...tune}])) as Record<typeof FLEET31_IDS[number],VehicleTuning>;
export const FLEET31_STEERING=Object.fromEntries(FLEET31_IDS.map(id=>[id,{...curve}])) as Record<typeof FLEET31_IDS[number],SteeringCurve>;
