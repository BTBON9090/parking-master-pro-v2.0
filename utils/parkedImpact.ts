import type {Obstacle} from '../types';
import {SPEED_UNIT_KMH} from './powertrain';
import {solveVehicleImpact} from './impactResponse';
import {NPC_COLLISION_RECOVERY_MS} from './traffic';
export interface PlanarVelocity {x:number;y:number}
/** Mass-aware normal impulse for two vehicles. n points from parked car to
 * player; tangential velocity is retained. Units: metres, kilograms, seconds. */
export function parkedCarImpact(player:PlanarVelocity,parked:PlanarVelocity,n:PlanarVelocity,playerMass:number,parkedMass:number){
 const closing=Math.max(0,-((player.x-parked.x)*n.x+(player.y-parked.y)*n.y));
 const mp=Math.max(1,playerMass),mt=Math.max(1,parkedMass),impulse=1.12*closing/(1/mp+1/mt);
 return {player:{x:player.x+n.x*impulse/mp,y:player.y+n.y*impulse/mp},
  parked:{x:parked.x-n.x*impulse/mt,y:parked.y-n.y*impulse/mt},closing};
}

/** NPC speed uses game units; pushed-car motion is already metres/second.
 * Preserve the latter even when it is zero during contact separation. */
export function obstacleVelocityMps(obstacle:Obstacle,pushed?:PlanarVelocity):PlanarVelocity{
 if(pushed)return {x:pushed.x,y:pushed.y};
 const speed=(obstacle.ai?.speed??0)*SPEED_UNIT_KMH/3.6;
 return {x:Math.cos(obstacle.rotation)*speed,y:Math.sin(obstacle.rotation)*speed};
}

/** Yield path following while an impacted car slides, then restart from rest
 * after the existing recovery delay. Never restore its pre-crash AI speed. */
export function interruptTrafficForImpact(obstacle:Obstacle,nowMs:number){
 if(!obstacle.ai)return;
 obstacle.ai.speed=0;obstacle.ai.state='stop';
 obstacle.ai.collisionCooldownUntil=Math.max(obstacle.ai.collisionCooldownUntil??0,nowMs+NPC_COLLISION_RECOVERY_MS);
}

/** Damage depends on relative closing speed, not either car's road speed.
 * The existing two-mass impulse supplies world velocities for both bodies. */
export function solveVehiclePairImpact(player:PlanarVelocity,other:PlanarVelocity,normal:PlanarVelocity,arm:PlanarVelocity,lengthM:number,widthM:number,yaw:number,playerMass:number,otherMass:number){
 const response=solveVehicleImpact({x:player.x-other.x,y:player.y-other.y},normal,arm,lengthM,widthM,yaw);
 const pair=parkedCarImpact(player,other,normal,playerMass,otherMass);
 return {...response,velocity:pair.player,otherVelocity:pair.parked,yawRate:response.yawRate*.35};
}
