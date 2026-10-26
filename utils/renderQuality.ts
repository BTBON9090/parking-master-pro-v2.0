export type RenderQuality = 'auto' | 'low' | 'medium' | 'high' | 'ultra';
export const QUALITY_OPTIONS: {id:RenderQuality;name:string;description:string}[] = [
 {id:'auto',name:'自动',description:'根据运行负载缓慢调整清晰度，优先维持流畅。'},
 {id:'low',name:'流畅',description:'约 65% 渲染比例，适合手机和低配置电脑。'},
 {id:'medium',name:'均衡',description:'标准像素密度，兼顾清晰度与运行负担。'},
 {id:'high',name:'高清',description:'最高 1.5 倍像素密度，提高车身和远处道路的细节。'},
 {id:'ultra',name:'超清',description:'最高 2 倍像素密度，适合高性能显卡。'},
];
export function qualityProfile(quality:RenderQuality='auto',deviceDpr=1,mobile=false){
 const native=Math.max(1,Math.min(deviceDpr,3));
 const ceiling=quality==='low'?.65:quality==='medium'?1:quality==='ultra'?Math.min(native,2):Math.min(native,1.5);
 return {ceiling,floor:quality==='auto'?.6:ceiling,initial:quality==='auto'&&mobile?Math.min(1,ceiling):ceiling,
 mirrorWidth:quality==='low'?384:quality==='medium'?576:768,
 shadowSize:quality==='low'?1024:quality==='ultra'?4096:2048};
}
export function nextResolution(current:number,averageMs:number,min:number,max:number){
 return averageMs>20.5?Math.max(min,current-.1):averageMs<17.5?Math.min(max,current+.05):current;
}

/** Ignore loading/resume gaps; sustained frame pacing, not scene-build time,
 * controls auto resolution. Two slow windows are required before reducing it. */
export class ResolutionSampler {
 private previous = 0;
 private warmUntil = 0;
 private samples: number[] = [];
 private elapsed = 0;
 private slowWindows = 0;
 reset(now: number) {
  this.previous = now; this.warmUntil = now + 3000;
  this.samples = []; this.elapsed = 0; this.slowWindows = 0;
 }
 sample(now: number, active: boolean): number | null {
  const dt = now - this.previous; this.previous = now;
  if (!active || dt > 250 || dt <= 0) { this.reset(now); return null; }
  if (now < this.warmUntil) return null;
  this.samples.push(dt); this.elapsed += dt;
  if (this.elapsed < 1800) return null;
  const sorted = this.samples.sort((a,b) => a-b);
  const median = sorted[Math.floor(sorted.length / 2)];
  this.samples = []; this.elapsed = 0;
  if (median > 20.5) { if (++this.slowWindows < 2) return null; }
  else this.slowWindows = 0;
  return median;
 }
}
export function retainedResolution(previous: {quality: RenderQuality; dpr: number} | null, quality: RenderQuality, profile: ReturnType<typeof qualityProfile>) {
 return previous?.quality === quality ? Math.max(profile.floor, Math.min(profile.ceiling, previous.dpr)) : profile.initial;
}
