import * as THREE from 'three';
import type { LevelData } from '../types';
import { contactShadowTexture } from './materials';
import { CURB_HEIGHT, CURB_WIDTH } from '../utils/terrainSampling';
import {mergeCurbVisuals} from '../utils/curbVisuals';

/** Low-poly Beijing courtyard frontage: masonry blocks and shallow grey gables. */
export function addBeijingScenery(scene:THREE.Scene,level:LevelData,trackGeo:(g:THREE.BufferGeometry)=>THREE.BufferGeometry) {
 const buildings=level.obstacles.filter(o=>o.id.startsWith('hutong-'));
 if(buildings.length) {
  const wallGeo=trackGeo(new THREE.BoxGeometry(1,1,1));
  const wallMat=new THREE.MeshLambertMaterial({color:'#97938d'});
  const walls=new THREE.InstancedMesh(wallGeo,wallMat,buildings.length);
  const shape=new THREE.Shape();shape.moveTo(-.5,0);shape.lineTo(0,1);shape.lineTo(.5,0);shape.closePath();
  const roofGeo=trackGeo(new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false}));roofGeo.translate(0,0,-.5);
  const roofMat=new THREE.MeshLambertMaterial({color:'#535860',flatShading:true});
  const roofs=new THREE.InstancedMesh(roofGeo,roofMat,buildings.length);
  const windows=new THREE.InstancedMesh(wallGeo,new THREE.MeshLambertMaterial({color:'#414e54'}),buildings.length*4);
  const doors=new THREE.InstancedMesh(wallGeo,new THREE.MeshLambertMaterial({color:'#634c42'}),buildings.length*2);
  const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),scale=new THREE.Vector3();
  buildings.forEach((o,i)=>{
   matrix.compose(p.set(o.x,14,o.y),q,scale.set(o.width,28,o.height));walls.setMatrixAt(i,matrix);walls.setColorAt(i,new THREE.Color(o.color));
   matrix.compose(p.set(o.x,28,o.y),q,scale.set(o.width,16,o.height));roofs.setMatrixAt(i,matrix);
   for(const side of [-1,1]) {
    const sideIndex=side>0?1:0;
    for(const lateral of [-1,1]) {
      matrix.compose(p.set(o.x+lateral*o.width*.27,16,o.y+side*(o.height/2+.2)),q,scale.set(o.width*.14,7,.5));
      windows.setMatrixAt(i*4+sideIndex*2+(lateral>0?1:0),matrix);
    }
    matrix.compose(p.set(o.x,9,o.y+side*(o.height/2+.25)),q,scale.set(11,18,.6));doors.setMatrixAt(i*2+sideIndex,matrix);
   }
  });
  scene.add(windows,doors);
  walls.castShadow=true;walls.receiveShadow=true;roofs.castShadow=true;scene.add(walls,roofs);
 }
 // ===== Large training-extension buildings (factories / warehouses / parking) =====
 const bigBuildings=level.obstacles.filter(o=>o.id.startsWith('bj-building-'));
 if(bigBuildings.length) {
  type Spec={o:typeof bigBuildings[number];kind:string;height:number;roof:number;bucket:string};
  const specs:Spec[]=bigBuildings.map((o,index)=>{
   const kind=o.id.split('-')[2]??'warehouse';
   const base=kind==='parking'?66:kind==='factory'?48:kind==='service'?22:30;
   const vary=(index*13)%9;
   const height=o.verticalHeight??(base+vary);
   const roof=kind==='warehouse'?height*0.22:kind==='factory'?height*0.18:0;
   return {o,kind,height,roof,bucket:`${Math.floor(o.x/3000)}:${Math.floor(o.y/4000)}`};
  });
  const buckets=new Map<string,Spec[]>();
  specs.forEach(spec=>{const list=buckets.get(spec.bucket);if(list)list.push(spec);else buckets.set(spec.bucket,[spec]);});
  const bodyMat=new THREE.MeshLambertMaterial({color:'#ffffff'});
  bodyMat.onBeforeCompile=shader=>{
   shader.vertexShader='varying vec3 facadeP;varying vec3 facadeN;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfacadeP=(instanceMatrix*vec4(position,1.)).xyz;facadeN=normal;');
   shader.fragmentShader='varying vec3 facadeP;varying vec3 facadeN;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    if(abs(facadeN.y)<.5 && facadeP.y>40.){
     float u=fract((abs(facadeN.x)>.5?facadeP.z:facadeP.x)/36.);
     float v=fract(facadeP.y/34.);
     float glass=step(.14,u)*(1.-step(.86,u))*step(.18,v)*(1.-step(.86,v));
     diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.47,.61,.71),glass);
    }`);
  };
  const bodyGeo=trackGeo(new THREE.BoxGeometry(1,1,1));
  const shape=new THREE.Shape();shape.moveTo(-.5,0);shape.lineTo(0,1);shape.lineTo(.5,0);shape.closePath();
  const gableGeo=trackGeo(new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false}));gableGeo.translate(0,0,-.5);
  const gableMat=new THREE.MeshLambertMaterial({color:'#666a6e',flatShading:true});
  const flatRoofMat=new THREE.MeshLambertMaterial({color:'#5c6268'});
  const windowCount=specs.length*4;
  const windows=new THREE.InstancedMesh(bodyGeo,new THREE.MeshLambertMaterial({color:'#334049'}),windowCount);
  const windowIndex={value:0};
  const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),scale=new THREE.Vector3();
  const shadows=new THREE.InstancedMesh(
    trackGeo(new THREE.PlaneGeometry(1,1)),
    new THREE.MeshBasicMaterial({map:contactShadowTexture(),transparent:true,opacity:0.22,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),
    specs.length,
  );
  const shadowQuat=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0));
  specs.forEach((spec,index)=>{
   const {o}=spec;
   matrix.compose(p.set(o.x,0.14,o.y),shadowQuat,scale.set(o.width*0.96,o.height*0.94,1));
   shadows.setMatrixAt(index,matrix);
  });
  buckets.forEach(list=>{
   const bodies=new THREE.InstancedMesh(bodyGeo,bodyMat,list.length);
   const gabled=list.filter(s=>s.roof>0);
   const flat=list.filter(s=>s.roof<=0);
   const roofsG=gabled.length?new THREE.InstancedMesh(gableGeo,gableMat,gabled.length):null;
   const roofsF=flat.length?new THREE.InstancedMesh(bodyGeo,flatRoofMat,flat.length):null;
   list.forEach((spec,index)=>{
    const {o}=spec;
    matrix.compose(p.set(o.x,spec.height/2,o.y),q,scale.set(o.width,spec.height,o.height));
    bodies.setMatrixAt(index,matrix);
    bodies.setColorAt(index,new THREE.Color(o.color));
    if(spec.roof>0&&roofsG){const gi=gabled.indexOf(spec);matrix.compose(p.set(o.x,spec.height,o.y),q,scale.set(o.width*1.04,spec.roof,o.height*1.04));roofsG.setMatrixAt(gi,matrix);}
    if(spec.roof<=0&&roofsF){const fi=flat.indexOf(spec);matrix.compose(p.set(o.x,spec.height+0.6,o.y),q,scale.set(o.width*1.02,1.2,o.height*1.02));roofsF.setMatrixAt(fi,matrix);}
    // Four dark window strips on the long facades.
    for(const side of [-1,1])for(const lateral of [-1,1]){
     matrix.compose(p.set(o.x+lateral*o.width*.27,spec.height*.44,o.y+side*(o.height/2+.36)),q,scale.set(o.width*.18,spec.height*.18,.55));
     const wi=windowIndex.value++;windows.setMatrixAt(wi,matrix);
    }
   });
   bodies.instanceMatrix.needsUpdate=true;
   if(bodies.instanceColor)bodies.instanceColor.needsUpdate=true;
   bodies.castShadow=true;bodies.receiveShadow=true;
   bodies.computeBoundingSphere();
   scene.add(bodies);
   if(roofsG){roofsG.instanceMatrix.needsUpdate=true;roofsG.castShadow=true;roofsG.computeBoundingSphere();scene.add(roofsG);}
   if(roofsF){roofsF.instanceMatrix.needsUpdate=true;roofsF.castShadow=true;roofsF.computeBoundingSphere();scene.add(roofsF);}
  });
  windows.instanceMatrix.needsUpdate=true;windows.castShadow=false;windows.computeBoundingSphere();scene.add(windows);
  shadows.instanceMatrix.needsUpdate=true;shadows.renderOrder=2;shadows.computeBoundingSphere();scene.add(shadows);
 }

 // ===== Instanced curbs along the main streets =====
 const curbs=mergeCurbVisuals(level.curbSegments??[]);
 if(curbs.length){
  const curbMaterial=new THREE.MeshLambertMaterial({color:'#b8b3a7'});
  curbMaterial.onBeforeCompile=shader=>{
   shader.vertexShader='varying float curbU;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncurbU=position.x*length(instanceMatrix[0].xyz);');
   shader.fragmentShader='varying float curbU;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    float seam=abs(fract(curbU/10.+.5)-.5)*10.;
    float aa=max(fwidth(curbU),.05);
    float line=1.-smoothstep(.07,.07+aa,seam);
    diffuseColor.rgb*=1.-.28*line;`);
  };
  const curbMesh=new THREE.InstancedMesh(
   trackGeo(new THREE.BoxGeometry(1,1,1)),
   curbMaterial,
   curbs.length,
  );
  const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),scale=new THREE.Vector3();
  curbs.forEach((curb,index)=>{
   q.setFromEuler(new THREE.Euler(0,-curb.rotation,0));
   matrix.compose(p.set(curb.x, CURB_HEIGHT / 2, curb.y),q,scale.set(curb.length, CURB_HEIGHT, CURB_WIDTH));
   curbMesh.setMatrixAt(index,matrix);
  });
  curbMesh.instanceMatrix.needsUpdate=true;curbMesh.receiveShadow=true;curbMesh.computeBoundingSphere();scene.add(curbMesh);
 }

 const trees=level.obstacles.filter(o=>o.id.startsWith('street-tree-'));
 if(trees.length) {
  const trunks=new THREE.InstancedMesh(trackGeo(new THREE.CylinderGeometry(1.3,1.5,30,8)),new THREE.MeshLambertMaterial({color:'#706351'}),trees.length);
  const crowns=new THREE.InstancedMesh(trackGeo(new THREE.IcosahedronGeometry(20,1)),new THREE.MeshLambertMaterial({color:'#718650',flatShading:true}),trees.length);
  const matrix=new THREE.Matrix4();
  trees.forEach((tree,i)=>{trunks.setMatrixAt(i,matrix.makeTranslation(tree.x,15,tree.y));crowns.setMatrixAt(i,matrix.makeTranslation(tree.x,41,tree.y));});
  scene.add(trunks,crowns);
 }
 for(const sign of level.streetSigns??[]) {
  const root=new THREE.Group();root.position.set(sign.x,0,sign.y);root.rotation.y=Math.PI/2-sign.rotation;
  const pole=new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(.55,.55,28,8)),new THREE.MeshLambertMaterial({color:'#7b8387'}));pole.position.y=14;root.add(pole);
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=sign.kind==='speed'?512:160;
  const ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,canvas.width,canvas.height);
  if(sign.kind==='speed') {
   ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(256,256,244,0,Math.PI*2);ctx.fill();
   ctx.strokeStyle='#bc302d';ctx.lineWidth=40;ctx.beginPath();ctx.arc(256,256,218,0,Math.PI*2);ctx.stroke();
   ctx.fillStyle='#202327';ctx.font='bold 245px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(sign.label,256,266);
  } else {
   ctx.fillStyle=sign.kind==='parking'?'#195e9b':'#257343';ctx.fillRect(0,0,512,160);ctx.strokeStyle='#fff';ctx.lineWidth=5;ctx.strokeRect(8,8,496,144);
   const label=sign.kind==='parking'?'P  '+sign.label:sign.label;
   ctx.fillStyle='#fff';ctx.font=`bold ${Math.min(63,Math.floor(460/label.length))}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,256,83,460);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const width=sign.kind==='speed'?9:32,height=sign.kind==='speed'?9:10;
  const boardGeometry=trackGeo(new THREE.PlaneGeometry(width,height));
  const boardMaterial=new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.FrontSide});
  const board=new THREE.Mesh(boardGeometry,boardMaterial);board.position.set(0,27,.12);root.add(board);
  // DoubleSide text is mirrored when approached from the reverse side.
  // Street/parking signs have two separately oriented printed faces.
  const back=new THREE.Mesh(boardGeometry,sign.kind==='speed'?new THREE.MeshBasicMaterial({color:'#687378',side:THREE.FrontSide}):boardMaterial);
  back.position.set(0,27,-.12);back.rotation.y=Math.PI;root.add(back);scene.add(root);
 }
}
