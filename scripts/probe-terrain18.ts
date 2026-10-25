import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildBeijingLevel} from '../utils/beijingMap';
import {createChassisState,stepChassis} from '../utils/chassisSupport';
import {suspensionForCar} from '../utils/suspension';
import {CarType} from '../types';
import {sampleWheelSupport} from '../utils/wheelObstacles';
import {sampleTerrainSurface} from '../utils/terrainSampling';
const level=buildBeijingLevel(),spec=suspensionForCar(CarType.TAI7);
const wheels=[[-8.6,14.6],[8.6,14.6],[-8.6,-14.6],[8.6,-14.6]].map(([x,z])=>({x,z,y:3.95,radius:3.95,halfWidth:1.3,steer:0}));
const report=[];
// Prescribed speeds isolate suspension contact from drivetrain / driver input.
for(const speed of [2,25,35]){
 const state=createChassisState();let y=0,air=0,maxGap=0,minGap=0,maxHeight=0;
 const heading=-.381762,position={x:10720,y:4960,rotation:heading};
 const start={...position};
 const support=(i:number,h:THREE.Vector3,a:THREE.Vector3)=>sampleWheelSupport(level,position,{x:h.x,z:h.z,radius:3.95,halfWidth:1.3,steer:0,axis:{x:Math.sin(heading)*a.x+Math.cos(heading)*a.z,y:a.y,z:-Math.cos(heading)*a.x+Math.sin(heading)*a.z}},sampleTerrainSurface(level,position.x,position.y).height);
 const base={wheels,spec,mass:2495,cgM:.67,frontBias:.51,longG:0,latG:0,deltaLeft:0,rideHeight:0,dt:1/240,support};
 stepChassis(state,{...base,deltaForward:0});
 while(y<1200){
  const dz=speed*10/240;y+=dz;position.x=start.x+y*Math.cos(heading);position.y=start.y+y*Math.sin(heading);
  const p=stepChassis(state,{...base,deltaForward:dz});
  if(p.airborne)air+=1/240;maxGap=Math.max(maxGap,...p.contacts.map(c=>c.gap));minGap=Math.min(minGap,...p.contacts.map(c=>c.gap));maxHeight=Math.max(maxHeight,p.height);
 }
 assert(minGap>-.001,"mountain tyre must not penetrate terrain");
 assert(speed===2?air===0:air>.3,"low speed stays grounded; fast crest launches");
 report.push({speedMps:speed,airtimeSeconds:air,maxWheelGapM:maxGap/10,minWheelGapM:minGap/10,maxHeightM:maxHeight/10});
}

fs.mkdirSync("docs/round18",{recursive:true});
fs.writeFileSync("docs/round18/mountain-contact.json",JSON.stringify(report,null,2));
console.log("Production mountain profile, low-speed contact and fast crest PASS",report);
