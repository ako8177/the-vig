# The Vig

A first-person co-op casino roguelike. You're trapped in an underground casino; every night the
Collector wants more. Gamble a shared bank up to the quota, buy charms that bend the odds, then sit
at the Collector's table for a game that can kill you. **Safety is a slow loss**: the safe tables
bleed you, the risky ones pay, and the price of losing climbs from money to marks to lives.

**Play the current build: https://ycgnem.github.io/the-vig/**
(Chrome, Edge or Firefox on a PC. Click to step onto the floor; WASD walk, mouse look, E to sit at a
table, E or Esc to stand.)

## Where it's at

Milestone 0 is done: the room, walking, the neon signs, sitting at Hi-Lo and reading its odds card,
the HUD. Nothing is playable as a game yet: no bets, no clock, no Collector. Milestone 1 builds the
single-player slice (three nights on floor 1). See `ROADMAP.md` for the plan and `PROGRESS.md` for
what exists.

## Run it on your own PC

1. Install **Node.js LTS** (22 or newer) from https://nodejs.org.
2. Get the code: `git clone https://github.com/ycgNem/the-vig.git` (or **Code → Download ZIP** on
   GitHub and unzip it).
3. Double-click **`Play.bat`**. The first run installs the tools (a minute), then your browser opens
   the game at http://127.0.0.1:5180.

Other buttons: `Package for web.bat` zips a build for itch.io; `Build desktop app.bat` makes a
Windows installer.

In a terminal: `npm install`, then `npm run dev` (play), `npm test`, `npm run typecheck`,
`npm run build`. With the dev server running: `npm run shots`, `npm run screens`, `npm run perf`,
`npm run e2e` (they drive Chrome with software WebGL and write to `e2e/out/`).

## Working on it (with Claude Code)

This project is built with Claude Code, and the docs are written for it as much as for people.
Open the folder in Claude Code and it reads `CLAUDE.md` first, which tells it to read the rest in
order:

| File | What it is |
|---|---|
| `PLAN.md` | the pitch, the pillars, what the game is not |
| `DESIGN.md` | every number and where it comes from |
| `THREEJS-NOTES.md` | the 3D rules |
| `ROADMAP.md` | the milestones, in order |
| `STYLE.md` | the art bible (TanoPal 48, tier colors, neon rules) |
| `PROGRESS.md` | what's built |
| `DECISIONS.md` | every decision and why |
| `HANDOFF.md` | where the last session stopped and what's next |
| `START-HERE.md` | the prompts for each milestone |

To continue: open Claude Code in this folder and say "read HANDOFF.md and carry on", or paste
**Prompt 1** from `START-HERE.md` to build Milestone 1.

Art is drawn by script with the pixel-art-studio skill (`pixel-art/vig-room/build.py`, needs Python
with Pillow); models will be scripted through the Blender MCP. Both are optional for playing.

## Publishing

Every push to `main` runs the tests, builds the game and publishes it to the link above
(`.github/workflows/deploy.yml`, GitHub Pages). It takes about a minute.

## Rules this project keeps

No real-money anything, ever. Odds are always printed before a bet. The sim is pure and
command-driven so co-op is a networking job, not a rewrite.
