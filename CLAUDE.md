# CLAUDE.md — The Vig

You are building **The Vig**, a first-person co-op casino roguelike in Three.js. Read `PLAN.md`
(what and why), `DESIGN.md` (every number and its derivation), `THREEJS-NOTES.md` (the 3D
rules), `ROADMAP.md` (what to build now), `STYLE.md` (once written) and `PROGRESS.md` (what
exists) at the start of every session, in that order. `DECISIONS.md` holds every decision with
its reason; add to it, never silently contradict it. `HANDOFF.md` says where the last session
stopped.

## Stack (decided, don't relitigate)

TypeScript strict · Vite · **Three.js** (pinned at setup) · 640×360 internal resolution with
bloom → pixel pass → whole-number upscale · fixed 60 Hz pure simulation · 2D canvas panels
(IMGUI kit + bitmap font) as CanvasTextures on tables and as the HUD overlay · Web Audio with
the S&S synth and jsfxr bank · localStorage for settings and meta · Vitest · Playwright +
headless Chromium (SwiftShader) · GitHub Pages · Electron later · **Trystero** (WebRTC, no
server) for co-op in Milestone 3.

The engine layer comes from Sprocket & Sprout (`C:\Users\jacks\Documents\sprocket-and-sprout`):
`src/engine/` (loop, rng, input, audio, sfxr, music), the bitmap font and IMGUI kit, the overlap
audit, the e2e harness, the deploy workflow, the `.bat` files, Electron. **Nothing from its
`sim/`, `data/`, `app/`, renderer or art.** The other projects in `Documents` (candlepower,
trotline, slipstream-salvager, slipstream-salvager-3d) are **read-only**: never write, commit or
run npm there. `slipstream-salvager-3d/THREEJS-NOTES.md` may be read for the first-person
camera, pixel pass and SwiftShader notes.

## Architecture rules

- **`src/sim/` is pure and command-driven.** It never sees input, DOM, canvas, audio, time or
  the network. It takes **commands** (`sit`, `stand`, `bet`, `call`, `spin`, `buy`, `inspect`,
  `reroute`, `activate`, `pay`, `gamble`, `buyback`, `move`) tagged with a player id and a
  tick, applies them in tick order, and emits events. Every random number comes from the
  seeded RNG inside the sim. Same seed + same command log = same night. This is what makes
  co-op a transport problem instead of a rewrite: the host runs the sim, peers send commands,
  the host broadcasts the command log.
- One system per file in `src/sim/systems/`, fixed order in `Game.ts`: clock → movement →
  tables (each table a module with `odds`, `resolve`, `lossCost`) → marks → lives and souls →
  cage → collector (phase, Circuit, wheels) → economy → stats.
- Content is typed data in `src/data/` (tables, charms, upgrades, marks, wheels, floors, the
  Circuit rules per floor). A validation test checks cross-references, that **every number has
  a `derivation` string** naming a `DESIGN.md` section, that every table's RTP matches its
  `pays × p` within 0.5%, and that **every charm declares effects on at least two systems**
  (pillar 3).
- The renderer and panels are presentation: `src/render3d/`, `src/panels/` (2D canvases),
  `src/hud/`, `src/app/` (title → lobby → night → results). Panels send commands; they never
  touch sim state.
- Saves: settings and meta (upgrades, best floor) only; a night is not saved mid-way in the
  slice (the command log makes a replay possible later).

## Definition of done (every milestone, every PR-sized change)

1. `npm run typecheck` clean, `npm test` green (sim, data validation, pace tests on 20 seeds).
2. `npm run screens` run and the overlap report inspected for every panel and the HUD.
3. For anything the player sees: a Playwright screenshot taken and **looked at** (Read the PNG).
4. For anything that changes a number: the derivation updated in `DESIGN.md`, and the pace
   test that encodes the lesson still passes or is updated with the reasoning written down.
5. `PROGRESS.md` and `HANDOFF.md` updated; `DECISIONS.md` if a decision was made; one commit
   with a message that says what and why.

## Standing instructions

- **Slice first.** Nothing from Milestone 3 onward until Milestone 2's gate is passed.
  Ideas go to `IDEAS.md`.
- **Flag anything derivative.** Buckshot Roulette, CloverPit and Gamble With Your Friends are
  references for one quality each and nothing else; if a mechanic, table, item, number, name
  or UI you are about to write resembles one of them (or any other shipped game), stop, say so
  in chat and `DECISIONS.md`, and re-derive it from the model or drop it.
- **Odds are always printed.** Every table panel shows tier, win chance, payout and loss cost
  before a bet can be placed. A "Blackout" team mark is the only thing that may hide them, and
  it says that it is doing so.
- **No real-money anything**, ever, in any form, including cosmetics. Don't propose it.
- **Every charm touches two systems. Every table has a tier color. Every risk is shown.**
- Play the build with the bots before asking for a review; send screenshots of: the room from
  the door, a Hi-Lo loss handing out a mark, Red Line's third loss, the lights dropping at
  0:00, a Circuit overload, the Boon wheel.
- Ask before: changing the tier rule (RTP up, loss cost up), the currency list, the night
  length, the quota curve, the resolution, or the milestone order. Everything else: decide,
  write it down, move on.

## Agents (in `.claude/agents/`)

- `indie-critic`: reviews against the pillars, the removal test and the not-list; plays the
  build and does the RTP arithmetic itself. Knows co-op party games, roguelikes and casino
  design. Runs at every milestone and the Milestone 2 gate.
- `art-director`: owns `STYLE.md`; builds models by script through the Blender MCP; pixel
  textures through the pipeline; never copies a reference.
- `qa-screens`: screenshot sweep, panel and HUD overlap audit, pixel-diff report.
- `balance-auditor`: recomputes every derived number in `DESIGN.md` §3–§8 from `src/data`
  and reports any lesson that no longer holds.

## Environment notes

Windows. Node 22+: either installed normally, or (on the original owner's PC) a portable copy at
`C:\Users\jacks\tools\node-v22.20.0-win-x64`, not on PATH; the `.bat` files use whichever exists,
and `HANDOFF.md` has the PATH line for a terminal. The engine layer was extracted in Milestone 0,
so the Sprocket & Sprout folder and the read-only projects above exist only on the original
owner's PC; nobody else needs them. PixelLab MCP and Blender MCP are optional (art is drawn with
the pixel-art-studio skill). Tokens never go in the repo (it is public). Say what you spent from
the PixelLab budget in `PROGRESS.md`. The repo is `github.com/ycgNem/the-vig`; every push to
`main` deploys to https://ycgnem.github.io/the-vig/.
