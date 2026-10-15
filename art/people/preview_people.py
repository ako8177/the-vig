# A look at the kit in Blender (not exported): run build_people.py first, then this. It stands a few
# people up the way src/render3d/npcs.ts joints them, and seats the Collector, so the parts can be
# judged together. Colors are TanoPal roles (STYLE.md), multiplied by each part's mask.
import bpy, math

HIP = 0.90  # npcs.ts STAND_HIP


def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1]


def mat(hexc):
    m = bpy.data.materials.get('pv_' + hexc) or bpy.data.materials.new('pv_' + hexc)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    attr = next((n for n in nt.nodes if n.type == 'VERTEX_COLOR'), None) or nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    mix = next((n for n in nt.nodes if n.type == 'MIX'), None)
    if not mix:
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs[0].default_value = 1
    mix.inputs[6].default_value = srgb(hexc)
    nt.links.new(attr.outputs[0], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 1
    return m


def put(name, hexc, x, y, z, rx=0.0, coll=None):
    src = bpy.data.objects[name]
    ob = src.copy()
    ob.name = 'pv_' + name
    ob.data = src.data.copy()
    ob.data.materials.clear()
    ob.data.materials.append(mat(hexc))
    ob.location = (x, -z, y)
    ob.rotation_euler = (rx, 0, 0)
    (coll or bpy.context.collection).objects.link(ob)
    return ob


def person(ox, skin, hair, coat, pants, shoe, torso='torso_coat', shirt='shirt_tie', shirtc='c8c8b5', hairp='hair_short', pelvis='pelvis', sleeve=None):
    sleeve = sleeve or coat
    put(pelvis, pants, ox, HIP, 0)
    put(torso, coat, ox, HIP, 0)
    put(shirt, shirtc, ox, HIP, 0)
    put('head', skin, ox, HIP + 0.58, 0)
    put(hairp, hair, ox, HIP + 0.58, 0)
    for s in (-1, 1):
        put('arm_upper', sleeve, ox + s * 0.24, HIP + 0.53, 0)
        put('arm_fore', sleeve, ox + s * 0.24, HIP + 0.23, 0)
        put('hand', skin, ox + s * 0.24, HIP - 0.04, 0)
        put('thigh', pants, ox + s * 0.09, HIP, 0)
        put('shin', pants, ox + s * 0.09, HIP - 0.44, 0)
        put('shoe', shoe, ox + s * 0.09, HIP - 0.84, 0)


for ob in list(bpy.data.objects):
    if ob.name.startswith('pv_'):
        bpy.data.objects.remove(ob, do_unlink=True)
for ob in bpy.data.objects:
    ob.hide_set(True)
    ob.hide_render = True

person(-1.2, 'f7c3a0', '1f1d1e', 'd7198c', '1f1d1e', '1f1d1e')
person(-0.4, 'c86900', '511806', '05826c', '303232', '511806', torso='torso_dress', shirt='neckline', shirtc='c86900', hairp='hair_long', pelvis='skirt')
person(0.4, 'f7c3a0', 'c8c8b5', '1f1d1e', '1f1d1e', '1f1d1e', shirt='shirt_bow', shirtc='c8c8b5', hairp='hair_quiff', sleeve='c8c8b5')
person(1.2, '642808', '1f1d1e', '6e8ef0', '410966', '1f1d1e', hairp='hat')
person(2.0, 'f7c3a0', 'c86900', '3c1e8e', '645c5a', '511806', torso='torso_dress', shirt='neckline', shirtc='f7c3a0', hairp='hair_bun')

# the Collector, seated: hips at 0.82, his arms reaching forward
CX, CZ = 3.4, 0.0
put('coll_torso', '303232', CX, 0.82, CZ)
put('coll_vest', '801cc0', CX, 0.82, CZ)
for n, c in (('coll_head', '1f1d1e'), ('coll_hat', '1f1d1e'), ('coll_band', '801cc0')):
    put(n, c, CX, 0.82 + 0.84, CZ)
for s in (-1, 1):
    a = put('coll_arm', '303232', CX + s * 0.36, 0.82 + 0.64, CZ, rx=-0.5)
    h = put('coll_hand', '8c9687', CX + s * 0.36, 0.82 + 0.64, CZ, rx=-0.5)
print('ok')
