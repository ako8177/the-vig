# The people of The Vig: one kit of rigid parts, built by script in Blender (STYLE.md, "Pipeline";
# THREEJS-NOTES rule 11) and exported to public/models/people.glb. Run it inside Blender:
#     exec(open(r'<repo>/art/people/build_people.py').read())
# (the Blender MCP does exactly that). Nothing in the .glb is ever edited by hand.
#
# Every part is modelled in three.js's frame (y up, the figure facing -z) with its origin at the
# joint it hangs from, so src/render3d/npcs.ts places it with no offset: a torso at the hip joint, a
# forearm at the elbow, a shoe at the ankle. The sizes follow npcs.ts's measures (LEG, ARM, SHOULDER):
# a 1.72 m figure. Each part is one tint (the crowd colors it per person, a BatchedMesh instance
# color); the vertex color is a mask multiplied into the tint: 1 takes it, darker darkens it (eyes,
# mouth, a tie). Low-poly, flat-shaded in the game, no skeleton, no textures.
#
# The Collector (coll_*) faces +z: he sits across the table looking at you (src/render3d/duel.ts).
import bpy, bmesh, math, os

ROOT = globals().get('VIG_ROOT', r'C:\Users\herna\Documents\the-vig')
OUT = os.path.join(ROOT, 'public', 'models', 'people.glb')

# masks (linear): the tint, a shade of it, and near-black
FULL, SHADE, DEEP, DARK = 1.0, 0.62, 0.3, 0.04


class Part:
    """A mesh under construction, in three.js coordinates, with a mask value per face."""

    def __init__(self, name):
        self.name, self.v, self.f = name, [], []
        # faces whose winding is already right (lone panels: recalculating could flip them)
        self.fixed = set()

    def vert(self, x, y, z):
        self.v.append((x, y, z))
        return len(self.v) - 1

    def face(self, idx, mask=FULL):
        self.f.append((list(idx), mask))

    # ---- shapes
    def loft(self, rings, sides=8, mask=FULL, axis='y', at=(0, 0, 0), spin=None, caps=(True, True), masks=None):
        """Rings of `sides` points along an axis: (h, ra, rb[, ca, cb[, tilt]]). For axis y a ring
        lies in x (ra) and z (rb); for axis z in x (ra) and y (rb). `tilt` lifts the ring's front
        (-z) and drops its back, for a hairline. `masks` (optional) gives one mask per band."""
        ox, oy, oz = at
        spin = math.pi / sides if spin is None else spin
        idx = []
        for r in rings:
            h, ra, rb = r[0], r[1], r[2]
            ca = r[3] if len(r) > 3 else 0
            cb = r[4] if len(r) > 4 else 0
            tilt = r[5] if len(r) > 5 else 0
            row = []
            for k in range(sides):
                a = spin + k * 2 * math.pi / sides
                u, w = ca + ra * math.sin(a), cb - rb * math.cos(a)
                if axis == 'y':
                    row.append(self.vert(ox + u, oy + h - tilt * w, oz + w))
                else:
                    row.append(self.vert(ox + u, oy + w, oz + h))
            idx.append(row)
        for j in range(len(idx) - 1):
            m = masks[j] if masks else mask
            for k in range(sides):
                k2 = (k + 1) % sides
                self.face([idx[j][k], idx[j][k2], idx[j + 1][k2], idx[j + 1][k]], m)
        if caps[0]:
            self.face(list(reversed(idx[0])), masks[0] if masks else mask)
        if caps[1]:
            self.face(idx[-1], masks[-1] if masks else mask)

    def box(self, cx, cy, cz, sx, sy, sz, mask=FULL, taper=1.0):
        """An axis box; `taper` scales its bottom face in x and z."""
        hx, hy, hz = sx / 2, sy / 2, sz / 2
        p = []
        for y, t in ((cy - hy, taper), (cy + hy, 1.0)):
            for x, z in ((-hx, -hz), (hx, -hz), (hx, hz), (-hx, hz)):
                p.append(self.vert(cx + x * t, y, cz + z * t))
        b, t = p[:4], p[4:]
        self.face(list(reversed(b)), mask)
        self.face(t, mask)
        for k in range(4):
            k2 = (k + 1) % 4
            self.face([b[k], b[k2], t[k2], t[k]], mask)

    def panel(self, cx, cy, z, sx, sy, mask=FULL, back=False):
        """A flat quad facing -z (or +z): eyes, a mouth, brows. One face, two triangles."""
        hx, hy = sx / 2, sy / 2
        q = [self.vert(cx - hx, cy - hy, z), self.vert(cx + hx, cy - hy, z), self.vert(cx + hx, cy + hy, z), self.vert(cx - hx, cy + hy, z)]
        self.fixed.add(len(self.f))
        self.face(q if back else list(reversed(q)), mask)

    def prism_x(self, profile, x0, x1, mask=FULL, masks=None):
        """A side profile [(z, y)...] (a convex loop) pushed out from x0 to x1."""
        a = [self.vert(x0, y, z) for z, y in profile]
        b = [self.vert(x1, y, z) for z, y in profile]
        n = len(profile)
        self.face(list(reversed(a)), mask)
        self.face(b, mask)
        for k in range(n):
            k2 = (k + 1) % n
            self.face([a[k], a[k2], b[k2], b[k]], masks[k] if masks else mask)

    # ---- into Blender
    def build(self):
        me = bpy.data.meshes.new(self.name)
        # three.js (x, y, z) is Blender (x, -z, y): the glTF exporter's +Y-up turns it back
        me.from_pydata([(x, -z, y) for x, y, z in self.v], [], [f for f, _ in self.f])
        me.update()
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.collection.objects.link(ob)
        bm = bmesh.new()
        bm.from_mesh(me)
        masks = {i: m for i, (_, m) in enumerate(self.f)}
        bm.faces.index_update()
        lay = bm.faces.layers.int.new('mask_i')
        for face in bm.faces:
            face[lay] = face.index
        bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if f.index not in self.fixed])
        bm.to_mesh(me)
        bm.free()
        col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        mi = me.attributes['mask_i'].data
        for poly in me.polygons:
            m = masks[mi[poly.index].value]
            for li in poly.loop_indices:
                col.data[li].color = (m, m, m, 1.0)
        me.attributes.remove(me.attributes['mask_i'])
        me.color_attributes.active_color = col
        for poly in me.polygons:
            poly.use_smooth = False
        return ob


def tris(p):
    return sum(len(f) - 2 for f, _ in p.f)


parts = []


def part(name):
    p = Part(name)
    parts.append(p)
    return p


# ------------------------------------------------------------------ the crowd's kit
# hips and torso hang from the torso joint (the hip's height, leaning); the shoulders are at
# (±0.24, 0.53) and the neck at y 0.58 (npcs.ts SHOULDER)

p = part('pelvis')
p.loft([(-0.05, 0.13, 0.085), (-0.02, 0.165, 0.1), (0.15, 0.165, 0.1)], caps=(True, False),
       masks=[FULL, FULL])

p = part('skirt')
p.loft([(0.15, 0.15, 0.096), (0.06, 0.19, 0.125), (-0.08, 0.225, 0.16), (-0.14, 0.235, 0.17)])

# a suit coat: square shoulders, a waist, the hem flaring over the hips
p = part('torso_coat')
p.loft([(0.06, 0.178, 0.113), (0.2, 0.16, 0.1), (0.37, 0.19, 0.117), (0.5, 0.235, 0.11),
        (0.575, 0.2, 0.085), (0.6, 0.075, 0.062)], caps=(False, True))

# a dress's bodice: narrower shoulders, a smaller waist
p = part('torso_dress')
p.loft([(0.09, 0.152, 0.1), (0.21, 0.13, 0.088), (0.35, 0.165, 0.112), (0.49, 0.215, 0.1),
        (0.565, 0.18, 0.078), (0.59, 0.062, 0.052)], caps=(False, True))

# what shows at the front of the torso: a shirt and tie, a shirt and bow tie (staff), a neckline
p = part('shirt_tie')
p.loft([(0.36, 0.004, 0.004, 0, -0.11), (0.575, 0.068, 0.006, 0, -0.106)], sides=4, spin=math.pi / 4)
p.box(0, 0.45, -0.117, 0.03, 0.2, 0.008, DEEP, taper=1.3)
p.box(0, 0.545, -0.117, 0.035, 0.03, 0.01, DEEP)

p = part('shirt_bow')
p.loft([(0.38, 0.004, 0.004, 0, -0.11), (0.575, 0.072, 0.006, 0, -0.106)], sides=4, spin=math.pi / 4)
for s in (-1, 1):
    p.box(s * 0.024, 0.548, -0.118, 0.04, 0.035, 0.012, DARK, taper=0.6)
p.box(0, 0.548, -0.12, 0.016, 0.018, 0.012, DARK)

p = part('neckline')
p.loft([(0.47, 0.03, 0.004, 0, -0.112), (0.585, 0.075, 0.006, 0, -0.095)], sides=4, spin=math.pi / 4)

# the head hangs from the neck joint (0.58 above the torso joint): a neck, the skull, a nose, ears,
# eyes and a mouth
p = part('head')
p.loft([(-0.06, 0.048, 0.05), (0.04, 0.048, 0.05)], sides=6, caps=(False, False))
p.loft([(0.015, 0.055, 0.06, 0, -0.03), (0.05, 0.09, 0.092, 0, -0.012), (0.1, 0.11, 0.11),
        (0.16, 0.118, 0.116), (0.215, 0.11, 0.11), (0.258, 0.07, 0.07)], sides=8)
# the nose: a wedge
p.prism_x([(-0.104, 0.155), (-0.104, 0.105), (-0.13, 0.108)], -0.014, 0.014)
for s in (-1, 1):
    p.panel(s * 0.045, 0.152, -0.113, 0.034, 0.026, DARK)
    p.box(s * 0.116, 0.14, 0.0, 0.02, 0.05, 0.035, SHADE)
p.panel(0, 0.083, -0.105, 0.048, 0.011, DEEP)


def shell(p, back=0.09):
    """The hair's cap: lower at the back than at the front (a hairline over the forehead)."""
    p.loft([(0.145, 0.128, 0.127, 0, 0.004, 0.55), (0.205, 0.124, 0.123, 0, 0.004, 0.25), (0.255, 0.094, 0.094),
            (0.285, 0.035, 0.035)], sides=8, caps=(False, True))
    # brows
    for s in (-1, 1):
        p.panel(s * 0.045, 0.178, -0.115, 0.046, 0.013)


p = part('hair_short')
shell(p)

p = part('hair_long')
shell(p)
p.prism_x([(0.03, 0.2), (0.135, 0.18), (0.13, -0.05), (0.06, -0.07), (0.04, 0.0)], -0.115, 0.115)
for s in (-1, 1):
    p.box(s * 0.112, 0.11, 0.02, 0.025, 0.17, 0.12)

p = part('hair_bun')
shell(p)
p.loft([(0.19, 0.03, 0.03), (0.215, 0.055, 0.05), (0.26, 0.055, 0.05), (0.285, 0.025, 0.025)], sides=8, at=(0, 0, 0.12))

p = part('hair_quiff')
shell(p)
p.prism_x([(-0.13, 0.27), (-0.11, 0.3), (0.0, 0.305), (0.05, 0.28), (-0.06, 0.24)], -0.07, 0.07)

# a fedora: a brim, a pinched crown, a band (the tint is the hat's; the hair under it is short)
p = part('hat')
p.loft([(0.205, 0.18, 0.195, 0, 0.01), (0.222, 0.18, 0.195, 0, 0.01)], sides=8)
p.loft([(0.215, 0.124, 0.125), (0.255, 0.122, 0.123), (0.31, 0.11, 0.115), (0.335, 0.06, 0.075)], sides=8,
       masks=[DEEP, FULL, FULL], caps=(False, True))
for s in (-1, 1):
    p.panel(s * 0.045, 0.178, -0.115, 0.046, 0.013, DEEP)

# arms: the upper arm from the shoulder, the forearm from the elbow (0.30 down), the hand from the
# wrist (0.27 down); hanging, the palm faces in and the thumb forward
p = part('arm_upper')
p.loft([(0.04, 0.035, 0.035), (0.01, 0.06, 0.062), (-0.2, 0.05, 0.053), (-0.31, 0.046, 0.048)], sides=6, caps=(True, False))

p = part('arm_fore')
p.loft([(0.01, 0.046, 0.048), (-0.235, 0.036, 0.038), (-0.25, 0.042, 0.043), (-0.275, 0.042, 0.043)],
       sides=6, masks=[FULL, SHADE, SHADE], caps=(False, True))

p = part('hand')
p.prism_x([(-0.035, 0.0), (0.035, 0.0), (0.03, -0.075), (0.012, -0.1), (-0.03, -0.085)], -0.019, 0.019)
p.prism_x([(-0.03, -0.012), (-0.06, -0.035), (-0.065, -0.055), (-0.035, -0.045)], -0.013, 0.013)

# legs: the thigh from the hip, the shin from the knee (0.44 down), the shoe from the ankle (0.40)
p = part('thigh')
p.loft([(0.05, 0.06, 0.07), (0.02, 0.085, 0.09), (-0.44, 0.062, 0.067)], sides=6, caps=(True, False))

p = part('shin')
p.loft([(0.02, 0.06, 0.064), (-0.16, 0.058, 0.066, 0, 0.005), (-0.39, 0.046, 0.05)], sides=6, caps=(False, False))

p = part('shoe')
p.prism_x([(0.06, -0.072), (-0.15, -0.072), (-0.175, -0.055), (-0.165, -0.035), (-0.06, -0.005), (0.06, 0.0)],
          -0.055, 0.055, masks=[DEEP, DEEP, FULL, FULL, FULL, FULL])

# a card player's chair: the seat (top at 0.55) and its back, then the post and foot
p = part('seat')
p.prism_x([(-0.2, 0.495), (0.22, 0.495), (0.22, 0.535), (-0.18, 0.55), (-0.21, 0.525)], -0.22, 0.22)
p.box(0, 0.78, 0.22, 0.4, 0.42, 0.045, FULL, taper=0.85)

p = part('post')
p.loft([(0.0, 0.18, 0.18), (0.025, 0.17, 0.17), (0.05, 0.035, 0.035), (0.5, 0.03, 0.03)], sides=6, caps=(False, False))
p.box(0, 0.6, 0.21, 0.04, 0.2, 0.025)

# ------------------------------------------------------------------ the Collector (faces +z)
# hips at his seat; neck at y 0.74, the head 0.1 above it; shoulders at (±0.36, 0.64), each arm
# pointing down +z from its shoulder (duel.ts aims them with lookAt)
p = part('coll_torso')
p.loft([(0.0, 0.23, 0.13), (0.22, 0.215, 0.12), (0.46, 0.29, 0.13), (0.62, 0.32, 0.125),
        (0.7, 0.24, 0.1), (0.76, 0.08, 0.065)], sides=8)
# the collar stands up round his throat, open at the front
p.loft([(0.66, 0.11, 0.1, 0, -0.012), (0.9, 0.15, 0.13, 0, -0.03)], sides=8)

p = part('coll_vest')
p.prism_x([(0.122, 0.62), (0.135, 0.1), (0.112, 0.1)], -0.07, 0.07)

p = part('coll_head')
p.loft([(-0.02, 0.05, 0.05), (0.1, 0.05, 0.05)], sides=6)
p.loft([(0.0, 0.06, 0.07, 0, 0.035), (0.06, 0.1, 0.11, 0, 0.012), (0.14, 0.11, 0.122), (0.21, 0.145, 0.138),
        (0.3, 0.14, 0.13), (0.345, 0.1, 0.1), (0.36, 0.03, 0.03)], sides=10)
# a long nose; the eyes are the game's glowing bars (duel.ts), set in dark sockets
p.prism_x([(0.125, 0.22), (0.13, 0.13), (0.17, 0.12)], -0.016, 0.016)
for s in (-1, 1):
    p.box(s * 0.07, 0.2, 0.128, 0.09, 0.06, 0.02, DARK)

p = part('coll_hat')
p.loft([(0.345, 0.27, 0.26), (0.37, 0.27, 0.26)], sides=12)
p.loft([(0.36, 0.152, 0.148), (0.6, 0.158, 0.153), (0.64, 0.165, 0.16)], sides=12)

p = part('coll_band')
p.loft([(0.375, 0.156, 0.152), (0.43, 0.157, 0.153)], sides=12)

p = part('coll_arm')
p.loft([(-0.06, 0.06, 0.06), (0.0, 0.085, 0.08), (0.4, 0.07, 0.068), (0.88, 0.06, 0.058), (0.95, 0.072, 0.07),
        (0.985, 0.07, 0.068)], sides=6, axis='z')

p = part('coll_hand')
p.box(0, 0.0, 1.03, 0.1, 0.04, 0.12)
# long fingers, the middle two longest, curled down at the tips
for k, (x, ln) in enumerate(((-0.037, 0.1), (-0.012, 0.13), (0.013, 0.125), (0.038, 0.09))):
    p.box(x, -0.006, 1.09 + ln / 2, 0.018, 0.02, ln)
    p.box(x, -0.03, 1.09 + ln + 0.008, 0.017, 0.045, 0.016)
p.box(-0.06, -0.01, 1.02, 0.02, 0.022, 0.08)

# ------------------------------------------------------------------ build and export
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
for me in list(bpy.data.meshes):
    bpy.data.meshes.remove(me)
objs = [p.build() for p in parts]
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
for ob in objs:
    ob.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
    export_materials='NONE', export_texcoords=False, export_normals=True,
    export_vertex_color='ACTIVE', export_active_vertex_color_when_no_material=True,
)
for p in parts:
    print(f'{p.name:12s} {tris(p):4d} tris')
print('total', sum(tris(p) for p in parts), '->', OUT, os.path.getsize(OUT), 'bytes')
