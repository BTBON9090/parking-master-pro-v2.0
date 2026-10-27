import {frontSteerForTurningRadius} from './driving';
import { CarType, CarConfig, VehicleTuning, SteeringCurve } from '../types';
/** Official dimensions / power / torque / limiter / acceleration targets are
 * transcribed in docs/round13/vehicle-provenance.json. Mass, tyre grip, spring
 * rates, drag area and the i9 rear-steer angle are simulation calibrations. */
function suv(id:CarType,name:string,dim:number[],power:number,torque:number,vmax:number,seconds:number,mass:number,radius:number,tire:number,color:string,rearSteer=0):CarConfig {
 const [length,width,height,wb]=dim,track=width-.275;
 const steer=frontSteerForTurningRadius(wb,track,radius,rearSteer);
 return {id,name,price:0,color,length:length*10,width:width*10,height:height*10,wheelbase:wb*10,trackWidth:track*10,
  maxSpeed:vmax/15,acceleration:.026,turnSpeed:.03,weight:mass,turningRadiusTargetM:radius,turningRadiusDefinition:'outer-front-wheel',
  dynamics:{driveLayout:'AWD',enginePosition:'MID',powerKw:power,torqueNm:torque,zeroTo100Seconds:seconds,
   frontWeightBias:.51,cgHeightM:id===CarType.TAI7?.67:.61,dragAreaM2:id===CarType.TAI7?.92:id===CarType.LI_I9?.61:.82,
   grip:1.04,steeringRatio:id===CarType.LI_I9?Math.PI*2/steer:15.2,throttleResponse:.05,
   transmission:{gearRatios:[1],reverseRatio:1,finalDrive:id===CarType.TAI7?11.4:id===CarType.LI_I9?10.2:9.9,wheelRadiusM:tire,idleRpm:0,redlineRpm:18000},
   steerSpeedSensitivity:.9,steerResponse:.96,maxSteerAngle:steer,understeerGradient:.17,yawResponse:.94,
   rearSteerMaxDeg:rearSteer,rearSteerFadeStartKmh:15,rearSteerFadeEndKmh:65,rearSteerHighSpeedDeg:id===CarType.LI_I9?2:0}
 };
}
/** Fictional training vehicles: dimensions, gearbox and suspension are game
 * calibrations rather than specifications of a commercial manufacturer's car. */
function manual(id:CarType,name:string,L:number,W:number,H:number,wb:number,mass:number,power:number,torque:number,maxKmh:number,tire:number,layout:'AWD'|'RWD',color:string):CarConfig {
 const long=wb>=3.6;
 // Outer front tyre path, not the bumper/body turning circle. These are
 // training-vehicle targets informed by Coaster / Yutong geometry, not OEM claims.
 const radius=id===CarType.COACH?9.4:id===CarType.MIDIBUS?6.5:id===CarType.LIGHT_TRUCK?7.0:id===CarType.VAN?6.0:5.5;
 const steer=Math.atan(wb/(Math.sqrt(radius*radius-wb*wb)-W*.86/2));
 return {id,name,price:0,color,length:L*10,width:W*10,height:H*10,wheelbase:wb*10,trackWidth:W*.86*10,turningRadiusTargetM:radius,turningRadiusDefinition:'outer-front-wheel',
  maxSpeed:maxKmh/15,acceleration:.02,turnSpeed:.02,weight:mass,
  dynamics:{driveLayout:layout,enginePosition:'FRONT',powerKw:power,torqueNm:torque,zeroTo100Seconds:long?32:15,
   frontWeightBias:.53,cgHeightM:H*.37,dragAreaM2:W*H*.5,grip:id===CarType.JEEP?.94:id===CarType.VAN?.80:.76,steeringRatio:long?19:16,
   throttleResponse:long?.022:.035,transmission:{gearRatios:[4.2,2.4,1.52,1,0.78],reverseRatio:4.0,finalDrive:long?4.8:4.1,wheelRadiusM:tire,idleRpm:800,redlineRpm:long?3800:5200},
   steerSpeedSensitivity:1,steerResponse:long?.72:.92,maxSteerAngle:steer,understeerGradient:long?.23:.15,yawResponse:long?.75:.95}};
}
export const EXPANSION_CARS={
 [CarType.TAI7]:suv(CarType.TAI7,'方程豹 钛7 四驱 Ultra',[4.999,1.995,1.865,2.920],360,620,190,4.5,2495,5.8,.39425,'#899fa2'),
 [CarType.LI_I9]:suv(CarType.LI_I9,'理想 i9',[5.225,1.970,1.752,3.168],400,660,200,4.9,2745,5.3,.38595,'#b9a580',6),
 [CarType.N90]:suv(CarType.N90,'小米澎程 N90 Max',[5.285,1.998,1.825,3.080],310,540,190,5.9,2650,5.95,.3837,'#447f80'),
 [CarType.JEEP]:manual(CarType.JEEP,'山地吉普 · 手动四驱',4.66,1.89,1.91,2.8,2050,140,350,160,.40,'AWD','#536c48'),
 [CarType.MIDIBUS]:manual(CarType.MIDIBUS,'远行中巴 · 手动',6.4,2.18,2.65,3.65,4500,110,430,110,.43,'RWD','#b6b39d'),
 [CarType.COACH]:manual(CarType.COACH,'长途大巴 · 手动',10.2,2.42,3.15,5.8,10500,220,1100,105,.52175,'RWD','#55727b'),
 [CarType.VAN]:manual(CarType.VAN,'短轴接驳车 · 手动',5.6,2.05,2.38,3.25,2650,105,320,140,.37,'RWD','#c4c0ac'),
 [CarType.LIGHT_TRUCK]:manual(CarType.LIGHT_TRUCK,'长轴接驳车 · 手动',7.2,2.28,2.85,4.1,6200,135,520,105,.46,'RWD','#61734f'),
};
const tune:VehicleTuning={torqueScale:1,throttleResponseScale:1,shiftTimeScale:1,engineBrakeScale:1,steerLockScale:1,steerResponseScale:1,speedSteerScale:1,understeerScale:1};
const steering:SteeringCurve={firstHalfGain:.3,secondHalfGain:.49,thirdHalfGain:1.63,inputSmoothing:.11,highSpeedFloor:.28,centeringGain:1,autoCenteringSpeed:1.2};
export const EXPANSION_TUNING={ [CarType.TAI7]:{...tune},[CarType.LI_I9]:{...tune},[CarType.N90]:{...tune},
 [CarType.JEEP]:{...tune},[CarType.MIDIBUS]:{...tune},[CarType.COACH]:{...tune},[CarType.VAN]:{...tune},[CarType.LIGHT_TRUCK]:{...tune} };
export const EXPANSION_STEERING={ [CarType.TAI7]:{firstHalfGain:.05,secondHalfGain:.09,thirdHalfGain:1,inputSmoothing:.7,highSpeedFloor:.26,centeringGain:1,autoCenteringSpeed:1.11},[CarType.LI_I9]:{...steering},[CarType.N90]:{...steering},
 [CarType.JEEP]:{...steering},[CarType.MIDIBUS]:{...steering},[CarType.COACH]:{...steering},[CarType.VAN]:{...steering},[CarType.LIGHT_TRUCK]:{...steering} };
