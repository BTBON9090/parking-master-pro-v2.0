import type { AiConfig } from '../types';
import { TRAVEL_PER_SPEED_FRAME } from './powertrain';

/** Active NPC traffic is deliberately capped; the level may contain fewer. */
export const MAX_ACTIVE_TRAFFIC = 8;
export const NPC_TURN_RATE = 1.7;
export const NPC_COLLISION_RECOVERY_MS = 1200;
export const NPC_HONK_COOLDOWN_MS = 8500;

export interface TrafficBlocker {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
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
  const path = ai.path;
  let blocked = false;
  let blockedByPlayer = false;
  let collided = false;
  let honked = false;

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
    const lookAhead = 140;
    for (const blocker of input.blockers) {
      if (blocker.id === input.id) continue;
      const bx = blocker.x - x;
      const by = blocker.y - y;
      const distance = Math.hypot(bx, by);
      if (distance > lookAhead + Math.max(blocker.width, blocker.height) * 0.5) continue;
      const ahead = bx * forwardX + by * forwardY;
      const lateral = -bx * forwardY + by * forwardX;
      const corridor = 24 + blocker.width * 0.45;
      if (ahead > 4 && Math.abs(lateral) < corridor && distance < lookAhead) {
        blocked = true;
        targetSpeed = 0;
        if (blocker.id === 'player' || blocker.id.startsWith('player')) blockedByPlayer = true;
        break;
      }
    }

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
