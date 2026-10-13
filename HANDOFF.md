# Handoff — The Vig

Read this first, every session.

## Where things stand (2026-10-12)

**Milestone 1 is done**: a playable single-player slice, three nights on floor 1 (PROGRESS.md has
the list). It was playtested twice by the `indie-dev-critic` agent and reviewed once by the
project's `indie-critic`; their findings are fixed except the owner's calls below. The repo moved
to `ako8177` this session; the owner is new to the project.

## Waiting on the owner (ask before touching; CLAUDE.md's "ask before" list)

1. **Paying beats gambling** (DESIGN.md §7, §8 test 6): always-pay survives all three nights 38%,
   deciding by charms 30%, always-gamble 15%. The lever is a lost gamble's **+10–40% on the next
   quota** (part of the quota curve). Suggested: +0–20%, or a flat +10%, then re-run the pace tests.
2. **The last-night shortfall** (DECISIONS #56): short on night 3 with lives to spare still counts
   as walking out. Suggested: the stairs open only for a paid quota.
3. **Derivative flags** (DECISIONS #58): the Circuit vs Buckshot Roulette (now positional, #52; the
   seated, glowing-eyed Collector is #30's M5 item, but the M2 friend test comes first), and
   "charms" + an escalating-deadline shop vs CloverPit (a rename is cheap now: "comps", "favors").
4. **Dead Man's Hand is the cheapest money per life** (the design review: ≈ $18,000 per life vs Red
   Line's ≈ $2,400). Raising its death odds is "loss cost up", so it's the owner's.

## Next (in order)

1. Settle the owner's calls above; re-run `npx vitest run tests/pace.test.ts` after any number moves
   and write the derivation in DESIGN.md first.
2. The design review's open items that are ours to decide (none started): team marks that push you
   to another tier (Cold Deck → mid payouts −15%; replace Blackout, a near no-op); upgrades bought
   with leftover markers after the run instead of in-run (Float raises safe-only's night 1 to 13%);
   a cushioned Dead Man's bot in §8.
3. Milestone 2, the gate (ROADMAP): the owner plays, then a friend over the shoulder; the
   indie-critic against DESIGN.md §9. Nothing from Milestone 3 before it passes.
4. The Blender model pass (ROADMAP M1 step 10) when a Blender MCP is available.

## How to run

- Play: double-click `Play.bat`, or `npm run dev` (`http://127.0.0.1:5180/`). In Windows PowerShell
  `npm` is blocked by the execution policy: use `npm.cmd run dev`.
- Node 22+ installed normally, on PATH.
- Live build: https://ako8177.github.io/the-vig/ (repo `ako8177/the-vig`). Every push to `main` runs
  the tests, builds and deploys (`.github/workflows/deploy.yml`), about a minute.
- `npm run typecheck`, `npm test` (28 tests, ~10 s: sim, data validation, the pace tests on 200
  seeds), `npm run build`.
- With a dev server up: `npm run e2e` (smoke: a whole night into night 2), `npm run screens`
  (23 surfaces, overlap audit), `npm run shots` (door, Hi-Lo, the Collector, 0:00), `npm run perf`,
  `node e2e/palette.mjs`, `node e2e/coverage.mjs`. They drive Chrome if installed, else **Edge**
  (this PC), headless with SwiftShader. Output in `e2e/out/` (ignored by git). For long sweeps or a
  playtest while you edit, `npm run serve:e2e` serves on 5181 with no hot reload; point the scripts
  at it with `BASE=http://127.0.0.1:5181/`.
- Art: `python pixel-art/vig-room/build.py` re-renders every texture and sign (Pillow; the
  pixel-art-studio skill, installed at `~/.claude/skills/pixel-art-studio`).
- Playtests: the `indie-dev-critic` agent lives in `~/.claude/agents/` (user level, every project).
  Give it the commit, the 5181 server and what changed; it returns a scorecard and a fix list, and
  re-checks its findings when asked.

## Code map

- `src/sim/` (pure, seeded, command-driven): `Game.ts` (system order, queue, events, hash, replay),
  `commands.ts` (now with `fortune`, `ready`, `callit`), `events.ts`, `state.ts` (phases floor →
  midnight → choice → circuit → wheel → summary → over), `rules.ts` (payout factor, stakes, marks,
  lives, markers, run end), `circuit.ts`, `tables/` (one module per table: `odds`, `start`,
  `resolve`, `lossCost`), `systems/` (clock, movement, tables, marks, lives, cage, collector,
  economy, stats).
- `src/data/`: palette, tables, floors, economy, marks, charms (and upgrades), wheels, circuit.
  Every number names its DESIGN.md section; `tests/data.test.ts` enforces it.
- `src/render3d/`: view (renderer, selective bloom at half size, letterbox scaling), pixelpass,
  room (incl. the Collector's screen and `setMidnight`), textures, fpcam.
- `src/panels/`: `panel.ts` (redraw policy), `table.ts` (the shared odds block), `games.ts` (the six
  tables), `collector.ts` (choice, Circuit, wheels, summary), `view.ts` (read-only state helpers).
- `src/hud/hud.ts`: in-play HUD, toasts, banners, lessons, title, how to play, settings, cage,
  confirm, pause, results. `src/app/app.ts`: screens, input → commands, events → camera, sound,
  lessons; settings and meta in localStorage (`vig.settings`, `vig.meta`).
- `tests/`: `sim.test.ts`, `data.test.ts`, `pace.test.ts` + `bots.ts`, `audit.test.ts`.
- Debug hooks: `window.__app` (`enter()`, `newRun(seed)`, `pose(x, z, yaw, pitch)`, `sitAt(table)`,
  `skipTo(tick)`, `setToggles(...)`, `screen`, `cageOpen`), `window.__game`, `window.__Game`,
  `window.__floors`.

## Gotchas

- e2e drives the installed Chrome or Edge (Windows blocked Playwright's own Chromium on the
  original PC). Elsewhere, `PW_CHANNEL=chromium` works after `npx playwright install chromium`.
- npm 11.19 holds back package install scripts: electron's (only `npm run desktop`/`dist:win` need
  it): `npm.cmd install-scripts approve electron`.
- Textures and UI name palette *roles*, never hexes; a new color goes in a cast in palette.ts.
- `pixel-art/vig-room/build.py` parses `src/data/palette.ts`, `src/data/tables.ts` and
  `src/ui/font.ts` with regexes: keep their formats (one `role: 'hex'` per pair; in tables.ts,
  `id`, `sign`, `tier`, `loss` in that order on one object each).
- Panel text that states a rule must be built from data (the critics found two stale copies).
