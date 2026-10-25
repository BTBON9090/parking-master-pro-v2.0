import bpy, json
from pathlib import Path
root=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'public/models/cars/concept-car.glb'))
for name in ['BodyUnderside','WheelFrontL','WheelFrontR','InteriorSteeringWheel02']:
 obj=bpy.data.objects.get(name)
 print('ASSET_NODE',json.dumps({'name':name,'parent':obj.parent.name if obj.parent else None,'rotation_mode':obj.rotation_mode,'rotation':list(obj.rotation_quaternion),'scale':list(obj.scale),'position':list(obj.matrix_world.translation),'dimensions':list(obj.dimensions)}))
