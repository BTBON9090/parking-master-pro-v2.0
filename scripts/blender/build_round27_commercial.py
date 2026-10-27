"""Four fictional manual-gear training vehicles; dimensions and powertrain
are game calibrations. Lofted shells include cut-out arches and glazing."""
import os,sys,math
sys.path.insert(0,os.path.dirname(__file__))
import build_round9_vehicles as b
import bpy
b.OUT_DOCS=os.path.join(b.ROOT,'docs','round30','commercial');os.makedirs(b.OUT_DOCS,exist_ok=True)
loft=b.loft_body
b.loft_body=lambda name,stations,mat,step=.085:loft(name,stations,mat,step=.17)
base_build=b.build_car
active=None
def arch(side,axle_y,wheel_radius,arch_radius,name):
    bpy.ops.mesh.primitive_cylinder_add(vertices=28,radius=arch_radius,depth=.85,
      location=(side*(active['width']/2-.08),axle_y,wheel_radius),rotation=(0,math.pi/2,0))
    bpy.context.object.name=name
    return bpy.context.object
b.arch_cutter=arch
cut_side=b.cut_side_window
def cut_bus_side(body,stations,spec,side,y0,y1,name,glass,black):
    cut_side(body,stations,spec,side,y0,y1,name,glass,black)
    # The inherited car window seal extrapolates across the nearly vertical
    # front corner of a bus and creates a giant black triangle in the cabin.
    # Keep the real opening and glass; the windshield has its own thin seal.
    seal=bpy.data.objects.get(name+'Seal')
    if seal:bpy.data.objects.remove(seal,do_unlink=True)
b.cut_side_window=cut_bus_side
cut_windshield=b.cut_windshield
def cut_glazing(body,stations,spec,corners,name,normal,glass,black):
    if name!='GlassWindshield':return cut_windshield(body,stations,spec,corners,name,normal,glass,black)
    # A bus nose is almost vertical; the passenger-car sloped prism misses it.
    front=-spec['length']/2;low=spec['beltline']+.06;high=spec['roof']-.16
    cutter=b.box('BusWindshieldCut',(spec['width']*.91,1.05,high-low),(0,front+.22,(low+high)/2),None)
    b.apply_boolean(body,cutter)
    x=spec['width']*.445;y=front+.19
    verts=[(-x,y,low),(x,y,low),(x,y,high),(-x,y,high)]
    b.quad(name,verts,glass,parent=body.parent)
    for i in range(4):b.tube_between(name+'Seal%d'%i,verts[i],verts[(i+1)%4],.018,black,parent=body.parent)
b.cut_windshield=cut_glazing
def build(spec):
    root,wheels=base_build(spec)
    # Keep the long bus roof solid and place front seats near the driver's eye.
    for obj in list(root.children_recursive):
        if obj.name.startswith(('GlassRoof','RoofRail','DoorShut')):bpy.data.objects.remove(obj,do_unlink=True)
        elif obj.name.startswith(('MirrorArm','MirrorPod','MirrorGlass')):bpy.data.objects.remove(obj,do_unlink=True)
        elif obj.name.startswith(('InteriorSeat','InteriorHeadrest','InteriorSeatbelt')):
            obj.location.y+=spec['eye'][1]-.10
    # The passenger-car mirror positions were inside a wider, longer bus.
    # Mount the left/right housings beside the front glazing instead.
    dark=bpy.data.materials.get('BlackTrim');glass=bpy.data.materials.get('MirrorGlass')
    for side in (-1,1):
        y=-spec['length']/2-.34; z=spec['roof']-.52; x=side*(spec['width']/2+.23)
        anchor=(side*(spec['width']/2-.06),-spec['length']/2+.23,spec['roof']-.14)
        elbow=(x,y,spec['roof']-.14)
        b.beam('BusMirrorArm',anchor,elbow,.035,.035,dark,parent=root)
        b.beam('BusMirrorDrop',elbow,(x,y,z+.12),.035,.035,dark,parent=root)
        b.box('BusMirrorPod',(.20,.16,.48),(x,y,z),dark,bevel=.012,parent=root)
        b.box('BusMirrorGlass',(.17,.008,.42),(x,y+.084,z),glass,bevel=.002,parent=root)
    root['liner_rear_m']=-spec['length']*.40
    root['liner_belt_m']=spec['beltline']
    return root,wheels
b.build_car=build
preview=b.render_preview
def render(scene,spec,cam,path,location,target,lens=58):
    if not path.endswith('-interior.png'):
        k=max(1,spec['length']/5.1);location=tuple(v*k for v in location);target=(0,0,spec['roof']*.48)
    return preview(scene,spec,cam,path,location,target,lens)
b.render_preview=render

def make(name,file,L,W,H,wb,tire,color,windows=4):
    s=b.l80_spec();belt=H*.47;roof=H-.04;front=-L/2+.3;rear=L/2-.25
    # The driver's side window must reach the front glazing. Leaving 35 cm
    # here turns the whole front corner into a wall in the cockpit view.
    sides=[];lo=front-.15;hi=rear-.2;step=(hi-lo)/windows
    for i in range(windows):sides.append((lo+i*step+.035,lo+(i+1)*step-.035))
    eye_y=front+.80;steer_y=eye_y-.48;eye_z=belt+.33
    s.update(name=name,file=file,length=L,width=W,clearance=.24,beltline=belt,roof=roof,
      front_axle=-wb/2,rear_axle=wb/2,half_track_front=W*.43,half_track_rear=W*.43,
      tire_radius=tire,front_wheel_radius=tire,rear_wheel_radius=tire,tire_width=.295 if name=='Coach' else .29,rim_radius=.28575 if name=='Coach' else tire*.60,
      cabin_front=front,cabin_rear=rear,roof_half_width=W*.44,b_pillar_y=front+1.7,side_windows=sides,suv=False,
      windshield_run=.35,rear_window_run=.15,arch_gap=.065,paint=color,paint_dark=tuple(v*.35 for v in color),
      eye=(W*.18,eye_y,eye_z),steering_center=(W*.18,steer_y,eye_z-.25),column_start=(W*.18,steer_y-.24,eye_z-.31),
      instrument_screen=(W*.18,steer_y-.18,eye_z-.17),center_screen=(0,steer_y-.15,eye_z-.17),
      bumper_z=.55,lamp_z=.87,seat_offset=W*.18,
      windshield_corners=[(-W*.40,front,belt+.06),(W*.40,front,belt+.06),(W*.39,front+.35,roof-.12),(-W*.39,front+.35,roof-.12)],
      rear_window_corners=[(-W*.39,rear-.15,roof-.12),(W*.39,rear-.15,roof-.12),(W*.40,rear,belt+.06),(-W*.40,rear,belt+.06)])
    s['stations']=[(-L/2,W*.42,W*.40,.40,belt-.08,belt+.12),(-L/2+.2,W*.49,W*.46,.25,belt,roof-.18),
      (-L/2+.65,W*.5,W*.46,.24,belt,roof),(-wb/2,W*.5,W*.46,.24,belt,roof),
      (0,W*.5,W*.46,.24,belt,roof),(wb/2,W*.5,W*.46,.24,belt,roof),
      (L/2-.25,W*.49,W*.46,.27,belt,roof-.08),(L/2,W*.43,W*.40,.40,belt-.08,belt+.12)]
    s['stations'].sort(key=lambda x:x[0]);return s

specifications = [
 make('Midibus','training-midibus.glb',6.4,2.18,2.65,3.65,.43,(.69,.69,.58),3),
 make('Coach','training-coach.glb',12.245,2.55,3.865,6.09,.52175,(.31,.43,.49),4),
 make('CargoVan','training-van.glb',5.6,2.05,2.38,3.25,.37,(.74,.72,.61),2),
 make('LightTruck','training-light-truck.glb',7.2,2.28,2.85,4.1,.46,(.35,.43,.32),3),
]
if __name__ == '__main__':
    for s in specifications:
        if os.environ.get('CAR27_ONLY') and s['name'] not in os.environ['CAR27_ONLY'].split(','):continue
        active=s;b.build_and_export(s)
