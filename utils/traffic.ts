import type { AiConfig } from '../types';
import { TRAVEL_PER_SPEED_FRAME } from './powertrain';

/** Active NPC traffic is deliberately capped; the level may contain fewer. */
export const MAX_ACTIVE_TRAFFIC = 48;
export type TrafficDifficulty='easy'|'normal'|'hard'|'extreme';
export const trafficLimit=(difficulty:TrafficDifficulty|undefined)=>({easy:8,normal:16,hard:32,extreme:48}[difficulty??'normal']??16);
export const trafficLaneBoundary=(id:string)=>/^(motorway-rail-|tunnel-(wall|roof)-|highway-boundary-)/.test(id);
export const NPC_TURN_RATE = 1.7;
export const NPC_COLLISION_RECOVERY_MS = 1200;
export const NPC_HONK_COOLDOWN_MS = 8500;

export interface TrafficBlocker {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type?: string;
  rotation?: number;
}

export interface TrafficStepInput {
  id: string;
  x: number;
  y: number;
  rotation: number;
  ai: AiConfig;
  blockers: TrafficBlocker[];
  player: { x: number; y: number };
  dtSeconds: number;
  nowMs: number;
}

export interface TrafficStepResult {
  x: number;
  y: number;
  rotation: number;
  speed: number;
  currentPathIndex: number;
  state: AiConfig['state'];
  blocked: boolean;
  blockedByPlayer: boolean;
  collided: boolean;
  honked: boolean;
}

const wrapAngle = (angle: number) => {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

const circleRadius = (width: number, height: number) => Math.hypot(width, height) * 0.40;
/** Distance to an oriented wall footprint. A 200-unit guardrail is not a
 * 200-unit-wide car: its long edge normally runs parallel to the lane. */
function wallDistance(b:TrafficBlocker,x:number,y:number){
 const angle=b.rotation??0,c=Math.cos(angle),s=Math.sin(angle),dx=x-b.x,dy=y-b.y;
 const lx=dx*c+dy*s,ly=-dx*s+dy*c;
 const qx=Math.max(-b.width/2,Math.min(b.width/2,lx)),qy=Math.max(-b.height/2,Math.min(b.height/2,ly));
 return Math.hypot(lx-qx,ly-qy);
}

/**
 * One kinematic traffic update. NPCs follow their authored lane path, brake
 * for anything in front (including the player), recover from contact with a
 * small bounded separation, and honk only after being blocked for a while.
 * They never pathfind through parked cars; waiting is the fallback.
 */
export function stepTrafficVehicle(input: TrafficStepInput): TrafficStepResult {
  const { ai } = input;
  const dt = Math.max(0, Math.min(0.20, input.dtSeconds));
  let x = input.x;
  let y = input.y;
  let rotation = input.rotation;
  let speed = Math.max(0, ai.speed);
  let currentPathIndex = ai.currentPathIndex;
  let path = ai.path;
  let blocked = false;
  let blockedByPlayer = false;
  let collided = false;
  let honked = false;

  if(ai.lanePaths&&(ai.blockedFor??0)>(ai.aggressive?.35:.7)&&input.nowMs-(ai.lastLaneChange??-Infinity)>(ai.aggressive?3500:10000)){
    for(const change of [-1,1]){
      const lane=(ai.laneIndex??0)+change;if(lane<0||lane>3)continue;
      const next=ai.lanePaths[lane],p=next[currentPathIndex%next.length],old=path[currentPathIndex%path.length];
      const candidate={x:input.x+p.x-old.x,y:input.y+p.y-old.y};
      const clear=input.blockers.every(b=>b.type==='wall'?wallDistance(b,candidate.x,candidate.y)>15:Math.hypot(b.x-candidate.x,b.y-candidate.y)>(ai.aggressive?140:220));
      if(clear){ai.path=next;path=next;ai.laneIndex=lane;if(ai.laneSpeeds?.[lane]!=null)ai.maxSpeed=ai.laneSpeeds[lane];ai.lastLaneChange=input.nowMs;ai.blockedFor=0;break;}
    }
  }
  if(ai.incidentAt&&input.nowMs>ai.incidentAt){ai.incidentUntil=input.nowMs+12000;ai.incidentAt=undefined;ai.collisionCooldownUntil=input.nowMs+5000;}
  if (path.length > 0 && dt > 0) {
    let target = path[currentPathIndex % path.length];
    let dx = target.x - x;
    let dy = target.y - y;
    if (Math.hypot(dx, dy) < 55) {
      currentPathIndex = (currentPathIndex + 1) % path.length;
      target = path[currentPathIndex];
      dx = target.x - x;
      dy = target.y - y;
    }
    const desiredHeading = Math.atan2(dy, dx);
    const angleDiff = wrapAngle(desiredHeading - rotation);
    rotation += Math.max(-NPC_TURN_RATE * dt, Math.min(NPC_TURN_RATE * dt, angleDiff));

    const forwardX = Math.cos(rotation);
    const forwardY = Math.sin(rotation);
    let targetSpeed = ai.maxSpeed * Math.max(0.35, 1 - Math.abs(angleDiff) * 0.85);

    // Look ahead in a lane-width corridor. This is intentionally conservative:
    // a stopped car ahead means wait, not drive through it.
    // Fixed stop window. A speed-dependent window shrank as the NPC braked
    // and produced a stop/go oscillation just outside the threshold.
    const lookAhead = Math.max(140,ai.maxSpeed*ai.maxSpeed*7+70);
    for (const blocker of input.blockers) {
      if (blocker.id === input.id) continue;
      const bx = blocker.x - x;
      const by = blocker.y - y;
      const distance = Math.hypot(bx, by);
      if (distance > lookAhead + Math.max(blocker.width, blocker.height) * 0.5) continue;
      const ahead = bx * forwardX + by * forwardY;
      const lateral = -bx * forwardY + by * forwardX;
      if(blocker.type==='wall'){
        const a=(blocker.rotation??0)-rotation,c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a));
        const along=c*blocker.width/2+s*blocker.height/2,across=s*blocker.width/2+c*blocker.height/2;
        if(ahead+along>4&&ahead-along<lookAhead&&Math.abs(lateral)<11+across){blocked=true;targetSpeed=0;break;}
        continue;
      }
      const corridor = ai.lanePaths?18+blocker.width*.4:24+blocker.width*.45;
      if (ahead > 4 && Math.abs(lateral) < corridor && distance < lookAhead) {
        blocked = true;
        targetSpeed = 0;
        if (blocker.id === 'player' || blocker.id.startsWith('player')) blockedByPlayer = true;
        break;
      }
    }

    if(input.nowMs<(ai.incidentUntil??0)){targetSpeed=Math.min(targetSpeed,.8);rotation+=Math.sin(input.nowMs/700)*.015*dt;honked=input.nowMs-(ai.lastHonkAt??0)>4000;if(honked)ai.lastHonkAt=input.nowMs;}
    if (input.nowMs < (ai.collisionCooldownUntil ?? 0)) {
      targetSpeed = 0;
      blocked = true;
    }

    if (targetSpeed < speed) speed = Math.max(0, speed - 1.4 * dt);
    else speed = Math.min(targetSpeed, speed + 0.24 * dt);

    if (speed > 0.0001) {
      // speed is in 15 km/h units; 60 fps travel conversion gives world units.
      const distance = speed * TRAVEL_PER_SPEED_FRAME * 60 * dt;
      x += Math.cos(rotation) * distance;
      y += Math.sin(rotation) * distance;
    }

    // Bounded contact separation. Only actual overlap is corrected, never the
    // long-range stop decision, so a waiting NPC cannot be "kicked" remotely.
    for (const blocker of input.blockers) {
      if (blocker.id === input.id) continue;
      // Walls are handled by the lane corridor above; treating a long thin
      // barrier as a circumscribed circle pushes traffic sideways into it.
      if(blocker.type==='wall')continue;
      const bx = x - blocker.x;
      const by = y - blocker.y;
      const distance = Math.hypot(bx, by);
      const minimum = circleRadius(19, 47) + circleRadius(blocker.width, blocker.height) - 3;
      if (distance < minimum && distance > 1e-4) {
        const push = Math.min(2.4, (minimum - distance) * 0.35 + 0.15);
        x += (bx / distance) * push;
        y += (by / distance) * push;
        speed = 0;
        collided = true;
        ai.collisionCooldownUntil = input.nowMs + NPC_COLLISION_RECOVERY_MS;
        if (blocker.id === 'player') blockedByPlayer = true;
      }
    }

    if (blocked) {
      ai.blockedFor = (ai.blockedFor ?? 0) + dt;
      if (blockedByPlayer && ai.blockedFor > 2.2 && input.nowMs - (ai.lastHonkAt ?? -Infinity) > NPC_HONK_COOLDOWN_MS) {
        ai.lastHonkAt = input.nowMs;
        honked = true;
      }
      ai.state = speed > 0.08 ? 'brake' : 'stop';
    } else {
      ai.blockedFor = 0;
      ai.state = 'drive';
    }
  } else {
    ai.state = 'stop';
  }

  return {
    x, y, rotation, speed, currentPathIndex,
    state: ai.state, blocked, blockedByPlayer, collided, honked,
  };
}
