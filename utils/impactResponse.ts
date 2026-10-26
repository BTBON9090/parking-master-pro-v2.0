export type DamageTier = 'none' | 'light' | 'moderate' | 'severe';
/** Gameplay calibration by normal closing speed (m/s), not road speed.
 * Repeated parking scrapes never trigger a high-energy full breakup. */
export function classifyImpact(closing: number): DamageTier {
 return closing >= 17 ? 'severe' : closing >= 6 ? 'moderate' : closing >= 2 ? 'light' : 'none';
}
export interface V2 {x:number;y:number}
const dot=(a:V2,b:V2)=>a.x*b.x+a.y*b.y;
/** SI velocity, outward surface normal, body-local contact transformed to world.
 * Impulse includes rotational inertia. Glancing contact retains tangential
 * motion; only the closing normal velocity contributes to crash damage. */
export function solveVehicleImpact(v:V2,n:V2,arm:V2,lengthM:number,widthM:number,oldYaw=0) {
 const cross=arm.x*n.y-arm.y*n.x;
 const closing=Math.max(0,-(dot(v,n)+oldYaw*cross));
 const speed=Math.hypot(v.x,v.y),frontal=closing/Math.max(.001,speed)>.82;
 const restitution=frontal?.13:.34;
 const inertiaPerMass=(lengthM*lengthM+widthM*widthM)/12;
 const impulse=(1+restitution)*closing/(1+cross*cross/inertiaPerMass);
 let out={x:v.x+n.x*impulse,y:v.y+n.y*impulse};
 // Small friction in the contact plane, preserving most tangential speed.
 const tangent={x:-n.y,y:n.x},tv=dot(out,tangent);
 const friction=Math.min(Math.abs(tv),impulse*.09)*Math.sign(tv);
 out.x-=tangent.x*friction;out.y-=tangent.y*friction;
 // Resolve the second side-face contact too: a single bumper-corner impulse
 // can spin the nose away while leaving the COM moving into a long guardrail.
 let yawRate=Math.max(-2.2,Math.min(2.2,oldYaw+cross*impulse/inertiaPerMass));
 const vn=dot(out,n),outward=closing*(frontal?.10:.25);
 if(closing>0 && vn<outward){out.x+=n.x*(outward-vn);out.y+=n.y*(outward-vn);}
 const before=dot(v,v)+inertiaPerMass*oldYaw*oldYaw;
 const after=dot(out,out)+inertiaPerMass*yawRate*yawRate;
 const loss=after>before&&after>0?Math.sqrt(before/after):1;
 out.x*=loss;out.y*=loss;yawRate*=loss;
 return {velocity:out,yawRate,closing,
  damage:closing<2?0:Math.min(1,Math.pow(closing/17,2)),catastrophic:classifyImpact(closing)==='severe',tier:classifyImpact(closing)};
}
/** Support point on the actual convex shell, averaged along the impact face.
 * A centred frontal hit has no invented spin; bumper corner hits do. */
export function impactContactArm(points:V2[],center:V2,normal:V2):V2 {
 const min=Math.min(...points.map(p=>dot(p,normal)));
 const face=points.filter(p=>dot(p,normal)<min+.5);
 return {x:(face.reduce((a,p)=>a+p.x,0)/face.length-center.x)/10,y:(face.reduce((a,p)=>a+p.y,0)/face.length-center.y)/10};
}
