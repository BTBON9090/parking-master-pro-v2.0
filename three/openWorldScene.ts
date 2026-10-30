import {splitSpatialMesh} from './spatialMesh';
import {addMountainAdventure} from './mountainAdventureScene';
import {cutLiftOpening,MOUNTAIN_LIFT,inMountainLift,mountainAdventureObstacles} from '../utils/mountainAdventure';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LevelData, Obstacle } from '../types';
import { crossingRoadAt, MOUNTAIN_BOUNDS, WORLD_TERRAIN_STEP, inCity, WORLD_ROUTES, WORLD_PUDDLES, WORLD_PLACES, worldHeight, roadVertexHeight, nearestWorldRoad, terrainVertexHeight, worldTreePlacements, worldSignPlacements } from '../utils/openWorld';

/** All surfaces and paint use the same world-height sampler as the four tyres. */
export function addOpenWorldScene(scene:THREE.Scene,level:LevelData,track:(g:THREE.BufferGeometry)=>THREE.BufferGeometry){
 if(!level.openWorld)return;
 addMountainAdventure(scene,track);
 const mesh=(positions:number[],indices:number[],material:THREE.Material,colors?:number[])=>{
  indices=cutLiftOpening(positions,indices,colors);
  const g=track(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);
  if(colors)g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();
  const m=new THREE.Mesh(g,material);m.receiveShadow=true;scene.add(m);return m;
 };
 // Large merged roads previously spanned the entire map, so all triangles
 // were submitted for the main view and each mirror even when far away.
 const chunkedMesh=(positions:number[],indices:number[],material:THREE.Material,name:string,colors?:number[],order=0)=>{
  for(const chunk of splitSpatialMesh(positions,indices,colors)){const m=mesh(chunk.positions,chunk.indices,material,chunk.colors);m.name=name;m.renderOrder=order;}
 };
 const groundColor=(h:number)=>new THREE.Color('#627455').lerp(new THREE.Color('#a29d85'),Math.min(.55,Math.max(0,(h-2500)/9000)));
 const b=MOUNTAIN_BOUNDS,step=WORLD_TERRAIN_STEP,chunk=24;
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
 const nx=Math.ceil((b.x1-b.x0)/step),ny=Math.ceil((b.y1-b.y0)/step);
 // Individual terrain tiles can be frustum-culled in the main view and mirrors.
 for(let cy=0;cy<ny;cy+=chunk)for(let cx=0;cx<nx;cx+=chunk){
  const w=Math.min(chunk,nx-cx),h=Math.min(chunk,ny-cy),pos:number[]=[],ix:number[]=[],colors:number[]=[];
  for(let j=0;j<=h;j++)for(let i=0;i<=w;i++){
   const x=(cx+i)*step,y=(cy+j)*step,height=terrainVertexHeight(x,y),c=groundColor(height);
   pos.push(x,height+.025,y);colors.push(c.r,c.g,c.b);
   if(i<w&&j<h&&!inCity(x+step/2,y+step/2)){const a=j*(w+1)+i;ix.push(a,a+w+1,a+1,a+1,a+w+1,a+w+2);}
  }
  if(ix.length)mesh(pos,ix,material,colors).name='MountainTerrain';
 }
 // Shoulder ribbons cover the coarse terrain edge and use the same support height.
 const shoulderP:number[]=[],shoulderI:number[]=[],shoulderC:number[]=[];
 for(const r of WORLD_ROUTES)for(const side of [-1,1]){
  const base=shoulderP.length/3,cols=12;
  for(let i=0;i<r.samples.length;i++){
   const q=r.samples[i];
   for(let j=0;j<=cols;j++){
    const off=(r.width/2+j*5)*side,x=q.x+q.nx*off,y=q.y+q.ny*off;
    const h=roadVertexHeight(x,y),c=groundColor(h);shoulderP.push(x,h+.035,y);shoulderC.push(c.r,c.g,c.b);
    if(i<r.samples.length-1&&j<cols){const a=base+i*(cols+1)+j;if(side>0)shoulderI.push(a,a+cols+1,a+1,a+1,a+cols+1,a+cols+2);else shoulderI.push(a,a+cols+1,a+cols+2,a,a+cols+2,a+1);}
   }
  }
 }
 chunkedMesh(shoulderP,shoulderI,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2}),'MountainShoulder',shoulderC);
 const paint:{[k:string]:{p:number[];i:number[]}}={white:{p:[],i:[]},yellow:{p:[],i:[]}};
 const asphalt={p:[] as number[],i:[] as number[],c:[] as number[]},gravel={p:[] as number[],i:[] as number[],c:[] as number[]};
 const junctions=WORLD_ROUTES.flatMap(r=>r.closed?[]:[r.samples[0],r.samples.at(-1)!]);
 for(const r of WORLD_ROUTES){
  const target=r.gravel?gravel:asphalt,cols=r.gravel?12:8,base=target.p.length/3;
  for(let i=0;i<r.samples.length;i++){
   const p=r.samples[i];
   for(let j=0;j<=cols;j++){
    const off=(j/cols-.5)*r.width,x=p.x+p.nx*off,y=p.y+p.ny*off;
    target.p.push(x,roadVertexHeight(x,y)+(r.gravel?.16:.055),y);
    const noise=.004*Math.sin(x*2.31+y*3.12),c=new THREE.Color(r.gravel?'#8d8066':'#45494b');c.offsetHSL(0,0,noise);target.c.push(c.r,c.g,c.b);
    if(i<r.samples.length-1&&j<cols){const a=base+i*(cols+1)+j;target.i.push(a,a+cols+1,a+1,a+1,a+cols+1,a+cols+2);}
   }
   if(i===0||r.gravel)continue;
   const prev=r.samples[i-1];
   if(junctions.some(j=>Math.hypot(p.x-j.x,p.y-j.y)<80))continue;
   // Double solid yellow centre and white edge lines continue through every curve and crest.
   for(const [offset,width,key] of [[-r.width/2+2,1.2,'white'],[r.width/2-2,1.2,'white'],[-1.25,1.1,'yellow'],[1.25,1.1,'yellow']] as const){
    const out=paint[key],base=out.p.length/3;
    for(const q of [prev,p])for(const side of [-1,1]){
     const off=offset+width/2*side,x=q.x+q.nx*off,y=q.y+q.ny*off;
     // Follow the rendered road's cross-section, not a second analytic surface:
     // on a cambered crest those two interpolations can put paint below asphalt.
     const cell=Math.max(0,Math.min(cols-1,Math.floor((off/r.width+.5)*cols)));
     const lo=(cell/cols-.5)*r.width,hi=((cell+1)/cols-.5)*r.width;
     const h0=roadVertexHeight(q.x+q.nx*lo,q.y+q.ny*lo),h1=roadVertexHeight(q.x+q.nx*hi,q.y+q.ny*hi);
     out.p.push(x,h0+(h1-h0)*(off-lo)/(hi-lo)+.105,y);
    }
    out.i.push(base,base+2,base+1,base+1,base+2,base+3);
   }
  }
 }
 for(const data of [asphalt,gravel]){
  chunkedMesh(data.p,data.i,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),data===asphalt?'MountainAsphalt':'CreekGravel',data.c,2);
 }
 for(const [key,data] of Object.entries(paint)){
  chunkedMesh(data.p,data.i,new THREE.MeshBasicMaterial({color:key==='white'?'#e3e4d8':'#e9c35c',side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}),`MountainPaint-${key}`,undefined,6);
 }
 for(const p of WORLD_PUDDLES){
  const waterY=worldHeight(p.x,p.y)+.45,ps:number[]=[],ids:number[]=[];
  // Fine clipped water mesh keeps the uphill bank dry; no translucent plane through the road.
  for(let x=p.x-p.rx;x<p.x+p.rx;x+=1.5)for(let y=p.y-p.ry;y<p.y+p.ry;y+=1.5){
   const corners=[[x,y],[x,y+1.5],[x+1.5,y],[x+1.5,y+1.5]];
   if(corners.some(([a,b])=>((a-p.x)/p.rx)**2+((b-p.y)/p.ry)**2>1||worldHeight(a,b)+.06>waterY))continue;
   const base=ps.length/3;for(const [a,b] of corners)ps.push(a,waterY+.07,b);ids.push(base,base+1,base+2,base+2,base+1,base+3);
  }
  mesh(ps,ids,new THREE.MeshStandardMaterial({color:'#547e89',roughness:.22,metalness:.18,transparent:true,opacity:.8,side:THREE.DoubleSide})).name='ShallowPuddle';
 }
 // Guardrail colliders and their visible beams are generated from exactly the same boxes.
 const rails:THREE.BufferGeometry[]=[],posts:THREE.BufferGeometry[]=[];
 for(const o of level.obstacles.filter(o=>o.id.startsWith('mountain-rail'))){
  const dx=Math.cos(o.rotation)*o.width/2,dy=Math.sin(o.rotation)*o.width/2;
  const h1=worldHeight(o.x-dx,o.y-dy),h2=worldHeight(o.x+dx,o.y+dy);
  const direction=new THREE.Vector3(dx*2,h2-h1,dy*2);
  const g=new THREE.BoxGeometry(direction.length(),2.2,o.height);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1,0,0),direction.normalize()));
  g.translate(o.x,(h1+h2)/2+6.2,o.y);rails.push(g);
  const post=new THREE.BoxGeometry(1,7.2,1);post.translate(o.x,(o.elevation||0)+3.6,o.y);posts.push(post);
 }
 for(const [gs,color] of [[rails,'#aab0ac'],[posts,'#666d66']] as const){
  if(!gs.length)continue;const merged=track(mergeGeometries(gs as THREE.BufferGeometry[])!);gs.forEach(g=>g.dispose());
  const m=new THREE.Mesh(merged,new THREE.MeshStandardMaterial({color,roughness:.7}));m.castShadow=true;m.receiveShadow=true;scene.add(m);
 }
 // Batched sparse trees; the road corridor stays unobstructed.
 const treeGeo=track(new THREE.ConeGeometry(15,50,7)),trunkGeo=track(new THREE.CylinderGeometry(1.7,2.5,17,6));
 const placements=worldTreePlacements();
 for(const [g,color,offset] of [[treeGeo,'#3f624b',35],[trunkGeo,'#655844',8.5]] as const){
  const m=new THREE.InstancedMesh(g,new THREE.MeshStandardMaterial({color,roughness:1}),placements.length),dummy=new THREE.Object3D();
  placements.forEach((p,i)=>{dummy.position.set(p.x,p.h+offset*p.s,p.y);dummy.scale.setScalar(p.s);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);});m.castShadow=true;m.receiveShadow=true;scene.add(m);
 }
 if(typeof document==='undefined')return;
 for(const p of worldSignPlacements()){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=160;const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#173e37';ctx.fillRect(0,0,512,160);ctx.strokeStyle='#e3ecda';ctx.lineWidth=8;ctx.strokeRect(6,6,500,148);
  ctx.fillStyle='#f1f3e6';ctx.textAlign='center';ctx.font='bold 42px sans-serif';ctx.fillText(p.label,256,72);ctx.font='25px sans-serif';ctx.fillText('山路慢行  30 km/h',256,123);
  const {x,y,h}=p;
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  // Separate front-facing boards: a DoubleSide texture would read backwards from behind.
  for(const side of [0,1]){
   const m=new THREE.Mesh(track(new THREE.PlaneGeometry(52,17)),new THREE.MeshBasicMaterial({map:texture}));
   const yaw=p.yaw+side*Math.PI;
   m.position.set(x+Math.sin(yaw)*.15,h+34,y+Math.cos(yaw)*.15);m.rotation.y=yaw;scene.add(m);
  }
  const post=new THREE.Mesh(track(new THREE.CylinderGeometry(.7,.7,32,6)),new THREE.MeshStandardMaterial({color:'#9aaba0'}));post.position.set(x,h+16,y);scene.add(post);
 }
}

export function mountainRails():Obstacle[]{
 const out:Obstacle[]=[];const junctions=WORLD_ROUTES.flatMap(r=>r.closed?[]:[r.samples[0],r.samples.at(-1)!]);
 for(const r of WORLD_ROUTES.filter(r=>!r.gravel&&r.id!=='gateway'))for(let i=4;i<r.samples.length;i+=4){
  const a=r.samples[i-4],b=r.samples[i];
  if(junctions.some(j=>Math.hypot(b.x-j.x,b.y-j.y)<110))continue;
  for(const side of [-1,1]){
   const x1=a.x+a.nx*(r.width/2+3)*side,y1=a.y+a.ny*(r.width/2+3)*side,x2=b.x+b.nx*(r.width/2+3)*side,y2=b.y+b.ny*(r.width/2+3)*side;
   // Check both ends and the interior: a long rail must not span another road.
   if([0,.25,.5,.75,1].some(t=>crossingRoadAt(r,x1+(x2-x1)*t,y1+(y2-y1)*t,a.h+(b.h-a.h)*t)))continue;
   const x=(x1+x2)/2,y=(y1+y2)/2,h1=worldHeight(x1,y1),h2=worldHeight(x2,y2);
   out.push({id:`mountain-rail-${r.id}-${i}-${side}`,x,y,width:Math.hypot(x2-x1,y2-y1)+.2,height:1,rotation:Math.atan2(y2-y1,x2-x1),type:'wall',movable:false,weight:0,color:'#aab0ac',elevation:(h1+h2)/2,verticalHeight:7.3,collisionOnly:true});
  }
 }
 return out;
}

export function mountainPropColliders():Obstacle[]{
 const trees=worldTreePlacements().map((p,i)=>({id:`mountain-tree-${i}`,x:p.x,y:p.y,width:5*p.s,height:5*p.s,rotation:0,type:'wall' as const,movable:false,weight:0,color:'#655844',elevation:p.h,verticalHeight:17*p.s,collisionOnly:true,
 collisionFootprint:Array.from({length:6},(_,j)=>({x:2.5*p.s*Math.cos(j*Math.PI/3),y:2.5*p.s*Math.sin(j*Math.PI/3)}))}));
 const signs=worldSignPlacements().map((p,i)=>({id:`mountain-sign-${i}`,x:p.x,y:p.y,width:1.4,height:1.4,rotation:0,type:'wall' as const,movable:false,weight:0,color:'#9aaba0',elevation:p.h,verticalHeight:32,collisionOnly:true}));
 return [...trees,...signs,...mountainAdventureObstacles()];
}
