# The crowd's game pieces (src/render3d/tableplay.ts): a chip, a card and a die, built by script in
# Blender (STYLE.md, "Pipeline"; THREEJS-NOTES rule 11) and exported to public/models/props.glb. Run it
# inside Blender:
#     exec(open(r'<repo>/art/props/build_props.py').read())
# (the Blender MCP does exactly that). Nothing in the .glb is ever edited by hand.
#
# Each piece is centered on its origin in three.js's frame, the same size the code's boxes and
# cylinders were, and drawn instanced: one tint per piece (the instance color: a chip's color, a
# card's face or back) times a vertex mask (1 takes the tint, darker shades it: a chip's edge spots,
# a die's pips). Low-poly, flat-shaded; cheaper than the shapes they replace (a chip 22 triangles
# where the cylinder was 32), since a busy floor shows a hundred of them.
import os

ROOT = globals().get('VIG_ROOT', r'C:\Users\herna\Documents\the-vig')
exec(open(os.path.join(ROOT, 'art', 'blender_kit.py')).read())
OUT = os.path.join(ROOT, 'public', 'models', 'props.glb')

CHIP_R, CHIP_H = 0.04, 0.016  # tableplay.ts CHIP_H; a bet's stack scales this in y
CARD_W, CARD_D, CARD_T = 0.07, 0.1, 0.004
DIE = 0.045

parts = []

# a chip: eight sides whose spots alternate (the edge inserts), the top face; no bottom (it is only
# ever seen lying on the felt or sliding over it)
p = Part('chip')
parts.append(p)
p.loft([(-CHIP_H / 2, CHIP_R, CHIP_R), (CHIP_H / 2, CHIP_R, CHIP_R)], circle(1.0, 8), caps=(False, True))
for k in range(8):  # the loft's first eight faces are its sides
    p.f[k] = (p.f[k][0], FULL if k % 2 else 0.68)

# a card: a face and a back with clipped corners, the thickness between them (too thin to see sides)
p = Part('card')
parts.append(p)
outline = rrect(CARD_W, CARD_D, 0.008, 1)
p.face(p.ring(outline, CARD_T / 2), (0, 1, 0))
p.face(p.ring(outline, -CARD_T / 2), (0, -1, 0))

# a die: a cube with its pips, opposite faces adding to 7 (1 up, 6 down, 2 toward +z, 5 away, 3 at +x,
# 4 at -x); each pip a dark square standing a hair proud of its face
p = Part('die')
parts.append(p)
h = DIE / 2
p.box(0, 0, 0, DIE, DIE, DIE)
G = 0.0115  # the pip grid's step
PIPS = {1: [(0, 0)], 2: [(-1, -1), (1, 1)], 3: [(-1, -1), (0, 0), (1, 1)], 4: [(-1, -1), (1, -1), (-1, 1), (1, 1)],
        5: [(-1, -1), (1, -1), (0, 0), (-1, 1), (1, 1)], 6: [(-1, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (1, 1)]}
FACES = {1: (0, 1, 0), 6: (0, -1, 0), 2: (0, 0, 1), 5: (0, 0, -1), 3: (1, 0, 0), 4: (-1, 0, 0)}
s = 0.0045  # half a pip
for n, nrm in FACES.items():
    # two axes across the face
    ax = [i for i in range(3) if nrm[i] == 0]
    for a, b in PIPS[n]:
        q = []
        for da, db in ((-s, -s), (s, -s), (s, s), (-s, s)):
            v = [0.0, 0.0, 0.0]
            for i in range(3):
                v[i] = nrm[i] * (h + 0.0005)
            v[ax[0]] = a * G + da
            v[ax[1]] = b * G + db
            q.append(p.vert(*v))
        p.face(q, nrm, DARK)

export(parts, OUT, colors=True)
