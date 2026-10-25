"""
Round 9 — reproducible Blender source for the two player cars.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --python scripts/blender/build_round9_vehicles.py

Outputs (metres, Z-up in Blender; glTF export is Y-up):
  public/models/cars/byd-seal-08.glb
  public/models/cars/onvo-l80.glb
  docs/round9/Blender-Seal08.blend
  docs/round9/Blender-L80.blend

The body is a lofted, superellipse-like shell with real boolean wheel-arch and
cabin openings. Tyres are revolved from a sidewall profile (round in every
axis), rims/spokes are separate, and every car carries a usable interior with
a dashboard, instrument screen, steering wheel, seats, pillars and roof.

Manufacturer dimensions are in docs/round9/references/provenance.json. Parts
that are not published (springs, damping, individual wheel travel, steering
ratio, drag area) are labelled SIMULATED CALIBRATION in the project docs and
are NOT encoded here as OEM facts.
"""

import bpy
import bmesh
import math
import os
import json
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_MODELS = os.path.join(ROOT, 'public', 'models', 'cars')
OUT_DOCS = os.path.join(ROOT, 'docs', 'round9')
os.makedirs(OUT_MODELS, exist_ok=True)
os.makedirs(OUT_DOCS, exist_ok=True)


# ---------------------------------------------------------------------------
# generic helpers
# ---------------------------------------------------------------------------

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0


def material(name, color, metallic=0.0, roughness=0.5, alpha=1.0,
             emission=None, emission_strength=0.0):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf is None:
        bsdf = mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        out = mat.node_tree.nodes.get('Material Output')
        mat.node_tree.links.new(bsdf.outputs[0], out.inputs[0])
    bsdf.inputs['Base Color'].default_value = (*color, alpha)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if 'Alpha' in bsdf.inputs:
        bsdf.inputs['Alpha'].default_value = alpha
    if emission is not None:
        for key in ('Emission Color', 'Emission'):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = (*emission, 1.0)
                break
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = emission_strength
    if alpha < 0.999:
        mat.blend_method = 'BLEND'
        mat.show_transparent_back = False
        mat.use_backface_culling = False
    return mat


def link_object(obj):
    bpy.context.collection.objects.link(obj)
    return obj


def mesh_object(name, verts, faces, mat, smooth=True, parent=None):
    mesh = bpy.data.meshes.new(name + 'Mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=False)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    if smooth:
        for poly in mesh.polygons:
            poly.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    if mat is not None:
        obj.data.materials.append(mat)
    link_object(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def box(name, size, location, mat, rotation=(0, 0, 0), bevel=0.0, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0], size[1], size[2])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0 and min(size) > 0.09:
        mod = obj.modifiers.new('soft edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        mod.limit_method = 'ANGLE'
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = False
    if parent is not None:
        obj.parent = parent
    return obj


def cylinder(name, radius, depth, location, mat, rotation=(0, 0, 0), vertices=24,
             parent=None, smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                        location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = smooth
    if parent is not None:
        obj.parent = parent
    return obj


def torus_mesh(name, major_radius, minor_radius, location, mat,
               major_segments=24, minor_segments=6, parent=None,
               rotation=(0, 0, 0), scale=(1, 1, 1)):
    verts = []
    faces = []
    for i in range(major_segments):
        u = 2 * math.pi * i / major_segments
        cu, su = math.cos(u), math.sin(u)
        for j in range(minor_segments):
            v = 2 * math.pi * j / minor_segments
            r = major_radius + minor_radius * math.cos(v)
            verts.append((r * cu, r * su, minor_radius * math.sin(v)))
    for i in range(major_segments):
        for j in range(minor_segments):
            i2 = (i + 1) % major_segments
            j2 = (j + 1) % minor_segments
            faces.append((i * minor_segments + j,
                          i2 * minor_segments + j,
                          i2 * minor_segments + j2,
                          i * minor_segments + j2))
    obj = mesh_object(name, verts, faces, mat, smooth=True, parent=parent)
    obj.location = location
    obj.rotation_euler = rotation
    obj.scale = scale
    return obj


def beam(name, p1, p2, width, depth, mat, parent=None, bevel=0.006):
    p1 = Vector(p1)
    p2 = Vector(p2)
    direction = p2 - p1
    length = direction.length
    if length < 1e-4:
        return None
    mid = (p1 + p2) * 0.5
    obj = box(name, (width, depth, length), mid, mat, bevel=bevel, parent=parent)
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = direction.to_track_quat('Z', 'Y')
    return obj


def tube_between(name, p1, p2, radius, mat, parent=None):
    p1 = Vector(p1)
    p2 = Vector(p2)
    direction = p2 - p1
    length = direction.length
    if length < 1e-4:
        return None
    obj = cylinder(name, radius, length, (p1 + p2) * 0.5, mat,
                   vertices=6, parent=parent, smooth=True)
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = direction.to_track_quat('Z', 'Y')
    return obj


def roof_glass_panel(name, stations, y0, y1, half_width, glass, root):
    ys = [y0 + (y1 - y0) * i / 8 for i in range(9)]
    xs = [-half_width, -half_width * 0.55, 0, half_width * 0.55, half_width]
    verts = []
    for y in ys:
        top = profile_value(stations, y)[4]
        roof_w = max(0.2, profile_value(stations, y)[1])
        for x in xs:
            z = top + 0.010 - 0.018 * (abs(x) / max(0.2, roof_w)) ** 2
            verts.append((x, y, z))
    faces = []
    nx = len(xs)
    for iy in range(len(ys) - 1):
        for ix in range(nx - 1):
            a = iy * nx + ix
            faces.append((a, a + 1, a + nx + 1, a + nx))
    obj = mesh_object(name, verts, faces, glass, smooth=True)
    obj.parent = root
    return obj


def quad(name, corners, mat, parent=None, smooth=False):
    verts = [tuple(c) for c in corners]
    return mesh_object(name, verts, [(0, 1, 2, 3)], mat, smooth=smooth, parent=parent)


def wheel_revolve(name, width, rim_radius, tyre_radius, mat, segments=32, parent=None):
    """Tyre revolved around the X axis; the sidewall is a rounded profile."""
    w = width * 0.5
    profile = [(-w,rim_radius+.004),(-w+.008,tyre_radius-.022),
               (-w+.025,tyre_radius),(w-.025,tyre_radius),
               (w-.008,tyre_radius-.022),(w,rim_radius+.004)]
    verts = []
    faces = []
    for x, r in profile:
        for j in range(segments):
            a = 2 * math.pi * j / segments
            verts.append((x, r * math.cos(a), r * math.sin(a)))
    for i in range(len(profile) - 1):
        for j in range(segments):
            j2 = (j + 1) % segments
            faces.append((i * segments + j, i * segments + j2,
                          (i + 1) * segments + j2, (i + 1) * segments + j))
    return mesh_object(name, verts, faces, mat, smooth=True, parent=parent)


def disc_x(name, radius, depth, x, mat, parent=None, segments=12):
    return cylinder(name, radius, depth, (x, 0, 0), mat,
                    rotation=(0, math.pi / 2, 0), vertices=segments, parent=parent)


def build_wheel(name, width, rim_radius, tyre_radius, spokes, rim_mat, tyre_mat,
                disc_mat, hub_mat, location, root, outboard=1):
    wheel = bpy.data.objects.new(name, None)
    wheel.empty_display_type = 'PLAIN_AXES'
    wheel.empty_display_size = 0.1
    wheel.location = location
    link_object(wheel)
    wheel.parent = root
    w = width * 0.5
    wheel_revolve(name + '_Tyre', width, rim_radius, tyre_radius, tyre_mat, parent=wheel)
    # The inboard barrel must not cap the outboard face: that cap was hiding
    # every spoke and made the wheel read as a solid black disc.
    disc_x(name + '_RimBarrel', rim_radius - 0.012, width * 0.30,
           -outboard * w * 0.32, tyre_mat, parent=wheel)
    # A shallow annulus carries the visible rim lip; no hidden torus underside.
    vertices=[]
    for radius in (rim_radius-.017,rim_radius+.003):
        for i in range(32):
            angle=2*math.pi*i/32
            vertices.append((outboard*w*.62,radius*math.cos(angle),radius*math.sin(angle)))
    mesh_object(name+'_RimLip',vertices,
                [(i,(i+1)%32,(i+1)%32+32,i+32) for i in range(32)],rim_mat,False,wheel)
    # hub and spokes sit outboard of the barrel
    disc_x(name + '_Hub', 0.072, 0.055, outboard * w * 0.62, hub_mat, parent=wheel)
    mid = (0.080 + rim_radius - 0.028) * 0.5
    spoke_len = rim_radius - 0.035
    for i in range(spokes):
        a = 2 * math.pi * i / spokes
        box(name + '_Spoke%d' % i, (0.030, 0.040, spoke_len),
            (outboard * w * 0.58, mid * math.cos(a), mid * math.sin(a)),
            rim_mat, rotation=(a - math.pi / 2, 0, 0), bevel=0.0, parent=wheel)
    # brake disc behind the spokes; fixed caliper is added separately
    disc_x(name + '_BrakeDisc', max(0.12, rim_radius * 0.76), 0.020,
           outboard * w * 0.04, disc_mat, parent=wheel)
    return wheel


# ---------------------------------------------------------------------------
# body / cabin
# ---------------------------------------------------------------------------

def profile_value(stations, y):
    """Interpolate (wb, wr, bottom, belt, top) at a longitudinal position."""
    for i in range(len(stations) - 1):
        y0, wb0, wr0, b0, zb0, zt0 = stations[i]
        y1, wb1, wr1, b1, zb1, zt1 = stations[i + 1]
        if (y >= y0 and y <= y1) or (y <= y0 and y >= y1):
            span = (y - y0) / (y1 - y0) if abs(y1 - y0) > 1e-9 else 0.0
            # Monotone cubic interpolation gives a curved silhouette without
            # adding subdivision overshoot at the nose or wheel arches.
            result = []
            for j, (a, b) in enumerate(zip((wb0, wr0, b0, zb0, zt0), (wb1, wr1, b1, zb1, zt1))):
                d = (b - a) / (y1 - y0)
                before = (a - stations[i-1][j+1]) / (y0 - stations[i-1][0]) if i else d
                after = (stations[i+2][j+1] - b) / (stations[i+2][0] - y1) if i+2 < len(stations) else d
                m0 = 2 * before * d / (before + d) if before * d > 0 else 0
                m1 = 2 * after * d / (after + d) if after * d > 0 else 0
                t = span
                result.append((2*t**3-3*t*t+1)*a + (t**3-2*t*t+t)*(y1-y0)*m0 + (-2*t**3+3*t*t)*b + (t**3-t*t)*(y1-y0)*m1)
            return tuple(result)
    return stations[-1][1:]


def section_profile(stations, y):
    wb, wr, bottom, belt, top = profile_value(stations, y)
    belt = max(bottom + 0.04, min(belt, top - 0.035))
    h = belt-bottom
    return [(0,bottom),(.50*wb,bottom+.01),(.86*wb,bottom+.10*h),
            (.95*wb,bottom+.36*h),(.985*wb,bottom+.68*h),(wb,belt-.025),
            (.995*wb,belt), (wb+(wr-wb)*.45,belt+.45*(top-belt)),
            (wr,top-.026),(.85*wr,top-.012),(.5*wr,top-.003),(0,top)]

def width_at(stations, y, z):
    points = section_profile(stations, y)
    for (x0,z0),(x1,z1) in zip(points,points[1:]):
        if z0 <= z <= z1 and z1-z0 > 1e-8:
            return x0+(x1-x0)*(z-z0)/(z1-z0)
    return points[-2][0] if z > points[-1][1] else points[2][0]


def loft_body(name, stations, mat, step=0.085):
    """One continuous shell from nose to tail, including roof and pillars.

    A half-profile (bottom centre → shoulder → beltline → window shoulder →
    roof edge → roof centre) is mirrored and lofted along Y. Windows are cut
    into this same shell later, so every pillar, the roof arc and the beltline
    are one connected surface rather than floating beams.
    """
    ys = []
    y0 = stations[0][0]
    y1 = stations[-1][0]
    n = max(2, int(abs(y1 - y0) / step))
    for i in range(n + 1):
        ys.append(y0 + (y1 - y0) * i / n)
    for st in stations:
        ys.append(st[0])
    ys = sorted(set(round(v, 5) for v in ys))
    verts = []
    rings = []
    for y in ys:
        wb, wr, bottom, belt, top = profile_value(stations, y)
        belt = max(bottom + 0.04, min(belt, top - 0.035))
        half = section_profile(stations, y)
        ring_pts = list(half)
        for x, z in reversed(half[1:-1]):
            ring_pts.append((-x, z))
        ring = []
        for x, z in ring_pts:
            ring.append(len(verts))
            verts.append((x, y, z))
        rings.append(ring)
    N = len(rings[0])
    faces = []
    for r in range(len(rings) - 1):
        for i in range(N):
            i2 = (i + 1) % N
            faces.append((rings[r][i], rings[r][i2], rings[r + 1][i2], rings[r + 1][i]))
    # caps: fan to the section centre (keeps the mesh closed for booleans)
    for ring, y in ((rings[0], y0), (rings[-1], y1)):
        wb, wr, bottom, belt, top = profile_value(stations, y)
        c = len(verts)
        verts.append((0, y, (bottom + top) * 0.5))
        for i in range(N):
            i2 = (i + 1) % N
            faces.append((ring[i2], ring[i], c))
    return mesh_object(name, verts, faces, mat, smooth=True)


def apply_boolean(target, cutter):
    mod = target.modifiers.new('cut_' + cutter.name, 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    mod.object = cutter
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def arch_cutter(side, axle_y, wheel_radius, arch_radius, name):
    bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=arch_radius, depth=0.62,
                                        location=(side * 0.80, axle_y, wheel_radius),
                                        rotation=(0, math.pi / 2, 0))
    obj = bpy.context.object
    obj.name = name
    return obj


def cabin_cutter(half_width, y_front, y_rear, z_low, name):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, (y_front + y_rear) * 0.5, z_low + 0.18))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (half_width * 2, abs(y_rear - y_front), 0.38)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def arch_trim(name, side, axle_y, wheel_radius, radius, stations, mat,
              tube=0.022, outset=0.004, start=0.0, end=math.pi):
    """Upper half-ring following the real body side, not a floating ring."""
    verts=[];faces=[];major=24;minor=3
    for i in range(major+1):
      a=start+(end-start)*i/major
      for j in range(minor):
        b=2*math.pi*j/minor
        rr=radius+tube*math.cos(b)
        yy=axle_y+rr*math.cos(a)
        zz=wheel_radius+rr*math.sin(a)
        xx=side*(width_at(stations,yy,zz)+outset)
        verts.append((xx,yy,zz))
    for i in range(major):
      for j in range(minor):
        j2=(j+1)%minor
        faces.append((i*minor+j,(i+1)*minor+j,(i+1)*minor+j2,i*minor+j2))
    return mesh_object(name,verts,faces,mat,smooth=True)


# ---------------------------------------------------------------------------
# car-specific build
# ---------------------------------------------------------------------------

def sill_span(spec):
    """Trim terminates between wheel-arch openings, never at a body-length ratio.
    Include the tyre's full steering envelope without shrinking its geometry.
    Dimensions in metres; these are asset clearances, not OEM suspension data.
    """
    width = max(spec['tire_width'], 0.275) / 2
    def envelope(radius):
        return max(radius + spec['arch_gap'] + spec['arch_trim'],
                   math.hypot(radius, width) + .045)
    low = spec['front_axle'] + envelope(spec['front_wheel_radius'])
    high = spec['rear_axle'] - envelope(spec['rear_wheel_radius'])
    return low, high


def build_car(spec):
    reset_scene()
    root = bpy.data.objects.new('CarRoot', None)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 0.5
    link_object(root)

    paint = material('Paint', spec['paint'], metallic=0.08, roughness=0.66)
    paint_dark = material('PaintDark', spec['paint_dark'], metallic=0.05, roughness=0.70)
    black = material('BlackTrim', (0.012, 0.014, 0.016), metallic=0.1, roughness=0.55)
    cladding = material('Cladding', (0.025, 0.028, 0.030), metallic=0.0, roughness=0.72)
    chrome = material('Chrome', (0.72, 0.75, 0.78), metallic=0.25, roughness=0.55)
    glass = material('Glass', (0.055, 0.085, 0.115), metallic=0.0, roughness=0.55, alpha=0.25)
    tyre = material('Tyre', (0.015, 0.016, 0.018), metallic=0.0, roughness=0.78)
    rim = material('Rim', spec['rim_color'], metallic=0.18, roughness=0.55)
    hub = material('Hub', (0.55, 0.57, 0.60), metallic=0.9, roughness=0.2)
    disc = material('BrakeDisc', (0.42, 0.43, 0.45), metallic=1.0, roughness=0.35)
    caliper = material('Caliper', spec['caliper_color'], metallic=0.2, roughness=0.42)
    headlight = material('Headlight', (0.92, 0.95, 1.0), roughness=0.12,
                         emission=(1.0, 0.96, 0.84), emission_strength=2.0)
    taillight = material('Taillight', (0.55, 0.02, 0.03), roughness=0.18,
                         emission=(1.0, 0.015, 0.01), emission_strength=2.2)
    reverse = material('ReverseLight', (0.8, 0.82, 0.85), roughness=0.2,
                       emission=(0.9, 0.95, 1.0), emission_strength=1.2)
    amber = material(spec['indicator_material'] + 'L', (0.65, 0.30, 0.02), roughness=0.25,
                     emission=(1.0, 0.45, 0.02), emission_strength=1.2)
    amber_r = material(spec['indicator_material'] + 'R', (0.65, 0.30, 0.02), roughness=0.25,
                       emission=(1.0, 0.45, 0.02), emission_strength=1.2)
    interior = material('InteriorLeather', spec['leather'], roughness=0.62)
    interior_dark = material('InteriorDark', (0.055, 0.060, 0.065), roughness=0.72)
    interior_trim = material('InteriorTrim', spec['interior_trim'], metallic=0.55, roughness=0.3)
    screen = material('InstrumentScreen', (0.01, 0.02, 0.03), metallic=0.0, roughness=0.18,
                      emission=(0.05, 0.16, 0.26), emission_strength=2.5)
    screen_center = material('CenterScreen', (0.01, 0.015, 0.022), roughness=0.14,
                             emission=(0.02, 0.08, 0.14), emission_strength=1.2)
    plate = material('Plate', (0.82, 0.83, 0.8), roughness=0.4)

    L = spec['length']
    W = spec['width']
    clear = spec['clearance']
    belt = spec['beltline']
    roof = spec['roof']
    tire_r = spec['tire_radius']
    tire_w = spec['tire_width']

    # ---- one continuous body/roof shell ----
    body = loft_body('Body', spec['stations'], paint)
    body.parent = root
    # The loft was previously a solid volume. Cutting windows through that
    # volume created huge interior walls across the driver's eye and dashboard.
    # Give it an actual 22 mm shell before opening the windows.
    shell = body.modifiers.new('hollow body shell', 'SOLIDIFY')
    body.data.materials.append(interior_dark)
    shell.material_offset = 1
    shell.thickness = 0.022
    shell.offset = -1
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier=shell.name)
    stations = spec['stations']
    for side in (-1, 1):
        for axle in (spec['front_axle'], spec['rear_axle']):
            cutter = arch_cutter(side, axle, tire_r,
                                 tire_r + spec['arch_gap'],
                                 'ArchCut_%d_%.2f' % (side, axle))
            apply_boolean(body, cutter)
    # side windows are cut into the same shell, leaving real A/B/C pillars
    for side in (-1, 1):
        tag = 'L' if side > 0 else 'R'
        for index, (y0, y1) in enumerate(spec['side_windows']):
            cut_side_window(body, stations, spec, side, y0, y1,
                            'GlassSide%s%d' % (tag, index), glass, black)
    # windshield and rear window
    cut_windshield(body, stations, spec, spec['windshield_corners'], 'GlassWindshield',
                   (0, -0.42, 0.91), glass, black)
    cut_windshield(body, stations, spec, spec['rear_window_corners'], 'GlassRear',
                   (0, 0.42, 0.91), glass, black)
    mod = body.modifiers.new('body bevel', 'BEVEL')
    mod.width = 0.009
    mod.segments = 2
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(36)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier=mod.name)
    dec = body.modifiers.new('game silhouette reduction', 'DECIMATE')
    dec.ratio = .13
    bpy.ops.object.modifier_apply(modifier=dec.name)
    body.parent = root
    for i, mat in enumerate(body.data.materials):
        if mat is None:
            body.data.materials[i] = interior_dark
    roof_glass_panel('GlassRoof', stations,
                     spec['cabin_front'] + spec['windshield_run'] + 0.08,
                     spec['cabin_rear'] - spec['rear_window_run'] - 0.10,
                     min(0.56, spec['roof_half_width'] - 0.10), glass, root)

    sill_low, sill_high = sill_span(spec)
    sill_length, sill_center = sill_high-sill_low, (sill_low+sill_high)/2

    # ---- black lower body / floor pan ----
    box('FrontBumperLower', (W * 0.72, 0.10, 0.16), (0, -L / 2 + 0.06, spec['bumper_z']), black,
        bevel=0.03, parent=root)
    box('RearDiffuser', (W * 0.70, 0.12, 0.14), (0, L / 2 - 0.06, spec['bumper_z']), black,
        bevel=0.025, parent=root)
    for side in (-1, 1):
        box('SideSkirt', (0.035, sill_length, 0.055), (side * W * 0.455, sill_center, clear + 0.055),
            black, bevel=0.010, parent=root)
        for shut_y in (-0.92, 0.46):
            box('DoorShut%s%.2f' % ('L' if side > 0 else 'R', shut_y),
                (0.006, 0.010, belt - spec['clearance'] - 0.24),
                (side * (W * 0.494), shut_y, spec['clearance'] + 0.36),
                black, bevel=0.002, parent=root)
        box('DoorHandle', (0.010, 0.15, 0.024), (side * W * 0.474, -0.28, belt - 0.11),
            chrome, bevel=0.005, parent=root)
        box('DoorHandle2', (0.010, 0.15, 0.024), (side * W * 0.474, 0.64, belt - 0.11),
            chrome, bevel=0.005, parent=root)
        # Body width excludes mirrors. Attach stalks to the door, face the
        # reflective surface rearward, and include the housings in collisions.
        beam('MirrorArm', (side*.91,-.76,belt+.01), (side*1.055,-.70,belt+.07),
             .045,.045,black,parent=root)
        box('MirrorPod', (0.19, 0.15, 0.105), (side*1.065, -.69, belt+.075),
            paint, bevel=.04, parent=root)
        box('MirrorGlass', (0.16, 0.008, 0.075), (side*1.065, -.612, belt+.075),
            material('MirrorGlass', (0.22, 0.26, 0.30), metallic=0.8, roughness=0.08),
            bevel=0.004, parent=root)
        # wheel arch trim
        for axle in (spec['front_axle'], spec['rear_axle']):
            trim_obj = arch_trim('ArchTrim_%d_%.2f' % (side, axle), side, axle, tire_r,
                      tire_r + spec['arch_gap'] - 0.008, stations,
                      cladding, tube=spec['arch_trim'], outset=0.014)
            trim_obj.parent = root
        # sill cladding for the SUV
        if spec.get('suv'):
            box('RockerCladding', (0.055, sill_length, 0.20), (side * W * 0.468, sill_center, clear + 0.13),
                cladding, bevel=0.018, parent=root)
            box('DoorCladding', (0.045, L * 0.34, 0.14), (side * W * 0.476, -0.15, clear + 0.20),
                cladding, bevel=0.015, parent=root)

    # ---- greenhouse ----
    build_greenhouse(spec, root, paint, black, glass, chrome)

    # ---- lamps / face ----
    build_face(spec, root, paint, black, chrome, headlight, taillight, reverse,
               amber, amber_r, glass, plate)

    # ---- interior ----
    build_interior(spec, root, interior, interior_dark, interior_trim, black,
                   screen, screen_center, chrome, paint)

    # ---- wheels ----
    wheels = {}
    for label, side, axle, front in (
        ('FrontL', 1, spec['front_axle'], True),
        ('FrontR', -1, spec['front_axle'], True),
        ('RearL', 1, spec['rear_axle'], False),
        ('RearR', -1, spec['rear_axle'], False),
    ):
        radius = spec['front_wheel_radius'] if front else spec['rear_wheel_radius']
        # The GLB stays at the nominal contact height; the runtime suspension
        # owns vertical travel.
        x = side * spec['half_track_front'] if front else side * spec['half_track_rear']
        width = (0.255 if front else 0.275) if spec.get('suv') else tire_w
        wheel = build_wheel('Wheel' + label, width, spec['rim_radius'], radius,
                            spec['spokes'], rim, tyre, disc, hub,
                            (x, axle, radius), root, outboard=side)
        wheels[label] = wheel
        # fixed caliper: steers with the knuckle, never rolls with the rim
        box('BrakeCaliper' + label, (0.075, 0.055, 0.16),
            (x - side * 0.10, axle + 0.10, radius + 0.02), caliper,
            bevel=0.012, parent=root)

    # ---- driver eye / pivot markers ----
    eye = bpy.data.objects.new('DriverEye', None)
    eye.empty_display_type = 'SPHERE'
    eye.empty_display_size = 0.035
    eye.location = spec['eye']
    link_object(eye)
    eye.parent = root
    eye['pitch_deg'] = spec.get('eye_pitch', -4.0)

    # steering wheel pivot: local Z is the column axis (towards the driver/up)
    axis = Vector(spec['column_axis']).normalized()
    pivot = bpy.data.objects.new('SteeringWheelPivot', None)
    pivot.empty_display_type = 'ARROWS'
    pivot.empty_display_size = 0.08
    pivot.location = spec['steering_center']
    pivot.rotation_mode = 'QUATERNION'
    pivot.rotation_quaternion = axis.to_track_quat('Z', 'Y')
    link_object(pivot)
    pivot.parent = root
    build_steering_wheel(spec, pivot, interior_dark, interior_trim, chrome, black)

    # instrument screen is a real mesh in the dashboard
    screen_obj = box('InteriorInstrumentScreen', (0.27, 0.012, 0.13),
                     spec['instrument_screen'], screen,
                     rotation=(math.radians(14), 0, 0), bevel=0.008, parent=root)
    box('InteriorInstrumentBezel', (0.30, 0.018, 0.16), spec['instrument_screen'],
        interior_dark, rotation=(math.radians(14), 0, 0), bevel=0.012, parent=root)
    # move the screen slightly in front of the bezel along +Y (driver side)
    screen_obj.location = (spec['instrument_screen'][0],
                           spec['instrument_screen'][1] + 0.012,
                           spec['instrument_screen'][2])

    return root, wheels


def _cutter_prism(name, corners_yz, side, outer=1.10, inner=0.22):
    verts = []
    for x in (side * inner, side * outer):
        for y, z in corners_yz:
            verts.append((x, y, z))
    faces = [
        (0, 1, 2, 3), (7, 6, 5, 4),
        (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0),
    ]
    return mesh_object(name, verts, faces, None, smooth=False)


def _surface_prism(name, corners, normal, thickness=0.18):
    """Closed hexahedron around a sloped window rectangle."""
    n = Vector(normal).normalized() * thickness
    verts = [tuple(Vector(c) - n) for c in corners] + [tuple(Vector(c) + n) for c in corners]
    faces = [
        (0, 1, 2, 3), (7, 6, 5, 4),
        (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0),
    ]
    return mesh_object(name, verts, faces, None, smooth=False)


def cut_side_window(body, stations, spec, side, y0, y1, name, glass, black):
    ys = [y0+(y1-y0)*i/12 for i in range(13)]
    lower = [(y, profile_value(stations,y)[3]+.022) for y in ys]
    upper = [(y, max(profile_value(stations,y)[3]+.045,profile_value(stations,y)[4]-.062)) for y in ys]
    corners = lower + list(reversed(upper))
    n = len(corners)
    verts = [(side*x,y,z) for x in (.18,1.15) for y,z in corners]
    faces = [tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    cutter = mesh_object('Cut'+name,verts,faces,None,smooth=False)
    apply_boolean(body, cutter)
    verts = [(side*(width_at(stations,y,z)-.002),y,z) for y,z in lower+upper]
    faces = [(i,i+1,i+14,i+13) for i in range(12)]
    obj = mesh_object(name, verts, faces, glass, smooth=True)
    obj.parent = body.parent
    # rubber window surround, placed on the cut edge itself
    cy=sum(y for y,z in corners)/len(corners)
    cz=sum(z for y,z in corners)/len(corners)
    frame=[]
    for factor in (1.015,.985):
        for y,z in corners:
            yy=cy+(y-cy)*factor
            zz=cz+(z-cz)*factor
            frame.append((side*(width_at(stations,yy,zz)+.005),yy,zz))
    n=len(corners)
    mesh_object(name+'Seal',frame,[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],black,False,body.parent)


def cut_windshield(body, stations, spec, corners, name, normal, glass, black):
    cutter = _surface_prism('Cut' + name, corners, normal, 0.22)
    apply_boolean(body, cutter)
    verts = [tuple(c) for c in corners]
    obj = mesh_object(name, verts, [(0, 1, 2, 3)], glass, smooth=True)
    obj.parent = body.parent
    for i in range(4):
        tube_between(name + 'Seal%d' % i, verts[i], verts[(i + 1) % 4],
                     0.012, black, parent=body.parent)


def build_greenhouse(spec, root, paint, black, glass, chrome):
    """Roof furniture only. The shell, pillars and window openings are part
    of the single body mesh (see build_car/cut_side_window)."""
    if spec.get('suv'):
        roof = spec['roof']
        ws_top_y = spec['cabin_front'] + spec['windshield_run']
        roof_rear = spec['cabin_rear'] - spec['rear_window_run']
        box('RoofLidar', (0.34, 0.18, 0.045), (0, ws_top_y + 0.18, roof + 0.006),
            black, bevel=0.04, parent=root)
        for side in (-1, 1):
            # black roof rails sit on the shell top, not floating beside it
            beam('RoofRailBlack%s' % ('L' if side > 0 else 'R'),
                 (side * (spec['roof_half_width'] - 0.02), ws_top_y + 0.02, roof + 0.012),
                 (side * (spec['roof_half_width'] - 0.02), roof_rear - 0.02, roof + 0.012),
                 0.035, 0.035, black, parent=root, bevel=0.005)
    else:
        # low-profile shark-fin antenna, body-coloured
        box('RoofAntenna', (0.045, 0.16, 0.035),
            (0, spec['cabin_rear'] - spec['rear_window_run'] - 0.10, spec['roof'] + 0.012),
            black, rotation=(math.radians(-18), 0, 0), bevel=0.012, parent=root)


def build_face(spec, root, paint, black, chrome, headlight, taillight, reverse,
               amber, amber_r, glass, plate):
    """Small colour regions follow the sculpted shell, never floating boxes."""
    body = bpy.data.objects.get('Body')
    def strip(name, x0, x1, z0, z1, height, mat, rear=False):
        vertices=[]
        for i in range(9):
            t=i/8;x=x0+(x1-x0)*t
            for h in (-height/2,height/2):
                z=z0+(z1-z0)*t+h
                start=Vector((x,4 if rear else -4,z))
                direction=Vector((0,-1 if rear else 1,0))
                hit,point,normal,_=body.ray_cast(start,direction)
                if not hit: point=Vector((x,spec['length']/2*(1 if rear else -1),z))
                point+=normal*(.028 if mat in (headlight,taillight,reverse,amber,amber_r,plate) else .014)
                vertices.append(tuple(point))
        faces=[(i*2,i*2+1,i*2+3,i*2+2) for i in range(8)]
        return mesh_object(name,vertices,faces,mat,False,root)
    suv=spec.get('suv')
    for side in (-1,1):
        tag='L' if side>0 else 'R'
        # Separate swept upper light signatures. The L80 has a second tier;
        # the Seal has tall teardrop outer lamps and a lower EV intake.
        z=.99 if suv else .77
        strip('HeadlightHousing'+tag,side*.45,side*.91,z,z+.10,.060,black)
        strip('Headlight'+tag,side*.47,side*.89,z+.01,z+.108,.018,headlight)
        if suv:
            strip('HeadlightLowerHousing'+tag,side*.57,side*.88,z-.13,z-.07,.075,black)
            strip('HeadlightLower'+tag,side*.61,side*.84,z-.124,z-.079,.024,headlight)
        else:
            strip('FrontAirIntake'+tag,side*.77,side*.82,.39,.66,.14,black)
            strip('HeadlightDrop'+tag,side*.798,side*.822,.44,.65,.022,headlight)
        strip('Indicator'+tag,side*.46,side*.58,z-.025,z-.005,.012,amber if side>0 else amber_r)
        strip('RearLampHousing'+tag,side*.25,side*.89,1.10 if suv else .87,1.12 if suv else .88,.075,black,True)
        strip('Taillight'+tag,side*.26,side*.88,1.11 if suv else .88,1.13 if suv else .89,.026,taillight,True)
        strip('ReverseLight'+tag,side*.18,side*.32,.49,.49,.025,reverse,True)
    strip('FrontLowerIntake',-.59,.59,.43 if suv else .33,.43 if suv else .33,.14,black)
    strip('FrontPlate',-.17,.17,.53 if suv else .45,.53 if suv else .45,.075,plate)
    strip('RearPlate',-.17,.17,.56,.56,.08,plate,True)
    strip('TaillightBar',-.33,.33,1.11 if suv else .88,1.11 if suv else .88,.018,taillight,True)
    strip('RearLowerValance',-.62,.62,.34,.34,.11,black,True)


def build_interior(spec, root, leather, dark, trim, black, screen, screen_center, chrome, paint):
    W = spec['width']
    belt = spec['beltline']
    eye = spec['eye']
    dash_top = belt - 0.02
    # floor and door cards close the boolean cabin opening from inside
    box('InteriorFloor', (W * 0.78, abs(spec['cabin_rear'] - spec['cabin_front']) * 0.88, 0.035),
        (0, (spec['cabin_front'] + spec['cabin_rear']) * 0.5, spec['clearance'] + 0.20),
        dark, bevel=0.02, parent=root)
    for side in (-1, 1):
        box('InteriorDoorCard%s' % ('L' if side > 0 else 'R'),
            (0.035, abs(spec['cabin_rear'] - spec['cabin_front']) * 0.80, 0.38),
            (side * W * 0.425, (spec['cabin_front'] + spec['cabin_rear']) * 0.5,
             belt - 0.28), leather, bevel=0.025, parent=root)
        box('InteriorDoorArmrest%s' % ('L' if side > 0 else 'R'),
            (0.065, 0.52, 0.075), (side * W * 0.445, -0.12, belt - 0.22),
            leather, bevel=0.02, parent=root)
        box('InteriorAmbient%s' % ('L' if side > 0 else 'R'),
            (0.006, 0.62, 0.012), (side * W * 0.447, -0.12, belt - 0.09),
            material('Ambient', (0.06, 0.28, 0.55), emission=(0.05, 0.4, 0.95),
                     emission_strength=2.0), bevel=0.003, parent=root)
    # dashboard: upper dark pad + leather lower + silver trim
    box('InteriorDashTop', (W * 0.80, 0.34, 0.075), (0, spec['cabin_front'] + 0.12, dash_top),
        dark, bevel=0.03, parent=root)
    box('InteriorDashLower', (W * 0.78, 0.28, 0.18), (0, spec['cabin_front'] + 0.15, dash_top - 0.12),
        leather, bevel=0.025, parent=root)
    box('InteriorDashTrim', (W * 0.74, 0.022, 0.028), (0, spec['cabin_front'] + 0.01, dash_top - 0.045),
        trim, bevel=0.006, parent=root)
    # centre screen
    box('InteriorCenterScreen', (0.40, 0.012, 0.24), (spec['center_screen'][0], spec['center_screen'][1]+.016, spec['center_screen'][2]),
        screen_center, rotation=(math.radians(9), 0, 0), bevel=0.008, parent=root)
    box('InteriorCenterBezel', (0.43, 0.020, 0.27), spec['center_screen'],
        dark, rotation=(math.radians(9), 0, 0), bevel=0.012, parent=root)
    # console
    box('InteriorConsole', (0.28, 0.80, 0.20), (0, -0.20, spec['clearance'] + 0.34),
        leather, bevel=0.04, parent=root)
    box('InteriorConsoleTrim', (0.24, 0.52, 0.022), (0, -0.28, spec['clearance'] + 0.44),
        trim, bevel=0.008, parent=root)
    box('InteriorGearSelector', (0.055, 0.12, 0.065), (0.12, -0.45, spec['clearance'] + 0.44),
        black, bevel=0.015, parent=root)
    # seats
    for side in (-1, 1):
        x = side * spec['seat_offset']
        box('InteriorSeatBase%s' % ('L' if side > 0 else 'R'),
            (0.46, 0.48, 0.13), (x, 0.10, spec['clearance'] + 0.28),
            leather, bevel=0.035, parent=root)
        back = box('InteriorSeatBack%s' % ('L' if side > 0 else 'R'),
                   (0.46, 0.15, 0.56), (x, 0.35, spec['clearance'] + 0.55),
                   leather, rotation=(math.radians(-12), 0, 0), bevel=0.04, parent=root)
        box('InteriorHeadrest%s' % ('L' if side > 0 else 'R'),
            (0.25, 0.13, 0.18), (x, 0.42, spec['clearance'] + 0.87),
            leather, rotation=(math.radians(-8), 0, 0), bevel=0.035, parent=root)
        box('InteriorSeatBelt%s' % ('L' if side > 0 else 'R'),
            (0.045, 0.035, 0.55), (x + side * 0.16, 0.25, spec['clearance'] + 0.58),
            black, bevel=0.008, parent=root)
    # rear bench
    box('InteriorRearBench', (W * 0.68, 0.46, 0.15), (0, 0.98, spec['clearance'] + 0.27),
        leather, bevel=0.04, parent=root)
    box('InteriorRearBack', (W * 0.68, 0.16, 0.52), (0, 1.17, spec['clearance'] + 0.48),
        leather, rotation=(math.radians(-10), 0, 0), bevel=0.04, parent=root)
    for x in (-0.36, 0, 0.36):
        box('InteriorRearHeadrest%.2f' % x, (0.24, 0.12, 0.16),
            (x, 1.22, spec['clearance'] + 0.78), leather, bevel=0.03, parent=root)
    # steering column (behind the rim, reaching the dash)
    col_start = Vector(spec['column_start'])
    col_end = Vector(spec['steering_center'])
    beam('InteriorSteeringColumn', col_start, col_end, 0.055, 0.055, black,
         parent=root, bevel=0.008)
    # pedals / footwell
    for x in (-0.08, 0.10):
        box('InteriorPedal%.2f' % x, (0.07, 0.12, 0.18),
            (spec['seat_offset'] + x, -0.68, spec['clearance'] + 0.16),
            black, rotation=(math.radians(-16), 0, 0), bevel=0.008, parent=root)
    # headliner strips around the glass roof
    box('InteriorHeadliner', (W * 0.66, 0.95, 0.022),
        (0, 0.08, spec['roof'] - 0.055), dark, bevel=0.02, parent=root)
    # rear-view mirror
    box('InteriorRearViewMirror', (0.22, 0.035, 0.075),
        (0, spec['cabin_front'] + 0.20, spec['roof'] - 0.12), black, bevel=0.02, parent=root)


def build_steering_wheel(spec, pivot, dark, trim, chrome, black):
    # All coordinates are local to the pivot: wheel plane XY, column axis +Z.
    rim_radius = 0.185
    torus_mesh('InteriorSteeringWheel', rim_radius, 0.017, (0, 0, 0),
               dark, major_segments=24, minor_segments=6, parent=pivot)
    # three spokes: left, right, bottom (BYD-style Y)
    for angle in (math.pi, 0.0, -math.pi / 2):
        mid = rim_radius * 0.52
        box('InteriorSteeringSpoke%.2f' % angle, (0.032, mid, 0.014),
            (mid * math.cos(angle) * 0.98, mid * math.sin(angle) * 0.98, 0),
            trim, rotation=(0, 0, angle - math.pi / 2), bevel=0.006, parent=pivot)
    # hub + centre pad + two button pods
    cylinder('InteriorSteeringHub', 0.062, 0.035, (0, 0, 0.008), trim,
             rotation=(0, 0, 0), vertices=24, parent=pivot)
    box('InteriorSteeringPad', (0.14, 0.10, 0.025), (0, 0, 0.03),
        dark, bevel=0.02, parent=pivot)
    box('InteriorSteeringBadge', (0.055, 0.030, 0.010), (0, 0, 0.045),
        chrome, bevel=0.006, parent=pivot)
    for side in (-1, 1):
        box('InteriorSteeringButton%s' % ('L' if side > 0 else 'R'),
            (0.045, 0.030, 0.014), (side * 0.105, 0.008, 0.022),
            black, bevel=0.006, parent=pivot)


# ---------------------------------------------------------------------------
# specifications
# ---------------------------------------------------------------------------

def seal_spec():
    L, W = 5.150, 1.999
    return {
        'name': 'Seal08',
        'length': L, 'width': W, 'clearance': 0.125, 'beltline': 0.96,
        'roof': 1.485,
        # (y, lower-body half width, roof half width, bottom, beltline, top)
        'stations': [
            (-2.575, 0.72, 0.66, 0.30, 0.71, 0.78),
            (-2.530, 0.86, 0.80, 0.20, 0.77, 0.84),
            (-2.420, 0.94, 0.90, 0.16, 0.84, 0.90),
            (-2.150, 0.985, 0.95, 0.135, 0.90, 0.95),
            (-1.820, 0.995, 0.97, 0.128, 0.92, 0.965),
            (-1.610, 1.000, 0.98, 0.125, 0.93, 0.975),
            (-1.250, 1.000, 0.97, 0.125, 0.94, 0.985),
            (-1.000, 1.000, 0.84, 0.125, 0.96, 1.040),
            (-0.780, 1.000, 0.74, 0.125, 0.96, 1.250),
            (-0.480, 1.000, 0.700, 0.125, 0.96, 1.450),
            (-0.200, 1.000, 0.700, 0.125, 0.96, 1.485),
            (0.350, 1.000, 0.700, 0.125, 0.96, 1.485),
            (0.750, 1.000, 0.690, 0.128, 0.96, 1.460),
            (1.050, 0.995, 0.675, 0.130, 0.97, 1.320),
            (1.300, 0.985, 0.665, 0.135, 0.98, 1.220),
            (1.550, 0.970, 0.700, 0.140, 0.970, 1.090),
            (1.900, 0.950, 0.880, 0.150, 0.940, 1.000),
            (2.200, 0.920, 0.860, 0.170, 0.900, 0.960),
            (2.420, 0.860, 0.800, 0.210, 0.840, 0.910),
            (2.550, 0.780, 0.720, 0.260, 0.780, 0.850),
            (2.575, 0.700, 0.650, 0.310, 0.730, 0.800),
        ],
        'side_windows': [(-0.94, 0.08), (0.18, 1.56)],
        'windshield_corners': [
            (-W * 0.37, -0.98, 0.985), (W * 0.37, -0.98, 0.985),
            (W * 0.33, -0.49, 1.435), (-W * 0.33, -0.49, 1.435),
        ],
        'rear_window_corners': [
            (-0.62, 0.76, 1.430), (0.62, 0.76, 1.430),
            (0.72, 1.62, 1.040), (-0.72, 1.62, 1.040),
        ],
        'paint': (0.60, 0.075, 0.095), 'paint_dark': (0.10, 0.012, 0.018),
        'rim_color': (0.15, 0.16, 0.18), 'caliper_color': (0.18, 0.18, 0.20),
        'leather': (0.74, 0.65, 0.52), 'interior_trim': (0.52, 0.49, 0.44),
        'indicator_material': 'Indicator',
        'front_axle': -1.61, 'rear_axle': 1.42,
        'half_track_front': 0.8575, 'half_track_rear': 0.8650,
        'tire_radius': 0.35155, 'front_wheel_radius': 0.35155,
        'rear_wheel_radius': 0.35155, 'tire_width': 0.245,
        'rim_radius': 0.2413, 'spokes': 10, 'arch_gap': 0.045,
        'arch_trim': 0.018, 'suv': False,
        'cabin_front': -1.00, 'cabin_rear': 1.70,
        'windshield_run': 0.55, 'rear_window_run': 0.94,
        'roof_half_width': 0.70, 'b_pillar_y': 0.14,
        'sunroof_width': 1.04,
        'eye': (0.355, 0.10, 1.115), 'eye_pitch': -4.0,
        'steering_center': (0.355, -0.585, 0.925),
        'column_axis': (0.0, 0.90, 0.38),
        'column_start': (0.355, -0.80, 0.885),
        'instrument_screen': (0.355, -0.685, 1.005),
        'center_screen': (0.0, -0.72, 1.000),
        'seat_offset': 0.355,
        'bumper_z': 0.39, 'lamp_z': 0.66,
    }


def l80_spec():
    L, W = 5.145, 1.998
    return {
        'name': 'L80',
        'length': L, 'width': W, 'clearance': 0.19, 'beltline': 1.15,
        'roof': 1.73,
        # high SUV roof, near-vertical tailgate
        'stations': [
            (-2.572, 0.78, 0.72, 0.34, 0.94, 1.04),
            (-2.520, 0.88, 0.83, 0.25, 1.03, 1.11),
            (-2.380, 0.95, 0.90, 0.21, 1.08, 1.16),
            (-2.150, 0.985, 0.95, 0.20, 1.12, 1.20),
            (-1.850, 1.000, 0.98, 0.19, 1.14, 1.22),
            (-1.500, 1.000, 0.98, 0.19, 1.15, 1.23),
            (-1.050, 1.000, 0.87, 0.19, 1.15, 1.28),
            (-0.750, 1.000, 0.78, 0.19, 1.15, 1.50),
            (-0.450, 1.000, 0.720, 0.19, 1.15, 1.70),
            (-0.100, 1.000, 0.715, 0.19, 1.15, 1.73),
            (0.600, 1.000, 0.715, 0.19, 1.15, 1.73),
            (1.100, 1.000, 0.715, 0.19, 1.15, 1.72),
            (1.450, 1.000, 0.700, 0.195, 1.14, 1.73),
            (1.700, 1.000, 0.700, 0.200, 1.13, 1.73),
            (2.000, 0.995, 0.700, 0.210, 1.12, 1.72),
            (2.300, 0.970, 0.710, 0.230, 1.10, 1.70),
            (2.480, 0.900, 0.760, 0.270, 1.06, 1.58),
            (2.572, 0.800, 0.740, 0.340, 1.02, 1.42),
        ],
        'side_windows': [(-0.95, 0.28), (0.38, 1.12), (1.20, 2.10)],
        'windshield_corners': [
            (-W * 0.37, -1.03, 1.175), (W * 0.37, -1.03, 1.175),
            (W * 0.34, -0.47, 1.665), (-W * 0.34, -0.47, 1.665),
        ],
        'rear_window_corners': [
            (-0.58, 2.00, 1.700), (0.58, 2.00, 1.700),
            (0.62, 2.52, 1.240), (-0.62, 2.52, 1.240),
        ],
        'paint': (0.18, 0.33, 0.23), 'paint_dark': (0.025, 0.040, 0.025),
        'rim_color': (0.075, 0.080, 0.085), 'caliper_color': (0.18, 0.18, 0.20),
        'leather': (0.70, 0.47, 0.22), 'interior_trim': (0.55, 0.44, 0.27),
        'indicator_material': 'Indicator',
        'front_axle': -1.60, 'rear_axle': 1.51,
        'half_track_front': 0.8600, 'half_track_rear': 0.8585,
        'tire_radius': 0.3925, 'front_wheel_radius': 0.39425,
        'rear_wheel_radius': 0.3915, 'tire_width': 0.265,
        'rim_radius': 0.254, 'spokes': 6, 'arch_gap': 0.050,
        'arch_trim': 0.030, 'suv': True,
        'cabin_front': -1.00, 'cabin_rear': 2.15,
        'windshield_run': 0.52, 'rear_window_run': 0.15,
        'roof_half_width': 0.715, 'b_pillar_y': 0.30,
        'sunroof_width': 1.00,
        'eye': (0.365, 0.12, 1.300), 'eye_pitch': -4.0,
        'steering_center': (0.365, -0.500, 1.075),
        'column_axis': (0.0, 0.86, 0.42),
        'column_start': (0.365, -0.74, 1.015),
        'instrument_screen': (0.365, -0.685, 1.155),
        'center_screen': (0.0, -0.66, 1.145),
        'seat_offset': 0.365,
        'bumper_z': 0.55, 'lamp_z': 0.93,
    }


# ---------------------------------------------------------------------------
# preview / export
# ---------------------------------------------------------------------------

def export_car(spec, root):
    path = os.path.join(OUT_MODELS, spec['file'])
    bpy.ops.object.select_all(action='DESELECT')
    # select the complete hierarchy
    def walk(obj):
        obj.select_set(True)
        for child in obj.children:
            walk(child)
    walk(root)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )
    print('EXPORTED', path)
    return path


def batch_static_parts(root):
    """Keep movable pivots intact, combine small static trims by material.

    Blender objects are useful while authoring; hundreds of separate objects
    are not useful in four simultaneous game views. Preserve semantic screens,
    calipers and the body shell, and merge only siblings sharing materials.
    """
    parents = [root] + [o for o in root.children if o.name.startswith('Wheel')]
    steering = bpy.data.objects.get('SteeringWheelPivot')
    if steering:
        parents.append(steering)
    for parent in parents:
        groups = {}
        for obj in list(parent.children):
            if obj.type != 'MESH' or obj.name in ('Body','InteriorInstrumentScreen','InteriorCenterScreen','InteriorSteeringWheel','InteriorSeatBaseL') or obj.name.startswith('BrakeCaliper'):
                continue
            key = (tuple(m.name for m in obj.data.materials),obj.name.startswith('Interior'))
            groups.setdefault(key,[]).append(obj)
        for (mats,interior),objects in groups.items():
            if len(objects)<2:
                continue
            bpy.ops.object.select_all(action='DESELECT')
            for obj in objects:
                obj.select_set(True)
            bpy.context.view_layer.objects.active=objects[0]
            bpy.ops.object.join()
            obj=bpy.context.object
            obj.name=('Interior' if interior else 'Surface')+'_'+parent.name+'_'+'_'.join(mats)


def add_preview(scene, spec):
    # ground
    mat_ground = material('PreviewGround', (0.22, 0.23, 0.24), roughness=0.82)
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    ground = bpy.context.object
    ground.name = 'PreviewGround'
    ground.data.materials.append(mat_ground)
    # lights
    world = bpy.data.worlds.new('PreviewWorld')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.32, 0.36, 0.40, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.7
    scene.world = world
    bpy.ops.object.light_add(type='AREA', location=(4.5, -5.5, 6.0))
    key = bpy.context.object
    key.name = 'KeyLight'
    key.data.energy = 1600
    key.data.shape = 'DISK'
    key.data.size = 5.0
    key.rotation_euler = (math.radians(-35), math.radians(15), math.radians(35))
    bpy.ops.object.light_add(type='AREA', location=(-5, 3.5, 4.5))
    fill = bpy.context.object
    fill.data.energy = 700
    fill.data.size = 6.0
    fill.rotation_euler = (math.radians(-45), 0, math.radians(-120))
    bpy.ops.object.light_add(type='SUN', location=(0, -2, 8))
    sun = bpy.context.object
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(35), math.radians(-20), math.radians(20))
    # camera
    bpy.ops.object.camera_add(location=(6.2, -7.4, 3.2))
    cam = bpy.context.object
    cam.name = 'PreviewCamera'
    target = Vector((0, -0.1, 0.8))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 58
    scene.camera = cam
    return cam


def render_preview(scene, spec, cam, path, location, target, lens=58):
    cam.location = location
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens
    scene.render.filepath = path
    scene.render.image_settings.file_format = 'PNG'
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except Exception:
        scene.render.engine = 'BLENDER_EEVEE'
    scene.render.film_transparent = False
    bpy.ops.render.render(write_still=True)
    print('RENDERED', path)


def build_and_export(spec):
    root, wheels = build_car(spec)
    batch_static_parts(root)
    scene = bpy.context.scene
    meshes=[o for o in root.children_recursive if o.type=='MESH']
    triangles=0
    for o in meshes:
        o.data.calc_loop_triangles()
        triangles+=len(o.data.loop_triangles)
    with open(os.path.join(OUT_DOCS,spec['name']+'-asset-stats.json'),'w') as f:
        json.dump({'meshes':len(meshes),'triangles':triangles,'materials':len(set(m.name for o in meshes for m in o.data.materials if m))},f,indent=2)
    if triangles > 8000:
        raise RuntimeError(f"{spec['name']}: {triangles} triangles exceeds the complete-car 8000 budget")
    glb = export_car(spec, root)
    cam = add_preview(scene, spec)
    name = spec['name']
    render_preview(scene, spec, cam,
                   os.path.join(OUT_DOCS, name + '-three-quarter.png'),
                   (6.2, -7.4, 3.0), (0, -0.1, 0.8), 52)
    render_preview(scene, spec, cam,
                   os.path.join(OUT_DOCS, name + '-side.png'),
                   (9.2, 0.1, 1.15), (0, 0.05, 0.72), 55)
    render_preview(scene, spec, cam,
                   os.path.join(OUT_DOCS, name + '-front.png'),
                   (0.0, -10.2, 1.35), (0, -0.2, 0.75), 55)
    # interior driver-eye view
    eye = Vector(spec['eye'])
    eye_cam_loc = (eye.x, eye.y, eye.z)
    render_preview(scene, spec, cam,
                   os.path.join(OUT_DOCS, name + '-interior.png'),
                   eye_cam_loc, (eye.x, -8.0, eye.z - 0.42), 24)
    # Open the saved source directly on the complete car, with materials visible.
    cam.location=(6.2,-7.4,3.0)
    cam.rotation_euler=(Vector((0,-.1,.8))-cam.location).to_track_quat('-Z','Y').to_euler()
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                space=area.spaces.active
                space.shading.type='SOLID'
                space.shading.color_type='MATERIAL'
                space.overlay.show_extras=False
                space.region_3d.view_location=(0,0,.8)
                space.region_3d.view_distance=8
                space.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_DOCS, 'Blender-' + name + '.blend'))
    print('SAVED_BLEND', os.path.join(OUT_DOCS, 'Blender-' + name + '.blend'))


def main():
    seal = seal_spec()
    seal['file'] = 'byd-seal-08.glb'
    build_and_export(seal)
    l80 = l80_spec()
    l80['file'] = 'onvo-l80.glb'
    build_and_export(l80)


if __name__ == '__main__':
    main()
