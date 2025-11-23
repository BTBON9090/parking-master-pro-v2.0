export enum CarType {
  SEDAN = 'SEDAN',
  SUV = 'SUV',
  SPORTS = 'SPORTS',
  TRUCK = 'TRUCK'
}

export enum WeatherType {
  SUNNY = 'SUNNY',
  RAINY = 'RAINY',
  SNOWY = 'SNOWY',
  FOGGY = 'FOGGY'
}

export enum DayTime {
  DAY = 'DAY',
  NIGHT = 'NIGHT'
}

export enum Language {
  CN = 'CN',
  EN = 'EN'
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // In radians
}

export interface CarConfig {
  id: CarType;
  name: string;
  price: number;
  color: string;
  width: number;
  length: number;
  maxSpeed: number;
  acceleration: number;
  turnSpeed: number;
  wheelbase: number;
}

export interface AiConfig {
    path: Vector2[];
    currentPathIndex: number;
    speed: number;
    maxSpeed: number;
    state: 'drive' | 'brake' | 'stop';
    lastLaneChange?: number;
}

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  type: 'wall' | 'car' | 'cone' | 'pedestrian' | 'box';
  movable: boolean;
  weight: number; // 0 = immovable, higher = harder to push
  color: string;
  ai?: AiConfig; // NEW: If present, this obstacle is an AI agent
}

export interface ParkingSpot {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  occupied: boolean;
}

export interface Marking {
  type: 'line-solid' | 'line-dashed' | 'arrow-straight' | 'arrow-turn' | 'zebra' | 'stop';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
}

export interface LevelData {
  levelId: number;
  mapWidth: number;
  mapHeight: number;
  spots: ParkingSpot[];
  obstacles: Obstacle[];
  markings: Marking[];
  startPos: { x: number; y: number; rotation: number };
}

export interface UserSettings {
  soundEnabled: boolean;
  volume: number; // 0.0 to 1.0
  wheelGhost: boolean; // See through wheels
  autoTurnSignal: boolean;
  weatherEnabled: boolean;
  steeringSensitivity: number; // 1.0 to 5.0
  pedalSensitivity: number;
  turnAssist: boolean; // NEW: Trajectory prediction
  orientation: 'landscape' | 'portrait'; // NEW: Mobile orientation
}

export interface InputState {
  throttle: number; // 0 to 1 (From Mobile Slider)
  gasPressed: boolean; // From Keyboard W
  shiftPressed?: boolean; // Shift key for creeping
  brake: number; // 0 to 1
  steeringWheelAngle: number; // Degrees
  gear: number; // -1 = R, 0 = N, 1-5 = Forward
  handbrake: boolean;
  lights: boolean;
  engineStarted: boolean; 
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0 to 1
  size: number;
  color: string;
}

export interface SkidMark {
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  timestamp: number;
}

export type ParkingResultType = 'perfect' | 'good' | 'reverse' | 'line' | 'fail';