"""Restore 1.06m heavy-truck tyres from the original authored GLB and cut wheel-well clearances.
Wheel radius is an approximate game calibration, not an OEM specification.
Run Blender background with -- <source.glb> <destination.glb> <report-dir>.
"""
import bpy,sys,math,os
from mathutils import Vector
src,dst,out=sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
root=bpy.data.objects['CarRoot']
if root.get('round38_wheel_diameter_factor'):raise RuntimeError('Use the original 1.06m tyre source, not the enlarged conversion')
root['round39_tyre_radius_m']=.53
trailer=bpy.data.objects['TrailerRoot']
tractor=[o for o in root.children if o.type=='EMPTY' and o.name in ['WheelFrontL','WheelFrontR','WheelRearL','WheelRearR','WheelRear2L','WheelRear2R']]
trailing=[o for o in trailer.children if o.type=='EMPTY' and o.name.startswith('TrailerWheel')]
assert len(tractor)==6 and len(trailing) in (8,12),(len(tractor),len(trailing))
# Preserve original axle locations and wheel widths; these tyres are restored from the smaller-wheel source.
axles=sorted(set(round(o.location.y,4) for o in trailing));adjusted=axles[:]
bpy.context.view_layer.update()
# Open radial wheel-wells through the existing external shell and trailer shell.
# Leave an 8cm margin around the original 0.53m tyre at rest.
def cut(obj,y):
 bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.61,depth=3.15,location=(0,y,.53),rotation=(0,math.pi/2,0))
 cutter=bpy.context.object
 bpy.context.view_layer.objects.active=obj
 mod=obj.modifiers.new('Round39 wheel arch','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
 bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
for name in ['Body','Surface_CarRoot_BlackTrim']:
 obj=bpy.data.objects.get(name)
 if obj:
  for y in sorted(set(round(o.location.y,4) for o in tractor)):cut(obj,y)
# Some imported open cab shells are non-manifold. Blender's exact boolean may
# create cutter end-caps outside the original cab width, covering the wheel.
# Trim those extraneous caps; the authored cab never extends past 1.30 m.
import bmesh
body=bpy.data.objects['Body'];bm=bmesh.new();bm.from_mesh(body.data)
for direction in (1,-1):
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
   plane_co=(direction*1.30,0,0),plane_no=(direction,0,0),clear_outer=True,clear_inner=False)
# Do not leave a circular fender sleeve below the axle: only the upper
# wheel-well lip is meaningful on a truck. These faces are generated from the
# cutter's faceted cylinder rather than from the source vehicle shell.
axle_ys=sorted(set(round(o.location.y,4) for o in tractor));drop=[]
for face in bm.faces:
 if all(v.co.z < .5301 for v in face.verts):
  for ay in axle_ys:
   radii=[math.hypot(v.co.y-ay,v.co.z-.53) for v in face.verts]
   if all(.595 <= r <= .615 for r in radii):drop.append(face);break
bmesh.ops.delete(bm,geom=drop,context='FACES');print('LOWER_CUTTER_WALLS_REMOVED',len(drop))
# The imported long-nose cab is an open mesh; exact Boolean can leave thin
# internal triangles inside the wheel volume. Remove any remaining triangles
# sampled within the wheel envelope, not the complete cab shell.
bmesh.ops.triangulate(bm,faces=list(bm.faces));inside=[]
for face in bm.faces:
 v=[p.co for p in face.verts]
 if len(v)!=3:continue
 for ay in axle_ys:
  found=False
  for i in range(9):
   for j in range(9-i):
    q=(v[0]*i+v[1]*j+v[2]*(8-i-j))/8
    if abs(q.x)>.76 and math.hypot(q.y-ay,q.z-.53)<.565:found=True;break
   if found:break
  if found:inside.append(face);break
bmesh.ops.delete(bm,geom=inside,context='FACES');print('WHEEL_INTERIOR_FACES_REMOVED',len(inside))
bm.to_mesh(body.data);bm.free();body.data.update()
shell=bpy.data.objects['TrailerShell']
for y in adjusted:cut(shell,y+trailer.location.y)
# Preserve the 8k-triangle mobile budget without simplifying tyre silhouettes.
# Each small trailer spoke is a box; it only needs its visible outboard face.
# Brake discs sit behind the rims and tolerate a modest polygon reduction.
spokes=0;discs=0
for o in list(trailer.children_recursive):
 if o.type!='MESH':continue
 if o.name.startswith('TrailerWheel') and '_Spoke' in o.name:
  vs=[v.co.copy() for v in o.data.vertices]
  if not vs:continue
  side=1 if o.location.x>=0 else -1
  x=max(v.x for v in vs) if side>0 else min(v.x for v in vs)
  y0,y1=min(v.y for v in vs),max(v.y for v in vs);z0,z1=min(v.z for v in vs),max(v.z for v in vs)
  verts=[(x,y0,z0),(x,y1,z0),(x,y1,z1),(x,y0,z1)]
  face=(0,1,2,3) if side>0 else (3,2,1,0)
  mat=list(o.data.materials);mesh=bpy.data.meshes.new(o.name+'Flat');mesh.from_pydata(verts,[],[face]);mesh.update()
  for m in mat:mesh.materials.append(m)
  o.data=mesh;spokes+=1
 elif o.name.startswith('TrailerWheel') and '_BrakeDisc' in o.name:
  bpy.context.view_layer.objects.active=o
  mod=o.modifiers.new('Hidden brake polygon budget','DECIMATE');mod.ratio=.5
  bpy.ops.object.modifier_apply(modifier=mod.name);discs+=1
print('TRAILER_POLYGON_REDUCTION',spokes,discs)
# Articulated geometry remains at ground level: wheel centre equals tyre radius.
for o in tractor+trailing:assert abs(o.location.z-.53)<1e-4
os.makedirs(os.path.dirname(dst),exist_ok=True);os.makedirs(out,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=dst,export_format='GLB',export_apply=True,export_extras=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out,os.path.basename(dst)+'.blend'))
# Independent workbench previews from side / 3/4 front and rear, plus top.
scene=bpy.context.scene;scene.render.engine='BLENDER_WORKBENCH';scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL';scene.display.shading.show_shadows=True;scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
camera_data=bpy.data.cameras.new('AuditCamera');camera=bpy.data.objects.new('AuditCamera',camera_data);scene.collection.objects.link(camera);scene.camera=camera;camera_data.type='ORTHO';camera_data.ortho_scale=25 if len(trailing)==12 else 20
centre=Vector((0,5.5 if len(trailing)==12 else 4.0,1.6))
for name,loc in [('side',(24,centre.y,5)),('front',(19,-16,11)),('rear',(-19,25,11)),('top',(0,centre.y,30))]:
 camera.location=loc;camera.rotation_euler=(centre-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=os.path.join(out,os.path.basename(dst).replace('.glb','')+'-'+name+'.png');bpy.ops.render.render(write_still=True)
print('ROUND39_DONE',dst,'tractor',len(tractor),'trailer',len(trailing),'axles',axles,'adjusted',adjusted)
