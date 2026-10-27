import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MobileInputController} from '../utils/mobileInput';
import {buildChallengeMap,challengeHeight,challengeMeshHeight,CHALLENGE_COLUMNS,CHALLENGE_ROWS} from '../utils/challengeMaps';
import {sampleTerrainSurface} from '../utils/terrainSampling';
import {qualityProfile} from '../utils/renderQuality';
import {curbTripRollover} from '../utils/wheelObstacles';
import {createLateralState,stepLateral} from '../utils/lateralDynamics';
const input=new MobileInputController();
assert(input.begin('steer',1,200,10,0));
for(const [x,expected] of [[-50,-540],[100,-540],[200,0],[300,540],[350,540],[175,-135]] as const){
 assert(input.steerAt(1,x,100,200,540));assert.equal(input.snapshot().steeringWheelAngle,expected);
}
assert(input.begin('gas',2,500,100));input.move('gas',2,500,30,540);
assert.equal(input.snapshot().throttle,1);assert(input.steerAt(1,300,100,200,540));
assert.equal(input.snapshot().throttle,1,'steering and throttle remain independent');
assert(!input.steerAt(2,100,100,200,540),'a different finger cannot take steering');
input.end('steer',1);assert.equal(input.snapshot().steeringWheelAngle,undefined);
assert(qualityProfile('auto',3,true).floor>=.8,'auto mode preserves a readable minimum resolution');
assert(!curbTripRollover(25,.7,1.8,.65,false),'flat-road slide alone does not trigger curb-trip rollover');
assert(!curbTripRollover(3,.7,1.8,.65,true),'slow curb contact must not cause rollover');
assert(curbTripRollover(25,.7,1.8,.65,true),'fast sideways impact can trip an SUV');
for(const direction of [-1,1]){
 const low=stepLateral(createLateralState(),{speed:2,steer:direction*.5,rearSteer:0,wheelbase:2.9,rearOffset:1.45,
  frontBias:.5,grip:1,layout:'AWD',throttle:.2,handbrake:false,frontLocked:false,dt:1/60,understeer:.2});
 assert.equal(low.blend,0,'a parking-speed arc uses rolling geometry, not a dynamic skid');
 assert.equal(low.frontSlip,0);assert.equal(low.rearSlip,0);
}

// Raycast the actual triangle mesh, using independent points away from its
// vertices. Contact must match what the renderer shows, not the smooth source.
for(let id=8;id<=12;id++){
 const level=buildChallengeMap(id);assert.equal(level.levelId,id);assert(level.mapWidth>=4000);
 const geom=new THREE.PlaneGeometry(level.mapWidth,level.mapHeight,CHALLENGE_COLUMNS,CHALLENGE_ROWS),p=geom.getAttribute('position');
 for(let i=0;i<p.count;i++)p.setZ(i,challengeHeight(level,p.getX(i)+level.mapWidth/2,level.mapHeight/2-p.getY(i)));
 geom.rotateX(-Math.PI/2);const mesh=new THREE.Mesh(geom,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.position.set(level.mapWidth/2,0,level.mapHeight/2);mesh.updateMatrixWorld();
 for(let i=0;i<24;i++){
  const x=20+((i*481.37+id*71)%4100),y=20+((i*239.73+id*33)%3100);
  const hit=new THREE.Raycaster(new THREE.Vector3(x,200,y),new THREE.Vector3(0,-1,0)).intersectObject(mesh)[0];
  assert(hit&&Math.abs(hit.point.y-challengeMeshHeight(level,x,y))<1e-4);
  assert.equal(sampleTerrainSurface(level,x,y).height,challengeMeshHeight(level,x,y));
 }
 geom.dispose();(mesh.material as THREE.Material).dispose();
 assert(level.obstacles.some(o=>o.id.startsWith('challenge-tree-')&&o.collisionOnly));
 if(id===9)assert(level.challengeTerrain!.grip<.4,'snow grip is lower than dry asphalt');
}
console.log('Round27 PASS: absolute multi-touch steering, bounded automatic quality and five terrain/contact meshes.');
