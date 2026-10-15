# The shared kit for The Vig's scripted models (STYLE.md, "Pipeline"; THREEJS-NOTES rule 11): a Part
# is a mesh under construction in three.js's frame (y up, -z away from the player), built face by face,
# every face wound to point where it is told (no normal recalculation: open shells stay right), with
# an optional mask per face (a vertex color the game multiplies into the tint) and optional UVs
# projected from the faces in meters (so a tiled texture keeps the room's density on every surface).
# build_tables.py and build_props.py exec this file first; the people keep their own copy
# (art/people/build_people.py), which predates it.
import bpy, math, os

FULL, SHADE, DEEP, DARK = 1.0, 0.62, 0.3, 0.04


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _newell(pts):
    n = [0.0, 0.0, 0.0]
    for i, a in enumerate(pts):
        b = pts[(i + 1) % len(pts)]
        n[0] += (a[1] - b[1]) * (a[2] + b[2])
        n[1] += (a[2] - b[2]) * (a[0] + b[0])
        n[2] += (a[0] - b[0]) * (a[1] + b[1])
    return n


def rrect(w, d, r, seg=1, cx=0.0, cz=0.0):
    """A rectangle's outline with rounded corners (seg 1 = a chamfer), (x, z) points going round."""
    pts = []
    r = max(r, 1e-4)
    for qx, qz, a0 in ((1, 1, 90), (1, -1, 0), (-1, -1, -90), (-1, 1, -180)):
        ox, oz = cx + qx * (w / 2 - r), cz + qz * (d / 2 - r)
        for k in range(seg + 1):
            a = math.radians(a0 - 90 * k / seg)
            pts.append((ox + r * math.cos(a), oz + r * math.sin(a)))
    return pts


def circle(r, n, cx=0.0, cz=0.0, spin=None):
    spin = math.pi / n if spin is None else spin
    return [(cx + r * math.sin(spin + 2 * math.pi * k / n), cz + r * math.cos(spin + 2 * math.pi * k / n)) for k in range(n)]


class Part:
    def __init__(self, name, uv=None):
        """`uv`: texture tiles per meter (None: no UVs)."""
        self.name, self.uv, self.v, self.f = name, uv, [], []

    def vert(self, x, y, z):
        self.v.append((x, y, z))
        return len(self.v) - 1

    def face(self, idx, out, mask=FULL):
        """A face whose normal points along `out` (a direction), away from a point given as
        ('from', (x, y, z)), or toward one given as ('toward', (x, y, z))."""
        pts = [self.v[i] for i in idx]
        n = _newell(pts)
        if out[0] in ('from', 'toward'):
            c = tuple(sum(p[k] for p in pts) / len(pts) for k in range(3))
            out = _sub(c, out[1]) if out[0] == 'from' else _sub(out[1], c)
        if _dot(n, out) < 0:
            idx = list(reversed(idx))
        self.f.append((list(idx), mask))

    # ---- shapes
    def slab(self, outline, y0, y1, mask=FULL, top=True, bottom=True, sides=True, masks=None):
        """An outline (x, z) pushed up from y0 to y1: a prism."""
        lo = [self.vert(x, y0, z) for x, z in outline]
        hi = [self.vert(x, y1, z) for x, z in outline]
        n = len(outline)
        cx = sum(p[0] for p in outline) / n
        cz = sum(p[1] for p in outline) / n
        if top:
            self.face(hi, (0, 1, 0), mask)
        if bottom:
            self.face(lo, (0, -1, 0), mask)
        if sides:
            for k in range(n):
                k2 = (k + 1) % n
                self.face([lo[k], lo[k2], hi[k2], hi[k]], ('from', (cx, (y0 + y1) / 2, cz)), masks[k] if masks else mask)
        return lo, hi

    def loft(self, rings, outline, mask=FULL, caps=(True, True), masks=None):
        """Rings up the y axis: (y, sx, sz[, cx, cz]) scales a unit outline [(x, z)...] and shifts it."""
        rows = []
        for r in rings:
            y, sx, sz = r[0], r[1], r[2]
            cx = r[3] if len(r) > 3 else 0.0
            cz = r[4] if len(r) > 4 else 0.0
            rows.append(([self.vert(cx + x * sx, y, cz + z * sz) for x, z in outline], (cx, y, cz)))
        n = len(outline)
        for j in range(len(rows) - 1):
            (a, ca), (b, cb) = rows[j], rows[j + 1]
            mid = tuple((ca[k] + cb[k]) / 2 for k in range(3))
            for k in range(n):
                k2 = (k + 1) % n
                self.face([a[k], a[k2], b[k2], b[k]], ('from', mid), masks[j] if masks else mask)
        if caps[0]:
            self.face(rows[0][0], (0, -1, 0) if rings[0][0] <= rings[-1][0] else (0, 1, 0), mask)
        if caps[1]:
            self.face(rows[-1][0], (0, 1, 0) if rings[-1][0] >= rings[0][0] else (0, -1, 0), mask)

    def bridge(self, a, b, out, mask=FULL):
        """Quads between two equal-length vertex loops; `out` as for face (per quad: a point it faces
        away from, or a callable giving the direction from the quad's two first points)."""
        n = len(a)
        for k in range(n):
            k2 = (k + 1) % n
            q = [a[k], a[k2], b[k2], b[k]]
            self.face(q, out(q) if callable(out) else out, mask)

    def ring(self, outline, y):
        return [self.vert(x, y, z) for x, z in outline]

    def box(self, cx, cy, cz, sx, sy, sz, mask=FULL, bottom=True):
        hx, hz = sx / 2, sz / 2
        self.slab([(cx + hx, cz + hz), (cx + hx, cz - hz), (cx - hx, cz - hz), (cx - hx, cz + hz)], cy - sy / 2, cy + sy / 2, mask, bottom=bottom)

    def prism(self, profile, axis, a0, a1, mask=FULL, caps=True, masks=None):
        """A convex profile pushed along an axis: axis 'x' takes (z, y) points, 'z' takes (x, y)."""
        def P(u, w, t):
            return (t, w, u) if axis == 'x' else (u, w, t)
        A = [self.vert(*P(u, w, a0)) for u, w in profile]
        B = [self.vert(*P(u, w, a1)) for u, w in profile]
        n = len(profile)
        cu = sum(p[0] for p in profile) / n
        cw = sum(p[1] for p in profile) / n
        c = P(cu, cw, (a0 + a1) / 2)
        if caps:
            d = P(0, 0, -1)
            self.face(A, d if a0 < a1 else tuple(-x for x in d), mask)
            self.face(B, tuple(-x for x in d) if a0 < a1 else d, mask)
        for k in range(n):
            k2 = (k + 1) % n
            self.face([A[k], A[k2], B[k2], B[k]], ('from', c), masks[k] if masks else mask)

    def tris(self):
        return sum(len(f) - 2 for f, _ in self.f)

    # ---- into Blender
    def build(self, colors=False):
        me = bpy.data.meshes.new(self.name)
        # three.js (x, y, z) is Blender (x, -z, y) (a rotation: windings keep their sense); the glTF
        # exporter's +Y-up turns it back
        me.from_pydata([(x, -z, y) for x, y, z in self.v], [], [f for f, _ in self.f])
        me.update()
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.collection.objects.link(ob)
        for poly in me.polygons:
            poly.use_smooth = False
        if self.uv:
            uvl = me.uv_layers.new(name='UVMap')
            s = self.uv
            for poly in me.polygons:
                nx, ny, nz = (abs(c) for c in poly.normal)
                for li in poly.loop_indices:
                    x, y, z = me.vertices[me.loops[li].vertex_index].co
                    # Blender z is up: a floor-facing face maps x, y; a wall maps its run and height
                    uv = (x, y) if nz >= max(nx, ny) else (y, z) if nx >= ny else (x, z)
                    uvl.data[li].uv = (uv[0] * s, uv[1] * s)
        if colors:
            col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
            for poly in me.polygons:
                m = self.f[poly.index][1]
                for li in poly.loop_indices:
                    col.data[li].color = (m, m, m, 1.0)
            me.color_attributes.active_color = col
        return ob


def export(parts, out, colors=False):
    """Replace the scene's objects with these parts and write them to `out` (.glb)."""
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)
    objs = [p.build(colors) for p in parts]
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs:
        ob.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=out, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
        export_materials='NONE', export_texcoords=any(p.uv for p in parts), export_normals=True,
        export_vertex_color='ACTIVE' if colors else 'NONE', export_active_vertex_color_when_no_material=colors,
    )
    for p in parts:
        print(f'{p.name:18s} {p.tris():4d} tris')
    print('total', sum(p.tris() for p in parts), '->', out, os.path.getsize(out), 'bytes')
    return objs
