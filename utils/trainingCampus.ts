import {mapCurveSamples} from './openWorld';
import type {LevelData,Vector2,ExamStation} from '../types';
/** An authored exam campus. The route, physical gates and scoring checkpoints
 * share coordinates; legacy maps are deliberately no longer tiled together. */
export function buildTrainingCampus(_legacy?:(id:number)=>LevelData):LevelData{
 const out:LevelData={levelId:4,mapWidth:5000,mapHeight:3400,startPos:{x:260,y:330,rotation:0},spots:[],obstacles:[],markings:[],roadSurfaces:[],curvedRoads:[],slopeZones:[],elevatedRoads:[],streetSigns:[],exam:[],training:{title:'综合驾驶考试场 · 100 分',tips:['跟随考点提示，完成当前任务后再驶向下一项；所有项目均有判定','[ / ] 左右转向灯，V 雨刮，L 远近光；触屏可点考核面板按钮','超速、碰撞、错误灯光及未停车会扣分；允许自由练习与重新考试']}};
 const road=(points:number[][],width=80)=>out.curvedRoads!.push({points:points.map(([x,y])=>({x,y})),width,color:'#393e42',lanes:width<65?1:2,direction:width<65?'one-way':'two-way',warningEdges:width<65});
 const box=(id:string,x:number,y:number,w:number,h:number,z=12,elevation=0)=>out.obstacles.push({id,x,y,width:w,height:h,rotation:0,type:'wall',movable:false,weight:0,color:'#a1a6a2',verticalHeight:z,elevation});
 const task=(id:string,name:string,kind:ExamStation['kind'],x:number,y:number,ex:number,ey:number,hint:string,limit=30,heading?:number)=>{
  out.exam!.push({id,name,kind,x,y,exit:{x:ex,y:ey},radius:65,speedLimit:limit,hint,targetHeading:heading});
  out.streetSigns!.push({x,y:y-65,rotation:0,label:`${out.exam!.length} ${name}`,kind:'street'});
 };
 // Wide perimeter plus five internal aisles: enough turning room for coaches.
 road([[260,330],[4600,330],[4750,550],[4750,2950],[4560,3150],[400,3150],[200,2900],[200,600],[260,330]],100);
 for(const y of [900,1570,2290])road([[200,y],[4750,y]],90);
 for(const x of [1200,2500,3700])road([[x,330],[x,3150]],90);
 // Distinct practical routes, all open-ended and connected to their aisles.
 road([[2500,900],[2700,720],[2850,850],[3040,640],[3250,820],[3440,680],[3700,900]],48);
 road([[3700,900],[4000,900],[4000,1200],[4390,1200],[4390,1570]],52);
 road([[3700,2290],[3970,2110],[4230,2200],[4380,1990],[4110,1800],[3920,1890],[3700,1570]],60);
 road([[1200,1570],[1430,1790],[1620,1690],[1780,1950],[2020,1800],[2220,2040],[2500,2290]],58);
 road([[1200,2290],[1000,2520],[710,2450],[540,2690],[780,2890],[1200,3150]],65);
 // Toll booths leave multiple clear channels and a visible canopy above them.
 for(const x of [580,690,800]){box(`toll-booth-${x}`,x,300,20,24,27);box(`toll-post-${x}`,x,392,4,4,48);}
 box('toll-canopy',690,345,260,112,4,48);
 // A covered culvert, and a separately graded hill with a stop line near crest.
 box('culvert-west',1600,272,400,10,45);box('culvert-east',1600,388,400,10,45);box('culvert-roof',1600,330,400,126,6,45);
 out.slopeZones!.push({x:2200,y:330,length:520,width:98,rotation:0,peakHeight:44});
 out.markings.push({type:'stop',x:2160,y:330,width:3,height:80,rotation:0,color:'#f5eee0'});
 // Back-to-back rows flank aisles, never put poles or cars into the aisle.
 for(const [x0,y0,count,rows] of [[420,640,18,2],[1300,1160,22,2],[2720,1180,24,2],[395,1900,22,2],[2730,2710,26,2]] as number[][])
  for(let row=0;row<rows;row++)for(let n=0;n<count;n++){
   const x=x0+n*38,y=y0+row*112,id=`exam-bay-${x0}-${row}-${n}`;
   out.spots.push({id,x,y,width:32,height:66,rotation:Math.PI/2,occupied:false});
   if(n%7===4){out.spots.at(-1)!.occupied=true;out.obstacles.push({id:`parked-${id}`,x,y,width:19,height:46,rotation:Math.PI/2,type:'car',movable:true,weight:1550,color:['#9b7661','#6e838b','#a6a69a'][row%3]});}
  }
 // Parallel bays with measured clear entry rather than decorative outlines.
 for(const x of [1500,1650,1800])out.spots.push({id:`parallel-${x}`,x,y:836,width:34,height:95,rotation:0,occupied:false});
 // Obstacle lane: rounded continuous ramp and two offset narrow gates.
 out.slopeZones!.push({x:2000,y:1570,length:110,width:75,rotation:0,peakHeight:5});
 for(const [x,y] of [[1810,1530],[1850,1610],[2100,1530],[2140,1610]])out.obstacles.push({id:`gate-${x}`,x,y,width:5,height:5,rotation:0,type:'cone',movable:true,weight:3,color:'#e88d3b'});
 // Lowered entry/exit through a covered, curving training garage corridor.
 out.slopeZones!.push({x:4180,y:2030,length:620,width:500,rotation:Math.PI/2,peakHeight:-32});
 box('exam-garage-roof',4200,2040,430,350,4,55);
 for(const [x,y] of [[4050,1940],[4350,1940],[4050,2140],[4350,2140]])box(`garage-pillar-${x}-${y}`,x,y,8,8,86,-32);
 task('toll','收费站停车取卡','stop',690,350,950,330,'收费通道内停车 2 秒，再驶离',15);
 task('culvert','涵洞灯光','lowbeam',1450,330,1810,330,'进入涵洞前打开近光，限速 30');
 task('hill','坡道定点停车起步','hill',2155,330,2520,330,'停止 2 秒后起步，溜车超过 0.5 米扣分',20);
 task('signal-left','右转向灯','right',3700,330,3700,640,'先打右转向灯，再进入场内',25);
 task('s-curve','S 形连续曲线','drive',3440,680,2500,900,'保持在白线内，低速通过连续 S 弯',20);
 task('parallel','侧方停车','park',1800,836,1450,900,'在侧方车位内停稳 2 秒',15,0);
 task('reverse-left','左侧倒车入库','reverse',1414,1160,1200,1570,'倒挡进入左侧车位并停稳 2 秒',15,Math.PI/2);
 task('obstacle','交错路障与凸坡','drive',1810,1570,2220,1570,'低速越障，避开锥桶',20);
 task('reverse-right','右侧倒车入库','reverse',2910,1180,3700,1570,'倒挡进入右侧车位并停稳 2 秒',15,Math.PI/2);
 task('right-angle','直角弯','left',4390,1570,4000,900,'先打左转向灯，再沿直角路线驶出',20);
 task('highbeam','远近光切换','highbeam',4600,900,4750,1300,'开启远光后切回近光，切勿持续远光',30);
 task('wiper','雨刮器操作','wiper',4750,1570,4750,1900,'开启雨刮后通过湿滑检查区',25);
 task('garage','地库连续弯道进出','drive',4380,1990,3700,2290,'驶入下沉车道，沿连续弯道驶出',20);
 task('traffic-light','红绿灯停车换挡','signal',3200,2290,2900,2290,'红灯停车，绿灯起步；灯色显示在考核面板',30);
 task('hundred','百米加减速','accelerate',2500,2290,1500,2290,'百米内提速至 35 km/h，再降到 15 km/h；手动车须换挡',50);
 task('merge','并线','merge',1200,2290,1000,2520,'观察后视镜、打转向灯并线',35);
 out.obstacles.push({id:'exam-overtake-vehicle',x:955,y:3035,width:19,height:46,rotation:.55,type:'car',movable:true,weight:1600,color:'#9f8771'});
 task('overtake','超车','overtake',780,2890,1200,3150,'先左灯驶出，再右灯驶回，安全超车',40);
 task('uturn','掉头与考试结束','uturn',200,2900,200,2500,'打转向灯，完成约 180 度掉头',20);
 for(const [id,curve] of [['s-curve',7],['right-angle',8],['garage',9],['merge',11]] as const){
  const station=out.exam!.find(s=>s.id===id)!;const r=out.curvedRoads![curve];station.path=mapCurveSamples(r);station.laneWidth=r.width;
 }
 for(const station of out.exam!)if(station.kind==='park'||station.kind==='reverse'){station.bayWidth=32;station.bayLength=station.kind==='park'?95:66;}
 for(const [x,y] of [[3200,2290],[1200,1570]])out.markings.push({type:'stop',x,y,width:3,height:75,rotation:0,color:'#f0eadf'});
 for(const y of [330,900,1570,2290,3150])for(let x=350;x<4700;x+=450)out.markings.push({type:'arrow-straight',x,y:y+20,width:14,height:32,rotation:0,color:'#eee8d7'});
 for(const [x,y,w,h] of [[2500,0,5000,10],[2500,3400,5000,10],[0,1700,10,3400],[5000,1700,10,3400]])box(`boundary-${x}-${y}`,x,y,w,h,25);
 return out;
}
