# A look at the tables in Blender (not exported): run build_tables.py first, then this. It colors each
# part by its material's TanoPal role (STYLE.md), lines the tables up a meter and a half apart with a
# stool at each seat, and adds the neon rims that room.ts draws in code, so the set can be judged.
import bpy, math

ROLE = {'wood': '642808', 'felt': '303232', 'brass': 'f8d280', 'brassLo': 'c86900', 'woodLo': '511806',
        'ink': '1f1d1e', 'night': '303232', 'neon_low': '00e60f', 'neon_mid': 'f0ff00', 'neon_high': 'f5320a'}
TIER = {'bandit': 'low', 'twentyone': 'low', 'hilo': 'mid', 'wheel': 'mid', 'redline': 'high', 'deadman': 'high'}
SIZE = {'bandit': (1.4, 0.9), 'twentyone': (2.2, 1.2), 'hilo': (1.8, 1.1), 'wheel': (2.0, 1.2), 'redline': (2.2, 1.2), 'deadman': (2.0, 1.2)}


def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1]


def mat(role):
    m = bpy.data.materials.get('pv_' + role) or bpy.data.materials.new('pv_' + role)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = srgb(ROLE[role])
    bsdf.inputs['Roughness'].default_value = 1
    if role.startswith('neon'):
        bsdf.inputs['Emission Color'].default_value = srgb(ROLE[role])
        bsdf.inputs['Emission Strength'].default_value = 3
    return m


def put(src, role, x, y=0.0, z=0.0, sy=1.0):
    ob = src.copy()
    ob.name = 'pv_' + src.name
    ob.data = src.data.copy()
    ob.data.materials.clear()
    ob.data.materials.append(mat(role))
    ob.location = (x, y, z)
    ob.scale.z = sy
    bpy.context.collection.objects.link(ob)
    return ob


for ob in [o for o in bpy.data.objects if o.name.startswith('pv_')]:
    bpy.data.objects.remove(ob, do_unlink=True)
src = [o for o in bpy.data.objects if not o.name.startswith('pv_')]
for o in src:
    o.hide_set(True)
x = 0.0
for name in ('bandit', 'twentyone', 'hilo', 'wheel', 'redline', 'deadman'):
    w, d = SIZE[name]
    x += w / 2
    for o in src:
        if o.name.startswith(name + '_'):
            put(o, o.name[len(name) + 1:], x)
    # Blender y is three.js -z: the seat side is -y here
    seat = (0.0 if name == 'bandit' else 0.0) + d / 2 + 0.5
    put(bpy.data.objects['stool_seat'], 'brass' if name != 'bandit' else 'night', x, -seat, 0.65)
    put(bpy.data.objects['stool_post'], 'brass', x, -seat, 0.0, 0.59)
    # the neon (room.ts): front and back edges, or the cabinet's crown and kick
    neon = mat('neon_' + TIER[name])
    rims = [(-(d / 2 + 0.05), 0.86), (d / 2, 0.86)] if name != 'bandit' else [(-d / 2, 1.92), (-d / 2, 0.1)]
    for yy, zz in rims:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, yy, zz))
        c = bpy.context.object
        c.name = 'pv_neon'
        c.scale = (w, 0.035, 0.035)
        c.data.materials.append(neon)
    x += w / 2 + 1.5
