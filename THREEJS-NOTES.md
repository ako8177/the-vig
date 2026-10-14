# Three.js notes — The Vig

Read every session. First person, a floor of connected rooms (floor 1: three; DECISIONS #65), tables you walk up to.

## What Three.js is, in a paragraph

A scene graph on WebGL. A `Scene` holds `Object3D`s (meshes = geometry + material, lights,
groups), a `Camera` looks at it, a `WebGLRenderer` draws it each frame. Units are ours
(**meters**), **Y is up**, a camera looks down its own −Z. Ships with TypeScript types;
`npm i three`; Vite needs no config. Pin the version at setup, record it in `DECISIONS.md`,
and read `node_modules/three/src` and threejs.org/docs for that version rather than memory.

## The rules

1. **Three.js lives only in `src/render3d/`.** `src/sim` is pure, deterministic and
   command-driven (see `CLAUDE.md`); the renderer reads state and events and never writes.
2. **First person, walk-and-use.** `PointerLockControls`-style mouse look (write our own: yaw
   on the body, pitch on the camera, pitch clamped ±70°), WASD walk at 3 m/s, no jump, capsule
   vs. the room's axis-aligned colliders. Eye height 1.6 m. Pointer lock on click; Esc pauses.
3. **Tables are interactables.** Each table has a use volume; walking into it and pressing E
   (or clicking) **seats** you: the camera eases to the table's seat transform, the mouse is
   released to a cursor, and the table's 2D panel takes input. E or Esc stands up. Nothing in a
   table UI is 3D-picked; the panel is a canvas.
4. **Table panels are CanvasTextures.** Each table's screen is a 2D canvas drawn by the IMGUI
   kit (reels, cards, dice, odds, the loss cost, the tier badge, the bet) and mapped onto the
   table's screen mesh as a `CanvasTexture` with `NearestFilter`; `needsUpdate = true` only on
   frames the panel changed. The HUD (clock, bank, quota, lives, souls, markers, marks) is a
   full-screen 2D canvas overlay. One UI code path for both.
5. **Internal resolution 640×360**, nearest-upscaled by whole numbers, letterboxed.
   `renderer.setPixelRatio(1)`. Pass order: scene → **bloom** (`UnrealBloomPass`, threshold
   high enough that only emissives bloom: neon, screens, the Collector's eyes) → pixel pass →
   upscale. This is the one project that earns bloom.
6. **Look.** Low-poly, pixel textures at 64/128 px with `NearestFilter` and no mipmaps,
   `MeshLambertMaterial`; a dark room with few lights: one dim hemisphere, one `PointLight` per
   table cluster (≤ 8 point lights total), emissive neon strips and screens doing the rest. No
   shadows except blob decals under tables and avatars. Palette: Resurrect 64 for textures;
   neon colors are the tier colors: **low = green, mid = amber, high = red, Collector = violet**,
   used everywhere the tier appears (felt trim, sign, panel badge, HUD).
7. **Tier legibility from across the room** (pillar 5): every table's neon sign shows its tier
   color and a one-glyph loss icon (coin / mark / skull), readable at 640×360 from 10 m. A
   player must be able to pick a table by its sign alone.
8. **Avatars** (co-op, Milestone 3; the slice draws your own hands only): a floating mask with
   two hands, no skeleton, bobbing with movement, tinted per player, a ghost version
   (translucent, desaturated, a chain at the wrist). Nameplates as pixel-font sprites.
9. **The Collector's table** is the room's center; at 0:00 the camera is pulled to its seat
   and the room's lights drop except violet. The Circuit panel is a CanvasTexture like any table.
10. **Positional audio**: a `PositionalAudio` per table (reel spin, chip clink, dice) and one
    for the Collector; the room has a non-positional bed that drops at 0:00. The S&S synth and
    jsfxr bank supply the sounds.
11. **Models by script** in `art/<family>/build_*.py` through the Blender MCP, exported `.glb`;
    nothing hand-edited. Families: room (floor, walls, pillars, bar, cage), tables (six + the
    Collector's), props (chips, cards, dice as instanced meshes), avatar (mask, hands), the
    Collector (a seated figure: coat, hands, mask; rigid parts, no skeleton). Budgets: ≤ 1.5k
    triangles per table, ≤ 40k on screen, ≤ 80 draw calls, 15 MB total.
12. **Dispose** on floor change and on run end.
13. **Perf**: 60 fps on the owner's PC; ≥ 15 fps in headless SwiftShader.

## Testing

Sim tests and the table/Circuit/Collector bots run headless (`npm test`). Playwright launches
Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`
(Claude confirms the flags on first run and writes `e2e/launch.mjs`); `e2e/shots.mjs` replays a
seeded command log to fixed moments (the room from the door, seated at Hi-Lo mid-roll, Red
Line's third loss, the Collector's table at 0:00, the Circuit mid-game, the Boon wheel) and
screenshots each; pixel-diff against baselines; the overlap audit runs on every panel canvas and
the HUD. `e2e/coverage.mjs` lists every model and texture requested.

## Not good ideas (for Milestone 1)

Physics engines (the room is boxes), skeletal animation, real shadows, a free third-person
camera, voice chat, a server, in-app purchases of any kind, hiding odds for "mystery".

## Since floor 1 became three rooms (DECISIONS #65, #68)

- Draw only the rooms you can see: each room is its own merged group, shown (and its point lights
  on) when you're in it or within 9 m of its arch. Two point lights a room, eight at most in all.
- Merged meshes are centered on their own middle so the renderer sorts them front to back.
- The glow pass blocks neon with the rooms' shells only (`userData.occluder`), not the furniture.
- No canvas re-upload every frame: a panel or screen that only shows a clock redraws once a second.
- The crowd (`src/render3d/npcs.ts`) is one instanced draw posed at 30 Hz.
