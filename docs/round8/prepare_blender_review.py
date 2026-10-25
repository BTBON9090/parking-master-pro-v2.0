"""Build a local visual reference, without changing the licensed source GLB."""
import bpy, json, struct, math
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[2]
out=root/'docs/round8'
raw=(root/'public/models/cars/concept-car.glb').read_bytes()
json_len=struct.unpack_from('<I',raw,12)[0]
data=json.loads(raw[20:20+json_len])
for n in data['nodes']:
 if n.get('name') in ['WheelFrontL','WheelFrontR','WheelRearL','WheelRearR']:
  n['rotation']=[0,0,0,1]
  n['scale']=[1,1,1]
scale=4.57/4.357385993003845
center_z=(-1.940231204032898+2.4171547889709473)/2
scene=data['scenes'][data.get('scene',0)]
data['nodes'].append({'name':'Concept_normalized_reference','children':scene['nodes'],'scale':[scale]*3,'translation':[0,.0002411008*scale,-center_z*scale]})
scene['nodes']=[len(data['nodes'])-1]
j=json.dumps(data,separators=(',',':')).encode()
j+=b' '*((-len(j))%4)
bin_chunk=raw[20+json_len:]
reference=struct.pack('<III',0x46546c67,2,20+len(j)+len(bin_chunk))+struct.pack('<II',len(j),0x4e4f534a)+j+bin_chunk
p=out/'concept-neutral-reference.glb';p.write_bytes(reference)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(p))
model_objects=list(bpy.context.scene.objects)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
scene.world=bpy.data.worlds.new('Inspection daylight')
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.35,.4,.5,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
bpy.ops.object.light_add(type='SUN',location=(3,-4,6))
bpy.context.object.rotation_euler=(.4,-.5,-.5)
bpy.context.object.data.energy=2.5
bpy.ops.object.camera_add()
cam=bpy.context.object;cam.name='Driver_eye_same_as_game'
cam.location=(0,-(.28-center_z)*scale,(1+.0002411008)*scale)
direction=Vector((0,-math.cos(math.radians(8)),-math.sin(math.radians(8))))
cam.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
cam.data.sensor_fit='VERTICAL';cam.data.angle=math.radians(66);cam.data.clip_start=.01
scene.camera=cam
for name in ['WheelFrontL','WheelFrontR','WheelRearL','WheelRearR']:
 wheel=bpy.data.objects.get(name)
 empty=bpy.data.objects.new(name+'_AXLE_REFERENCE',None)
 scene.collection.objects.link(empty)
 empty.location=wheel.matrix_world.translation
 empty.empty_display_type='ARROWS';empty.empty_display_size=.15
 empty['purpose']='Axle reference; runtime binds steer about vertical and roll about axle.'
scene['purpose']='Neutral proportion and driver-eye reference. Runtime rig lives in three/conceptVehicle.ts; do not replace production asset with this file.'
bpy.ops.object.select_all(action='DESELECT')
for obj in model_objects:
 if obj.type=='MESH':obj.select_set(True)
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.shading.type='MATERIAL'
   area.spaces.active.region_3d.view_distance=6
   area.spaces.active.region_3d.view_location=(0,0,.6)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'Concept-GT-inspection.blend'))
print('SAVED_REFERENCE',out/'Concept-GT-inspection.blend')
