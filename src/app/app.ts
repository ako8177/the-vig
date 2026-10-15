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
import { atBar, atCage, cantBuy, cantOrder, slotsOf } from '../sim/systems/cage';
import { BUZZ, DRINKS, DRINK_BY_ID, type DrinkId } from '../data/drinks';
import { FLOOR_1, USE_RADIUS, roomAt } from '../data/floors';
import { TABLE_BY_ID, minBet } from '../data/tables';
import { CHARMS, UPGRADES, CHARM_BY_ID, UPGRADE_BY_ID, type CharmId, type UpgradeId } from '../data/charms';
import { MARK_BY_ID } from '../data/marks';
import { FEEL } from '../data/feel';
import { defineSounds } from './sounds';
import { ECONOMY } from '../data/economy';
import { activePalette, C, TIER_NAME, TIER_ROLE, type PaletteId } from '../data/palette';
import { View3D, type PassToggles } from '../render3d/view';
import { Textures } from '../render3d/textures';
import { buildRoom, recolorNeon, setMidnight, type Room } from '../render3d/room';
import { buildHome, type Home } from '../render3d/home';
import { CAR_STAND as CAR_STAND_AT, FAMILY, HOME_SPAWN } from '../data/home';
import { atCar, atComputer, atMailbox } from '../sim/systems/home';
import type { Floor } from '../data/floors';
import { buildDuel, type Duel } from '../render3d/duel';
import { DuelScene, type DuelHud } from './duelscene';
import { COLLECTORS } from '../data/collectors';
import { WIN_DISPLAY } from '../panels/table';
import { TablePlay } from '../render3d/tableplay';
import { Chatter } from './chatter';
import { Crowd } from '../render3d/npcs';
import { FirstPerson } from '../render3d/fpcam';
import { Hud, HUD_W, HUD_H, type HudAction, type Lesson, type Meta, type Screen, type Settings, type Toast } from '../hud/hud';
import { BanditPanel, DeadManPanel, HiLoPanel, RedLinePanel, TwentyOnePanel, WheelPanel } from '../panels/games';
import { CollectorPanel } from '../panels/collector';
import { PANEL_W, PANEL_H, type Panel } from '../panels/panel';
import { blackoutLeft, lossTextOf } from '../panels/view';
import { CALL_RADIUS } from '../sim/systems/collector';
import { money } from '../panels/table';
import type { Pointer } from '../ui/ui';

const ME = 0;
const BASE_SENS = 0.0022;

const DEFAULT_SETTINGS: Settings = { sens: 1, invert: false, master: 0.8, music: 0.6, sfx: 0.8, scaling: 'auto', bloom: true, drunkFx: 'full', wins: 'total', voice: 'spoken' };
const DEFAULT_META: Meta = { upgrades: [], runs: 0, wins: 0, bestNight: 0, lessons: [], unlocked: [], endings: [] };

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

/** Phases you walk in: the casino floor during the night, and the house between nights. */
const walks = (ph: string) => ph === 'floor' || ph === 'home';
const HOME_ROOMS: ReadonlySet<string> = new Set(['home']);
const NO_ROOMS: ReadonlySet<string> = new Set();

/** The lesson cards: two lines, once per player (ROADMAP Milestone 1). */
const LESSONS: Record<string, [string, string]> = {
  home: ['HOME.', 'THE COMPUTER SELLS CHARMS FOR MARKERS AND THE POST BRINGS THEM TO THE MAILBOX. THE CAR TAKES YOU TO THE VIG.'],
  start: ['SIX MINUTES. MAKE THE QUOTA.', 'WALK UP TO A TABLE, READ ITS ODDS, PRESS E. GREEN BLEEDS, YELLOW MARKS, RED KILLS.'],
  mark: ['YOU ARE MARKED', '-5% ON YOUR HI-LO PAYOUTS A STACK. AT 4 STACKS HI-LO LOSES: GO SPIN THE WHEEL.'],
  teammark: ['A TEAM MARK', 'THE WHEEL PAYS, BUT ITS LOSSES HIT EVERYONE. IT LASTS 45 S.'],
  blood: ['A BLOOD TABLE', 'IT PAYS BEST, AND LOSING CAN COST A LIFE. READ THE SCREEN BEFORE YOU BET.'],
  midnight: ['0:00. THE COLLECTOR.', `SHORT: A LIFE PER ${money(ECONOMY.shortfallPerLife.v)} AND THE BANK. MADE IT: PAY HIM, OR CHALLENGE HIM AT HIS GAME.`],
  markers: ['MARKERS', 'SPEND THEM ON THE COMPUTER AT HOME: CHARMS THAT CROSS THE ROOM, BY POST.'],
  broke: ['BROKE', "NOTHING LEFT TO BET? WALK TO THE COLLECTOR'S TABLE IN THE MIDDLE AND PRESS E TO CALL IT."],
};
const URGENT = new Set(['blood', 'midnight', 'broke']);

export class App {
  readonly input = new Input();
  readonly audio: Audio;
  readonly view: View3D;
  readonly tex: Textures;
  room: Room;
  /** the people in the casino (presentation only: DECISIONS #66) */
  crowd: Crowd;
  /** the crowd's own games on the felt, and their talk (DECISIONS #78) */
  tablePlay: TablePlay;
  chatter: Chatter;
  /** the house and the family in it (DECISIONS #79) */
  home: Home;
  family: Crowd;
  /** the Collector, his table and its levers, and the scene played at it (DECISIONS #82) */
  duel: Duel;
  duelScene: DuelScene;
  private duelHud: DuelHud | null = null;
  /** your vision fading out and in (dir +1 to black, -1 back), how long it holds black, its words */
  private fade: { a: number; dir: number; hold: number; text: string } | null = null;
  private pendingReady: Command | null = null;
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
  barOpen = false;
  /** a yes/no card on screen (calling the night) */
  confirm: { title: string; lines: string[]; yes: string; cmd?: Command } | null = null;
  /** the stand-up came from Esc: don't grab the mouse back (no user gesture) */
  private standByEsc = false;
  private toasts: Toast[] = [];
  private lesson: Lesson | null = null;
  private lessonQueue: string[] = [];
  private banner: { text: string; sub: string; color: number; t: number } | null = null;
  private dark = 0;
  private overAt = 0;
  /** last sent walk intent, so a `move` goes out only when it changes */
  private sentMove = { mx: 0, mz: 0, yaw: 0, run: false };
  private prev = { x: 0, z: 0 };
  private wasLocked = false;
  private titleT = 0;
  /** the room the camera was last in (a doorway is in none) */
  private lastRoom: string = 'floor';
  /** seconds to the next distant win across the floor */
  private ambientIn = 6;
  /** the camera's shake (a jackpot), decaying */
  private shake = 0;

  constructor(readonly canvas: HTMLCanvasElement, readonly hudCanvas: HTMLCanvasElement) {
    this.settings = load('vig.settings', DEFAULT_SETTINGS);
    this.meta = load('vig.meta', DEFAULT_META);
    this.audio = new Audio({ master: this.settings.master, music: this.settings.music, sfx: this.settings.sfx });
    this.input.attach(canvas);
    this.view = new View3D(canvas);
    this.tex = new Textures(activePalette);
    this.room = buildRoom(this.view.scene, FLOOR_1, this.tex);
    this.crowd = new Crowd(this.view.scene, FLOOR_1);
    this.tablePlay = new TablePlay(this.view.scene, FLOOR_1);
    this.home = buildHome(this.view.scene, this.tex);
    this.family = new Crowd(this.view.scene, { npcs: FAMILY } as unknown as Floor);
    this.duel = buildDuel(this.view.scene, FLOOR_1);
    this.hud = new Hud(hudCanvas);
    this.hud.ui.sfx = (id) => this.audio.sfx(id);
    this.game = new Game({ seed: 1, upgrades: this.meta.upgrades });
    defineSounds(this.audio);
    this.chatter = new Chatter(this.audio, FLOOR_1);
    this.duelScene = new DuelScene(this.audio, this.duel, this.room, this.fp, (c) => this.send(c), (objs) => this.view.pickObject(objs, this.input.mouse.x, this.input.mouse.y));
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
    panel.sound = (id, v, p) => {
      this.audio.sfx(id, v, p);
      // Twenty-One's dealer deals each card the panel deals
      if (panel.table === 'twentyone' && (id === 'card' || id === 'flip')) this.crowd.deal('twentyone');
    };
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
    WIN_DISPLAY.total = s.wins !== 'net';
    if (this.duelScene) this.duelScene.spoken = s.voice !== 'murmur';
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
    return this.screen === 'game' && walks(this.game.state.phase) && !this.fp.seated && !this.cageOpen && !this.barOpen && !this.confirm && !this.input.locked;
  }

  private resetCamera() {
    const sp = this.game.state.phase === 'home' ? HOME_SPAWN : FLOOR_1.spawn;
    const p = this.me();
    this.fp.yaw = sp.yaw;
    this.fp.pitch = 0;
    this.prev = { x: p.x, z: p.z };
    this.fp.snap(this.view.camera, p.x, p.z);
  }

  // ---------------------------------------------------------------- runs

  newRun(seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0) {
    this.game = new Game({ seed, upgrades: this.meta.upgrades, home: true, unlocked: this.meta.unlocked as CharmId[] });
    this.duelScene.reset(this.game.state);
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
    this.sentMove = { mx: 0, mz: 0, yaw: 0, run: false };
    this.teach('home');
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

  /** Queue a lesson card (once per browser). Blood and 0:00 cut the line: they must come before the risk. */
  private teach(id: string) {
    if (this.meta.lessons.includes(id) || this.lessonQueue.includes(id) || this.lesson?.id === id) return;
    if (URGENT.has(id)) {
      this.lessonQueue.unshift(id);
      if (this.lesson) this.lesson.t = 0;
    } else this.lessonQueue.push(id);
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
    if (walks(s.phase) && (!this.started || this.paused)) return;
    const i = this.input;
    const walking = walks(s.phase) && !this.fp.seated && !this.cageOpen;
    const fwd = walking ? (i.isDown('forward') ? 1 : 0) - (i.isDown('back') ? 1 : 0) : 0;
    const strafe = walking ? (i.isDown('right') ? 1 : 0) - (i.isDown('left') ? 1 : 0) : 0;
    let w = this.fp.walk(fwd, strafe);
    // a drunk's feet wander: the walk turns a little, back and forth (input-side; the sim sees moves)
    const dk = this.drunkness();
    if (dk > 0 && (w.mx || w.mz)) {
      const a = Math.sin(this.game.tick / 37) * 0.45 * dk + Math.sin(this.game.tick / 13) * 0.15 * dk;
      const c = Math.cos(a), sn = Math.sin(a);
      w = { mx: Math.round(w.mx * c - w.mz * sn), mz: Math.round(w.mx * sn + w.mz * c) };
    }
    const yaw = Math.round(this.fp.yaw * 1000);
    const run = walking && i.isDown('sprint');
    const sm = this.sentMove;
    if (walks(s.phase) && (w.mx !== sm.mx || w.mz !== sm.mz || run !== sm.run || (Math.abs(yaw - sm.yaw) > 20 && (w.mx || w.mz)))) {
      this.sentMove = { ...w, yaw, run };
      this.send({ t: 'move', ...w, yaw, run });
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
      this.duelScene.event(e, this.game.state);
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
          // E is a key the browser lets us take the mouse on; Esc isn't: the pause card takes the click
          if (this.standByEsc) this.paused = true;
          else this.input.lock();
          this.standByEsc = false;
          break;
        case 'play':
          // Twenty-One's panel deals its own cards, a sound each (games.ts)
          if (!mine || e.table === 'twentyone') break;
          // the show starts: each table's sound is timed to its animation (src/data/feel.ts)
          a.sfx('chips', 0.7);
          a.sfx({ bandit: 'lever', hilo: 'dice', deadman: 'dice2', wheel: 'wheelspin', redline: 'riffle' }[e.table] ?? 'click');
          break;
        case 'round': {
          if (!mine) break;
          const o = e.outcome;
          const net = o.ret - o.bet;
          // the railbirds (and, for a big result, the room) react
          {
            const pl = FLOOR_1.tables.find((x) => x.table === o.table);
            if (pl && net !== 0) this.crowd.react(o.table, net > 0, Math.abs(net) >= FEEL.bigWin || !!o.lifeLost, pl.stand);
          }
          if (net > 0) {
            // a win should feel like one: the bigger it is, the more the room shows it (DECISIONS #63)
            const jackpot = net >= FEEL.jackpot || !!o.jackpot;
            const big = net >= FEEL.bigWin;
            this.toast(`+${money(WIN_DISPLAY.total ? o.ret : net)}`, C.gold);
            if (jackpot) {
              a.sfx('jackpot');
              this.hud.celebrate('jackpot', net);
              this.shake = 1;
            } else if (big) {
              a.sfx('bigwin');
              this.hud.celebrate('big', net);
            } else {
              a.sfx('win');
              this.hud.celebrate('win', net);
            }
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
          } else if (e.delta === 0) {
            this.toast(e.why.toUpperCase(), C.collHi);
            a.sfx('buy');
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
          this.barOpen = false;
          this.confirm = null;
          this.banner = { text: '0:00', sub: 'THE COLLECTOR CALLS YOU TO HIS TABLE.', color: C.collHi, t: 2.5 };
          a.sfx('midnight');
          this.input.unlock();
          if (this.fp.seated) this.fp.stand(this.view.camera);
          // the scene seats you across from him (duelscene.ts)
          this.teach('midnight');
          break;
        case 'shortfall':
          a.sfx('life');
          break;
        case 'paid':
          a.sfx('chip');
          break;
        case 'killed':
          this.toast(`${COLLECTORS[Math.min(e.idx, COLLECTORS.length - 1)].name} IS DEAD`, C.collHi);
          break;
        case 'unlocked': {
          const c = CHARM_BY_ID.get(e.charm as CharmId);
          if (c) this.toast(`NEW IN THE SHOP, FOR GOOD: ${c.name.toUpperCase()}`, C.soul);
          if (!this.meta.unlocked.includes(e.charm)) this.meta.unlocked.push(e.charm);
          save('vig.meta', this.meta);
          break;
        }
        case 'ending':
          if (!this.meta.endings.includes(e.id)) this.meta.endings.push(e.id);
          save('vig.meta', this.meta);
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
          const atHome = this.game.state.phase === 'home';
          this.banner = atHome
            ? { text: 'HOME', sub: `NIGHT ${e.night} NEXT. QUOTA ${money(e.quota)}. THE CAR IS OUT FRONT.`, color: C.cream, t: 3.5 }
            : { text: `NIGHT ${e.night}`, sub: `QUOTA ${money(e.quota)}. THE BANK STARTS AT ${money(e.bank)}.`, color: C.white, t: 3 };
          a.sfx('night');
          break;
        }
        case 'ordered':
          if (e.player !== ME) break;
          this.toast(`ORDERED: ${(e.kind === 'charm' ? CHARM_BY_ID.get(e.item as CharmId)!.name : UPGRADE_BY_ID.get(e.item as UpgradeId)!.name).toUpperCase()}`, C.collHi);
          a.sfx('buy');
          if (e.kind === 'upgrade') {
            if (!this.meta.upgrades.includes(e.item as UpgradeId)) this.meta.upgrades.push(e.item as UpgradeId);
            save('vig.meta', this.meta);
          }
          break;
        case 'post':
          this.toast(`THE POST HAS COME: ${e.count} IN THE MAILBOX`, C.gold);
          a.sfx('clunk', 0.7);
          break;
        case 'collected':
          this.toast(`CARRIED IN: ${e.items.map((it) => (CHARM_BY_ID.get(it as CharmId) ?? UPGRADE_BY_ID.get(it as UpgradeId))?.name.toUpperCase()).join(', ')}`, C.collHi);
          a.sfx('chips', 0.6);
          break;
        case 'drive':
          this.resetCamera();
          this.banner = { text: `NIGHT ${e.night}`, sub: `QUOTA ${money(this.game.state.quota)}. THE BANK HOLDS ${money(this.game.state.bank)}. THE CLOCK IS RUNNING.`, color: C.white, t: 3 };
          a.sfx('night');
          this.teach('start');
          break;
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
        case 'drank':
          if (e.player !== ME) break;
          a.sfx('pour');
          this.toast(`${DRINK_BY_ID.get(e.drink as DrinkId)!.name.toUpperCase()}. CHEERS.`, C.pinkHi);
          break;
        case 'overclock':
          if (e.player === ME) this.toast('OVERCLOCKED: STAKES AND WINS x2 FOR THE FIRST 60 S OF THE NIGHT', C.gold);
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
        : `${TIER_NAME[d.tier]}  WIN ${Math.round(d.winP * 100)}%  PAYS ${d.pays !== null ? d.paysText : 'BY LINE'}  LOSE ${lossTextOf(d, this.game.state).replace('THE BET', bet)}`,
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
        case 'closeBar': this.closeBar(); break;
        case 'order': this.send({ t: 'order', drink: a.drink }); break;
        case 'confirm': {
          const cmd = this.confirm?.cmd ?? { t: 'callit' };
          this.confirm = null;
          if (a.yes) this.send(cmd);
          if (!a.yes || cmd.t === 'drive') this.input.lock();
          break;
        }
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

  /** Standing at the Collector's table (where a night can be called early). */
  private atCollectorTable() {
    const p = this.me();
    const c = FLOOR_1.collector.stand;
    return (p.x - c.x) ** 2 + (p.z - c.z) ** 2 <= CALL_RADIUS ** 2;
  }

  private askCallIt() {
    const s = this.game.state;
    this.input.unlock();
    this.confirm = {
      title: 'CALL IT?',
      lines: [`THE CLOCK JUMPS TO 0:00 NOW (${Math.ceil(s.clock / TICKS_PER_S)} S LEFT).`, `THE BANK HOLDS ${money(s.bank)} OF ${money(s.quota)}.`, 'NO MORE BETS TONIGHT.'],
      yes: 'CALL IT',
    };
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

  private openBar() {
    this.barOpen = true;
    this.input.unlock();
    this.audio.sfx('click');
  }

  private closeBar() {
    this.barOpen = false;
    this.input.lock();
  }

  /** How drunk you look, 0..1 (the setting can soften it). */
  private drunkness(): number {
    const d = this.me().drunk / (BUZZ.fullS * TICKS_PER_S);
    return Math.min(1, d) * (this.settings.drunkFx === 'mild' ? 0.35 : 1);
  }

  private frame(dt: number, alpha: number) {
    const i = this.input;
    const s = this.game.state;
    const inGame = this.screen === 'game';

    if (inGame && walks(s.phase)) {
      // Esc while walking: the browser drops pointer lock; we pause (THREEJS-NOTES rule 2)
      if (this.wasLocked && !i.locked && !this.fp.seated && !this.cageOpen && !this.barOpen && !this.confirm) this.paused = true;
      if (i.lockFailed && !i.locked && !this.fp.seated && !this.cageOpen && !this.barOpen) this.relock = true;
      const l = i.takeLook();
      if (i.locked) this.fp.look(l.dx, this.settings.invert ? -l.dy : l.dy);
      if (this.cageOpen) {
        if (i.wasPressed('interact') || i.wasPressed('pause')) this.closeCage();
      } else if (this.barOpen) {
        if (i.wasPressed('interact') || i.wasPressed('pause')) this.closeBar();
      } else if (this.confirm) {
        if (i.wasPressed('pause')) this.confirm = null;
      } else if (this.fp.seated) {
        if (i.wasPressed('interact') || i.wasPressed('pause')) {
          this.standByEsc = i.wasPressed('pause');
          this.send({ t: 'stand' });
        }
      } else if (this.started && !this.paused && i.wasPressed('interact') && s.phase === 'home') {
        // the house: the computer, the mailbox, the car
        const me = this.me();
        if (atComputer(me)) this.openCage();
        else if (atMailbox(me)) this.send({ t: 'pickup' });
        else if (atCar(me)) {
          if (s.post.box.length) {
            this.input.unlock();
            this.confirm = { title: 'LEAVE THE POST?', lines: [`${s.post.box.length} IN THE MAILBOX, NOT CARRIED IN.`, 'IT WILL WAIT FOR YOU UNTIL THE NEXT TIME YOU ARE HOME.'], yes: 'DRIVE', cmd: { t: 'drive' } };
          } else this.send({ t: 'drive' });
        }
      } else if (this.started && !this.paused && i.wasPressed('interact')) {
        const t = this.reachable();
        if (t) this.send({ t: 'sit', table: t });
        else if (atCage(this.me())) this.openCage();
        else if (atBar(this.me())) this.openBar();
        else if (this.atCollectorTable()) this.askCallIt();
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
      // the title looks in from just inside the entrance, slowly taking in the floor
      this.fp.yaw = Math.sin(this.titleT * 0.12) * 0.45;
      this.fp.pitch = 0.08;
      this.fp.snap(this.view.camera, FLOOR_1.spawn.x, FLOOR_1.spawn.z);
    } else {
      const x = this.prev.x + (p.x - this.prev.x) * alpha;
      const z = this.prev.z + (p.z - this.prev.z) * alpha;
      this.fp.apply(this.view.camera, x, z, dt);
    }

    // the bar's work: the picture swims and the camera sways (less when seated: the panel must read)
    {
      const dk = inGame ? this.drunkness() : 0;
      const tt = performance.now() / 1000;
      this.view.setDrunk(dk * (this.fp.seated ? 0.45 : 1), tt);
      if (dk > 0) {
        const k = this.fp.seated ? 0.35 : 1;
        this.view.camera.rotateZ(Math.sin(tt * 0.9) * 0.06 * dk * k);
        this.view.camera.position.y += Math.sin(tt * 1.7) * 0.04 * dk * k;
      }
    }
    // the fade: to black, the night ends at black, a beat, then you wake up at home
    if (this.fade) {
      const f = this.fade;
      if (f.dir > 0) {
        f.a = Math.min(1, f.a + dt / 1.4);
        if (f.a >= 1 && this.pendingReady) {
          this.send(this.pendingReady);
          this.pendingReady = null;
          f.dir = 0;
          f.hold = 1.2;
          f.text = 'YOU WAKE UP AT HOME.';
        }
      } else if (f.dir === 0) {
        f.hold -= dt;
        if (f.hold <= 0) f.dir = -1;
      } else {
        f.a = Math.max(0, f.a - dt / 2.2);
        if (f.a <= 0) this.fade = null;
      }
    }
    // the Collector's scene: his words, the levers, the current (DECISIONS #82)
    this.duelHud = inGame ? this.duelScene.frame(dt, s, this.view.camera, { x: i.mouse.x, y: i.mouse.y, left: i.mouse.pressed[0], right: i.mouse.pressed[2] }) : null;
    if (inGame) this.duelScene.applyCamera(this.view.camera, dt);
    // the 0:00 drop
    const dark = inGame && s.phase !== 'floor' && s.phase !== 'home' ? 1 : 0;
    this.dark += (dark - this.dark) * Math.min(1, dt * 1.5);
    setMidnight(this.room, this.dark);
    this.room.update(dt, performance.now() / 1000);
    // light the room you're in, and the one through an arch when you're near it (DECISIONS #68)
    {
      const cam = this.view.camera.position;
      const here = roomAt(FLOOR_1, cam.x, cam.z)?.id ?? this.lastRoom;
      this.lastRoom = here;
      const lit = new Set<string>([here]);
      // through an arch you see the next room once you're within 9 m of it; farther, it's a dark doorway
      for (const dw of FLOOR_1.doorways) if (Math.hypot(cam.x - dw.x, cam.z - dw.z) < 9) lit.add(dw.to).add('floor');
      // at home the casino isn't drawn at all, and the house is (DECISIONS #79)
      const atHome = inGame && s.phase === 'home';
      if (atHome) lit.clear();
      this.room.lightRooms(lit);
      this.home.setVisible(atHome);
      for (const l of this.home.lights) l.visible = atHome;
      if (atHome) {
        this.home.update(dt, performance.now() / 1000);
        this.home.setFlag(s.post.box.length > 0);
      }
      this.family.update(dt, performance.now() / 1000, null, { x: cam.x, z: cam.z, fx: -Math.sin(this.fp.yaw), fz: -Math.cos(this.fp.yaw) }, atHome ? HOME_ROOMS : NO_ROOMS);
      const seatAt = inGame && p.seat ? FLOOR_1.tables.find((x) => x.table === p.seat) : undefined;
      const yaw = this.view.camera.rotation.y;
      this.crowd.update(dt, performance.now() / 1000, seatAt ? { table: seatAt.table, x: seatAt.stand.x, z: seatAt.stand.z } : null,
        { x: cam.x, z: cam.z, fx: -Math.sin(yaw), fz: -Math.cos(yaw) }, lit);
      // the crowd's games: a card or a chip landing near you is heard, softer with distance
      for (const h of this.tablePlay.update(dt, performance.now() / 1000, lit, { x: cam.x, z: cam.z })) this.audio.sfx(h.sound, 0.45 * (1 - h.dist / 6), 0.9 + Math.random() * 0.2);
      this.chatter.update({ x: cam.x, z: cam.z, yaw }, lit, this.dark);
    }
    // the music dips at 0:00; somewhere across the floor, now and then, another machine pays
    this.audio.mood(this.screen === 'game' ? (this.duelScene.tension.playing ? 0.02 : 1 - 0.65 * this.dark) : 0.8);
    if (inGame && s.phase === 'floor' && this.started && !this.paused) {
      this.ambientIn -= dt;
      if (this.ambientIn <= 0) {
        this.audio.sfx('distant', 0.6 + Math.random() * 0.6, 0.9 + Math.random() * 0.25);
        this.ambientIn = 8 + Math.random() * 14;
      }
    }
    // a jackpot shakes the room a little
    if (this.shake > 0) {
      const k = this.shake * 0.02;
      this.view.camera.position.x += (Math.random() - 0.5) * k;
      this.view.camera.position.y += (Math.random() - 0.5) * k;
      this.shake = Math.max(0, this.shake - dt * 2);
    }

    // panels: the seated one takes the mouse, mapped onto its screen
    const atColl = inGame && s.phase !== 'floor' && s.phase !== 'home' && s.phase !== 'over';
    for (const { panel, tex, mesh } of this.panels.values()) {
      const active = inGame && (panel.table === 'collector' ? atColl : p.seat === panel.table);
      let ptr: Pointer | null = null;
      // while his table is turned over the mouse is on the levers, not the face-down screen
      if (active && !(panel.table === 'collector' && this.duelScene.blocksPanel)) {
        const uv = this.view.pickUV(mesh, i.mouse.x, i.mouse.y);
        ptr = uv ? { x: uv.x * PANEL_W, y: (1 - uv.y) * PANEL_H, down: i.mouse.down[0], pressed: i.mouse.pressed[0] } : null;
      }
      if (panel.update({ state: s, player: ME, active, tick: this.game.tick, rev: this.game.rev }, ptr, dt, i)) tex.needsUpdate = true;
      for (const c of panel.out.splice(0)) {
        // going home: your vision goes black first, then the night ends (DECISIONS #83)
        if (c.t === 'ready' && s.home && s.night < ECONOMY.nights.v) {
          if (!this.pendingReady) {
            this.pendingReady = c;
            this.fade = { a: 0, dir: 1, hold: 0, text: '' };
          }
        } else this.send(c);
      }
    }

    // timers: toasts, the banner, lessons
    for (const t of this.toasts) t.t -= dt;
    this.toasts = this.toasts.filter((t) => t.t > 0);
    if (this.banner) this.banner.t -= dt;
    if (this.lesson) this.lesson.t -= dt;
    // a lesson waits while the Collector talks and plays (his scene owns the screen: DECISIONS #82)
    const scene = s.phase === 'midnight' || s.phase === 'choice' || s.phase === 'circuit';
    if ((!this.lesson || this.lesson.t <= 0) && this.lessonQueue.length && inGame && !scene && (this.started || s.phase !== 'floor')) {
      const id = this.lessonQueue.shift()!;
      const [title, body] = LESSONS[id];
      this.lesson = { id, title, body, t: 7 };
      this.meta.lessons.push(id);
      save('vig.meta', this.meta);
    }

    // the HUD
    const near = inGame && s.phase === 'floor' && !this.fp.seated && this.started && !this.cageOpen && !this.barOpen;
    const t = near ? this.reachable() : null;
    const homeNear = inGame && s.phase === 'home' && this.started && !this.cageOpen && !this.confirm;
    const homePrompt = !homeNear ? null
      : atComputer(p) ? { title: 'E  THE COMPUTER', odds: `ORDER CHARMS AND UPGRADES FOR MARKERS (${s.markers} ${'\u0013'}). THE POST BRINGS THEM.`, color: C.collHi }
      : atMailbox(p) ? { title: 'E  THE MAILBOX', odds: s.post.box.length ? `${s.post.box.length} WAITING. CARRY IT IN.` : s.post.orders.length ? 'THE POST IS ON ITS WAY.' : 'EMPTY.', color: C.gold }
      : atCar(p) ? { title: 'E  DRIVE TO THE VIG', odds: `NIGHT ${s.night}. QUOTA ${money(s.quota)}. THE CLOCK STARTS WHEN YOU GET THERE.`, color: C.white }
      : null;
    const cagePrompt = homePrompt ?? (near && !t && atCage(p) ? { title: 'E  THE CAGE', odds: `CHARMS AND UPGRADES FOR MARKERS  (${s.markers} ${'\u0013'})`, color: C.marker }
      : near && !t && this.atCollectorTable() ? { title: 'E  CALL IT', odds: 'END THE NIGHT NOW: THE COLLECTOR COMES AT ONCE', color: C.coll }
      : near && !t && atBar(p) ? { title: 'E  THE BAR', odds: 'DRINKS FOR CASH: AN EDGE WHILE THE BUZZ LASTS.', color: C.pinkHi } : null);
    // nothing left to bet: say where to go (critic F1)
    if (inGame && s.phase === 'floor' && this.started && s.bank < 100 && !Object.values(s.tables).some((x) => x.pending)) this.teach('broke');
    const b = this.view.box.css;
    const hp: Pointer = { x: ((i.mouse.x - b.x) / b.w) * HUD_W, y: ((i.mouse.y - b.y) / b.h) * HUD_H, down: i.mouse.down[0], pressed: i.mouse.pressed[0] };
    const overlay = this.screen === 'game' && walks(s.phase) && !this.fp.seated && !this.cageOpen && !this.barOpen
      ? (!this.started ? 'enter' : this.relock ? 'relock' : this.paused ? 'paused' : null)
      : null;
    const acts = this.hud.draw(
      {
        screen: this.screen, state: this.screen === 'title' || this.screen === 'howto' ? null : s, player: ME,
        seated: this.fp.seated, atCollector: atColl,
        prompt: t ? this.promptFor(t) : cagePrompt,
        overlay: this.confirm ? null : overlay, confirm: this.confirm, cage: inGame && walks(s.phase) ? this.cageView() : null,
        bar: inGame && s.phase === 'floor' ? { open: this.barOpen, why: new Map(DRINKS.map((d) => [d.id, cantOrder(this.game, p, d.id)])) } : null,
        toasts: this.toasts, lesson: this.lesson, banner: this.banner, settings: this.settings, meta: this.meta, dark: this.dark, duel: this.duelHud,
        fade: this.fade ? { a: this.fade.a, text: this.fade.text } : null,
        free: !i.locked,
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

  /** Step onto the floor without pointer lock (headless browsers): the run starts at home and the
   *  car is taken through the real command path, unless `atHome` keeps you in the house. */
  enter(atHome = false) {
    if (this.screen !== 'game') this.newRun(1);
    this.started = true;
    this.paused = false;
    const s = this.game.state;
    if (!atHome && s.phase === 'home') {
      const p = this.me();
      p.x = CAR_STAND_AT.x;
      p.z = CAR_STAND_AT.z;
      this.send({ t: 'drive' });
      this.skipTo(this.game.tick + 1);
      this.started = true;
    }
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
    this.crowd.dispose();
    this.tablePlay.dispose();
    this.home.dispose();
    this.family.dispose();
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
