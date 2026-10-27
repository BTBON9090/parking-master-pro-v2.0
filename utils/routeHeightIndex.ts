/** Exact nearest-polyline query with bounding-volume pruning. Used by dense
 * terrain meshes and four tyre samplers; avoids scanning the whole route. */
export interface HeightPoint{x:number;y:number;h:number}
type Segment={a:HeightPoint;b:HeightPoint;minX:number;maxX:number;minY:number;maxY:number};
type Node={minX:number;maxX:number;minY:number;maxY:number;left?:Node;right?:Node;items?:Segment[]};
export class RouteHeightIndex{
 private root:Node;
 constructor(points:HeightPoint[]){
 const segments=points.slice(1).map((b,i)=>({a:points[i],b,minX:Math.min(points[i].x,b.x),maxX:Math.max(points[i].x,b.x),minY:Math.min(points[i].y,b.y),maxY:Math.max(points[i].y,b.y)}));
 const build=(items:Segment[]):Node=>{const box={minX:Math.min(...items.map(s=>s.minX)),maxX:Math.max(...items.map(s=>s.maxX)),minY:Math.min(...items.map(s=>s.minY)),maxY:Math.max(...items.map(s=>s.maxY))};if(items.length<=8)return {...box,items};const axis=box.maxX-box.minX>box.maxY-box.minY?'x':'y';items.sort((a,b)=>(a.a[axis]+a.b[axis])-(b.a[axis]+b.b[axis]));const mid=items.length>>1;return{...box,left:build(items.slice(0,mid)),right:build(items.slice(mid))};};
 this.root=build(segments);
 }
 nearest(x:number,y:number){let best=Infinity,height=0;
 const bound=(n:Node)=>Math.max(n.minX-x,0,x-n.maxX)**2+Math.max(n.minY-y,0,y-n.maxY)**2;
 const visit=(n:Node)=>{if(bound(n)>best)return;if(n.items){for(const {a,b} of n.items){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1))),d=(x-a.x-t*dx)**2+(y-a.y-t*dy)**2;if(d<best){best=d;height=a.h+(b.h-a.h)*t;}}}else{const a=n.left!,b=n.right!;if(bound(a)<bound(b)){visit(a);visit(b);}else{visit(b);visit(a);}}};visit(this.root);return{distance:Math.sqrt(best),height};}
}
