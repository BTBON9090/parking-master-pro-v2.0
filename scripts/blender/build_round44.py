"""Original game approximations: cargo trike and eight-axle TEL; no OEM engineering data."""
import os,sys,math
sys.path.insert(0,os.path.dirname(__file__))
import bpy
from mathutils import Vector
import build_round30_fleet as f
b=f.b
b.OUT_DOCS=os.path.join(b.ROOT,'docs','round44','vehicles');os.makedirs(b.OUT_DOCS,exist_ok=True)
s=f.spec('CARGO_TRIKE',4.8,1.8,2.3,3.05,.40,(.12,.40,.60),'trike')
# Reuse the authored three-wheel builder, preserving circular tyres and interior.
root,w=f.build(s)
# Raise the opaque lower doors and windscreen base for a commercial cab.
paint=bpy.data.materials['Paint']
for side in [-1,1]:
 b.box('CargoDoorLower',(.10,.88,.58),(side*.56,-.76,1.24),paint,bevel=.025,parent=root)
b.box('CargoWindscreenBase',(1.1,.11,.52),(0,-1.18,1.22),paint,bevel=.025,parent=root)
# Stamped ribs and upright cargo rails distinguish the working load bed.
for side in [-1,1]:
 for y in [.15,.85,1.55]:b.box('CargoRail',(.08,.065,.52),(side*.83,y,1.13),paint,parent=root)
 b.box('CargoTopRail',(.09,2.18,.08),(side*.83,1.05,1.42),paint,parent=root)
b.batch_static_parts(root);b.export_car(s,root)
cam=b.add_preview(bpy.context.scene,s)
b.render_preview(bpy.context.scene,s,cam,os.path.join(b.OUT_DOCS,'CARGO_TRIKE.png'),(8,-9,4),(0,0,1),50)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(b.OUT_DOCS,'CARGO_TRIKE.blend'))
# TEL: original simple cab, cylindrical transport tube and eight independently named axles.
b.reset_scene();root=bpy.data.objects.new('CarRoot',None);b.link_object(root)
s=f.spec('DF41',16.4,3.2,3.8,11.2,.64,(.20,.28,.14),'suv')
s.update(eye=(.75,-6.45,2.65),steering_center=(.75,-6.9,2.2),instrument_screen=(.75,-7.15,2.25))
colors={'Paint':(.20,.28,.14),'BlackTrim':(.028,.035,.025),'Tyre':(.04,.045,.04),'Rim':(.29,.34,.23),'Hub':(.22,.26,.19),'BrakeDisc':(.15,.16,.14),'Glass':(.18,.30,.33),'InteriorDark':(.08,.10,.08),'InteriorTrim':(.32,.36,.28),'Chrome':(.55,.61,.56),'Headlight':(.9,.93,.85),'Taillight':(.7,.04,.02),'InstrumentScreen':(.05,.14,.17)}
m={k:b.material(k,c,roughness=.8,alpha=.30 if k=='Glass' else 1) for k,c in colors.items()}
b.box('Body',(2.45,15.8,.36),(0,0,1.20),m['Paint'],bevel=.08,parent=root)
# Cabin panels keep all glazing apertures truly open.
for side in [-1,1]:
 b.box('CabLower',(0.15,2.4,1.0),(side*1.50,-6.7,1.75),m['Paint'],bevel=.05,parent=root)
 for y in [-7.88,-5.5]:b.box('CabPillar',(.16,.16,1.5),(side*1.5,y,2.45),m['Paint'],parent=root)
 b.box('GlassSide'+str(side),(.025,2.15,.8),(side*1.52,-6.7,2.65),m['Glass'],parent=root)
 b.box('SideMirrorPod',(.18,.18,.45),(side*1.68,-7.5,2.65),m['BlackTrim'],parent=root)
 b.box('SideMirrorLens',(.15,.025,.40),(side*1.68,-7.39,2.65),m['Chrome'],parent=root)
 b.box('Headlight'+str(side),(.48,.08,.22),(side*.95,-8.01,1.65),m['Headlight'],parent=root)
 b.box('Taillight'+str(side),(.30,.08,.18),(side*1.05,7.95,1.35),m['Taillight'],parent=root)
b.box('CabNose',(3.12,.18,.7),(0,-7.92,1.85),m['Paint'],bevel=.06,parent=root)
b.box('CabRoof',(3.16,2.6,.14),(0,-6.7,3.17),m['Paint'],bevel=.06,parent=root)
b.box('CabBack',(3.0,.12,1.7),(0,-5.45,2.30),m['Paint'],parent=root)
b.box('GlassWindshield',(2.8,.025,.8),(0,-7.94,2.65),m['Glass'],parent=root)
b.box('InteriorDashTop',(2.8,.45,.17),(0,-7.3,2.15),m['InteriorDark'],parent=root)
b.box('InteriorSeat',(.65,.65,.2),(.75,-6.35,1.72),m['InteriorDark'],parent=root)
b.box('InteriorSeatBack',(.65,.18,.80),(.75,-6.02,2.12),m['InteriorDark'],parent=root)
eye=bpy.data.objects.new('DriverEye',None);b.link_object(eye);eye.parent=root;eye.location=s['eye']
pivot=bpy.data.objects.new('SteeringWheelPivot',None);b.link_object(pivot);pivot.parent=root;pivot.location=s['steering_center'];pivot.rotation_mode='QUATERNION';pivot.rotation_quaternion=Vector(s['column_axis']).to_track_quat('Z','Y')
b.build_steering_wheel(s,pivot,m['InteriorDark'],m['InteriorTrim'],m['Chrome'],m['BlackTrim'])
b.box('InteriorInstrumentScreen',(.42,.025,.20),s['instrument_screen'],m['InstrumentScreen'],parent=root)
for i,y in enumerate([-5.6,-4.0,-2.4,-.8,.8,2.4,4.0,5.6]):
 label=('Front'+(str(i+1) if i else '')) if i<4 else ('Rear'+(str(i-3) if i>4 else ''))
 for side,lr in [(1,'L'),(-1,'R')]:
  wheel=f.wheel('Wheel'+label+lr,.39,.36,.64,6,m['Rim'],m['Tyre'],m['BrakeDisc'],m['Hub'],(side*1.37,y,.64),root,side)
  # Closed steel wheel faces suit the heavy transporter and save triangles;
  # retain the 24-sided round tyre profile on all sixteen wheels.
  for child in list(wheel.children):
   if '_Spoke' in child.name:bpy.data.objects.remove(child,do_unlink=True)
  vertices=[(side*.39*.46,.36*.90*math.cos(j*math.tau/16),.36*.90*math.sin(j*math.tau/16)) for j in range(16)]
  b.mesh_object('SteelWheelFace',vertices,[tuple(range(16))],m['Rim'],False,wheel)
  b.box('Fender',(.46,1.32,.08),(side*1.36,y,1.40),m['Paint'],parent=root)
launcher=bpy.data.objects.new('LauncherPivot',None);b.link_object(launcher);launcher.parent=root;launcher.location=(0,6.4,1.65)
tube=b.cylinder('TransportTube',.88,11.3,(0,-5.65,.95),m['Paint'],vertices=20,parent=launcher);tube.rotation_euler.x=math.pi/2
for y in [-1,-3.5,-6,-8.5,-10.5]:
 band=b.cylinder('TubeBand',.93,.12,(0,y,.95),m['BlackTrim'],vertices=20,parent=launcher);band.rotation_euler.x=math.pi/2
for side in [-1,1]:
 for y in [-4.8,6.4]:
  leg=bpy.data.objects.new('Outrigger'+str(side)+str(y),None);b.link_object(leg);leg.parent=root;leg.location=(side*.6,y,1.1);leg['side']=side
  b.box('SupportArm',(.9,.3,.25),(side*.25,0,0),m['Paint'],parent=leg)
  b.cylinder('SupportJack',.12,.65,(side*.6,0,-.28),m['Chrome'],vertices=10,parent=leg)
  b.box('SupportFoot',(.65,.65,.12),(side*.6,0,-.63),m['BlackTrim'],parent=leg)
root['liner_floor_m']=1.35;root['liner_belt_m']=2.20;root['liner_front_m']=7.3;root['liner_rear_m']=5.5
b.batch_static_parts(root);b.export_car(s,root)
cam=b.add_preview(bpy.context.scene,s)
b.render_preview(bpy.context.scene,s,cam,os.path.join(b.OUT_DOCS,'DF41.png'),(7,-9,4),(0,0,1.8),50)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(b.OUT_DOCS,'DF41.blend'))
