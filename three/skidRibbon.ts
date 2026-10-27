import * as THREE from 'three';
/** All four corners sample the current driving surface, including negative garage floors. */
export function createSkidRibbon(a:{x:number;z:number},b:{x:number;z:number},width:number,height:(x:number,z:number)=>number){
 const dx=b.x-a.x,dz=b.z-a.z,length=Math.max(.001,Math.hypot(dx,dz));
 const nx=-dz/length*width/2,nz=dx/length*width/2;
 const points=[[a.x+nx,a.z+nz],[a.x-nx,a.z-nz],[b.x+nx,b.z+nz],[b.x-nx,b.z-nz]];
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(([x,z])=>[x,height(x,z)+.22,z]),3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));
 geometry.setIndex([0,2,1,2,3,1]);geometry.computeVertexNormals();return geometry;
}
