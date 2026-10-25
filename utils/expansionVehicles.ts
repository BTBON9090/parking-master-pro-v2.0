import { CarType, CarConfig, VehicleTuning, SteeringCurve } from '../types';
/** Official dimensions / power / torque / limiter / acceleration targets are
 * transcribed in docs/round13/vehicle-provenance.json. Mass, tyre grip, spring
 * rates, drag area and the i9 rear-steer angle are simulation calibrations. */
function suv(id:CarType,name:string,dim:number[],power:number,torque:number,vmax:number,seconds:number,mass:number,radius:number,tire:number,color:string,rearSteer=0):CarConfig {
 const [length,width,height,wb]=dim,track=width-.275;
 const centerRadius=Math.sqrt(radius*radius-wb*wb)-track/2;
 const steer=Math.atan(wb/centerRadius-Math.tan(rearSteer*Math.PI/180));
 return {id,name,price:0,color,length:length*10,width:width*10,height:height*10,wheelbase:wb*10,trackWidth:track*10,
  maxSpeed:vmax/15,acceleration:.026,turnSpeed:.03,weight:mass,turningRadiusTargetM:radius,turningRadiusDefinition:'outer-front-wheel',
  dynamics:{driveLayout:'AWD',enginePosition:'MID',powerKw:power,torqueNm:torque,zeroTo100Seconds:seconds,
   frontWeightBias:.51,cgHeightM:id===CarType.TAI7?.67:.61,dragAreaM2:id===CarType.TAI7?.92:id===CarType.LI_I9?.61:.82,
   grip:1.04,steeringRatio:id===CarType.LI_I9?Math.PI/steer:15.2,throttleResponse:.05,
   transmission:{gearRatios:[1],reverseRatio:1,finalDrive:id===CarType.TAI7?11.4:id===CarType.LI_I9?10.2:9.9,wheelRadiusM:tire,idleRpm:0,redlineRpm:18000},
   steerSpeedSensitivity:.9,steerResponse:.96,maxSteerAngle:steer,understeerGradient:.17,yawResponse:.94,
   rearSteerMaxDeg:rearSteer,rearSteerFadeStartKmh:15,rearSteerFadeEndKmh:65}
 };
}
export const EXPANSION_CARS={
 [CarType.TAI7]:suv(CarType.TAI7,'方程豹 钛7 四驱 Ultra',[4.999,1.995,1.865,2.920],360,620,190,4.5,2495,5.8,.39425,'#899fa2'),
 [CarType.LI_I9]:suv(CarType.LI_I9,'理想 i9',[5.225,1.970,1.752,3.168],400,660,200,4.9,2745,5.3,.38595,'#b9a580',6),
 [CarType.N90]:suv(CarType.N90,'小米澎程 N90 Max',[5.285,1.998,1.825,3.080],310,540,190,5.9,2650,5.95,.3837,'#447f80'),
};
const tune:VehicleTuning={torqueScale:1,throttleResponseScale:1,shiftTimeScale:1,engineBrakeScale:1,steerLockScale:1,steerResponseScale:1,speedSteerScale:1,understeerScale:1};
const steering:SteeringCurve={firstHalfGain:.3,secondHalfGain:.49,thirdHalfGain:1.63,inputSmoothing:.11,highSpeedFloor:.28,centeringGain:1,autoCenteringSpeed:1.2};
export const EXPANSION_TUNING={ [CarType.TAI7]:{...tune},[CarType.LI_I9]:{...tune},[CarType.N90]:{...tune} };
export const EXPANSION_STEERING={ [CarType.TAI7]:{firstHalfGain:.05,secondHalfGain:.09,thirdHalfGain:1,inputSmoothing:.7,highSpeedFloor:.26,centeringGain:1,autoCenteringSpeed:1.11},[CarType.LI_I9]:{...steering},[CarType.N90]:{...steering} };
