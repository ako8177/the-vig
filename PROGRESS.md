# Progress — The Vig

What is built. Newest first.

## 2026-10-15 — Rolling reels, a dealt shoe, the pit boss, the wake-up

The owner's fourth notes (DECISIONS #83, #84): reels that land on what they show; the Wheel's
multiples on its wedges; Twenty-One slower, dealt from a visible shoe by the table's dealer; a
"wins show all of it" setting; smoother crowd talk and spoken Collector lines; reworded choice
cards and no grid flash; a slow death, the pit boss dragging him out the staff door; fade to black
and wake up at home; hover descriptions for statuses; booth and card-table NPCs fixed; drinks a
minute each; markers for charms only (skill tree and charm ideas in IDEAS.md). Checks: typecheck,
34 tests, screens sweep 0 issues, smoke green, the death and pit boss played and looked at.

## 2026-10-14 — The Collector's table: the lever duel, his death, the cinematic

The owner's design (DECISIONS #80-#82): at 0:00 you sit across from the Collector; he speaks; pay,
or challenge him. The table turns over to ten levers wired to a battery; you take turns pulling;
a live lever shocks whoever pulled it (lightning on your screen, a scream; he convulses). Two
shocks kill him: you keep the quota, spin the Boon (a real wheel now), and the next night a new
Collector sits down. Two for you: a life, the quota, the Bane. Killing a Collector unlocks his
charm for good (the first's: the Insulated Kit, two free wire traces); the run's ending counts
the dead. Checks: typecheck clean, 34 tests (duel and house sim tests, pace tests 5 and 6
re-derived), screens sweep 0 issues, e2e smoke green, the scene played headless and every beat
looked at (the choice, the flip, both shocks, his death, your loss, the wheel).

## 2026-10-14 — The owner's big batch: tables, sprint, drinks, a playing crowd, the house

From the owner's third round of notes (DECISIONS #72-#79), each its own commit:

- **Mouse look** takes raw input and drops the browser's bogus jumps (#72).
- **Shift sprints** at x1.7 (#73).
- **The Wheel of Marks pays by color**: red 1.5x, purple 2.5x, gold 6x, black half back, marks;
  RTP 1.16, ahead 48% (was a flat 1.6x on 72%) (#74).
- **The Bandit is a 3x3 grid**: 8 lines, corners, the whole grid; RTP 0.9504 enumerated (#75;
  flagged as CloverPit-derived at the owner's request).
- **Twenty-One deals from a real 6-deck shoe** with double and split; basic strategy 0.9921 (#76).
- **Drinks give an edge**: a few percent at one tier while the buzz lasts (#77).
- **The crowd plays its games** on the felt (cards, chips, dice, the roulette ball) **and talks**
  (synthesized murmur, louder as you walk up) (#78).
- **The house**: the run starts at home and comes back after every Collector; the family, the
  computer's shop by post to the mailbox, the car to the casino (#79).
- Checks: typecheck clean; 31 tests green (a new house sim test; pace test 3 re-derived, #73);
  screens sweep 25 surfaces, 0 issues; e2e smoke green; screenshots looked at for every table
  panel, the bar, the crowd's games, and the house inside and out. No PixelLab spend.

## 2026-10-14 — The owner's second look: glow through panels, card sounds, the crowd

The owner's notes from playing the three-room floor, fixed (DECISIONS #69-#71):

- **Neon no longer shows through things.** The bloom pass blocked glow with the walls only, so a
  table's rim neon and the signs drew across the odds cards and bet buttons. Each room's solid
  meshes now bake into one black blocker for that pass; the crowd blocks too.
- **Twenty-One sounds like cards.** The deal goes card by card (you, dealer, you, hole), hits slide
  in, the hole card flips at the stand and the dealer draws one card at a time, each with a snap.
- **The crowd cleaned up.** Jointed figures with elbows, knees, hands, shoes, eyes and proper hair;
  dealers in vests; chairs for card players; slot players on their stools. Off-screen people aren't drawn.
- **Mouse look no longer skips** (#72): raw pointer-lock input, and the browser's bogus jumps dropped.
- Checks: typecheck clean, 29 tests green, screens sweep 25 surfaces with 0 clashes, seated
  screenshots of the Bandit, Twenty-One, Hi-Lo and the Wheel and crowd close-ups looked at. Perf
  under SwiftShader is 9.8-11.1 fps against 10.6-11.6 for the previous commit on this PC today
  (both under the 15 fps budget here; #68 measured 19-20 on a faster day). No PixelLab spend.

## 2026-10-14 — A beautiful first floor (the owner's direction)

The owner set a bigger plan (PLAN.md, "The owner's direction"; ROADMAP): a house before the casino,
floors unlocked by money with new games, rooms by risk, a living crowd, a bar. Built now, floor 1
(DECISIONS #65-#68):

- **Three rooms**: THE FLOOR (entrance, the Bandit and Twenty-One, the bar, the cage, slot banks,
  a slot carousel round a jackpot tower, a spinning roulette wheel, card tables, chandeliers,
  marble pillars, an indigo-and-gold carpet, cream damask, a coffered ceiling, a VIG sign over the
  door); THE LOUNGE through the left arch (Hi-Lo, the Wheel, booths, a piano, craps, pink coves);
  THE BACK ROOM through the right arch (Red Line, Dead Man's Hand and the Collector under bare bulbs,
  dark planks, smoke). Ten new textures and three signs (`pixel-art/vig-room/build.py`).
- **A crowd of 52** (`src/render3d/npcs.ts`): slot and table players, dealers, a bartender,
  drinkers, smokers, a pianist, walkers, and railbirds who turn to watch you and cheer or groan at
  your results. Presentation only; one instanced draw.
- **The bar**: E at the counter; four drinks ($40-$500) for a buzz up to 180 s: the picture swims
  and doubles, the camera sways, your walk wanders. DRUNK EFFECTS: FULL / MILD in settings. New
  command `order`, event `drank` (DESIGN.md §10).
- Perf held at 19-20 fps headless, 52 draw calls (rooms you can't see aren't drawn).
- 29 tests; e2e 13/13; screens 25 surfaces, 0 issues; shots (door, lounge, back room, floor) clean.
  Pace: all §8 lessons hold; Red Line's edge over the mid rotation is now a tie (watched in §8).

## 2026-10-13 — The feel pass (after the owner's playtest)

The owner: "gambling games need to be engaging and grabbing", the room had "a constant static
noise", and a win should feel and look big. Now (DECISIONS #60-#64):

- **Every table is a small show** timed to its sound (`src/data/feel.ts`, `src/panels/fx.ts`,
  `src/app/sounds.ts`): Hi-Lo's die rattles, is thrown onto a green baize tray, bounces five times
  (a felt thud each) and settles; Dead Man's two dice land a beat apart; Red Line riffle-shuffles,
  deals and flips the card; the Wheel of Marks is a real big-six wheel with a chasing lamp rim and
  a peg clacking past the pointer as it slows; the Bandit's reels scroll and clunk to a stop.
- **Wins scale**: a gold flash, the amount popping and sparkles on any win; BIG WIN (≥ $700 net: a
  banner, a coin shower, a fanfare); JACKPOT (≥ $4,000 or 7-7-7: a white flash, a long coin shower,
  the room shakes). Losses thud and flash the rim; a lost life flashes blood with a heartbeat.
- **The static is gone**: two original lounge tracks on the song player (ducking at 0:00), a
  distant machine paying out across the floor now and then, a MUSIC volume in settings.
- Playwright 1.63.0 (Edge 155 broke 1.48). 29 tests; e2e 13/13; screens 23 surfaces, 0 issues.

## 2026-10-12 — Milestone 1: the playable slice (single player, floor 1, three nights)

**A run, end to end**: title (new run, how to play, settings, the record) → click onto the floor →
six tables you walk up to and sit at → the cage on the east wall → 0:00: the lights drop and you are
pulled to the Collector's table → pay or gamble → the Circuit → the Boon or Bane wheel → the night's
summary → night 2, night 3 → results (won, or out of lives). About 20 minutes.

**Sim** (`src/sim/`, pure, seeded, command-driven; replay test still exact): the clock and phases
(floor → midnight → choice → circuit → wheel → summary → over); the six tables as modules in
`src/sim/tables/` with exact odds by enumeration (Twenty-One by dynamic programming over an endless
shoe); marks (Hi-Lo's personal stacks, the Wheel's four team marks) counting table time only; lives,
the ghost and the solo run end; the cage (four charms, three permanent upgrades, buybacks); the
Collector: shortfall, pay, gamble, the Circuit (`src/sim/circuit.ts`), the wheels; the economy
between nights (overshoot markers, the bank floor, the next quota). Two new commands: `fortune`,
`ready` (DECISIONS #33).

**Data** (`src/data/`): `economy.ts`, `marks.ts`, `charms.ts` (charms and upgrades), `wheels.ts`,
`circuit.ts`, and `tables.ts` with the M1 numbers; every number names its DESIGN.md section.

**Presentation**: a panel per table (`src/panels/games.ts`) under one shared odds block
(`src/panels/table.ts`: tier, win chance, payout, loss cost, return per $1, your payout factor right
now; Blackout says it is hiding them), the Collector's screen on his felt (`src/panels/collector.ts`:
the choice with both prices printed, the Circuit, the wheels, the summary); the HUD
(`src/hud/hud.ts`): clock, bank and quota, lives, souls, markers, charms, Overclock, marks, the seat
and cage prompts, toasts, banners, lesson cards, title, how to play, settings, the cage, pause,
results. The 0:00 light drop (`setMidnight` in room.ts). Synthesized sounds for every event and a
room bed that thins at 0:00 (`src/engine/audio/audio.ts`; the jsfxr bank is still Milestone 7).
Settings and meta (upgrades, record, lessons seen) in localStorage.

**Balance** (DESIGN.md §2-§8; DECISIONS #38-#42, #49-#57): the pace bots measured the design and
numbers moved: the Bandit's top line (75× → 12×, RTP unchanged), Hi-Lo marks tax Hi-Lo only, the
start bank $1,500, a life per $2,000 short; after the reviews the charms were made honest (Overclock
doubles stakes; Lead Apron and Lucky Fuse no longer generate lives) and the Circuit became
positional (he takes the lowest circuit he trusts; 10 circuits; a sensible team wins 48%). A
sensible solo bot that pays every night survives all three 38% of the time and dies on night 1
6.5%. Open for the owner: the lost gamble's quota surcharge (paying beats gambling today), the
last-night shortfall rule, two derivative flags (DECISIONS #56-#58).

**Tests**: 28 (sim, data validation with exact RTPs and a 100k-round check, the seven pace tests on
200 seeds, the Circuit on 400; about 10 s). `npm run e2e` 13/13 (title → a run → a round → 0:00 → pay → night 2).
`npm run screens` 23 surfaces, 0 clash / 0 overflow; `npm run shots` adds the 0:00 view; perf under
SwiftShader 20.6 fps (budget 15), within the draw-call and triangle budgets.

**Not done**: Blender models (no Blender MCP here; placeholder geometry, which ROADMAP allows).
PixelLab spend: 0.

**Playtests**: a user-level `indie-dev-critic` agent (`~/.claude/agents/indie-dev-critic.md`) played
the M0 build (11 findings, all fixed) and the M1 build (5.5/10: no crashes, no soft-locks, every
payout matches its printed odds; 14 findings, 13 fixed, F3 left to the owner). The project's
`indie-critic` reviewed the design against §9: Q4 (readable odds) yes at a table; Q1 not yet within
a night; Q2 and Q3 not yet (charms were degenerate, now fixed; paying still beats gambling).

## 2026-10-12 — Milestone 0: foundation and the room (done)

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

**Data**: `src/data/palette.ts` (TanoPal 48 and its role cast, the tier colors; STYLE.md),
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
felt, wood, brass, ceiling, cage bars, door, seven signs) into `public/tex/tano48/`.
PixelLab spend: 0. **STYLE.md** written from the owner's pick (TanoPal 48, mid tier cast yellow).

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

**Palette test**: three casts at 10 m (Resurrect 64, R64 teal-low, TanoPal 48); the owner picked
TanoPal 48; mid recast yellow so all four tiers read apart (DECISIONS #21, #29).

**Left for the start of M1** (owner's choice): DESIGN.md updated for DECISIONS #8-#11.

## 2026-10-12 — Planning

- PLAN, DESIGN, THREEJS-NOTES, CLAUDE, ROADMAP, START-HERE, HANDOFF, DECISIONS, IDEAS written. No code.

## Milestones

| Milestone | Status |
|---|---|
| M0 — Foundation and the room | done 2026-10-12 |
| M1 — The slice (single player, floor 1, three nights) | done 2026-10-12 (Blender models deferred) |
| M2 — The gate | not started |
| M3 — Co-op | waiting for the gate |
