"""Three original connected-shell heavy vehicles. Public reference vs game estimates in docs/round31."""
import os,sys,math
sys.path.insert(0,os.path.dirname(__file__))
import bpy
from mathutils import Vector
import build_round30_fleet as f
b=f.b
b.OUT_DOCS=os.path.join(b.ROOT,'docs','round31','vehicles');os.makedirs(b.OUT_DOCS,exist_ok=True)
base_batch=b.batch_static_parts
# Keep detachable exterior assemblies separate while batching interior trims.
def batch(root):
 kept=[]
 for o in list(root.children):
  if o.type=='MESH' and o.name.startswith(('Headlight','Taillight','Indicator','SideMirror','DoorPanel','Exhaust','TrackBelt')):
   hold=bpy.data.objects.new(o.name+'Assembly',None);b.link_object(hold);hold.parent=root;o.parent=hold;kept.append(hold)
 for o in root.children_recursive:
  if o.type=='MESH':
   for i,mat in enumerate(o.data.materials):
    if mat is None:o.data.materials[i]=bpy.data.materials['Paint']
 base_batch(root)
b.batch_static_parts=batch

def setup(s):
 b.reset_scene();root=bpy.data.objects.new('CarRoot',None);b.link_object(root)
 colors={'Paint':s['paint'],'BlackTrim':(.025,.030,.035),'Tyre':(.025,.029,.032),'Rim':(.42,.45,.46),'Hub':(.34,.37,.39),'BrakeDisc':(.12,.14,.15),'Glass':(.16,.28,.34),'InteriorDark':(.08,.10,.12),'InteriorTrim':(.45,.48,.5),'InteriorLeather':(.24,.22,.17),'Chrome':(.65,.67,.68),'Headlight':(.90,.95,.90),'Taillight':(.6,.04,.015),'InstrumentScreen':(.07,.16,.19)}
 mats={k:b.material(k,v,roughness=.78,alpha=.35 if k=='Glass' else 1) for k,v in colors.items()}
 f.active=s
 return root,mats

def cabin(root,m,s):
 eye=bpy.data.objects.new('DriverEye',None);b.link_object(eye);eye.parent=root;eye.location=s['eye']
 pivot=bpy.data.objects.new('SteeringWheelPivot',None);b.link_object(pivot);pivot.parent=root;pivot.location=s['steering_center'];pivot.rotation_mode='QUATERNION';pivot.rotation_quaternion=Vector(s['column_axis']).to_track_quat('Z','Y')
 b.build_steering_wheel(s,pivot,m['InteriorDark'],m['InteriorTrim'],m['Chrome'],m['BlackTrim'])
 b.box('InteriorInstrumentScreen',(.36,.025,.18),s['instrument_screen'],m['InstrumentScreen'],parent=root)
 b.box('InteriorSeat',(.54,.55,.15),(s['eye'][0],s['eye'][1]+.05,s['eye'][2]-.65),m['InteriorLeather'],bevel=.04,parent=root)
 root['liner_floor_m']=s['eye'][2]-1.1;root['liner_belt_m']=s['eye'][2]-.30;root['liner_front_m']=-s['eye'][1]+.70;root['liner_rear_m']=-s['eye'][1]-.50;root['seat_lift_game_units']=0

def custom(s):
 if s['name']=='US22':
  root,w=f.build(s);L=s['length'];m=bpy.data.materials
  # Full-length long-nose cab shell; gently crowned engine hood and sleeper.
  old=bpy.data.objects.get('Body');bpy.data.objects.remove(old,do_unlink=True)
  rows=[(-4.10,.85,.78,.54,1.45,1.80),(-3.8,.95,.88,.48,1.50,1.92),(-2.05,1.05,.97,.48,1.65,2.05),(-1.45,1.25,1.1,.48,1.70,3.65),(.75,1.25,1.12,.48,1.75,3.85),(1.20,1.12,1.0,.5,1.72,3.65)]
  body=f.original_loft('Body',rows,m['Paint'],step=.26);body.parent=root
  for o in list(root.children_recursive):
   if o.name.startswith(('Glass','InteriorDash','SideMirror','Headlight','Taillight','Indicator','NoseIntake','FrontPlate','RearPlate','ArchTrim','InteriorInstrumentBezel')):bpy.data.objects.remove(o,do_unlink=True)
  mod=body.modifiers.new('HollowCab','SOLIDIFY');mod.thickness=.025;mod.offset=-1;bpy.context.view_layer.objects.active=body;bpy.ops.object.modifier_apply(modifier=mod.name)
  for side in [-1,1]:
   b.apply_boolean(body,b.box('SideWindowCut',(.7,2.20,1.10),(side*1.17,-.48,2.65),None))
   b.quad('GlassSide'+str(side),[(side*1.25,-1.35,2.13),(side*1.25,.45,2.13),(side*1.15,.45,3.18),(side*1.15,-1.35,3.18)],m['Glass'],parent=root)
   b.apply_boolean(body,b.arch_cutter(side,s['front_axle'],.53,.61,'front'))
   b.beam('SideMirrorStem',(side*1.15,-1.45,3.15),(side*1.55,-2.0,3.05),.05,.05,m['Chrome'],parent=root)
   b.box('SideMirrorPod',(.22,.15,.62),(side*1.55,-2.0,2.78),m['BlackTrim'],bevel=.025,parent=root)
   b.box('SideMirrorLens',(.18,.015,.56),(side*1.55,-1.92,2.78),m['Chrome'],parent=root)
   b.cylinder('Exhaust',.09,2.4,(side*1.30,.80,2.2),m['Chrome'],vertices=10,parent=root)
  b.apply_boolean(body,b.box('WindshieldCut',(2.34,1.24,1.16),(0,-1.6,2.68),None))
  b.quad('GlassWindshield',[(-1.09,-1.85,2.13),(1.09,-1.85,2.13),(1.09,-1.42,3.23),(-1.09,-1.42,3.23)],m['Glass'],parent=root)
  for side in [-1,1]:
   b.box('HeadlightLongNose',(.42,.03,.16),(side*.67,-4.11,1.38),m['Headlight'],parent=root)
   b.box('IndicatorLongNose',(.16,.03,.04),(side*.75,-4.12,1.25),m['Taillight'],parent=root)
  b.box('NoseGrille',(.95,.025,.85),(0,-4.12,1.06),m['Chrome'],parent=root)
  b.box('InteriorDashTop',(2.15,.5,.16),(0,-1.48,2.16),m['InteriorDark'],bevel=.04,parent=root)
  for name,pos in [('DriverEye',s['eye']),('SteeringWheelPivot',s['steering_center']),('InteriorInstrumentScreen',s['instrument_screen'])]:
   o=bpy.data.objects.get(name)
   if o:o.location=pos
  trailer=bpy.data.objects['TrailerRoot'];trailer.location.y=2.2
  for o in list(trailer.children_recursive):
   if o.type=='MESH':
    for v in o.data.vertices:v.co.y*=1.42
   elif o.name.startswith('TrailerWheel'):o.location.y*=1.42
  for side in [-1,1]:
   for inner in [0,1]:f.wheel('TrailerWheelExtra'+str(side)+str(inner),.295,.285,.53,6,m['Rim'],m['Tyre'],m['BrakeDisc'],m['Hub'],(side*(1.03-inner*.31),11.2,.53),trailer,side)
  for o in trailer.children_recursive:
   if o.type=='MESH' and 'TrailerShell' in o.name:
    for poly in o.data.polygons:poly.use_smooth=False
  trailer['axle_from_hitch_m']=12.7;trailer['length_m']=16.05
  root['liner_front_m']=1.40;root['liner_floor_m']=1.45;root['liner_belt_m']=2.25;root['liner_rear_m']=-.6
  return root,w
 root,m=setup(s);w={}
 if s['name']=='MINING':
  # Chassis and sloped steel dump bed are continuous section meshes, not boxes.
  body=f.original_loft('Body',[(-7.4,3.2,2.9,1.1,3.2,3.55),(-6.6,3.8,3.4,1.05,3.4,3.7),(5.9,3.8,3.45,1.2,3.4,3.65),(7.4,3.2,2.9,1.6,3.4,3.6)],m['Paint'],step=.8);body.parent=root
  # Hollow six-sided tray with tapered side walls and a sloping bulkhead.
  pts=[(-3.55,-2.8,3.6),(3.55,-2.8,3.6),(3.65,7.1,3.7),(-3.65,7.1,3.7),(-4.5,-3.7,6.5),(4.5,-3.7,6.5),(4.5,7.25,6.8),(-4.5,7.25,6.8)]
  tray=b.mesh_object('DumpBed',pts,[(0,3,2,1),(0,1,5,4),(0,4,7,3),(1,2,6,5)],m['Paint'],False,root)
  mod=tray.modifiers.new('SteelThickness','SOLIDIFY');mod.thickness=.14;bpy.context.view_layer.objects.active=tray;bpy.ops.object.modifier_apply(modifier=mod.name)
  b.box('Canopy',(9.0,3.6,.18),(0,-4.8,6.55),m['Paint'],bevel=.1,parent=root)
  cab=f.original_loft('CabShell',[(-6.4,1.25,1.1,3.7,4.75,6.4),(-3.35,1.25,1.1,3.7,4.75,6.4)],m['Paint'],step=.5);cab.parent=root;cab.location.x=2.0
  mod=cab.modifiers.new('HollowCab','SOLIDIFY');mod.thickness=.035;mod.offset=-1;bpy.context.view_layer.objects.active=cab;bpy.ops.object.modifier_apply(modifier=mod.name)
  for side in [-1,1]:
   b.apply_boolean(cab,b.box('CabWindow',(.7,2.2,1.0),(side*1.16+2,-4.85,5.65),None))
   b.box('SideMirrorPod',(.25,.18,.8),(side*4.25,-6.1,5.9),m['BlackTrim'],parent=root)
   b.box('SideMirrorLens',(.21,.02,.72),(side*4.25,-5.99,5.9),m['Chrome'],parent=root)
  b.apply_boolean(cab,b.box('FrontWindow',(2.15,.7,1.0),(2,-6.36,5.65),None))
  b.quad('GlassWindshield',[(.95,-6.42,5.15),(3.05,-6.42,5.15),(3.05,-6.42,6.15),(.95,-6.42,6.15)],m['Glass'],parent=root)
  for side,label in [(1,'L'),(-1,'R')]:
   for y,ax in [(-4.6,'Front'),(3.8,'Rear')]:
    w[ax+label]=f.wheel('Wheel'+ax+label,1.15,.85,2.02,8,m['Rim'],m['Tyre'],m['BrakeDisc'],m['Hub'],(side*3.8,y,2.02),root,side)
    if ax=='Rear':
     for o in list(w[ax+label].children):
      c=o.copy();c.data=o.data;b.link_object(c);c.parent=w[ax+label];c.location.x-=side*1.18
  for z in [1.1,1.55,2,2.45,2.9,3.35,3.8]:b.box('LadderStep',(.8,.24,.08),(2,-6.85,z),m['BlackTrim'],parent=root)
 else:
  body=f.original_loft('Body',[(-3.65,1.10,.9,.45,1.2,1.42),(-2.85,1.6,1.3,.35,1.40,1.68),(2.8,1.6,1.3,.38,1.45,1.72),(3.6,1.22,1.08,.55,1.4,1.58)],m['Paint'],step=.5);body.parent=root
  turret=f.original_loft('Turret',[(-1.85,.70,.55,1.55,1.8,2.13),(-.55,1.25,.72,1.55,2.0,2.65),(1.6,1.15,.78,1.55,2,2.55),(2.0,.7,.55,1.55,2,2.3)],m['Paint'],step=.35);turret.parent=root
  b.cylinder('DisplayBarrel',.09,3.7,(0,-3.2,2.08),m['BlackTrim'],rotation=(math.pi/2,0,0),vertices=10,parent=root)
  for side,label in [(1,'L'),(-1,'R')]:
   # Continuous belt with repeating tread texture supplied at runtime.
   outline=[(-3.25,.60),(-2.8,1.28),(2.8,1.28),(3.25,.60),(2.8,.12),(-2.8,.12)]
   verts=[(side*x,y,z) for x in [1.30,1.98] for y,z in outline]
   b.mesh_object('TrackBelt'+label,verts,[(i,(i+1)%6,(i+1)%6+6,i+6) for i in range(6)],m['BlackTrim'],False,root)
   for j in range(6):
    y=-2.55+j*1.02;key=('Front' if j==0 else 'Rear' if j==5 else 'Road'+str(j))+label
    wheel=f.wheel('Wheel'+key,.45,.30,.50,6,m['Rim'],m['Tyre'],m['BrakeDisc'],m['Hub'],(side*1.66,y,.57),root,side)
    if j in [0,5]:w[key]=wheel
   for y in [-2.5,-1.5,-.5,.5,1.5,2.5]:b.box('SideSkirt',(.07,.94,.48),(side*1.99,y,1.20),m['Paint'],bevel=.025,parent=root)
  b.apply_boolean(body,b.box('DriverVisionOpening',(1.45,1.6,.60),(.55,-2.85,1.55),None))
  b.box('Hatch',(.65,.65,.08),(.62,-.4,2.65),m['Paint'],bevel=.06,parent=root)
 for side in [-1,1]:
  b.box('Headlight'+str(side),(.22,.06,.13),(side*s['width']*.30,-s['length']/2-.02,s['tire_radius']*1.4),m['Headlight'],parent=root)
  b.box('Taillight'+str(side),(.22,.06,.10),(side*s['width']*.30,s['length']/2+.02,s['tire_radius']*1.4),m['Taillight'],parent=root)
 cabin(root,m,s)
 return root,w
def budgeted(s):
 root,wheels=custom(s)
 meshes=[o for o in root.children_recursive if o.type=='MESH']
 for o in meshes:
  if any(n in o.name for n in ('Wheel','Steering','Glass','Screen')):continue
  bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('PlanarReduction','DECIMATE');mod.decimate_type='DISSOLVE';mod.angle_limit=.015;bpy.ops.object.modifier_apply(modifier=mod.name)
 count=lambda o:sum(len(p.vertices)-2 for p in o.data.polygons)
 total=sum(count(o) for o in meshes)
 if total>7000:
  eligible=[o for o in meshes if count(o)>100 and not any(n in o.name for n in ('Wheel','Steering','Glass','Screen','Bezel'))]
  subtotal=sum(count(o) for o in eligible);ratio=max(.10,(subtotal-(total-6900))/max(1,subtotal))
  for o in eligible:
   bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('HeavyBudget','DECIMATE');mod.ratio=ratio;bpy.ops.object.modifier_apply(modifier=mod.name)
 return root,wheels
b.build_car=budgeted
specs=[f.spec('US22',8.2,2.55,3.85,5.4,.53,(.42,.15,.10),'semi'),f.spec('MINING',14.8,9.53,6.8,8.4,2.02,(.75,.53,.13),'mining'),f.spec('TYPE100',7.3,4.0,2.7,5.1,.50,(.27,.35,.22),'tank')]
specs[0].update(eye=(.48,-.55,2.8),steering_center=(.48,-1.01,2.55),instrument_screen=(.48,-1.23,2.6))
specs[1].update(eye=(2,-4.5,5.85),steering_center=(2,-5.04,5.55),instrument_screen=(2,-5.35,5.55),front_axle=-4.6,rear_axle=3.8)
specs[2].update(eye=(.55,-2.2,1.55),steering_center=(.55,-2.6,1.12),instrument_screen=(.55,-2.85,1.25),front_axle=-2.55,rear_axle=2.55)
for s in specs:
 if os.environ.get('FLEET31_ONLY') and s['name']!=os.environ['FLEET31_ONLY']:continue
 b.build_and_export(s)
