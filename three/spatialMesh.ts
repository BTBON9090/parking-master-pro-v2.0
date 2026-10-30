/** Partition indexed triangles by their X/Z centroid. Geometry stays exact,
 * while each chunk receives its own frustum-culling bounds in every camera. */
export function splitSpatialMesh(positions:number[],indices:number[],colors?:number[],size=2400){
 const chunks=new Map<string,{positions:number[];indices:number[];colors?:number[];vertices:Map<number,number>}>();
 for(let n=0;n<indices.length;n+=3){
  const a=indices[n],b=indices[n+1],c=indices[n+2];
  const x=(positions[a*3]+positions[b*3]+positions[c*3])/3,z=(positions[a*3+2]+positions[b*3+2]+positions[c*3+2])/3;
  const key=Math.floor(x/size)+','+Math.floor(z/size);let chunk=chunks.get(key);
  if(!chunk){chunk={positions:[],indices:[],colors:colors?[]:undefined,vertices:new Map()};chunks.set(key,chunk);}
  for(const old of [a,b,c]){let next=chunk.vertices.get(old);if(next===undefined){next=chunk.positions.length/3;chunk.vertices.set(old,next);chunk.positions.push(positions[old*3],positions[old*3+1],positions[old*3+2]);if(colors)chunk.colors!.push(colors[old*3],colors[old*3+1],colors[old*3+2]);}chunk.indices.push(next);}
 }
 return [...chunks.values()].map(({positions,indices,colors})=>({positions,indices,colors}));
}
