# The Vig — Roadmap

Each milestone ends with the Definition of Done in `CLAUDE.md`. **Nothing from Milestone 3
onward starts until Milestone 2's gate is marked passed below.**

## Milestone 0 — Foundation and the room

Extract the engine layer from Sprocket & Sprout (loop, rng, input, audio, sfxr, music, font,
IMGUI kit, overlap audit, e2e harness, deploy workflow, `.bat` files, Electron, vite/vitest/
tsconfig). Strip every S&S name. Install and pin three. Build `src/render3d/`: the 640×360
target, bloom → pixel pass → upscale, first-person walk with pointer lock and capsule
collision, one room (floor 1: 24 × 16 m, a bar, the cage, six table footprints and the
Collector's table at the center) from code-built geometry with pixel textures, ≤ 8 point lights
plus neon emissive strips in the four tier colors, the HUD overlay with placeholder values,
one table with a CanvasTexture panel showing a static odds card, the seat/stand interaction.
Copy and rewrite the three agents; add `balance-auditor`. Art director runs a palette and neon
test (one table in each tier color seen from 10 m at 640×360) and writes `STYLE.md` after the
owner picks.

Exit: walk the room, sit at a table, see its panel, stand up; `npm test` green on an empty sim;
`npm run screens` reports; the workflow deploys (inert until the repo exists); `PROGRESS.md`,
`HANDOFF.md`, `DECISIONS.md` have their first entries.

## Milestone 1 — The slice (single player, floor 1, three nights)

Exactly `DESIGN.md`: the clock, the shared bank (one player), six tables with printed odds and
loss costs, marks and team marks, Red Line and Dead Man's Hand deaths, the ghost state (in
single player: the run ends, since no one can buy you back; the soul rule is shown), the cage
with markers, the three charms and three upgrades, the Collector at 0:00, shortfall lives, pay
or gamble, the Circuit on floor-1 rules against the Collector bot, the Boon and Bane wheels,
three nights with the ×1.5 curve, run end and results, title and settings. The seven pace
tests in `DESIGN.md` §8 as the bots (safe-only, mid-rotation, Red Line burst, Dead Man's,
Circuit team, Collector's choice, ghost buyback) on 20 seeds. Placeholder models are fine; tier
colors, printed odds and the three readability screenshots are not optional.

Exit: a new player finishes or loses a three-night run in 15–20 minutes with a two-line title
and lesson cards at: first mark, first team mark, first blood-table warning, 0:00. Pace tests
pass. Screenshots in `e2e/out/`, looked at.

## The owner's plan (2026-10-13): reordered at the owner's word

Floor 1's three rooms, the crowd and the bar are built (DECISIONS #65-#68). Next, in the owner's
order (each to be specified in DESIGN.md before it's built):

1. **The house** (built 2026-10-14, DECISIONS #79): the run starts there and comes home after each
   Collector; the family; the computer's shop (charms and upgrades for markers) by post to the
   mailbox; the car to the casino. Still to come: a second car, items beyond charms, the family
   having something to say.
2. **Floors by money**: winning enough opens the next floor down, with new games and higher
   limits. Games: blackjack, roulette, craps, slots, case opening, a peg-drop board, crash.
3. Then the gate (Milestone 2 below) on the bigger game.

## Milestone 2 — The gate

`indie-critic` reviews against `DESIGN.md` §9 and the not-list. The owner plays it, then a
friend plays it over the owner's shoulder (co-op isn't in yet; this is the proxy for the
argument). Either the model changes or the gate is marked passed here with the date.

**Milestone 1: done 2026-10-12** (placeholder models; the Blender pass was deferred: DECISIONS #48; the people are Blender-built since #86).

**Gate status: not yet passed.** Before the gate: the owner's open calls in DECISIONS #56-#58 and DESIGN.md §2/§7.

## Milestone 3 — Co-op

Trystero (WebRTC, no server; GitHub Pages stays the host). Lobby with a room code, 2–4
players, host-authoritative sim, peers send commands, the host broadcasts the command log with
tick stamps; late-join replays the log. Avatars (mask and hands), nameplates, ghost avatars with
the chain, the ghost's inspect turn, the team pick for whose turn it is at the Circuit, a
team vote (or host call) for pay/gamble and for shortfall lives. Reconnect within 60 s. A
network test that runs two headless clients against a headless host.

## Milestone 4 — Floors 2 and 3

New tables (a Baccarat-style high table; a "Marked Deck" mid table where marks are cards you
hold; a "Vault" low table with a tiny chance of a huge jackpot), floor-2 Circuit rule (overloads
damage the bank; 8 circuits, 3 overloaded), floor-3 rule (the Collector inspects), new charms
to 15 and upgrades to 8, new team marks, two more wheels' worth of boons and banes, a floor
transition elevator. The quota curve across floors derived in `DESIGN.md`.

## Milestone 5 — The Collector

A character: lines on sit-down, on pay, on gamble, on each overload, on a ghost; a fixed set of
rules he announces per floor; the violet lighting pass; his own positional voice (synth, not
recorded). He stands and deals the Circuit from the center of the ring, never seated across the
table from you (DECISIONS #28, #30: that framing reads as Buckshot Roulette's Dealer); his violet
eyes stay.

## Milestone 6 — Meta and runs

Run seeds shareable as a code; daily seed; a between-run board (best floor, nights survived,
souls bought); unlockable charms by achievement, never by purchase.

## Milestone 7 — Sound and juice

Reel spins, chip clinks, dice, the Hi-Lo call, the Red Line third-card dread, the 0:00 drop,
the Circuit activation and overload, the wheels; a room bed that thins as the clock runs down.

## Milestone 8 — Onboarding and UX

Lesson cards, settings (sensitivity, invert, volumes, shake, bloom off, colorblind tier
glyphs), key rebinding, controller.

## Milestone 9 — Balance and release

Bots on every floor and every charm; the balance auditor clean; perf on a weak laptop; README,
itch page, GitHub Pages at the final name; the Windows build.

## IDEAS.md

Everything else, one line each with why. Reviewed at each gate.
