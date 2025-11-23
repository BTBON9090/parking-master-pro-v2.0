import React, { useEffect, useRef, useState } from 'react';
import { CarType, LevelData, Obstacle, UserSettings, WeatherType, DayTime, InputState, Marking, Particle, SkidMark, ParkingResultType, ParkingSpot, Vector2 } from '../types';
import { CAR_MODELS, DRAG, FRICTION, MAX_STEER_ANGLE, BRAKING_FORCE, HANDBRAKE_FORCE, STEERING_WHEEL_MAX_ROTATION, GEAR_MAX_SPEEDS } from '../constants';
import { checkCollision, getRectCorners } from '../utils/physics';

interface GameCanvasProps {
  levelData: LevelData;
  settings: UserSettings;
  currentCarId: CarType;
  weather: WeatherType;
  dayTime: DayTime;
  isMobile: boolean;
  inputRef: React.MutableRefObject<InputState>; 
  onParkingSuccess: (spotId: string, reward: number, type: ParkingResultType) => void;
  onCrash: (cost: number) => void;
  carSpeedRef: React.MutableRefObject<number>;
  isPaused: boolean;
  autoParkingTarget: ParkingSpot | null; 
  setAutoParkingTarget: (target: ParkingSpot | null) => void; 
  updateInput: (updater: (prev: InputState) => InputState) => void; 
}

// --- A* PATHFINDING HELPERS ---
const CELL_SIZE = 40; 

interface Node {
    x: number;
    y: number;
    g: number;
    h: number;
    f: number;
    parent: Node | null;
}

const createGrid = (width: number, height: number, obstacles: Obstacle[]) => {
    const cols = Math.ceil(width / CELL_SIZE);
    const rows = Math.ceil(height / CELL_SIZE);
    const grid: boolean[][] = Array(cols).fill(false).map(() => Array(rows).fill(false)); 

    obstacles.forEach(obs => {
        const margin = 35; 
        const minX = Math.floor((obs.x - obs.width/2 - margin) / CELL_SIZE);
        const maxX = Math.floor((obs.x + obs.width/2 + margin) / CELL_SIZE);
        const minY = Math.floor((obs.y - obs.height/2 - margin) / CELL_SIZE);
        const maxY = Math.floor((obs.y + obs.height/2 + margin) / CELL_SIZE);

        for (let i = Math.max(0, minX); i <= Math.min(cols - 1, maxX); i++) {
            for (let j = Math.max(0, minY); j <= Math.min(rows - 1, maxY); j++) {
                if (i >= 0 && i < cols && j >= 0 && j < rows) {
                    grid[i][j] = true; 
                }
            }
        }
    });
    return grid;
};

const findPath = (start: Vector2, end: Vector2, grid: boolean[][], mapW: number, mapH: number): Vector2[] => {
    const cols = grid.length;
    const rows = grid[0].length;
    
    const startNode: Node = { x: Math.floor(start.x / CELL_SIZE), y: Math.floor(start.y / CELL_SIZE), g: 0, h: 0, f: 0, parent: null };
    const endNode: Node = { x: Math.floor(end.x / CELL_SIZE), y: Math.floor(end.y / CELL_SIZE), g: 0, h: 0, f: 0, parent: null };

    if(startNode.x < 0 || startNode.x >= cols || startNode.y < 0 || startNode.y >= rows) return [];
    if(endNode.x < 0 || endNode.x >= cols || endNode.y < 0 || endNode.y >= rows) return [];

    let openList: Node[] = [startNode];
    let closedList: boolean[][] = Array(cols).fill(false).map(() => Array(rows).fill(false));

    let iterations = 0;
    while (openList.length > 0 && iterations < 3000) {
        iterations++;
        let lowInd = 0;
        for(let i=0; i<openList.length; i++) {
            if(openList[i].f < openList[lowInd].f) { lowInd = i; }
        }
        let currentNode = openList[lowInd];

        if(currentNode.x === endNode.x && currentNode.y === endNode.y) {
            let curr = currentNode;
            let ret = [];
            while(curr.parent) {
                ret.push({ x: curr.x * CELL_SIZE + CELL_SIZE/2, y: curr.y * CELL_SIZE + CELL_SIZE/2 });
                curr = curr.parent;
            }
            return ret.reverse();
        }

        openList.splice(lowInd, 1);
        closedList[currentNode.x][currentNode.y] = true;

        const neighbors = [
            {x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0}, 
            {x:-1, y:-1}, {x:1, y:-1}, {x:-1, y:1}, {x:1, y:1} 
        ];

        for(let i=0; i<neighbors.length; i++) {
            const adjX = currentNode.x + neighbors[i].x;
            const adjY = currentNode.y + neighbors[i].y;

            if(adjX >= 0 && adjX < cols && adjY >= 0 && adjY < rows) {
                if (grid[adjX][adjY] || closedList[adjX][adjY]) continue;

                const gScore = currentNode.g + Math.sqrt(neighbors[i].x**2 + neighbors[i].y**2);
                let gScoreIsBest = false;
                let neighbor = openList.find(n => n.x === adjX && n.y === adjY);

                if (!neighbor) {
                    gScoreIsBest = true;
                    neighbor = { x: adjX, y: adjY, g: gScore, h: 0, f: 0, parent: currentNode };
                    openList.push(neighbor);
                } else if (gScore < neighbor.g) {
                    gScoreIsBest = true;
                }

                if (gScoreIsBest && neighbor) {
                    neighbor.parent = currentNode;
                    neighbor.g = gScore;
                    neighbor.h = Math.abs(neighbor.x - endNode.x) + Math.abs(neighbor.y - endNode.y);
                    neighbor.f = neighbor.g + neighbor.h;
                }
            }
        }
    }
    return []; 
};


const GameCanvas: React.FC<GameCanvasProps> = React.memo(({
  levelData,
  settings,
  currentCarId,
  weather,
  dayTime,
  inputRef, 
  onParkingSuccess,
  onCrash,
  carSpeedRef,
  isPaused,
  autoParkingTarget,
  setAutoParkingTarget,
  updateInput
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const carState = useRef({
    x: levelData.startPos.x,
    y: levelData.startPos.y,
    rotation: levelData.startPos.rotation,
    speed: 0,
    steeringAngle: 0
  });
  
  const throttleState = useRef(0); 
  const obstaclesRef = useRef<Obstacle[]>(JSON.parse(JSON.stringify(levelData.obstacles)));
  const parkingStatusRef = useRef<Set<string>>(new Set());
  
  const particlesRef = useRef<Particle[]>([]);
  const skidMarksRef = useRef<SkidMark[]>([]);
  const lastTrackPosRef = useRef<{x: number, y: number} | null>(null); 
  const prevHandbrakeRef = useRef(true);

  // Auto Pilot State
  const pathRef = useRef<Vector2[]>([]);
  const approachPointRef = useRef<Vector2 | null>(null);
  const evasionStateRef = useRef<{active: boolean, direction: number, timer: number}>({active: false, direction: 0, timer: 0});

  const audioContextRef = useRef<AudioContext | null>(null);
  const engineNodesRef = useRef<{
    osc1: OscillatorNode,
    osc2: OscillatorNode,
    noise: AudioBufferSourceNode,
    gain: GainNode,
    filter: BiquadFilterNode
  } | null>(null);

  useEffect(() => {
    carState.current = { x: levelData.startPos.x, y: levelData.startPos.y, rotation: levelData.startPos.rotation, speed: 0, steeringAngle: 0 };
    throttleState.current = 0;
    obstaclesRef.current = JSON.parse(JSON.stringify(levelData.obstacles));
    parkingStatusRef.current.clear();
    carSpeedRef.current = 0;
    particlesRef.current = [];
    skidMarksRef.current = [];
    lastTrackPosRef.current = null;
    pathRef.current = [];
    approachPointRef.current = null;
    evasionStateRef.current = {active: false, direction: 0, timer: 0};
  }, [levelData, carSpeedRef]);

  useEffect(() => {
      if (autoParkingTarget) {
          const spot = autoParkingTarget;
          const offset = 160; 
          const cos = Math.cos(spot.rotation);
          const sin = Math.sin(spot.rotation);
          const approachX = spot.x + offset * cos;
          const approachY = spot.y + offset * sin;
          approachPointRef.current = { x: approachX, y: approachY };
          const grid = createGrid(levelData.mapWidth, levelData.mapHeight, obstaclesRef.current);
          const path = findPath({x: carState.current.x, y: carState.current.y}, {x: approachX, y: approachY}, grid, levelData.mapWidth, levelData.mapHeight);
          pathRef.current = path;
          evasionStateRef.current = {active: false, direction: 0, timer: 0};
      } else {
          pathRef.current = [];
          approachPointRef.current = null;
      }
  }, [autoParkingTarget, levelData]);

  useEffect(() => {
     const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
     const ctx = new AudioContext(); audioContextRef.current = ctx;
     const bufferSize = ctx.sampleRate * 2; const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
     const data = buffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) { data[i] = (Math.random() * 2 - 1) * 0.5; }
     const noise = ctx.createBufferSource(); noise.buffer = buffer; noise.loop = true;
     const osc1 = ctx.createOscillator(); osc1.type = 'sawtooth'; const osc2 = ctx.createOscillator(); osc2.type = 'sawtooth';
     const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 100; filter.Q.value = 1;
     const masterGain = ctx.createGain(); masterGain.gain.value = 0;
     osc1.connect(filter); osc2.connect(filter); noise.connect(filter); filter.connect(masterGain); masterGain.connect(ctx.destination);
     osc1.start(); osc2.start(); noise.start();
     engineNodesRef.current = { osc1, osc2, noise, gain: masterGain, filter };
     return () => { try { osc1.stop(); osc2.stop(); noise.stop(); } catch(e) {} if (ctx.state !== 'closed') { ctx.close(); } };
  }, []);

  const playCrashSound = (force: number) => {
      if (!settings.soundEnabled || !audioContextRef.current) return;
      const ctx = audioContextRef.current;
      if (ctx.state === 'closed') return;
      const intensity = Math.min(1, force / 8); 
      const bufferSize = ctx.sampleRate * 1.0; 
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          data[i] = (lastOut + (0.02 * white)) / 1.02;
          lastOut = data[i];
          data[i] *= 3.5; 
      }
      const noiseSrc = ctx.createBufferSource(); noiseSrc.buffer = buffer;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 800 + (intensity * 2000); 
      const gain = ctx.createGain(); gain.gain.setValueAtTime(intensity * settings.volume, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3 + (intensity * 0.5));
      noiseSrc.connect(filter); filter.connect(gain); gain.connect(ctx.destination); noiseSrc.start();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const carConfig = CAR_MODELS[currentCarId];

    const playSuccessSound = (isPenalty: boolean) => {
        if (!settings.soundEnabled || !audioContextRef.current) return;
        const ctx = audioContextRef.current;
        if (ctx.state === 'closed') return;
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        if (isPenalty) { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3); } 
        else { osc.type = 'sine'; osc.frequency.setValueAtTime(880, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1); }
        gain.gain.setValueAtTime(0.2 * settings.volume, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.5);
    };

    const drawDetailedCar = (ctx: CanvasRenderingContext2D, x: number, y: number, rotation: number, w: number, l: number, color: string, wheelAngle: number = 0, lights: boolean = false, brake: boolean = false, reverse: boolean = false) => {
         ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
         const wheelbase = l * 0.6; // Approx if not player car
         const frontWheelX = wheelbase / 2; const rearWheelX = -wheelbase / 2; 
         const wheelW = 10; const wheelH = 4;
         const isTruck = l > 60; 
         const isSUV = w > 22 && l < 60;
         const wheelOffset = (isSUV ? 2 : -2); const wheelY = (w / 2) + wheelOffset;
         const drawWheels = (fillColor: string, isGhost: boolean = false) => {
             ctx.fillStyle = fillColor; if (isGhost) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; }
             const drawSingleWheel = (wx: number, wy: number, angle: number) => {
                 ctx.save(); ctx.translate(wx, wy); ctx.rotate(angle); ctx.fillRect(-wheelW/2, -wheelH/2, wheelW, wheelH); 
                 if (isGhost) ctx.strokeRect(-wheelW/2, -wheelH/2, wheelW, wheelH);
                 ctx.restore();
             };
             drawSingleWheel(frontWheelX, wheelY, wheelAngle); drawSingleWheel(frontWheelX, -wheelY, wheelAngle);
             drawSingleWheel(rearWheelX, wheelY, 0); drawSingleWheel(rearWheelX, -wheelY, 0);
             if (isTruck) { const axle2X = rearWheelX - 14; drawSingleWheel(axle2X, wheelY, 0); drawSingleWheel(axle2X, -wheelY, 0); }
         };
         drawWheels('#111', false);
         ctx.fillStyle = color; 
         if (isTruck) {
             const cabL = l * 0.25; const bedLen = l * 0.70; const gap = l * 0.05; const frontX = l/2;
             ctx.fillRect(frontX - cabL, -w/2, cabL, w);
             ctx.fillStyle = '#78350f'; ctx.fillRect(-l/2, -w/2, bedLen, w);
             ctx.fillStyle = '#333'; ctx.fillRect(frontX - cabL - gap, -w/2 + 6, gap, w - 12);
             ctx.fillStyle = '#111827'; ctx.fillRect(frontX - cabL + 2, -w/2 + 2, cabL * 0.6, w - 4); 
         } else {
             ctx.beginPath(); if (isSUV) { ctx.roundRect(-l/2, -w/2, l, w, 2); } else { ctx.roundRect(-l/2, -w/2, l, w, 5); } ctx.fill();
         }
         if (!isTruck) {
             const gradH = ctx.createLinearGradient(-l/2, -w/2, l/2, w/2); gradH.addColorStop(0, 'rgba(255,255,255,0.3)'); gradH.addColorStop(0.5, 'rgba(255,255,255,0)'); ctx.fillStyle = gradH; ctx.fill();
             const gradS = ctx.createLinearGradient(l/2, w/2, -l/2, -w/2); gradS.addColorStop(0, 'rgba(0,0,0,0.3)'); gradS.addColorStop(0.5, 'rgba(0,0,0,0)'); ctx.fillStyle = gradS; ctx.fill();
             const roofW = w * 0.82; const roofL = l * 0.55;
             ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.roundRect(-roofL/2 - 2, -roofW/2, roofL + 4, roofW, 8); ctx.fill();
             ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.roundRect(-roofL/2 + 2, -roofW/2 + 2, roofL - 4, roofW - 4, 6); ctx.fill(); 
         }
         if (lights) {
             ctx.save(); ctx.shadowColor = 'transparent'; ctx.globalCompositeOperation = 'screen'; 
             const beamLength = 80; const beamWidth = 24; 
             const drawBeam = (yOffset: number) => {
                const bulbGrad = ctx.createRadialGradient(l/2, yOffset, 0, l/2, yOffset, 15); bulbGrad.addColorStop(0, '#ffffff'); bulbGrad.addColorStop(0.2, 'rgba(255, 255, 220, 0.8)'); bulbGrad.addColorStop(1, 'rgba(255, 255, 220, 0)'); ctx.fillStyle = bulbGrad; ctx.beginPath(); ctx.arc(l/2, yOffset, 15, 0, Math.PI * 2); ctx.fill();
                const beamGrad = ctx.createLinearGradient(l/2, yOffset, l/2 + beamLength, yOffset); beamGrad.addColorStop(0, 'rgba(255, 255, 230, 0.5)'); beamGrad.addColorStop(0.2, 'rgba(255, 255, 230, 0.3)'); beamGrad.addColorStop(1, 'rgba(255, 255, 230, 0)'); 
                ctx.fillStyle = beamGrad; ctx.beginPath(); ctx.moveTo(l/2, yOffset); ctx.lineTo(l/2 + beamLength, yOffset - beamWidth); ctx.lineTo(l/2 + beamLength, yOffset + beamWidth); ctx.closePath(); ctx.fill();
             }
             drawBeam(w/3); drawBeam(-w/3); ctx.restore();
         } else { ctx.fillStyle = '#555'; ctx.beginPath(); ctx.ellipse(l/2 - 1, w/3, 2, 4, 0, 0, Math.PI*2); ctx.ellipse(l/2 - 1, -w/3, 2, 4, 0, 0, Math.PI*2); ctx.fill(); }
         let tailColor = '#660000'; let tailGlow = 0;
         if (reverse) { const blink = Math.floor(Date.now() / 300) % 2 === 0; if (blink) { tailColor = '#ff0000'; tailGlow = 10; } else { tailColor = '#660000'; tailGlow = 0; } } else if (brake) { tailColor = '#ff0000'; tailGlow = 15; }
         ctx.fillStyle = tailColor; ctx.shadowColor = tailGlow > 0 ? '#ff0000' : 'transparent'; ctx.shadowBlur = tailGlow;
         const tailX = isTruck ? -l/2 : -l/2; 
         ctx.beginPath(); ctx.rect(tailX, -w/2 + 2, 2, 6); ctx.rect(tailX, w/2 - 8, 2, 6); ctx.fill(); ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(0,0,0,0.4)'; 
         if (settings.autoTurnSignal) { const blink = Math.floor(Date.now() / 300) % 2 === 0; if (blink && Math.abs(wheelAngle) > 0.35) { ctx.fillStyle = '#f59e0b'; const yPos = wheelAngle > 0 ? w/2 - 5 : -w/2 + 2; ctx.fillRect(l/2 - 5, yPos, 2, 3); ctx.fillRect(tailX + 3, yPos, 2, 3); } }
         if (settings.wheelGhost) { ctx.save(); ctx.globalAlpha = 0.6; drawWheels('#333', true); ctx.restore(); }
         ctx.restore();
    };

    const drawScene = (ctx: CanvasRenderingContext2D, inputState: InputState) => {
         ctx.fillStyle = '#262626'; ctx.fillRect(-2000, -2000, 6000, 6000);
         const now = Date.now();
         skidMarksRef.current.forEach(mark => {
             const age = now - mark.timestamp; const life = 1 - (age / 4000); if (life <= 0) return;
             ctx.save(); ctx.translate(mark.x, mark.y); ctx.rotate(mark.rotation); ctx.fillStyle = `rgba(20, 20, 20, ${mark.opacity * life})`; ctx.fillRect(-2, -4, 4, 8); ctx.restore();
         });
         if (levelData.markings) { levelData.markings.forEach(mk => { 
             ctx.save(); ctx.translate(mk.x, mk.y); ctx.rotate(mk.rotation); ctx.fillStyle = mk.color; ctx.strokeStyle = mk.color;
             if (mk.type === 'line-solid') { ctx.fillRect(-mk.width/2, -mk.height/2, mk.width, mk.height); } 
             else if (mk.type === 'line-dashed') { ctx.beginPath(); ctx.setLineDash([15, 15]); ctx.lineWidth = 2; ctx.moveTo(0, -mk.height/2); ctx.lineTo(0, mk.height/2); ctx.stroke(); } 
             else if (mk.type === 'zebra') { ctx.fillStyle = mk.color; const stripes = 6; const w = mk.width / stripes; for(let i=0; i<stripes; i+=2) { ctx.fillRect(-mk.width/2 + i*w, -mk.height/2, w, mk.height); } } 
             else if (mk.type.startsWith('arrow')) { ctx.beginPath(); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.moveTo(0, 15); ctx.lineTo(0, -10); ctx.lineTo(-6, -5); ctx.moveTo(0, -10); ctx.lineTo(6, -5); if (mk.type === 'arrow-turn') { ctx.moveTo(0, 10); ctx.quadraticCurveTo(-10, 10, -15, 0); ctx.lineTo(-10, 2); ctx.moveTo(-15, 0); ctx.lineTo(-12, 5); } ctx.stroke(); } 
             else if (mk.type === 'stop') { ctx.fillRect(-mk.width/2, -mk.height/2, mk.width, mk.height); }
             ctx.restore();
         }); }
         levelData.spots.forEach(spot => { 
             ctx.save(); ctx.translate(spot.x, spot.y); ctx.rotate(spot.rotation);
             const isSuccess = parkingStatusRef.current.has(spot.id); const color = isSuccess ? '#10b981' : '#fef08a'; 
             ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.shadowColor = 'transparent'; ctx.strokeRect(-spot.width/2, -spot.height/2, spot.width, spot.height);
             ctx.save(); ctx.rotate(Math.PI/2); ctx.scale(1, 2); ctx.fillStyle = isSuccess ? 'rgba(16, 185, 129, 0.8)' : 'rgba(254, 240, 138, 0.4)'; ctx.font = "bold 16px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("P", 0, 0); ctx.restore();
             ctx.restore();
         });
         particlesRef.current.forEach(p => { ctx.fillStyle = p.color.replace(/[\d\.]+\)$/g, `${p.life})`); ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); });
         obstaclesRef.current.forEach(obs => {
             if (obs.type === 'car') {
                 // Check if AI
                 const isAi = !!obs.ai;
                 const lightsOn = isAi && (dayTime === DayTime.NIGHT || weather !== WeatherType.SUNNY);
                 const isBraking = isAi && obs.ai?.state === 'brake';
                 drawDetailedCar(ctx, obs.x, obs.y, obs.rotation, obs.width, obs.height, obs.color, 0, lightsOn, isBraking, false);
             } else {
                 ctx.save(); ctx.translate(obs.x, obs.y); ctx.rotate(obs.rotation);
                 if (obs.type === 'wall') { ctx.fillStyle = '#333'; ctx.fillRect(-obs.width/2, -obs.height/2, obs.width, obs.height); ctx.fillStyle = '#4b5563'; ctx.fillRect(-obs.width/2, -obs.height/2, obs.width, obs.height - 4); ctx.strokeStyle = '#1f2937'; ctx.strokeRect(-obs.width/2, -obs.height/2, obs.width, obs.height); }
                 else if (obs.type === 'cone') { ctx.fillStyle = '#ea580c'; ctx.beginPath(); ctx.arc(0,0, 4, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0,0, 2, 0, Math.PI*2); ctx.fill(); }
                 else if (obs.type === 'box') { ctx.fillStyle = '#8d6e63'; ctx.fillRect(-obs.width/2, -obs.height/2, obs.width, obs.height); ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 2; ctx.strokeRect(-obs.width/2, -obs.height/2, obs.width, obs.height); ctx.beginPath(); ctx.moveTo(-obs.width/2, -obs.height/2); ctx.lineTo(obs.width/2, obs.height/2); ctx.moveTo(obs.width/2, -obs.height/2); ctx.lineTo(-obs.width/2, obs.height/2); ctx.stroke(); }
                 else { ctx.fillStyle = obs.color; ctx.fillRect(-obs.width/2, -obs.height/2, obs.width, obs.height); }
                 ctx.restore();
             }
         });
         if (autoParkingTarget) {
             if (pathRef.current.length > 0) { ctx.beginPath(); ctx.moveTo(carState.current.x, carState.current.y); pathRef.current.forEach(p => ctx.lineTo(p.x, p.y)); ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)'; ctx.lineWidth = 3; ctx.setLineDash([15, 15]); ctx.stroke(); ctx.setLineDash([]); }
             if (approachPointRef.current) { ctx.beginPath(); ctx.moveTo(approachPointRef.current.x, approachPointRef.current.y); ctx.lineTo(autoParkingTarget.x, autoParkingTarget.y); ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)'; ctx.lineWidth = 2; ctx.stroke(); }
             ctx.beginPath(); ctx.arc(autoParkingTarget.x, autoParkingTarget.y, 6, 0, Math.PI*2); ctx.fillStyle = '#00ff00'; ctx.fill();
         }
         if (settings.turnAssist && Math.abs(carState.current.steeringAngle) > 0.05 && !autoParkingTarget) {
            ctx.save(); ctx.translate(carState.current.x, carState.current.y); ctx.rotate(carState.current.rotation);
            const L = CAR_MODELS[currentCarId].wheelbase; const steerAngle = carState.current.steeringAngle; const turnRadius = L / Math.tan(steerAngle);
            const isReverse = inputState.gear === -1; const isSUV = currentCarId === CarType.SUV; const wheelOffset = (isSUV ? 2 : -2); const wheelY = (CAR_MODELS[currentCarId].width / 2) + wheelOffset;
            const corY = turnRadius; const side = steerAngle > 0 ? 1 : -1; const rearInnerY = side * wheelY; const frontOuterY = -side * wheelY;
            const radiusInner = Math.abs(turnRadius - rearInnerY); const radiusOuter = Math.sqrt(Math.pow(L, 2) + Math.pow(turnRadius - frontOuterY, 2));
            if (Math.abs(turnRadius) < 2000) {
                 ctx.beginPath(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; ctx.lineWidth = 1; ctx.setLineDash([8, 8]); 
                 let startAngle = steerAngle > 0 ? -Math.PI/2 : Math.PI/2; const direction = isReverse ? -1 : 1;
                 const endAngle = startAngle + (side * direction * Math.PI/3); const ccw = (side * direction) < 0;
                 ctx.arc(-L/2, corY, radiusInner, startAngle, endAngle, ccw); ctx.stroke();
                 ctx.beginPath(); ctx.arc(-L/2, corY, radiusOuter, startAngle, endAngle, ccw); ctx.stroke();
            }
            ctx.restore();
         }
         const isBraking = inputState.brake > 0 || inputState.handbrake; const isReverse = inputState.gear === -1;
         drawDetailedCar(ctx, carState.current.x, carState.current.y, carState.current.rotation, CAR_MODELS[currentCarId].width, CAR_MODELS[currentCarId].length, CAR_MODELS[currentCarId].color, carState.current.steeringAngle, inputState.lights, isBraking, isReverse);
    };

    const updateTraffic = () => {
        obstaclesRef.current.forEach(obs => {
            if (obs.ai) {
                // 1. Target Navigation
                const target = obs.ai.path[obs.ai.currentPathIndex];
                const dx = target.x - obs.x;
                const dy = target.y - obs.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                // If close to waypoint, move to next
                if (dist < 40) {
                    obs.ai.currentPathIndex = (obs.ai.currentPathIndex + 1) % obs.ai.path.length;
                    // Check if wrap around (loop), slightly adjust for continuous movement
                }

                const desiredAngle = Math.atan2(dy, dx);
                let angleDiff = desiredAngle - obs.rotation;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                
                // Turn speed
                obs.rotation += angleDiff * 0.1;

                // 2. Collision Avoidance (Raycast forward)
                let shouldStop = false;
                const lookAhead = 150;
                const fwdX = obs.x + Math.cos(obs.rotation) * lookAhead;
                const fwdY = obs.y + Math.sin(obs.rotation) * lookAhead;
                
                // Check player
                const pDx = carState.current.x - obs.x;
                const pDy = carState.current.y - obs.y;
                const pDist = Math.sqrt(pDx*pDx + pDy*pDy);
                
                // Simple cone check for player
                if (pDist < lookAhead) {
                     const angleToPlayer = Math.atan2(pDy, pDx);
                     let playerAngleDiff = angleToPlayer - obs.rotation;
                     while (playerAngleDiff > Math.PI) playerAngleDiff -= Math.PI * 2;
                     while (playerAngleDiff < -Math.PI) playerAngleDiff += Math.PI * 2;
                     if (Math.abs(playerAngleDiff) < 0.5) shouldStop = true;
                }

                // Check other traffic (simple distance check for now to avoid grouping)
                if (!shouldStop) {
                    for(const other of obstaclesRef.current) {
                        if (other.id === obs.id) continue;
                        const oDx = other.x - obs.x;
                        const oDy = other.y - obs.y;
                        const oDist = Math.sqrt(oDx*oDx + oDy*oDy);
                        if (oDist < lookAhead && oDist > 10) {
                             const angleToOther = Math.atan2(oDy, oDx);
                             let otherAngleDiff = angleToOther - obs.rotation;
                             while (otherAngleDiff > Math.PI) otherAngleDiff -= Math.PI * 2;
                             while (otherAngleDiff < -Math.PI) otherAngleDiff += Math.PI * 2;
                             if (Math.abs(otherAngleDiff) < 0.5) { shouldStop = true; break; }
                        }
                    }
                }

                if (shouldStop) {
                    obs.ai.speed *= 0.9; // Brake
                    obs.ai.state = 'brake';
                    if (obs.ai.speed < 0.1) obs.ai.speed = 0;
                } else {
                    obs.ai.state = 'drive';
                    if (obs.ai.speed < obs.ai.maxSpeed) obs.ai.speed += 0.05;
                }

                // Apply speed
                obs.x += Math.cos(obs.rotation) * obs.ai.speed;
                obs.y += Math.sin(obs.rotation) * obs.ai.speed;
            }
        });
    };

    const render = () => {
      if (!canvas) return;
      const car = carState.current;
      const currentInput = inputRef.current; 
      
      if (isPaused) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
              ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
              const cx = canvas.width / 2; const cy = canvas.height / 2; const zoom = levelData.levelId === 2 ? 7.0 : levelData.levelId === 3 ? 5.0 : 2.0;
              ctx.save(); ctx.translate(cx, cy); ctx.scale(zoom, zoom); ctx.translate(-car.x, -car.y);
              drawScene(ctx, currentInput); ctx.restore();
          }
          requestAnimationFrame(render);
          return;
      }
      
      // Update Traffic
      updateTraffic();

      const checkProximity = () => {
          const carConfig = CAR_MODELS[currentCarId];
          const margin = 15; 
          const carBounds = { x: car.x, y: car.y, width: carConfig.length + margin * 2, height: carConfig.width + margin * 2, rotation: car.rotation };
          for (const obs of obstaclesRef.current) {
              const dist = Math.sqrt((obs.x - car.x)**2 + (obs.y - car.y)**2);
              if (dist < 100) { 
                  const obsRect = obs.type === 'car' ? { x: obs.x, y: obs.y, width: obs.height, height: obs.width, rotation: obs.rotation } : { x: obs.x, y: obs.y, width: obs.width, height: obs.height, rotation: obs.rotation };
                  if (checkCollision(carBounds, obsRect)) { return true; }
              }
          }
          return false;
      };

      if (autoParkingTarget) {
          const isBlocked = checkProximity();
          if (isBlocked && !evasionStateRef.current.active) {
              evasionStateRef.current = { active: true, direction: currentInput.gear === -1 ? 1 : -1, timer: 60 }; 
          }
          if (evasionStateRef.current.active) {
              evasionStateRef.current.timer--;
              if (evasionStateRef.current.timer <= 0) {
                  evasionStateRef.current.active = false; 
              } else {
                  const gear = evasionStateRef.current.direction;
                  updateInput(prev => ({ ...prev, steeringWheelAngle: STEERING_WHEEL_MAX_ROTATION * (Math.random() > 0.5 ? 1 : -1), throttle: 0.5, brake: 0, gear: gear, handbrake: false, gasPressed: true }));
              }
          } else {
              let targetX, targetY;
              let targetSpeed = 2.5;
              const spot = autoParkingTarget;
              
              if (pathRef.current.length > 0) {
                  const nextNode = pathRef.current[0]; targetX = nextNode.x; targetY = nextNode.y;
                  if (pathRef.current.length > 1) { const distToNode = Math.sqrt((nextNode.x - car.x)**2 + (nextNode.y - car.y)**2); if (distToNode < 40) { pathRef.current.shift(); } }
              } else if (approachPointRef.current) {
                  targetX = approachPointRef.current.x; targetY = approachPointRef.current.y;
                  const dist = Math.sqrt((targetX - car.x)**2 + (targetY - car.y)**2); if (dist < 25) { approachPointRef.current = null; }
              } else {
                  targetX = spot.x; targetY = spot.y; targetSpeed = 1.0; 
              }

              const distToTarget = Math.sqrt((targetX - car.x)**2 + (targetY - car.y)**2);
              if (distToTarget < 5 && !approachPointRef.current && pathRef.current.length === 0) {
                  updateInput(prev => ({ ...prev, throttle: 0, brake: 1.0, handbrake: true, gear: 0 }));
                  setAutoParkingTarget(null);
              } else {
                  const dx = targetX - car.x; const dy = targetY - car.y;
                  const cx = Math.cos(car.rotation); const cy = Math.sin(car.rotation);
                  const dot = dx * cx + dy * cy;
                  let desiredAngle = Math.atan2(dy, dx);
                  let gearCmd = 1;
                  const isMoving = Math.abs(car.speed) > 0.1;
                  const isReversing = dot < 0;
                  if (isReversing) { gearCmd = -1; desiredAngle += Math.PI; }
                  let angleError = desiredAngle - car.rotation;
                  while (angleError > Math.PI) angleError -= Math.PI * 2; while (angleError < -Math.PI) angleError += Math.PI * 2;
                  let steerCmd = angleError * 2.5; if (steerCmd > 1) steerCmd = 1; if (steerCmd < -1) steerCmd = -1;
                  let throttleCmd = 0; let brakeCmd = 0;
                  const currentGear = currentInput.gear;
                  const gearMismatch = (gearCmd === 1 && currentGear === -1) || (gearCmd === -1 && currentGear > 0);
                  if (gearMismatch && isMoving) { brakeCmd = 1.0; gearCmd = currentGear; } 
                  else {
                      if (Math.abs(angleError) > 0.8) targetSpeed *= 0.3; 
                      if (Math.abs(car.speed) < targetSpeed) { throttleCmd = 0.6; } 
                      else { if (Math.abs(car.speed) > targetSpeed + 1) brakeCmd = 0.2; }
                  }
                  const steeringAngle = steerCmd * STEERING_WHEEL_MAX_ROTATION;
                  updateInput(prev => ({ ...prev, steeringWheelAngle: steeringAngle, throttle: throttleCmd, brake: brakeCmd, gear: gearCmd, engineStarted: true, handbrake: false, gasPressed: true }));
              }
          }
      }

      carSpeedRef.current = car.speed;
      const carConfig = CAR_MODELS[currentCarId];
      const currentInputReal = inputRef.current; 
      const isGasPressed = currentInputReal.gasPressed || currentInputReal.throttle > 0.1;
      const creepLimit = 0.35; const maxThrottle = currentInputReal.shiftPressed ? creepLimit : 1.0;
      const targetThrottle = isGasPressed ? maxThrottle : 0;
      
      let throttleRampRate = 0.05; 
      if (targetThrottle > throttleState.current) {
          const gear = Math.abs(currentInputReal.gear);
          if (gear === 0) throttleRampRate = 0.08; else if (gear === 1) throttleRampRate = 0.06; else if (gear === 2) throttleRampRate = 0.05; else if (gear === 3) throttleRampRate = 0.04; else if (gear === 4) throttleRampRate = 0.03; else if (gear === 5) throttleRampRate = 0.015; 
          throttleState.current += throttleRampRate;
      } else { throttleState.current -= 0.05; }
      if (targetThrottle > 0) { throttleState.current = Math.min(throttleState.current, maxThrottle); }
      throttleState.current = Math.max(0, throttleState.current); 

      const targetSteerAngle = (currentInputReal.steeringWheelAngle / STEERING_WHEEL_MAX_ROTATION) * MAX_STEER_ANGLE;
      const steerLerp = 0.10; car.steeringAngle += (targetSteerAngle - car.steeringAngle) * steerLerp;

      const activeGearKey = String(currentInputReal.gear) as keyof typeof GEAR_MAX_SPEEDS;
      const gearSpeedLimit = GEAR_MAX_SPEEDS[activeGearKey] || 0;
      let engineForce = 0;
      
      if (currentInputReal.gear !== 0 && currentInputReal.engineStarted) {
          let gearScale = 1.0; const gearAbs = Math.abs(currentInputReal.gear);
          if (gearAbs === 1) gearScale = 1.2; if (gearAbs === 2) gearScale = 0.65; if (gearAbs === 3) gearScale = 0.40; if (gearAbs === 4) gearScale = 0.25; if (gearAbs === 5) gearScale = 0.15; 
          let effectiveAcc = carConfig.acceleration * gearScale;
          if (levelData.levelId === 2 && (gearAbs === 1 || currentInputReal.gear === -1)) { effectiveAcc *= 0.5; }
          if (gearAbs === 1) { effectiveAcc *= 0.7; }
          if (currentInputReal.gear === -1) { engineForce = -throttleState.current * effectiveAcc; } else { engineForce = throttleState.current * effectiveAcc; }
      }

      let brakeForce = 0;
      if (currentInputReal.handbrake) { brakeForce = HANDBRAKE_FORCE; } else if (currentInputReal.brake > 0) { brakeForce = currentInputReal.brake * BRAKING_FORCE; }

      if (Math.abs(car.speed) > 0.5) {
          const currentTime = Date.now(); const wheelOffset = carConfig.width / 2 - 2;
          const rearX = car.x - Math.cos(car.rotation) * (carConfig.wheelbase/2); const rearY = car.y - Math.sin(car.rotation) * (carConfig.wheelbase/2);
          const isSkidding = (Math.abs(car.speed) > 1.0 && brakeForce > 0.03);
          let addTrack = false;
          if (!lastTrackPosRef.current) { addTrack = true; } else { const dx = car.x - lastTrackPosRef.current.x; const dy = car.y - lastTrackPosRef.current.y; if (Math.sqrt(dx*dx + dy*dy) > 10) { addTrack = true; } }
          if (addTrack) {
              lastTrackPosRef.current = {x: car.x, y: car.y}; const opacity = isSkidding ? 0.6 : 0.15; 
              skidMarksRef.current.push({ x: rearX + Math.sin(car.rotation) * wheelOffset, y: rearY - Math.cos(car.rotation) * wheelOffset, rotation: car.rotation, opacity: opacity, timestamp: currentTime });
              skidMarksRef.current.push({ x: rearX - Math.sin(car.rotation) * wheelOffset, y: rearY + Math.cos(car.rotation) * wheelOffset, rotation: car.rotation, opacity: opacity, timestamp: currentTime });
          }
      }

      if (brakeForce > 0) {
          const effectiveBrake = brakeForce * 0.85;
          if (car.speed > 0) car.speed -= effectiveBrake; else if (car.speed < 0) car.speed += effectiveBrake;
          if (Math.abs(car.speed) < effectiveBrake) car.speed = 0;
      } else { car.speed += engineForce; }

      const now = Date.now();
      skidMarksRef.current = skidMarksRef.current.filter(m => now - m.timestamp < 4000);

      if (currentInputReal.engineStarted) {
          const gearFactor = Math.max(1, Math.abs(currentInputReal.gear)); const emissionChance = 0.1 + (throttleState.current * 0.3) / gearFactor; 
          if (Math.random() < emissionChance) {
              const exhaustX = car.x - Math.cos(car.rotation) * (carConfig.length/2 + 2); const exhaustY = car.y - Math.sin(car.rotation) * (carConfig.length/2 + 2); const spread = (Math.random() - 0.5) * 0.5;
              particlesRef.current.push({ x: exhaustX, y: exhaustY, vx: -Math.cos(car.rotation) * car.speed * 0.5 - Math.cos(car.rotation) * 0.5 + spread, vy: -Math.sin(car.rotation) * car.speed * 0.5 - Math.sin(car.rotation) * 0.5 + spread, life: 1.0, size: 2 + Math.random() * 3, color: `rgba(200, 200, 200, ${0.03 + Math.random() * 0.08})` });
          }
      }
      particlesRef.current.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.01; p.size += 0.1; }); particlesRef.current = particlesRef.current.filter(p => p.life > 0);

      if (currentInputReal.gear !== 0 && currentInputReal.engineStarted) { if (Math.abs(car.speed) > gearSpeedLimit) { const brakeFactor = 1 - (0.015 / Math.abs(currentInputReal.gear)); car.speed *= Math.max(0.96, brakeFactor); } }
      const turnDragFactor = Math.abs(car.steeringAngle) * 0.035; car.speed *= (1 - turnDragFactor); car.speed *= DRAG; car.speed *= FRICTION;
      if (currentInputReal.gear !== 0) { if (Math.abs(car.speed) > gearSpeedLimit && engineForce !== 0) { if ((car.speed > 0 && engineForce > 0) || (car.speed < 0 && engineForce < 0)) { car.speed -= engineForce * 0.9; } } }
      if (car.speed > carConfig.maxSpeed) car.speed = carConfig.maxSpeed; if (car.speed < -carConfig.maxSpeed) car.speed = -carConfig.maxSpeed;

      const prevX = car.x; const prevY = car.y;
      if (Math.abs(car.speed) > 0.0001) {
        const beta = Math.atan(Math.tan(car.steeringAngle) * 0.5);
        car.x += Math.cos(car.rotation + beta) * car.speed; car.y += Math.sin(car.rotation + beta) * car.speed;
        car.rotation += (car.speed * Math.cos(beta) * Math.tan(car.steeringAngle)) / carConfig.wheelbase;
      } else { car.speed = 0; }

      const hitBoxScale = 0.95; const carRect = { x: car.x, y: car.y, width: carConfig.length * hitBoxScale, height: carConfig.width * hitBoxScale, rotation: car.rotation };
      let collisionOccurred = false;
      if (car.x < 0 || car.x > levelData.mapWidth || car.y < 0 || car.y > levelData.mapHeight) { collisionOccurred = true; playCrashSound(Math.abs(car.speed)); onCrash(10); } else {
          for (const obs of obstaclesRef.current) {
             const obsScale = obs.type === 'car' ? 0.95 : 1.0; 
             let obsRect; if (obs.type === 'car') { obsRect = { x: obs.x, y: obs.y, width: obs.height * obsScale, height: obs.width * obsScale, rotation: obs.rotation }; } else { obsRect = { x: obs.x, y: obs.y, width: obs.width * obsScale, height: obs.height * obsScale, rotation: obs.rotation }; }
             if (checkCollision(carRect, obsRect)) {
                 collisionOccurred = true; if (Math.abs(car.speed) > 0.5) playCrashSound(Math.abs(car.speed));
                 if (obs.movable) { const force = Math.abs(car.speed) * 2; const angle = Math.atan2(obs.y - car.y, obs.x - car.x); const moveX = Math.cos(angle) * force / (obs.weight * 0.1 || 1); const moveY = Math.sin(angle) * force / (obs.weight * 0.1 || 1); obs.x += moveX; obs.y += moveY; if (obs.type === 'box') obs.rotation += (Math.random() - 0.5) * force * 0.5; }
                 onCrash(obs.type === 'pedestrian' ? 500 : 50); break; 
             }
          }
      }
      if (collisionOccurred) { car.x = prevX; car.y = prevY; car.speed = -car.speed * 0.3; }

      const justParked = currentInputReal.handbrake && !prevHandbrakeRef.current; prevHandbrakeRef.current = currentInputReal.handbrake;
      if (justParked && Math.abs(car.speed) < 0.1) {
        levelData.spots.forEach(spot => {
            if (parkingStatusRef.current.has(spot.id)) return; const dx = car.x - spot.x; const dy = car.y - spot.y; const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 50) {
                let angleDiff = Math.abs(car.rotation - spot.rotation); while(angleDiff > Math.PI) angleDiff -= Math.PI * 2; angleDiff = Math.abs(angleDiff);
                const isForward = angleDiff < 0.35; const isReverse = Math.abs(angleDiff - Math.PI) < 0.35;
                const carCorners = getRectCorners(carRect);
                const isPointInSpot = (p: {x: number, y: number}) => { const tx = p.x - spot.x; const ty = p.y - spot.y; const cos = Math.cos(-spot.rotation); const sin = Math.sin(-spot.rotation); const localX = tx * cos - ty * sin; const localY = tx * sin + ty * cos; return Math.abs(localX) <= spot.width/2 && Math.abs(localY) <= spot.height/2; };
                let cornersInside = 0; carCorners.forEach(c => { if (isPointInSpot(c)) cornersInside++; });
                if (cornersInside === 4) { parkingStatusRef.current.add(spot.id); if (isForward) { playSuccessSound(false); onParkingSuccess(spot.id, 100, 'perfect'); } else if (isReverse) { playSuccessSound(true); onParkingSuccess(spot.id, -20, 'reverse'); } else { playSuccessSound(false); onParkingSuccess(spot.id, 50, 'good'); } } else if (cornersInside > 0) { playSuccessSound(true); onParkingSuccess(spot.id, -30, 'line'); }
            }
        });
      }

      if (settings.soundEnabled && engineNodesRef.current) {
        const { osc1, osc2, gain, filter } = engineNodesRef.current;
        if (currentInputReal.engineStarted) {
            const baseFreq = 60; let simulatedRpm = 0; if (currentInputReal.gear === 0) { simulatedRpm = throttleState.current * 4000; } else { const speedRatio = Math.abs(car.speed) / 8.0; simulatedRpm = (speedRatio * 5000) + (throttleState.current * 1000); }
            const targetFreq1 = baseFreq + (simulatedRpm * 0.05); const targetFreq2 = baseFreq * 2 + (simulatedRpm * 0.08); 
            osc1.frequency.setTargetAtTime(targetFreq1, audioContextRef.current!.currentTime, 0.05); osc2.frequency.setTargetAtTime(targetFreq2, audioContextRef.current!.currentTime, 0.05);
            const filterFreq = 100 + (simulatedRpm * 0.5) + (throttleState.current * 500); filter.frequency.setTargetAtTime(filterFreq, audioContextRef.current!.currentTime, 0.1);
            let vol = 0.1 + (throttleState.current * 0.3); vol = Math.min(vol, 0.5); gain.gain.setTargetAtTime(vol * settings.volume, audioContextRef.current!.currentTime, 0.1);
        } else { gain.gain.setTargetAtTime(0, audioContextRef.current!.currentTime, 0.1); }
      } else if (engineNodesRef.current) { engineNodesRef.current.gain.gain.value = 0; }

      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2; const cy = canvas.height / 2; ctx.save(); ctx.translate(cx, cy); const zoom = levelData.levelId === 2 ? 7.0 : levelData.levelId === 3 ? 5.0 : 2.0; ctx.scale(zoom, zoom); ctx.translate(-car.x, -car.y);
      drawScene(ctx, currentInputReal); ctx.restore();

      const mapSize = 180; const mapScale = mapSize / levelData.mapWidth; const mapX = canvas.width - mapSize - 20; const mapY = 20;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(10, 10, 20, 0.9)'; ctx.beginPath(); ctx.roundRect(mapX, mapY, mapSize, mapSize, 10); ctx.fill(); ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#6b7280'; obstaclesRef.current.forEach(obs => { if (obs.type === 'wall') { const mx = mapX + obs.x * mapScale; const my = mapY + obs.y * mapScale; ctx.fillRect(mx - (obs.width*mapScale)/2, my - (obs.height*mapScale)/2, obs.width*mapScale, obs.height*mapScale); } });
      levelData.spots.forEach(spot => { const mx = mapX + spot.x * mapScale; const my = mapY + spot.y * mapScale; ctx.fillStyle = parkingStatusRef.current.has(spot.id) ? '#10b981' : '#fef08a'; ctx.fillRect(mx - 1.5, my - 1.5, 3, 3); });
      const pmx = mapX + car.x * mapScale; const pmy = mapY + car.y * mapScale; ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(pmx, pmy, 4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pmx, pmy); ctx.lineTo(pmx + Math.cos(car.rotation)*10, pmy + Math.sin(car.rotation)*10); ctx.stroke();

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
      if (engineNodesRef.current && audioContextRef.current) {
          try {
            if (audioContextRef.current.state === 'running') {
                engineNodesRef.current.gain.gain.cancelScheduledValues(audioContextRef.current.currentTime);
                engineNodesRef.current.gain.gain.setValueAtTime(0, audioContextRef.current.currentTime);
            }
          } catch(e) {}
      }
    };
  }, [levelData, currentCarId, settings, weather, dayTime, onCrash, onParkingSuccess, carSpeedRef, isPaused, autoParkingTarget, setAutoParkingTarget, updateInput]); 

  return (
    <canvas ref={canvasRef} width={window.innerWidth} height={window.innerHeight} className="block w-full h-full touch-none cursor-crosshair" />
  );
});

export default GameCanvas;