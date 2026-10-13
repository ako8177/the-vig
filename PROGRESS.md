# Progress — The Vig

What is built. Newest first.

## 2026-10-12 — Milestone 0: foundation and the room (waiting on the palette pick)

**Engine layer** (from Sprocket & Sprout, every S&S name, string, color and asset stripped):
`src/engine/loop.ts` (fixed 60 Hz), `rng.ts` (mulberry32), `input.ts` (rebindable actions, pointer
lock, mouse look), `audio/` (buses, jsfxr bank with an empty bank, the song synth with an empty
playlist; The Vig's sounds and songs are Milestone 7), `src/ui/font.ts` (the bitmap font, plus the
loss glyphs: coin, target mark, skull, ghost soul, diamond marker), `src/ui/ui.ts` (the IMGUI kit,
reworked for casino panels and an explicit pointer so it draws on table screens), `src/ui/audit.ts`
(the overlap audit) and its test, `.bat` files (Play, Package for web, Build desktop app),
`electron/main.cjs`, `.github/workflows/deploy.yml` (inert until the repo exists),
vite/vitest/tsconfig, package scripts. Nothing from S&S's sim, data, app, renderer or art.

**Sim scaffold** (`src/sim/`): the command type (all thirteen commands), `Game.ts` with the fixed
system order and nine systems (seven empty; movement walks at 3 m/s with capsule-vs-box/circle
collision; tables seats and stands you, Hi-Lo only), the event queue, a state hash, and
`Game.replay`. Starting state from DESIGN.md §2 (bank $1,000, quota $3,000, 3 lives, 6:00).

**Data**: `src/data/palette.ts` (Resurrect 64 and TanoPal 48, three role casts, the tier colors),
`tables.ts` (the six floor-1 tables with DESIGN.md §3 numbers and derivations), `floors.ts`
(floor 1: 24 x 16 m, colliders, table placements, seats, screens, signs).

**Renderer** (`src/render3d/`): 640x360 target → selective bloom (GLOW layer) → palette pixel pass
(64³ LUT + 4x4 Bayer dither) → whole-number upscale, letterboxed; each stage toggles. First-person
camera (yaw on the body, pitch clamped ±70°, eye 1.6 m, eased seat/stand). The room from code:
carpet, walls with wainscot, unlit ceiling, the door, the bar with bottles (instanced), the cage,
four pillars, six tables with tier-colored neon rims, stools, dealer screens, a 2.8 m neon sign over
each with its tier color and loss glyph, the Collector's round table with two violet rings, his
chair and his eyes; 8 point lights + a hemisphere. Static meshes merged per material. Dispose path.

**Panels and HUD**: `src/panels/panel.ts` (320x180 canvas, redrawn only on change, shown as a
CanvasTexture with NearestFilter), `src/panels/hilo.ts` (the static odds card: tier badge, win
chance, payout, return per $1, loss cost, what a mark is, bet, disabled call buttons).
`src/hud/hud.ts`: clock, bank against quota, lives, souls, markers, active marks, crosshair, the
seat prompt with the table's odds line, the enter and pause cards.

**Art** (pixel-art-studio skill): `pixel-art/vig-room/build.py` draws 15 assets (carpet, wall,
felt, wood, brass, ceiling, cage bars, door, seven signs) in every cast into `public/tex/`.
PixelLab spend: 0.

**Agents** (`.claude/agents/`): indie-critic, art-director, qa-screens (rewritten for The Vig,
each flagging anything derivative of Buckshot Roulette, CloverPit or Gamble With Your Friends) and
balance-auditor (new).

**e2e** (`e2e/`): `launch.mjs` (installed Chrome + SwiftShader), `shots.mjs` (door, seated at
Hi-Lo, the Collector's table, the door with each pass toggled), `screens.mjs` (HUD x 6 states +
the Hi-Lo panel, overlap audit), `palette.mjs` (each tier from 10 m in each cast), `perf.mjs`,
`smoke.mjs`, `coverage.mjs`.

**Checked**: typecheck clean; 15/15 tests (incl. a replayed command log reproducing the state hash
on 3 seeds); screens 7 surfaces, 0 clash / 0 overflow / 0 covered, 0 console errors; smoke 7/7
(click asks for pointer lock, W walks 3.00 m in 1 s, E sits at Hi-Lo, E stands); perf under
SwiftShader 30-42 fps, 31 draw calls, 2.2k triangles; all 15 textures load in all 3 casts;
`npm run build` 169 kB gzipped. Every screenshot looked at.

**Not done in M0**: STYLE.md (waits for the owner's palette pick, DECISIONS #7, #21); DESIGN.md
updated for decisions #8-#11 (start of M1, by the owner's choice).

## 2026-10-12 — Planning

- PLAN, DESIGN, THREEJS-NOTES, CLAUDE, ROADMAP, START-HERE, HANDOFF, DECISIONS, IDEAS written. No code.

## Milestones

| Milestone | Status |
|---|---|
| M0 — Foundation and the room | built; waiting for the palette pick, then STYLE.md |
| M1 — The slice (single player, floor 1, three nights) | not started |
| M2 — The gate | not started |
| M3 — Co-op | waiting for the gate |
