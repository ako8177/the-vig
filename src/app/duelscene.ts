// The Collector's scene (DECISIONS #82, the owner's cinematic): from 0:00 to the wheel. You sit
// across from him; he speaks (his words type out with a low murmur); he asks you to pay or to play.
// Play, and the table turns over to the levers; the lounge music gives way to the duel's; he
// reaches across to pull his own; a live lever throws its current through whoever pulled it (you:
// the screen crackles white and shakes, you cry out; him: he convulses, cries out). He has a word
// after each pull. His second shock kills him; your second, he wonders aloud that you're breathing
// and moves on to your punishment. Presentation only: it reads sim events and state, and the only
// thing it sends is your pull or trace.
import type { Audio } from '../engine/audio/audio';
import type { PerspectiveCamera, Object3D } from 'three';
import type { SimEvent } from '../sim/events';
import type { Command } from '../sim/commands';
import type { State } from '../sim/state';
import type { Duel } from '../render3d/duel';
import type { FirstPerson } from '../render3d/fpcam';
import type { Room } from '../render3d/room';
import { FLOOR_1 } from '../data/floors';
import { LINES, collectorOf } from '../data/collectors';
import { C } from '../data/palette';
import { rulesFor } from '../sim/circuit';
import { murmur, scream } from './voice';
import { Tension } from './tension';

const CO = FLOOR_1.collector;
/** where the seated camera looks: at him over the screen while you talk; down at the levers and
 *  him while you play; at the screen for the wheel and the summary */
const LOOK = {
  talk: { x: CO.x, y: CO.eye.y + 0.06 - 2 * Math.tan(0.31), z: CO.eye.z + 0.6 - 2 },
  duel: { x: CO.x, y: CO.eye.y - 2 * Math.tan(0.4), z: CO.eye.z - 2 },
  choose: { x: CO.x, y: CO.eye.y - 2 * Math.tan(0.42), z: CO.eye.z - 2 },
  screen: CO.look,
};
/** while you talk you sit back a little, so he and his screen both fit */
const EYE = {
  talk: { x: CO.eye.x, y: CO.eye.y + 0.06, z: CO.eye.z + 0.6 },
  duel: CO.eye,
  choose: CO.eye,
  screen: CO.eye,
};
type Look = keyof typeof LOOK;

const CHARS_PER_S = 30;

export interface Subtitle {
  name: string;
  text: string;
  color: number;
}

export interface DuelHud {
  subtitle: Subtitle | null;
  /** 0..1: the current through you (the screen's arcs and flash) */
  zap: number;
  status: { you: number; youMax: number; him: number; himMax: number; live: number; levers: number; turn: 'you' | 'him' | null; traces: number } | null;
  prompt: string | null;
}

interface Line {
  who: 'coll' | 'sys';
  text: string;
  /** cut it off this far in (his last words) */
  cut?: number;
}

export class DuelScene {
  private lines: Line[] = [];
  private cur: Line | null = null;
  private shown = 0;
  private hold = 0;
  private murmurAcc = 0;
  private timers: { at: number; fn: () => void }[] = [];
  private clock = 0;
  private look: Look | null = null;
  private lastPhase = '';
  /** the duel is on the table and you may pull (after the flip and the rules) */
  private ready = false;
  /** the levers as the scene shows them: a pull appears when its animation gets there */
  private pulledShown: boolean[] = [];
  private zapT = 0;
  private shake = 0;
  private hovered = -1;
  private introduced = new Set<number>();
  private hisIdx = 0;
  readonly tension: Tension;

  constructor(
    private audio: Audio,
    private duel: Duel,
    private room: Room,
    private fp: FirstPerson,
    private send: (c: Command) => void,
    private pick: (objs: Object3D[]) => Object3D | null,
  ) {
    this.tension = new Tension(audio);
  }

  private after(s: number, fn: () => void) {
    this.timers.push({ at: this.clock + s, fn });
  }

  /** Queue his words (or a narrator's line). `interrupt` drops whatever was still to come. */
  say(texts: string[], who: 'coll' | 'sys' = 'coll', interrupt = false, cut?: number) {
    if (interrupt) {
      this.lines = [];
      this.cur = null;
    }
    texts.forEach((text, i) => this.lines.push({ who, text, cut: i === texts.length - 1 ? cut : undefined }));
  }

  private pickLine(set: string[][], s: State): string[] {
    const fill = (t: string) => t.replace('{quota}', `$${s.quota.toLocaleString('en-US')}`).replace('{short}', `$${Math.max(0, s.quota - s.bank).toLocaleString('en-US')}`);
    return set[Math.floor(Math.random() * set.length)].map(fill);
  }

  private setLook(l: Look, cam: PerspectiveCamera) {
    if (this.look === l) return;
    this.look = l;
    this.fp.sit(cam, EYE[l], LOOK[l]);
  }

  /** Back to the table as it was: the top down, the screen up, him alive with his own eyes. */
  reset(s: State) {
    this.timers = [];
    this.lines = [];
    this.cur = null;
    this.ready = false;
    this.zapT = 0;
    this.look = null;
    this.tension.stop();
    if (this.duel.flipped || this.duel.flipping) this.duel.flip(false, () => this.showScreen(true));
    else this.showScreen(true);
    this.hisIdx = s.collector.idx;
    this.duel.reset(collectorOf(s.collector.idx).eyes);
  }

  private showScreen(on: boolean) {
    const m = this.room.screens.get('collector');
    if (m) m.visible = on;
    this.room.collectorFrame.visible = on;
  }

  private zapYou(big: boolean) {
    this.zapT = big ? 1.7 : 1.3;
    this.shake = 1;
    this.audio.sfx('zap', big ? 1.2 : 1);
    scream(this.audio, 'you');
  }

  event(e: SimEvent, s: State) {
    switch (e.t) {
      case 'midnight': {
        this.reset(s);
        const who = collectorOf(s.collector.idx);
        // a new Collector introduces himself, the first night he sits down
        if (who.intro && !this.introduced.has(s.collector.idx)) {
          this.introduced.add(s.collector.idx);
          this.say(who.intro);
        }
        break;
      }
      case 'choice':
        this.say(this.pickLine(LINES.made, s));
        break;
      case 'shortfall':
        this.say(this.pickLine(LINES.short, s));
        break;
      case 'paid':
        if (!s.circuit) this.say(this.pickLine(LINES.paid, s), 'coll', true);
        break;
      case 'circuit': {
        const c = s.circuit!;
        const i = e.slot;
        if (e.who === 'team' && e.action === 'inspect') {
          this.audio.sfx('inspect');
          break;
        }
        if (e.who === 'team') {
          this.pulledShown[i] = true;
          this.duel.pull(i, !!e.over);
          this.audio.sfx('lever');
          if (e.over) {
            this.tension.heat = Math.min(1, this.tension.heat + 0.3);
            const last = !!c.done && !c.done.won;
            this.after(0.08, () => this.zapYou(last));
            if (last) {
              this.after(0.9, () => this.tension.stop());
              this.after(2.4, () => this.say(this.pickLine(LINES.youLost, s), 'coll', true));
            } else this.after(1.9, () => this.say(this.pickLine(LINES.youShocked, s), 'coll', true));
          } else {
            this.audio.sfx('safe', 0.6);
            if (Math.random() < 0.6) this.after(0.7, () => this.say(this.pickLine(LINES.youSafe, s), 'coll', true));
          }
        } else {
          // his pull: he leans in and reaches across, the lever goes down, then the current
          this.duel.reach(i);
          const dies = !!e.over && !!c.done?.won;
          this.after(0.45, () => {
            this.pulledShown[i] = true;
            this.duel.pull(i, !!e.over);
            this.audio.sfx('lever');
          });
          if (e.over) {
            this.tension.heat = Math.min(1, this.tension.heat + 0.3);
            this.after(0.55, () => {
              this.audio.sfx('zap', dies ? 1.3 : 1);
              scream(this.audio, 'him');
              if (dies) this.duel.die();
              else this.duel.shock();
            });
            if (dies) {
              this.after(1.0, () => this.tension.stop());
              this.after(1.4, () => this.say(this.pickLine(LINES.hisDeath, s), 'coll', true, 11));
              this.after(3.2, () => this.say([`${collectorOf(s.collector.idx).name} IS DEAD. THE QUOTA STAYS IN YOUR BANK.`], 'sys'));
            } else this.after(2.3, () => this.say(this.pickLine(LINES.hisShocked, s), 'coll', true));
          } else if (Math.random() < 0.6) this.after(1.1, () => this.say(this.pickLine(LINES.hisSafe, s), 'coll', true));
        }
        break;
      }
      case 'circuitEnd':
        // the table turns back over before the wheel comes up on its screen
        this.after(4.2, () => {
          this.ready = false;
          this.duel.flip(false, () => {
            this.showScreen(true);
            this.audio.sfx('thunk');
          });
        });
        break;
    }
  }

  /** Every frame: the phase's beats, his words, the levers, your hover, the current. */
  frame(dt: number, s: State, cam: PerspectiveCamera, mouse: { x: number; y: number; left: boolean; right: boolean }): DuelHud {
    this.clock += dt;
    for (const t of this.timers.filter((x) => x.at <= this.clock)) t.fn();
    this.timers = this.timers.filter((x) => x.at > this.clock);
    const ph = s.phase;
    const atTable = ph === 'midnight' || ph === 'choice' || ph === 'circuit' || ph === 'wheel' || ph === 'summary';
    if (ph !== this.lastPhase) {
      if (ph === 'circuit') this.begin(s);
      if (ph === 'floor' || ph === 'home') {
        // a new night: whoever died is replaced, the table is set again
        if (this.hisIdx !== s.collector.idx || this.duel.flipped) this.reset(s);
        this.look = null;
      }
      this.lastPhase = ph;
    }
    if (atTable) {
      // he speaks with you sat back; you lean in to read his screen when the choice is yours (his
      // eyes stay at the top of the frame), and again for the wheel and the summary
      const look: Look = ph === 'circuit' ? (this.duel.flipped || this.duel.flipping ? 'duel' : 'talk') : ph === 'choice' ? 'choose' : ph === 'wheel' || ph === 'summary' ? 'screen' : 'talk';
      this.setLook(look, cam);
    }

    // his words: typed out, a murmur as they come, held, then the next
    if (!this.cur && this.lines.length) {
      this.cur = this.lines.shift()!;
      this.shown = 0;
      this.hold = 0;
    }
    let subtitle: Subtitle | null = null;
    if (this.cur) {
      const full = this.cur.cut ?? this.cur.text.length;
      if (this.shown < full) {
        this.shown = Math.min(full, this.shown + dt * CHARS_PER_S);
        this.murmurAcc += dt;
        if (this.cur.who === 'coll' && this.murmurAcc > 0.11) {
          this.murmurAcc = 0;
          murmur(this.audio, 1 - this.hisIdx * 0.08);
        }
      } else this.hold += dt;
      const who = collectorOf(s.collector.idx);
      subtitle = { name: this.cur.who === 'coll' ? who.name : '', text: this.cur.text.slice(0, Math.floor(this.shown)), color: this.cur.who === 'coll' ? who.eyes : C.bone };
      this.duel.talk(this.cur.who === 'coll' && this.shown < full);
      if (this.hold > 1.3 + full * 0.035 || (this.cur.cut && this.hold > 0.5)) this.cur = null;
    } else this.duel.talk(false);

    // the levers and your hand on them
    const c = ph === 'circuit' ? s.circuit : null;
    let prompt: string | null = null;
    let status: DuelHud['status'] = null;
    if (c) {
      this.duel.setLevers(c.levers.map((l, i) => ({ pulled: !!this.pulledShown[i], known: l.known && (!l.pulled || !!this.pulledShown[i]), live: l.live })));
      const r = rulesFor(s.floor);
      const mine = this.ready && c.turn === 'team' && !c.done;
      status = {
        you: c.shocks[0] ?? 0, youMax: r.playerShocks, him: c.hisShocks, himMax: r.collShocks, live: c.live, levers: c.levers.length,
        turn: c.done || !this.ready ? null : c.turn === 'team' ? 'you' : 'him', traces: c.traces[0] ?? 0,
      };
      let hov = -1;
      if (mine) {
        const hit = this.pick(this.duel.pickables);
        const i = hit ? (hit.userData.lever as number) : -1;
        if (i >= 0 && !c.levers[i].pulled) hov = i;
      }
      if (hov !== this.hovered) {
        this.hovered = hov;
        this.duel.hover(hov);
        if (hov >= 0) this.audio.sfx('tick', 0.5);
      }
      if (hov >= 0) {
        const lv = c.levers[hov];
        const traced = lv.known ? (lv.live ? ' (TRACED: LIVE)' : ' (TRACED: DEAD)') : '';
        prompt = `#${hov + 1}${traced}  CLICK: PULL${c.traces[0] > 0 && !lv.known ? `   RIGHT-CLICK: TRACE THE WIRE (${c.traces[0]} LEFT)` : ''}`;
        if (mouse.left) this.send({ t: 'activate', circuit: hov });
        else if (mouse.right && c.traces[0] > 0 && !lv.known) this.send({ t: 'inspect', circuit: hov });
      } else if (mine) prompt = 'YOUR PULL: CHOOSE A LEVER';
    }

    const r = this.duel.update(dt, performance.now() / 1000);
    if (r.spark) this.audio.sfx('spark', 0.5 + Math.random() * 0.4);
    this.tension.update();
    this.zapT = Math.max(0, this.zapT - dt);
    return { subtitle, zap: Math.min(1, this.zapT / 1.1), status, prompt };
  }

  /** The challenge accepted: his word, the table turns over, the rules, the music. */
  private begin(s: State) {
    this.pulledShown = s.circuit!.levers.map(() => false);
    this.ready = false;
    this.say(this.pickLine(LINES.challenge, s), 'coll', true);
    this.after(2.2, () => {
      this.showScreen(false);
      this.audio.sfx('flip');
      this.duel.flip(true, () => {
        this.audio.sfx('thunk');
        this.say(this.pickLine(LINES.rules, s));
        this.tension.start();
        this.after(1.2, () => (this.ready = true));
      });
    });
  }

  /** The current through you: the camera shakes and struggles (call after the camera is placed). */
  applyCamera(cam: PerspectiveCamera, dt: number) {
    if (this.zapT > 0) {
      const k = 0.5 + 0.5 * Math.min(1, this.zapT);
      cam.position.x += (Math.random() - 0.5) * 0.06 * k;
      cam.position.y += (Math.random() - 0.5) * 0.05 * k;
      cam.rotateZ((Math.random() - 0.5) * 0.18 * k);
      cam.rotateX((Math.random() - 0.5) * 0.08 * k);
    } else if (this.shake > 0) {
      // after it: a shudder that fades
      this.shake = Math.max(0, this.shake - dt * 0.8);
      cam.rotateZ(Math.sin(this.clock * 23) * 0.01 * this.shake);
    }
  }

  /** The mouse belongs to the levers while the table is turned (the screen is face down). */
  get blocksPanel() {
    return this.duel.flipped || this.duel.flipping;
  }
}
