# Start here — The Vig

## What you have

`PLAN.md`, `DESIGN.md`, `THREEJS-NOTES.md`, `CLAUDE.md`, `ROADMAP.md`, this file, and seeded
`DECISIONS.md`, `PROGRESS.md`, `HANDOFF.md`, `IDEAS.md`. `STYLE.md` is written in Milestone 0
after a neon-and-palette test.

## Two things to know before you start

**Co-op is the expensive part, and it is Milestone 3 on purpose.** A browser game on GitHub
Pages has no server, so friends connect peer-to-peer over WebRTC (Trystero does the signaling
without a server of yours). That works, but it only works cleanly if the game is built so that
the simulation takes *commands* and never raw input, and every dice roll comes from a seeded
RNG. `CLAUDE.md` makes that an architecture rule from the first commit, which is why the slice
can be single player without painting you into a corner. Do not let a session "add multiplayer
quickly" before the gate.

**The design's spine is the tier rule: RTP rises with the tier, and the price of losing rises
from money to marks to lives.** `DESIGN.md` derives every table from it and shows why night 1
cannot be made at the safe tables. Read §3 as a gambler before Prompt 0; if a table's odds feel
wrong to you, change them there and write why. That is the part the docs can't decide for you.

## By hand (10 minutes)

1. Keep or change the name. Check itch.io, Steam and the domain before the first public build.
2. `git init` in this folder. Create the GitHub repo after Milestone 0, not before.
3. You now have several planned games. Pick one to take to its slice gate first.

## Prompt 0 — Milestone 0: foundation and the room

```
Read PLAN.md, DESIGN.md, THREEJS-NOTES.md, CLAUDE.md and ROADMAP.md in that order before
doing anything. Then do Milestone 0 only.

The other game folders in C:\Users\jacks\Documents (sprocket-and-sprout, candlepower,
trotline, slipstream-salvager, slipstream-salvager-3d) are read-only: never write, commit or
run npm in them. Extract this repo's engine layer from sprocket-and-sprout exactly as CLAUDE.md
lists (engine, font, IMGUI kit, overlap audit, e2e harness, deploy workflow, .bat files,
Electron, vite/vitest/tsconfig, package.json scripts), strip every Sprocket & Sprout name,
string, color alias and asset, and copy nothing from its sim, data, app, renderer or art.
You may read slipstream-salvager-3d/THREEJS-NOTES.md for the first-person camera, pixel pass
and SwiftShader notes.

Then:
1. Install three, pin the release, record it in DECISIONS.md. Build src/render3d/ per
   THREEJS-NOTES.md: the 640x360 render target, bloom then pixel pass then whole-number
   upscale (show me the same view with each pass toggled), first-person walk with pointer
   lock, pitch clamp and capsule-vs-box collision, and the dispose path.
2. Floor 1's room from code-built geometry with pixel textures: 24x16 m, a bar, the cage, six
   table footprints with neon signs in the four tier colors (green low, amber mid, red high,
   violet Collector) and a one-glyph loss icon each (coin / mark / skull), the Collector's
   table at the center, at most 8 point lights plus emissive strips. Check from the door at
   640x360 that every sign's tier reads at 10 m.
3. The panel system: a 2D canvas drawn by the IMGUI kit, mapped onto a table's screen as a
   CanvasTexture with NearestFilter, updated only when it changes; one table (Hi-Lo) showing a
   static odds card (tier, win chance, payout, loss cost, bet). The seat/stand interaction:
   E to sit (camera eases to the seat, cursor released, panel takes input), E or Esc to stand.
4. The HUD overlay: clock, bank, quota, lives, souls, markers, active marks, with placeholder
   values from a stub sim state.
5. src/sim/ scaffold: the command type, the seeded RNG, Game.ts with the system order from
   CLAUDE.md and empty systems, the event queue, and a test that a replayed command log
   produces an identical state hash.
6. Copy .claude/agents/ from sprocket-and-sprout (art-director, indie-critic, qa-screens) and
   rewrite each for The Vig from PLAN.md and CLAUDE.md, including the standing instruction to
   flag anything derivative of Buckshot Roulette, CloverPit or Gamble With Your Friends; add
   balance-auditor. Have the art director run the neon-and-palette test from ROADMAP.md
   (one table per tier color seen from 10 m) on two candidate palettes, show me the
   screenshots, and wait for my pick before writing STYLE.md.
7. e2e/launch.mjs with the SwiftShader flags that work on this Chromium, e2e/shots.mjs (the
   room from the door; seated at Hi-Lo; the Collector's table), e2e/perf.mjs (fps, draw calls,
   triangles). Run them and look at every screenshot yourself before showing me.

Finish with typecheck and tests clean, the screens report inspected, PROGRESS.md and
HANDOFF.md describing exactly what exists, DECISIONS.md with the first entries, one commit.
Stop there. Do not begin Milestone 1.
```

## Prompt 1 — Milestone 1: the slice (after STYLE.md exists)

```
Read HANDOFF.md, PLAN.md, DESIGN.md, THREEJS-NOTES.md, CLAUDE.md, STYLE.md, ROADMAP.md,
DECISIONS.md and PROGRESS.md. Build Milestone 1, the single-player slice, exactly as DESIGN.md
specifies and nothing more. Same read-only rule for the other game folders.

Order of work, each step tested and committed before the next: (1) the clock, the bank, the
quota curve, and the table module interface (odds, resolve, lossCost) with the data validation
test enforcing derivation strings, the RTP check and the two-systems charm rule; (2) the six
floor-1 tables as sim modules with unit tests that measure their RTP over 100k seeded rounds
within 0.5% of DESIGN.md §3; (3) marks and team marks with their timers and stacking; (4) Red
Line and Dead Man's Hand deaths, the ghost state, and the single-player run-end rule; (5) the
cage: markers, the three charms and three upgrades, with the Lead Apron + Overclock flip as a
test; (6) the Collector phase: shortfall lives, pay or gamble, the Circuit on floor-1 rules
with the Collector bot from DESIGN.md §6, the Boon and Bane wheels, the next-night quota math;
(7) three nights, results, restart, title, settings; (8) the seven pace-test bots from
DESIGN.md §8 on 20 seeds; (9) the panels for all six tables and the Circuit as CanvasTextures,
the 0:00 lighting drop, the wheels as panels, the four lesson cards; (10) placeholder geometry
replaced by models built by script through the Blender MCP within the budget in PROGRESS.md.

Rules: every number carries a derivation; if a DESIGN.md number produces a lesson that doesn't
hold (for example the safe-only bot makes night 1 on more than 1 of 20 seeds), don't tune
silently: write the new derivation in DESIGN.md, explain it in DECISIONS.md, then change the
data. Every table panel shows tier, win chance, payout and loss cost before a bet is possible.
If you catch yourself writing something that resembles Buckshot Roulette, CloverPit, Gamble
With Your Friends or any other shipped game, stop and tell me. Do not add networking.

Send me screenshots at: the room from the door, a Hi-Lo loss handing out a mark, Red Line's
third loss, the lights dropping at 0:00, a Circuit overload, the Boon wheel. Finish with the
Definition of Done, PROGRESS.md and HANDOFF.md updated, then run the indie-critic against
DESIGN.md §9 and paste its ranked findings. Do not start Milestone 3.
```

## After the slice

Play three nights yourself, then have a friend play while you watch and argue with them about
pay-or-gamble. That argument is the game; if it doesn't happen with one person at the keyboard
and one over their shoulder, co-op won't create it. Then read the critic's report and decide
the gate.
