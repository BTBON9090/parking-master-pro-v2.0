import { CarConfig, CarType, LevelData, Obstacle, ParkingSpot, Marking, Vector2 } from './types';

// Physics Constants
export const DRAG = 0.9995; 
export const FRICTION = 0.9998; 
export const BRAKING_FORCE = 0.05; 
export const HANDBRAKE_FORCE = 0.15;
export const MAX_STEER_ANGLE = Math.PI / 4; 
export const STEERING_WHEEL_MAX_ROTATION = 540; 

// Gear Ratios 
export const GEAR_MAX_SPEEDS = {
  '-1': 0.2, 
  '0': 0, 
  '1': 0.35, 
  '2': 0.8, 
  '3': 2.4, 
  '4': 5.5, 
  '5': 8.5  
};

// Dimensions
export const CAR_MODELS: Record<CarType, CarConfig> = {
  [CarType.SEDAN]: {
    id: CarType.SEDAN,
    name: "家用轿车",
    price: 0,
    color: '#2563eb',
    width: 19,
    length: 47,
    maxSpeed: 8.5,
    acceleration: 0.04, 
    turnSpeed: 0.03,
    wheelbase: 28,
  },
  [CarType.SUV]: {
    id: CarType.SUV,
    name: "城市越野",
    price: 500,
    color: '#047857', 
    width: 24, 
    length: 49,
    maxSpeed: 7.5,
    acceleration: 0.035,
    turnSpeed: 0.025,
    wheelbase: 30,
  },
  [CarType.SPORTS]: {
    id: CarType.SPORTS,
    name: "超级跑车",
    price: 1500,
    color: '#b91c1c',
    width: 20,
    length: 46,
    maxSpeed: 9.5,
    acceleration: 0.06, 
    turnSpeed: 0.035,
    wheelbase: 27,
  },
  [CarType.TRUCK]: {
    id: CarType.TRUCK,
    name: "重型货车", 
    price: 800,
    color: '#d97706', 
    width: 26, 
    length: 76, 
    maxSpeed: 5.5, 
    acceleration: 0.02, 
    turnSpeed: 0.015, 
    wheelbase: 48, 
  }
};

export const TRANSLATIONS = {
  CN: {
    title: "停车模拟大师 Pro v2.0",
    start: "进入游戏",
    settings: "游戏设置",
    resume: "继续游戏",
    exit: "返回主菜单",
    reset: "重置本关",
    sound: "音效",
    volume: "音量",
    weather: "天气效果",
    autoSignal: "自动转向灯",
    ghostWheel: "车轮透视",
    turnAssist: "转弯辅助线",
    sensitivity: "转向灵敏度",
    gear: "挡位",
    brake: "刹车",
    gas: "油门",
    money: "资金",
    level: "关卡",
    lights: "车灯",
    selectLevel: "选择关卡",
    levels: {
        1: "第一关：城市挑战",
        2: "第二关：地下车库",
        3: "第三关：困境脱出"
    },
    controls: {
      wheel: "[鼠标滚轮 / 触控板] 左右转向",
      gearUp: "[D] 加挡",
      gearDown: "[A] 减挡",
      reverse: "[Q] 倒挡",
      brake: "[E] 刹车",
      park: "[P] 驻车",
      gas: "[W] 油门 / [Shift+W] 慢速",
      engine: "[O] 启动/熄火",
      handbrake: "[空格] 手刹",
      lights: "[L] 车灯开关"
    },
    initialSetup: "初始设置",
    vehicle: "选择车辆",
    parking: {
      perfect: "完美逃脱! +$200",
      good: "逃脱成功 +$100",
      reverse: "方向停反 -$20",
      line: "压线违规 -$30",
      fail: "未停入车位"
    }
  },
  EN: {
    title: "Parking Master Pro v2.0",
    start: "Enter Game",
    settings: "Settings",
    resume: "Resume",
    exit: "Main Menu",
    reset: "Reset Level",
    sound: "Sound Effects",
    volume: "Volume",
    weather: "Weather",
    autoSignal: "Auto Turn Signal",
    ghostWheel: "Ghost Wheels",
    turnAssist: "Turn Assist",
    sensitivity: "Steering Sensitivity",
    gear: "GEAR",
    brake: "BRAKE",
    gas: "GAS",
    money: "Credits",
    level: "Level",
    lights: "Lights",
    selectLevel: "Select Level",
    levels: {
        1: "Level 1: Urban Challenge",
        2: "Level 2: Underground",
        3: "Level 3: The Escape"
    },
    controls: {
      wheel: "[Scroll / Trackpad] Steer L/R",
      gearUp: "[D] Gear Up",
      gearDown: "[A] Gear Down",
      reverse: "[Q] Reverse",
      brake: "[E] Brake",
      park: "[P] Park",
      gas: "[W] Gas / [Shift+W] Creep",
      engine: "[O] Start/Stop",
      handbrake: "[Space] Handbrake",
      lights: "[L] Lights Toggle"
    },
    initialSetup: "Initial Setup",
    vehicle: "Select Vehicle",
    parking: {
      perfect: "ESCAPED! +$200",
      good: "Escaped +$100",
      reverse: "Wrong Way -$20",
      line: "On Line Penalty -$30",
      fail: "Not in spot"
    }
  }
};

export const LEVEL_LIST = [
    { id: 1, name: "Urban Challenge", desc: "Complex city streets with traffic." },
    { id: 2, name: "Underground", desc: "Tight pillars and dark corners.", locked: false },
    { id: 3, name: "The Escape", desc: "Trapped in a maze of cars. Get out!", locked: false }
];

// --- MAP GENERATION HELPERS ---

const createWall = (x: number, y: number, w: number, h: number): Obstacle => ({
  id: `wall-${Math.random()}`,
  x, y, width: w, height: h, rotation: 0, type: 'wall', movable: false, weight: 0, color: '#374151' 
});

const createStaticCar = (x: number, y: number, rotation: number, color: string = '#4b5563'): Obstacle => ({
  id: `obs-car-${Math.random()}`,
  x, y, width: 20, height: 47, rotation, type: 'car', movable: true, weight: 80, color
});

// Traffic AI Creator
const createTrafficCar = (path: Vector2[], speed: number, startOffsetRatio: number = 0): Obstacle => {
    const startIndex = Math.floor((path.length - 1) * startOffsetRatio);
    const startPos = path[startIndex];
    // Calculate initial rotation based on path
    const nextPos = path[Math.min(startIndex + 1, path.length - 1)];
    const rotation = Math.atan2(nextPos.y - startPos.y, nextPos.x - startPos.x);
    
    const baseColors = ['#f87171', '#60a5fa', '#fbbf24', '#a3a3a3'];
    const color = baseColors[Math.floor(Math.random() * baseColors.length)];

    return {
        id: `traffic-${Math.random()}`,
        x: startPos.x, 
        y: startPos.y,
        width: 19, 
        height: 47,
        rotation,
        type: 'car',
        movable: true,
        weight: 100,
        color,
        ai: {
            path: path,
            currentPathIndex: startIndex,
            speed: speed,
            maxSpeed: speed,
            state: 'drive'
        }
    };
};

// Helper for randomizing vehicles
const createRandomStaticCar = (x: number, y: number, rotation: number, excludeTrucks: boolean = false): Obstacle => {
    // Pick random car type
    const types = [CarType.SEDAN, CarType.SUV, CarType.SPORTS, CarType.TRUCK];
    const availableTypes = excludeTrucks ? types.filter(t => t !== CarType.TRUCK) : types;
    
    const type = availableTypes[Math.floor(Math.random() * availableTypes.length)];
    const config = CAR_MODELS[type];

    const baseColors = ['#4b5563', '#1f2937', '#374151', '#9ca3af', '#f3f4f6', '#000000', '#ffffff'];
    const color = baseColors[Math.floor(Math.random() * baseColors.length)];

    return {
        id: `obs-car-${Math.random()}`,
        x, y, 
        width: config.width, 
        height: config.length, 
        rotation, 
        type: 'car', 
        movable: true, 
        weight: type === CarType.TRUCK ? 150 : 80, 
        color
    };
};

const createCone = (x: number, y: number): Obstacle => ({
  id: `cone-${Math.random()}`,
  x, y, width: 6, height: 6, rotation: 0, type: 'cone', movable: true, weight: 2, color: '#f97316'
});

const createBox = (x: number, y: number): Obstacle => ({
    id: `box-${Math.random()}`,
    x, y, width: 15, height: 15, rotation: Math.random(), type: 'box', movable: true, weight: 5, color: '#8d6e63'
});

const createBarrier = (x: number, y: number, rotation: number): Obstacle => ({
    id: `barrier-${Math.random()}`,
    x, y, width: 40, height: 8, rotation, type: 'wall', movable: true, weight: 40, color: '#ef4444'
});

// Rich City Map Generator
export const GENERATE_LEVEL = (level: number): LevelData => {
  const spots: ParkingSpot[] = [];
  const obstacles: Obstacle[] = [];
  const markings: Marking[] = [];
  let startPos = { x: 800, y: 1200, rotation: -Math.PI/2 };
  let mapSizeW = 2000;
  let mapSizeH = 2000;

  const SPOT_W = 54; // Length of the spot (car length is ~47)
  const SPOT_H = 26; // Width of the spot (car width is ~20)

  if (level === 1) {
      // Compact Urban Map 1600x1400
      mapSizeW = 1600;
      mapSizeH = 1400;

      // 1. BOUNDARIES
      obstacles.push(createWall(mapSizeW/2, -20, mapSizeW + 40, 40)); 
      obstacles.push(createWall(mapSizeW/2, mapSizeH + 20, mapSizeW + 40, 40));
      obstacles.push(createWall(-20, mapSizeH/2, 40, mapSizeH + 40));
      obstacles.push(createWall(mapSizeW + 20, mapSizeH/2, 40, mapSizeH + 40));

      // 2. MAIN ROADS (Loop)
      // Horizontal Road Bottom: y = 1100
      // Horizontal Road Top: y = 300
      // Vertical Road Left: x = 400
      // Vertical Road Right: x = 1200
      
      const roadWidth = 100;
      
      // -- DRAW MARKINGS FOR ROADS --
      // Bottom Road
      markings.push({ type: 'line-solid', x: mapSizeW/2, y: 1100, width: mapSizeW, height: 2, rotation: 0, color: '#f59e0b' });
      markings.push({ type: 'line-dashed', x: mapSizeW/2, y: 1100 - roadWidth/4, width: mapSizeW, height: 2, rotation: 0, color: '#fff' });
      markings.push({ type: 'line-dashed', x: mapSizeW/2, y: 1100 + roadWidth/4, width: mapSizeW, height: 2, rotation: 0, color: '#fff' });

      // Top Road
      markings.push({ type: 'line-solid', x: mapSizeW/2, y: 300, width: mapSizeW, height: 2, rotation: 0, color: '#f59e0b' });
      markings.push({ type: 'line-dashed', x: mapSizeW/2, y: 300 - roadWidth/4, width: mapSizeW, height: 2, rotation: 0, color: '#fff' });
      markings.push({ type: 'line-dashed', x: mapSizeW/2, y: 300 + roadWidth/4, width: mapSizeW, height: 2, rotation: 0, color: '#fff' });

      // Left Road
      markings.push({ type: 'line-solid', x: 400, y: mapSizeH/2, width: 2, height: mapSizeH, rotation: 0, color: '#f59e0b' });
      markings.push({ type: 'line-dashed', x: 400 - roadWidth/4, y: mapSizeH/2, width: 2, height: mapSizeH, rotation: 0, color: '#fff' });
      markings.push({ type: 'line-dashed', x: 400 + roadWidth/4, y: mapSizeH/2, width: 2, height: mapSizeH, rotation: 0, color: '#fff' });

      // Right Road
      markings.push({ type: 'line-solid', x: 1200, y: mapSizeH/2, width: 2, height: mapSizeH, rotation: 0, color: '#f59e0b' });
      markings.push({ type: 'line-dashed', x: 1200 - roadWidth/4, y: mapSizeH/2, width: 2, height: mapSizeH, rotation: 0, color: '#fff' });
      markings.push({ type: 'line-dashed', x: 1200 + roadWidth/4, y: mapSizeH/2, width: 2, height: mapSizeH, rotation: 0, color: '#fff' });


      // 3. TRAFFIC
      // Outer Loop: CW
      const trafficPath1 = [
          {x: 350, y: 1300}, {x: 350, y: 350}, {x: 1250, y: 350}, {x: 1250, y: 1050}, {x: 350, y: 1050}, {x: 350, y: 1300}
      ];
      // Inner Loop: CCW
      const trafficPath2 = [
          {x: 450, y: 250}, {x: 450, y: 1150}, {x: 1150, y: 1150}, {x: 1150, y: 250}, {x: 450, y: 250}
      ];

      obstacles.push(createTrafficCar(trafficPath1, 3.5, 0.0));
      obstacles.push(createTrafficCar(trafficPath1, 3.8, 0.5));
      obstacles.push(createTrafficCar(trafficPath2, 3.0, 0.25));
      obstacles.push(createTrafficCar(trafficPath2, 3.2, 0.75));


      // 4. CENTRAL PLAZA (Between x=400-1200, y=300-1100)
      // Dense Parking Area
      
      const plazaX = 800;
      const plazaY = 700;
      
      // Central Island
      obstacles.push(createWall(plazaX, plazaY, 300, 200)); // Main building in center
      
      // Top Parking Row (Angled)
      const topRowY = 500;
      for (let i = -4; i <= 4; i++) {
          const x = plazaX + i * 60;
          if (i === 0) continue; // Gap for entrance
          
          if (i === 2) {
               spots.push({ id: `spot-center-top-${i}`, x, y: topRowY, width: SPOT_W, height: SPOT_H, rotation: -Math.PI/3, occupied: false }); // 60 deg
          } else {
               obstacles.push(createRandomStaticCar(x, topRowY, -Math.PI/3));
          }
      }

      // Bottom Parking Row (Perpendicular)
      const botRowY = 900;
      for (let i = -5; i <= 5; i++) {
          const x = plazaX + i * 40;
          const isSpot = i === -2 || i === 3;
          if (isSpot) {
              spots.push({ id: `spot-center-bot-${i}`, x, y: botRowY, width: SPOT_W, height: SPOT_H, rotation: -Math.PI/2, occupied: false });
          } else {
              if (Math.random() > 0.3) obstacles.push(createRandomStaticCar(x, botRowY, -Math.PI/2));
          }
          // Lines
          markings.push({ type: 'line-solid', x: x - 20, y: botRowY, width: 2, height: SPOT_W, rotation: 0, color: '#fff' });
      }

      // 5. THE GAUNTLET (Left Side: x < 400)
      // Narrow alley with boxes
      obstacles.push(createWall(200, 700, 20, 800)); // Divider wall
      
      // Entrance at top
      obstacles.push(createBox(300, 400));
      obstacles.push(createBox(100, 450));
      obstacles.push(createBox(250, 600));
      
      // Garage spot at bottom left
      obstacles.push(createWall(100, 1000, 180, 20)); // Back wall
      obstacles.push(createWall(10, 950, 20, 100)); // Side
      obstacles.push(createWall(190, 950, 20, 100)); // Side
      spots.push({ id: 'spot-garage', x: 100, y: 950, width: SPOT_W, height: SPOT_H, rotation: -Math.PI/2, occupied: false });
      
      // 6. DOWNTOWN STRIP (Bottom Road: y > 1100)
      // Parallel parking *between* main road and wall
      const stripY = 1250;
      const stripStartX = 600;
      markings.push({ type: 'line-solid', x: 800, y: 1200, width: 1600, height: 4, rotation: 0, color: '#fff' }); // Curb

      for (let i = 0; i < 8; i++) {
          const x = stripStartX + i * (SPOT_H * 2.5); // Spread out
          const isSpot = i === 1 || i === 5;
          
          if (isSpot) {
              spots.push({ id: `spot-parallel-${i}`, x, y: stripY, width: SPOT_W, height: SPOT_H, rotation: 0, occupied: false });
              // Corner markers for parallel spot
              markings.push({ type: 'line-dashed', x: x - SPOT_W/2, y: stripY - SPOT_H/2, width: 10, height: 2, rotation: 0, color: '#fff' });
              markings.push({ type: 'line-dashed', x: x - SPOT_W/2, y: stripY + SPOT_H/2, width: 10, height: 2, rotation: 0, color: '#fff' });
              markings.push({ type: 'line-dashed', x: x + SPOT_W/2, y: stripY - SPOT_H/2, width: 10, height: 2, rotation: 0, color: '#fff' });
              markings.push({ type: 'line-dashed', x: x + SPOT_W/2, y: stripY + SPOT_H/2, width: 10, height: 2, rotation: 0, color: '#fff' });
          } else {
              obstacles.push(createRandomStaticCar(x, stripY, 0));
          }
      }

      // 7. CONSTRUCTION ZONE (Top Right)
      const conX = 1400;
      const conY = 200;
      obstacles.push(createBarrier(conX, conY + 100, 0));
      obstacles.push(createBarrier(conX - 100, conY, Math.PI/2));
      obstacles.push(createCone(conX - 50, conY + 50));
      obstacles.push(createCone(conX + 50, conY + 50));
      
      spots.push({ id: 'spot-construction', x: conX, y: conY, width: SPOT_W, height: SPOT_H, rotation: Math.PI/4, occupied: false });

      // Start Position
      startPos = { x: 800, y: 1320, rotation: 0 }; // Start on bottom road facing right

  } else if (level === 2) {
      // Level 2: Underground (Keep existing but condensed slightly if needed, currently reusing logic)
      const centerX = 500;
      const centerY = 500;
      obstacles.push(createWall(centerX, 100, 800, 40)); 
      obstacles.push(createWall(centerX, 900, 800, 40)); 
      obstacles.push(createWall(100, centerY, 40, 800)); 
      obstacles.push(createWall(900, centerY, 40, 800)); 

      // Traffic Loop
      const loopPath = [
          {x: 200, y: 200}, {x: 800, y: 200}, 
          {x: 800, y: 800}, {x: 200, y: 800},
          {x: 200, y: 200}
      ];
      // Add some moving cars in the perimeter
      obstacles.push(createTrafficCar(loopPath, 3.5, 0.0));
      obstacles.push(createTrafficCar(loopPath, 3.5, 0.5));


      const AISLE_CENTER_X = 500;
      markings.push({ type: 'arrow-straight', x: AISLE_CENTER_X, y: 300, width: 0, height: 0, rotation: Math.PI/2, color: '#fff' });
      markings.push({ type: 'arrow-straight', x: AISLE_CENTER_X, y: 700, width: 0, height: 0, rotation: -Math.PI/2, color: '#fff' });

      const SPOT_DEPTH = 54; 
      const SPOT_VERTICAL_SPACING = 32; 
      const AISLE_GAP = 36;
      const LEFT_ROW_X = AISLE_CENTER_X - (AISLE_GAP / 2) - (SPOT_DEPTH / 2);
      const RIGHT_ROW_X = AISLE_CENTER_X + (AISLE_GAP / 2) + (SPOT_DEPTH / 2);

      const SPOT_COUNT = 12;
      const START_Y = 300;

      for(let i=0; i<SPOT_COUNT; i++) {
          const y = START_Y + i * SPOT_VERTICAL_SPACING;
          const lineY = y - SPOT_VERTICAL_SPACING/2;
          markings.push({ type: 'line-solid', x: LEFT_ROW_X, y: lineY, width: SPOT_DEPTH, height: 2, rotation: 0, color: '#fff' });
          markings.push({ type: 'line-solid', x: LEFT_ROW_X - SPOT_DEPTH/2, y: y, width: 2, height: SPOT_VERTICAL_SPACING, rotation: 0, color: '#e5e7eb' });

          const isSpot = i < 2; 
          if (isSpot) {
             spots.push({ id: `spot-L2-L-${i}`, x: LEFT_ROW_X, y: y, width: SPOT_DEPTH, height: 30, rotation: 0, occupied: false });
          } else {
             if (i % 2 !== 0) {
                // Ensure no trucks in Level 2 tight aisle
                obstacles.push(createRandomStaticCar(LEFT_ROW_X, y, 0, true));
             }
          }
          if (i === SPOT_COUNT - 1) {
             markings.push({ type: 'line-solid', x: LEFT_ROW_X, y: y + SPOT_VERTICAL_SPACING/2, width: SPOT_DEPTH, height: 2, rotation: 0, color: '#fff' });
          }
      }

      for(let i=0; i<SPOT_COUNT; i++) {
          const y = START_Y + i * SPOT_VERTICAL_SPACING;
          const lineY = y - SPOT_VERTICAL_SPACING/2;
          markings.push({ type: 'line-solid', x: RIGHT_ROW_X, y: lineY, width: SPOT_DEPTH, height: 2, rotation: 0, color: '#fff' });
          markings.push({ type: 'line-solid', x: RIGHT_ROW_X + SPOT_DEPTH/2, y: y, width: 2, height: SPOT_VERTICAL_SPACING, rotation: 0, color: '#e5e7eb' });

          if (i === 6) {
              spots.push({ id: `spot-L2-TARGET`, x: RIGHT_ROW_X, y: y, width: SPOT_DEPTH, height: 30, rotation: Math.PI, occupied: false });
              markings.push({ type: 'line-solid', x: RIGHT_ROW_X, y: y, width: SPOT_DEPTH - 4, height: 26, rotation: 0, color: 'rgba(16, 185, 129, 0.2)' }); 
          } else {
              if (i !== 2 && i !== 8) {
                 obstacles.push(createRandomStaticCar(RIGHT_ROW_X, y, Math.PI, true));
              }
          }
          if (i === SPOT_COUNT - 1) {
             markings.push({ type: 'line-solid', x: RIGHT_ROW_X, y: y + SPOT_VERTICAL_SPACING/2, width: SPOT_DEPTH, height: 2, rotation: 0, color: '#fff' });
          }
      }
      startPos = { x: 500, y: 800, rotation: -Math.PI/2 };
  } else if (level === 3) {
      // Level 3: The Escape (Redesigned based on Photo)
      // Features: Diagonal Parking, Green Zones, Tight Blocking Truck
      mapSizeW = 800;
      mapSizeH = 800;
      
      const cx = 400;
      const cy = 400;
      
      // Boundaries
      obstacles.push(createWall(cx, -20, 840, 40)); 
      obstacles.push(createWall(cx, 820, 840, 40)); 
      obstacles.push(createWall(-20, cy, 40, 840)); 
      obstacles.push(createWall(820, cy, 40, 840));

      // Player Start Angle: -45 degrees (Top-Right facing)
      const pAngle = -Math.PI / 4;
      
      // Start Position (Centered)
      startPos = { x: 400, y: 400, rotation: pAngle };

      // --- VISUALS: GREEN PARKING ZONES (Simulated with markings) ---
      // Player Spot
      markings.push({ type: 'line-solid', x: 400, y: 400, width: 24, height: 50, rotation: pAngle, color: 'rgba(16, 185, 129, 0.3)' });
      // Left Spot
      markings.push({ type: 'line-solid', x: 375, y: 425, width: 24, height: 50, rotation: pAngle, color: 'rgba(16, 185, 129, 0.3)' });
      // Right Spot
      markings.push({ type: 'line-solid', x: 425, y: 375, width: 24, height: 50, rotation: pAngle, color: 'rgba(16, 185, 129, 0.3)' });
      
      // --- OBSTACLES ---

      // 1. Left Neighbor (White Car, Tight)
      // Offset perpendicular to car (-135 deg) by ~25px
      const leftOffX = Math.cos(pAngle - Math.PI/2) * 26;
      const leftOffY = Math.sin(pAngle - Math.PI/2) * 26;
      obstacles.push(createStaticCar(400 + leftOffX, 400 + leftOffY, pAngle, '#f3f4f6'));

      // 2. Right Neighbor (White Car, Tight)
      // Offset perpendicular (+90 deg)
      const rightOffX = Math.cos(pAngle + Math.PI/2) * 26;
      const rightOffY = Math.sin(pAngle + Math.PI/2) * 26;
      obstacles.push(createStaticCar(400 + rightOffX, 400 + rightOffY, pAngle, '#f3f4f6'));

      // 3. Front Blocker (Double Parked White Car)
      // In front of player, perpendicular to lane?
      // Based on photo, the car in front is blocking the exit path
      // Let's place it 60px ahead, rotated 90 deg relative to player
      const frontDist = 65;
      const frontX = 400 + Math.cos(pAngle) * frontDist;
      const frontY = 400 + Math.sin(pAngle) * frontDist;
      obstacles.push(createStaticCar(frontX, frontY, pAngle + Math.PI/2, '#e5e7eb'));

      // 4. The TRUCK (Blocking Rear/Side escape) - "顶着这个斜停的这个货车"
      // Positioned behind-right, creating a constraint for reversing
      // FIX: Increased distance from 70 to 110 to prevent overlap with Right Neighbor
      const truckDist = 110; 
      const truckAngle = pAngle + Math.PI; // Behind
      const truckX = 400 + Math.cos(truckAngle) * truckDist + 20; // Slightly offset
      const truckY = 400 + Math.sin(truckAngle) * truckDist - 10;
      const truckObs = createStaticCar(truckX, truckY, pAngle + Math.PI/8, '#d97706'); // Slightly skewed
      truckObs.width = 26; // Wider
      truckObs.height = 80; // Longer
      truckObs.color = '#fef3c7'; // Cream/White Truck
      // Make it look like a truck bed
      truckObs.type = 'car'; // Use car renderer for details
      // Override car type to TRUCK for visuals if possible, but createStaticCar sets generic params
      // We manually adjust dimensions, renderer handles 'isTruck' based on length > 60
      obstacles.push(truckObs);

      // 5. Other cars to form the "Lot"
      obstacles.push(createStaticCar(250, 250, 0, '#1f2937'));
      obstacles.push(createStaticCar(550, 550, -Math.PI/2, '#4b5563'));
      
      // 6. Lane definition
      // Lane is diagonal, from bottom-left to top-right
      markings.push({ type: 'arrow-straight', x: 320, y: 320, width: 0, height: 0, rotation: pAngle, color: '#ffffffaa' });
      markings.push({ type: 'arrow-straight', x: 480, y: 480, width: 0, height: 0, rotation: pAngle, color: '#ffffffaa' });

      // 7. EXIT
      const exitX = 650;
      const exitY = 150;
      spots.push({ id: 'spot-escape', x: exitX, y: exitY, width: SPOT_W, height: SPOT_H, rotation: 0, occupied: false });
      markings.push({ type: 'line-solid', x: exitX, y: exitY, width: SPOT_W + 10, height: SPOT_H + 10, rotation: 0, color: 'rgba(0, 255, 0, 0.4)' }); // Goal highlight

      // Scattered barriers
      obstacles.push(createBarrier(600, 300, Math.PI/4));
      obstacles.push(createCone(500, 200));
      obstacles.push(createCone(550, 180));

  }
  return { levelId: level, mapWidth: mapSizeW, mapHeight: mapSizeH, spots, obstacles, markings, startPos };
};