"""Repair the existing batched assets; retain all topology, materials and rigs.
Run with Blender -b --python scripts/blender/fix_round15_sills.py.
The connected thin sill islands are shortened between the existing arches.
"""
import bpy,sys,os,json,math
from mathutils import Vector
sys.path.insert(0,os.path.dirname(__file__))
import build_round9_vehicles as base
OUT=os.path.join(base.ROOT,'docs','round15')
os.makedirs(OUT,exist_ok=True)
assets=[('L80','round9','onvo-l80.glb'),('Seal08','round9','byd-seal-08.glb'),
 ('Tai7','round13/vehicles','fangchengbao-tai7.glb'),('LiI9','round13/vehicles','li-i9.glb'),('N90','round13/vehicles','xiaomi-n90.glb')]
report=[]
for name,folder,file in assets:
 bpy.ops.wm.open_mainfile(filepath=os.path.join(base.ROOT,'docs',folder,'Blender-'+name+'.blend'))
 root=bpy.data.objects['CarRoot'];scene=bpy.context.scene
 front=bpy.data.objects['WheelFrontL'];rear=bpy.data.objects['WheelRearL']
 # Max authored arch radius plus its trim. This also exceeds the yaw-swept
 # tyre half-diagonal. No part of the outer sill should cross an arch mouth.
 gap=.055;trim=.028 if name=='Tai7' else .018
 if name in ('L80','Seal08'):
  spec=base.l80_spec() if name=='L80' else base.seal_spec();gap=spec['arch_gap'];trim=spec['arch_trim']
 low=front.location.y+max(front.location.z+gap+trim,math.hypot(front.location.z,.1375)+.045)
 high=rear.location.y-max(rear.location.z+gap+trim,math.hypot(rear.location.z,.1375)+.045)
 changed=[]
 for o in root.children:
  if o.type!='MESH' or o.name not in ('Surface_CarRoot_BlackTrim','Surface_CarRoot_Cladding'):continue
  vertices=o.data.vertices;adj=[[] for _ in vertices]
  for e in o.data.edges:
   a,b=e.vertices;adj[a].append(b);adj[b].append(a)
  unseen=set(range(len(vertices)));inv=o.matrix_world.inverted()
  while unseen:
   seed=unseen.pop();ids=[seed];queue=[seed]
   while queue:
    for j in adj[queue.pop()]:
     if j in unseen:unseen.remove(j);ids.append(j);queue.append(j)
   ps=[o.matrix_world@vertices[i].co for i in ids]
   mins=[min(p[a] for p in ps) for a in range(3)];maxs=[max(p[a] for p in ps) for a in range(3)]
   size=[maxs[i]-mins[i] for i in range(3)]
   if not(size[0]<.08 and size[1]>1 and size[2]<.23 and maxs[2]<.75 and abs((mins[0]+maxs[0])/2)>.7):continue
   lo,hi=max(low,mins[1]),min(high,maxs[1])
   if lo<=mins[1]+1e-5 and hi>=maxs[1]-1e-5:continue
   for i,p in zip(ids,ps):
    p.y=lo+(p.y-mins[1])/size[1]*(hi-lo);vertices[i].co=inv@p
   changed.append({'mesh':o.name,'vertices':len(ids),'oldY':[mins[1],maxs[1]],'newY':[lo,hi]})
  o.data.update()
 root['sill_clearance_revision']='round15-axle-envelope'
 scene.render.resolution_x=1200;scene.render.resolution_y=700;scene.render.resolution_percentage=100
 cam=scene.camera;cam.data.type='ORTHO';cam.data.ortho_scale=6.2
 cam.location=(9,-.5,1.35);cam.rotation_euler=(Vector((0,0,.85))-cam.location).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=os.path.join(OUT,name+'-blender-side.png')
 bpy.ops.render.render(write_still=True)
 base.export_car({'file':file},root)
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'Blender-'+name+'.blend'))
 triangles=0
 for o in root.children_recursive:
  if o.type=='MESH':o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
 assert triangles+10<8000
 assert len(changed)>=2
 report.append({'car':name,'triangles':triangles,'sillIntervalM':[low,high],'changes':changed})
 print('FIXED_SILLS',name,len(changed),triangles,flush=True)
with open(os.path.join(OUT,'sill-repair.json'),'w') as f:json.dump(report,f,indent=2)
