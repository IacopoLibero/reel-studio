"""Carousel 3D kit for Blender (run with the app's blender-run, headless, Cycles on the GPU).

Detailed props (phone, tablet, QR stand, cloche, glass, cup, cutlery, pepper mill, napkin, plate, bottle, menu card, tile, pen, cross), real-material helpers
(`real`, `wood`), a photographic studio, and the checks: `four_views`, `detail_views` and `metrics`. Build a scene script that imports this module:

    import sys, os; sys.path.insert(0, "<repo>/scripts/carousel/blender"); import kit

Textures are images in a folder (env CAROUSEL_TEX, default ./tex): make wood.png, paper.png, cloth.png, grain-h.png ... with textures.py first.
Renders and check grids are written to CAROUSEL_OUT (default: the system temp folder). Units: 1 unit is about 1 cm of a 10 cm object scaled up; objects are about 1 to 2.5 units high.
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector

import tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.environ.get("CAROUSEL_TEX") or os.path.join(os.getcwd(), "tex")
OUT = os.environ.get("CAROUSEL_OUT") or tempfile.gettempdir()

def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c]
    return (*c, 1.0)

def clear():
    bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete()
    for b in (bpy.data.materials, bpy.data.meshes, bpy.data.lights, bpy.data.cameras, bpy.data.images):
        for x in list(b): b.remove(x)

# ---------- materials ----------
def mat(name, color="#ffffff", rough=0.5, metal=0.0, coat=0.0, coat_rough=0.03, trans=0.0, ior=1.45, image=None, emit=0.0, spec=0.5, aniso=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n = m.node_tree.nodes; l = m.node_tree.links; b = n["Principled BSDF"]
    b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    if "Coat Weight" in b.inputs: b.inputs["Coat Weight"].default_value = coat; b.inputs["Coat Roughness"].default_value = coat_rough
    if "Transmission Weight" in b.inputs and trans: b.inputs["Transmission Weight"].default_value = trans
    b.inputs["IOR"].default_value = ior
    if "Anisotropic" in b.inputs and aniso: b.inputs["Anisotropic"].default_value = aniso
    if image:
        t = n.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(os.path.join(TEX, image)); t.interpolation = "Cubic"; t.extension = "EXTEND"
        l.new(t.outputs["Color"], b.inputs["Base Color"])
        if emit: l.new(t.outputs["Color"], b.inputs["Emission Color"]); b.inputs["Emission Strength"].default_value = emit
    else:
        b.inputs["Base Color"].default_value = lin(color)
    return m

def noise_bump(m, scale=900, strength=0.025):
    """A very fine surface variation: stops flat colours from looking like plastic toys."""
    n = m.node_tree.nodes; l = m.node_tree.links; b = n["Principled BSDF"]
    t = n.new("ShaderNodeTexNoise"); t.inputs["Scale"].default_value = scale; t.inputs["Detail"].default_value = 6
    bm = n.new("ShaderNodeBump"); bm.inputs["Strength"].default_value = strength
    l.new(t.outputs["Fac"], bm.inputs["Height"]); l.new(bm.outputs["Normal"], b.inputs["Normal"])
    return m


def real(m, bump=None, rough_var=0.0, streak=None, color_var=0.0, color_scale=6.0, speck=None, smudge=0.0, rings=None, dots=None, color_var2=None, overlay=None, hmap=None):
    """Surface realism on top of a flat material. Sizes are in object units: judge them at the size the object has in the FINAL picture
    (about 140 px per unit in a carousel), so a bump finer than ~0.01 unit is invisible: use 40-120 for grain, 3-12 for tonal patches.
    bump=(scale, strength) grain; streak=strength brushed lines; rings=(scale, strength) turned/brushed circles (domes, lids); speck=(scale, strength) pores;
    color_var + color_scale (and color_var2=(var, scale)) tonal drift; dots=(scale, threshold, (r,g,b)) glaze speckles; smudge/rough_var wandering roughness."""
    n = m.node_tree.nodes; l = m.node_tree.links; b = n["Principled BSDF"]
    tc = n.new("ShaderNodeTexCoord")
    def noise(scale, detail=8.0, rough=0.55, stretch=None):
        t = n.new("ShaderNodeTexNoise"); t.inputs["Scale"].default_value = scale; t.inputs["Detail"].default_value = detail; t.inputs["Roughness"].default_value = rough
        src = tc.outputs["Object"]
        if stretch:
            mp = n.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = stretch; l.new(src, mp.inputs["Vector"]); src = mp.outputs["Vector"]
        l.new(src, t.inputs["Vector"]); return t
    normals = []
    def add_bump(height_socket, strength):
        bm = n.new("ShaderNodeBump"); bm.inputs["Strength"].default_value = strength; l.new(height_socket, bm.inputs["Height"]); normals.append(bm)
    if bump: add_bump(noise(bump[0], 10.0, 0.62).outputs["Fac"], bump[1])
    if streak: add_bump(noise(220.0, 5.0, 0.5, stretch=(1.0, 1.0, 40.0)).outputs["Fac"], streak)
    if rings:
        w = n.new("ShaderNodeTexWave"); w.wave_type = "RINGS"; w.rings_direction = "Z"; w.inputs["Scale"].default_value = rings[0]; w.inputs["Distortion"].default_value = 1.5; w.inputs["Detail"].default_value = 4.0
        l.new(tc.outputs["Object"], w.inputs["Vector"]); add_bump(w.outputs["Fac"], rings[1])
    if speck:
        v = n.new("ShaderNodeTexVoronoi"); v.inputs["Scale"].default_value = speck[0]; l.new(tc.outputs["Object"], v.inputs["Vector"]); add_bump(v.outputs["Distance"], speck[1])
    if hmap:
        mp = n.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (1 / hmap[1], 1 / hmap[1], 1 / hmap[1]); l.new(tc.outputs["Object"], mp.inputs["Vector"])
        hi = n.new("ShaderNodeTexImage"); hi.image = bpy.data.images.load(os.path.join(TEX, hmap[0])); hi.image.colorspace_settings.name = "Non-Color"; hi.extension = "REPEAT"; hi.projection = "BOX"; hi.projection_blend = 0.2
        l.new(mp.outputs["Vector"], hi.inputs["Vector"]); add_bump(hi.outputs["Color"], hmap[2])
    for i, bm in enumerate(normals):
        if i: l.new(normals[i - 1].outputs["Normal"], bm.inputs["Normal"])
    if normals: l.new(normals[-1].outputs["Normal"], b.inputs["Normal"])
    if rough_var or smudge:
        base = b.inputs["Roughness"].default_value
        t = noise(2.2 if smudge else 14.0, 4.0, 0.6); mr = n.new("ShaderNodeMapRange"); amp = smudge or rough_var
        mr.inputs["To Min"].default_value = max(0.0, base - amp * (0.2 if smudge else 1.0)); mr.inputs["To Max"].default_value = min(1.0, base + amp)
        l.new(t.outputs["Fac"], mr.inputs["Value"]); l.new(mr.outputs["Result"], b.inputs["Roughness"])
    def tint(var, scale, dark=0.55):
        t = noise(scale, 5.0, 0.6); mx = n.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"; mx.inputs["Factor"].default_value = var
        src = b.inputs["Base Color"].links[0].from_socket if b.inputs["Base Color"].links else None
        if src is None: mx.inputs["A"].default_value = b.inputs["Base Color"].default_value
        else: l.new(src, mx.inputs["A"])
        ramp = n.new("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].color = (dark, dark * 0.97, dark * 0.93, 1); ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
        l.new(t.outputs["Fac"], ramp.inputs["Fac"]); l.new(ramp.outputs["Color"], mx.inputs["B"]); l.new(mx.outputs["Result"], b.inputs["Base Color"])
    if overlay:
        mp = n.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (1 / overlay[1], 1 / overlay[1], 1 / overlay[1]); l.new(tc.outputs["Object"], mp.inputs["Vector"])
        oi = n.new("ShaderNodeTexImage"); oi.image = bpy.data.images.load(os.path.join(TEX, overlay[0])); oi.extension = "REPEAT"; oi.projection = "BOX"; oi.projection_blend = 0.2; l.new(mp.outputs["Vector"], oi.inputs["Vector"])
        mx = n.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"; mx.inputs["Factor"].default_value = overlay[2]
        src = b.inputs["Base Color"].links[0].from_socket if b.inputs["Base Color"].links else None
        if src is None: mx.inputs["A"].default_value = b.inputs["Base Color"].default_value
        else: l.new(src, mx.inputs["A"])
        l.new(oi.outputs["Color"], mx.inputs["B"]); l.new(mx.outputs["Result"], b.inputs["Base Color"])
    if color_var: tint(color_var, color_scale)
    if color_var2: tint(color_var2[0], color_var2[1], 0.7)
    if dots:
        v = n.new("ShaderNodeTexVoronoi"); v.inputs["Scale"].default_value = dots[0]; l.new(tc.outputs["Object"], v.inputs["Vector"])
        cr = n.new("ShaderNodeValToRGB"); cr.color_ramp.elements[0].position = 0.0; cr.color_ramp.elements[0].color = (*dots[2], 1); cr.color_ramp.elements[1].position = dots[1]; cr.color_ramp.elements[1].color = (1, 1, 1, 1)
        l.new(v.outputs["Distance"], cr.inputs["Fac"])
        mx = n.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"; mx.inputs["Factor"].default_value = 1.0
        src = b.inputs["Base Color"].links[0].from_socket if b.inputs["Base Color"].links else None
        if src is None: mx.inputs["A"].default_value = b.inputs["Base Color"].default_value
        else: l.new(src, mx.inputs["A"])
        l.new(cr.outputs["Color"], mx.inputs["B"]); l.new(mx.outputs["Result"], b.inputs["Base Color"])
    return m

def wood(name="wood", scale=1.0):
    """A table top from a generated wood image (planks, grain, pores, seams) repeated every 6 x 4 units, with a bump from the same grain and a soft sheen."""
    m = bpy.data.materials.new(name); m.use_nodes = True; n = m.node_tree.nodes; l = m.node_tree.links; b = n["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.46
    if "Coat Weight" in b.inputs: b.inputs["Coat Weight"].default_value = 0.2; b.inputs["Coat Roughness"].default_value = 0.25
    tc = n.new("ShaderNodeTexCoord"); mp = n.new("ShaderNodeMapping"); l.new(tc.outputs["Object"], mp.inputs["Vector"]); mp.inputs["Scale"].default_value = (1 / (6.0 * scale), 1 / (4.0 * scale), 1.0)
    t = n.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(os.path.join(TEX, "wood.png")); t.extension = "REPEAT"; l.new(mp.outputs["Vector"], t.inputs["Vector"]); l.new(t.outputs["Color"], b.inputs["Base Color"])
    h = n.new("ShaderNodeTexImage"); h.image = bpy.data.images.load(os.path.join(TEX, "wood-h.png")); h.image.colorspace_settings.name = "Non-Color"; h.extension = "REPEAT"; l.new(mp.outputs["Vector"], h.inputs["Vector"])
    bm = n.new("ShaderNodeBump"); bm.inputs["Strength"].default_value = 0.6; bm.inputs["Distance"].default_value = 0.02; l.new(h.outputs["Color"], bm.inputs["Height"]); l.new(bm.outputs["Normal"], b.inputs["Normal"])
    return m

# ---------- geometry ----------
def rr_pts(w, h, r, seg=10):
    pts = []; cx = w / 2 - r; cz = h / 2 - r
    for sx, sz, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg); pts.append((sx * cx + r * math.cos(a), sz * cz + r * math.sin(a)))
    return pts

def prism(name, w, h, d, r, mats, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, seg=10, parent=None):
    """A rounded-rectangle slab: front face (-y) is material 1 with UVs, everything else material 0."""
    me = bpy.data.meshes.new(name); bm = bmesh.new(); pts = rr_pts(w, h, r, seg)
    f = [bm.verts.new((x, -d / 2, z)) for x, z in pts]; b = [bm.verts.new((x, d / 2, z)) for x, z in pts]
    uv = bm.loops.layers.uv.new("uv")
    ff = bm.faces.new(f); ff.material_index = 1
    for lp in ff.loops: lp[uv].uv = (lp.vert.co.x / w + 0.5, lp.vert.co.z / h + 0.5)
    bm.faces.new(list(reversed(b)))
    n = len(pts)
    for i in range(n): bm.faces.new((f[i], b[i], b[(i + 1) % n], f[(i + 1) % n]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    o.location = loc; o.rotation_euler = [math.radians(a) for a in rot]
    for m in mats: o.data.materials.append(m)
    if len(mats) == 1:
        pass
    for p in o.data.polygons: p.use_smooth = True
    if bevel:
        bv = o.modifiers.new("bv", "BEVEL"); bv.width = bevel; bv.segments = 4; bv.limit_method = "ANGLE"; bv.angle_limit = math.radians(35)
    if parent: o.parent = parent
    return o

def lathe(name, prof, m, loc=(0, 0, 0), steps=96, solid=0.0, rot=(0, 0, 0), parent=None):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new((r, 0, z)) for r, z in prof]
    for a, c in zip(vs, vs[1:]): bm.edges.new((a, c))
    bmesh.ops.spin(bm, geom=bm.verts[:] + bm.edges[:], cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=steps)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o); o.location = loc; o.rotation_euler = [math.radians(a) for a in rot]
    for p in o.data.polygons: p.use_smooth = True
    if solid:
        s = o.modifiers.new("s", "SOLIDIFY"); s.thickness = solid; s.offset = 1
    o.data.materials.append(m)
    if parent: o.parent = parent
    return o

def cyl(name, r, d, m, loc, rot=(0, 0, 0), parent=None, bevel=0.0, verts=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d, location=loc, rotation=[math.radians(a) for a in rot]); o = bpy.context.object; o.name = name
    for p in o.data.polygons: p.use_smooth = True
    if bevel:
        bv = o.modifiers.new("bv", "BEVEL"); bv.width = bevel; bv.segments = 4; bv.limit_method = "ANGLE"
    o.data.materials.append(m)
    if parent: o.parent = parent
    return o

def empty(name, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    e = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(e)
    e.location = loc; e.rotation_euler = [math.radians(a) for a in rot]; e.scale = (scale, scale, scale); return e

def adopt(parent, *objs):
    for o in objs: o.parent = parent
    return parent

def shared_mats():
    return dict(
        titanium=real(mat("titanium", "#a9aaad", 0.30, 1.0, aniso=0.5), bump=(90, 0.05), streak=0.35, rough_var=0.05, color_var=0.12, color_scale=6.0),
        black_glass=real(mat("blackglass", "#050506", 0.05, 0.0, coat=1.0), smudge=0.2),
        back_glass=real(mat("backglass", "#1c1d20", 0.10, 0.0, coat=1.0), smudge=0.25, color_var=0.3, color_scale=3.0),
        lens=mat("lens", "#08090c", 0.02, 0.0, coat=1.0), lens_ring=real(mat("lensring", "#6e7075", 0.25, 1.0), streak=0.3, rings=(160, 0.15)),
        paper=real(mat("paper", "#fffdf7", 0.82), overlay=("paper.png", 1.4, 0.5), hmap=("paper.png", 1.4, 0.3), rough_var=0.2, color_var=0.08, color_scale=5.0, color_var2=(0.05, 16.0)),
        ink=real(mat("ink", "#1b1b1d", 0.4, coat=0.25), bump=(60, 0.25), rough_var=0.15), red=real(mat("red", "#d94a3d", 0.46, coat=0.15), hmap=("grain-h.png", 0.9, 0.7), rough_var=0.16, color_var=0.18, color_scale=6.0, color_var2=(0.1, 20.0)),
        chrome=real(mat("chrome", "#e8e9ec", 0.06, 1.0), smudge=0.34, rings=(90, 0.1), bump=(120, 0.03), color_var=0.08, color_scale=4.0), alu=real(mat("alu", "#c8c9cc", 0.34, 1.0), bump=(90, 0.05), streak=0.4, rough_var=0.05, color_var=0.1, color_scale=5.0),
        ceramic=real(mat("ceramic", "#f6f3ec", 0.14, coat=0.6, coat_rough=0.02), bump=(55, 0.16), rough_var=0.12, color_var=0.1, color_scale=3.0, dots=(120, 0.04, (0.35, 0.3, 0.26))),
        cover=real(mat("cover", "#2a2b2e", 0.62), bump=(80, 0.5), rough_var=0.12, speck=(140, 0.25)),
    )

# ---------- the objects ----------
def phone(M, tex, loc=(0, 0, 0), rot=(0, 0, 0), s=1.0):
    W, H, D, R = 0.78, 1.60, 0.085, 0.125
    root = empty("phone", loc, rot, s)
    body = prism("pframe", W, H, D, R, [M["titanium"], M["titanium"]], bevel=0.011, parent=root)
    back = prism("pback", W - 0.016, H - 0.016, 0.006, R - 0.008, [M["back_glass"], M["back_glass"]], loc=(0, D / 2 - 0.002, 0), parent=root)
    bez = prism("pbezel", W - 0.016, H - 0.016, 0.008, R - 0.008, [M["black_glass"], M["black_glass"]], loc=(0, -D / 2 + 0.001, 0), bevel=0.003, parent=root)
    scr = prism("pscreen", W - 0.044, H - 0.044, 0.004, R - 0.022, [M["black_glass"], real(mat("pscr", image=tex, rough=0.08, coat=0.25, coat_rough=0.12, emit=0.65), smudge=0.1)], loc=(0, -D / 2 - 0.0035, 0), parent=root)
    isl = prism("island", 0.205, 0.058, 0.004, 0.0285, [M["black_glass"], M["black_glass"]], loc=(0, -D / 2 - 0.0065, H / 2 - 0.095), parent=root)
    # camera plateau on the back, three lenses
    plat = prism("plateau", 0.37, 0.37, 0.016, 0.085, [M["back_glass"], M["back_glass"]], loc=(-0.15, D / 2 + 0.008, H / 2 - 0.27), bevel=0.004, parent=root)
    for i, (dx, dz) in enumerate(((-0.075, 0.075), (0.075, 0.075), (0.0, -0.075))):
        cx, cz = -0.15 + dx, H / 2 - 0.27 + dz
        cyl("ring", 0.074, 0.018, M["lens_ring"], (cx, D / 2 + 0.026, cz), (90, 0, 0), root, 0.004)
        cyl("lens", 0.056, 0.02, M["lens"], (cx, D / 2 + 0.030, cz), (90, 0, 0), root, 0.003)
        cyl("glint", 0.018, 0.021, M["black_glass"], (cx, D / 2 + 0.032, cz), (90, 0, 0), root)
    cyl("flash", 0.026, 0.012, mat("flash", "#f3e6b6", 0.2), (-0.015, D / 2 + 0.016, H / 2 - 0.12), (90, 0, 0), root)
    # side buttons
    prism("power", 0.014, 0.2, 0.012, 0.005, [M["titanium"], M["titanium"]], loc=(W / 2 + 0.004, 0, 0.16), rot=(0, 0, 90), bevel=0.003, parent=root)
    prism("volup", 0.014, 0.13, 0.012, 0.005, [M["titanium"], M["titanium"]], loc=(-W / 2 - 0.004, 0, 0.22), rot=(0, 0, 90), bevel=0.003, parent=root)
    prism("voldn", 0.014, 0.13, 0.012, 0.005, [M["titanium"], M["titanium"]], loc=(-W / 2 - 0.004, 0, 0.04), rot=(0, 0, 90), bevel=0.003, parent=root)
    prism("action", 0.014, 0.07, 0.012, 0.005, [M["titanium"], M["titanium"]], loc=(-W / 2 - 0.004, 0, 0.38), rot=(0, 0, 90), bevel=0.003, parent=root)
    body.location = (0, 0, 0)
    root.location = Vector(loc) + Vector((0, 0, H / 2 * s))
    return root

def tablet(M, tex, loc=(0, 0, 0), rot=(0, 0, 0), s=1.0, tilt=14):
    W, H, D, R = 2.30, 1.62, 0.07, 0.11
    root = empty("tablet", loc, rot, s)
    pivot = empty("tpivot", (0, 0, 0), (-tilt, 0, 0)); pivot.parent = root
    body = prism("tbody", W, H, D, R, [M["alu"], M["alu"]], loc=(0, 0, H / 2), bevel=0.01, parent=pivot)
    prism("tbezel", W - 0.02, H - 0.02, 0.008, R - 0.01, [M["black_glass"], M["black_glass"]], loc=(0, -D / 2 + 0.001, H / 2), bevel=0.003, parent=pivot)
    sw = W - 0.11; sh = H - 0.11
    prism("tscreen", sw, sh, 0.004, 0.05, [M["black_glass"], real(mat("tscr", image=tex, rough=0.12, coat=0.15, coat_rough=0.2, emit=0.38), smudge=0.05)], loc=(0, -D / 2 - 0.0035, H / 2), parent=pivot)
    cyl("fcam", 0.017, 0.004, M["lens"], (0, -D / 2 - 0.0045, H - 0.045), (90, 0, 0), pivot)
    cyl("logo", 0.085, 0.004, M["chrome"], (0, D / 2 + 0.0025, H / 2 + 0.1), (90, 0, 0), pivot)
    # kickstand: a leg hinged on the back at 75% of the height, reaching the floor 0.95 behind it
    th = math.radians(-tilt); hz = H * 0.75
    hy = D / 2 * math.cos(th) - hz * math.sin(th); hzw = D / 2 * math.sin(th) + hz * math.cos(th)
    dy, dz = 0.95, -hzw; L = math.hypot(dy, dz); phi = math.degrees(math.atan2(-dy, dz))
    prism("leg", W * 0.6, L, 0.035, 0.035, [M["alu"], M["alu"]], loc=(0, hy + dy / 2, hzw + dz / 2), rot=(phi, 0, 0), bevel=0.007, parent=root)
    return root

def tent(M, tex, loc=(0, 0, 0), rot=(0, 0, 0), s=1.0):
    W, H = 1.30, 1.75; tilt = 11
    root = empty("tent", loc, rot, s)
    pf = prism("front", W, H, 0.03, 0.055, [M["paper"], real(mat("qrface", image=tex, rough=0.72), overlay=("paper.png", 1.4, 0.5), hmap=("paper.png", 1.4, 0.3), rough_var=0.2, color_var=0.07, color_scale=5.0, color_var2=(0.05, 16.0))], loc=(0, -0.2, H / 2 * math.cos(math.radians(tilt))), rot=(-tilt, 0, 0), bevel=0.006, parent=root)
    pb = prism("back", W, H, 0.03, 0.055, [M["paper"], M["paper"]], loc=(0, 0.2, H / 2 * math.cos(math.radians(tilt))), rot=(tilt, 0, 0), bevel=0.006, parent=root)
    for p in (pf, pb): p.rotation_euler.z = 0
    return root

def cloche(M, loc=(0, 0, 0), s=1.0, rot=(0, 0, 0)):
    root = empty("cloche", loc, rot, s)
    lathe("plate", [(0, 0.0), (0.88, 0.0), (0.96, 0.02), (1.12, 0.14), (1.16, 0.165), (1.15, 0.175), (1.10, 0.165), (0.95, 0.075), (0.82, 0.05), (0, 0.05)], M["ceramic"], parent=root)
    lathe("tray", [(0.86, 0.05), (0.88, 0.075)], M["chrome"], solid=0.006, parent=root)
    prof = [(0.84, 0.075), (0.845, 0.11)]
    for i in range(1, 41):
        a = i / 40 * math.pi / 2; prof.append((0.845 * math.cos(a) ** 0.93, 0.11 + 0.88 * math.sin(a) ** 0.86))
    lathe("dome", prof, M["chrome"], solid=0.014, parent=root)
    lathe("bead", [(0.862, 0.072), (0.862, 0.098)], M["chrome"], solid=0.012, parent=root)
    lathe("knobbase", [(0.0, 0.97), (0.11, 0.97), (0.085, 1.0), (0.045, 1.04), (0.03, 1.07), (0.0, 1.07)], M["chrome"], parent=root)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=0.085, location=(0, 0, 1.108)); k = bpy.context.object; k.scale = (1, 1, 0.9)
    for p in k.data.polygons: p.use_smooth = True
    k.data.materials.append(M["chrome"]); k.parent = root
    return root

# ---------- studio ----------
def studio(floor=True, floor_color="#dcd9d3", env=0.5, lights=True):
    sc = bpy.context.scene
    w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
    n = w.node_tree.nodes; l = w.node_tree.links; bg = n["Background"]
    tc = n.new("ShaderNodeTexCoord"); sp = n.new("ShaderNodeSeparateXYZ"); ramp = n.new("ShaderNodeValToRGB")
    l.new(tc.outputs["Window"], sp.inputs["Vector"]); l.new(sp.outputs["Y"], ramp.inputs["Fac"]); l.new(ramp.outputs["Color"], bg.inputs["Color"])
    ramp.color_ramp.elements[0].color = (0.55, 0.55, 0.56, 1); ramp.color_ramp.elements[1].color = (0.95, 0.94, 0.92, 1); bg.inputs["Strength"].default_value = env
    def softbox(name, loc, size, energy, target=(0, 0, 0.8), color=(1, 1, 1), emit_vis=True):
        bpy.ops.mesh.primitive_plane_add(size=1, location=loc); o = bpy.context.object; o.name = name; o.scale = (size[0], size[1], 1)
        d = Vector(target) - Vector(loc); o.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
        m = bpy.data.materials.new(name); m.use_nodes = True; nn = m.node_tree.nodes
        for x in list(nn): nn.remove(x)
        e = nn.new("ShaderNodeEmission"); e.inputs["Strength"].default_value = energy; e.inputs["Color"].default_value = (*color, 1)
        out = nn.new("ShaderNodeOutputMaterial"); m.node_tree.links.new(e.outputs["Emission"], out.inputs["Surface"]); o.data.materials.append(m)
        o.visible_camera = False; o.visible_shadow = True
        return o
    if lights:
      softbox("key", (-6.5, -6.5, 7.5), (5.5, 4.0), 14.0, color=(1.0, 0.97, 0.93))
      softbox("fill", (7.5, -5.0, 4.0), (5.0, 5.0), 5.0, color=(0.93, 0.96, 1.0))
      softbox("top", (0.5, -1.0, 9.5), (7.0, 3.0), 7.0)
      softbox("strip", (5.5, 4.5, 3.5), (1.6, 6.0), 26.0, color=(1.0, 0.9, 0.8))   # rim light from behind
      softbox("strip2", (-5.5, 4.5, 3.0), (1.4, 6.0), 18.0, color=(0.9, 0.94, 1.0))
    # dark cards give metal something to reflect against
    for nm, loc in (("flagL", (-8, 1, 2.0)), ("flagR", (8.5, -0.5, 2.0))):
      if lights:
        bpy.ops.mesh.primitive_plane_add(size=1, location=loc); o = bpy.context.object; o.name = nm; o.scale = (1.6, 5, 1)
        o.rotation_euler = (Vector((0, 0, 0.8)) - Vector(loc)).to_track_quat("Z", "Y").to_euler()
        mm = bpy.data.materials.new(nm); mm.use_nodes = True; mm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.01, 0.01, 0.012, 1); o.data.materials.append(mm); o.visible_camera = False
    if floor:
        bpy.ops.mesh.primitive_plane_add(size=120, location=(0, 0, 0)); f = bpy.context.object; f.name = "floor"
        fm = mat("floor", floor_color, 0.55); f.data.materials.append(fm)

def camera(loc, target, lens=85, fstop=0.0, focus=None):
    cam = bpy.data.cameras.new("cam"); cam.lens = lens; cam.sensor_width = 36
    co = bpy.data.objects.new("cam", cam); bpy.context.collection.objects.link(co); co.location = loc
    co.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler(); bpy.context.scene.camera = co
    if fstop:
        cam.dof.use_dof = True; cam.dof.aperture_fstop = fstop
        if focus: cam.dof.focus_distance = (Vector(focus) - Vector(loc)).length
    return co

def render_setup(samples=64, w=560, h=560, transparent=False):
    sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.samples = samples; sc.cycles.use_denoising = True
    try: sc.cycles.denoiser = "OPENIMAGEDENOISE"
    except Exception: pass
    pr = bpy.context.preferences.addons["cycles"].preferences; pr.compute_device_type = "OPTIX"; pr.get_devices()
    for d in pr.devices: d.use = d.type == "OPTIX"
    sc.cycles.device = "GPU"; sc.cycles.max_bounces = 10; sc.cycles.glossy_bounces = 6; sc.cycles.transmission_bounces = 8
    sc.render.resolution_x = w; sc.render.resolution_y = h; sc.render.resolution_percentage = 100; sc.render.film_transparent = transparent
    sc.view_settings.view_transform = "AgX" if not transparent else "Standard"
    sc.render.image_settings.file_format = "PNG"

def four_views(builder, out, center_z=0.8, dist=7.5):
    """The checker: front, three-quarter, side and top, in one grid, so a defect shows at once."""
    clear(); M = shared_mats(); studio(); obj = builder(M)
    metrics()
    render_setup(48, 520, 520)
    views = [("front", 0, 8), ("three-quarter", 38, 16), ("back", 150, 14), ("top", 20, 62)]
    paths = []
    for name, az, el in views:
        for o in [o for o in bpy.data.objects if o.type == "CAMERA"]: bpy.data.objects.remove(o)
        a = math.radians(az - 90); e = math.radians(el)
        loc = Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e))) * dist + Vector((0, 0, center_z))
        camera(loc, (0, 0, center_z), 70)
        p = os.path.join(OUT, f"_v_{name}.png"); bpy.context.scene.render.filepath = p; bpy.ops.render.render(write_still=True); paths.append(p)
    print("VIEWS", ",".join(paths))
    if out and len(paths) == 4: grid(paths, out)
    if len(paths) == 4 and out: grid(paths, out)


def menu_card(M, tex, loc=(0, 0, 0), rot=(0, 0, 0), w=1.7, h=2.38):
    root = empty("menucard", loc, rot)
    prism("card", w, h, 0.035, 0.04, [M["paper"], real(mat("menutex", image=tex, rough=0.8), overlay=("paper.png", 1.4, 0.5), hmap=("paper.png", 1.4, 0.3), rough_var=0.2, color_var=0.07, color_scale=5.0, color_var2=(0.05, 16.0))], loc=(0, 0, h / 2), bevel=0.005, parent=root)
    return root

def chip(M, tex, loc=(0, 0, 0), rot=(0, 0, 0), w=1.0, h=0.4):
    root = empty("chip", loc, rot)
    prism("chipb", w, h, 0.05, 0.07, [M["paper"], mat("chiptex", image=tex, rough=0.35, coat=0.4)], loc=(0, 0, 0), bevel=0.008, parent=root)
    return root

def cup(M, loc=(0, 0, 0), s=1.0):
    root = empty("cup", loc, (0, 0, 0), s)
    lathe("saucer", [(0, 0), (0.62, 0), (0.78, 0.045), (0.8, 0.07), (0.74, 0.06), (0.3, 0.05), (0, 0.05)], M["ceramic"], parent=root)
    lathe("cupb", [(0, 0.05), (0.26, 0.05), (0.36, 0.09), (0.5, 0.52), (0.52, 0.56), (0.5, 0.57), (0.46, 0.52), (0.34, 0.14), (0, 0.12)], M["ceramic"], parent=root)
    lathe("coffee", [(0, 0.455), (0.455, 0.46)], real(mat("coffee", "#3b2316", 0.12, coat=0.6), rough_var=0.05), solid=0.004, parent=root)
    lathe("crema", [(0, 0.462), (0.30, 0.462)], real(mat("crema", "#a9743f", 0.35, coat=0.3), bump=(25, 0.25), color_var=0.7, color_scale=6.0, color_var2=(0.4, 18.0)), solid=0.002, parent=root)
    cd = bpy.data.curves.new("handle", "CURVE"); cd.dimensions = "3D"; cd.bevel_depth = 0.042; cd.bevel_resolution = 8; cd.use_fill_caps = True
    sp = cd.splines.new("BEZIER"); sp.bezier_points.add(2)
    pts = [(0.47, 0.0, 0.44), (0.80, 0.0, 0.34), (0.41, 0.0, 0.18)]
    hl = [((0.52, 0, 0.44), (0.7, 0, 0.44)), ((0.8, 0, 0.42), (0.8, 0, 0.26)), ((0.7, 0, 0.18), (0.5, 0, 0.18))]
    for bp, p, (l_, r_) in zip(sp.bezier_points, pts, hl):
        bp.co = p; bp.handle_left = l_; bp.handle_right = r_
    ho = bpy.data.objects.new("handle", cd); bpy.context.collection.objects.link(ho); ho.parent = root
    ho.data.materials.append(M["ceramic"])
    return root

def tumbler(M, loc=(0, 0, 0), s=1.0):
    """One drinking glass: a single closed wall (thick base, round rim) and the water inside it, never two shells."""
    root = empty("tumbler", loc, (0, 0, 0), s)
    gl = mat("glass", "#ffffff", 0.0, 0.0, trans=1.0, ior=1.5)
    prof = [(0.0, 0.0), (0.30, 0.0), (0.335, 0.012), (0.36, 0.05), (0.372, 0.9), (0.376, 0.925), (0.366, 0.94), (0.352, 0.925), (0.347, 0.9), (0.335, 0.16), (0.30, 0.135), (0.0, 0.13)]
    lathe("glass", prof, gl, parent=root)
    lathe("water", [(0.0, 0.135), (0.30, 0.137), (0.334, 0.18), (0.346, 0.62), (0.338, 0.64), (0.0, 0.635)], mat("water", "#f1fafc", 0.0, trans=1.0, ior=1.33), parent=root)
    return root

def tile(M, loc=(0, 0, 0), rot=(0, 0, 0), s=1.0):
    root = empty("tile", loc, rot, s)
    prism("tileb", 2.2, 1.2, 0.3, 0.13, [M["red"], real(mat("logotex", image="logo.png", rough=0.52, coat=0.1), hmap=("grain-h.png", 0.9, 0.7), rough_var=0.16, color_var=0.14, color_scale=6.0)], loc=(0, 0, 0.6), bevel=0.02, parent=root)
    return root

def pen(M, loc=(0, 0, 0), rot=(0, 0, 0)):
    root = empty("pen", loc, rot)
    lathe("pb", [(0, 0), (0.05, 0), (0.055, 0.05), (0.055, 1.5), (0.04, 1.58), (0, 1.58)], M["red"], parent=root)
    lathe("pt", [(0.04, 1.58), (0.02, 1.78), (0.0, 1.8)], M["ink"], parent=root)
    prism("clip", 0.03, 0.55, 0.014, 0.01, [M["chrome"], M["chrome"]], loc=(0.065, 0, 1.15), parent=root)
    return root

def cross(M, loc=(0, 0, 0), rot=(0, 0, 0), s=1.0, arm=1.0, wide=0.11, depth=0.09):
    """A red X cut from ONE piece (a plus shape turned 45 degrees and extruded): no overlapping bars, so no dirty centre."""
    pts = [(arm, wide), (wide, wide), (wide, arm), (-wide, arm), (-wide, wide), (-arm, wide), (-arm, -wide), (-wide, -wide), (-wide, -arm), (wide, -arm), (wide, -wide), (arm, -wide)]
    c, sn = math.cos(math.radians(45)), math.sin(math.radians(45))
    pts = [(x * c - y * sn, x * sn + y * c) for x, y in pts]
    me = bpy.data.meshes.new("x"); bm = bmesh.new()
    f = [bm.verts.new((x, -depth / 2, z)) for x, z in pts]; b = [bm.verts.new((x, depth / 2, z)) for x, z in pts]
    bm.faces.new(f); bm.faces.new(list(reversed(b)))
    n = len(pts)
    for i in range(n): bm.faces.new((f[i], b[i], b[(i + 1) % n], f[(i + 1) % n]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    root = empty("cross", loc, rot, s)
    o = bpy.data.objects.new("xbar", me); bpy.context.collection.objects.link(o); o.parent = root
    for p in o.data.polygons: p.use_smooth = True
    bv = o.modifiers.new("bv", "BEVEL"); bv.width = 0.032; bv.segments = 5; bv.limit_method = "ANGLE"; bv.angle_limit = math.radians(40)
    o.data.materials.append(M["red"])
    return root


def oil_bottle(M, loc=(0, 0, 0), s=1.0):
    root = empty("oil", loc, (0, 0, 0), s)
    gl = mat("oilglass", "#2f6b34", 0.02, trans=0.85, ior=1.5)
    lathe("bottle", [(0.0, 0.0), (0.27, 0.0), (0.3, 0.03), (0.31, 0.2), (0.3, 0.9), (0.24, 1.05), (0.12, 1.2), (0.1, 1.55), (0.115, 1.6), (0.0, 1.6)], gl, parent=root)
    lathe("oil", [(0.0, 0.06), (0.275, 0.07), (0.285, 0.2), (0.28, 0.85), (0.22, 1.0), (0.0, 1.0)], mat("oil", "#c9a21a", 0.02, trans=0.9, ior=1.47), parent=root)
    lathe("cap", [(0.105, 1.6), (0.105, 1.74), (0.09, 1.78), (0.0, 1.78)], M["chrome"], parent=root)
    prism("label", 0.36, 0.5, 0.004, 0.02, [M["paper"], M["paper"]], loc=(0, -0.311, 0.5), parent=root)
    prism("band", 0.36, 0.1, 0.005, 0.01, [M["red"], M["red"]], loc=(0, -0.3125, 0.62), parent=root)
    prism("dot", 0.1, 0.1, 0.005, 0.05, [M["ink"], M["ink"]], loc=(0, -0.3125, 0.43), parent=root)
    return root

def outline_solid(name, pts, depth, m, parent, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.004):
    """A flat shape cut from ONE outline (x, z points) and extruded along y."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    f = [bm.verts.new((x, -depth / 2, z)) for x, z in pts]; b = [bm.verts.new((x, depth / 2, z)) for x, z in pts]
    bm.faces.new(f); bm.faces.new(list(reversed(b)))
    n = len(pts)
    for i in range(n): bm.faces.new((f[i], b[i], b[(i + 1) % n], f[(i + 1) % n]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o); o.parent = parent; o.location = loc; o.rotation_euler = [math.radians(a) for a in rot]
    for p in o.data.polygons: p.use_smooth = True
    bv = o.modifiers.new("bv", "BEVEL"); bv.width = bevel; bv.segments = 3; bv.limit_method = "ANGLE"; bv.angle_limit = math.radians(40)
    o.data.materials.append(m); return o

def cutlery(M, loc=(0, 0, 0), rot=(0, 0, 0), s=1.0):
    """A fork and a knife lying flat side by side along x (length about 1.7), polished steel."""
    root = empty("cutlery", loc, rot, s)
    steel = M["chrome"]
    fork = empty("fork", (0, 0.32, 0), (0, 0, 0)); fork.parent = root
    base = [(-0.95, -0.05), (-0.25, -0.032), (-0.04, -0.07), (0.04, -0.16), (0.12, -0.185), (0.3, -0.185), (0.3, 0.185), (0.12, 0.185), (0.04, 0.16), (-0.04, 0.07), (-0.25, 0.032), (-0.95, 0.05)]
    outline_solid("forkbase", base, 0.024, steel, fork, (0, 0, 0.012), (90, 0, 0), 0.006)
    for zc in (-0.145, -0.048, 0.048, 0.145):
        outline_solid("tine", [(0.29, zc - 0.034), (0.7, zc - 0.024), (0.75, zc), (0.7, zc + 0.024), (0.29, zc + 0.034)], 0.022, steel, fork, (0, 0, 0.012), (90, 0, 0), 0.005)
    knife = empty("knife", (0, -0.32, 0), (0, 0, 0)); knife.parent = root
    outline_solid("kh", [(-0.95, -0.07), (-0.2, -0.075), (-0.2, 0.075), (-0.95, 0.07)], 0.034, steel, knife, (0, 0, 0.017), (90, 0, 0), 0.012)
    outline_solid("blade", [(-0.2, -0.045), (0.55, -0.075), (0.78, -0.04), (0.82, 0.0), (0.74, 0.05), (-0.2, 0.075)], 0.016, steel, knife, (0, 0, 0.008), (90, 0, 0), 0.004)
    return root

def napkin(M, loc=(0, 0, 0), rot=(0, 0, 0), s=1.0, color="#c23a2e"):
    """A folded cloth napkin: three layers, a real weave (image) as colour, bump and a soft sheen at the folds."""
    root = empty("napkin", loc, rot, s)
    for i, (w, h, z, r) in enumerate(((1.5, 1.0, 0.0, 0), (1.4, 0.94, 0.045, 7), (1.28, 0.86, 0.09, -5))):
        cm = real(mat("cloth%d" % i, color, 0.92), overlay=("cloth.png", 3.0, 1.0), hmap=("cloth-h.png", 3.0, 1.1), color_var=0.1, color_scale=4.0, rough_var=0.05)
        prism("n%d" % i, w, h, 0.04, 0.035, [cm, cm], loc=(0, 0, 0.02 + z), rot=(90, 0, r), parent=root, bevel=0.012)
    return root

def pepper_mill(M, loc=(0, 0, 0), s=1.0):
    """A wooden pepper mill: turned body with the grain of the wood, a steel crank and base ring."""
    root = empty("mill", loc, (0, 0, 0), s)
    wm = real(mat("millwood", "#a86f3d", 0.4, coat=0.35, coat_rough=0.15), overlay=("wood.png", 2.4, 1.0), hmap=("wood-h.png", 2.4, 0.6), color_var=0.12, color_scale=3.0)
    lathe("body", [(0.0, 0.0), (0.2, 0.0), (0.235, 0.05), (0.2, 0.26), (0.15, 0.55), (0.13, 0.9), (0.17, 1.02), (0.0, 1.02)], wm, parent=root)
    lathe("ring", [(0.24, 0.045), (0.24, 0.09)], M["chrome"], solid=0.012, parent=root)
    lathe("cap", [(0.0, 1.02), (0.175, 1.02), (0.185, 1.08), (0.16, 1.12), (0.0, 1.12)], M["chrome"], parent=root)
    cyl("stem", 0.02, 0.12, M["chrome"], (0, 0, 1.18), parent=root)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=20, radius=0.06, location=(0, 0, 1.26)); kb = bpy.context.object; kb.data.materials.append(M["chrome"]); kb.parent = root
    for p in kb.data.polygons: p.use_smooth = True
    return root

def plate_set(M, loc=(0, 0, 0), s=1.0):
    """A purple plate with a fork and a knife beside it."""
    root = empty("plateset", loc, (0, 0, 0), s)
    pm = real(mat("purple", "#7c4ee0", 0.18, coat=0.7, coat_rough=0.05), bump=(55, 0.18), rough_var=0.12, color_var=0.2, color_scale=2.5, dots=(110, 0.05, (0.3, 0.22, 0.5)))
    lathe("pl", [(0, 0.0), (0.7, 0.0), (0.86, 0.04), (1.0, 0.13), (1.03, 0.15), (1.0, 0.16), (0.9, 0.12), (0.72, 0.065), (0, 0.065)], pm, parent=root)
    cutlery(M, (1.55, 0.0, 0.0), (0, 0, 90), 0.8).parent = root
    return root

def spoon(M, loc=(0, 0, 0), rot=(0, 0, 0)):
    root = empty("spoon", loc, rot)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=0.11, location=(0, 0, 0)); b = bpy.context.object; b.scale = (1.15, 0.8, 0.3)
    for p in b.data.polygons: p.use_smooth = True
    b.data.materials.append(M["chrome"]); b.parent = root
    prism("handle", 0.5, 0.04, 0.012, 0.018, [M["chrome"], M["chrome"]], loc=(0.35, 0, -0.01), rot=(90, 0, 0), bevel=0.003, parent=root)
    return root


def metrics(label=""):
    """Numbers instead of eyes: size, lowest point and loose or open meshes of every object. Prints WARN lines for what is probably wrong."""
    import bmesh as _bm
    deps = bpy.context.evaluated_depsgraph_get(); out = []
    roots = [o for o in bpy.data.objects if o.parent is None and o.type == "EMPTY"]
    for r in roots:
        pts = []
        for o in r.children_recursive:
            if o.type in ("MESH", "CURVE"):
                e = o.evaluated_get(deps); m = e.matrix_world
                try: me = e.to_mesh()
                except Exception: continue
                pts += [m @ v.co for v in me.vertices]; e.to_mesh_clear()
        if not pts: out.append(f"WARN {r.name}: no geometry"); continue
        lo = [min(p[i] for p in pts) for i in range(3)]; hi = [max(p[i] for p in pts) for i in range(3)]
        size = [round(hi[i] - lo[i], 2) for i in range(3)]
        line = f"{label}{r.name}: size {size} lowest z {lo[2]:.3f}"
        if lo[2] > 0.03 and r.name not in ("cross",): line += "  WARN floats above the table"
        if lo[2] < -0.02: line += "  WARN sinks into the table"
        out.append(line)
    for o in bpy.data.objects:
        if o.type == "MESH" and len(o.data.polygons) and not o.name.startswith(("floor", "key", "fill", "top", "strip", "flag")):
            bm = _bm.new(); bm.from_mesh(o.data)
            zero = sum(1 for f in bm.faces if f.calc_area() < 1e-9)
            if zero: out.append(f"WARN {o.name}: {zero} faces of zero area (may flicker)")
            bm.free()
    print("METRICS\n" + "\n".join(out))

def detail_views(builder, outprefix, center_z, dist, targets):
    """Close-ups of the small details (corners, lenses, rims): each target is (name, x, y, z, az, el, distance)."""
    clear(); M = shared_mats(); studio(); builder(M); render_setup(64, 520, 520); paths = []
    for name, x, y, z, az, el, d in targets:
        for o in [o for o in bpy.data.objects if o.type == "CAMERA"]: bpy.data.objects.remove(o)
        a = math.radians(az - 90); e = math.radians(el)
        loc = Vector((x, y, z)) + Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e))) * d
        camera(loc, (x, y, z), 85)
        p = os.path.join(OUT, f"_d_{name}.png"); bpy.context.scene.render.filepath = p; bpy.ops.render.render(write_still=True); paths.append(p)
    print("VIEWS", ",".join(paths))
    if outprefix and len(paths) == 4: grid(paths, outprefix)


def grid(paths, out):
    """Four pictures in one 2 x 2 grid with ffmpeg (there is no PIL in Blender's Python)."""
    import subprocess
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", paths[0], "-i", paths[1], "-i", paths[2], "-i", paths[3], "-filter_complex", "[0:v][1:v]hstack[t];[2:v][3:v]hstack[b];[t][b]vstack", "-frames:v", "1", out], check=True)
    print("GRID", out)


qr_stand = tent  # the folded table card with a QR code on its front
