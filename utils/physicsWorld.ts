import * as CANNON from 'cannon-es';
import { Obstacle } from '../types';
import { gameSpeedToWorldVelocity, worldImpactToGameSpeed } from './powertrain';

/**
 * cannon-es 物理世界封装
 *
 * 设计思路：
 *   - 玩家车和交通车：保留自行车运动学模型计算速度/转向，
 *     将运动学结果施加到 cannon 刚体上（position + velocity），
 *     碰撞由 cannon 自动处理（弹开、翻滚）。
 *   - 可移动物体（锥桶/箱子）：完全由物理引擎控制。
 *   - 建筑/围墙：静态刚体。
 *   - 地面：无限平面。
 *
 * 坐标映射：2D (x, y) → 3D (x, 0, z=y)
 */

export class PhysicsWorld {
  world: CANNON.World;
  private groundBody: CANNON.Body;

  // 刚体映射
  private playerBody: CANNON.Body | null = null;
  private trafficBodies = new Map<string, CANNON.Body>();
  private movableBodies = new Map<string, CANNON.Body>();
  private staticBodies: CANNON.Body[] = [];

  // 碰撞回调
  onPlayerCollision: ((impactSpeed: number) => void) | null = null;

  constructor() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -30, 0);
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    (this.world.broadphase as CANNON.SAPBroadphase).autoDetectAxis();

    // 默认接触材质
    const defaultMat = this.world.defaultMaterial;
    const defaultContact = new CANNON.ContactMaterial(defaultMat, defaultMat, {
      friction: 0.4,
      restitution: 0.3,
    });
    this.world.defaultContactMaterial = defaultContact;

    // 车辆专用材质（低摩擦，方便滑动）
    const carMat = new CANNON.Material('car');
    const groundMat = new CANNON.Material('ground');
    const carGroundContact = new CANNON.ContactMaterial(carMat, groundMat, {
      friction: 0.35,
      restitution: 0.1,
    });
    this.world.addContactMaterial(carGroundContact);

    // 地面
    this.groundBody = new CANNON.Body({ mass: 0, material: groundMat });
    this.groundBody.addShape(new CANNON.Plane());
    this.groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(this.groundBody);
  }

  /**
   * 添加玩家车刚体
   */
  addPlayerCar(x: number, z: number, width: number, length: number, weight: number): CANNON.Body {
    const mass = Math.max(1, weight / 100);
    const body = new CANNON.Body({
      mass,
      shape: new CANNON.Box(new CANNON.Vec3(width / 2, 5, length / 2)),
      position: new CANNON.Vec3(x, 5, z),
      material: this.world.defaultMaterial,
      linearDamping: 0.5,
      angularDamping: 0.8,
    });
    // Vehicle/scenery contacts use the model footprint in the kinematic solver.
    // Cannon only couples the player to movable cones/boxes, avoiding duplicate
    // contacts from its coarse proxy box against walls and parked vehicles.
    body.collisionFilterMask = 2;
    body.fixedRotation = true;
    this.world.addBody(body);
    this.playerBody = body;

    // 碰撞监听
    body.addEventListener('collide', (event: any) => {
      const contact = event.contact;
      // CANNON reports contact velocities in world units/second. Convert
      // back to game speed units (1 unit = 15 km/h) so crash thresholds and
      // sound/cost scaling keep their documented meaning.
      const impactSpeed = worldImpactToGameSpeed(Math.abs(contact.getImpactVelocityAlongNormal()));
      if (impactSpeed > 0.5 && this.onPlayerCollision) {
        this.onPlayerCollision(impactSpeed);
      }
    });

    return body;
  }

  /**
   * 添加交通车刚体
   */
  addTrafficCar(id: string, x: number, z: number, width: number, length: number, weight: number): CANNON.Body {
    const mass = Math.max(1, weight / 100);
    const body = new CANNON.Body({
      mass,
      shape: new CANNON.Box(new CANNON.Vec3(width / 2, 5, length / 2)),
      position: new CANNON.Vec3(x, 5, z),
      linearDamping: 0.5,
      angularDamping: 0.8,
    });
    this.world.addBody(body);
    this.trafficBodies.set(id, body);
    return body;
  }

  /**
   * 添加可移动物体（锥桶/箱子）— 完全由物理控制
   */
  addMovableObstacle(obs: Obstacle): CANNON.Body {
    const mass = Math.max(0.5, obs.weight);
    let shape: CANNON.Shape;

    if (obs.type === 'cone') {
      shape = new CANNON.Cylinder(3, 4, 8, 8);
    } else {
      shape = new CANNON.Box(new CANNON.Vec3(obs.width / 2, obs.width / 2, obs.height / 2));
    }

    const body = new CANNON.Body({
      mass,
      shape,
      position: new CANNON.Vec3(obs.x, (obs.elevation || 0) + (obs.type === 'cone' ? 4 : obs.width / 2), obs.y),
      linearDamping: 0.3,
      angularDamping: 0.3,
    });

    body.collisionFilterGroup = 2;

    // 锥桶高弹性
    if (obs.type === 'cone') {
      body.material = new CANNON.Material('cone');
    }

    this.world.addBody(body);
    this.movableBodies.set(obs.id, body);
    return body;
  }

  /**
   * 添加静态障碍物（建筑/围墙）
   */
  addStaticObstacle(x: number, z: number, width: number, depth: number, height: number = 30, rotation = 0, elevation = 0) {
    const body = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2)),
      position: new CANNON.Vec3(x, elevation + height / 2, z),
    });
    body.quaternion.setFromEuler(0, rotation, 0);
    this.world.addBody(body);
    this.staticBodies.push(body);
  }

  /** Batch nearby immutable wall boxes into static compound bodies. Shape
   * dimensions, rotations and elevations match addStaticObstacle exactly;
   * batching reduces broadphase bodies while retaining prop-wall contacts. */
  addStaticObstacles(obstacles: Obstacle[], cellSize = 800): void {
    const buckets = new Map<string, { x:number; z:number; items:Obstacle[] }>();
    for (const obs of obstacles) {
      const cx=Math.floor(obs.x/cellSize),cz=Math.floor(obs.y/cellSize),key=`${cx}:${cz}`;
      let bucket=buckets.get(key);
      if(!bucket){bucket={x:(cx+.5)*cellSize,z:(cz+.5)*cellSize,items:[]};buckets.set(key,bucket);}
      bucket.items.push(obs);
    }
    for(const {x,z,items} of buckets.values()){
      const body=new CANNON.Body({mass:0,position:new CANNON.Vec3(x,0,z)});
      for(const obs of items){
        const shape=new CANNON.Box(new CANNON.Vec3(obs.width/2,15,obs.height/2));
        const offset=new CANNON.Vec3(obs.x-x,(obs.elevation||0)+15,obs.y-z);
        const orientation=new CANNON.Quaternion();orientation.setFromEuler(0,obs.rotation,0);
        body.addShape(shape,offset,orientation);
      }
      this.world.addBody(body);this.staticBodies.push(body);
    }
  }

  /**
   * 添加地图边界墙
   */
  addBoundary(mapWidth: number, mapHeight: number) {
    const wallH = 20;
    const t = 5;
    // Level coordinates run from (0, 0) to (mapWidth, mapHeight), not around
    // the origin. The old centred bounds put two invisible walls through the
    // playable area on large maps.
    this.addStaticObstacle(0, mapHeight / 2, t, mapHeight, wallH);
    this.addStaticObstacle(mapWidth, mapHeight / 2, t, mapHeight, wallH);
    this.addStaticObstacle(mapWidth / 2, 0, mapWidth, t, wallH);
    this.addStaticObstacle(mapWidth / 2, mapHeight, mapWidth, t, wallH);
  }

  /**
   * 将 2D 运动学结果施加到玩家车刚体
   * @param x 2D x
   * @param z 2D y → 3D z
   * @param rotY 3D Y 轴旋转（已转换）
   * @param speed 当前速度
   * @param rotation 2D 旋转角度
   */
  updatePlayerKinematics(x: number, z: number, rotY: number, speed: number, rotation: number, roadHeight = 0) {
    if (!this.playerBody) return;
    // 位置
    this.playerBody.position.x = x;
    this.playerBody.position.z = z;
    // Follow the actual sampled road/bridge layer. A fixed y=5 let the
    // player hit ground props from the bridge and miss terrain props.
    this.playerBody.position.y = roadHeight + 5;
    // 旋转
    this.playerBody.quaternion.setFromEuler(0, rotY, 0);
    // 速度（水平面内）。运动学速度单位是 15 km/h；Cannon 世界使用
    // 10 units/m + 秒，因此必须换算成 world units/s，否则锥桶反应慢 42 倍。
    const worldSpeed = gameSpeedToWorldVelocity(speed);
    const vx = Math.cos(rotation) * worldSpeed;
    const vz = Math.sin(rotation) * worldSpeed;
    this.playerBody.velocity.x = vx;
    this.playerBody.velocity.z = vz;
    this.playerBody.velocity.y = 0;
    // 角速度清零（防止物理翻车，由运动学控制方向）
    this.playerBody.angularVelocity.set(0, 0, 0);
  }

  /**
   * 将交通车运动学结果施加到刚体
   */
  updateTrafficKinematics(id: string, x: number, z: number, rotY: number, speed: number, rotation: number, elevation=0, pushedMps?:{x:number;y:number}) {
    const body = this.trafficBodies.get(id);
    if (!body) return;
    body.position.x = x;
    body.position.z = z;
    body.position.y = 5+elevation;
    body.quaternion.setFromEuler(0, rotY, 0);
    const worldSpeed = gameSpeedToWorldVelocity(speed);
    const vx = pushedMps ? pushedMps.x*10 : Math.cos(rotation) * worldSpeed;
    const vz = pushedMps ? pushedMps.y*10 : Math.sin(rotation) * worldSpeed;
    body.velocity.x = vx;
    body.velocity.z = vz;
    body.velocity.y = 0;
    body.angularVelocity.set(0, 0, 0);
  }

  /** Keep a movable prop from falling through terrain/slope support. */
  enforceMovableFloor(id: string, floorCenterY: number): void {
    const body = this.movableBodies.get(id);
    if (!body) return;
    if (body.position.y < floorCenterY) {
      body.position.y = floorCenterY;
      if (body.velocity.y < 0) body.velocity.y = 0;
    }
  }

  /**
   * 从刚体读取可移动物体的位置/旋转
   */
  getMovableTransform(id: string): { x: number; y: number; z: number; rotY: number; rotation2d: number } | null {
    const body = this.movableBodies.get(id);
    if (!body) return null;
    const pos = body.position;
    const quat = body.quaternion;
    const euler = new CANNON.Vec3();
    quat.toEuler(euler);
    return {
      x: pos.x,
      y: pos.y,
      z: pos.z,
      rotY: euler.y,
      rotation2d: -euler.y + Math.PI / 2,
    };
  }

  /**
   * 步进物理世界
   */
  step(dtSeconds: number) {
    // Advance in real elapsed time. The old fixed 1/60 per *render* frame made
    // props run at double speed on a 120 Hz display and half speed at 30 Hz.
    const dt = Number.isFinite(dtSeconds) ? Math.max(0, Math.min(0.1, dtSeconds)) : 0;
    if (dt > 0) this.world.step(1 / 60, dt, 5);
  }

  /**
   * 清理所有刚体
   */
  dispose() {
    // removeBody mutates the array; iterating it directly skips every other body.
    this.world.bodies.slice().forEach(b => this.world.removeBody(b));
    this.playerBody = null;
    this.trafficBodies.clear();
    this.movableBodies.clear();
    this.staticBodies = [];
  }
}
