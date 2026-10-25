import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** One bounded subdivision pass: soften imported body corners without a high-poly asset.
 * Work across material seams in vehicle space, preserving glass/paint alignment and UVs.
 * Wheels have already been detached into their steering/rolling rigs by the caller.
 */
export function softenBodyGeometry(root: THREE.Object3D, maxOffset = 0.45) {
  root.updateWorldMatrix(true, true);
  const meshes: THREE.Mesh[] = [];
  root.traverse(node => { if (node instanceof THREE.Mesh) meshes.push(node); });
  const points: THREE.Vector3[] = [], lookup = new Map<string, number>();
  const neighbours: Set<number>[] = [];
  const edges = new Map<string, {a:number;b:number;opposite:Set<number>}>();
  const edgeKey = (a:number,b:number) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const records = meshes.map(mesh => {
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const ids:number[] = [];
    for(let i=0;i<position.count;i++) {
      const point = new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
      const key = `${point.x.toFixed(4)},${point.y.toFixed(4)},${point.z.toFixed(4)}`;
      let id = lookup.get(key);
      if(id===undefined) { id=points.length;lookup.set(key,id);points.push(point);neighbours.push(new Set()); }
      ids.push(id);
    }
    const triangles:number[][]=[];
    const count=geometry.index?.count??position.count;
    for(let i=0;i<count;i+=3) {
      const tri=[0,1,2].map(k=>geometry.index?.getX(i+k)??i+k);triangles.push(tri);
      const [a,b,c]=tri.map(v=>ids[v]);
      for(const [u,v,w] of [[a,b,c],[b,c,a],[c,a,b]]) {
        if(u===v)continue;
        neighbours[u].add(v);neighbours[v].add(u);
        const key=edgeKey(u,v),edge=edges.get(key)??{a:u,b:v,opposite:new Set<number>()};
        edge.opposite.add(w);edges.set(key,edge);
      }
    }
    return {mesh,geometry,ids,triangles,inverse:mesh.matrixWorld.clone().invert()};
  });
  const bounded=(base:THREE.Vector3,target:THREE.Vector3)=>base.clone().add(target.sub(base).clampLength(0,maxOffset));
  const moved=points.map((point,id)=>{
    const boundary=[...neighbours[id]].filter(other=>edges.get(edgeKey(id,other))?.opposite.size===1);
    if(boundary.length===2) return bounded(point,point.clone().multiplyScalar(.75).addScaledVector(points[boundary[0]],.125).addScaledVector(points[boundary[1]],.125));
    if(boundary.length || neighbours[id].size<3)return point.clone();
    const count=neighbours[id].size,beta=count===3?3/16:3/(8*count);
    const target=point.clone().multiplyScalar(1-count*beta);
    for(const other of neighbours[id])target.addScaledVector(points[other],beta);
    return bounded(point,target);
  });
  const midpoints=new Map<string,THREE.Vector3>();
  edges.forEach((edge,key)=>{
    const mid=points[edge.a].clone().add(points[edge.b]).multiplyScalar(.5);
    const opposite=[...edge.opposite];
    midpoints.set(key,opposite.length===2?bounded(mid,mid.clone().multiplyScalar(.75).addScaledVector(points[opposite[0]],.125).addScaledVector(points[opposite[1]],.125)):mid);
  });
  for(const {mesh,geometry,ids,triangles,inverse} of records) {
    const names=Object.keys(geometry.attributes).filter(name=>name!=='normal'&&name!=='tangent'&&name!=='position');
    const arrays:Record<string,number[]>={position:[]};names.forEach(name=>arrays[name]=[]);
    const output=new THREE.BufferGeometry();
    const emit=(a:number,b?:number)=>{
      const p=(b===undefined?moved[ids[a]]:midpoints.get(edgeKey(ids[a],ids[b]))??points[ids[a]]).clone().applyMatrix4(inverse);
      arrays.position.push(p.x,p.y,p.z);
      for(const name of names) {
        const attr=geometry.getAttribute(name);
        for(let c=0;c<attr.itemSize;c++) {
          const av=attr.getComponent(a,c),bv=b===undefined?av:attr.getComponent(b,c);
          arrays[name].push((av+bv)*.5);
        }
      }
    };
    triangles.forEach(([a,b,c],i)=>{
      emit(a);emit(a,b);emit(c,a);
      emit(b);emit(b,c);emit(a,b);
      emit(c);emit(c,a);emit(b,c);
      emit(a,b);emit(b,c);emit(c,a);
      const group=geometry.groups.find(g=>i*3>=g.start&&i*3<g.start+g.count);
      if(group)output.addGroup(i*12,12,group.materialIndex);
    });
    output.setAttribute('position',new THREE.Float32BufferAttribute(arrays.position,3));
    for(const name of names)output.setAttribute(name,new THREE.Float32BufferAttribute(arrays[name],geometry.getAttribute(name).itemSize));
    mesh.geometry=mergeVertices(output,1e-5);
    mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
    output.dispose();
  }
}
