// The app: wires input → commands → sim → events → view, HUD and panels. Milestone 0 drops you
// straight onto floor 1 (title → lobby → night → results arrive in Milestone 1 step 7).
import { CanvasTexture, Mesh, MeshBasicMaterial, NearestFilter, SRGBColorSpace } from 'three';
import { GameLoop } from '../engine/loop';
import { Input } from '../engine/input';
import { Audio } from '../engine/audio/audio';
import { Game } from '../sim/Game';
import type { Command } from '../sim/commands';
import { OPEN_TABLES } from '../sim/systems/tables';
import { FLOOR_1, USE_RADIUS } from '../data/floors';
import { TABLE_BY_ID } from '../data/tables';
import { activePalette, TIER_NAME, TIER_ROLE, type PaletteId } from '../data/palette';
import { View3D, type PassToggles } from '../render3d/view';
import { Textures } from '../render3d/textures';
import { buildRoom, recolorNeon, type Room } from '../render3d/room';
import { FirstPerson } from '../render3d/fpcam';
import { Hud, HUD_W, HUD_H } from '../hud/hud';
import { HiLoPanel } from '../panels/hilo';
import { PANEL_W, PANEL_H, type Panel } from '../panels/panel';
import type { Pointer } from '../ui/ui';

const ME = 0;

export class App {
  readonly input = new Input();
  readonly audio = new Audio({ master: 0.8, music: 0.6, sfx: 0.8 });
  readonly view: View3D;
  readonly tex: Textures;
  room: Room;
  game: Game;
  readonly fp = new FirstPerson();
  readonly hud: Hud;
  readonly loop: GameLoop;
  readonly panels = new Map<string, { panel: Panel; tex: CanvasTexture; mesh: Mesh }>();
  /** before the first click (pointer lock needs a user gesture) */
  started = false;
  paused = false;
  /** last sent walk intent, so a `move` goes out only when it changes */
  private sentMove = { mx: 0, mz: 0, yaw: 0 };
  private prev = { x: 0, z: 0 };
  private wasLocked = false;

  constructor(readonly canvas: HTMLCanvasElement, readonly hudCanvas: HTMLCanvasElement) {
    this.input.attach(canvas);
    this.view = new View3D(canvas);
    this.tex = new Textures(activePalette);
    this.room = buildRoom(this.view.scene, FLOOR_1, this.tex);
    this.hud = new Hud(hudCanvas);
    this.game = new Game({ seed: 1 });
    this.mountPanel(new HiLoPanel());
    const sp = FLOOR_1.spawn;
    this.fp.yaw = sp.yaw;
    this.prev = { x: sp.x, z: sp.z };
    this.layout();
    window.addEventListener('resize', () => this.layout());
    canvas.addEventListener('mousedown', () => {
      this.audio.unlock();
      if (this.fp.seated) return;
      this.started = true;
      this.paused = false;
      this.input.lock();
    });
    this.loop = new GameLoop(() => this.tick(), (dt, alpha) => this.frame(dt, alpha));
    this.loop.start();
  }

  private mountPanel(panel: Panel) {
    const mesh = this.room.screens.get(panel.table)!;
    const tex = new CanvasTexture(panel.canvas);
    tex.magFilter = tex.minFilter = NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = SRGBColorSpace;
    // a hair under 1.0 so the panel stays crisp under the bloom threshold
    mesh.material = new MeshBasicMaterial({ map: tex, color: 0xeaeaea });
    this.panels.set(panel.table, { panel, tex, mesh });
  }

  /** Size the HUD canvas over the letterbox. */
  private layout() {
    this.view.resize();
    const b = this.view.box.css;
    Object.assign(this.hudCanvas.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
  }

  private me() {
    return this.game.state.players[ME];
  }

  private send(cmd: Command) {
    this.game.submit(ME, cmd);
  }

  /** One sim tick (60 Hz): the walk intent goes in as a command, then the sim steps. */
  private tick() {
    if (!this.started || this.paused) return;
    const i = this.input;
    const fwd = (i.isDown('forward') ? 1 : 0) - (i.isDown('back') ? 1 : 0);
    const strafe = (i.isDown('right') ? 1 : 0) - (i.isDown('left') ? 1 : 0);
    const w = this.fp.seated ? { mx: 0, mz: 0 } : this.fp.walk(fwd, strafe);
    const yaw = Math.round(this.fp.yaw * 1000);
    const s = this.sentMove;
    if (w.mx !== s.mx || w.mz !== s.mz || (Math.abs(yaw - s.yaw) > 20 && (w.mx || w.mz))) {
      this.sentMove = { ...w, yaw };
      this.send({ t: 'move', ...w, yaw });
    }
    const p = this.me();
    this.prev = { x: p.x, z: p.z };
    this.game.step();
    for (const e of this.game.drainEvents()) {
      if (e.player !== ME) continue;
      if (e.t === 'sat') {
        const pl = FLOOR_1.tables.find((t) => t.table === e.table)!;
        this.fp.sit(this.view.camera, pl.eye, pl.look);
        this.input.unlock();
        this.audio.sfx('click');
      } else if (e.t === 'stood') {
        this.fp.stand(this.view.camera);
        this.input.lock();
      }
    }
  }

  /** The seat prompt: the table's name, then its tier, odds and loss cost (all from its data). */
  private promptFor(table: string) {
    const d = TABLE_BY_ID.get(table)!;
    const bet = typeof d.bet === 'number' ? d.bet : d.bet[0];
    const win = d.winP !== null ? `WIN ${Math.round(d.winP * 100)}%  ` : '';
    return {
      title: `E  SIT  ${d.name.toUpperCase()}`,
      odds: `${TIER_NAME[d.tier]}  ${win}PAYS ${d.paysText}  LOSE ${d.lossText.replace('THE BET', '$' + bet)}`,
      color: TIER_ROLE[d.tier].base,
    };
  }

  /** The table in reach and in front of you, if any. */
  private reachable(): string | null {
    const p = this.me();
    const fx = -Math.sin(this.fp.yaw), fz = -Math.cos(this.fp.yaw);
    for (const pl of FLOOR_1.tables) {
      if (!OPEN_TABLES.has(pl.table)) continue;
      const dx = p.x - pl.stand.x, dz = p.z - pl.stand.z;
      if (dx * dx + dz * dz > USE_RADIUS * USE_RADIUS) continue;
      const tx = pl.x - p.x, tz = pl.z - p.z;
      if ((tx * fx + tz * fz) / Math.hypot(tx, tz) > 0.3) return pl.table;
    }
    return null;
  }

  private frame(dt: number, alpha: number) {
    const i = this.input;
    if (this.started && !this.paused) {
      // Esc while walking: the browser drops pointer lock; we pause (THREEJS-NOTES rule 2)
      if (this.wasLocked && !i.locked && !this.fp.seated) this.paused = true;
      const l = i.takeLook();
      if (i.locked) this.fp.look(l.dx, l.dy);
      if (this.fp.seated) {
        if (i.wasPressed('interact') || i.wasPressed('pause')) this.send({ t: 'stand' });
      } else if (i.wasPressed('interact')) {
        const t = this.reachable();
        if (t) this.send({ t: 'sit', table: t });
      }
    }
    this.wasLocked = i.locked;

    const p = this.me();
    const x = this.prev.x + (p.x - this.prev.x) * alpha;
    const z = this.prev.z + (p.z - this.prev.z) * alpha;
    this.fp.apply(this.view.camera, x, z, dt);

    // panels: the seated one takes the mouse, mapped onto its screen
    for (const { panel, tex, mesh } of this.panels.values()) {
      const active = p.seat === panel.table;
      let ptr: Pointer | null = null;
      if (active) {
        const uv = this.view.pickUV(mesh, i.mouse.x, i.mouse.y);
        ptr = uv ? { x: uv.x * PANEL_W, y: (1 - uv.y) * PANEL_H, down: i.mouse.down[0], pressed: i.mouse.pressed[0] } : null;
      }
      if (panel.update({ state: this.game.state, player: ME, active }, ptr, dt, i)) tex.needsUpdate = true;
      for (const c of panel.out.splice(0)) this.send(c);
    }

    // the HUD
    const t = !this.fp.seated && this.started ? this.reachable() : null;
    const b = this.view.box.css;
    const hp: Pointer = { x: ((i.mouse.x - b.x) / b.w) * HUD_W, y: ((i.mouse.y - b.y) / b.h) * HUD_H, down: i.mouse.down[0], pressed: i.mouse.pressed[0] };
    this.hud.draw(
      {
        state: this.game.state, player: ME, seated: this.fp.seated,
        prompt: t ? this.promptFor(t) : null,
        overlay: !this.started ? 'enter' : this.paused ? 'paused' : null,
      },
      hp, dt, i,
    );
    this.canvas.style.cursor = this.fp.seated ? 'default' : 'crosshair';
    this.view.render();
    this.audio.update();
    i.endFrame();
  }

  // ---------------------------------------------------------------- debug and e2e hooks

  /** Step onto the floor without pointer lock (headless browsers). */
  enter() {
    this.started = true;
    this.paused = false;
  }

  /** Put the camera somewhere exact: a standing pose at (x, z) looking (yaw, pitch). */
  pose(x: number, z: number, yaw: number, pitch = 0) {
    const p = this.me();
    p.x = this.prev.x = x;
    p.z = this.prev.z = z;
    this.fp.yaw = yaw;
    this.fp.pitch = pitch;
    this.fp.snap(this.view.camera, x, z);
  }

  /** Walk to a table's stand point and sit down through the real command path. */
  sitAt(table: string) {
    const pl = FLOOR_1.tables.find((t) => t.table === table)!;
    this.pose(pl.stand.x, pl.stand.z, 0, -0.2);
    this.send({ t: 'sit', table });
  }

  setToggles(t: Partial<PassToggles>) {
    Object.assign(this.view.toggles, t);
    this.layout();
  }

  setPalette(id: PaletteId) {
    this.view.setPalette(id);
    this.tex.load(id);
    recolorNeon(this.room);
    for (const { panel, tex } of this.panels.values()) {
      panel.update({ state: this.game.state, player: ME, active: false }, null, 0, null, true);
      tex.needsUpdate = true;
    }
    return this.tex.ready;
  }

  /** Floor change and run end (THREEJS-NOTES rule 12): free every GPU resource. */
  dispose() {
    this.loop.stop();
    this.room.dispose();
    for (const { tex, mesh } of this.panels.values()) {
      tex.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    }
    this.tex.dispose();
    this.view.dispose();
  }
}
