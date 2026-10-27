export interface PlanarVelocity {x:number;y:number}
/** Mass-aware normal impulse for two vehicles. n points from parked car to
 * player; tangential velocity is retained. Units: metres, kilograms, seconds. */
export function parkedCarImpact(player:PlanarVelocity,parked:PlanarVelocity,n:PlanarVelocity,playerMass:number,parkedMass:number){
 const closing=Math.max(0,-((player.x-parked.x)*n.x+(player.y-parked.y)*n.y));
 const mp=Math.max(1,playerMass),mt=Math.max(1,parkedMass),impulse=1.12*closing/(1/mp+1/mt);
 return {player:{x:player.x+n.x*impulse/mp,y:player.y+n.y*impulse/mp},
  parked:{x:parked.x-n.x*impulse/mt,y:parked.y-n.y*impulse/mt},closing};
}
