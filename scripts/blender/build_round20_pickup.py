"""Original fictional 2.4T pickup; no manufacturer geometry or performance claims."""
import os,sys,math
sys.path.insert(0,os.path.dirname(__file__))
import build_round9_vehicles as b
import bpy
b.OUT_DOCS=os.path.join(b.ROOT,'docs','round20','pickup');os.makedirs(b.OUT_DOCS,exist_ok=True)
s=b.l80_spec()
s.update(name='TrailPickup',file='trail-pickup.glb',length=5.46,width=1.97,clearance=.23,beltline=1.18,roof=1.85,
 front_axle=-1.63,rear_axle=1.63,half_track_front=.84,half_track_rear=.84,tire_radius=.39,front_wheel_radius=.39,rear_wheel_radius=.39,tire_width=.265,rim_radius=.23,spokes=6,
 cabin_front=-1.05,cabin_rear=.85,roof_half_width=.73,b_pillar_y=.64,side_windows=[(-.94,.60)],suv=False,
 paint=(.37,.25,.11),paint_dark=(.08,.06,.04),leather=(.25,.29,.31),interior_trim=(.12,.15,.17),
 eye=(.365,.10,1.41),steering_center=(.365,-.50,1.12),column_start=(.365,-.74,1.06),
 instrument_screen=(.365,-.685,1.20),center_screen=(0,-.66,1.19),bumper_z=.57,lamp_z=1.01,
 windshield_corners=[(-.73,-1.03,1.205),(.73,-1.03,1.205),(.67,-.47,1.77),(-.67,-.47,1.77)],
 rear_window_corners=[(-.61,.72,1.75),(.61,.72,1.75),(.65,.87,1.30),(-.65,.87,1.30)])
s['stations']=[(-2.73,.77,.74,.40,1.02,1.10),(-2.62,.94,.90,.27,1.12,1.20),(-2.2,.985,.96,.23,1.18,1.28),(-1.6,.985,.96,.23,1.18,1.29),(-1.05,.985,.86,.23,1.18,1.32),(-.46,.985,.74,.23,1.18,1.83),(-.1,.985,.73,.23,1.18,1.85),(.63,.985,.73,.23,1.18,1.85),(.86,.985,.76,.23,1.18,1.79),(.99,.985,.93,.23,1.18,1.20),(1.2,.985,.94,.23,1.18,1.20),(2.2,.985,.94,.23,1.18,1.20),(2.65,.96,.93,.28,1.16,1.20),(2.73,.87,.84,.38,1.10,1.16)]
original=b.build_car
def pickup(spec):
 root,wheels=original(spec)
 body=bpy.data.objects.get('Body')
 b.apply_boolean(body,b.box('CargoCut',(1.64,1.61,1.1),(0,1.83,1.40),None))
 dark=bpy.data.materials['InteriorDark'];rubber=bpy.data.materials['BlackTrim']
 for o in list(root.children_recursive):
  if o.name.startswith(('InteriorRearBench','InteriorRearBack','InteriorRearHeadrest','DoorHandle2','RoofRail')):
   bpy.data.objects.remove(o,do_unlink=True)
 # The cargo opening is cut into the connected body; the liner has a floor,
 # sidewalls and wheel tubs, rather than a stack of external body boxes.
 b.box('BedFloor',(1.62,1.55,.035),(0,1.83,.86),dark,parent=root)
 for side in [-1,1]:
  b.box('BedSideLiner',(.025,1.55,.29),(side*.81,1.83,1.01),dark,parent=root)
  b.box('BedRail',(.07,1.61,.035),(side*.91,1.83,1.205),rubber,bevel=.01,parent=root)
  b.box('BedWheelTub',(.19,.80,.19),(side*.73,1.63,.94),dark,bevel=.04,parent=root)
 for y in [1.05,2.61]: b.box('BedEndLiner',(1.62,.025,.29),(0,y,1.01),dark,parent=root)
 for i in range(9):b.box('BedRib',(.025,1.50,.012),(-.64+i*.16,1.83,.884),rubber,parent=root)
 root['liner_rear_m']=-.83;root['liner_belt_m']=1.18;root['calibration']='Original fictional pickup; simulation tuning'
 return root,wheels
b.build_car=pickup
b.build_and_export(s)
