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
 return averageMs>20.5?Math.max(min,current-.1):averageMs<16?Math.min(max,current+.05):current;
}
