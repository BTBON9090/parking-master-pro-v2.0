export interface CurbVisual {x:number;y:number;rotation:number;length:number}
/** Coalesce aligned pieces for rendering only. A small authored expansion gap
 * is bridged visually; the collision/tyre support list remains unchanged. */
export function mergeCurbVisuals(curbs:CurbVisual[],maxGap=4.1):CurbVisual[]{
 const groups=new Map<string,{rotation:number;offset:number;segments:Array<{start:number;end:number}>}>();
 for(const curb of curbs){
  const angle=curb.rotation,c=Math.cos(angle),s=Math.sin(angle),offset=-curb.x*s+curb.y*c,along=curb.x*c+curb.y*s;
  const key=`${Math.round(angle*1e5)}:${Math.round(offset*100)}`;
  let group=groups.get(key);if(!group){group={rotation:angle,offset,segments:[]};groups.set(key,group);}
  group.segments.push({start:along-curb.length/2,end:along+curb.length/2});
 }
 const out:CurbVisual[]=[];
 for(const {rotation,offset,segments} of groups.values()){
  segments.sort((a,b)=>a.start-b.start);let start=segments[0].start,end=segments[0].end;
  const flush=()=>{const mid=(start+end)/2,c=Math.cos(rotation),s=Math.sin(rotation);out.push({x:mid*c-offset*s,y:mid*s+offset*c,rotation,length:end-start});};
  for(const segment of segments.slice(1)){if(segment.start-end<=maxGap)end=Math.max(end,segment.end);else{flush();start=segment.start;end=segment.end;}}
  flush();
 }
 return out;
}
