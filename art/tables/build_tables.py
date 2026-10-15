# The six game tables of floor 1 and their stools, built by script in Blender (STYLE.md, "Pipeline";
# THREEJS-NOTES rule 11) and exported to public/models/tables.glb. Run it inside Blender:
#     exec(open(r'<repo>/art/tables/build_tables.py').read())
# (the Blender MCP does exactly that). Nothing in the .glb is ever edited by hand.
#
# Each table is modelled round its own footprint (src/data/floors.ts: x, z, w, d; the top at 0.9 m)
# with its origin on the floor at the footprint's middle, in three.js's frame (+z toward the seat), so
# src/render3d/room.ts places it with no offset. A table is one object per material, named
# `<table>_<material>` (wood, felt, brass, brassLo, woodLo, ink, night): room.ts gives each the room's
# own material for it, so every part merges into a draw the room already makes (no new draw calls).
# Wood and felt carry UVs in meters at the room's densities (wood 1 tile a meter, felt 2).
# What stays in code, exactly as it was: the tier's neon rim, the dealer's screen, its frame and post,
# the slot face and the topper's chasing bulbs, and the signs (STYLE.md: the tiers own their colors).
#
# Tiers read in the furniture too: the floor's tables stand on legs (Twenty-One) or are slot cabinets
# (the Bandit); the lounge's on a pedestal, their corners rounded; the back room's on a heavy plinth.
import os

ROOT = globals().get('VIG_ROOT', r'C:\Users\herna\Documents\the-vig')
exec(open(os.path.join(ROOT, 'art', 'blender_kit.py')).read())
OUT = os.path.join(ROOT, 'public', 'models', 'tables.glb')

# the footprints, as in src/data/floors.ts `tables` (tests/models.test.ts checks they still match)
TABLES = {
    'twentyone': (2.2, 1.2, 'legs'),
    'hilo': (1.8, 1.1, 'pedestal'),
    'wheel': (2.0, 1.2, 'pedestal'),
    'redline': (2.2, 1.2, 'plinth'),
    'deadman': (2.0, 1.2, 'plinth'),
}
TOP, FELT_Y, APRON = 0.9, 0.885, 0.77
RIM = 0.075

parts = []


class Table:
    def __init__(self, name):
        self.name, self.mats = name, {}

    def __getitem__(self, mat):
        if mat not in self.mats:
            p = Part(f'{self.name}_{mat}', uv={'wood': 1.0, 'felt': 2.0}.get(mat, 1.0))
            self.mats[mat] = p
            parts.append(p)
        return self.mats[mat]


def top(t, w, d, r, seg, apron=APRON):
    """The top: a wooden rim with a rounded edge round a felt inset a little below it, and the apron
    under the edge (the neon rim in room.ts runs along the front and back edges at 0.86 m)."""
    wd = t['wood']
    outer = rrect(w, d, r, seg)
    edge = rrect(w - 0.03, d - 0.03, max(r - 0.015, 0.01), seg)
    under = rrect(w - 0.06, d - 0.06, max(r - 0.03, 0.01), seg)
    inner = rrect(w - 2 * RIM, d - 2 * RIM, max(r - RIM * 0.7, 0.01), seg)
    a = wd.ring(edge, TOP)
    b = wd.ring(outer, TOP - 0.02)
    c = wd.ring(outer, apron + 0.03)
    e = wd.ring(under, apron)
    i0 = wd.ring(inner, TOP)
    i1 = wd.ring(inner, FELT_Y)
    away = lambda q: ('from', (0, wd.v[q[0]][1], 0))
    wd.bridge(i0, a, (0, 1, 0))
    wd.bridge(a, b, away)
    wd.bridge(b, c, away)
    wd.bridge(c, e, away)
    wd.bridge(i1, i0, lambda q: ('toward', (0, wd.v[q[0]][1], 0)))
    f = t['felt']
    f.face(f.ring(inner, FELT_Y), (0, 1, 0))


def rail(t, w, d):
    """The front armrest, brass-lo as the old rail was: a long hexagonal bolster on the front edge."""
    z0, y0 = d / 2 - 0.005, 0.895
    prof = [(z0 + 0.04 * math.cos(a), y0 + 0.032 * math.sin(a)) for a in (math.radians(30 + 60 * k) for k in range(6))]
    t['brassLo'].prism(prof, 'x', -w / 2 + 0.09, w / 2 - 0.09)


def legs(t, w, d, apron):
    """Four tapered legs, brass shoes at their feet."""
    sq = [(1, 1), (1, -1), (-1, -1), (-1, 1)]
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * (w / 2 - 0.16), sz * (d / 2 - 0.14)
            t['wood'].loft([(0.07, 0.028, 0.028, x, z), (apron, 0.042, 0.042, x, z)], sq, caps=(False, False))
            t['brass'].loft([(0.0, 0.031, 0.031, x, z), (0.07, 0.029, 0.029, x, z)], sq, caps=(False, True))
    # a stretcher between each end's legs, low down
    for sx in (-1, 1):
        x = sx * (w / 2 - 0.16)
        t['wood'].box(x, 0.2, 0, 0.035, 0.04, d - 0.3, bottom=False)


def pedestal(t, w, d):
    """A lounge pedestal: a fluted column on a wide rounded foot, a brass collar under the top."""
    oct8 = circle(1.0, 8)
    t['wood'].slab(rrect(w * 0.5, d * 0.62, d * 0.25, 2), 0.0, 0.07, bottom=False)
    t['wood'].loft([(0.07, 0.15, 0.15), (0.16, 0.11, 0.11), (APRON - 0.07, 0.12, 0.12)], oct8, caps=(False, False))
    t['brass'].loft([(APRON - 0.07, 0.16, 0.16), (APRON - 0.02, 0.19, 0.19), (APRON, 0.19, 0.19)], oct8, caps=(True, False))


def plinth(t, w, d, apron):
    """A back-room plinth: a solid base set well in under a deep top, on a brass kick band."""
    t['wood'].slab(rrect(w - 0.36, d - 0.4, 0.04, 1), 0.08, apron, top=False, bottom=False)
    t['brass'].slab(rrect(w - 0.3, d - 0.34, 0.05, 1), 0.0, 0.08, bottom=False)


# ------------------------------------------------------------------ the felt tables
for name, (w, d, base) in TABLES.items():
    t = Table(name)
    if base == 'legs':
        top(t, w, d, 0.07, 1, 0.7)
        legs(t, w, d, 0.7)
    elif base == 'pedestal':
        top(t, w, d, 0.12, 2)
        pedestal(t, w, d)
    else:
        top(t, w, d, 0.05, 1, 0.72)
        plinth(t, w, d, 0.72)
    rail(t, w, d)
    # each game's own things on the felt, in the back corners clear of the dealer's screen (±0.67 m)
    bx = w / 2 - 0.3 if base != 'pedestal' else w / 2 - 0.27
    bz = -d / 2 + 0.27
    if name == 'twentyone':
        # the shoe the cards come from, and the discard holder
        t['ink'].prism([(-0.1, 0.0), (0.09, 0.0), (0.1, 0.045), (-0.1, 0.1)], 'x', bx - 0.06, bx + 0.06)
        t['ink'].box(-bx, FELT_Y + 0.035, bz, 0.09, 0.07, 0.12, bottom=False)
    elif name == 'hilo':
        # the die's cup, turned down after the throw (nearer the seat: further back, the seated view
        # sees it over the screen's corner)
        cx, cz = w / 2 - 0.16, -d / 2 + 0.5
        t['ink'].loft([(FELT_Y, 0.05, 0.05, cx, cz), (FELT_Y + 0.1, 0.042, 0.042, cx, cz)], circle(1.0, 8), caps=(False, True))
    elif name == 'wheel':
        # a stack of the wheel's marker tokens beside a brass spindle
        t['brass'].loft([(FELT_Y, 0.03, 0.03, bx, bz), (FELT_Y + 0.14, 0.012, 0.012, bx, bz)], circle(1.0, 6), caps=(False, True))
        t['ink'].loft([(FELT_Y, 0.035, 0.035, -bx, bz), (FELT_Y + 0.05, 0.035, 0.035, -bx, bz)], circle(1.0, 8), caps=(False, True))
    elif name == 'redline':
        # the fresh deck each call is cut from
        t['ink'].box(bx, FELT_Y + 0.016, bz, 0.075, 0.032, 0.105, bottom=False)
    elif name == 'deadman':
        # a raised tray the dice are thrown into
        tw, td, th = 0.5, 0.36, 0.05
        ow = t['woodLo']
        o0, o1 = ow.ring(rrect(tw, td, 0.03, 1, -bx + 0.05, bz + 0.03), FELT_Y), ow.ring(rrect(tw, td, 0.03, 1, -bx + 0.05, bz + 0.03), FELT_Y + th)
        i0, i1 = ow.ring(rrect(tw - 0.06, td - 0.06, 0.01, 1, -bx + 0.05, bz + 0.03), FELT_Y + th), ow.ring(rrect(tw - 0.06, td - 0.06, 0.01, 1, -bx + 0.05, bz + 0.03), FELT_Y + 0.004)
        c = (-bx + 0.05, 0, bz + 0.03)
        ow.bridge(o0, o1, lambda q: ('from', (c[0], ow.v[q[0]][1], c[2])))
        ow.bridge(o1, i0, (0, 1, 0))
        ow.bridge(i0, i1, lambda q: ('toward', (c[0], ow.v[q[0]][1], c[2])))

# ------------------------------------------------------------------ the Bandit's cabinet
# origin on the floor at the cabinet's middle; its front at +0.45 (floors.ts: 1.4 x 0.9). In front of it,
# from code: the slot face (z 0.455), the screen (z 0.47, y 0.94-1.66), the neon kick (y 0.1) and
# crown (y 1.92), the topper's five bulbs (y 2.1, z 0.235)
W, D = 1.4, 0.9
t = Table('bandit')
t['night'].prism([(-D / 2, 0.0), (D / 2, 0.0), (D / 2, 1.85), (-0.28, 1.85), (-D / 2, 1.68)], 'x', -W / 2 + 0.02, W / 2 - 0.02)
# the side cheeks: proud of the front, so the face and screen sit in a frame
for s in (-1, 1):
    t['ink'].prism([(-D / 2, 0.0), (D / 2 + 0.05, 0.0), (D / 2 + 0.05, 0.98), (D / 2 + 0.03, 1.74), (0.3, 1.86), (-D / 2, 1.86)],
                   'x', s * (W / 2 - 0.02), s * (W / 2 + 0.02))
# a brass trim on the crown and a bezel round the screen
t['brass'].box(0, 1.865, 0, W + 0.04, 0.03, D + 0.02)
br = t['brass']
o = [br.vert(x, y, D / 2 + 0.035) for x, y in ((-0.68, 0.9), (0.68, 0.9), (0.68, 1.7), (-0.68, 1.7))]
i = [br.vert(x, y, D / 2 + 0.035) for x, y in ((-0.645, 0.935), (0.645, 0.935), (0.645, 1.665), (-0.645, 1.665))]
ob = [br.vert(x, y, D / 2 - 0.01) for x, y in ((-0.68, 0.9), (0.68, 0.9), (0.68, 1.7), (-0.68, 1.7))]
ib = [br.vert(x, y, D / 2 + 0.005) for x, y in ((-0.645, 0.935), (0.645, 0.935), (0.645, 1.665), (-0.645, 1.665))]
br.bridge(o, i, (0, 0, 1))
br.bridge(ob, o, lambda q: ('from', (0, 1.3, D / 2)))
br.bridge(i, ib, ('toward', (0, 1.3, D / 2)))
# the topper: a lit arch over the crown (its bulbs are code: their colors chase)
t['ink'].prism([(-W / 2, 1.88), (W / 2, 1.88), (W / 2, 2.17), (0.45, 2.32), (0.0, 2.36), (-0.45, 2.32), (-W / 2, 2.17)],
               'z', -0.405, 0.225)

# ------------------------------------------------------------------ the stool (every stool on the floor)
# the seat's top at y 0 (room.ts sets it at the stool's height); the post 1 m tall, scaled to fit
p = Part('stool_seat', uv=1.0)
parts.append(p)
p.loft([(-0.06, 0.2, 0.2), (0.0, 0.22, 0.22)], circle(1.0, 8))
p = Part('stool_post', uv=1.0)
parts.append(p)
p.loft([(0.0, 0.04, 0.04), (1.0, 0.04, 0.04)], circle(1.0, 6), caps=(False, False))

export(parts, OUT)
for name in list(TABLES) + ['bandit']:
    print(f'{name:10s} {sum(p.tris() for p in parts if p.name.startswith(name + "_")):4d} tris a table')
