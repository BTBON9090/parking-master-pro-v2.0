import * as T from 'three';
import {AccidentFire} from '../three/accidentFire';
import {loadModel,CAR_TYPE_TO_MODEL} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
import {CAR_MODELS} from '../constants';
import {CarType} from '../types';
import {createSkidRibbon} from '../three/skidRibbon';
const scene=new T.Scene();scene.background=new T.Color('#91bdce');
const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;document.body.append(renderer.domElement);
const camera=new T.PerspectiveCamera(48,innerWidth/innerHeight,.1,800);camera.position.set(88,55,100);camera.lookAt(0,12,0);
scene.add(new T.HemisphereLight('#d6e8f4','#434535',1.7));const sun=new T.DirectionalLight('#fff0cf',3);sun.position.set(50,100,40);sun.castShadow=true;sun.shadow.bias=-.0002;sun.shadow.normalBias=.35;sun.shadow.camera.left=-100;sun.shadow.camera.right=100;sun.shadow.camera.top=100;sun.shadow.camera.bottom=-100;sun.shadow.mapSize.set(1024,1024);scene.add(sun);
const floor=new T.Mesh(new T.PlaneGeometry(600,600),new T.MeshStandardMaterial({color:'#69756d'}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
const cfg=CAR_MODELS[CarType.TAI7],car=buildNativeAuthoredVehicle(await loadModel(CAR_TYPE_TO_MODEL[CarType.TAI7]),cfg).group;scene.add(car);
for(const x of [-7,7]){const mark=new T.Mesh(createSkidRibbon({x,z:-20},{x,z:-70},1.8,()=>0),new T.MeshBasicMaterial({color:'#303436',transparent:true,opacity:.3}));scene.add(mark);}
let effect:AccidentFire|null=null,t=0;
const status=document.querySelector('output')!;
function start(explode:boolean){effect?.dispose();effect=new AccidentFire(new T.Vector3(),Math.PI/2,explode,{vehicle:car,width:cfg.width,length:cfg.length,height:cfg.height});scene.add(effect.group);t=0;}
document.querySelector('#fire')!.addEventListener('click',()=>start(false));document.querySelector('#explosion')!.addEventListener('click',()=>start(true));document.querySelector('#reset')!.addEventListener('click',()=>{effect?.dispose();effect=null;});
const clock=new T.Clock();renderer.setAnimationLoop(()=>{const dt=Math.min(.05,clock.getDelta());t+=dt;effect?.step(dt);status.value=effect?`时间 ${t.toFixed(1)}s · 火势 ${Math.round(effect.group.userData.fireGrowth*100)}% · 车体完整保留`:'准备就绪 · 两条刹车印贴地';renderer.render(scene,camera);});
