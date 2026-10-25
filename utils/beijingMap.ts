import { addOpenWorld } from './openWorld';
import { mountainRails, mountainPropColliders } from '../three/openWorldScene';
import type { Intersection, LevelData, Marking, Obstacle, RoadSurface, Vector2 } from '../types';
import { isTrainingTerrain, trainingTerrainHeight, TRAINING_TERRAIN } from './trainingTerrain';
import { elevatedRoadProfile } from './elevatedRoad';

/** Digitized from Beijing Dongcheng's 2025 published protection-plan figure 02.
 * Image coordinates from the 1800 px rendering; its 214 px scale bar = 200 m.
 * This preserves street topology and approximate distances, not surveyed widths.
 * Buildings and the marked training car park are deliberately simplified.
 */
const SCALE = 2000 / 214;
const point = ([x,y]:number[]):Vector2 => ({x:(x-145)*SCALE+150,y:(y-210)*SCALE+150});
export const BEIJING_STREETS = [
  {name:'东四北大街',width:210,path:[[196,250],[209,450],[217,700],[226,945],[232,1125],[237,1390]]},
  {name:'朝阳门北小街',width:210,path:[[1005,250],[1008,700],[1013,850],[1036,945],[1040,1125],[1045,1390]]},
  {name:'东四十条',width:210,path:[[196,250],[600,244],[1005,250]]},
  {name:'朝阳门内大街',width:210,path:[[237,1390],[650,1387],[1045,1390]]},
  {name:'东四九条',width:60,path:[[203,367],[490,367],[730,366],[1006,369]]},
  {name:'东四八条',width:70,path:[[209,450],[495,450],[735,447],[1007,452]]},
  {name:'东四七条',width:65,path:[[212,535],[490,535],[720,536],[1007,538]]},
  {name:'东四六条',width:80,path:[[217,700],[485,700],[735,699],[1008,705]]},
  {name:'东四五条',width:65,path:[[226,945],[495,944],[745,942],[1036,945]]},
  {name:'东四四条',width:65,path:[[229,1035],[493,1034],[750,1033],[1038,1036]]},
  {name:'东四三条',width:80,path:[[232,1125],[590,1124],[810,1124],[1040,1125]]},
  {name:'东四二条',width:60,path:[[234,1210],[585,1210],[585,1124]]},
];
/** Training-extension landmarks. Explicitly fictional Beijing-style industrial
 * blocks, not a survey of the historic streets. */
export const BEIJING_FACTORY_LOOP: Vector2[] = [
  {x:1750,y:3450},{x:3100,y:3450},{x:3320,y:3670},{x:3320,y:4180},
  {x:3100,y:4400},{x:1850,y:4400},{x:1650,y:4200},{x:1650,y:3670},
];
export const BEIJING_ACCESS_S: Vector2[] = [
  {x:1325,y:3900},{x:1480,y:3900},{x:1570,y:3810},{x:1635,y:3810},{x:1660,y:3900},
];
export const BEIJING_FACTORY_BUILDING = { x:2450, y:3925, width:760, height:360 };
export const BEIJING_TRAFFIC_COUNT = 8;

const distanceToSegment=(p:Vector2,a:Vector2,b:Vector2)=>{
 const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));
 return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
};
const distanceToPolyline=(p:Vector2,points:Vector2[],closed=false)=>{
 let best=Infinity;
 const count=closed?points.length:points.length-1;
 for(let i=0;i<count;i++) best=Math.min(best,distanceToSegment(p,points[i],points[(i+1)%points.length]));
 return best;
};
const densifyPath=(points:Vector2[],step=150,closed=false):Vector2[]=>{
 const out:Vector2[]=[];
 const count=closed?points.length:points.length-1;
 for(let i=0;i<count;i++){
  const a=points[i],b=points[(i+1)%points.length];
  const len=Math.hypot(b.x-a.x,b.y-a.y);
  const n=Math.max(1,Math.ceil(len/step));
  for(let k=0;k<n;k++){const t=k/n;out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
 }
 if(!closed) out.push(points[points.length-1]);
 return out;
};
const streetXAtY=(y:number)=>{
 const street=BEIJING_STREETS[0].path.map(point);
 for(let i=1;i<street.length;i++){
  const a=street[i-1],b=street[i];
  if(y>=Math.min(a.y,b.y)&&y<=Math.max(a.y,b.y)){
   const t=(y-a.y)/Math.max(1e-6,b.y-a.y);
   return a.x+(b.x-a.x)*t;
  }
 }
 return street[0].x;
};

export function buildBeijingLevel():LevelData {
 const markings:Marking[]=[],obstacles:Obstacle[]=[],roadSurfaces:RoadSurface[]=[],intersections:Intersection[]=[],elevatedRoads:NonNullable<LevelData['elevatedRoads']>=[],slopeZones:NonNullable<LevelData['slopeZones']>=[];
 const streetSigns:NonNullable<LevelData['streetSigns']>=[];
 const curbSegments:NonNullable<LevelData['curbSegments']>=[];
 const segments:{a:Vector2;b:Vector2;width:number;name:string}[]=[];
 for(const street of BEIJING_STREETS) {
  const points=street.path.map(point);
  for(let i=1;i<points.length;i++) segments.push({a:points[i-1],b:points[i],width:street.width,name:street.name});
 }
 const road=(a:Vector2,b:Vector2,width:number)=>{
  roadSurfaces.push({x:(a.x+b.x)/2,y:(a.y+b.y)/2,width:Math.hypot(b.x-a.x,b.y-a.y)+2,height:width,rotation:Math.atan2(b.y-a.y,b.x-a.x),color:'#353539',curbs:false});
 };
 for(const seg of segments) {
  road(seg.a,seg.b,seg.width);
  const dx=seg.b.x-seg.a.x,dy=seg.b.y-seg.a.y,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len,heading=Math.atan2(dy,dx);
  // Build continuous visible runs instead of randomly skipping every third
  // 24-unit chunk. Dashes then have a stable 20/16 rhythm, and only the
  // approach to a junction switches to solid white.
  let runStart: number | null = null;
  let runEnd = 0;
  const flushRun = () => {
    if (runStart === null) return;
    const start = runStart;
    const runLength = runEnd - start;
    if (runLength < 16) { runStart = null; return; }
    const runCenter = start + runLength / 2;
    const push = (offset: number, type: Marking['type'], color: string, thick: number, width = runLength, center = runCenter) => {
      const q = {
        x: seg.a.x + ux * center - uy * offset,
        y: seg.a.y + uy * center + ux * offset,
      };
      markings.push({ type, x: q.x, y: q.y, width, height: thick, rotation: heading, color });
    };
    if (seg.width >= 200) {
      // Two-way six-lane major street: double yellow centre, white dashed
      // lane dividers, solid white edge lines and solid approach dividers.
      push(0, 'line-double', '#fbbf24', 6);
      const edge = seg.width / 2 - 2.5;
      push(-edge, 'line-solid', '#fff', 1.5);
      push(edge, 'line-solid', '#fff', 1.5);
      const laneWidth = seg.width / 6;
      for (const boundary of [-2 * laneWidth, -laneWidth, laneWidth, 2 * laneWidth]) {
        if (runLength > 120) {
          const middle = runLength - 100;
          push(boundary, 'line-solid', '#fff', 1.5, 50, start + 25);
          push(boundary, 'line-dashed', '#fff', 1.5, middle, start + 50 + middle / 2);
          push(boundary, 'line-solid', '#fff', 1.5, 50, runEnd - 25);
        } else {
          push(boundary, 'line-solid', '#fff', 1.5);
        }
      }
    } else if (seg.width >= 100) {
      // Narrower connector: centre line only, no invented extra lanes.
      push(0, 'line-double', '#fbbf24', 6);
    }
    runStart = null;
  };
  for (let d = 3; d < len; d += 24) {
    const length = Math.min(24, len - d);
    const p = { x: seg.a.x + ux * (d + length / 2), y: seg.a.y + uy * (d + length / 2) };
    const blocked = segments.some(other => other.name !== seg.name
      && distanceToSegment(p, other.a, other.b) < other.width / 2 + 34);
    if (!blocked) {
      if (runStart === null) runStart = d;
      runEnd = d + length;
    } else {
      flushRun();
    }
  }
  flushRun();
  // Subtle asphalt expansion joints and two tyre-wear bands on the major
  // streets. They are ordinary flat markings, not extra meshes.
  if(seg.width>=180) {
   for(let d=180; d<len-80; d+=340) {
    const p={x:seg.a.x+ux*d,y:seg.a.y+uy*d};
    if(segments.some(other=>other.name!==seg.name&&distanceToSegment(p,other.a,other.b)<other.width/2+18))continue;
    markings.push({type:'line-solid',x:p.x,y:p.y,width:2.4,height:seg.width-10,rotation:heading+Math.PI/2,color:'#282a2e'});
   }
   for(const offset of [-19,19]) {
    markings.push({type:'line-solid',x:seg.a.x+ux*len*0.55-uy*offset,y:seg.a.y+uy*len*0.55+ux*offset,
     width:len*0.62,height:2.2,rotation:heading,color:'#2b2d31'});
   }
  }
 }
 // Hutong mouths meet the actual two boundary streets, rather than full grid crossings.
 for(const street of BEIJING_STREETS.slice(4,11)) {
  const pts=street.path.map(point);
  for(const end of [0,pts.length-1]) {
   const p=pts[end],left=end===0,dir=left?1:-1;
   streetSigns.push({x:p.x+dir*145,y:p.y+street.width/2+18,rotation:left?Math.PI:0,label:street.name,kind:'street'});
   streetSigns.push({x:p.x+dir*215,y:p.y+street.width/2+18,rotation:left?Math.PI:0,label:'20',kind:'speed'});
   markings.push({type:'crosswalk',x:p.x+dir*125,y:p.y,width:25,height:street.width-4,rotation:0,color:'#fff'});
   markings.push({type:'stop',x:p.x+dir*150,y:p.y-dir*street.width/4,width:3,height:street.width/2-2,rotation:0,color:'#fff'});
  }
 }
 // Explicitly labelled training facility beside Dongsi North Street; not a real POI claim.
 const lot={x:1100,y:3900,width:450,height:260};
 roadSurfaces.push({...lot,rotation:0,color:'#303034',curbs:false});
 road({x:point([215,620]).x,y:3900},{x:1100,y:3900},70);
 const spots:LevelData['spots']=[];
 for(const side of [-1,1]) for(let i=0;i<10;i++) {
  const x=lot.x-162+i*36,y=lot.y+side*70;
  const bay={id:`bj-training-${side}-${i}`,x,y,width:62,height:31,rotation:Math.PI/2,occupied:false};
  if(i===3||i===7)spots.push(bay);
  else obstacles.push({id:`bj-parked-${side}-${i}`,x,y,width:20,height:51,rotation:Math.PI/2,type:'car',movable:false,weight:1400,color:'#8c9297'});
  for(const offset of [-1,1]) markings.push({type:'line-solid',x:x+offset*15.5,y,width:1.4,height:62,rotation:0,color:'#fff'});
  markings.push({type:'line-solid',x,y:y+side*31,width:31,height:1.4,rotation:0,color:'#fff'});
 }
 streetSigns.push({x:955,y:3952,rotation:Math.PI,label:'训练停车区',kind:'parking'});
 // ===== Fictional non-paved training branch =====
 // A gravel spur leaves the training-lot side of the main route; the pad is
 // deliberately outside historic blocks and the factory loop.
 const terrainBranch = {x:1300,y:4315,width:58,height:590,rotation:0,color:'#706353',curbs:false};
 roadSurfaces.push(terrainBranch);
 streetSigns.push({x:1300,y:4080,rotation:0,label:'非铺装训练支路',kind:'street'});
 streetSigns.push({x:1300,y:4145,rotation:0,label:'训练扩展',kind:'parking'});
 // Low cones mark the entrance without blocking the only route.
 for(const side of [-1,1]) obstacles.push({id:`terrain-cone-entry-${side}`,x:TRAINING_TERRAIN.entranceX+side*34,y:TRAINING_TERRAIN.entranceY+14,width:4,height:4,rotation:0,type:'cone',movable:true,weight:2,color:'#d97706'});
 // 3 m gate through the rough pad: two static blocks leave a 30-unit gap.
 for(const side of [-1,1]) { const gx=TRAINING_TERRAIN.centerX+side*20; obstacles.push({id:`terrain-gate-${side}`,x:gx,y:TRAINING_TERRAIN.centerY,width:10,height:60,rotation:0,type:'box',movable:false,weight:900,color:'#665c4f',elevation:trainingTerrainHeight(gx,TRAINING_TERRAIN.centerY),verticalHeight:10}); }
 for(const side of [-1,1]) {
   obstacles.push({id:`terrain-gate-cone-a-${side}`,x:TRAINING_TERRAIN.centerX+side*68,y:TRAINING_TERRAIN.centerY-100,width:4,height:4,rotation:0,type:'cone',movable:true,weight:2,color:'#d97706'});
   obstacles.push({id:`terrain-gate-cone-b-${side}`,x:TRAINING_TERRAIN.centerX+side*68,y:TRAINING_TERRAIN.centerY+100,width:4,height:4,rotation:0,type:'cone',movable:true,weight:2,color:'#d97706'});
 }
 const terrainZone={x:TRAINING_TERRAIN.centerX,y:TRAINING_TERRAIN.centerY,width:TRAINING_TERRAIN.width,height:TRAINING_TERRAIN.length,rotation:0,color:'#6b5d4d',label:'非铺装训练'};

 // ===== 北京风格训练扩展：明确标注的厂区/仓库/服务区 =====
 // These are fictional infill blocks; the historic street skeleton above is the
 // only claimed real-world relationship.
 const factoryLoop=BEIJING_FACTORY_LOOP;
 const accessS=BEIJING_ACCESS_S;
 const loopJunctionGap={x:1650,y:3900,radius:125};
 const curvedRoads:NonNullable<LevelData['curvedRoads']>=[
  {points:accessS,width:56,color:'#34363a',lanes:1,direction:'one-way',warningEdges:true,markingGaps:[loopJunctionGap]},
  {points:factoryLoop,width:68,color:'#34363a',closed:true,lanes:1,direction:'one-way',warningEdges:true,markingGaps:[loopJunctionGap]},
 ];
 const factoryApron={x:2450,y:4195,width:960,height:86};
 roadSurfaces.push({...factoryApron,rotation:0,color:'#303034',curbs:false});
 // Small loading/service pad outside the loop, not on a junction or crosswalk.
 roadSurfaces.push({x:3600,y:4100,width:260,height:82,rotation:0,color:'#303034',curbs:false});
 markings.push({type:'line-dashed',x:3600,y:4062,width:210,height:2,rotation:0,color:'#fbbf24'});
 markings.push({type:'line-dashed',x:3600,y:4138,width:210,height:2,rotation:0,color:'#fbbf24'});
 streetSigns.push({x:3600,y:4020,rotation:0,label:'装卸区',kind:'street'});
 streetSigns.push({x:1360,y:3820,rotation:0,label:'北京东四训练扩展',kind:'street'});
 streetSigns.push({x:1740,y:3330,rotation:0,label:'厂区环线',kind:'street'});
 streetSigns.push({x:2150,y:4100,rotation:0,label:'厂区停车',kind:'parking'});

 const buildings:Obstacle[]=[];
 const addBuilding=(kind:string,x:number,y:number,width:number,height:number,color:string)=>{
  const id=`bj-building-${kind}-${buildings.length}`;
  const b:Obstacle={id,x,y,width,height,rotation:0,type:'wall',movable:false,weight:0,color};
  buildings.push(b); obstacles.push(b);
 };
 // One large plant inside the loop and one warehouse east of it.
 addBuilding('factory-plant',BEIJING_FACTORY_BUILDING.x,BEIJING_FACTORY_BUILDING.y,BEIJING_FACTORY_BUILDING.width,BEIJING_FACTORY_BUILDING.height,'#817d76');
 addBuilding('warehouse',5200,7200,600,320,'#8d877d');
 // Re-created low-rise industrial filler outside the new drivable corridor.
 for (const [i, x] of [4000, 5900, 7000, 8000].entries()) {
   addBuilding('service', x, 6500, 300, 240, '#8a8175');
   addBuilding('factory-low', x, 7300, 360, 240, '#7d7970');
 }

 const addParkingBay=(id:string,x:number,y:number,width:number,height:number,rotation:number,occupied:boolean,color='#8c9297')=>{
  const cos=Math.cos(rotation),sin=Math.sin(rotation);
  const line=(lx:number,ly:number,w:number,h:number)=>markings.push({
   type:'line-solid',
   x:x+lx*cos-ly*sin,y:y+lx*sin+ly*cos,
   width:w,height:h,rotation,color:'#fff',
  });
  if(occupied){
   obstacles.push({id:`${id}-car`,x,y,width:20,height:51,rotation:Math.PI/2,type:'car',movable:false,weight:1400,color});
   line(-width/2,0,1.4,height); line(width/2,0,1.4,height);
   line(0,-height/2,width,1.4); line(0,height/2,width,1.4);
  } else {
   spots.push({id,x,y,width,height,rotation,occupied:false});
  }
 };
 // Factory parking row (side-by-side, six bays, two empty). The bay long axis
 // is north-south, matching the parked car heading.
 for(let i=0;i<6;i++) addParkingBay(`bj-factory-bay-${i}`,2040+i*56,4195,30,62,0,i!==1&&i!==4,'#5d6b78');
 // Roadside parallel bays along Dongsi North Street; keep clear of hutong mouths.
 const bayYs=[3500,4430,5250,6150];
 for(let i=0;i<bayYs.length;i++){
  const y=bayYs[i];
  const x=streetXAtY(y)-123;
  addParkingBay(`bj-road-bay-${i}`,x,y,30,62,0,i%2===0,'#6b7280');
  streetSigns.push({x:x-28,y:y-8,rotation:0,label:'路边停车',kind:'parking'});
 }

 // Coarse large-block infill. No courtyard-sized 270-unit grid: 30–60 large
 // industrial/service footprints replace the former dense hutong blocks.
 let seed=271;const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
 const kinds=['warehouse','factory','parking','service'] as const;
 const dims:Record<string,{w:number;h:number;color:string}> = {
  warehouse:{w:520,h:360,color:'#8d877d'},
  factory:{w:620,h:380,color:'#817d76'},
  parking:{w:360,h:300,color:'#6f7b84'},
  service:{w:300,h:240,color:'#9a8f80'},
 };
 for(let y=900;y<10900 && buildings.length<44;y+=980){
  for(let x=1500;x<8350 && buildings.length<44;x+=980){
   const kind=kinds[Math.floor(random()*kinds.length)];
   const d=dims[kind];
   const p={x,y};
   // Reserved training/factory zone (specific buildings and parking above).
   if(x>1200&&x<3800&&y>3100&&y<4750) continue;
   // Round 6 challenge corridor: no generated block may sit on the ring,
   // bridge/underpass, S-curve or access road footprint.
   if(x>3200&&x<8400&&y>2900&&y<6000) continue;
   // Conservative clearance from every traced street centreline.
   if(segments.some(seg=>distanceToSegment(p,seg.a,seg.b)<seg.width/2+Math.max(d.w,d.h)/2+60))continue;
   if(distanceToPolyline(p,factoryLoop,true)<34+Math.max(d.w,d.h)/2+50)continue;
   if(distanceToPolyline(p,accessS,false)<28+Math.max(d.w,d.h)/2+50)continue;
   if(Math.abs(x-lot.x)<lot.width/2+Math.max(d.w,d.h)/2+70&&Math.abs(y-lot.y)<lot.height/2+Math.max(d.w,d.h)/2+70)continue;
   if(buildings.some(b=>Math.abs(b.x-x)<(b.width+d.w)/2+35&&Math.abs(b.y-y)<(b.height+d.h)/2+35))continue;
   addBuilding(kind,x,y,d.w,d.h,d.color);
  }
 }

 // Visual curbs along the main streets, instanced and skipped at junctions.
 for(const seg of segments.filter(s=>s.width>=140)){
  const dx=seg.b.x-seg.a.x,dy=seg.b.y-seg.a.y,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len,heading=Math.atan2(dy,dx);
  for(let d=90;d<len-90;d+=60)for(const side of [-1,1]){
   const x=seg.a.x+ux*d-uy*side*(seg.width/2+4),y=seg.a.y+uy*d+ux*side*(seg.width/2+4);
   if(x>1200&&x<3800&&y>3100&&y<4750)continue;
   // Open curbs at the training branch and round-six challenge access.
   if(x>1180&&x<1420&&y>3930&&y<4690)continue;
   if(x>3220&&x<4330&&y>3650&&y<4620)continue;
   if(segments.some(other=>other.name!==seg.name&&distanceToSegment({x,y},other.a,other.b)<other.width/2+18))continue;
   curbSegments.push({x,y,rotation:heading,length:56});
  }
 }

 // Rounded junction aprons at the main street corners and one hutong T.
 const addJunction=(id:string,x:number,y:number,arms:Intersection['arms'],type:Intersection['junctionType'])=>{
  const maxArmWidth = Math.max(0, ...arms.map(arm => arm.width ?? 0));
  intersections.push({id,x,y,size:Math.max(220, maxArmWidth * 1.04),rotation:0,junctionType:type,arms});
 };
 addJunction('bj-junction-nw',627,524,[
  {polyId:'east',heading:0,lanes:3,direction:'two-way',width:210},
  {polyId:'south',heading:Math.PI/2,lanes:3,direction:'two-way',width:210},
 ],'T');
 addJunction('bj-junction-ne',8187,524,[
  {polyId:'west',heading:Math.PI,lanes:3,direction:'two-way',width:210},
  {polyId:'south',heading:Math.PI/2,lanes:3,direction:'two-way',width:210},
 ],'T');
 addJunction('bj-junction-sw',1010,11178,[
  {polyId:'east',heading:0,lanes:3,direction:'two-way',width:210},
  {polyId:'north',heading:-Math.PI/2,lanes:3,direction:'two-way',width:210},
 ],'T');
 addJunction('bj-junction-se',8561,11178,[
  {polyId:'west',heading:Math.PI,lanes:3,direction:'two-way',width:210},
  {polyId:'north',heading:-Math.PI/2,lanes:3,direction:'two-way',width:210},
 ],'T');
 addJunction('bj-junction-h6',823,4729,[
  {polyId:'east',heading:0,lanes:1,direction:'two-way',width:80},
  {polyId:'north',heading:-Math.PI/2,lanes:3,direction:'two-way',width:210},
  {polyId:'south',heading:Math.PI/2,lanes:3,direction:'two-way',width:210},
 ],'T');
 // Clean T where the S access meets the factory loop. The rounded junction
 // patch covers the seam; markingGaps suppress both roads' edge lines/arrows.
 addJunction('bj-junction-loop-t',1650,3900,[
  {polyId:'access',heading:Math.PI,lanes:1,direction:'one-way',width:56},
  {polyId:'loop-n',heading:-Math.PI/2,lanes:1,direction:'one-way',width:68},
  {polyId:'loop-s',heading:Math.PI/2,lanes:1,direction:'one-way',width:68},
 ],'T');

 // ===== Static roadside NPCs (no moving/honking traffic) =====
 // Place them on the outer shoulder, clear of both carriageways. The model,
 // obstacle footprint and collision are fixed for the whole level/reset.
 const trafficPath=densifyPath(factoryLoop,155,true);
 const trafficColors=['#d97706','#2563eb','#d1d5db','#b91c1c','#0f766e','#a16207','#475569','#be185d'];
 for(let i=0;i<BEIJING_TRAFFIC_COUNT;i++){
  const idx=Math.floor(trafficPath.length*i/BEIJING_TRAFFIC_COUNT);
  const point=trafficPath[idx];
  const next=trafficPath[(idx+1)%trafficPath.length];
  const heading=Math.atan2(next.y-point.y,next.x-point.x);
  const shoulder=54;
  const x=point.x-Math.sin(heading)*shoulder;
  const y=point.y+Math.cos(heading)*shoulder;
  obstacles.push({
   id:`bj-roadside-${i}`,x,y,rotation:heading,width:19,height:47,type:'car',movable:false,weight:1500,elevation:0,verticalHeight:18,
   color:trafficColors[i%trafficColors.length],
  });
 }

 // Street trees follow the sidewalks; factory roads, bays and the training entrance stay clear.
 for(const seg of segments.filter(s=>s.width>=140)) {
  const dx=seg.b.x-seg.a.x,dy=seg.b.y-seg.a.y,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len;
  for(let d=170;d<len;d+=500)for(const side of [-1,1]) {
   const x=seg.a.x+ux*d-uy*side*(seg.width/2+25),y=seg.a.y+uy*d+ux*side*(seg.width/2+25);
   if(Math.abs(y-3900)<120 && x<3900)continue;
   if(distanceToPolyline({x,y},factoryLoop,true)<34+40||distanceToPolyline({x,y},accessS,false)<28+40)continue;
   if(segments.some(other=>other.name!==seg.name&&distanceToSegment({x,y},other.a,other.b)<other.width/2+40))continue;
  if(isTrainingTerrain(x,y))continue;
   obstacles.push({id:`street-tree-${obstacles.length}`,x,y,width:3,height:3,rotation:0,type:'wall',movable:false,weight:0,color:'#65624f'});
  }
 }

 const start=point([216,650]);
 // ===== Round 6: connected challenge circuit east of the factory =====
 // Access leaves the existing factory loop at (3320,3800), then a ring,
 // bridge/underpass, S-curve and return loop keep one continuous route.
 road({x:3320,y:3800},{x:4200,y:3800},104);
 road({x:4200,y:3800},{x:4200,y:4500},104);
 road({x:4200,y:4500},{x:4460,y:4500},96);
 road({x:4940,y:4500},{x:5600,y:4500},96);
 road({x:7400,y:4500},{x:8200,y:4500},96);
 road({x:8200,y:4500},{x:8200,y:5150},90);
 const ringCenter={x:4700,y:4500};
 const ringPoints:Vector2[]=[];
 for(let i=0;i<=48;i++){const a=i/48*Math.PI*2;ringPoints.push({x:ringCenter.x+Math.cos(a)*240,y:ringCenter.y+Math.sin(a)*240});}
 curvedRoads.push({points:ringPoints,width:90,color:'#353539',closed:true,direction:'one-way',lanes:2,kind:'roundabout',center:ringCenter,radius:240,elevation:0.06});
 // One-way counter-clockwise ring; width permits two SAME-direction lanes.
 // Island collision uses a convex polygon matching the visible 193.8u
 // radius; no square air wall and no passable gap at the curb.
 const islandRadius=193.8;
 const islandFootprint=Array.from({length:32},(_,i)=>{const a=i/32*Math.PI*2;return{x:Math.cos(a)*islandRadius,y:Math.sin(a)*islandRadius};});
 obstacles.push({id:'challenge-roundabout-island',x:ringCenter.x,y:ringCenter.y,width:islandRadius*2,height:islandRadius*2,rotation:0,type:'wall',movable:false,weight:0,color:'#2f5b35',verticalHeight:3,collisionOnly:true,collisionFootprint:islandFootprint});
 // Underpass continues north-south beneath the east-west deck.
 road({x:6500,y:3000},{x:6500,y:5700},82);
 // S-curve return from the east end back to the ring.
 const sCurve:Vector2[]=[{x:8200,y:5150},{x:7950,y:5500},{x:7600,y:5700},{x:7000,y:5800},{x:6400,y:5750},{x:5800,y:5600},{x:5300,y:5400},{x:4900,y:5100},{x:4940,y:4500}];
 curvedRoads.push({points:sCurve,width:82,color:'#353539',closed:false,elevation:0.07,markingGaps:[{...ringCenter,radius:310}]});
 
 // The elevated deck itself: deck height 65u=6.5m, ramps 500u long.
 const bridge={id:'challenge-bridge',x:6500,y:4500,width:2200,height:130,rotation:0,deckHeight:65,rampLength:500};
 elevatedRoads.push(bridge);
 // Physical guard rails live on the deck layer; rendering is part of the
 // bridge mesh, so these are collision-only and cannot create ground walls.
 // Rails follow the exact ramp/deck profile in short collision segments;
 // a single 65u-high rail would leave the ramps without side collision.
 const bridgeSegments=44;
 const bridgeSegLen=bridge.width/bridgeSegments;
 for(const side of [-1,1]) for(let i=0;i<bridgeSegments;i++){
   const wx=bridge.x-bridge.width/2+(i+0.5)*bridgeSegLen;
   const h=elevatedRoadProfile(bridge,wx,bridge.y)?.height??0;
   obstacles.push({id:`challenge-bridge-rail-${side}-${i}`,x:wx,y:bridge.y+side*bridge.height/2,width:bridgeSegLen+2,height:7,rotation:0,type:'wall',movable:false,weight:0,color:'#64748b',elevation:h,verticalHeight:5,collisionOnly:true});
 }
 // Piers rise from the ground to the deck; their collision interval spans the
 // underside only. A bridge-top car cannot hit supports BELOW the deck.
 for(const x of [6104,6896]) for(const side of [-1,1]) obstacles.push({id:`challenge-pier-${x}-${side}`,x,y:4500+side*52,width:22,height:22,rotation:0,type:'wall',movable:false,weight:0,color:'#475569',elevation:0,verticalHeight:bridge.deckHeight-2.26,collisionOnly:true});
 // Off-road rough bypass / optional slope near the S curve.
 slopeZones.push({x:7350,y:5450,length:280,width:70,rotation:Math.PI/2,peakHeight:12,directional:true});
 // Parking bays at the ring and east apron.
 for(const [i,x] of [4300,5100,7800].entries()) spots.push({id:`challenge-spot-${i}`,x,y:i===1?5000:5350,width:62,height:30,rotation:Math.PI,occupied:false});
 for(const [i,x] of [4300,5100,7800].entries()) roadSurfaces.push({x,y:i===1?5000:5350,width:120,height:90,rotation:0,color:'#303034',curbs:false});
 // Continuous centre/edge marks on the challenge access and S route.
 markings.push({type:'line-dashed',x:3760,y:3800,width:760,height:2,rotation:0,color:'#fff'});
 markings.push({type:'line-dashed',x:4200,y:4150,width:2,height:620,rotation:0,color:'#fff'});
 markings.push({type:'line-dashed',x:5250,y:4500,width:400,height:2,rotation:0,color:'#fff'});
 markings.push({type:'yield',x:4385,y:4524,width:20,height:24,rotation:0,color:'#fff'});
 markings.push({type:'yield',x:5015,y:4476,width:20,height:24,rotation:Math.PI,color:'#fff'});
 streetSigns.push({x:4380,y:4580,rotation:0,label:'环岛让行 · 单向环行',kind:'street'});
 streetSigns.push({x:5020,y:4420,rotation:Math.PI,label:'环岛让行 · 单向环行',kind:'street'});
 markings.push({type:'line-dashed',x:7900,y:4850,width:2,height:650,rotation:0,color:'#fff'});
 // Signs/teleport references; no hidden window hooks.
 streetSigns.push({x:4200,y:4200,rotation:0,label:'挑战环线',kind:'street'});
 streetSigns.push({x:5850,y:4380,rotation:0,label:'高架桥入口',kind:'street'});
 streetSigns.push({x:6500,y:3300,rotation:Math.PI,label:'桥下通道',kind:'street'});
 obstacles.push(...mountainRails(),...mountainPropColliders());
 return addOpenWorld({levelId:1,mapWidth:9000,mapHeight:11600,roadSurfaces,markings,obstacles,spots,curvedRoads,curbSegments,intersections,slopeZones,elevatedRoads,streetSigns,terrainZones:[terrainZone,{x:6500,y:4500,width:2200,height:1600,rotation:0,color:'#4b5563',label:'高架挑战'}],
  startPos:{x:start.x+45,y:start.y,rotation:-Math.PI/2-0.03},
  training:{title:'北京 · 东四训练扩展',tips:[
   '东四主街骨架保留；厂房、环线与交通为北京风格训练扩展，不宣称实地复刻',
   '厂区环线 / S 弯可实际行驶；路边与厂区车位蓝色 P 标记',
   '胡同低速、路口停车观察；本轮 NPC 全部固定停放/路边，不追驰、不鸣笛、不占主路',
   '挡位为游戏燃油训练标定，非各车型现实手动挡认证；单速电车不会多挡熄火',
   '驾驶视角：Alt+J/L 看左/右，Alt+K 回正，Alt+C 转向归中，Alt+鼠标左键拖动观察；不占用驾驶键',
   '非铺装训练：从训练停车区南侧支路进入；坑洼/缓坡/交叉起伏会反馈到四轮与车身',
   '挑战环线：厂区东侧约 3320,3800 进入，环岛—高架—桥下—S 弯闭环；桥面/桥下同 XY 不同高度层',
   '高架净高 65u≈6.5m，匝道约 13% 缓坡；桥下通道不与桥面护栏碰撞',
   '可选陡坡可从 S 弯旁支路绕行；低动力车型的轻油门不保证坡中起步',
  ]} });
}
