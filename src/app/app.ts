// The app: wires input → commands → sim → events → view, HUD, panels and sound, and runs the
// screens around a run (title → how to play / settings → the night → results). The sim never sees
// any of this: everything the player does reaches it as a command.
import { CanvasTexture, Mesh, MeshBasicMaterial, NearestFilter, SRGBColorSpace } from 'three';
import { GameLoop } from '../engine/loop';
import { Input } from '../engine/input';
import { Audio } from '../engine/audio/audio';
import { Game } from '../sim/Game';
import type { Command } from '../sim/commands';
import type { SimEvent } from '../sim/events';
import { TICKS_PER_S } from '../sim/state';
import { OPEN_TABLES } from '../sim/systems/tables';
import { atCage, cantBuy, slotsOf } from '../sim/systems/cage';
import { FLOOR_1, USE_RADIUS } from '../data/floors';
import { TABLE_BY_ID, minBet } from '../data/tables';
import { CHARMS, UPGRADES, CHARM_BY_ID, UPGRADE_BY_ID, type CharmId, type UpgradeId } from '../data/charms';
import { MARK_BY_ID } from '../data/marks';
import { activePalette, C, TIER_NAME, TIER_ROLE, type PaletteId } from '../data/palette';
import { View3D, type PassToggles } from '../render3d/view';
import { Textures } from '../render3d/textures';
import { buildRoom, recolorNeon, setMidnight, type Room } from '../render3d/room';
import { FirstPerson } from '../render3d/fpcam';
import { Hud, HUD_W, HUD_H, type HudAction, type Lesson, type Meta, type Screen, type Settings, type Toast } from '../hud/hud';
import { BanditPanel, DeadManPanel, HiLoPanel, RedLinePanel, TwentyOnePanel, WheelPanel } from '../panels/games';
import { CollectorPanel } from '../panels/collector';
import { PANEL_W, PANEL_H, type Panel } from '../panels/panel';
import { blackoutLeft } from '../panels/view';
import { money } from '../panels/table';
import type { Pointer } from '../ui/ui';

const ME = 0;
const BASE_SENS = 0.0022;

const DEFAULT_SETTINGS: Settings = { sens: 1, invert: false, master: 0.8, music: 0.6, sfx: 0.8, scaling: 'auto', bloom: true };
const DEFAULT_META: Meta = { upgrades: [], runs: 0, wins: 0, bestNight: 0, lessons: [] };

/** localStorage can be missing or throw (private windows, blocked storage): the game plays without it. */
function load<T>(key: string, def: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...def, ...JSON.parse(raw) } : { ...def };
  } catch {
    return { ...def };
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

/** The lesson cards: two lines, once per player (ROADMAP Milestone 1). */
const LESSONS: Record<string, [string, string]> = {
  start: ['SIX MINUTES. MAKE THE QUOTA.', 'WALK UP TO A TABLE, READ ITS ODDS, PRESS E. GREEN BLEEDS, YELLOW MARKS, RED KILLS.'],
  mark: ['YOU ARE MARKED', '-5% ON YOUR HI-LO PAYOUTS A STACK. AT 4 STACKS HI-LO LOSES: GO SPIN THE WHEEL.'],
  teammark: ['A TEAM MARK', 'THE WHEEL PAYS, BUT ITS LOSSES HIT EVERYONE. IT LASTS 45 S.'],
  blood: ['A BLOOD TABLE', 'IT PAYS BEST, AND LOSING CAN COST A LIFE. READ THE SCREEN BEFORE YOU BET.'],
  midnight: ['0:00. THE COLLECTOR.', 'SHORT: A LIFE PER $1,000 AND THE BANK. MADE IT: PAY, OR GAMBLE ON THE CIRCUIT.'],
  markers: ['MARKERS', 'SPEND THEM AT THE CAGE ON THE EAST WALL: CHARMS THAT CROSS THE ROOM.'],
};

export class App {
  readonly input = new Input();
  readonly audio: Audio;
  readonly view: View3D;
  readonly tex: Textures;
  room: Room;
  game: Game;
  readonly fp = new FirstPerson();
  readonly hud: Hud;
  readonly loop: GameLoop;
  readonly panels = new Map<string, { panel: Panel; tex: CanvasTexture; mesh: Mesh }>();
  settings: Settings;
  meta: Meta;
  screen: Screen = 'title';
  /** the floor has been entered (pointer lock needs a user gesture) */
  started = false;
  paused = false;
  /** a lock request the browser refused (it holds the mouse back for ~1 s after Esc) */
  relock = false;
  cageOpen = false;
  private toasts: Toast[] = [];
  private lesson: Lesson | null = null;
  private lessonQueue: string[] = [];
  private banner: { text: string; sub: string; color: number; t: number } | null = null;
  private dark = 0;
  private overAt = 0;
  /** last sent walk intent, so a `move` goes out only when it changes */
  private sentMove = { mx: 0, mz: 0, yaw: 0 };
  private prev = { x: 0, z: 0 };
  private wasLocked = false;
  private titleT = 0;

  constructor(readonly canvas: HTMLCanvasElement, readonly hudCanvas: HTMLCanvasElement) {
    this.settings = load('vig.settings', DEFAULT_SETTINGS);
    this.meta = load('vig.meta', DEFAULT_META);
    this.audio = new Audio({ master: this.settings.master, music: this.settings.music, sfx: this.settings.sfx });
    this.input.attach(canvas);
    this.view = new View3D(canvas);
    this.tex = new Textures(activePalette);
    this.room = buildRoom(this.view.scene, FLOOR_1, this.tex);
    this.hud = new Hud(hudCanvas);
    this.hud.ui.sfx = (id) => this.audio.sfx(id);
    this.game = new Game({ seed: 1, upgrades: this.meta.upgrades });
    for (const p of [new BanditPanel(), new TwentyOnePanel(), new HiLoPanel(), new WheelPanel(), new RedLinePanel(), new DeadManPanel(), new CollectorPanel()]) this.mountPanel(p);
    this.applySettings();
    this.resetCamera();
    window.addEventListener('resize', () => this.layout());
    // pointer lock must be asked for inside the click itself
    canvas.addEventListener('mousedown', () => {
      this.audio.unlock();
      if (this.wantsLock()) this.input.lock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (this.input.locked && this.screen === 'game') {
        this.started = true;
        this.paused = false;
        this.relock = false;
      }
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
    panel.ui.sfx = (id) => this.audio.sfx(id);
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

  private applySettings() {
    const s = this.settings;
    this.fp.sensitivity = BASE_SENS * s.sens;
    this.audio.applySettings({ master: s.master, music: s.music, sfx: s.sfx });
    this.view.scaling = s.scaling;
    this.view.toggles.bloom = s.bloom;
    this.layout();
  }

  private me() {
    return this.game.state.players[ME];
  }

  private send(cmd: Command) {
    this.game.submit(ME, cmd);
  }

  /** Walking the floor, mouse free: a click should take the mouse. */
  private wantsLock() {
    return this.screen === 'game' && this.game.state.phase === 'floor' && !this.fp.seated && !this.cageOpen && !this.input.locked;
  }

  private resetCamera() {
    const sp = FLOOR_1.spawn;
    const p = this.me();
    this.fp.yaw = sp.yaw;
    this.fp.pitch = 0;
    this.prev = { x: p.x, z: p.z };
    this.fp.snap(this.view.camera, p.x, p.z);
  }

  // ---------------------------------------------------------------- runs

  newRun(seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0) {
    this.game = new Game({ seed, upgrades: this.meta.upgrades });
    this.screen = 'game';
    this.started = false;
    this.paused = false;
    this.cageOpen = false;
    this.toasts = [];
    this.banner = null;
    this.lesson = null;
    this.lessonQueue = [];
    this.overAt = 0;
    this.dark = 0;
    if (this.fp.seated) this.fp.stand(this.view.camera);
    this.resetCamera();
    this.sentMove = { mx: 0, mz: 0, yaw: 0 };
    this.teach('start');
  }

  private toTitle() {
    this.input.unlock();
    this.screen = 'title';
    this.game = new Game({ seed: 1, upgrades: this.meta.upgrades });
    this.cageOpen = false;
    if (this.fp.seated) this.fp.stand(this.view.camera);
    this.resetCamera();
    this.dark = 0;
  }

  private teach(id: string) {
    if (this.meta.lessons.includes(id) || this.lessonQueue.includes(id) || this.lesson?.title === LESSONS[id][0]) return;
    this.meta.lessons.push(id);
    save('vig.meta', this.meta);
    this.lessonQueue.push(id);
  }

  private toast(text: string, color: number) {
    this.toasts.unshift({ text, color, t: 2.2 });
    this.toasts.length = Math.min(this.toasts.length, 5);
  }

  // ---------------------------------------------------------------- the sim

  /** One sim tick (60 Hz): the walk intent goes in as a command, then the sim steps. */
  private tick() {
    if (this.screen !== 'game') return;
    const s = this.game.state;
    if (s.phase === 'over') {
      this.game.step();
      this.handle(this.game.drainEvents());
      return;
    }
    // walking the floor needs the floor entered and not paused; the Collector's table runs on its own
    if (s.phase === 'floor' && (!this.started || this.paused)) return;
    const i = this.input;
    const walking = s.phase === 'floor' && !this.fp.seated && !this.cageOpen;
    const fwd = walking ? (i.isDown('forward') ? 1 : 0) - (i.isDown('back') ? 1 : 0) : 0;
    const strafe = walking ? (i.isDown('right') ? 1 : 0) - (i.isDown('left') ? 1 : 0) : 0;
    const w = this.fp.walk(fwd, strafe);
    const yaw = Math.round(this.fp.yaw * 1000);
    const sm = this.sentMove;
    if (s.phase === 'floor' && (w.mx !== sm.mx || w.mz !== sm.mz || (Math.abs(yaw - sm.yaw) > 20 && (w.mx || w.mz)))) {
      this.sentMove = { ...w, yaw };
      this.send({ t: 'move', ...w, yaw });
    }
    const p = this.me();
    this.prev = { x: p.x, z: p.z };
    this.game.step();
    this.handle(this.game.drainEvents());
  }

  /** What the sim said happened: camera, sound, toasts, lessons. */
  private handle(events: SimEvent[]) {
    const a = this.audio;
    for (const e of events) {
      const mine = !('player' in e) || e.player === ME || e.player === -1;
      switch (e.t) {
        case 'sat': {
          if (e.player !== ME) break;
          const pl = FLOOR_1.tables.find((t) => t.table === e.table)!;
          this.fp.sit(this.view.camera, pl.eye, pl.look);
          this.input.unlock();
          a.sfx('click');
          if (TABLE_BY_ID.get(e.table)?.tier === 'high') this.teach('blood');
          break;
        }
        case 'stood':
          if (e.player !== ME || this.game.state.phase !== 'floor') break;
          this.fp.stand(this.view.camera);
          this.input.lock();
          break;
        case 'play':
          if (!mine) break;
          a.sfx({ bandit: 'reel', hilo: 'dice', deadman: 'dice', wheel: 'spin', redline: 'card', twentyone: 'chip' }[e.table] ?? 'chip');
          break;
        case 'card':
          a.sfx('card');
          break;
        case 'round': {
          if (!mine) break;
          const o = e.outcome;
          const net = o.ret - o.bet;
          if (net > 0) {
            this.toast(`+${money(net)}`, C.gold);
            a.sfx(net >= 1000 ? 'bigwin' : 'win');
          } else if (net === 0) {
            this.toast('PUSH', C.bone);
            a.sfx('push');
          } else {
            this.toast(`-${money(-net)}`, C.ash);
            if (!o.lifeLost && !o.mark) a.sfx('lose');
          }
          break;
        }
        case 'mark': {
          const d = MARK_BY_ID.get(e.id)!;
          if (e.player === ME) {
            this.toast(`${d.name.toUpperCase()}${e.stacks > 1 ? ' x' + e.stacks : ''}`, C.midHi);
            this.teach('mark');
          } else if (e.player === -1) {
            this.toast(`TEAM MARK: ${d.name.toUpperCase()}`, C.midHi);
            this.teach('teammark');
          }
          a.sfx('mark');
          break;
        }
        case 'tax':
          this.toast(`TAX: -${money(e.amount)}`, C.midHi);
          break;
        case 'life':
          if (e.player !== ME) break;
          if (e.delta < 0) {
            this.banner = { text: '-1 LIFE', sub: `${e.why.toUpperCase()}. ${e.lives} LEFT.`, color: C.blood, t: 2.4 };
            a.sfx('life');
          } else {
            this.toast(`+1 LIFE (${e.why.toUpperCase()})`, C.blood);
            a.sfx('buy');
          }
          break;
        case 'markers':
          this.toast(`+${e.delta} MARKER${e.delta > 1 ? 'S' : ''}`, C.marker);
          this.teach('markers');
          break;
        case 'warning':
          if (e.player !== ME) break;
          this.toast('ONE MORE LOSS COSTS A LIFE', C.blood);
          a.sfx('warning');
          break;
        case 'midnight':
          this.cageOpen = false;
          this.banner = { text: '0:00', sub: 'THE COLLECTOR CALLS YOU TO HIS TABLE.', color: C.collHi, t: 2.5 };
          a.sfx('midnight');
          this.input.unlock();
          if (this.fp.seated) this.fp.stand(this.view.camera);
          this.fp.sit(this.view.camera, FLOOR_1.collector.eye, FLOOR_1.collector.look);
          this.teach('midnight');
          break;
        case 'shortfall':
          a.sfx('life');
          break;
        case 'paid':
          a.sfx('chip');
          break;
        case 'circuit':
          a.sfx(e.action === 'inspect' ? 'inspect' : e.action === 'reroute' ? 'click' : e.over ? 'overload' : 'safe');
          break;
        case 'circuitEnd':
          a.sfx(e.won ? 'boon' : 'bane');
          break;
        case 'spinning':
          a.sfx('spin');
          break;
        case 'landed':
          a.sfx(e.kind === 'boon' ? 'boon' : 'bane');
          break;
        case 'night': {
          this.fp.stand(this.view.camera);
          this.resetCamera();
          this.started = false;
          this.banner = { text: `NIGHT ${e.night}`, sub: `QUOTA ${money(e.quota)}. THE BANK STARTS AT ${money(e.bank)}.`, color: C.white, t: 3 };
          a.sfx('night');
          break;
        }
        case 'over':
          this.overAt = 2.5;
          break;
        case 'bought':
          if (e.player !== ME) break;
          this.toast(`${(e.kind === 'charm' ? CHARM_BY_ID.get(e.item as CharmId)!.name : UPGRADE_BY_ID.get(e.item as UpgradeId)!.name).toUpperCase()}`, C.collHi);
          a.sfx('buy');
          if (e.kind === 'upgrade') {
            if (!this.meta.upgrades.includes(e.item as UpgradeId)) this.meta.upgrades.push(e.item as UpgradeId);
            save('vig.meta', this.meta);
          }
          break;
        case 'overclock':
          if (e.player === ME) this.toast('OVERCLOCKED: x2 FOR YOUR FIRST 60 S AT THE TABLES', C.gold);
          break;
        case 'refused':
          if (e.player !== ME || e.cmd === 'move') break;
          this.toast(e.why.toUpperCase(), C.ash);
          a.sfx('deny');
          break;
      }
    }
  }

  // ---------------------------------------------------------------- per frame

  /** The seat prompt: the table's name, then its tier, odds and loss cost (all from its data). */
  private promptFor(table: string) {
    const d = TABLE_BY_ID.get(table)!;
    const bet = typeof d.bet === 'number' ? `$${d.bet}` : `$${d.bet[0]}-${d.bet[1]}`;
    const hidden = blackoutLeft(this.game.state) > 0;
    return {
      title: `E  SIT  ${d.name.toUpperCase()}`,
      odds: hidden
        ? `${TIER_NAME[d.tier]}  BLACKOUT: ODDS HIDDEN`
        : `${TIER_NAME[d.tier]}  WIN ${Math.round(d.winP * 100)}%  PAYS ${d.pays !== null ? d.paysText : 'BY LINE'}  LOSE ${d.lossText.replace('THE BET', bet)}`,
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

  private cageView() {
    const why = new Map<string, string | null>();
    const p = this.me();
    for (const c of CHARMS) why.set(c.id, cantBuy(this.game, p, c.id));
    for (const u of UPGRADES) why.set(u.id, cantBuy(this.game, p, u.id));
    return { open: this.cageOpen, why, slots: slotsOf(this.game) };
  }

  private act(acts: HudAction[]) {
    for (const a of acts) {
      switch (a.t) {
        case 'newRun': this.newRun(); break;
        case 'screen':
          this.screen = a.to;
          if (a.to === 'title') this.toTitle();
          break;
        case 'resume': this.input.lock(); break;
        case 'buy': this.send({ t: 'buy', item: a.item }); break;
        case 'closeCage': this.closeCage(); break;
        case 'set':
          this.settings = { ...this.settings, ...a.settings };
          save('vig.settings', this.settings);
          this.applySettings();
          break;
        case 'quit':
          this.meta.runs++;
          this.meta.bestNight = Math.max(this.meta.bestNight, this.game.state.night - 1);
          save('vig.meta', this.meta);
          this.toTitle();
          break;
      }
    }
  }

  private openCage() {
    this.cageOpen = true;
    this.input.unlock();
    this.audio.sfx('click');
  }

  private closeCage() {
    this.cageOpen = false;
    this.input.lock();
  }

  private frame(dt: number, alpha: number) {
    const i = this.input;
    const s = this.game.state;
    const inGame = this.screen === 'game';

    if (inGame && s.phase === 'floor') {
      // Esc while walking: the browser drops pointer lock; we pause (THREEJS-NOTES rule 2)
      if (this.wasLocked && !i.locked && !this.fp.seated && !this.cageOpen) this.paused = true;
      if (i.lockFailed && !i.locked && !this.fp.seated && !this.cageOpen) this.relock = true;
      const l = i.takeLook();
      if (i.locked) this.fp.look(l.dx, this.settings.invert ? -l.dy : l.dy);
      if (this.cageOpen) {
        if (i.wasPressed('interact') || i.wasPressed('pause')) this.closeCage();
      } else if (this.fp.seated) {
        if (i.wasPressed('interact') || i.wasPressed('pause')) this.send({ t: 'stand' });
      } else if (this.started && !this.paused && i.wasPressed('interact')) {
        const t = this.reachable();
        if (t) this.send({ t: 'sit', table: t });
        else if (atCage(this.me())) this.openCage();
      }
    } else i.takeLook();
    this.wasLocked = i.locked;

    // the results card, a beat after the run ends
    if (inGame && s.phase === 'over' && this.overAt > 0) {
      this.overAt -= dt;
      if (this.overAt <= 0) {
        this.screen = 'results';
        this.input.unlock();
        this.meta.runs++;
        if (s.result?.won) this.meta.wins++;
        this.meta.bestNight = Math.max(this.meta.bestNight, s.result?.won ? s.night : s.night - 1);
        save('vig.meta', this.meta);
      }
    }

    // the camera: the title drifts at the door; in play it follows the body or the seat
    const p = this.me();
    if (this.screen === 'title' || this.screen === 'howto' || (this.screen === 'settings' && !this.started)) {
      this.titleT += dt;
      this.fp.yaw = Math.sin(this.titleT * 0.12) * 0.35;
      this.fp.pitch = 0.04;
      this.fp.snap(this.view.camera, 0, 7.2);
    } else {
      const x = this.prev.x + (p.x - this.prev.x) * alpha;
      const z = this.prev.z + (p.z - this.prev.z) * alpha;
      this.fp.apply(this.view.camera, x, z, dt);
    }

    // the 0:00 drop
    const dark = inGame && s.phase !== 'floor' ? 1 : 0;
    this.dark += (dark - this.dark) * Math.min(1, dt * 1.5);
    setMidnight(this.room, this.dark);
    this.audio.roomBed(this.screen === 'game' ? 1 - 0.75 * this.dark : 0.4);

    // panels: the seated one takes the mouse, mapped onto its screen
    const atColl = inGame && s.phase !== 'floor' && s.phase !== 'over';
    for (const { panel, tex, mesh } of this.panels.values()) {
      const active = inGame && (panel.table === 'collector' ? atColl : p.seat === panel.table);
      let ptr: Pointer | null = null;
      if (active) {
        const uv = this.view.pickUV(mesh, i.mouse.x, i.mouse.y);
        ptr = uv ? { x: uv.x * PANEL_W, y: (1 - uv.y) * PANEL_H, down: i.mouse.down[0], pressed: i.mouse.pressed[0] } : null;
      }
      if (panel.update({ state: s, player: ME, active, tick: this.game.tick, rev: this.game.rev }, ptr, dt, i)) tex.needsUpdate = true;
      for (const c of panel.out.splice(0)) this.send(c);
    }

    // timers: toasts, the banner, lessons
    for (const t of this.toasts) t.t -= dt;
    this.toasts = this.toasts.filter((t) => t.t > 0);
    if (this.banner) this.banner.t -= dt;
    if (this.lesson) this.lesson.t -= dt;
    if ((!this.lesson || this.lesson.t <= 0) && this.lessonQueue.length && inGame && (this.started || s.phase !== 'floor')) {
      const [title, body] = LESSONS[this.lessonQueue.shift()!];
      this.lesson = { title, body, t: 7 };
    }

    // the HUD
    const near = inGame && s.phase === 'floor' && !this.fp.seated && this.started && !this.cageOpen;
    const t = near ? this.reachable() : null;
    const cagePrompt = near && !t && atCage(p) ? { title: 'E  THE CAGE', odds: `CHARMS AND UPGRADES FOR MARKERS  (${s.markers} ${'\u0013'})`, color: C.marker } : null;
    const b = this.view.box.css;
    const hp: Pointer = { x: ((i.mouse.x - b.x) / b.w) * HUD_W, y: ((i.mouse.y - b.y) / b.h) * HUD_H, down: i.mouse.down[0], pressed: i.mouse.pressed[0] };
    const overlay = this.screen === 'game' && s.phase === 'floor' && !this.fp.seated && !this.cageOpen
      ? (!this.started ? 'enter' : this.relock ? 'relock' : this.paused ? 'paused' : null)
      : null;
    const acts = this.hud.draw(
      {
        screen: this.screen, state: this.screen === 'title' || this.screen === 'howto' ? null : s, player: ME,
        seated: this.fp.seated, atCollector: atColl,
        prompt: t ? this.promptFor(t) : cagePrompt,
        overlay, cage: inGame && s.phase === 'floor' ? this.cageView() : null,
        toasts: this.toasts, lesson: this.lesson, banner: this.banner, settings: this.settings, meta: this.meta, dark: this.dark,
      },
      hp, dt, i,
    );
    this.act(acts);
    this.canvas.style.cursor = i.locked ? 'none' : 'default';
    this.view.render();
    this.audio.update();
    i.endFrame();
  }

  // ---------------------------------------------------------------- debug and e2e hooks

  /** Step onto the floor without pointer lock (headless browsers). */
  enter() {
    if (this.screen !== 'game') this.newRun(1);
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

  /** Run the sim fast to a tick (headless shots): presentation handles every event on the way. */
  skipTo(tick: number) {
    while (this.game.tick < tick && this.game.state.phase !== 'over') {
      this.game.step();
      this.handle(this.game.drainEvents());
    }
  }

  /** Every table's minimum bet, for the bots in e2e scripts. */
  readonly minBet = (table: string) => minBet(TABLE_BY_ID.get(table)!);

  setToggles(t: Partial<PassToggles>) {
    Object.assign(this.view.toggles, t);
    this.layout();
  }

  setPalette(id: PaletteId) {
    this.view.setPalette(id);
    this.tex.load(id);
    recolorNeon(this.room);
    for (const { panel, tex } of this.panels.values()) {
      panel.update({ state: this.game.state, player: ME, active: false, tick: this.game.tick, rev: this.game.rev }, null, 0, null, true);
      tex.needsUpdate = true;
    }
    return this.tex.ready;
  }

  /** Floor change and run end (THREEJS-NOTES rule 12): free every GPU resource. */
  dispose() {
    this.loop.stop();
    this.room.dispose();
    this.view.invalidateGlow();
    for (const { tex, mesh } of this.panels.values()) {
      tex.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    }
    this.tex.dispose();
    this.view.dispose();
  }
}

/** Seconds as the HUD prints them. */
export const secs = (ticks: number) => Math.ceil(ticks / TICKS_PER_S);
