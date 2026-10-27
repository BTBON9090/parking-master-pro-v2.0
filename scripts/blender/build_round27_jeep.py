"""Fictional, low-poly manual off-road vehicle. Dimensions and dynamics are
game calibrations, not claims about a named manufacturer's model."""
import os,sys
sys.path.insert(0,os.path.dirname(__file__))
import build_round9_vehicles as b
b.OUT_DOCS=os.path.join(b.ROOT,'docs','round27','jeep');os.makedirs(b.OUT_DOCS,exist_ok=True)
s=b.l80_spec()
s.update(name='TrailJeep',file='trail-jeep.glb',length=4.66,width=1.89,clearance=.25,beltline=1.17,roof=1.91,
 front_axle=-1.42,rear_axle=1.38,half_track_front=.80,half_track_rear=.80,tire_radius=.40,front_wheel_radius=.40,rear_wheel_radius=.40,tire_width=.265,rim_radius=.24,
 cabin_front=-.97,cabin_rear=1.72,roof_half_width=.73,b_pillar_y=.26,side_windows=[(-.90,.24),(.35,1.60)],suv=True,
 paint=(.23,.31,.20),paint_dark=(.045,.065,.035),leather=(.35,.30,.23),interior_trim=(.22,.22,.19),
 eye=(.365,.05,1.42),steering_center=(.365,-.50,1.16),column_start=(.365,-.74,1.10),
 instrument_screen=(.365,-.685,1.25),center_screen=(0,-.66,1.24),bumper_z=.61,lamp_z=1.00,
 windshield_corners=[(-.72,-.96,1.22),(.72,-.96,1.22),(.69,-.49,1.84),(-.69,-.49,1.84)],
 rear_window_corners=[(-.66,1.65,1.84),(.66,1.65,1.84),(.69,2.18,1.24),(-.69,2.18,1.24)])
s['stations']=[(-2.33,.76,.71,.39,1.08,1.14),(-2.27,.89,.85,.30,1.14,1.22),(-1.95,.945,.91,.25,1.17,1.25),(-1.45,.945,.91,.25,1.17,1.26),(-.99,.945,.87,.25,1.17,1.30),(-.64,.945,.75,.25,1.17,1.70),(-.46,.945,.73,.25,1.17,1.90),(.2,.945,.73,.25,1.17,1.91),(1.3,.945,.73,.25,1.17,1.91),(1.75,.94,.73,.26,1.16,1.88),(2.10,.90,.74,.31,1.12,1.68),(2.33,.78,.72,.39,1.06,1.38)]
b.build_and_export(s)
