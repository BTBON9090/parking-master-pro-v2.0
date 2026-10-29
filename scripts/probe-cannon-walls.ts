import {performance} from 'node:perf_hooks';
import {PhysicsWorld} from '../utils/physicsWorld';
import {buildHighway} from '../utils/highway';
const l=buildHighway(),walls=l.obstacles.filter(o=>o.type==='wall'&&o.width<=2000&&o.height<=2000&&!o.collisionOnly&&!(o.elevation&&o.elevation>2));
const summary=(values:number[])=>{const v=[...values].sort((a,b)=>a-b);return {median:+v[Math.floor((v.length-1)*.5)].toFixed(4),p95:+v[Math.floor((v.length-1)*.95)].toFixed(4),max:+v.at(-1)!.toFixed(4)};};
for(const mode of ['steady','impact']){
 const p=new PhysicsWorld();
 if(process.argv.includes('--compound'))p.addStaticObstacles(walls);else for(const o of walls)p.addStaticObstacle(o.x,o.y,o.width,o.height,30,o.rotation,o.elevation||0);
 p.addBoundary(l.mapWidth,l.mapHeight);p.addPlayerCar(7000,4000,20,45,1800);
 const wall=walls.find(o=>o.id.startsWith('motorway-rail-')&&o.id.endsWith('-1')&&o.x>10000&&o.x<11000)!;
 const nx=-Math.sin(wall.rotation),nz=Math.cos(wall.rotation),extra=wall.height/2+4.1;
 const cone=p.addMovableObstacle({id:'bench',type:'cone',x:wall.x+nx*extra,y:wall.y+nz*extra,width:3,height:3,rotation:0,weight:4,movable:true,color:'#ee8d38'});
 let contacts=0;cone.addEventListener('collide',(e:any)=>{if(e.body!==p.world.bodies[0])contacts++;});
 for(let n=0;n<30;n++)p.step(1/60);
 const samples:number[]=[];
 for(let n=0;n<240;n++){
  if(mode==='impact'&&n%30===0){cone.position.set(wall.x+nx*extra,4,wall.y+nz*extra);cone.velocity.set(-nx*80,0,-nz*80);cone.angularVelocity.setZero();cone.aabbNeedsUpdate=true;cone.wakeUp();}
  const t=performance.now();p.step(1/60);samples.push(performance.now()-t);
 }
 console.log(JSON.stringify({mode,walls:walls.length,bodies:p.world.bodies.length,contacts,ms:summary(samples)}));p.dispose();
}
