"""Three original low-poly shells, using official proportions and photographic references.
Surfaces are lofted meshes with cut-through windows and wheel arches, not box assemblies.
Unpublished details/interiors are visual approximations; see docs/round13/vehicle-provenance.json.
"""
import os,sys,math,json,bpy
from mathutils import Vector
sys.path.insert(0,os.path.dirname(__file__))
import build_round9_vehicles as base
base.OUT_DOCS=os.path.join(base.ROOT,'docs','round13','vehicles')
os.makedirs(base.OUT_DOCS,exist_ok=True)
loft=base.loft_body
base.loft_body=lambda name,stations,mat,step=.085:loft(name,stations,mat,step=.115)

# Retain the tested four-wheel, interior and steering hierarchy. Only silhouettes,
# wheel centres, window contours, trim and light signatures differ per car.
def specification(name,L,W,H,wb,front,tire,rim,color,profile,windows,windshield,rearwindow):
 s=base.l80_spec()
 s.update(name=name,file={'Tai7':'fangchengbao-tai7.glb','LiI9':'li-i9.glb','N90':'xiaomi-n90.glb'}[name],length=L,width=W,roof=H-.035,
  clearance=.21 if name=='Tai7' else .19,beltline=1.22 if name=='Tai7' else 1.12,
  stations=profile,side_windows=windows,windshield_corners=windshield,rear_window_corners=rearwindow,
  front_axle=front,rear_axle=front+wb,half_track_front=(W-.275)/2,half_track_rear=(W-.275)/2,
  tire_radius=tire,front_wheel_radius=tire,rear_wheel_radius=tire+(.0045 if name=='N90' else 0),tire_width=.255 if name=='Tai7' else .265,rim_radius=rim,
  arch_gap=.055,arch_trim=.028 if name=='Tai7' else .018,spokes=6,
  cabin_front=windshield[0][1]-.015,cabin_rear=rearwindow[-1][1]-.05,windshield_run=windshield[2][1]-windshield[0][1],rear_window_run=.12,
  roof_half_width=.78 if name=='Tai7' else .76,paint=color,paint_dark=tuple(v*.4 for v in color),
  eye=(.365,.12,1.43 if name=='Tai7' else 1.32),eye_pitch=-1,
  steering_center=(.365,-.50,1.14 if name=='Tai7' else 1.075),leather=(.55,.43,.30),interior_trim=(.32,.30,.27))
 return s

def stations(rows,W):
 # (longitudinal station, lower half-width ratio, upper ratio, bottom, belt, roof)
 return [(y,a*W/2,b*W/2,z,waist,top) for y,a,b,z,waist,top in rows]

tai=specification('Tai7',4.999,1.995,1.865,2.920,-1.48,.39425,.254,(.38,.48,.50),
 stations([(-2.499,.80,.76,.37,1.15,1.21),(-2.44,.94,.90,.28,1.22,1.29),(-2.2,.99,.95,.23,1.23,1.32),(-1.7,1,.96,.21,1.24,1.33),(-1.12,1,.94,.21,1.24,1.35),(-.85,1,.85,.21,1.24,1.64),(-.59,1,.80,.21,1.24,1.82),(-.1,1,.80,.21,1.24,1.83),(1,1,.80,.21,1.24,1.83),(1.8,1,.80,.21,1.24,1.83),(2.17,.99,.80,.23,1.22,1.80),(2.34,.92,.78,.28,1.19,1.71),(2.499,.82,.73,.35,1.13,1.46)],1.995),
 [(-1.10,.25),(.35,1.05),(1.14,2.05)],
 [(-.78,-1.12,1.31),(.78,-1.12,1.31),(.76,-.60,1.78),(-.76,-.60,1.78)],
 [(-.68,2.10,1.77),(.68,2.10,1.77),(.72,2.44,1.29),(-.72,2.44,1.29)])
i9=specification('LiI9',5.225,1.970,1.752,3.168,-1.63,.38595,.2667,(.65,.57,.43),
 stations([(-2.6125,.72,.66,.32,.91,1.00),(-2.53,.87,.81,.24,1.00,1.09),(-2.32,.96,.90,.20,1.08,1.14),(-1.9,1,.95,.19,1.12,1.19),(-1.35,1,.92,.19,1.13,1.28),(-1.0,1,.86,.19,1.13,1.45),(-.58,1,.78,.19,1.13,1.64),(-.12,1,.76,.19,1.13,1.717),(.6,1,.76,.19,1.13,1.717),(1.3,1,.76,.19,1.13,1.69),(1.9,.99,.75,.20,1.12,1.63),(2.3,.96,.74,.24,1.10,1.52),(2.53,.90,.73,.29,1.05,1.39),(2.6125,.79,.70,.35,.99,1.25)],1.970),
 [(-1.23,.25),(.35,1.18),(1.27,2.22)],
 [(-.77,-1.34,1.22),(.77,-1.34,1.22),(.71,-.50,1.64),(-.71,-.50,1.64)],
 [(-.66,1.93,1.59),(.66,1.93,1.59),(.69,2.56,1.18),(-.69,2.56,1.18)])
n90=specification('N90',5.285,1.998,1.825,3.080,-1.57,.38145,.2667,(.19,.39,.40),
 stations([(-2.6425,.76,.71,.32,1.05,1.14),(-2.56,.91,.86,.24,1.13,1.22),(-2.34,.98,.94,.20,1.16,1.25),(-1.8,1,.96,.19,1.17,1.27),(-1.15,1,.91,.19,1.17,1.30),(-.85,1,.82,.19,1.17,1.54),(-.48,1,.77,.19,1.17,1.77),(-.1,1,.77,.19,1.17,1.79),(1,1,.77,.19,1.17,1.79),(1.8,1,.77,.20,1.17,1.78),(2.18,.99,.78,.22,1.15,1.73),(2.46,.96,.77,.26,1.12,1.59),(2.6425,.80,.72,.34,1.04,1.35)],1.998),
 [(-1.09,.25),(.35,1.23),(1.32,2.22)],
 [(-.78,-1.14,1.23),(.78,-1.14,1.23),(.73,-.47,1.72),(-.73,-.47,1.72)],
 [(-.68,2.08,1.72),(.68,2.08,1.72),(.72,2.59,1.23),(-.72,2.59,1.23)])

def face(spec,root,paint,black,chrome,headlight,taillight,reverse,amber,amber_r,glass,plate):
 body=bpy.data.objects.get('Body')
 def strip(name,x0,x1,z0,z1,height,mat,rear=False):
  verts=[]
  for i in range(11):
   t=i/10;x=x0+(x1-x0)*t
   for h in (-height/2,height/2):
    z=z0+(z1-z0)*t+h;hit,p,n,_=body.ray_cast(Vector((x,4 if rear else -4,z)),Vector((0,-1 if rear else 1,0)))
    if not hit:p=Vector((x,spec['length']/2*(1 if rear else -1),z));n=Vector((0,1 if rear else -1,0))
    offset=.045 if mat in (headlight,taillight,reverse,amber,amber_r) else .035 if mat in (chrome,plate) else .012
    verts.append((x,p.y+(offset if rear else -offset),z))
  return base.mesh_object(name,verts,[(i*2,i*2+1,i*2+3,i*2+2) for i in range(10)],mat,False,root)
 name=spec['name']
 if name=='Tai7':
  strip('FrontGrille',-.92,.92,1.075,1.075,.18,black)
  strip('FrontGrilleInset',-.47,.47,1.075,1.075,.12,chrome)
 elif name=='LiI9':
  strip('StarRingHousing',-.91,.91,1.02,1.02,.07,black)
  strip('HeadlightStarRing',-.87,.87,1.035,1.035,.025,headlight)
 else:
  strip('FrontSignaturePanel',-.89,.89,1.09,1.09,.18,black)
  strip('FrontSignatureInset',-.44,.44,1.09,1.09,.12,chrome)
 for side in [-1,1]:
  tag='L' if side>0 else 'R'
  if name=='LiI9':
   strip('HeadlightHousing'+tag,side*.72,side*.87,.70,.78,.16,black)
   strip('Headlight'+tag,side*.75,side*.84,.70,.77,.09,headlight)
  else:
   for j in range(2):
    z=(1.13 if name=='Tai7' else 1.15)-j*.09
    strip('Headlight'+tag+str(j),side*.54,side*.88,z,z+.016,.022,headlight)
  strip('Indicator'+tag,side*.60,side*.80,.98,.99,.012,amber if side>0 else amber_r)
  if name=='Tai7':
   strip('RearLampHousing'+tag,side*.75,side*.88,1.10,1.10,.25,black,True)
   strip('Taillight'+tag,side*.79,side*.84,1.1,1.1,.19,taillight,True)
  else:
   strip('RearLampHousing'+tag,side*.2,side*.89,1.16,1.17,.065,black,True)
   strip('Taillight'+tag,side*.2,side*.88,1.17,1.18,.023,taillight,True)
  strip('ReverseLight'+tag,side*.33,side*.47,.49,.49,.025,reverse,True)
 strip('FrontLowerIntake',-.65,.65,.48,.48,.18,black)
 strip('FrontPlate',-.17,.17,.68,.68,.075,plate)
 strip('RearPlate',-.17,.17,.58,.58,.075,plate,True)
 if name!='Tai7':strip('TaillightBar',-.25,.25,1.17,1.17,.022,taillight,True)
base.build_face=face
original_build=base.build_car
original_wheel=base.build_wheel
active_spec={}
def wheel(name,width,*args,**kwargs):
 s=active_spec
 width=.255 if s['name']=='Tai7' else .265 if s['name']=='LiI9' or 'Rear' in name else .255
 return original_wheel(name,width,*args,**kwargs)
base.build_wheel=wheel

def build(spec):
 global active_spec
 active_spec=spec
 root,wheels=original_build(spec)
 root['asset_family']='round13-original-lowpoly'
 root['published_dimensions_m']=[spec['length'],spec['width'],spec['roof']+.035]
 root['seat_lift_game_units']=.9
 root['liner_belt_m']=spec['beltline']
 if spec['name']=='LiI9':
  for obj in list(root.children_recursive):
   if obj.name.startswith('RoofRail'):bpy.data.objects.remove(obj,do_unlink=True)
 # Keep the final exported triangle budget below 8000, including the runtime liner.
 return root,wheels
base.build_car=build
for spec in [tai,i9,n90]:base.build_and_export(spec)
