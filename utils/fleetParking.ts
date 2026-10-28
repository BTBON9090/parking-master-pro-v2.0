import {CAR_MODELS,GARAGE_CARS} from '../constants';
import {CarType,type LevelData,type Obstacle} from '../types';
import {checkVehicleCollision} from './physics';
/** Stable fleet selection, physical dimensions and mass. No stretched mini trucks. */
export function assignParkedFleet(level:LevelData){
 const small=GARAGE_CARS.filter(id=>CAR_MODELS[id].length<60&&CAR_MODELS[id].width<25);
 let index=0;
 for(const o of level.obstacles){
  if(o.type!=='car'||o.ai)continue;
  const c=CAR_MODELS[o.carType??small[(index++ + level.levelId*3)%small.length]];
  o.carType=c.id;o.weight=c.weight;o.movable=true;o.width=c.width;o.height=c.length;o.verticalHeight=c.height;
 }
 // Service apron safely separated from the motorway. Every garage model is
 // eligible; long combinations get their full footprint and their own bays.
 if(level.highway&&!level.obstacles.some(o=>o.id==='fleet-park-0')){
  const fleet=[...GARAGE_CARS,CarType.SEMI,CarType.US22,CarType.SEMI];
  level.roadSurfaces??=[];
  level.roadSurfaces.push({x:8750,y:4300,width:2450,height:1100,rotation:0,color:'#484a49',curbs:false});
  level.curvedRoads!.push({points:[{x:9500,y:3380},{x:9650,y:3700},{x:9650,y:4300}],width:120,color:'#414549',lanes:2,direction:'two-way'});
  fleet.forEach((id,i)=>{
   const c=CAR_MODELS[id],col=i%9,row=Math.floor(i/9),length=id===CarType.US22?224:id===CarType.SEMI?166:c.length;
   const x=7800+col*220,y=3900+row*340;
   level.obstacles.push({id:`fleet-park-${i}`,carType:id,x,y,width:c.width,height:length,rotation:Math.PI/2,type:'car',weight:c.weight,movable:true,color:c.color,verticalHeight:c.height});
   level.spots.push({id:`fleet-bay-${i}`,x,y,width:Math.max(c.width+12,46),height:Math.max(length+20,95),rotation:Math.PI/2,occupied:true});
  });
  level.streetSigns?.push({x:9650,y:3690,rotation:0,label:'大型车辆停车区 / 车库展示',kind:'street'});
 }
 // Resolve map-authoring overlap before building meshes. Do not move a car
 // into a neighbouring bay: omit the conflicting placement instead.
 const accepted:Obstacle[]=[];
 level.obstacles=level.obstacles.filter(o=>{
  if(o.type!=='car'||o.ai)return true;
  const body={...o,length:o.height};
  if(accepted.some(a=>Math.hypot(a.x-o.x,a.y-o.y)<(a.height+o.height)&&checkVehicleCollision(body,{...a,length:a.height})))return false;
  accepted.push(o);return true;
 });
 return level;
}
