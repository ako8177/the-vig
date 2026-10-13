# Handoff — The Vig

Read this first, every session.

## Where things stand (2026-10-12)

Milestone 0 is built and committed, **except STYLE.md, which waits for the owner's palette pick.**
The neon-and-palette test ran on three casts; the screenshots are in `e2e/out/palette/`
(`<cast>-tiers.png`: each tier's sign from 10 m; `<cast>-door.png`: the room from the door).
Claude recommends **r64teal** (Resurrect 64 with the low tier cast teal; DECISIONS #21).

## Next

1. **The owner picks a cast** (r64, r64teal or tano48). Then: set `activePalette` in
   `src/data/palette.ts` to it, delete the other casts and their `public/tex/<cast>/` folders, have the
   art director write `STYLE.md` from the pick (palette, the role cast, tier colors, neon rules from
   DECISIONS #15-#17, texel densities: textures 32 px/m on the floor and walls, signs 34 px/m,
   panels about 1:1 from the seat, the pixel-art-studio pipeline), and commit. That closes M0.
2. **Start of Milestone 1, before any code**: fold DECISIONS #8-#11 into DESIGN.md (blood-table
   deaths cost one life; Overclock carries over and Marker Magnet joins the slice; the bank carries
   over with a $1,000 floor; the exact Red Line and Dead Man's numbers; the Red Line streak
   survives standing; PLAN.md's table numbers synced). Re-derive §2's nights 2-3 and §8 test 3.
3. Then START-HERE.md Prompt 1.

## How to run

- Play: double-click `Play.bat`, or in a terminal put Node on PATH and `npm run dev`
  (`http://127.0.0.1:5180/`). Click to step onto the floor; WASD, mouse, E to sit at Hi-Lo
  (the only open table in M0), E or Esc to stand.
- Node: `export PATH="/c/Users/jacks/tools/node-v22.20.0-win-x64:$PATH"` (bash) or
  `$env:Path = "C:\Users\jacks\tools\node-v22.20.0-win-x64;" + $env:Path` (PowerShell).
- `npm run typecheck`, `npm test`, `npm run build`.
- With the dev server up: `npm run shots`, `npm run screens`, `npm run perf`, `npm run e2e` (smoke),
  `node e2e/palette.mjs`, `node e2e/coverage.mjs`. They drive the installed Chrome with SwiftShader;
  from Claude's tool sandbox they need the sandbox off (`spawn UNKNOWN` otherwise). Output in
  `e2e/out/` (ignored by git).
- Art: `python pixel-art/vig-room/build.py` re-renders every texture and sign in every cast
  (Pillow; the pixel-art-studio skill's `pixelstudio.py`). Contact sheets in
  `pixel-art/vig-room/previews/` (ignored).

## Code map

- `src/engine/` loop, rng, input, audio. `src/ui/` font, IMGUI kit, overlap audit.
- `src/sim/` Game.ts (system order, queue, events, hash, replay), commands.ts, events.ts, state.ts,
  `systems/` (movement and tables have code; the rest are empty with their milestone step noted).
- `src/data/` palette.ts (palettes + role casts + tiers), tables.ts, floors.ts.
- `src/render3d/` view.ts (renderer, selective bloom, letterbox, pick), pixelpass.ts, room.ts,
  textures.ts, fpcam.ts. `src/panels/` panel.ts, hilo.ts. `src/hud/` hud.ts. `src/app/` app.ts.
- Debug hooks: `window.__app` (`enter()`, `pose(x, z, yaw, pitch)`, `sitAt(table)`,
  `setToggles({bloom, pixel, lowRes})`, `setPalette(id)`), `window.__game`, `window.__Game`,
  `window.__floors`.

## Gotchas

- The other game folders in Documents are read-only for this project.
- Playwright's own Chromium is blocked by Windows on this PC; use `channel: 'chrome'` (e2e/launch.mjs).
- Textures and UI name palette *roles*, never hexes; a new color goes in a cast in palette.ts.
- `pixel-art/vig-room/build.py` parses `src/data/palette.ts`, `src/data/tables.ts` and
  `src/ui/font.ts` with regexes: keep their formats (one `role: 'hex'` per pair, one table per object).
