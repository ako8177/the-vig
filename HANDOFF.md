# Handoff — The Vig

Read this first, every session.

## Where things stand (2026-10-12)

**Milestone 0 is done.** The owner picked TanoPal 48 (mid tier cast yellow so it doesn't read as
the high tier's red; DECISIONS #29) and STYLE.md is written. The Collector keeps his eyes; in M5 he
deals from the center, standing, not seated across from you (#30).

## Next

1. **Start of Milestone 1, before any code**: fold DECISIONS #8-#11 into DESIGN.md (blood-table
   deaths cost one life; Overclock carries over and Marker Magnet joins the slice; the bank carries
   over with a $1,000 floor; the exact Red Line and Dead Man's numbers; the Red Line streak
   survives standing; PLAN.md's table numbers synced). Re-derive §2's nights 2-3 and §8 test 3.
2. Then START-HERE.md Prompt 1.

## How to run

- Play: double-click `Play.bat`, or in a terminal put Node on PATH and `npm run dev`
  (`http://127.0.0.1:5180/`). Click to step onto the floor; WASD, mouse, E to sit at Hi-Lo
  (the only open table in M0), E or Esc to stand.
- Node 22+ installed normally, on PATH.
- Live build: https://ako8177.github.io/the-vig/ (repo `ako8177/the-vig`). Every push to `main` runs
  the tests, builds and deploys (`.github/workflows/deploy.yml`), about a minute.
- `npm run typecheck`, `npm test`, `npm run build`.
- With the dev server up: `npm run shots`, `npm run screens`, `npm run perf`, `npm run e2e` (smoke),
  `node e2e/palette.mjs`, `node e2e/coverage.mjs`. They drive the installed Chrome with SwiftShader;
  from Claude's tool sandbox they need the sandbox off (`spawn UNKNOWN` otherwise). Output in
  `e2e/out/` (ignored by git).
- Art: `python pixel-art/vig-room/build.py` re-renders every texture and sign
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
  `setToggles({bloom, pixel, lowRes})`), `window.__game`, `window.__Game`,
  `window.__floors`.

## Gotchas

- e2e drives the installed Chrome (`channel: 'chrome'`, e2e/launch.mjs) because Windows blocked
  Playwright's own Chromium on the original PC. Elsewhere, `PW_CHANNEL=chromium` works after
  `npx playwright install chromium`.
- Textures and UI name palette *roles*, never hexes; a new color goes in a cast in palette.ts.
- `pixel-art/vig-room/build.py` parses `src/data/palette.ts`, `src/data/tables.ts` and
  `src/ui/font.ts` with regexes: keep their formats (one `role: 'hex'` per pair, one table per object).
