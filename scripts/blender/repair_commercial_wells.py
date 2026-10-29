"""Repair current commercial GLBs in place through backed-up originals.
Game-calibrated swept tyre cavities, not OEM suspension geometry. No wheel,
axle, cockpit anchor, dimension or rig scaling. Blender export keeps extras.
"""
import bpy, bmesh, math, os, sys, json
from mathutils import Vector

ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
OUT=os.path.join(ROOT,'docs/overnight-2026-10-29/commercial')

def mesh(name,vs,faces,mat=None):
 data=bpy.data.meshes.new(name);data.from_pydata(vs,[],faces);data.update()
 obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj)
 if mat:obj.data.materials.append(mat)
 return obj

def capsule(name,x0,x1,ay,r,lo,hi):
 # Convex vertical capsule in YZ: tyre circle translated through suspension.
 points=[]
 for j in range(13):
  a=j*math.pi/12;points.append((ay+r*math.cos(a),hi+r*math.sin(a)))
 for j in range(13):
  a=math.pi+j*math.pi/12;points.append((ay+r*math.cos(a),lo+r*math.sin(a)))
 n=len(points);vs=[(x,y,z) for x in [x0,x1] for y,z in points]
 faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
 faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 return mesh(name,vs,faces)

def box(name,dimensions,location,mat):
 bpy.ops.mesh.primitive_cube_add(size=1,location=location);o=bpy.context.object;o.name=name
 o.dimensions=dimensions;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 o.data.materials.append(mat);return o

def boolean(obj,cutter):
 bpy.context.view_layer.objects.active=obj
 mod=obj.modifiers.new('Swept tyre clearance','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
 bpy.ops.object.modifier_apply(modifier=mod.name)

def render(label,filename,L,H):
 scene=bpy.context.scene;scene.render.engine='BLENDER_WORKBENCH'
 scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL';scene.display.shading.show_shadows=True
 scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
 data=bpy.data.cameras.new('AuditCamera');camera=bpy.data.objects.new('AuditCamera',data);scene.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO';data.ortho_scale=L*1.23
 for view,loc,target in [('side',(14,0,H*.6),(0,0,H*.45)),('front',(10,-12,6),(0,0,H*.45))]:
  camera.location=loc;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
  scene.render.filepath=os.path.join(OUT,f'{filename}-{label}-{view}.png');bpy.ops.render.render(write_still=True)
 bpy.data.objects.remove(camera,do_unlink=True)

report=[]
for filename,L,W,H,r,bump in [('training-midibus',6.4,2.18,2.65,.43,.20),('training-light-truck',7.2,2.28,2.85,.46,.24)]:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=os.path.join(OUT,'originals',filename+'.glb'))
 root=bpy.data.objects['CarRoot'];assert not root.get('authored_wheel_cabin_liner')
 wheels=[bpy.data.objects[n] for n in ['WheelFrontL','WheelFrontR','WheelRearL','WheelRearR']]
 assert all(abs(o.location.z-r)<.001 for o in wheels)
 render('before',filename,L,H)
 # Replace the runtime flat cube liner with an authored, recessed liner.
 mat=bpy.data.materials.get('InteriorDark');half=W*.425;rear=L*.40;front=-1.02;floor=.36;top=H*.47-.10
 panels=[box('InteriorWheelCabinFloor',(half*2,rear-front,.02),(0,(rear+front)/2,floor),mat)]
 for side in [-1,1]:panels.append(box('InteriorWheelCabinSide',(.02,rear-front,top-floor),(side*half,(rear+front)/2,(top+floor)/2),mat))
 for y in [front,rear]:panels.append(box('InteriorWheelCabinEnd',(half*2,.02,top-floor),(0,y,(top+floor)/2),mat))
 for o in panels:o.parent=root
 targets=[o for o in root.children_recursive if o.type=='MESH' and (o.name=='Body' or o.name.startswith(('BodyMesh','Interior_CarRoot_InteriorDark','Interior_CarRoot_InteriorLeather','Surface_CarRoot_Cladding','InteriorWheelCabin','InteriorSeatBase')))]
 # glTF duplicates vertices at normals/material seams. Restore the solid
 # box/shell topology before asking Boolean to classify inside and outside.
 for o in targets:
  bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
  bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();o.data.update()
 # The leather batch combines overlapping door cards and seat boxes. Treat
 # each closed island independently so a later Boolean cannot refill a hole
 # made in an overlapping part by an earlier cutter; rejoin before export.
 batches=[]
 for o in targets[:]:
  if not o.name.startswith('Interior_CarRoot_'):continue
  name=o.name
  bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='LOOSE');bpy.ops.object.mode_set(mode='OBJECT')
  pieces=list(bpy.context.selected_objects);targets.remove(o);targets.extend(pieces);batches.append((name,pieces))
 for w in wheels:
  side=1 if w.location.x>0 else -1
  inner=abs(w.location.x)-.45;outer=W/2+.15
  cutter=capsule('TyreCavity',side*inner,side*outer,w.location.y,r+.045,r-.13,r+bump)
  # Recalculate normals even on the mirrored cutter.
  bpy.context.view_layer.objects.active=cutter;cutter.select_set(True)
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
  for o in targets:boolean(o,cutter)
  bpy.data.objects.remove(cutter,do_unlink=True)
  # Upper wheel-well + inboard wall. These close the cabin above/alongside
  # the swept tyre while leaving the original circular tyre fully visible.
  outer=W/2-.035;radius=r+.052;cap=[]
  for j in range(13):
   a=j*math.pi/12;cap.append((w.location.y+radius*math.cos(a),r+bump+radius*math.sin(a)))
  cap += [(w.location.y-radius,.20),(w.location.y+radius,.20)]
  n=len(cap);vs=[(side*x,y,z) for x in [inner-.01,outer] for y,z in cap]
  # Leave the bottom open to the road; a bottom strip would cross the tyre.
  faces=[tuple(range(n))]+[(i,i+1,i+1+n,i+n) for i in range(n-2)]+[(n-1,0,n,2*n-1)]
  well=mesh('InteriorWheelHousing',vs,faces,mat);well.parent=root
 for name,pieces in batches:
  bpy.ops.object.select_all(action='DESELECT')
  for o in pieces:o.select_set(True)
  bpy.context.view_layer.objects.active=pieces[0];bpy.ops.object.join();pieces[0].name=name
 root['authored_wheel_cabin_liner']=True
 root['wheel_well_bump_m']=bump
 bpy.context.view_layer.update()
 triangles=0
 for o in root.children_recursive:
  if o.type=='MESH':o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
 report.append({'file':filename,'triangles':triangles,'wheelRadiusM':r,'bumpM':bump,'interiorBatches':[name for name,_ in batches]})
 assert triangles<8000,(filename,triangles)
 bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,'public/models/cars',filename+'.glb'),export_format='GLB',export_apply=True,export_extras=True)
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,filename+'.blend'))
 render('after',filename,L,H)
with open(os.path.join(OUT,'changes.json'),'w') as f:json.dump(report,f,indent=2)
