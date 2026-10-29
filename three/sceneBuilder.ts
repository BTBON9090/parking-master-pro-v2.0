import {isHighwayStructure} from '../utils/highway';
import {clearRoadBuildings} from '../utils/roadClearance';
import {fitBuildingToObstacle} from './obstacleVisuals';
import {assignParkedFleet} from '../utils/fleetParking';
import {addExamSignals} from './examSignals';
import {CITY_OFFSET} from '../utils/openWorld';
import { garageFloorAt } from '../utils/garage';
import { addGarageArchitecture } from './garageScene';
import { addOpenWorldScene } from './openWorldScene';
import { addBeijingScenery } from './beijingScenery';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LevelData, Obstacle, Marking, ParkingSpot, RoadSurface, SlopeZone, Intersection, CarConfig, CarType, Vector2 } from '../types';
import { Mats, flatMat, beijingGroundMaterial, contactShadowTexture, markingMaterial, markingMaterialKey } from './materials';
import {
  buildCarMesh, buildCarMeshFromGLB, buildBuildingMesh, buildTreeMesh, buildBushMesh,
  buildStreetLightMesh, buildPowerPoleMesh, buildConeMesh, buildBoxMesh,
  buildWheelAssembly, CarMeshParts
} from './geometries';
import { loadModel, TRAFFIC_CAR_MODELS, BUILDING_MODELS, CAR_TYPE_TO_MODEL, extractWheels } from './modelLoader';
import { buildVehicleParts, hasProceduralCarModel, validateVehicleBindings } from './vehicleModels';
import { sampleSlopeProfile } from '../utils/slopeProfile';
import { buildJunctionPolygon, roundedPolygonPoints } from '../utils/polyline';
import { TRAINING_TERRAIN, trainingTerrainHeight, isTrainingTerrain } from '../utils/trainingTerrain';
import { elevatedRoadProfile } from '../utils/elevatedRoad';
import {CHALLENGE_COLUMNS,CHALLENGE_ROWS,challengeHeight,challengeMeshHeight} from '../utils/challengeMaps';

/** Enable crisp sun shadows on solid car meshes; skip transparent shadow decals. */
function enableCarShadowCasting(parts: CarMeshParts) {
  parts.group.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    if (materials.some(material => material.transparent)) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
}

/**
 * 从 LevelData 构建 Three.js 场景
 * 坐标映射: 2D (x, y) → 3D (x, 0, z=y)
 * 旋转映射: 2D rotation (弧度) → 3D rotation.y = -rotation
 * 方向: 2D 车头朝 +x → 3D 车头朝 +z
 */

export interface BuiltScene {
  scene: THREE.Scene;
  updateExamSignals?: (timeMs:number)=>void;
  playerCarParts: CarMeshParts;
  trafficCarParts: Map<string, CarMeshParts>;  // key = obstacle.id
  trafficObstacles: Map<string, Obstacle>;     // 原始 obstacle 数据引用
  spotMeshes: Map<string, THREE.Group>;        // 车位 mesh 引用（用于更新颜色）
  /** 可移动物体 mesh 引用（锥桶/箱子，供物理同步） */
  movableMeshes: Map<string, THREE.Group>;
  parkedVisuals: Map<string, (pose: {x:number;y:number;rotation:number;elevation?:number})=>void>;
  /** 可释放的几何体列表（清理用） */
  geometries: THREE.BufferGeometry[];
  /** Level 6 render chunks; detached chunks do not upload GPU resources. */
  streamingChunks?: Map<string, THREE.Group>;
  /** Level 6 地库楼顶组（俯瞰时隐藏） */
  ceilingGroup?: THREE.Group;
  /** Fixed cars authored as parking/roadside obstacles. */
  staticCarCount?: number;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** Keep a plane on the ground, then yaw it around world-up. */
function orientGroundPlane(object: THREE.Object3D, yaw = 0) {
  object.rotation.set(-Math.PI / 2, 0, 0);
  if (yaw) object.rotateOnWorldAxis(WORLD_UP, -yaw);
}

// 沿 XZ 平面上一串点铺一条「平铺在地面」的线带（左右各偏移 halfW），
// 法线朝上、逆时针绕序（自上方俯视）。用于替换车道线/边缘线的 TubeGeometry，
// 避免标线渲染成一根根立体的 3D 圆管。
function flatLineRibbon(points: THREE.Vector3[], halfW: number, y: number, closed: boolean): THREE.BufferGeometry {
  const n = points.length;
  const count = closed ? n : n - 1; // 需要成段的数量
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = points[closed ? (i - 1 + n) % n : Math.max(0,i-1)];
    const b = points[i];
    const c = points[closed ? (i + 1) % n : Math.min(n-1,i+1)];
    const prev = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
    const next = new THREE.Vector3(c.x - b.x, 0, c.z - b.z);
    if (prev.lengthSq() < 1e-8) prev.copy(next);
    if (next.lengthSq() < 1e-8) next.copy(prev);
    prev.normalize(); next.normalize();
    const tangent = prev.clone().add(next);
    if (tangent.lengthSq() < 1e-8) tangent.copy(prev);
    tangent.normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const p = points[i];
    positions.push(p.x + normal.x * halfW, y, p.z + normal.z * halfW); // left
    positions.push(p.x - normal.x * halfW, y, p.z - normal.z * halfW); // right
  }
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % n;
    const base = i * 2;
    const nj = j * 2;
    // 逆时针绕序（自上方俯视），与沥青带一致
    indices.push(base, nj, base + 1, base + 1, nj, nj + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function terrainHeightAt(level: LevelData, x: number, y: number) {
  if (level.levelId === 1 && isTrainingTerrain(x, y)) return trainingTerrainHeight(x, y);
  for (const zone of level.slopeZones || []) {
    const dx = x - zone.x;
    const dy = y - zone.y;
    const cos = Math.cos(zone.rotation);
    const sin = Math.sin(zone.rotation);
    const localX = dx * cos + dy * sin;
    const localY = -dx * sin + dy * cos;
    if (Math.abs(localX) <= zone.length / 2 && Math.abs(localY) <= zone.width / 2) {
      return sampleSlopeProfile(localX, zone.length, zone.peakHeight).height;
    }
  }
  return 0;
}

/** Draw the route into the ground texture itself. A separate draped ribbon
 * intersects a triangulated height field at different sample points and
 * visibly flickers; this also keeps road paint and tyre support coincident. */
function challengeGroundMaterial(level:LevelData):THREE.MeshLambertMaterial {
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1536;
  const ctx=canvas.getContext('2d')!,kind=level.challengeTerrain!.kind;
  ctx.fillStyle=kind==='snow'?'#cbd9dc':kind==='mud'?'#706a57':kind==='quarry'?'#827a6a':kind==='coast'?'#8a9a81':'#66745b';
  ctx.fillRect(0,0,canvas.width,canvas.height);ctx.scale(canvas.width/level.mapWidth,canvas.height/level.mapHeight);
  for(const road of level.curvedRoads??[]){
    const curve=new THREE.CatmullRomCurve3(road.points.map(p=>new THREE.Vector3(p.x,0,p.y)),!!road.closed,'centripetal',.45);
    const points=curve.getSpacedPoints(600);
    const draw=(color:string,width:number,dash:number[]=[])=>{
      ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';ctx.setLineDash(dash);ctx.beginPath();
      points.forEach((p,i)=>i?ctx.lineTo(p.x,p.z):ctx.moveTo(p.x,p.z));ctx.stroke();
    };
    draw(road.color,road.width);
    if(kind==='coast')draw('#e9dfbd',1.3,[20,18]);
    if(kind==='mud'||kind==='quarry')draw('#554d40',2,[10,17,4,11]);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=4;
  return new THREE.MeshLambertMaterial({map:texture,color:'#ffffff'});
}

// 路面颜色 → 材质选择
function roadMat(color: string): THREE.Material {
  const c = color.toLowerCase();
  if (c === '#3a3a3e') return Mats.roadMain();
  if (c === '#353539') return Mats.roadSec();
  if (c === '#303034') return Mats.roadMinor();
  if (c === '#2e2e32') return Mats.roadSingle();
  if (c === '#2a2a2e') return Mats.roadBridge();
  // Custom garage/lesson floor colours are still road-facing surfaces. Make
  // them mirror-safe just like the textured asphalt presets above.
  return flatMat(color, { side: THREE.DoubleSide });
}

/**
 * 构建完整 3D 场景（异步，需等待 GLB 模型加载）
 */
export async function buildScene(
  levelData: LevelData,
  carConfig: CarConfig,
  carType: CarType,
): Promise<BuiltScene> {
  clearRoadBuildings(levelData);
  assignParkedFleet(levelData);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(levelData.garage ? '#2c343c' : 0x87ceeb);

  const geometries: THREE.BufferGeometry[] = [];
  const trackGeo = (g: THREE.BufferGeometry) => { geometries.push(g); return g; };

  // ===== 地面 — 草地色 =====
  const groundWidth=levelData.openWorld?8500:levelData.mapWidth,groundHeight=levelData.openWorld?11600:levelData.mapHeight;
  const groundGeo = trackGeo(new THREE.PlaneGeometry(groundWidth,groundHeight,levelData.challengeTerrain?CHALLENGE_COLUMNS:levelData.exam||levelData.highway?200:1,levelData.challengeTerrain?CHALLENGE_ROWS:levelData.exam||levelData.highway?136:1));
  if(levelData.challengeTerrain){
    const pos=groundGeo.getAttribute('position');
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i)+levelData.mapWidth/2,y=levelData.mapHeight/2-pos.getY(i);
      pos.setZ(i,challengeHeight(levelData,x,y));
    }
    pos.needsUpdate=true;groundGeo.computeVertexNormals();
  }
  const groundMaterial=levelData.challengeTerrain?challengeGroundMaterial(levelData):levelData.levelId === 1 ? beijingGroundMaterial() : Mats.ground();
  const ground = new THREE.Mesh(groundGeo,groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(groundWidth/2+(levelData.openWorld?CITY_OFFSET:0),0,groundHeight/2+(levelData.openWorld?CITY_OFFSET:0));
  ground.receiveShadow = true;
  ground.visible = !levelData.garage;
  scene.add(ground);
  if(levelData.highway){
    // Distant, non-interactive mountain backdrop is entirely outside the
    // collision boundary: no driveable road is hidden behind fake hills.
    const geo=trackGeo(new THREE.ConeGeometry(1,1,7));
    const material=new THREE.MeshLambertMaterial({color:'#788979',flatShading:true});
    const hills=new THREE.InstancedMesh(geo,material,12),m=new THREE.Matrix4();
    for(let i=0;i<12;i++){
      const radius=420+(i*73)%200,height=620+(i*113)%500;
      m.compose(new THREE.Vector3(30700+(i%2)*280,height/2,1100+i*1150),new THREE.Quaternion(),new THREE.Vector3(radius,height,radius));
      hills.setMatrixAt(i,m);hills.setColorAt(i,new THREE.Color(i%3===0?'#849486':i%3===1?'#718376':'#96a395'));
    }
    hills.instanceMatrix.needsUpdate=true;if(hills.instanceColor)hills.instanceColor.needsUpdate=true;scene.add(hills);
  }
  if(levelData.challengeTerrain){
    const trees=levelData.obstacles.filter(o=>o.id.startsWith('challenge-tree-'));
    const trunks=new THREE.InstancedMesh(trackGeo(new THREE.CylinderGeometry(1.4,1.8,17,6)),flatMat('#655945'),trees.length);
    const foliage=new THREE.InstancedMesh(trackGeo(new THREE.ConeGeometry(10,29,7)),flatMat(levelData.challengeTerrain.kind==='snow'?'#889e91':'#4c694f'),trees.length);
    const matrix=new THREE.Matrix4();
    trees.forEach((tree,i)=>{const h=tree.elevation??0;trunks.setMatrixAt(i,matrix.makeTranslation(tree.x,h+8.5,tree.y));foliage.setMatrixAt(i,matrix.makeTranslation(tree.x,h+23,tree.y));});
    trunks.instanceMatrix.needsUpdate=true;foliage.instanceMatrix.needsUpdate=true;trunks.castShadow=true;foliage.castShadow=true;
    trunks.computeBoundingSphere();foliage.computeBoundingSphere();scene.add(trunks,foliage);
  }

  // ===== 道路路面 =====
  if (levelData.roadSurfaces) {
    levelData.roadSurfaces.forEach((rs: RoadSurface, index) => {
      // Roads are flat layered surfaces instead of intersecting boxes. A tiny,
      // deterministic height offset keeps overlapping junction pieces stable.
      const geo = trackGeo(new THREE.PlaneGeometry(rs.width, rs.height,levelData.exam||levelData.highway?Math.max(1,Math.ceil(rs.width/20)):1,levelData.exam||levelData.highway?Math.max(1,Math.ceil(rs.height/20)):1));
      const mesh = new THREE.Mesh(geo, roadMat(rs.color));
      orientGroundPlane(mesh, rs.rotation);
      mesh.position.set(rs.x, (rs.elevation || 0) + 0.12 + (index % 5) * 0.006, rs.y);
      mesh.renderOrder = 1;
      mesh.receiveShadow = true;
      scene.add(mesh);

    });
  }

  const curveStudMatrices:THREE.Matrix4[]=[];
  // High-resolution Catmull-Rom ribbons replace rectangular curve chains.
  levelData.curvedRoads?.forEach(curved => {
    try {
    if(levelData.challengeTerrain)return; // route already painted onto the height field
    if (curved.points.length < 2) return;
    const elevation = (curved.elevation || 0) + 0.15;
    const closed = curved.closed || false;
    if (curved.kind === 'roundabout' && curved.center && curved.radius) {
      const outerRadius = curved.radius + curved.width / 2;
      const innerRadius = Math.max(2, curved.radius - curved.width / 2);
      const ringGeo = trackGeo(new THREE.RingGeometry(innerRadius, outerRadius, 128));
      const ring = new THREE.Mesh(ringGeo, roadMat(curved.color));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(curved.center.x, elevation, curved.center.y);
      ring.renderOrder = 2;
      ring.receiveShadow = true;
      scene.add(ring);
      const islandRadius = Math.max(1, innerRadius - 1.2);
      // Low raised island/curb: the collision polygon uses this same radius.
      const islandGeo = trackGeo(new THREE.CylinderGeometry(islandRadius, islandRadius, 1.6, 64));
      const island = new THREE.Mesh(islandGeo, flatMat('#2f5b35'));
      island.position.set(curved.center.x, elevation + 0.8, curved.center.y);
      island.castShadow = true;
      island.receiveShadow = true;
      island.renderOrder = 3;
      scene.add(island);
      const islandTopGeo = trackGeo(new THREE.CircleGeometry(islandRadius - 0.15, 64));
      const islandTop = new THREE.Mesh(islandTopGeo, flatMat('#476b3f', { side: THREE.DoubleSide }));
      islandTop.rotation.x = -Math.PI / 2;
      islandTop.position.set(curved.center.x, elevation + 1.62, curved.center.y);
      islandTop.renderOrder = 4;
      scene.add(islandTop);
      for(const start of [.20,Math.PI+.20]) {
      const edgeGeo = trackGeo(new THREE.RingGeometry(outerRadius - 0.75, outerRadius, 64,1,start,Math.PI-.40));
      const edge = new THREE.Mesh(edgeGeo, Mats.lineWhite());
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(curved.center.x, elevation + 0.018, curved.center.y);
      edge.renderOrder = 4;
      scene.add(edge);
      }
      // White dashed lane separator: both lanes circulate in the SAME direction.
      const laneMat = Mats.lineWhite();
      for (let i=0;i<60;i++) {
        const a=i/60*Math.PI*2;
        const dash=new THREE.Mesh(trackGeo(new THREE.RingGeometry(curved.radius-.6,curved.radius+.6,6,1,a,.055)),laneMat);
        dash.renderOrder=5;dash.name='roundabout-lane-dash'; dash.rotation.x=-Math.PI/2; dash.position.set(curved.center.x,elevation+.025,curved.center.y);scene.add(dash);
      }
      for (let i=0;i<12;i++) for(const offset of [-curved.width*.24,curved.width*.24]) {
        const a=(i+.5)/12*Math.PI*2, r=curved.radius+offset;
        const shape=new THREE.Shape();
        shape.moveTo(-2,-10);shape.lineTo(2,-10);shape.lineTo(2,3);shape.lineTo(6,3);shape.lineTo(0,11);shape.lineTo(-6,3);shape.lineTo(-2,3);shape.closePath();
        const arrow=new THREE.Mesh(trackGeo(new THREE.ShapeGeometry(shape)),laneMat);
        // Plane's +Y becomes world -Z; rotate it to the CCW map tangent.
        arrow.rotation.set(-Math.PI/2,0,-a);
        arrow.position.set(curved.center.x+Math.cos(a)*r,elevation+.03,curved.center.y+Math.sin(a)*r);
        arrow.renderOrder=5;arrow.name='roundabout-one-way-arrow';scene.add(arrow);
      }
      return;
    }
    const centreCurve = new THREE.CatmullRomCurve3(
      curved.points.map(point => new THREE.Vector3(point.x, elevation, point.y)),
      curved.closed || false,
      'centripetal',
      0.45,
    );
    const segments = Math.max(levelData.challengeTerrain?480:160, curved.points.length * 28);
    const samples = centreCurve.getSpacedPoints(segments);
    const tangents = samples.map((point, index) => {
      const previous = samples[Math.max(0, index - 1)];
      const next = samples[Math.min(samples.length - 1, index + 1)];
      return next.clone().sub(previous).setY(0).normalize();
    });
    // 逐采样点路宽：若有逐点 widths(与控制点对齐)，按控制多边形弦长→均匀采样参数 线性插值(渐变)
    const wArr = curved.widths && curved.widths.length === curved.points.length ? curved.widths : null;
    const widthAt = (i: number): number => {
      if (!wArr) return curved.width;
      const pn = curved.points.length;
      const s = closed ? i / samples.length : (samples.length > 1 ? i / (samples.length - 1) : 0);
      const cum: number[] = [0];
      const segs2 = closed ? pn : pn - 1;
      for (let k = 0; k < segs2; k++) {
        const a = curved.points[k], b = curved.points[(k + 1) % pn];
        cum.push(cum[k] + Math.hypot(b.x - a.x, b.y - a.y));
      }
      const total = cum[cum.length - 1] || 1;
      const target = Math.max(0, Math.min(1, s)) * total;
      let k = 0;
      while (k < segs2 - 1 && cum[k + 1] < target) k++;
      const segL = cum[k + 1] - cum[k] || 1;
      const t = (target - cum[k]) / segL;
      const w0 = wArr[k], w1 = wArr[(k + 1) % pn];
      return w0 + (w1 - w0) * t;
    };
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const leftEdge: THREE.Vector3[] = [];
    const rightEdge: THREE.Vector3[] = [];
    let previousNormal: THREE.Vector3 | null = null;
    samples.forEach((point, index) => {
      const tangent = tangents[index];
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      if (previousNormal && previousNormal.dot(normal) < 0) normal.negate();
      previousNormal = normal.clone();

      // A constant-width offset develops a cusp when the inside bend radius
      // becomes smaller than half the road width. That cusp was triangulated
      // as the long bow-tie spikes visible on the driving-school S bends.
      // Limit only the inside offset; the outside edge and the centre path stay
      // unchanged, so the road remains smooth and driveable.
      const halfWidth = widthAt(index) / 2;
      let leftOffset = halfWidth;
      let rightOffset = halfWidth;
      if (index > 0 && index < samples.length - 1) {
        const previousTangent = tangents[index - 1];
        const nextTangent = tangents[index + 1];
        const turnAngle = previousTangent.angleTo(nextTangent);
        if (turnAngle > 0.0001) {
          const chord = samples[index - 1].distanceTo(samples[index + 1]);
          const radius = chord / Math.max(0.001, 2 * Math.sin(turnAngle / 2));
          const safeInsideOffset = Math.min(halfWidth, Math.max(1.25, radius * 0.62));
          const bendDirection = nextTangent.clone().sub(previousTangent).dot(normal);
          if (bendDirection > 0) leftOffset = safeInsideOffset;
          else rightOffset = safeInsideOffset;
        }
      }
      const left = point.clone().addScaledVector(normal, leftOffset);
      const right = point.clone().addScaledVector(normal, -rightOffset);
      leftEdge.push(left.clone().setY(elevation + 0.1));
      rightEdge.push(right.clone().setY(elevation + 0.1));
      const terrain=levelData.challengeTerrain;
      positions.push(left.x, terrain?challengeMeshHeight(levelData,left.x,left.z)+.16:elevation, left.z,
        right.x, terrain?challengeMeshHeight(levelData,right.x,right.z)+.16:elevation, right.z);
      uvs.push(index / 12, 0, index / 12, 1);
      if (index < samples.length - 1) {
        const base = index * 2;
        // Counter-clockwise winding when viewed from above. The previous
        // order faced downward, so half of a bending ribbon vanished through
        // front-face culling and appeared to have no asphalt material.
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    });
    const geometry = trackGeo(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const road = new THREE.Mesh(geometry, roadMat(curved.color));
    road.receiveShadow = true;
    road.renderOrder = 2;
    scene.add(road);

    const markingGaps = curved.markingGaps ?? [];
    if (curved.warningEdges) {
      for (const edgePoints of [leftEdge, rightEdge]) {
        // Leave a short unpainted throat at an open endpoint. The adjoining
        // lane can then merge without two boundary lines crossing the junction.
        const trim = curved.closed ? 0 : Math.min(5, Math.floor(edgePoints.length * 0.025));
        const visibleEdge = trim ? edgePoints.slice(trim, -trim) : edgePoints;
        if (visibleEdge.length < 2) continue;
        for (const run of splitPointsByMarkingGaps(visibleEdge, markingGaps)) {
          const lineGeometry = trackGeo(flatLineRibbon(run, 0.75, elevation + 0.12, false));
          const edgeLine = new THREE.Mesh(lineGeometry, Mats.lineWhite());
          edgeLine.renderOrder = 6;
          scene.add(edgeLine);
        }
      }
    }

    for (let i = 0; !levelData.challengeTerrain && i < samples.length; i += 14) {
      if (pointInMarkingGap(samples[i], markingGaps)) continue;
      const tangent = tangents[i];
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      const studLat = Math.max(2, widthAt(i) / 2 - 3.2);
      for (const side of [-1, 1]) {
        const stud = new THREE.Object3D();
        stud.position.copy(samples[i]).addScaledVector(normal, side * studLat);
        stud.position.y = elevation + 0.2;
        stud.rotation.y = Math.atan2(tangent.x, tangent.z);
        stud.updateMatrix();curveStudMatrices.push(stud.matrix.clone());
      }
    }

    // 车道线 / 中心线 / 方向箭头
    if(!levelData.challengeTerrain) addRoadLaneMarkings(
      scene, samples, tangents, i => widthAt(i) / 2,
      curved.lanes ?? Math.max(1, Math.min(6, Math.round(curved.width / 35))),
      curved.direction || (curved.width < 60 ? 'one-way' : 'two-way'),
      elevation, closed, trackGeo, markingGaps,
    );
    } catch (err) {
      console.warn('[buildScene] 跳过异常道路:', err);
    }
  });

  if(curveStudMatrices.length){
    const studs=new THREE.InstancedMesh(trackGeo(new THREE.BoxGeometry(1.4,.28,.75)),Mats.roadStud(),curveStudMatrices.length);
    curveStudMatrices.forEach((m,i)=>studs.setMatrixAt(i,m));studs.instanceMatrix.needsUpdate=true;studs.computeBoundingSphere();scene.add(studs);
  }

  // ===== 路口连接件 / 桥面 =====
  // 普通路口：在交叉点铺一块沥青方块，填补两条未相连道路之间的空隙。
  // 桥面：抬升的方块 + 四周下垂侧裙(fascia)，形成上跨观感(纯视觉近似)。
  levelData.intersections?.forEach((it: Intersection) => {
    try {
    // 环岛：环道与中央岛已由 curvedRoads(kind:'roundabout') 渲染，无需再铺方块补丁
    if (it.junctionType === 'roundabout') return;
    const size = Math.max(20, it.size || 120);
    const h = size / 2;
    const rot = it.rotation || 0;
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const local: [number, number][] = [[-h, -h], [h, -h], [h, h], [-h, h]];
    const cornerXZ = local.map(([lx, lz]) => ({ x: it.x + lx * cosR - lz * sinR, z: it.y + lx * sinR + lz * cosR }));
    // 自适应路口多边形（与 2D 共用同一序列）：≥3 臂且几何有效时启用，否则回退旋转方块
    const _poly = (it.arms && it.arms.length >= 2) ? buildJunctionPolygon(it.arms) : null;
    const _minW = (it.arms && it.arms.length) ? Math.min(...it.arms.map(a => a.width)) : 0;
    const rpoly = _poly;
    const worldXZ = rpoly ? rpoly.map(p => ({ x: it.x + p.x, z: it.y + p.y })) : null;
    if (worldXZ && worldXZ.length >= 3) {
      const n = worldXZ.length;
      let cx = 0, cz = 0; worldXZ.forEach(p => { cx += p.x; cz += p.z; }); cx /= n; cz /= n;
      const topY = it.bridge ? (it.elevation || 60) + 0.15 : 0.16;
      const pos: number[] = [cx, topY, cz];
      worldXZ.forEach(p => pos.push(p.x, topY, p.z));
      const idx: number[] = [];
      for (let k = 0; k < n; k++) idx.push(0, 1 + k, 1 + (k + 1) % n);
      const topGeo = trackGeo(new THREE.BufferGeometry());
      topGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      topGeo.setIndex(idx); topGeo.computeVertexNormals();
      const top = new THREE.Mesh(topGeo, roadMat(it.bridge ? '#2a2a2e' : '#303034'));
      top.receiveShadow = true; top.renderOrder = 2;
      scene.add(top);
      if (it.bridge) {
        // 桥面边缘白线（沿多边形轮廓）
        const edgePts = worldXZ.map(p => new THREE.Vector3(p.x, topY + 0.1, p.z));
        edgePts.push(edgePts[0].clone());
        const edgeLine = new THREE.Mesh(trackGeo(flatLineRibbon(edgePts, 0.75, topY + 0.12, false)), Mats.lineWhite());
        edgeLine.renderOrder = 6; scene.add(edgeLine);
        // 四周侧裙：沿多边形每条边下垂到地面
        const sidePos: number[] = []; const sideIdx: number[] = [];
        for (let k = 0; k < n; k++) {
          const a = worldXZ[k], b = worldXZ[(k + 1) % n];
          const base = k * 4;
          sidePos.push(a.x, topY, a.z, a.x, 0.12, a.z, b.x, topY, b.z, b.x, 0.12, b.z);
          sideIdx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        }
        const sideGeo = trackGeo(new THREE.BufferGeometry());
        sideGeo.setAttribute('position', new THREE.Float32BufferAttribute(sidePos, 3));
        sideGeo.setIndex(sideIdx); sideGeo.computeVertexNormals();
        const fascia = new THREE.Mesh(sideGeo, flatMat('#343b46', { side: THREE.DoubleSide }));
        fascia.castShadow = true; fascia.receiveShadow = true;
        scene.add(fascia);
      }
    } else if (it.bridge) {
      const deckY = (it.elevation || 60) + 0.15;
      // 抬升桥面顶板
      const deckPos: number[] = [];
      cornerXZ.forEach(c => deckPos.push(c.x, deckY, c.z));
      const deckGeo = trackGeo(new THREE.BufferGeometry());
      deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(deckPos, 3));
      deckGeo.setIndex([0, 2, 1, 0, 3, 2]);
      deckGeo.computeVertexNormals();
      const deck = new THREE.Mesh(deckGeo, roadMat('#2a2a2e'));
      deck.receiveShadow = true; deck.renderOrder = 2;
      scene.add(deck);
      // 桥面边缘白线
      const edgePts = cornerXZ.map(c => new THREE.Vector3(c.x, deckY + 0.1, c.z));
      edgePts.push(edgePts[0].clone());
      const edgeLine = new THREE.Mesh(trackGeo(flatLineRibbon(edgePts, 0.75, deckY + 0.12, false)), Mats.lineWhite());
      edgeLine.renderOrder = 6; scene.add(edgeLine);
      // 四周侧裙：从桥面边下垂到地面
      const sidePos: number[] = []; const sideIdx: number[] = [];
      for (let k = 0; k < 4; k++) {
        const a = cornerXZ[k], b = cornerXZ[(k + 1) % 4];
        const base = k * 4;
        sidePos.push(a.x, deckY, a.z, a.x, 0.12, a.z, b.x, deckY, b.z, b.x, 0.12, b.z);
        sideIdx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
      const sideGeo = trackGeo(new THREE.BufferGeometry());
      sideGeo.setAttribute('position', new THREE.Float32BufferAttribute(sidePos, 3));
      sideGeo.setIndex(sideIdx); sideGeo.computeVertexNormals();
      const fascia = new THREE.Mesh(sideGeo, flatMat('#343b46', { side: THREE.DoubleSide }));
      fascia.castShadow = true; fascia.receiveShadow = true;
      scene.add(fascia);
    } else {
      // 普通路口沥青块
      const patchPos: number[] = [];
      cornerXZ.forEach(c => patchPos.push(c.x, 0.13, c.z));
      const patchGeo = trackGeo(new THREE.BufferGeometry());
      patchGeo.setAttribute('position', new THREE.Float32BufferAttribute(patchPos, 3));
      patchGeo.setIndex([0, 2, 1, 0, 3, 2]); patchGeo.computeVertexNormals();
      const patch = new THREE.Mesh(patchGeo, roadMat('#303034'));
      patch.receiveShadow = true; patch.renderOrder = 2;
      scene.add(patch);
    }
    } catch (err) {
      console.warn('[buildScene] 跳过异常路口:', err);
    }
  });

  // ===== 驾驶教学坡道 =====
  // A subdivided plane gives the hill a continuous crest. The kinematic
  // model uses the same analytic height curve, so wheels and gravity agree
  // with the surface the learner sees.
  levelData.slopeZones?.forEach((zone: SlopeZone) => {
    const geo = trackGeo(new THREE.PlaneGeometry(zone.length, zone.width, 52, 2));
    const positions = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      const localX = positions.getX(i);
      positions.setZ(i, sampleSlopeProfile(localX, zone.length, zone.peakHeight).height);
    }
    positions.needsUpdate = true;
    geo.computeVertexNormals();
    const hillMaterial = Mats.roadSec().clone();
    hillMaterial.polygonOffset = true;
    hillMaterial.polygonOffsetFactor = -2;
    hillMaterial.polygonOffsetUnits = -2;
    const hill = new THREE.Mesh(geo, hillMaterial);
    orientGroundPlane(hill, zone.rotation);
    hill.position.set(zone.x, 0.20, zone.y);
    hill.renderOrder = 3;
    hill.receiveShadow = true;
    scene.add(hill);

    // A city overpass needs a visible side fascia. Without it a low camera
    // sees the flat road underneath through the paper-thin ramp and reads the
    // two surfaces as intersecting ribbons.
    if (zone.directional) {
      for (const side of [-1, 1]) {
        const sidePositions: number[] = [];
        const sideIndices: number[] = [];
        const sideSegments = 72;
        for (let index = 0; index <= sideSegments; index++) {
          const localX = -zone.length / 2 + index * zone.length / sideSegments;
          const height = sampleSlopeProfile(localX, zone.length, zone.peakHeight).height + 0.14;
          const localZ = side * zone.width / 2;
          sidePositions.push(localX, height, localZ, localX, 0.12, localZ);
          if (index < sideSegments) {
            const base = index * 2;
            sideIndices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
          }
        }
        const sideGeometry = trackGeo(new THREE.BufferGeometry());
        sideGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sidePositions, 3));
        sideGeometry.setIndex(sideIndices);
        sideGeometry.computeVertexNormals();
        const fasciaMaterial = flatMat('#343b46');
        fasciaMaterial.side = THREE.DoubleSide;
        const fascia = new THREE.Mesh(sideGeometry, fasciaMaterial);
        fascia.position.set(zone.x, 0, zone.y);
        fascia.rotation.y = -zone.rotation;
        fascia.castShadow = true;
        fascia.receiveShadow = true;
        scene.add(fascia);
      }
    }
  });

  // ===== 标线 =====
  addMarkingsBatched(scene, levelData.markings, trackGeo);

  // ===== 停车位 =====
  const spotMeshes = new Map<string, THREE.Group>();
  levelData.spots.forEach((spot: ParkingSpot) => {
    const group = new THREE.Group();
    const lineMat = Mats.spotAmber();
    const lineT = 1.5;

    const fbGeo = trackGeo(new THREE.PlaneGeometry(spot.width, lineT));
    const front = new THREE.Mesh(fbGeo, lineMat);
    front.rotation.x = -Math.PI / 2;
    front.position.set(0, 0.19, spot.height / 2);
    front.renderOrder = 4;
    group.add(front);
    const back = new THREE.Mesh(fbGeo, lineMat);
    back.rotation.x = -Math.PI / 2;
    back.position.set(0, 0.19, -spot.height / 2);
    back.renderOrder = 4;
    group.add(back);
    const lrGeo = trackGeo(new THREE.PlaneGeometry(lineT, spot.height));
    const left = new THREE.Mesh(lrGeo, lineMat);
    left.rotation.x = -Math.PI / 2;
    left.position.set(-spot.width / 2, 0.19, 0);
    left.renderOrder = 4;
    group.add(left);
    const right = new THREE.Mesh(lrGeo, lineMat);
    right.rotation.x = -Math.PI / 2;
    right.position.set(spot.width / 2, 0.19, 0);
    right.renderOrder = 4;
    group.add(right);
    group.position.set(spot.x, spot.elevation ?? 0, spot.y);
    group.rotation.y = -spot.rotation;
    scene.add(group);
    spotMeshes.set(spot.id, group);
  });

  // ===== 障碍物 =====
  const trafficCarParts = new Map<string, CarMeshParts>();
  if(levelData.exam||levelData.highway){
    scene.updateMatrixWorld(true);
    scene.traverse(obj=>{
      if(!(obj instanceof THREE.Mesh)||obj instanceof THREE.InstancedMesh)return;
      const g=obj.geometry,p=g.getAttribute('position');if(!p)return;
      const inverse=obj.matrixWorld.clone().invert(),v=new THREE.Vector3();
      // Only ground-facing geometry entirely below the surface-decal threshold.
      let onGround=true;
      for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(obj.matrixWorld);if(Math.abs(v.y)>1.5){onGround=false;break;}}
      if(!onGround)return;
      for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(obj.matrixWorld);v.y+=terrainHeightAt(levelData,v.x,v.z);v.applyMatrix4(inverse);p.setXYZ(i,v.x,v.y,v.z);}
      p.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();
    });
  }
  const trafficObstacles = new Map<string, Obstacle>();
  const movableMeshes = new Map<string, THREE.Group>();
  let trafficModelIndex = 0;
  const wallInstances: Array<{ obstacle: Obstacle; height: number; kind: 'wall' | 'pillar' | 'boundary' }> = [];

  const parkedAssignments = levelData.obstacles
    .filter(obstacle => obstacle.type === 'car' && !obstacle.ai)
    .map(obstacle => ({obstacle,modelName:CAR_TYPE_TO_MODEL[obstacle.carType!]}));
  const parkedVisuals = new Map<string, (pose: {x:number;y:number;rotation:number;elevation?:number})=>void>();
  const instancedParkedCarIds = await addParkedCarInstances(scene, levelData, parkedAssignments, parkedVisuals);

  // 预加载建筑模型
  const buildingGroups: THREE.Group[] = [];
  for (const name of BUILDING_MODELS) {
    try {
      buildingGroups.push(await loadModel(name));
    } catch (e) { /* fallback to code geometry */ }
  }

  for (const obs of levelData.obstacles) {
    // One placement-height source for render, kinematic collision and Cannon.
    // Explicit bridge-layer elevations are preserved; everything else follows
    // the terrain/slope height at the authored XZ.
    if (obs.elevation === undefined) {
      obs.elevation = terrainHeightAt(levelData, obs.x, obs.y) + (obs.layer ?? 0) * 0.5;
    }
    if (obs.verticalHeight === undefined) {
      obs.verticalHeight = obs.type === 'box' ? obs.width
        : obs.type === 'cone' ? 8
          : obs.type === 'car' ? Math.max(8, Math.min(22, obs.width * 0.9))
            : 30;
    }
    if (obs.type === 'car') {
      if (instancedParkedCarIds.has(obs.id)) continue;
      // 交通车：从 GLB 模型池随机选择
      const modelName = TRAFFIC_CAR_MODELS[trafficModelIndex % TRAFFIC_CAR_MODELS.length];
      trafficModelIndex++;
      let parts: CarMeshParts;
      try {
        const glbGroup = await loadModel(modelName);
        // Fit every visible parked/traffic car to its authored obstacle
        // footprint so the model and gameplay collider agree.
        const sourceBox = new THREE.Box3().setFromObject(glbGroup);
        const sourceSize = sourceBox.getSize(new THREE.Vector3());
        glbGroup.scale.multiply(new THREE.Vector3(
          obs.width / Math.max(1, sourceSize.x),
          Math.min(obs.width / Math.max(1, sourceSize.x), obs.height / Math.max(1, sourceSize.z)),
          obs.height / Math.max(1, sourceSize.z),
        ));
        parts = buildCarMeshFromGLB(glbGroup);
      } catch {
        // fallback
        const cfg: CarConfig = {
          id: CarType.SEDAN, name: '', price: 0, color: obs.color,
          width: obs.width, length: obs.height, height: Math.min(18, obs.width * 0.75),
          maxSpeed: 0, acceleration: 0, turnSpeed: 0,
          wheelbase: obs.height * 0.6, weight: obs.weight,
          dynamics: {
            driveLayout: 'FWD', enginePosition: 'FRONT', powerKw: 0, torqueNm: 0,
            zeroTo100Seconds: 0, frontWeightBias: 0.58, cgHeightM: 0.55,
            grip: 0.9, steeringRatio: 16, throttleResponse: 0.03,
            maxSteerAngle: 30 * Math.PI / 180,
            dragAreaM2: 0.72,
            steerSpeedSensitivity: 0.85,
            steerResponse: 1.0,
            understeerGradient: 0.18,
            yawResponse: 0.88,
            transmission: {
              gearRatios: [3.45, 1.94, 1.29, 0.97, 0.78],
              reverseRatio: 3.33, finalDrive: 3.9, wheelRadiusM: 0.31,
              idleRpm: 800, redlineRpm: 6500,
            },
          },
        };
        parts = buildCarMesh(cfg, true);
      }
      enableCarShadowCasting(parts);
      parts.group.position.set(obs.x, (obs.elevation ?? terrainHeightAt(levelData, obs.x, obs.y)) + (obs.layer ?? 0) * 0.5, obs.y);
      parts.group.rotation.y = Math.PI / 2 - obs.rotation;
      scene.add(parts.group);
      if (!obs.ai) parkedVisuals.set(obs.id,pose=>{
        parts.group.position.set(pose.x,pose.elevation??0,pose.y);
        parts.group.rotation.y=Math.PI/2-pose.rotation;
      });
      {
        const shadow = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({
            map: contactShadowTexture(), transparent: true, opacity: 0.28,
            depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
          }),
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.scale.set(Math.max(obs.width, obs.height) * 0.92, Math.max(obs.width, obs.height) * 0.90, 1);
        shadow.position.y = 0.16;
        shadow.renderOrder = 2;
        parts.group.add(shadow);
      }

      if (obs.ai) {
        trafficCarParts.set(obs.id, parts);
        trafficObstacles.set(obs.id, obs);
      }
    } else if (obs.type === 'wall') {
      if (obs.collisionOnly) continue;
      if (obs.id.startsWith('hutong-') || obs.id.startsWith('street-tree-')
        || obs.id.startsWith('bj-building-')) continue;
      if (obs.id.startsWith('slope-rail')) {
        const zone = levelData.slopeZones?.find(candidate =>
          Math.abs(candidate.x - obs.x) < candidate.length / 2
          && Math.abs(candidate.y - obs.y) < candidate.width
        );
        if (zone) {
          const segmentCount = 72;
          const stepLength = zone.length / segmentCount;
          const segmentLength = stepLength + 0.35;
          const railGeo = trackGeo(new THREE.BoxGeometry(segmentLength, 3.2, obs.height));
          const railMat = flatMat(obs.color);
          const rail = new THREE.InstancedMesh(railGeo, railMat, segmentCount);
          const segmentMatrix = new THREE.Matrix4();
          const segmentPosition = new THREE.Vector3();
          const segmentQuaternion = new THREE.Quaternion();
          for (let i = 0; i < segmentCount; i++) {
            const startX = -zone.length / 2 + i * stepLength;
            const endX = startX + stepLength;
            const startHeight = sampleSlopeProfile(startX, zone.length, zone.peakHeight).height;
            const endHeight = sampleSlopeProfile(endX, zone.length, zone.peakHeight).height;
            segmentPosition.set((startX + endX) / 2, (startHeight + endHeight) / 2 + 1.75, 0);
            segmentQuaternion.setFromEuler(new THREE.Euler(0, 0, Math.atan2(endHeight - startHeight, stepLength)));
            segmentMatrix.compose(segmentPosition, segmentQuaternion, new THREE.Vector3(1, 1, 1));
            rail.setMatrixAt(i, segmentMatrix);
          }
          rail.position.set(obs.x, 0, obs.y);
          rail.rotation.y = -zone.rotation;
          rail.instanceMatrix.needsUpdate = true;
          rail.castShadow = true;
          scene.add(rail);
          continue;
        }
      }
      if (levelData.garage && obs.id.startsWith('garage-ramp-')) continue; // continuous ramp walls are drawn by garageScene
      const isBoundary = obs.width > 2000 || obs.height > 2000;
      const minSide = Math.min(obs.width, obs.height);
      const maxSide = Math.max(obs.width, obs.height);
      const isRoadStructure = minSide <= 40 || maxSide / Math.max(1, minSide) > 4
        || isHighwayStructure(obs);
      if (isBoundary || isRoadStructure) {
        // Boundaries, guard rails, garage walls and bridge supports must stay
        // aligned with their collision footprint; treating every wall as a
        // random building caused roads to be blocked by oversized GLB models.
        const isUnderground = levelData.levelId === 6;
        const wallH = isUnderground
          ? (obs.verticalHeight ?? 42)  // 地库墙体直达楼顶，封闭整个空间
          : (obs.verticalHeight ?? (obs.id.includes('pillar') ? 20 : minSide <= 8 ? 4 : 10));
        wallInstances.push({
          obstacle: obs,
          height: wallH,
          kind: isBoundary ? 'boundary' : obs.id.includes('pillar') ? 'pillar' : 'wall',
        });
      } else {
        // 建筑：优先用 GLB 模型
        if (buildingGroups.length > 0) {
          const bld = buildingGroups[Math.floor(Math.random() * buildingGroups.length)].clone(true);
          // Match the visible footprint to the collision footprint. This
          // removes empty-looking areas that used to contain a large collider.
          const targetHeight = obs.verticalHeight ?? (24 + (Math.abs(obs.id.length * 17) % 20));
          fitBuildingToObstacle(bld,obs,targetHeight);
          scene.add(bld);
        } else {
          // fallback 代码几何体
          const bld = buildBuildingMesh(obs.width, obs.height, obs.id);
          const height=obs.verticalHeight??new THREE.Box3().setFromObject(bld).getSize(new THREE.Vector3()).y;
          fitBuildingToObstacle(bld,obs,height);
          scene.add(bld);
        }
      }
    } else if (obs.type === 'cone') {
      const cone = buildConeMesh();
      cone.position.set(obs.x, obs.elevation ?? terrainHeightAt(levelData, obs.x, obs.y), obs.y);
      scene.add(cone);
      if (obs.movable) movableMeshes.set(obs.id, cone);
    } else if (obs.type === 'box') {
      const box = buildBoxMesh(obs.width, obs.height);
      box.position.set(obs.x, (obs.elevation ?? terrainHeightAt(levelData, obs.x, obs.y)) + obs.width / 2, obs.y);
      scene.add(box);
      // Immovable gate blocks are authored scenery; adding them to the Cannon
      // movable map made the physics pose pull the visible box underground.
      if (obs.movable) movableMeshes.set(obs.id, box as unknown as THREE.Group);
    } else {
      const geo = trackGeo(new THREE.BoxGeometry(obs.width, 5, obs.height));
      const mesh = new THREE.Mesh(geo, flatMat(obs.color));
      mesh.position.set(obs.x, terrainHeightAt(levelData, obs.x, obs.y) + 2.5 + (obs.layer ?? 0) * 0.5, obs.y);
      mesh.castShadow = true;
      scene.add(mesh);
    }
  }

  // Garage walls, boundaries and pillars share a unit cube whose per-face
  // vertex colours preserve the six directional brightness values. Instance
  // colour supplies each authored base colour, bringing each category down
  // to one material and one draw submission.
  const wallInstanceBuckets = new Map<string, typeof wallInstances>();
  wallInstances.forEach(entry => {
    const floor = levelData.levelId === 6
      ? garageFloorAt(entry.obstacle.elevation ?? -48)
      : 0;
    // Split the huge highway's instanced walls into coarse spatial batches;
    // otherwise one world-sized bound makes every rail submit in every mirror.
    const region=levelData.highway&&entry.kind!=='boundary'
      ? `:${Math.floor(entry.obstacle.x/5000)}:${Math.floor(entry.obstacle.y/4000)}` : '';
    const key = `${entry.kind}:${floor}${region}`;
    const bucket = wallInstanceBuckets.get(key);
    if (bucket) bucket.push(entry);
    else wallInstanceBuckets.set(key, [entry]);
  });
  for (const [bucketKey, entries] of wallInstanceBuckets) {
    const kind = bucketKey.split(':')[0] as 'wall' | 'pillar' | 'boundary';
    if (entries.length === 0) continue;
    const geometry = trackGeo(createGarageVertexBox(kind));
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: kind === 'pillar' ? 0.62 : 0.76,
      metalness: kind === 'pillar' ? 0.12 : 0.04,
      emissive: new THREE.Color('#090d12'),
      emissiveIntensity: 0.13,
      flatShading: true,
    });
    const instances = new THREE.InstancedMesh(geometry, material, entries.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    entries.forEach((entry, index) => {
      const obstacle = entry.obstacle;
      quaternion.setFromEuler(new THREE.Euler(0, -obstacle.rotation, 0));
      matrix.compose(
        new THREE.Vector3(
          obstacle.x,
          (obstacle.elevation ?? terrainHeightAt(levelData, obstacle.x, obstacle.y)) + entry.height / 2,
          obstacle.y,
        ),
        quaternion,
        new THREE.Vector3(obstacle.width, entry.height, obstacle.height),
      );
      instances.setMatrixAt(index, matrix);
      instances.setColorAt(index, new THREE.Color(
        kind === 'boundary' ? '#252a32'
          : kind === 'pillar' ? '#8491a2'
            : obstacle.color,
      ));
    });
    instances.instanceMatrix.needsUpdate = true;
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
    instances.castShadow = true;
    instances.receiveShadow = true;
    scene.add(instances);
  }

  // ===== 玩家车 =====
  // 小米 SU7 / YU7 / 尊界 V8 走 three/vehicleModels.ts 的程序化车模
  // （带车门、转向节、尾翼、灯组等绑定）；其余车型继续使用 GLB。
  let playerCarParts: CarMeshParts;
  try {
    playerCarParts = await buildVehicleParts(carType, carConfig);
  } catch (error) {
    console.warn('[scene] 车模加载失败，使用代码几何体回退', error);
    playerCarParts = buildCarMesh(carConfig, false);
  }
  enableCarShadowCasting(playerCarParts);
  // GLB 车模不带灯组，需要补一套「能亮」的灯箱；程序化车模（SU7 / YU7 /
  // 尊界）车身里已经建了灯腔、灯带与转向灯，再补一套会从保险杠里戳出来，
  // 所以这里只对 GLB 车型追加。
  if (!hasProceduralCarModel(carType) && !playerCarParts.nativeCockpit) {
    const makeLamp = (color: number, x: number, y: number, z: number, width: number, height: number) => {
      const material = new THREE.MeshStandardMaterial({ color, emissive: 0x000000, emissiveIntensity: 0, side: THREE.DoubleSide });
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.22), material);
      lamp.position.set(x, y, z);
      playerCarParts.group.add(lamp);
      return lamp;
    };
    const lampY = Math.max(4.8, carConfig.height * 0.34);
    const frontSkin = carConfig.length / 2 - 0.08;
    const rearSkin = -carConfig.length / 2 + 0.08;
    for (const side of [-1, 1]) {
      playerCarParts.headlights.push(makeLamp(0x6b7280, side * carConfig.width * 0.28, lampY, frontSkin, 3.1, 1.35));
      const tail = makeLamp(0x4a0909, side * carConfig.width * 0.28, lampY, rearSkin, 2.8, 1.25);
      playerCarParts.taillights.push(tail);
      if (!playerCarParts.brakeLights.includes(tail)) playerCarParts.brakeLights.push(tail);
      playerCarParts.reverseLights.push(makeLamp(0x4b5563, side * carConfig.width * 0.13, lampY, rearSkin - 0.03, 1.35, 0.95));
      const indicatorArray = side > 0 ? playerCarParts.leftIndicators : playerCarParts.rightIndicators;
      indicatorArray.push(makeLamp(0x5b3200, side * carConfig.width * 0.43, lampY, frontSkin - 0.03, 1.5, 1.05));
      indicatorArray.push(makeLamp(0x5b3200, side * carConfig.width * 0.43, lampY, rearSkin + 0.03, 1.5, 1.05));
    }
  }
  const bindingReport = validateVehicleBindings(playerCarParts);
  playerCarParts.group.userData.bindingReport = bindingReport;
  if (!bindingReport.ok) console.warn('[车模绑定]', bindingReport.missing);
  const startPos = levelData.startPos;
  playerCarParts.group.position.set(startPos.x, 0, startPos.y);
  playerCarParts.group.rotation.y = Math.PI / 2 - startPos.rotation;
  scene.add(playerCarParts.group);
  {
    const shadow = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(1, 1)),
      new THREE.MeshBasicMaterial({
        map: contactShadowTexture(), transparent: true, opacity: 0.32,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(carConfig.width * 0.94, carConfig.length * 0.96, 1);
    shadow.position.y = 0.17;
    shadow.renderOrder = 2;
    playerCarParts.group.add(shadow);
  }

  addBeijingScenery(scene, levelData, trackGeo);
  addOpenWorldScene(scene, levelData, trackGeo);
  if (levelData.levelId === 1) {
    addTrainingTerrainMesh(scene, trackGeo);
    scene.getObjectByName('training-offroad-heightfield')?.position.add(new THREE.Vector3(CITY_OFFSET,0,CITY_OFFSET));
    addElevatedRoadDecks(scene, levelData, trackGeo);
  }
  // ===== 路边植被 / 路灯 / 电线杆 =====
  // The underground garage must not generate city decoration outside every
  // rectangular floor strip; it adds hundreds of invisible meshes.
  if (levelData.levelId !== 6) addRoadsideDecorations(scene, levelData);

  // ===== 地库楼顶（Level 6 专用） =====
  let ceilingGroup: THREE.Group | undefined;
  if (levelData.garage) ceilingGroup = addGarageArchitecture(scene, trackGeo);

  let streamingChunks: Map<string, THREE.Group> | undefined;
  if (levelData.levelId === 6) {
    streamingChunks = new Map<string, THREE.Group>();
    const streamable = scene.children.filter(child => child !== ground && child !== playerCarParts.group && child !== ceilingGroup && child.userData.garageRamp === undefined);
    streamable.forEach(child => {
      const bounds = new THREE.Box3().setFromObject(child);
      if (bounds.isEmpty()) return;
      if (bounds.getSize(new THREE.Vector3()).y > 46) {
        scene.add(child);
        return;
      }
      const centre = bounds.getCenter(new THREE.Vector3());
      const floorIndex = garageFloorAt(centre.y - 10);
      const key = `garage-floor-${floorIndex}`;
      let chunk = streamingChunks!.get(key);
      if (!chunk) {
        chunk = new THREE.Group();
        chunk.name = key;
        chunk.userData.streamingChunk = true;
        streamingChunks!.set(key, chunk);
      }
      scene.remove(child);
      chunk.add(child);
    });
    const spawnFloor = garageFloorAt(levelData.startPos.elevation ?? -48);
    // 初始只加载出生楼层，驶入坡道走廊后由流式逻辑加载相邻楼层
    const spawnChunk = streamingChunks.get(`garage-floor-${spawnFloor}`);
    if (spawnChunk && !spawnChunk.parent) scene.add(spawnChunk);
  }

  const updateExamSignals=levelData.exam?addExamSignals(scene,levelData,trackGeo):undefined;
  return { scene, updateExamSignals, playerCarParts, trafficCarParts, trafficObstacles, spotMeshes, movableMeshes, parkedVisuals, geometries, streamingChunks, ceilingGroup, staticCarCount: levelData.obstacles.filter(obs => obs.type === 'car' && !obs.ai).length };
}

async function addParkedCarInstances(
 scene:THREE.Scene,levelData:LevelData,
 assignments:Array<{obstacle:Obstacle;modelName:string}>,
 visuals:Map<string,(pose:{x:number;y:number;rotation:number;elevation?:number;crushed?:number})=>void>,
){
 const ids=new Set<string>(),buckets=new Map<string,typeof assignments>();
 for(const a of assignments){const key=a.modelName+':'+(levelData.garage?garageFloorAt(a.obstacle.elevation??-48):0);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key)!.push(a);}
 const hull=(points:Vector2[])=>{
  const list=[...new Map(points.map(p=>[p.x.toFixed(3)+','+p.y.toFixed(3),p])).values()].sort((a,b)=>a.x-b.x||a.y-b.y);
  const half=(v:Vector2[])=>{const h:Vector2[]=[];for(const p of v){while(h.length>1){const a=h[h.length-2],b=h[h.length-1];if((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x)>0)break;h.pop();}h.push(p);}return h.slice(0,-1);};
  return [...half(list),...half([...list].reverse())];
 };
 for(const group of buckets.values()){
  const template=await loadModel(group[0].modelName);template.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(template,true),center=box.getCenter(new THREE.Vector3());
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>(),points:Vector2[]=[];
  const vertex=new THREE.Vector3();
  // Bake the original uniform transform once. Preserve all 3/6/18/22 wheels,
  // spokes and tracks; merge each material into a single instanced draw call.
  template.traverse(node=>{
   if(!(node instanceof THREE.Mesh)||node instanceof THREE.SkinnedMesh)return;
   const input=node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone();input.applyMatrix4(node.matrixWorld);input.translate(-center.x,-box.min.y,-center.z);
   const pos=input.getAttribute('position');
   for(let i=0;i<pos.count;i++){vertex.fromBufferAttribute(pos,i);points.push({x:vertex.z,y:-vertex.x});}
   // GLTFLoader normally splits material primitives; handle grouped inputs too.
   const mats=Array.isArray(node.material)?node.material:[node.material];
   const parts=input.groups.length?input.groups:[{start:0,count:pos.count,materialIndex:0}];
   for(const part of parts){
    const mat=mats[part.materialIndex??0];if(!mat)continue;
    const g=new THREE.BufferGeometry();
    for(const key of ['position','normal','uv']){const attr=input.getAttribute(key);if(attr)g.setAttribute(key,new THREE.Float32BufferAttribute(Array.from(attr.array as ArrayLike<number>).slice(part.start*attr.itemSize,(part.start+part.count)*attr.itemSize),attr.itemSize));}
    if(!g.getAttribute('normal'))g.computeVertexNormals();if(!g.getAttribute('uv'))g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(part.count*2),2));
    if(!batches.has(mat))batches.set(mat,[]);batches.get(mat)!.push(g);
   }
   input.dispose();
  });
  const meshes:Array<{mesh:THREE.InstancedMesh;shadow?:boolean}>=[];
  for(const [material,geos] of batches){
   const merged=mergeGeometries(geos,false)!;geos.forEach(g=>g.dispose());
   const mesh=new THREE.InstancedMesh(merged,material,group.length);mesh.name='parked-'+group[0].modelName;
   mesh.castShadow=!material.transparent;mesh.receiveShadow=true;scene.add(mesh);meshes.push({mesh});
  }
  const shadow=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:contactShadowTexture(),transparent:true,opacity:.22,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),group.length);
  shadow.name='parked-contact-shadows';scene.add(shadow);meshes.push({mesh:shadow,shadow:true});
  const actualHull=hull(points),size=box.getSize(new THREE.Vector3());
  group.forEach(({obstacle:o},i)=>{
   o.collisionFootprint=actualHull;o.width=size.x;o.height=size.z;o.verticalHeight=size.y;
   o.elevation??=terrainHeightAt(levelData,o.x,o.y);ids.add(o.id);
   const update=(pose:{x:number;y:number;rotation:number;elevation?:number;crushed?:number})=>{
    const y=pose.elevation??terrainHeightAt(levelData,pose.x,pose.y),crush=1-(pose.crushed??0)*.62;
    for(const item of meshes){
     const matrix=new THREE.Matrix4().compose(new THREE.Vector3(pose.x,y+(item.shadow?.12:0),pose.y),new THREE.Quaternion().setFromEuler(item.shadow?new THREE.Euler(-Math.PI/2,0,-pose.rotation+Math.PI/2):new THREE.Euler(0,Math.PI/2-pose.rotation,0)),item.shadow?new THREE.Vector3(size.x*1.15,size.z*1.06,1):new THREE.Vector3(1,crush,1));
     item.mesh.setMatrixAt(i,matrix);item.mesh.instanceMatrix.needsUpdate=true;
     if(item.mesh.boundingSphere){const b=item.mesh.boundingSphere,v=new THREE.Vector3(pose.x,y,pose.y);const required=b.center.distanceTo(v)+Math.max(size.x,size.z);if(required>b.radius)b.radius=required+20;}
    }
   };update(o);visuals.set(o.id,update);
  });
  // A stable map-sized bound accommodates impact movement without repeatedly
  // rescanning every instance matrix on each collision frame.
  for(const {mesh} of meshes)mesh.computeBoundingSphere();
 }
 return ids;
}

function createGarageVertexBox(kind: 'wall' | 'pillar' | 'boundary') {
  const indexed = new THREE.BoxGeometry(1, 1, 1);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  const brightness = kind === 'pillar'
    ? [1.08, 0.68, 1.28, 0.52, 0.92, 0.60]
    : kind === 'boundary'
      ? [0.86, 0.60, 1.08, 0.45, 0.78, 0.54]
      : [1.10, 0.72, 1.24, 0.56, 0.96, 0.64];
  const colors = new Float32Array(geometry.getAttribute('position').count * 3);
  // Non-indexed BoxGeometry emits six consecutive vertices per face.
  for (let face = 0; face < 6; face++) {
    const value = brightness[face];
    for (let vertex = face * 6; vertex < face * 6 + 6; vertex++) {
      colors[vertex * 3] = value;
      colors[vertex * 3 + 1] = value;
      colors[vertex * 3 + 2] = value;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.clearGroups();
  return geometry;
}

// ============================================================
// ============================================================
// 车道线 / 中心线 / 方向箭头（沿 curved road 中心线绘制）
// ============================================================
type MarkingGap = { x: number; y: number; radius: number };

function pointInMarkingGap(point: THREE.Vector3, gaps: MarkingGap[]): boolean {
  return gaps.some(gap => Math.hypot(point.x - gap.x, point.z - gap.y) < gap.radius);
}

/** Split a line run so no ribbon crosses a junction marking gap. */
function splitPointsByMarkingGaps(points: THREE.Vector3[], gaps: MarkingGap[]): THREE.Vector3[][] {
  if (gaps.length === 0) return points.length >= 2 ? [points] : [];
  const runs: THREE.Vector3[][] = [];
  let run: THREE.Vector3[] = [];
  for (const point of points) {
    if (pointInMarkingGap(point, gaps)) {
      if (run.length >= 2) runs.push(run);
      run = [];
    } else {
      run.push(point);
    }
  }
  if (run.length >= 2) runs.push(run);
  return runs;
}

function addRoadLaneMarkings(
  scene: THREE.Object3D,
  samples: THREE.Vector3[],
  tangents: THREE.Vector3[],
  halfW: (i: number) => number,
  lanes: number,
  direction: 'two-way' | 'one-way',
  elevation: number,
  closed: boolean,
  trackGeo: (g: THREE.BufferGeometry) => THREE.BufferGeometry,
  markingGaps: MarkingGap[] = [],
) {
  const n = samples.length;
  if (n < 2) return;
  // 与沥青带一致的连续法线
  const normals: THREE.Vector3[] = [];
  let prev: THREE.Vector3 | null = null;
  for (let i = 0; i < n; i++) {
    const t = tangents[i];
    const nm = new THREE.Vector3(-t.z, 0, t.x).normalize();
    if (prev && prev.dot(nm) < 0) nm.negate();
    prev = nm.clone();
    normals.push(nm);
  }
  const yLine = elevation + 0.1;
  // 沿某横向偏移函数 off(i) 画一条线（dashed=虚线；yellow=黄线）
  const addLine = (off: (i: number) => number, dashed: boolean, yellow: boolean) => {
    const ptsAll = samples.map((p, i) => p.clone().addScaledVector(normals[i], off(i)).setY(yLine));
    const runs: THREE.Vector3[][] = [];
    if (!dashed) { runs.push(ptsAll); }
    else {
      const dash=30,period=90;let distance=0;
      for(let i=1;i<ptsAll.length;i++){
        const a=ptsAll[i-1],b=ptsAll[i],length=a.distanceTo(b);if(length<1e-6)continue;
        let offset=0;
        while(offset<length-1e-6){const phase=(distance+offset)%period;const drawing=phase<dash;const step=Math.min(length-offset,(drawing?dash:period)-phase||period);
          if(drawing)runs.push([a.clone().lerp(b,offset/length),a.clone().lerp(b,(offset+step)/length)]);offset+=step;
        }distance+=length;
      }
    }
    const mat = yellow ? Mats.lineYellow() : Mats.lineWhite();
    const visibleRuns = runs.flatMap(run => splitPointsByMarkingGaps(run, markingGaps));
    const ribbons=visibleRuns.filter(run=>run.length>=2).map(run=>flatLineRibbon(run,yellow?.75:1.2,yLine+.02,false));
    if(ribbons.length){const geo=mergeGeometries(ribbons);ribbons.forEach(g=>g.dispose());if(geo){const mesh=new THREE.Mesh(trackGeo(geo),mat);mesh.renderOrder=5;scene.add(mesh);}}

  };
  const L = Math.max(1, Math.min(8, lanes));
  // 车道边界(以半宽为单位)
  const bounds: number[] = [];
  for (let k = 1; k < L; k++) bounds.push(-1 + (2 * k) / L);
  if (direction === 'two-way') {
    if (L % 2 === 0) { // 双黄中心线
      addLine(() => 1.5, false, true);
      addLine(() => -1.5, false, true);
    } else { // 单中心线
      addLine(() => 0, false, true);
    }
    // 白色虚线分隔(排除中心 0)
    for (const f of bounds) if (Math.abs(f) > 1e-6) addLine(i => f * halfW(i), true, false);
  } else {
    // 单向：全部白色虚线分隔(含可能的 0)
    for (const f of bounds) addLine(i => f * halfW(i), true, false);
  }
  // 方向箭头：每个车道中心
  if (L >= 1) {
    const arrowShape = (w: number, h: number) => {
      const shaft = w * 0.3; const s = new THREE.Shape();
      s.moveTo(-shaft / 2, -h / 2); s.lineTo(shaft / 2, -h / 2); s.lineTo(shaft / 2, h * 0.1);
      s.lineTo(w / 2, h * 0.1); s.lineTo(0, h / 2); s.lineTo(-w / 2, h * 0.1); s.lineTo(-shaft / 2, h * 0.1); s.closePath();
      return s;
    };
    const shape = arrowShape(9, 15);
    const GAP = 240;
    for (let k = 1; k <= L; k++) {
      const cfrac = -1 + (2 * k - 1) / L;
      const forward = direction === 'one-way' ? true : cfrac >= 0;
      let acc = 0;
      for (let i = 1; i < n; i++) {
        acc += samples[i].distanceTo(samples[i - 1]);
        if (acc >= GAP) {
          acc = 0;
          const p = samples[i].clone().addScaledVector(normals[i], cfrac * halfW(i)).setY(elevation + 0.12);
          if (pointInMarkingGap(p, markingGaps)) continue;
          const yaw = Math.atan2(tangents[i].x, tangents[i].z) + (forward ? 0 : Math.PI);
          const arrow = new THREE.Mesh(trackGeo(new THREE.ShapeGeometry(shape)), Mats.lineWhite());
          orientGroundPlane(arrow, Math.PI - yaw);
          arrow.position.copy(p);
          arrow.renderOrder = 5;
          scene.add(arrow);
        }
      }
    }
  }
}

// ============================================================
// 标线渲染
// ============================================================
function addMarking(scene: THREE.Object3D, mk: Marking, trackGeo: (g: THREE.BufferGeometry) => THREE.BufferGeometry) {
  const mat = markingMaterial(mk.color);

  // 图层抬升基准：layer 越大上抬越多，避免被道路/桥面遮挡（0 = 贴地）
  const layerLift = (mk.elevation ?? 0) + (mk.layer ?? 0) * 0.5;
  const childStart = scene.children.length;

  const flatRect = (width: number, height: number) => {
    const mesh = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(width, height)), mat);
    orientGroundPlane(mesh);
    mesh.renderOrder = 3;
    return mesh;
  };

  switch (mk.type) {
    case 'line-solid': {
      const mesh = flatRect(mk.width, mk.height);
      mesh.position.set(mk.x, 0.18, mk.y);
      orientGroundPlane(mesh, mk.rotation);
      scene.add(mesh);
      break;
    }
    case 'line-dashed': {
      const segLen = 20;
      const gapLen = 16;
      const totalLen = Math.max(mk.width, mk.height);
      const segCount = Math.max(1, Math.floor(totalLen / (segLen + gapLen)));
      const alongX = mk.width >= mk.height;
      const thickness = Math.max(1.2, Math.min(mk.width, mk.height));
      const dashGeo = trackGeo(new THREE.PlaneGeometry(
        alongX ? segLen : thickness,
        alongX ? thickness : segLen,
      ));
      for (let i = 0; i < segCount; i++) {
        const mesh = new THREE.Mesh(dashGeo, mat);
        const offset = -totalLen / 2 + segLen / 2 + i * (segLen + gapLen);
        const local = new THREE.Vector3(alongX ? offset : 0, 0, alongX ? 0 : offset)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), -mk.rotation);
        mesh.position.set(mk.x + local.x, 0.181, mk.y + local.z);
        orientGroundPlane(mesh, mk.rotation);
        mesh.renderOrder = 3;
        scene.add(mesh);
      }
      break;
    }
    case 'line-double': {
      const alongX = mk.width >= mk.height;
      const geo = trackGeo(new THREE.PlaneGeometry(
        alongX ? mk.width : 1.5,
        alongX ? 1.5 : mk.height,
      ));
      const offsetA = new THREE.Vector3(alongX ? 0 : -3, 0, alongX ? -3 : 0)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), -mk.rotation);
      const offsetB = offsetA.clone().multiplyScalar(-1);
      const line1 = new THREE.Mesh(geo, mat);
      line1.position.set(mk.x + offsetA.x, 0.182, mk.y + offsetA.z);
      orientGroundPlane(line1, mk.rotation);
      line1.renderOrder = 3;
      scene.add(line1);
      const line2 = new THREE.Mesh(geo, mat);
      line2.position.set(mk.x + offsetB.x, 0.182, mk.y + offsetB.z);
      orientGroundPlane(line2, mk.rotation);
      line2.renderOrder = 3;
      scene.add(line2);
      break;
    }
    case 'stop': {
      const mesh = flatRect(mk.width, mk.height);
      mesh.position.set(mk.x, 0.183, mk.y);
      orientGroundPlane(mesh, mk.rotation);
      scene.add(mesh);
      break;
    }
    case 'crosswalk': {
      const group = new THREE.Group();
      group.position.set(mk.x, 0.184, mk.y);
      group.rotation.y = -mk.rotation;
      // 斑马条垂直于车道线：每条横跨路面(沿宽轴)，逐条沿行进方向(高轴)排列。
      const alongX = mk.width >= mk.height;
      const span = alongX ? mk.width : mk.height;
      const stripeWidth = 5;
      const gap = 4;
      const count = Math.max(2, Math.floor(span / (stripeWidth + gap)));
      const stripeGeo = trackGeo(new THREE.PlaneGeometry(
        alongX ? stripeWidth : mk.width,
        alongX ? mk.height : stripeWidth,
      ));
      for (let i = 0; i < count; i++) {
        const stripe = new THREE.Mesh(stripeGeo, mat);
        stripe.rotation.x = -Math.PI / 2;
        stripe.renderOrder = 3;
        const offset = -span / 2 + stripeWidth / 2 + i * (stripeWidth + gap);
        stripe.position.set(alongX ? offset : 0, 0, alongX ? 0 : offset);
        group.add(stripe);
      }
      scene.add(group);
      break;
    }
    case 'arrow-straight': {
      const w = Math.max(12, mk.width || 20);
      const h = Math.max(18, mk.height || 28);
      const shaft = w * 0.28;
      const shape = new THREE.Shape();
      shape.moveTo(-shaft / 2, -h / 2);
      shape.lineTo(shaft / 2, -h / 2);
      shape.lineTo(shaft / 2, h * 0.08);
      shape.lineTo(w / 2, h * 0.08);
      shape.lineTo(0, h / 2);
      shape.lineTo(-w / 2, h * 0.08);
      shape.lineTo(-shaft / 2, h * 0.08);
      shape.closePath();
      const arrow = new THREE.Mesh(trackGeo(new THREE.ShapeGeometry(shape)), mat);
      orientGroundPlane(arrow, mk.rotation + Math.PI / 2);
      arrow.position.set(mk.x, 0.185, mk.y);
      arrow.renderOrder = 3;
      scene.add(arrow);
      break;
    }
    case 'arrow-uturn': {
      const w = Math.max(16, mk.width || 24), h = Math.max(24, mk.height || 32);
      const sw = w * 0.18, right = w * 0.28, left = -w * 0.28;
      const shape = new THREE.Shape();
      shape.moveTo(right-sw/2,-h/2); shape.lineTo(right+sw/2,-h/2);
      shape.lineTo(right+sw/2,h*.12);
      shape.bezierCurveTo(right+sw/2,h*.62,left-sw/2,h*.62,left-sw/2,h*.12);
      shape.lineTo(left-sw/2,-h*.08); shape.lineTo(left-sw*1.25,-h*.08);
      shape.lineTo(left,-h*.36); shape.lineTo(left+sw*1.25,-h*.08);
      shape.lineTo(left+sw/2,-h*.08); shape.lineTo(left+sw/2,h*.12);
      shape.bezierCurveTo(left+sw/2,h*.36,right-sw/2,h*.36,right-sw/2,h*.12);
      shape.closePath();
      const arrow = new THREE.Mesh(trackGeo(new THREE.ShapeGeometry(shape,12)),mat);
      orientGroundPlane(arrow,mk.rotation+Math.PI/2);
      arrow.position.set(mk.x,.185,mk.y); arrow.renderOrder=3; scene.add(arrow);
      break;
    }
    case 'arrow-turn':
    case 'arrow-left':
    case 'arrow-right':
    case 'arrow-merge-left':
    case 'arrow-merge-right': {
      const w = Math.max(14, mk.width || 24);
      const h = Math.max(20, mk.height || 32);
      const sw = w * 0.24;          // 杆宽
      const top = h * 0.32;         // 横臂顶
      const aw = sw;                // 横臂厚
      const midY = top - aw / 2;
      const headLen = w * 0.34;
      const hw = aw * 1.5;
      const left = mk.type === 'arrow-left' || mk.type === 'arrow-merge-left';
      const sgn = left ? -1 : 1;
      const shape = new THREE.Shape();
      // 直行杆 + 向 sgn 方向弯出的横臂 + 指向 sgn 的箭头
      shape.moveTo(-sgn * sw / 2, -h / 2);
      shape.lineTo(sgn * sw / 2, -h / 2);
      shape.lineTo(sgn * sw / 2, top);
      shape.lineTo(sgn * (w / 2 - headLen), top);
      shape.lineTo(sgn * (w / 2 - headLen), top + hw);
      shape.lineTo(sgn * (w / 2), midY);
      shape.lineTo(sgn * (w / 2 - headLen), top - aw - hw);
      shape.lineTo(sgn * (w / 2 - headLen), top - aw);
      shape.lineTo(-sgn * sw / 2, top - aw);
      shape.closePath();
      const arrow = new THREE.Mesh(trackGeo(new THREE.ShapeGeometry(shape)), mat);
      orientGroundPlane(arrow, mk.rotation + Math.PI / 2);
      arrow.position.set(mk.x, 0.185, mk.y);
      arrow.renderOrder = 3;
      scene.add(arrow);
      // 变道箭头：额外画一条从反方向并入的斜尾
      if (mk.type === 'arrow-merge-left' || mk.type === 'arrow-merge-right') {
        const tail = new THREE.Shape();
        const tw = sw * 0.9;
        tail.moveTo(-tw / 2, 0); tail.lineTo(tw / 2, 0); tail.lineTo(tw / 2, h * 0.5);
        tail.lineTo(0, h * 0.5 + tw); tail.lineTo(-tw / 2, h * 0.5); tail.closePath();
        const tailMesh = new THREE.Mesh(trackGeo(new THREE.ShapeGeometry(tail)), mat);
        orientGroundPlane(tailMesh, mk.rotation + Math.PI / 2 - sgn * 0.6);
        tailMesh.position.set(mk.x - sgn * w * 0.18, 0.185, mk.y);
        tailMesh.renderOrder = 3;
        scene.add(tailMesh);
      }
      break;
    }
    case 'roundabout': {
      const roadRingGeo = trackGeo(new THREE.RingGeometry(mk.width / 3, mk.width / 2, 128));
      const roadRing = new THREE.Mesh(roadRingGeo, Mats.roadSec());
      orientGroundPlane(roadRing);
      roadRing.position.set(mk.x, 0.15, mk.y);
      roadRing.renderOrder = 2;
      roadRing.receiveShadow = true;
      scene.add(roadRing);
      const ringGeo = trackGeo(new THREE.RingGeometry(mk.width / 2 - 1, mk.width / 2, 128));
      const ring = new THREE.Mesh(ringGeo, mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(mk.x, 0.185, mk.y);
      ring.renderOrder = 3;
      scene.add(ring);
      const islandGeo = trackGeo(new THREE.CircleGeometry(mk.width / 3, 128));
      const island = new THREE.Mesh(islandGeo, flatMat('#2a4a2a'));
      island.rotation.x = -Math.PI / 2;
      island.position.set(mk.x, 0.14, mk.y);
      scene.add(island);
      break;
    }
    case 'yield': {
      // Hollow yield triangle points back toward the approaching driver.
      const w = Math.max(10, mk.width || 16);
      const h = Math.max(8, mk.height || 12);
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, -h / 2);
      shape.lineTo(w / 2, -h / 2);
      shape.lineTo(0, h / 2);
      shape.closePath();
      const hole = new THREE.Path();
      hole.moveTo(-w*.3,-h*.3); hole.lineTo(0,h*.28); hole.lineTo(w*.3,-h*.3); hole.closePath();
      shape.holes.push(hole);
      const tri = new THREE.Mesh(trackGeo(new THREE.ShapeGeometry(shape)), mat);
      orientGroundPlane(tri, mk.rotation - Math.PI / 2);
      tri.position.set(mk.x, 0.185, mk.y);
      tri.renderOrder = 3;
      scene.add(tri);
      break;
    }
    case 'channelize': {
      // 导流线：白色三角边框 + 三角内 45° 斜纹（斜纹按三角裁剪，不溢出）
      const w = Math.max(20, mk.width || 60);
      const h = Math.max(16, mk.height || 32);
      const V: [number, number][] = [[0, h / 2], [-w / 2, -h / 2], [w / 2, -h / 2]]; // 本地坐标(顶点朝 +Y)
      const group = new THREE.Group();
      group.position.set(mk.x, 0.186, mk.y);
      group.rotation.y = -mk.rotation;
      const lay = (geo: THREE.BufferGeometry, lx: number, lz: number, ang: number) => {
        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2; m.rotation.z = ang;
        m.position.set(lx, 0, lz); m.renderOrder = 3; group.add(m);
      };
      // 边框三条
      for (let i = 0; i < 3; i++) {
        const a = V[i], b = V[(i + 1) % 3];
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const L = Math.hypot(dx, dz);
        lay(trackGeo(new THREE.PlaneGeometry(L, 1.4)), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.atan2(dz, dx));
      }
      // 斜纹裁剪（Sutherland-Hodgman 对三角 3 半平面）
      const clipEdge = (poly: [number, number][], p1: [number, number], p2: [number, number]): [number, number][] => {
        const out: [number, number][] = [];
        const inside = (p: [number, number]) => (p2[0] - p1[0]) * (p[1] - p1[1]) - (p2[1] - p1[1]) * (p[0] - p1[0]) >= 0;
        const isect = (a: [number, number], b: [number, number]): [number, number] => {
          const x1 = a[0], y1 = a[1], x2 = b[0], y2 = b[1], x3 = p1[0], y3 = p1[1], x4 = p2[0], y4 = p2[1];
          const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
          const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
          return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
        };
        for (let i = 0; i < poly.length; i++) {
          const cur = poly[i], prev = poly[(i + poly.length - 1) % poly.length];
          const ci = inside(cur), pi = inside(prev);
          if (ci) { if (!pi) out.push(isect(prev, cur)); out.push(cur); }
          else if (pi) out.push(isect(prev, cur));
        }
        return out;
      };
      const diag = (c: number): [number, number][] => [[-w, c - w], [w, c + w]]; // 45° 线 x-y=c
      for (let c = -h; c <= h + w; c += 7) {
        let poly: [number, number][] = diag(c);
        for (let i = 0; i < 3; i++) poly = clipEdge(poly, V[i], V[(i + 1) % 3]);
        if (poly.length >= 2) {
          const a = poly[0], b = poly[poly.length - 1];
          const dx = b[0] - a[0], dz = b[1] - a[1];
          const L = Math.hypot(dx, dz);
          if (L > 1) lay(trackGeo(new THREE.PlaneGeometry(L, 1.0)), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.atan2(dz, dx));
        }
      }
      scene.add(group);
      break;
    }
    default: {
      const mesh = flatRect(mk.width, mk.height);
      mesh.position.set(mk.x, 0.18, mk.y);
      orientGroundPlane(mesh, mk.rotation);
      scene.add(mesh);
    }
  }
  // 把本次新增的所有子对象整体上抬到所属图层高度
  if (layerLift !== 0) {
    for (let i = childStart; i < scene.children.length; i++) scene.children[i].position.y += layerLift;
  }
}

/**
 * Markings used to be submitted one stripe/dash at a time. Build them with
 * the existing authoring path, bake their transforms, then merge by a small
 * spatial/material bucket. Bucketing keeps frustum culling useful while
 * reducing a large garage from ~1600 drawables to a few dozen meshes.
 */
function addMarkingsBatched(
  scene: THREE.Scene,
  markings: Marking[],
  trackGeo: (g: THREE.BufferGeometry) => THREE.BufferGeometry,
) {
  if (markings.length === 0) return;
  const staging = new THREE.Group();
  markings.forEach(marking => {
    try {
    // ShapeGeometry arrows have a different local axis convention than the
    // flat rectangular markings. They are few, so keep them as individual
    // meshes and batch the thousands of stripes/dashes around them.
    if (marking.type.startsWith('arrow-') || marking.type === 'roundabout') {
      addMarking(scene, marking, trackGeo);
    } else {
      addMarking(staging, marking, geometry => geometry);
    }
    } catch (err) {
      console.warn('[buildScene] 跳过异常标线:', err);
    }
  });
  staging.updateMatrixWorld(true);

  type Bucket = { material: THREE.Material | THREE.Material[]; geometries: THREE.BufferGeometry[] };
  const buckets = new Map<string, Bucket>();
  const unmergeable: THREE.Object3D[] = [];
  staging.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    if (Array.isArray(object.material)) {
      unmergeable.push(object);
      return;
    }
    const worldPosition = object.getWorldPosition(new THREE.Vector3());
    const floor = Math.round(worldPosition.y / 48);
    const blockX = Math.floor(worldPosition.x / 500);
    const blockZ = Math.floor(worldPosition.z / 500);
    const key = `${floor}:${blockX}:${blockZ}:${markingMaterialKey(object.material, object.renderOrder)}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { material: object.material, geometries: [] };
      buckets.set(key, bucket);
    }
    const baked = object.geometry.index
      ? object.geometry.toNonIndexed()
      : object.geometry.clone();
    baked.applyMatrix4(object.matrixWorld);
    bucket.geometries.push(baked);
  });

  buckets.forEach(bucket => {
    const merged = mergeGeometries(bucket.geometries, false);
    bucket.geometries.forEach(geometry => geometry.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(trackGeo(merged), bucket.material);
    mesh.renderOrder = 3;
    mesh.receiveShadow = true;
    scene.add(mesh);
  });

  // This path is currently only needed for a future multi-material marking;
  // retain it as a safe fallback instead of silently dropping geometry.
  unmergeable.forEach(object => {
    const clone = object.clone();
    clone.applyMatrix4(object.matrixWorld);
    scene.add(clone);
  });

  staging.traverse(object => {
    if (object instanceof THREE.Mesh) object.geometry.dispose();
  });
}

// ============================================================
// Elevated challenge decks/ramps. The mesh uses the exact same profile as
// GameCanvas height sampling, so tyres, camera and top surface agree.
// ============================================================
function addElevatedRoadDecks(scene: THREE.Scene, levelData: LevelData, trackGeo: (g: THREE.BufferGeometry) => THREE.BufferGeometry) {
  for (const road of levelData.elevatedRoads || []) {
    const segments = 56;
    const halfW = road.height / 2;
    const positions: number[] = [];
    const indices: number[] = [];
    const color = new THREE.Color('#303034');
    const colors: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const localX = -road.width / 2 + (i / segments) * road.width;
      const wx = road.x + Math.cos(road.rotation) * localX;
      const wy = road.y + Math.sin(road.rotation) * localX;
      const profile = elevatedRoadProfile(road, wx, wy);
      const h = profile?.height || 0;
      for (const side of [-1, 1]) {
        positions.push(wx - Math.sin(road.rotation) * halfW * side, h + 0.14, wy + Math.cos(road.rotation) * halfW * side);
        colors.push(color.r, color.g, color.b);
      }
      if (i < segments) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = trackGeo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const deckMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 });
    const deck = new THREE.Mesh(geo, deckMat);
    deck.receiveShadow = true;
    deck.castShadow = true;
    deck.name = `elevated-deck-${road.id}`;
    scene.add(deck);

    // Continuous closed slab below the driving surface. The previous 56
    // horizontal boxes had their top at h(mid); on a ramp that poked through
    // the continuous h(x)+.14 deck at segment starts. This ribbon samples the
    // same profile at every station and keeps its top strictly below the deck.
    const slabSegments = 112;
    const slabPositions: number[] = [];
    const slabIndices: number[] = [];
    const slabTopOffset = -0.06;
    const slabThickness = 2.2;
    const rightX = -Math.sin(road.rotation);
    const rightY = Math.cos(road.rotation);
    for (let i = 0; i <= slabSegments; i++) {
      const localX = -road.width / 2 + (i / slabSegments) * road.width;
      const wx = road.x + Math.cos(road.rotation) * localX;
      const wy = road.y + Math.sin(road.rotation) * localX;
      const h = elevatedRoadProfile(road, wx, wy)?.height || 0;
      const top = h + slabTopOffset;
      const bottom = top - slabThickness;
      // left-top, right-top, left-bottom, right-bottom
      slabPositions.push(wx + rightX * halfW, top, wy + rightY * halfW);
      slabPositions.push(wx - rightX * halfW, top, wy - rightY * halfW);
      slabPositions.push(wx + rightX * halfW, bottom, wy + rightY * halfW);
      slabPositions.push(wx - rightX * halfW, bottom, wy - rightY * halfW);
      if (i < slabSegments) {
        const a = i * 4;
        const n = a + 4;
        // top, bottom, left side, right side
        slabIndices.push(a, a + 1, n, a + 1, n + 1, n);
        slabIndices.push(a + 2, n + 2, a + 3, a + 3, n + 2, n + 3);
        slabIndices.push(a, n, a + 2, a + 2, n, n + 2);
        slabIndices.push(a + 1, a + 3, n + 1, a + 3, n + 3, n + 1);
      }
    }
    // end caps
    const last = slabSegments * 4;
    slabIndices.push(0, 2, 1, 1, 2, 3);
    slabIndices.push(last, last + 1, last + 2, last + 1, last + 3, last + 2);
    const slabGeo = trackGeo(new THREE.BufferGeometry());
    slabGeo.setAttribute('position', new THREE.Float32BufferAttribute(slabPositions, 3));
    slabGeo.setIndex(slabIndices);
    slabGeo.computeVertexNormals();
    const slab = new THREE.Mesh(slabGeo, flatMat('#24262b', { side: THREE.DoubleSide }));
    slab.name = `elevated-slab-${road.id}`;
    slab.castShadow = true;
    slab.receiveShadow = true;
    scene.add(slab);

    // Continuous guard rail at the exact same segments/size as the physical
    // collision walls. The old sparse posts left invisible collision gaps.
    const railGeo = trackGeo(new THREE.BoxGeometry(road.width / 44 + 2, 5, 7));
    const rail = new THREE.InstancedMesh(railGeo, flatMat('#9aa3ad'), 88);
    rail.name = `elevated-rails-${road.id}`;
    rail.castShadow = true;
    const railMatrix = new THREE.Matrix4();
    const railQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -road.rotation, 0));
    let railIndex = 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 44; i++) {
        const localX = -road.width / 2 + (i + 0.5) * road.width / 44;
        const wx = road.x + Math.cos(road.rotation) * localX;
        const wy = road.y + Math.sin(road.rotation) * localX;
        const h = elevatedRoadProfile(road, wx, wy)?.height || 0;
        const sideX = -Math.sin(road.rotation) * (road.height / 2) * side;
        const sideY = Math.cos(road.rotation) * (road.height / 2) * side;
        railMatrix.compose(new THREE.Vector3(wx + sideX, h + 2.5, wy + sideY), railQ, new THREE.Vector3(1, 1, 1));
        rail.setMatrixAt(railIndex++, railMatrix);
      }
    }
    rail.instanceMatrix.needsUpdate = true;
    scene.add(rail);

    // Edge posts are decorative; the continuous rail above is the visible
    // counterpart of the segmented collision rail.
    for (const side of [-1, 1]) {
      for (let i = 0; i < segments; i += 3) {
        const localX = -road.width / 2 + (i / segments) * road.width;
        const wx = road.x + Math.cos(road.rotation) * localX;
        const wy = road.y + Math.sin(road.rotation) * localX;
        const h = elevatedRoadProfile(road, wx, wy)?.height || 0;
        const post = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3, 7, 3)), flatMat('#9aa3ad'));
        post.position.set(
          wx - Math.sin(road.rotation) * halfW * side,
          h + 3.5,
          wy + Math.cos(road.rotation) * halfW * side,
        );
        post.castShadow = true;
        scene.add(post);
      }
    }
    // Supports under the deck, clear of the north-south underpass centre.
    for (const side of [-1, 1]) {
      for (const outerX of [-road.width * 0.18, road.width * 0.18]) {
        const h = Math.max(0,(elevatedRoadProfile(road, road.x + outerX, road.y)?.height || 0)-2.26);
        if (h < 2) continue;
        const pier = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(22, h, 22)), flatMat('#4b5563'));
        pier.position.set(road.x + outerX, h / 2, road.y + side * 52);
        pier.castShadow = true;
        scene.add(pier);
      }
    }
    // Centre dashed marking follows the ramp/deck height.
    for (let i = 0; i < segments; i += 4) {
      const localX = -road.width / 2 + (i / segments) * road.width;
      const wx = road.x + Math.cos(road.rotation) * localX;
      const wy = road.y + Math.sin(road.rotation) * localX;
      const h = elevatedRoadProfile(road, wx, wy)?.height || 0;
      const dash = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(road.width / segments * 1.6, 0.08, 1.2)), flatMat('#e5e7eb'));
      dash.position.set(wx, h + 0.22, wy);
      dash.rotation.y = -road.rotation;
      scene.add(dash);
    }
  }
}

// ============================================================
// 非铺装训练地形：与 GameCanvas 共用一个解析高度场，静态网格一次生成。
// ============================================================
function addTrainingTerrainMesh(
  scene: THREE.Scene,
  trackGeo: (g: THREE.BufferGeometry) => THREE.BufferGeometry,
) {
  const width = TRAINING_TERRAIN.width;
  const length = TRAINING_TERRAIN.length;
  const columns = TRAINING_TERRAIN.meshColumns;
  const rows = TRAINING_TERRAIN.meshRows;
  const geo = new THREE.PlaneGeometry(width, length, columns, rows);
  geo.rotateX(-Math.PI / 2);
  const positions = geo.getAttribute('position');
  const colors: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) + TRAINING_TERRAIN.centerX;
    const z = positions.getZ(i) + TRAINING_TERRAIN.centerY;
    const height = trainingTerrainHeight(x, z);
    positions.setY(i, height);
    const shade = 0.78 + Math.min(0.18, height * 0.08);
    colors.push(0.43 * shade, 0.38 * shade, 0.31 * shade);
  }
  positions.needsUpdate = true;
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.01,
  });
  const mesh = new THREE.Mesh(trackGeo(geo), material);
  mesh.position.set(TRAINING_TERRAIN.centerX, 0, TRAINING_TERRAIN.centerY);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'training-offroad-heightfield';
  scene.add(mesh);
}

// ============================================================
// 路边装饰物生成
// ============================================================
function addRoadsideDecorations(scene: THREE.Scene, levelData: LevelData) {
  if (!levelData.roadSurfaces || levelData.levelId === 1) return;

  const roadLines: { x1: number; y1: number; x2: number; y2: number; width: number }[] = [];

  levelData.roadSurfaces.forEach((rs: RoadSurface) => {
    const cos = Math.cos(rs.rotation);
    const sin = Math.sin(rs.rotation);
    if (rs.width > rs.height) {
      const dx = cos * rs.width / 2;
      const dy = sin * rs.width / 2;
      roadLines.push({ x1: rs.x - dx, y1: rs.y - dy, x2: rs.x + dx, y2: rs.y + dy, width: rs.height });
    } else {
      const dx = -sin * rs.height / 2;
      const dy = cos * rs.height / 2;
      roadLines.push({ x1: rs.x - dx, y1: rs.y - dy, x2: rs.x + dx, y2: rs.y + dy, width: rs.width });
    }
  });

  let treeIndex = 0;
  roadLines.forEach((line) => {
    const len = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
    const spacing = 150;
    const count = Math.floor(len / spacing);
    const offset = line.width / 2 + 30;
    const dirX = (line.x2 - line.x1) / Math.max(1, len);
    const dirY = (line.y2 - line.y1) / Math.max(1, len);
    const normalX = -dirY;
    const normalY = dirX;

    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const cx = line.x1 + (line.x2 - line.x1) * t;
      const cy = line.y1 + (line.y2 - line.y1) * t;

      addTreeAt(scene, cx + normalX * offset, cy + normalY * offset, `tree-${treeIndex++}`, levelData);
      addTreeAt(scene, cx - normalX * offset, cy - normalY * offset, `tree-${treeIndex++}`, levelData);
    }
  });

  const intersections: [number, number][] = levelData.levelId === 1 ? [260,900,1540].flatMap(x => [260,900,1540].map(y => [x,y] as [number,number])) : [];
  intersections.forEach(([ix, iy]) => {
    const candidates = [[110, 110], [-110, 110], [110, -110], [-110, -110]];
    const spot = candidates.find(([dx, dy]) => !isOnRoad(ix + dx, iy + dy, levelData, 18));
    if (spot) {
      const light = buildStreetLightMesh();
      light.position.set(ix + spot[0], 0, iy + spot[1]);
      scene.add(light);
    }
  });

  for (let i = 0; i < 30; i++) {
    const x = 100 + Math.random() * (levelData.mapWidth - 200);
    const y = 100 + Math.random() * (levelData.mapHeight - 200);
    if (!isOnRoad(x, y, levelData, 14) && !levelData.obstacles.some(o => Math.abs(o.x-x)<o.width/2+18 && Math.abs(o.y-y)<o.height/2+18)) {
      const bush = buildBushMesh(`bush-${i}`);
      bush.position.set(x, 0, y);
      const s = 0.5 + Math.random() * 0.5;
      bush.scale.set(s, s, s);
      scene.add(bush);
    }
  }

  const mainRoads = levelData.roadSurfaces.filter(rs => rs.color === '#3a3a3e');
  mainRoads.forEach((rs) => {
    if (rs.width > rs.height) {
      const count = Math.floor(rs.width / 300);
      for (let i = 0; i < count; i++) {
        const x = rs.x - rs.width / 2 + (i + 0.5) * 300;
        const candidateYs = [rs.y + rs.height / 2 + 34, rs.y - rs.height / 2 - 34];
        const y = candidateYs.find(candidateY => !isOnRoad(x, candidateY, levelData, 16));
        if (y !== undefined) {
          const pole = buildPowerPoleMesh();
          pole.position.set(x, 0, y);
          scene.add(pole);
        }
      }
    }
  });
}

function addTreeAt(scene: THREE.Scene, x: number, y: number, seed: string, levelData: LevelData) {
  // Check against every (also rotated/overlapping) road segment. This avoids
  // trees appearing in medians, junction centres or on curved road entries.
  if (isOnRoad(x, y, levelData, 18)) return;
  const tree = buildTreeMesh(seed);
  tree.position.set(x, 0, y);
  const s = 0.8 + Math.random() * 0.4;
  tree.scale.set(s, s, s);
  tree.rotation.y = Math.random() * Math.PI * 2;
  scene.add(tree);
}

function isOnRoad(x: number, y: number, levelData: LevelData, clearance = 5): boolean {
  for (const rs of levelData.roadSurfaces || []) {
    const dx = x - rs.x;
    const dy = y - rs.y;
    const cos = Math.cos(-rs.rotation);
    const sin = Math.sin(-rs.rotation);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    const halfW = rs.width / 2 + clearance;
    const halfH = rs.height / 2 + clearance;
    if (Math.abs(localX) < halfW && Math.abs(localY) < halfH) return true;
  }
  const distanceToSegment = (a: Vector2, b: Vector2) => {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const denominator = abx * abx + aby * aby;
    const t = denominator > 0 ? Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / denominator)) : 0;
    return Math.hypot(x - (a.x + abx * t), y - (a.y + aby * t));
  };
  for (const curved of levelData.curvedRoads || []) {
    const count = curved.closed ? curved.points.length : curved.points.length - 1;
    for (let i = 0; i < count; i++) {
      if (distanceToSegment(curved.points[i], curved.points[(i + 1) % curved.points.length]) <= curved.width / 2 + clearance) return true;
    }
  }
  return false;
}
