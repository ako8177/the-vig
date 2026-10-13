"""The Vig, floor 1: room textures, neon signs and loss icons, drawn pixel by pixel with the
pixel-art-studio skill (pixelstudio.py). One run renders every asset in every palette cast in
src/data/palette.ts (TanoPal 48 since the Milestone 0 pick; STYLE.md) into public/tex/<cast>/,
plus contact sheets in ./previews/.

Single source of truth: the palette roles are read from src/data/palette.ts and the glyphs from
the game's bitmap font in src/ui/font.ts, so a sign's lettering is the same font as the HUD.

Run:  python pixel-art/vig-room/build.py
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_local = ROOT / ".claude/skills/pixel-art-studio/scripts"
sys.path.insert(0, str(_local if _local.exists() else Path.home() / ".claude/skills/pixel-art-studio/scripts"))
from pixelstudio import Sprite  # noqa: E402
from PIL import Image  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = ROOT / "public" / "tex"
PREV = HERE / "previews"

# ---------------------------------------------------------------- read the game's data

pal_src = (ROOT / "src/data/palette.ts").read_text(encoding="utf-8")


def _list(name):
    body = re.search(r"const %s = \[(.*?)\];" % name, pal_src, re.S).group(1)
    return ["#" + h for h in re.findall(r"'([0-9a-f]{6})'", body)]


cast_src = re.search(r"const CAST.*?= \{(.*?)\n\};", pal_src, re.S).group(1)
# every cast in palette.ts, each playing from TanoPal 48's colors
PAL_COLORS = {pid: _list("TANO48") for pid in re.findall(r"^  (\w+): \{", cast_src, re.M)}
CAST = {}
for pid in PAL_COLORS:
    block = re.search(r"\b%s: \{(.*?)\n  \}," % pid, cast_src, re.S).group(1)
    CAST[pid] = {k: "#" + v for k, v in re.findall(r"(\w+): '([0-9a-f]{6})'", block)}

font_src = (ROOT / "src/ui/font.ts").read_text(encoding="utf-8")
GLYPHS = {}
for m in re.finditer(r"^\s*(?:'((?:\\.|[^'])+)'|\"([^\"]+)\"|([A-Za-z_$]))\s*:\s*'([.#|]+)'", font_src, re.M):
    key = m.group(1) or m.group(2) or m.group(3)
    if key.startswith("\\u"):
        key = chr(int(key[2:], 16))
    elif key.startswith("\\"):
        key = key[1:]
    GLYPHS[key] = m.group(4).split("|")


def text_w(s):
    return sum(len(GLYPHS.get(ch, GLYPHS["?"])[0]) + 1 for ch in s) - 1 if s else 0


def draw_text(sp, s, x, y, color):
    for ch in s:
        rows = GLYPHS.get(ch, GLYPHS["?"])
        for yy, row in enumerate(rows):
            for xx, c in enumerate(row):
                if c == "#":
                    sp.px(x + xx, y + yy, color)
        x += len(rows[0]) + 1


# the tables, as the signs print them (src/data/tables.ts: sign, tier, loss)
tables_src = (ROOT / "src/data/tables.ts").read_text(encoding="utf-8")
SIGNS = [(i, s, t, l) for i, s, t, l in re.findall(r"id: '(\w+)'.*?sign: '([^']+)', tier: '(\w+)', loss: '(\w+)'", tables_src, re.S)]

# ---------------------------------------------------------------- the assets
# Light comes from above (the table lamps); every texture keeps its edges quieter than its
# center so tiling doesn't draw a grid (references/patterns.md, tiles).


def carpet(R):
    """64x64, 2 m of floor: wine carpet, a diamond lattice in the dark, brass pips at the knots."""
    s = Sprite(64, 64, palette=PAL)
    s.rect(0, 0, 63, 63, R["carpet"])
    s.noise(0, 0, 63, 63, R["carpetLo"], density=0.10, seed=11)
    for k in range(0, 64, 16):
        for i in range(16):
            # two diagonals per 16 px cell: a lattice that wraps cleanly at 64
            s.px((k + i) % 64, i % 64, R["carpetLo"])
            s.px((k + i) % 64, (16 + i) % 64, R["carpetLo"])
            s.px((k + i) % 64, (32 + i) % 64, R["carpetLo"])
            s.px((k + i) % 64, (48 + i) % 64, R["carpetLo"])
            s.px((k + 15 - i) % 64, i % 64, R["carpetLo"])
            s.px((k + 15 - i) % 64, (16 + i) % 64, R["carpetLo"])
            s.px((k + 15 - i) % 64, (32 + i) % 64, R["carpetLo"])
            s.px((k + 15 - i) % 64, (48 + i) % 64, R["carpetLo"])
    for y in range(8, 64, 16):
        for x in range(8, 64, 16):
            # a small brass-thread flower in each diamond
            s.px(x, y, R["brassLo"])
            s.px(x - 1, y, R["woodHi"]); s.px(x + 1, y, R["woodHi"])
            s.px(x, y - 1, R["woodHi"]); s.px(x, y + 1, R["woodHi"])
    return s


def wall(R):
    """64x128 = 2 m wide x 4 m tall: wood wainscot to 1.1 m, a brass rail, dark flocked paper above."""
    s = Sprite(64, 128, palette=PAL)
    rail = 128 - 36  # 1.1 m of 4 m
    # wallpaper: two values in a stripe-and-diamond flock
    s.rect(0, 0, 63, rail - 1, R["wall"])
    for x in range(0, 64, 16):
        s.rect(x + 7, 0, x + 8, rail - 1, R["night"])
    for y in range(6, rail - 4, 12):
        for x in range(0, 64, 16):
            cx = x + 15 if (y // 12) % 2 else x + 7
            for d in range(3):
                s.px((cx - d) % 64, y + d, R["wallHi"]); s.px((cx + d) % 64, y + d, R["wallHi"])
                s.px((cx - d) % 64, y + 5 - d, R["wallHi"]); s.px((cx + d) % 64, y + 5 - d, R["wallHi"])
    s.noise(0, 0, 63, rail - 1, R["night"], density=0.04, seed=3)
    # the rail
    s.rect(0, rail, 63, rail + 2, R["brassLo"])
    s.line(0, rail, 63, rail, R["brass"])
    # wainscot: two raised panels per 2 m
    s.rect(0, rail + 3, 63, 127, R["wood"])
    for px0 in (2, 34):
        s.rect(px0, rail + 7, px0 + 27, 122, R["woodLo"], fill=False)
        s.rect(px0 + 1, rail + 8, px0 + 26, 121, R["woodHi"], fill=False)
        s.rect(px0 + 1, rail + 8, px0 + 26, rail + 8, R["woodHi"])
        s.rect(px0 + 2, rail + 9, px0 + 25, 120, R["wood"])
        for gy in range(rail + 12, 119, 5):
            s.line(px0 + 4, gy, px0 + 23, gy + 1, R["woodLo"])
    s.rect(0, 124, 63, 127, R["woodLo"])
    return s


def felt(R):
    """32x32: table felt, a quiet nap."""
    s = Sprite(32, 32, palette=PAL)
    s.rect(0, 0, 31, 31, R["felt"])
    s.noise(0, 0, 31, 31, R["feltLo"], density=0.06, seed=5)
    return s


def wood(R):
    """32x32: lacquered rail wood, grain every 4-5 px with a 1 px wobble."""
    s = Sprite(32, 32, palette=PAL)
    s.rect(0, 0, 31, 31, R["wood"])
    for i, y in enumerate(range(1, 32, 5)):
        w = (i * 7) % 5
        s.line(0, y, 12 + w, y, R["woodLo"])
        s.line(13 + w, y + 1, 31, y + 1, R["woodLo"])
    s.noise(0, 0, 31, 31, R["woodHi"], density=0.03, seed=8)
    return s


def brass(R):
    """16x16: brushed brass for rails and fittings."""
    s = Sprite(16, 16, palette=PAL)
    s.rect(0, 0, 15, 15, R["brassLo"])
    for y in range(0, 16, 3):
        s.line(0, y, 15, y, R["brass"])
    s.noise(0, 0, 15, 15, R["woodHi"], density=0.05, seed=2)
    return s


def ceiling(R):
    """32x32: pressed-tin ceiling squares, almost black."""
    s = Sprite(32, 32, palette=PAL)
    s.rect(0, 0, 31, 31, R["ink"])
    s.rect(1, 1, 14, 14, R["night"], fill=False)
    s.rect(17, 17, 30, 30, R["night"], fill=False)
    s.rect(17, 1, 30, 14, R["night"], fill=False)
    s.rect(1, 17, 14, 30, R["night"], fill=False)
    for cx, cy in ((8, 8), (24, 24), (24, 8), (8, 24)):
        s.px(cx, cy, R["smoke"])
    return s


def cage(R):
    """32x64 with alpha: the cashier's cage, iron bars with a crossbar and a counter shelf."""
    s = Sprite(32, 64, palette=PAL)
    for x in range(2, 32, 8):
        s.rect(x, 0, x + 1, 63, R["ash"])
        s.line(x, 0, x, 63, R["dust"])
    s.rect(0, 20, 31, 21, R["ash"])
    s.line(0, 20, 31, 20, R["dust"])
    s.rect(0, 0, 31, 1, R["smoke"])
    return s


def door(R):
    """64x96 (2.2 x 2.6 m... drawn square-pixel at 2.2:2.9): padded double doors, brass studs."""
    s = Sprite(64, 96, palette=PAL)
    s.rect(0, 0, 63, 95, R["woodLo"])
    for x0 in (2, 33):
        s.rect(x0, 2, x0 + 28, 95, R["carpet"])
        s.noise(x0, 2, x0 + 28, 95, R["carpetLo"], density=0.08, seed=x0)
        for yy in range(8, 92, 10):
            for xx in range(x0 + 4, x0 + 27, 8):
                s.px(xx + (4 if (yy // 10) % 2 else 0) % 8, yy, R["brass"])
        s.rect(x0, 2, x0 + 28, 95, R["brassLo"], fill=False)
    # push plates
    s.rect(26, 44, 29, 56, R["brass"]); s.rect(34, 44, 37, 56, R["brass"])
    s.line(26, 44, 26, 56, R["midHi"]); s.line(34, 44, 34, 56, R["midHi"])
    return s


# ---- neon: a 2 px tube, its edge in the tier color and a 1 px hot core (bloom catches the core)

def tube_rect(s, x0, y0, x1, y1, edge, core):
    s.rect(x0, y0, x1, y1, edge, fill=False)
    s.rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, core, fill=False)
    for x, y in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):
        s.px(x, y, None)  # rounded corners: tubes bend, they don't miter


def icon(s, kind, x, y, edge, core):
    """A 20x20 loss glyph in neon: coin (money), mark (a debuff), skull (can kill)."""
    if kind == "coin":
        s.circle(x + 9, y + 9, 9, edge)
        s.circle(x + 9, y + 9, 8, core)
        # the font's own "$" at 2x, so the sign and the HUD's coin agree
        rows = GLYPHS["$"]
        for yy, row in enumerate(rows):
            for xx, c in enumerate(row):
                if c == "#":
                    s.rect(x + 5 + xx * 2, y + 3 + yy * 2, x + 6 + xx * 2, y + 4 + yy * 2, core)
    elif kind == "mark":
        s.circle(x + 9, y + 9, 9, edge)
        s.circle(x + 9, y + 9, 8, core)
        # a target: you are marked (the HUD's mark glyph is the same shape)
        s.circle(x + 9, y + 9, 4, edge)
        s.circle(x + 9, y + 9, 3, core)
        s.rect(x + 8, y + 8, x + 10, y + 10, core)
    else:  # skull
        s.ellipse(x + 2, y + 1, x + 17, y + 14, edge, fill=False)
        s.ellipse(x + 3, y + 2, x + 16, y + 13, core, fill=False)
        s.rect(x + 5, y + 6, x + 8, y + 9, core)   # eyes
        s.rect(x + 11, y + 6, x + 14, y + 9, core)
        s.px(x + 9, y + 11, edge); s.px(x + 10, y + 11, edge)  # nose
        s.rect(x + 5, y + 14, x + 14, y + 18, edge, fill=False)  # jaw
        for tx in (7, 9, 11, 13):
            s.line(x + tx - 1, y + 15, x + tx - 1, y + 17, core)  # teeth
    return s


def sign(R, name, tier, loss, w=96):
    """w x 32 hanging sign: a dark board, a neon border, the loss glyph left, the name right."""
    edge, core = R[tier], R[tier + "Hi"]
    s = Sprite(w, 32, palette=PAL)
    s.rect(0, 0, w - 1, 31, R["ink"])
    s.rect(1, 1, w - 2, 30, R["night"], fill=False)
    tube_rect(s, 2, 2, w - 3, 29, edge, core)
    icon(s, loss, 6, 6, edge, core)
    tx0, tx1 = 30, w - 6
    label = name
    tw = text_w(label)
    # the name, doubled vertically for neon weight when it fits (7 px glyphs -> a 2 px stroke)
    x = tx0 + (tx1 - tx0 - tw) // 2
    draw_text(s, label, x, 7, core)
    tierword = {"low": "LOW", "mid": "MID", "high": "HIGH", "coll": "THE HOUSE"}[tier]
    tw2 = text_w(tierword)
    s.line(tx0 + 2, 17, tx1 - 2, 17, edge)
    draw_text(s, tierword, tx0 + (tx1 - tx0 - tw2) // 2, 20, edge)
    return s


# ---------------------------------------------------------------- render

ASSETS = {"carpet": carpet, "wall": wall, "felt": felt, "wood": wood, "brass": brass, "ceiling": ceiling, "cage": cage, "door": door}


def sheet(images, path, scale=4, tile=True):
    """A contact sheet: each asset at `scale`, tiled 2x2 when it tiles (seams show at the cross)."""
    cells = []
    for name, im in images:
        im = im.convert("RGBA")
        if tile and name in ("carpet", "wall", "felt", "wood", "brass", "ceiling"):
            t = Image.new("RGBA", (im.width * 2, im.height * 2))
            for dx in (0, 1):
                for dy in (0, 1):
                    t.paste(im, (dx * im.width, dy * im.height))
            im = t
        cells.append(im.resize((im.width * scale, im.height * scale), Image.NEAREST))
    W = sum(c.width for c in cells) + 8 * (len(cells) + 1)
    H = max(c.height for c in cells) + 16
    out = Image.new("RGBA", (W, H), (40, 40, 48, 255))
    x = 8
    for c in cells:
        out.alpha_composite(c, (x, 8))
        x += c.width + 8
    out.save(path)
    print("sheet ->", path)


PREV.mkdir(parents=True, exist_ok=True)
for pid, colors in PAL_COLORS.items():
    PAL = colors
    R = CAST[pid]
    made = []
    for name, fn in ASSETS.items():
        s = fn(R)
        s.save_png(str(OUT / pid / f"{name}.png"))
        made.append((name, s.composite()))
    signs = []
    for tid, label, tier, loss in SIGNS:
        s = sign(R, label, tier, loss)
        s.save_png(str(OUT / pid / f"sign_{tid}.png"))
        signs.append((tid, s.composite()))
    s = sign(R, "COLLECTOR", "coll", "skull", w=128)
    s.save_png(str(OUT / pid / "sign_collector.png"))
    signs.append(("collector", s.composite()))
    sheet(made[:4], PREV / f"{pid}-surfaces-a.png", scale=4)
    sheet(made[4:], PREV / f"{pid}-surfaces-b.png", scale=4)
    sheet(signs[:4], PREV / f"{pid}-signs-a.png", scale=4, tile=False)
    sheet(signs[4:], PREV / f"{pid}-signs-b.png", scale=4, tile=False)
