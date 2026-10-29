import {worldHeight} from '../utils/openWorld';
import * as THREE from 'three';
import {cutLiftOpening,MOUNTAIN_LIFT,MOUNTAIN_TUNNEL,MOUNTAIN_TUNNEL_WIDTH,inMountainLift} from '../utils/mountainAdventure';
export function addMountainAdventure(scene:THREE.Scene,track:(g:THREE.BufferGeometry)=>THREE.BufferGeometry){
 const addStrip=(kind:'floor'|'roof'|'left'|'right')=>{
  const positions:number[]=[],ids:number[]=[];
  const vertical=kind==='left'||kind==='right',side=kind==='left'?-1:1;
  for(let i=0;i<MOUNTAIN_TUNNEL.length;i++){
   const p=MOUNTAIN_TUNNEL[i],surface=p.x<24500&&p.y>18800?worldHeight(p.x,p.y):0,floor=surface<25?surface:0;
   for(const k of [0,1]){const off=vertical?side*MOUNTAIN_TUNNEL_WIDTH/2:(k-.5)*MOUNTAIN_TUNNEL_WIDTH;positions.push(p.x+p.nx*off,floor+(vertical?k*90:kind==='roof'?90:.12),p.y+p.ny*off);}
   if(i<MOUNTAIN_TUNNEL.length-1){const n=i*2;ids.push(n,n+2,n+1,n+1,n+2,n+3);}
  }
  const clipped=kind!=='floor'?cutLiftOpening(positions,ids):ids;
  const g=track(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(clipped);g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:kind==='floor'?'#39434a':kind==='roof'?'#26343b':'#51636c',side:THREE.DoubleSide}));mesh.name='mountain-tunnel-'+kind;scene.add(mesh);
 };
 for(const kind of ['floor','roof','left','right'] as const)addStrip(kind);
 const samples=MOUNTAIN_TUNNEL.filter((_,i)=>i%5===0),matrix=new THREE.Matrix4();
 for(const off of [-69,69,0]){
  const lights=new THREE.InstancedMesh(track(new THREE.BoxGeometry(off===0?14:28,.5,off===0?1.4:2)),new THREE.MeshBasicMaterial({color:off===0?'#e8c16b':'#c5eee5'}),samples.length);
  samples.forEach((p,i)=>{matrix.makeRotationY(-Math.atan2(-p.nx,p.ny));matrix.setPosition(p.x+p.nx*off,off===0?.24:30,p.y+p.ny*off);lights.setMatrixAt(i,matrix);});scene.add(lights);
 }
 const lift=new THREE.Group();lift.name='mountain-vehicle-lift';lift.position.set(MOUNTAIN_LIFT.x,MOUNTAIN_LIFT.top,MOUNTAIN_LIFT.y);
 const platform=new THREE.Mesh(track(new THREE.BoxGeometry(260,3,180)),new THREE.MeshStandardMaterial({color:'#6b8888',roughness:.8}));platform.name='mountain-lift-deck';platform.position.y=-1.5;lift.add(platform);
 for(const side of [-1,1]){const rail=new THREE.Mesh(track(new THREE.BoxGeometry(260,2,3)),new THREE.MeshBasicMaterial({color:'#edc46e'}));rail.position.set(0,10,side*87);lift.add(rail);}
 scene.add(lift);
 for(const side of [-1,1]){
  const wall=new THREE.Mesh(track(new THREE.BoxGeometry(280,10050,8)),new THREE.MeshStandardMaterial({color:'#4e6067',roughness:1}));wall.position.set(MOUNTAIN_LIFT.x,5025,MOUNTAIN_LIFT.y+side*96);wall.userData.liftShell=true;scene.add(wall);
 }
 for(const [x,y,width,depth,height,elevation] of [[MOUNTAIN_LIFT.x+134,MOUNTAIN_LIFT.y,8,200,9950,90],[MOUNTAIN_LIFT.x-134,MOUNTAIN_LIFT.y,8,200,9960,0],...[-1,1].map(side=>[MOUNTAIN_LIFT.x+132,MOUNTAIN_LIFT.y+side*85.5,5,21,90,0])]){
  const wall=new THREE.Mesh(track(new THREE.BoxGeometry(width,height,depth)),new THREE.MeshStandardMaterial({color:'#4e6067',roughness:1}));wall.position.set(x,elevation+height/2,y);wall.userData.liftShell=true;scene.add(wall);
 }
 const shaftBands=new THREE.InstancedMesh(track(new THREE.BoxGeometry(1,3,150)),new THREE.MeshBasicMaterial({color:'#b6d8cd'}),20);
 for(let i=0;i<20;i++)shaftBands.setMatrixAt(i,new THREE.Matrix4().makeTranslation(MOUNTAIN_LIFT.x+129.5,250+i*500,MOUNTAIN_LIFT.y));scene.add(shaftBands);
 // A small summit discovery: a golden compass, visible only off the driving lane.
 const egg=new THREE.Group();egg.name='summit-secret-compass';egg.position.set(43650,10000,1608);
 const base=new THREE.Mesh(track(new THREE.CylinderGeometry(22,26,4,24)),new THREE.MeshStandardMaterial({color:'#39565c',roughness:.7}));base.position.y=2;egg.add(base);
 const arrow=new THREE.Mesh(track(new THREE.ConeGeometry(8,30,4)),new THREE.MeshStandardMaterial({color:'#e6bc64',metalness:.45,roughness:.35}));arrow.rotation.z=-Math.PI/2;arrow.position.y=13;egg.add(arrow);scene.add(egg);
}
