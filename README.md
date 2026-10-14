# The Vig

A first-person co-op casino roguelike. You're trapped in an underground casino; every night the
Collector wants more. Gamble a shared bank up to the quota, buy charms that bend the odds, then sit
at the Collector's table for a game that can kill you. **Safety is a slow loss**: the safe tables
bleed you, the risky ones pay, and the price of losing climbs from money to marks to lives.

**Play the current build: https://ako8177.github.io/the-vig/**
(Chrome, Edge or Firefox on a PC. NEW RUN, then click to step onto the floor; WASD walk, mouse look,
E to sit at a table, open the cage or order at the bar, E or Esc to stand. Make the quota by 0:00.)

## Where it's at

Milestone 1 is done: a playable single-player slice. Three six-minute nights on floor 1, six tables
with printed odds (the Bandit, Twenty-One, Hi-Lo Dice, the Wheel of Marks, Red Line, Dead Man's
Hand), marks, lives, the cage (charms and permanent upgrades), the Collector at 0:00 (pay, or
gamble on the Circuit for the Boon or the Bane), and a results screen. Since then:

- **The feel pass**: every table animates (dice on green baize, a shuffle and flip, a real wheel,
  scrolling reels); wins scale up to BIG WIN and JACKPOT; lounge music.
- **A beautiful first floor**: three rooms by risk. THE FLOOR (low tables, slot banks, a jackpot
  carousel, roulette, the bar, the cage), THE LOUNGE (mid tables) and THE BACK ROOM (high tables
  and the Collector). A crowd of 52 plays, drinks, smokes and watches you; the bar's drinks make
  you drunk (a MILD setting softens it).

Next, the owner's plan: a house before the casino (a computer shop for charms, delivered by post,
a car to drive there), then more floors unlocked by money with new games. No co-op yet. See
`ROADMAP.md` for the plan and `PROGRESS.md` for what exists.

## Run it on your own PC

1. Install **Node.js LTS** (22 or newer) from https://nodejs.org.
2. Get the code: `git clone https://github.com/ako8177/the-vig.git` (or **Code → Download ZIP** on
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
