"""Original low-poly fleet: connected, hollow loft shells; SI dimensions.
No downloaded/proprietary meshes. Sources and simulated details are documented.
"""
import os,sys,math,json
sys.path.insert(0,os.path.dirname(__file__))
import bpy
from mathutils import Vector
import build_round9_vehicles as b
b.OUT_DOCS=os.path.join(b.ROOT,'docs','round30','vehicles');os.makedirs(b.OUT_DOCS,exist_ok=True)
original_build=b.build_car;original_loft=b.loft_body;original_render=b.render_preview
active={}
b.loft_body=lambda name,stations,mat,step=.085:original_loft(name,stations,mat,step=.15)

def wheel(name,width,rim_radius,tyre_radius,spokes,rim,tyre,disc,hub,location,root,outboard=1):
 obj=bpy.data.objects.new(name,None);b.link_object(obj);obj.parent=root;obj.location=location
 segments=16 if active.get('name')=='SEMI' else 24
 b.wheel_revolve(name+'_Tyre',width,rim_radius,tyre_radius,tyre,segments,obj)
 b.disc_x(name+'_Rim',rim_radius,.055,outboard*width*.38,rim,obj,segments=segments)
 b.disc_x(name+'_Hub',rim_radius*.35,.075,outboard*width*.49,hub,obj,segments=8)
 for i in range(6):
  a=i*math.tau/6;r=rim_radius*.66
  b.box(name+'_Vent',(.01,.045,rim_radius*.4),(outboard*width*.42,math.cos(a)*r,math.sin(a)*r),tyre,rotation=(a-math.pi/2,0,0),parent=obj)
 if active.get('name')=='TRACTOR':
  for i in range(16):
   a=i*math.tau/16
   b.box(name+'_Lug',(width*.92,.08,.10),(0,math.sin(a)*(tyre_radius-.05),math.cos(a)*(tyre_radius-.05)),tyre,rotation=(-a,0,0),parent=obj)
 return obj
b.build_wheel=wheel
# Window cuts follow each cab's plane instead of reusing an SUV's shallow rake.
def cut_window(body,stations,s,corners,name,normal,glass,black):
 a,c,d=Vector(corners[0]),Vector(corners[1]),Vector(corners[3])
 normal=(c-a).cross(d-a).normalized()
 b.apply_boolean(body,b._surface_prism('Cut'+name,corners,normal,.38))
 obj=b.mesh_object(name,corners,[(0,1,2,3)],glass,smooth=True);obj.parent=body.parent
 for i in range(4):b.tube_between(name+'Seal'+str(i),corners[i],corners[(i+1)%4],.009,black,parent=body.parent)
b.cut_windshield=cut_window

def arch(side,axle_y,wheel_radius,arch_radius,name):
 r=active['front_wheel_radius'] if abs(axle_y-active['front_axle'])<.01 else active['rear_wheel_radius']
 if active['kind']=='tractor' or (active['kind']=='trike' and abs(axle_y-active['front_axle'])<.01):
  return b.box('NoArchCut',(.01,.01,.01),(0,0,-10),None)
 bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=r+active['arch_gap'],depth=1.1,location=(side*(active['width']/2-.04),axle_y,r),rotation=(0,math.pi/2,0))
 return bpy.context.object
b.arch_cutter=arch

def spec(name,L,W,H,wb,tire,color,kind='suv'):
 s=b.l80_spec();belt=H*(.65 if kind in ('mini','mpv') else .60 if kind=='sport' else .66)
 cabin_front=-L*.22;roof_front=-L*.10;cabin_rear=L*.40;roof_rear=L*.29
 if kind=='sport':cabin_front=-L*.19;roof_front=-L*.065;roof_rear=L*.13;cabin_rear=L*.29;belt=H*.68
 if kind=='cyber':cabin_front=-L*.25;roof_front=-L*.045;roof_rear=L*.09;cabin_rear=L*.20;belt=1.12
 if kind=='tractor':cabin_front=-.25;roof_front=.0;roof_rear=1.3;cabin_rear=1.52;belt=1.55
 if kind=='trike':cabin_front=-1.27;roof_front=-1.04;roof_rear=-.33;cabin_rear=-.20;belt=.97
 if kind=='semi':cabin_front=-L/2+.2;roof_front=-L/2+.55;roof_rear=-.30;cabin_rear=.10;belt=1.75
 clearance=.13 if kind in ('sport','mini') else .26
 half=W/2;upper=W*.38
 rows=[(-L/2,half*.76,half*.70,clearance+.16,belt*.83,belt*.92),(-L/2+.16,half*.95,half*.88,clearance,belt*.95,belt*1.04),(cabin_front,half,half*.95,clearance,belt,belt*1.07),(roof_front,half,upper,clearance,belt,H-.03),(roof_rear,half,upper,clearance,belt,H-.03),(cabin_rear,half,half*.92,clearance,belt,belt*1.09),(L/2-.14,half*.96,half*.90,clearance+.03,belt*.95,belt*1.04),(L/2,half*.78,half*.73,clearance+.14,belt*.85,belt*.96)]
 if kind=='mpv':roof_rear=L*.40;cabin_rear=L*.46;rows[4]=(roof_rear,half,upper,clearance,belt,H-.03);rows[5]=(cabin_rear,half*.98,upper*.96,clearance,belt,H*.96)
 if kind=='mini':rows[4]=(L*.36,half,upper,clearance,belt,H-.03);rows[5]=(L*.45,half*.98,half*.83,clearance,belt,H*.89);roof_rear=L*.36;cabin_rear=L*.45
 if kind=='tractor':rows[0]=(-L/2,.50,.45,.60,1.25,1.5);rows[1]=(-L/2+.17,.60,.53,.55,1.4,1.65);rows[2]=(cabin_front,.69,.63,.56,belt,1.70)
 if kind=='trike':rows[0]=(-L/2,.34,.31,.30,.62,.77);rows[1]=(-L/2+.16,.45,.43,.30,.74,.90);rows[2]=(cabin_front,.58,.54,.31,belt,1.04);rows[3]=(roof_front,.60,.52,.31,belt,H-.03);rows[4]=(roof_rear,.61,.54,.31,belt,H-.03)
 if kind=='semi':rows=[(-L/2,.93,.88,.44,1.55,2.0),(-L/2+.18,1.18,1.1,.4,belt,3.45),(roof_front,1.25,1.12,.4,belt,H-.03),(roof_rear,1.25,1.12,.4,belt,H-.03),(cabin_rear,1.25,1.1,.4,belt,3.4),(.28,1.15,.9,.4,.8,.88),(L/2-.1,1.15,1.05,.4,.72,.80),(L/2,.95,.9,.45,.65,.72)]
 if kind=='tractor':
  rows=[(y,min(a,.72),min(u,.65),max(z,.90) if y>-.25 else z,be,top) for y,a,u,z,be,top in rows]
 rows.sort(key=lambda r:r[0])
 fa=-wb/2;ra=wb/2
 eye_y=(roof_front+roof_rear)*.25;eye_z=H-.32
 if kind=='sport':eye_z=H-.23
 if kind=='semi':eye_z=2.70
 if kind in ('trike','semi'):eye_y=roof_front+.55
 windows=[(cabin_front+.08,(cabin_front+cabin_rear)/2-.06),((cabin_front+cabin_rear)/2+.06,cabin_rear-.10)]
 if kind in ('sport','mini','trike','tractor','semi'):windows=[(cabin_front+.06,cabin_rear-.10)]
 s.update(name=name,file='fleet-'+name.lower()+'.glb',length=L,width=W,roof=H-.03,clearance=clearance,beltline=belt,stations=rows,side_windows=windows,cabin_front=cabin_front,cabin_rear=cabin_rear,roof_half_width=upper,b_pillar_y=(cabin_front+cabin_rear)/2,
  front_axle=fa,rear_axle=ra,half_track_front=(W-.27)/2,half_track_rear=(W-.27)/2,tire_radius=tire,front_wheel_radius=tire,rear_wheel_radius=tire,tire_width=.25,rim_radius=tire*.61,spokes=6,arch_gap=.075,arch_trim=.012,suv=False,paint=color,paint_dark=tuple(v*.35 for v in color),
  windshield_run=roof_front-cabin_front,rear_window_run=cabin_rear-roof_rear,
  windshield_corners=[(-W*.38,cabin_front,belt+.045),(W*.38,cabin_front,belt+.045),(upper*.93,roof_front,H-.13),(-upper*.93,roof_front,H-.13)],
  rear_window_corners=[(-upper*.88,roof_rear,H-.13),(upper*.88,roof_rear,H-.13),(W*.38,cabin_rear,belt+.06),(-W*.38,cabin_rear,belt+.06)],
  eye=(W*.18,eye_y,eye_z),steering_center=(W*.18,eye_y-.46,eye_z-.25),column_start=(W*.18,eye_y-.68,eye_z-.34),instrument_screen=(W*.18,eye_y-.65,eye_z-.20),center_screen=(0,eye_y-.65,eye_z-.24),seat_offset=W*.18,bumper_z=clearance+.16,lamp_z=belt*.85,kind=kind)
 if kind=='tractor':
  s['windshield_corners']=[(-.59,cabin_front,belt+.045),(.59,cabin_front,belt+.045),(.59,roof_front,H-.13),(-.59,roof_front,H-.13)]
  s['rear_window_corners']=[(-.57,roof_rear,H-.13),(.57,roof_rear,H-.13),(.59,cabin_rear,belt+.06),(-.59,cabin_rear,belt+.06)]
 if kind=='semi':s['windshield_corners']=[(-1.03,-L/2+.16,2.08),(1.03,-L/2+.16,2.08),(1.03,-L/2+.34,3.47),(-1.03,-L/2+.34,3.47)]
 if kind=='tractor':s.update(front_wheel_radius=.7156,rear_wheel_radius=.9086,tire_width=.46,rim_radius=.38,half_track_front=.9,half_track_rear=.94)
 if kind=='sport' and name=='REVUELTO':s.update(front_wheel_radius=.34675,rear_wheel_radius=.3702,tire_radius=.34675,rim_radius=.254,tire_width=.265)
 return s


def face(spec,root,paint,black,chrome,head,tail,reverse,amber,amber_r,glass,plate):
 body=bpy.data.objects['Body'];L=spec['length'];W=spec['width']
 def patch(name,x0,x1,z,h,mat,rear=False):
  points=[]
  for x,zz in [(x0,z-h/2),(x1,z-h/2),(x1,z+h/2),(x0,z+h/2)]:
   hit,p,normal,_=body.ray_cast(Vector((x,L if rear else -L,zz)),Vector((0,-1 if rear else 1,0)))
   if not hit:return
   points.append((p.x,p.y+(.015 if rear else -.015),p.z))
  b.quad(name,points,mat,parent=root)
 for side in [-1,1]:
  z=spec['beltline']*.88
  patch('Headlight'+str(side),side*W*.23,side*W*.36,z,.045,head)
  patch('Taillight'+str(side),side*W*.26,side*W*.36,z,.08,tail,True)
  patch('Indicator'+str(side),side*W*.25,side*W*.33,z-.08,.02,amber if side>0 else amber_r)
 patch('NoseIntake',-W*.22,W*.22,spec['beltline']*.64,.13,black)
 patch('FrontPlate',-.15,.15,spec['beltline']*.49,.075,plate)
 patch('RearPlate',-.15,.15,spec['beltline']*.49,.075,plate,True)
b.build_face=face

def build(s):
 global active;active=s
 root,wheels=original_build(s)
 root['liner_front_m']=-s['cabin_front']+.02;root['liner_floor_m']=1.45 if s['kind']=='semi' else .36;root['seat_lift_game_units']=.1;root['liner_belt_m']=s['beltline'];root['liner_rear_m']=-s['cabin_rear']
 # Remove generic SUV roof furniture and misplaced rear seats outside small cabins.
 for o in list(root.children_recursive):
  if o.name.startswith(('RoofRail','GlassRoof','InteriorRearViewMirror','InteriorHeadliner','DoorShut','DoorHandle','MirrorArm','MirrorPod','MirrorGlass','InteriorDoorCard','InteriorDoorArmrest','InteriorAmbient')) or (s['kind'] in ('sport','trike','tractor','semi') and o.name.startswith(('InteriorRear','InteriorConsole','DoorHandle2'))):bpy.data.objects.remove(o,do_unlink=True)
  elif o.name.startswith(('InteriorSeat','InteriorHeadrest','InteriorSeatBelt')):o.location.y+=s['eye'][1]-.1;o.location.z+=max(0,s['eye'][2]-1.45)
 # Surface details reinforce each silhouette without using a rectangular proxy body.
 mats=bpy.data.materials;dark=mats['BlackTrim'];paint=mats['Paint'];rim=mats['Rim'];tyre=mats['Tyre'];disc=mats['BrakeDisc'];hub=mats['Hub']
 body=bpy.data.objects['Body'];L=s['length'];W=s['width'];kind=s['kind']
 if kind in ('tractor','semi'):
  # Side-window trim must stay on the side face. Near a vertical windscreen,
  # the generic loft surround folds across the eye and becomes an opaque sheet.
  for o in list(root.children_recursive):
   if o.name.startswith('GlassSide') and 'Seal' in o.name:bpy.data.objects.remove(o,do_unlink=True)
 if kind in ('trike','tractor'):
  for o in list(root.children_recursive):
   if o.name.startswith('ArchTrim') and (kind=='tractor' or o.name.endswith('%.2f'%s['front_axle'])):bpy.data.objects.remove(o,do_unlink=True)
 for side in [-1,1]:
  y=s['cabin_front']+.18;x=side*(b.width_at(s['stations'],y,s['beltline'])+.10);z=s['beltline']+.08
  b.beam('SideMirrorStem',(x-side*.12,y,z),(x,y+.02,z),.025,.025,dark,parent=root)
  b.box('SideMirrorPod',(.16,.12,.085),(x,y+.02,z),paint,bevel=.02,parent=root)
  b.box('SideMirrorLens',(.13,.01,.06),(x,y+.085,z),mats.get('MirrorGlass') or dark,parent=root)

 if kind in ('cyber','trike'):
  start=s['cabin_rear']+.12;end=L/2-.12
  b.apply_boolean(body,b.box('CargoOpening',(W*.75,end-start,1.5),(0,(start+end)/2,s['beltline']+.40),None))
  b.box('BedLiner',(W*.74,end-start,.04),(0,(start+end)/2,.70),dark,parent=root)
  for side in [-1,1]:b.box('BedInnerSide',(.02,end-start,s['beltline']-.70),(side*W*.375,(start+end)/2,(s['beltline']+.70)/2),dark,parent=root)
 if kind=='cyber':
  b.box('HeadlightBlade',(W*.85,.03,.035),(0,-L/2-.01,s['beltline']*.92),mats['Headlight'],parent=root)
 if kind=='mini':
  roofmat=b.material('ContrastRoof',(.76,.73,.65),roughness=.8)
  b.roof_glass_panel('ContrastRoofPanel',s['stations'],s['cabin_front']+.6,s['cabin_rear']-.2,W*.30,roofmat,root)
  for side in [-1,1]:b.cylinder('RoundHeadlight',.12,.035,(side*W*.34,-L/2-.02,s['lamp_z']),mats['Headlight'],rotation=(math.pi/2,0,0),vertices=20,parent=root)
 if kind=='sport':
  for side in [-1,1]:
   b.quad('SideIntake',[(side*W*.502,.45,.38),(side*W*.502,.92,.55),(side*W*.502,.87,.78),(side*W*.502,.50,.70)],dark,parent=root)
  for i in range(7):b.box('EngineVent',(W*.46,.035,.012),(0,.8+i*.08,s['beltline']+.18),dark,parent=root)
  if s['name']=='VEYRON':
   for side in [-1,1]:b.box('RearAirIntake',(.25,.38,.18),(side*.49,.77,1.03),dark,bevel=.06,parent=root)
   b.box('RearWing',(1.45,.20,.035),(0,L/2-.30,1.02),paint,bevel=.012,parent=root)
 if kind=='mpv':
  for i in range(15):b.box('VerticalGrilleSlat',(.026,.025,.43),(-.62+i*.089,-L/2-.025,.86),mats['Chrome'],parent=root)
 if kind=='trike':
  for label in ['FrontR']:
   for o in list(wheels[label].children_recursive)+[wheels[label]]:bpy.data.objects.remove(o,do_unlink=True)
   del wheels[label]
  wheels['FrontL'].location.x=0
  for o in list(root.children_recursive):
   if o.name.startswith('BrakeCaliperFront'):bpy.data.objects.remove(o,do_unlink=True)
  for side in [-1,1]:b.beam('FrontFork',(side*.11,s['front_axle'],.34),(side*.11,s['front_axle']+.18,.96),.055,.055,dark,parent=root)
 if kind=='tractor':
  b.cylinder('Exhaust',.055,1.15,(.50,-.50,2.02),dark,vertices=10,parent=root)
  b.box('FrontCounterweight',(.94,.38,.35),(0,-L/2-.1,.65),dark,bevel=.04,parent=root)
  for side in [-1,1]:
   for z in [.55,.80,1.05]:b.box('EntryStep',(.32,.35,.04),(side*.8,.1,z),dark,parent=root)
 if kind=='semi':
  # Rebuild the cab with a compact loft before windows: the generic SUV's
  # high decimation ratio collapsed the tall cab's side walls into triangles.
  bpy.data.objects.remove(body,do_unlink=True)
  rows=[(-L/2,.95,.92,.44,1.70,3.40),(-L/2+.20,1.24,1.13,.40,1.78,3.70),(-.30,1.24,1.13,.40,1.78,3.70),(.10,1.12,1.02,.44,1.78,3.40)]
  body=original_loft('Body',rows,paint,step=.30);body.parent=root
  mod=body.modifiers.new('CabShell','SOLIDIFY');mod.thickness=.025;mod.offset=-1;bpy.context.view_layer.objects.active=body;bpy.ops.object.modifier_apply(modifier=mod.name)
  for side in [-1,1]:
   b.apply_boolean(body,b.box('CabSideWindowCut',(.65,2.55,1.25),(side*1.15,-1.72,2.56),None))
   cutter=arch(side,s['front_axle'],.53,.605,'front');b.apply_boolean(body,cutter)
  b.apply_boolean(body,b.box('CabFrontWindowCut',(2.02,.60,1.25),(0,-L/2+.10,2.56),None))
  for o in list(root.children_recursive):
   if o.name.startswith(('GlassWindshield','GlassSide','GlassRear','InteriorDash','ArchTrim')):bpy.data.objects.remove(o,do_unlink=True)
  b.quad('GlassWindshield',[(-1.01,-L/2-.005,1.935),(1.01,-L/2-.005,1.935),(1.01,-L/2-.005,3.185),(-1.01,-L/2-.005,3.185)],mats['Glass'],parent=root)
  for side in [-1,1]:b.quad('GlassSide'+str(side),[(side*1.245,-2.995,1.935),(side*1.245,-.445,1.935),(side*1.16,-.445,3.185),(side*1.16,-2.995,3.185)],mats['Glass'],parent=root)
  b.box('InteriorDashTop',(2.1,.55,.15),(0,-2.95,2.05),mats['InteriorDark'],bevel=.04,parent=root)
  b.box('InteriorCabRaisedFloor',(2.18,2.70,.06),(0,-1.60,1.45),mats['InteriorDark'],parent=root)
  b.box('ChassisRails',(1.8,3.1,.18),(0,1.75,.77),dark,parent=root)
  # Ten tractor tyres: front singles, two rear axles with dual tyres.
  for side,label in [(1,'RearL'),(-1,'RearR')]:
   wheels[label].location.y=1.40
   for o in list(wheels[label].children):
    copy=o.copy();copy.data=o.data;wheels[label].children[0].users_collection[0].objects.link(copy);copy.parent=wheels[label];copy.location.x-=side*.31
   other=wheel('WheelRear2'+('L' if side>0 else 'R'),.295,.285,.53,6,rim,tyre,disc,hub,(side*1.03,2.70,.53),root,side)
   for o in list(other.children):
    copy=o.copy();copy.data=o.data;b.link_object(copy);copy.parent=other;copy.location.x-=side*.31
  root['fixed_origin']=True
  trailer=bpy.data.objects.new('TrailerRoot',None);b.link_object(trailer);trailer.parent=root;trailer.location=(0,1.40,0)
  # A closed lofted semitrailer shell with tapered nose and rounded edge strips.
  shell=b.loft_body('TrailerShell',[(.25,1.10,1.05,1.05,3.5,3.75),(.5,1.25,1.22,1.02,3.60,3.85),(10.9,1.25,1.22,1.02,3.60,3.85),(11.3,1.13,1.10,1.08,3.48,3.72)],b.material('TrailerPaint',(.54,.57,.52),roughness=.8));shell.parent=trailer
  for side in [-1,1]:
   b.box('TrailerRail',(.06,10.7,.09),(side*1.24,5.7,1.18),dark,parent=trailer)
   for axle in [8.8,10.1]:
    for inner in [0,1]:wheel('TrailerWheel%d%d%d'%(side,axle*10,inner),.295,.285,.53,6,rim,tyre,disc,hub,(side*(1.03-inner*.31),axle,.53),trailer,side)
   b.box('TrailerTaillight',(.2,.03,.08),(side*.92,11.31,1.18),mats['Taillight'],parent=trailer)
  for y in [.65,11.0]:b.box('TrailerEndFrame',(2.35,.035,.045),(0,y,3.73),dark,parent=trailer)
  trailer['hitch_m']=1.4;trailer['axle_from_hitch_m']=9.45;trailer['length_m']=11.3
 # Enforce the complete-asset triangle budget without deforming wheel circles.
 meshes=[o for o in root.children_recursive if o.type=='MESH'];count=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
 if count>7800:
  eligible=[o for o in meshes if not 'Wheel' in o.name and not 'Steering' in o.name];base=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in eligible);ratio=max(.15,1-(count-7000)/max(1,base))
  for o in eligible:
   bpy.context.view_layer.objects.active=o;m=o.modifiers.new('budget','DECIMATE');m.ratio=ratio;bpy.ops.object.modifier_apply(modifier=m.name)
 return root,wheels
b.build_car=build

def preview(scene,s,cam,path,location,target,lens=58):
 if not path.endswith('-interior.png'):
  scale=max(.8,s['length']/5.0);location=tuple(v*scale for v in location);target=(0,0,s['roof']*.48)
  if s['name']=='SEMI':location=(17,-12,9);target=(0,4,1.4)
 return original_render(scene,s,cam,path,location,target,lens)
b.render_preview=preview
specs=[spec('TRIKE',3.65,1.45,1.85,2.35,.34,(.18,.42,.59),'trike'),spec('TRACTOR',4.85,2.45,2.95,2.765,.7156,(.22,.42,.14),'tractor'),spec('SEMI',6.85,2.55,3.75,4.15,.53,(.19,.36,.48),'semi'),spec('CYBERTRUCK',5.6829,2.0316,1.7938,3.635,.4445,(.56,.62,.62),'cyber'),spec('REVUELTO',4.947,2.033,1.160,2.779,.34675,(.78,.55,.12),'sport'),spec('VEYRON',4.462,1.998,1.204,2.710,.355,(.16,.35,.50),'sport'),spec('V800',5.495,2.006,1.850,3.430,.402,(.27,.29,.32),'mpv'),spec('MINI',3.876,1.744,1.432,2.495,.31265,(.27,.42,.32),'mini')]
for s in specs:
 if os.path.exists(os.path.join(b.OUT_DOCS,s['name']+'-interior.png')) and not os.environ.get('FLEET30_ONLY') and not os.environ.get('FLEET30_REBUILD'):continue
 if os.environ.get('FLEET30_ONLY') and s['name']!=os.environ['FLEET30_ONLY']:continue
 b.build_and_export(s)
