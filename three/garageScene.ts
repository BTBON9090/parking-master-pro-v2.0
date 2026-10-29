import * as THREE from 'three';
import {GARAGE_SPIRAL,garageSpiralPoint,GARAGE_LEVELS, garageRampHeight, GARAGE_PILLAR_X, GARAGE_PILLAR_Y, GARAGE_SPEED_TABLES, garageBump} from '../utils/garage';

/** Shared ramp profile drives both the triangles and the tyre contact surface. */
export function addGarageArchitecture(scene:THREE.Scene,track:(g:THREE.BufferGeometry)=>THREE.BufferGeometry){
 const ceilingGroup=new THREE.Group();ceilingGroup.name='garage-ceilings';
 const concrete=new THREE.MeshStandardMaterial({color:'#505e66',roughness:1,side:THREE.BackSide});
 const makeLabel=(text:string,color:string,w:number,h:number)=>{
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;
  const c=canvas.getContext('2d')!;c.fillStyle=color;c.fillRect(0,0,1024,128);c.strokeStyle='#edf5f8';c.lineWidth=5;c.strokeRect(7,7,1010,114);
  c.fillStyle='#fff';c.font='bold 58px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,512,66);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return new THREE.Mesh(track(new THREE.PlaneGeometry(w,h)),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,toneMapped:false}));
 };
 GARAGE_LEVELS.forEach((e,f)=>{
  const ceiling=new THREE.Mesh(track(new THREE.PlaneGeometry(1400,800)),concrete);ceiling.rotation.x=-Math.PI/2;ceiling.position.set(800,e+42,500);ceiling.userData.floor=f;ceilingGroup.add(ceiling);
  const label=makeLabel(`B${f+1}   PARKING   限速 10`,['#235f85','#2d766b','#735f84'][f],200,25);
  label.position.set(800,e+27,105);scene.add(label);
  for(const y of [220,780]){
   const down=y===220;if((down&&f===2)||(!down&&f===0))continue;
   const sign=makeLabel(down?`↓ B${f+2}  下行 DOWN →`:`↑ B${f}  上行 UP →`,down?'#226aa0':'#23715a',108,14);
   sign.rotation.y=-Math.PI/2;sign.position.set(1480,e+32,y);scene.add(sign);
   const ground=makeLabel(down?`B${f+2} ↓`:`B${f} ↑`,down?'#205678':'#285f4b',75,27);
   ground.rotation.x=-Math.PI/2;ground.rotation.z=-Math.PI/2;ground.position.set(1430,e+.25,y);scene.add(ground);
  }
  // Paired bay backs carry pillars and yellow safety hatching. All trims
  // fit within the pillar footprint, keeping every driving aisle unobstructed.
  const bands=new THREE.InstancedMesh(track(new THREE.BoxGeometry(10.04,1.2,10.04)),new THREE.MeshStandardMaterial({color:'#e6b849',roughness:1}),18);
  let bi=0;
  for(const x of GARAGE_PILLAR_X)for(const z of GARAGE_PILLAR_Y){
   for(const h of [5,8,11])bands.setMatrixAt(bi++,new THREE.Matrix4().makeTranslation(x,e+h,z));
   const pad=new THREE.Mesh(track(new THREE.PlaneGeometry(22,22)),new THREE.MeshBasicMaterial({color:'#b49a47',side:THREE.DoubleSide}));pad.rotation.x=-Math.PI/2;pad.position.set(x,e+.15,z);scene.add(pad);
  }bands.instanceMatrix.needsUpdate=true;bands.castShadow=true;scene.add(bands);
  // Row IDs and high-contrast level bands use only a few shared-scale labels.
  for(const [row,z] of [330,430,570,670].entries()){
   const id=makeLabel(`B${f+1}  ${String.fromCharCode(65+row)}区  01 — 18`,['#235f85','#2d766b','#735f84'][f],85,12);
   id.rotation.x=-Math.PI/2;id.position.set(255,e+.19,z);scene.add(id);
  }
  const band=new THREE.Mesh(track(new THREE.BoxGeometry(1380,3,1)),new THREE.MeshStandardMaterial({color:['#397caa','#3e9b86','#91769d'][f],roughness:1}));band.position.set(800,e+13,101);scene.add(band);
  for(const table of GARAGE_SPEED_TABLES){
   const p:number[]=[],idx:number[]=[],colors:number[]=[];
   for(let i=0;i<=26;i++)for(let side=0;side<2;side++){
    const x=table.x-13+i,z=table.y+(side?46:-46);p.push(x,e+garageBump(x,z).height+.14,z);
    const c=new THREE.Color(Math.floor(i/4)%2?'#e0b840':'#343b40');colors.push(c.r,c.g,c.b);
    if(i<26&&side===0){const n=i*2;idx.push(n,n+2,n+1,n+1,n+2,n+3);}
   }
   const g=track(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(idx);g.computeVertexNormals();
   const bump=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));bump.receiveShadow=true;scene.add(bump);
  }
  // Emissive light panels provide readable scale without dozens of point lights.
  const lights=new THREE.InstancedMesh(track(new THREE.BoxGeometry(70,.5,7)),new THREE.MeshBasicMaterial({color:'#dbeaf2'}),12);
  let i=0;for(const x of [350,650,950,1250])for(const z of [220,500,780])lights.setMatrixAt(i++,new THREE.Matrix4().makeTranslation(x,e+40,z));
  lights.instanceMatrix.needsUpdate=true;scene.add(lights);
 });
 for(let f=0;f<2;f++){
  const ramp=new THREE.Group();ramp.name=`garage-ramp-${f}`;ramp.userData.garageRamp=f;
  const strip=(left:number,right:number,lift:number,color:string)=>{
   const p:number[]=[],idx:number[]=[];
   for(let i=0;i<=112;i++){const y=220+i*5,e=garageRampHeight(f,y).height+lift;p.push(left,e,y,right,e,y);if(i<112){const n=i*2;idx.push(n,n+2,n+1,n+1,n+2,n+3);}}
   const g=track(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();
   const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,roughness:1,side:THREE.DoubleSide}));mesh.receiveShadow=true;ramp.add(mesh);
  };
  // Continuous sloping walls: no stair-step seams or sky visible underground.
  for(const x of [1548,1652]){
   const p:number[]=[],ids:number[]=[];
   for(let i=0;i<=112;i++){const z=220+i*5,e=garageRampHeight(f,z).height;p.push(x,e,z,x,e+42,z);if(i<112){const n=i*2;ids.push(n,n+1,n+2,n+1,n+3,n+2);}}
   const g=track(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ids);g.computeVertexNormals();
   const wall=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:'#71818b',roughness:1,side:THREE.DoubleSide}));
   // Leave a full-width turning opening at both ends.
   const a=g.getAttribute('position');for(let i=0;i<a.count;i++)a.setZ(i,Math.max(280,Math.min(720,a.getZ(i))));
   ramp.add(wall);
  }
  strip(1550,1650,.12,'#394249');strip(1554,1555,.22,'#ece9df');strip(1645,1646,.22,'#ece9df');strip(1599.3,1600.7,.23,'#edc458');
  for(const x of [1575,1625])for(const z of [330,500,670]){
   const dir=x<1600?1:-1,p=[x-5,z-dir*7,x+5,z-dir*7,x+5,z,x+10,z,x,z+dir*11,x-10,z,x-5,z];
   const shape=new THREE.Shape();shape.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)shape.lineTo(p[i],p[i+1]);shape.closePath();
   const g=track(new THREE.ShapeGeometry(shape));const a=g.getAttribute('position');for(let i=0;i<a.count;i++){const y=a.getY(i);a.setXYZ(i,a.getX(i),garageRampHeight(f,y).height+.25,y);}g.computeVertexNormals();
   ramp.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:'#e8e7d9',side:THREE.DoubleSide})));
  }
  const before=ramp.children.length;strip(1550,1650,42,'#46525a');
  ramp.children[before].userData.garageCeiling=true;
  scene.add(ramp);
 }
 // One continuous mesh remains loaded across floor transitions; tyre support
 // uses the same helix and prior height to distinguish its two turns.
 const helix=new THREE.Group();helix.name='garage-spiral';helix.userData.garageRamp=0;
 for(const [left,right,lift,color] of [[-55,55,.12,'#394249'],[-.7,.7,.23,'#edc458'],[-52,-50.8,.23,'#ece9df'],[50.8,52,.23,'#ece9df']] as const){
  const positions:number[]=[],ids:number[]=[];
  for(let i=0;i<=360;i++){for(const off of [left,right]){const p=garageSpiralPoint(i/360,off);positions.push(p.x,p.height+lift,p.y);}if(i<360){const n=i*2;ids.push(n,n+2,n+1,n+1,n+2,n+3);}}
  const geometry=track(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(ids);geometry.computeVertexNormals();
  const m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:1,side:THREE.DoubleSide}));m.receiveShadow=true;helix.add(m);
 }
 for(const f of [0,2]){
  const sign=makeLabel(f===0?'B3 ↓  螺旋直达  10 km/h':'B1 ↑  螺旋直达  10 km/h','#276977',125,17);
  sign.position.set(800,GARAGE_LEVELS[f]+31,910);helix.add(sign);
 }
 // Ring light strips provide depth without additional dynamic lights.
 const lights=new THREE.InstancedMesh(track(new THREE.BoxGeometry(10,1,2)),new THREE.MeshBasicMaterial({color:'#cce4d6'}),40);
 for(let i=0;i<40;i++){const p=garageSpiralPoint((i+.5)/40,54),m=new THREE.Matrix4().makeRotationY(-p.angle-Math.PI/2);m.setPosition(p.x,p.height+17,p.y);lights.setMatrixAt(i,m);}helix.add(lights);
 scene.add(helix);scene.add(ceilingGroup);return ceilingGroup;
}
