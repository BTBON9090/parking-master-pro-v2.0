import bpy,math,os
from mathutils import Vector
root=os.getcwd();out=os.path.join(root,'public/thumbnails')
for key,file in [('SUV','onvo-l80'),('SEAL08','byd-seal-08'),('TAI7','fangchengbao-tai7'),('LI_I9','li-i9'),('N90','xiaomi-n90'),('TRUCK','trail-pickup')]:
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 bpy.ops.import_scene.gltf(filepath=os.path.join(root,'public/models/cars',file+'.glb'))
 sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=16;sc.cycles.use_denoising=True
 sc.render.resolution_x=640;sc.render.resolution_y=360;sc.render.resolution_percentage=100
 sc.world.color=(.25,.25,.25)
 bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object
 mat=bpy.data.materials.new('Thumbnail Floor');mat.diffuse_color=(.06,.085,.10,1);floor.data.materials.append(mat)
 for loc,power,size in [((4,-3,8),1400,5),((-4,2,5),900,4)]:
  bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add(location=(7,-8,5));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.85))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=7;sc.camera=cam
 sc.render.image_settings.file_format='PNG';sc.render.filepath=os.path.join(out,key+'.png');bpy.ops.render.render(write_still=True)
 print('THUMBNAIL',key,flush=True)
