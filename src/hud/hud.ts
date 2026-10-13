// The HUD: a 640×360 2D canvas over the 3D view, scaled with it (THREEJS-NOTES rule 4: one UI
// code path for the HUD and the table panels). In play: the clock, the bank against the quota,
// lives, souls, markers, charms, marks, the seat prompt, toasts and the lesson cards. Around play:
// the title, how to play, settings, the cage, pause and the results. It returns what was clicked;
// the app turns that into commands or screens. It never touches the sim's state.
import { UI, type Pointer } from '../ui/ui';
import { C, TIER_ROLE } from '../data/palette';
import { ICON, textWidth } from '../ui/font';
import type { State } from '../sim/state';
import { TICKS_PER_S } from '../sim/state';
import type { Input } from '../engine/input';
import { CHARMS, UPGRADES, CHARM_BY_ID, type CharmId, type UpgradeId } from '../data/charms';
import { MARK_BY_ID } from '../data/marks';
import { ECONOMY } from '../data/economy';
import { money } from '../panels/table';

export const HUD_W = 640;
export const HUD_H = 360;

export type Screen = 'title' | 'howto' | 'settings' | 'game' | 'results';

export interface Settings {
  sens: number;
  invert: boolean;
  master: number;
  music: number;
  sfx: number;
  scaling: 'auto' | 'pixel' | 'fill';
  bloom: boolean;
}

export interface Meta {
  upgrades: UpgradeId[];
  runs: number;
  wins: number;
  bestNight: number;
  lessons: string[];
}

export interface Toast {
  text: string;
  color: number;
  t: number;
}

export interface Lesson {
  title: string;
  body: string;
  t: number;
}

export interface HudView {
  screen: Screen;
  state: State | null;
  player: number;
  /** when a table is in reach: "E  SIT  HI-LO DICE" and its odds line, in its tier color
   *  (pillar 5: tier, odds and loss cost readable in one glance, before you even sit) */
  prompt: { title: string; odds: string; color: number } | null;
  seated: boolean;
  /** seated at the Collector's table (0:00 onward): no stand-up hint */
  atCollector: boolean;
  overlay: 'enter' | 'paused' | 'relock' | null;
  cage: { open: boolean; why: Map<string, string | null>; slots: number } | null;
  toasts: Toast[];
  lesson: Lesson | null;
  banner: { text: string; sub: string; color: number; t: number } | null;
  settings: Settings;
  meta: Meta;
  /** 0..1, how dark the room is (the 0:00 drop) */
  dark: number;
}

export type HudAction =
  | { t: 'newRun' } | { t: 'screen'; to: Screen } | { t: 'resume' } | { t: 'buy'; item: string }
  | { t: 'closeCage' } | { t: 'set'; settings: Partial<Settings> } | { t: 'quit' };

/** A mark's effect in a few words, for the HUD's list (the lesson card says it in full). */
const MARK_SHORT: Record<string, (stacks: number) => string> = {
  hilo: (n) => `-${n * 5}% HI-LO`, colddeck: () => '-10% PAY', sticky: () => '-30% WALK', blackout: () => 'ODDS HIDDEN', tax: () => '-5% BANK',
};

const clockText = (ticks: number) => {
  const secs = Math.ceil(ticks / TICKS_PER_S);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
};

export class Hud {
  readonly ui = new UI();
  private ctx: CanvasRenderingContext2D;

  constructor(readonly canvas: HTMLCanvasElement) {
    canvas.width = HUD_W;
    canvas.height = HUD_H;
    this.ctx = canvas.getContext('2d')!;
  }

  draw(v: HudView, pointer: Pointer, dt: number, input: Input): HudAction[] {
    const ui = this.ui;
    const out: HudAction[] = [];
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, HUD_W, HUD_H);
    ui.begin(this.ctx, pointer, 1, dt, input);
    if (v.screen === 'title') this.title(ui, v, out);
    else if (v.screen === 'howto') this.howto(ui, out);
    else if (v.screen === 'settings') this.settings(ui, v, out);
    else if (v.state) {
      this.play(ui, v);
      if (v.cage?.open) this.cage(ui, v, out);
      if (v.screen === 'results') this.results(ui, v, out);
      else if (v.overlay) this.pause(ui, v, out);
    }
    ui.end();
    return out;
  }

  // ---------------------------------------------------------------- in play

  private play(ui: UI, v: HudView) {
    const s = v.state!;
    const me = s.players[v.player];

    // top left: the clock, counting down to 0:00
    const urgent = s.phase === 'floor' && s.clock < 30 * TICKS_PER_S;
    const flash = urgent && Math.floor(ui.time * 2) % 2 === 0;
    ui.panel(6, 6, 84, 26, 'dark', { blocking: false, edge: urgent ? C.blood : C.smoke });
    ui.text(ICON.clock, 12, 15, C.dust);
    ui.text(s.phase === 'floor' ? clockText(s.clock) : '0:00', 24, 11, flash ? C.blood : C.white, { scale: 2 });
    ui.text(`N${s.night}`, 84, 10, C.ash, { align: 'right' });

    // top center: the bank against the quota
    const bw = 220, bx = (HUD_W - bw) / 2;
    ui.panel(bx, 6, bw, 26, 'dark', { blocking: false });
    ui.text('BANK', bx + 6, 10, C.dust);
    ui.text(money(s.bank), bx + 6 + textWidth('BANK') + 6, 10, C.gold);
    ui.text(`QUOTA ${money(s.quota)}`, bx + bw - 6, 10, C.bone, { align: 'right' });
    // gold, not a tier color (tier hues belong to the tiers: STYLE.md); bone once the quota is met
    ui.bar(bx + 6, 22, bw - 12, 6, s.bank / s.quota, s.bank >= s.quota ? C.bone : C.gold);

    // top right: lives, souls, markers (F10: each count next to its name)
    const rw = 132, rx = HUD_W - 6 - rw;
    ui.panel(rx, 6, rw, 26, 'dark', { blocking: false });
    const shown = Math.max(ECONOMY.startLives.v, me.lives);
    for (let i = 0; i < shown; i++) ui.text(ICON.heart, rx + 6 + i * 8, 9, i < me.lives ? C.blood : C.smoke);
    ui.text(`${ICON.marker} ${s.markers} MARKERS`, rx + rw - 6, 9, C.marker, { align: 'right' });
    ui.text(me.ghost ? `${ICON.soul} GHOST` : `${me.lives} ${me.lives === 1 ? 'LIFE' : 'LIVES'}`, rx + 6, 20, me.ghost ? C.soul : C.ash);
    const souls = s.players.filter((p) => p.ghost).length;
    ui.text(`${ICON.soul} ${souls} SOULS HELD`, rx + rw - 6, 20, souls ? C.soul : C.ash, { align: 'right' });

    // under it: your charms and an Overclock window
    let cy = 36;
    for (const id of me.charms) {
      const c = CHARM_BY_ID.get(id)!;
      ui.text(c.name.toUpperCase(), HUD_W - 8, cy, C.collHi, { align: 'right' });
      cy += 9;
    }
    if (me.overclock > 0) ui.text(`OVERCLOCK x2  ${Math.ceil(me.overclock / TICKS_PER_S)}S`, HUD_W - 8, cy, C.gold, { align: 'right' });

    // bottom left: active marks (marks may wear the mid tier's yellow: they are its price)
    const mine = s.marks.filter((m) => m.player === v.player || m.player === -1);
    let my = HUD_H - 8 - mine.length * 13;
    for (const m of mine) {
      const d = MARK_BY_ID.get(m.id)!;
      const label = `${ICON.mark} ${d.name.toUpperCase()}${m.stacks > 1 ? ' x' + m.stacks : ''}  ${MARK_SHORT[m.id](m.stacks)}  ${Math.ceil(m.left / TICKS_PER_S)}S`;
      ui.panel(6, my - 2, textWidth(label) + 10, 12, 'dark', { blocking: false, edge: TIER_ROLE.mid.lo });
      ui.text(label, 11, my, C.midHi);
      my += 13;
    }

    // walking: a crosshair dot and, at a table, its prompt low on the screen (clear of the panel)
    if (!v.seated && !v.overlay && s.phase === 'floor') {
      ui.fill(HUD_W / 2, HUD_H / 2, 1, 1, C.white);
      if (v.prompt) {
        const { title, odds, color } = v.prompt;
        const w = Math.max(textWidth(title), textWidth(odds)) + 16;
        const py = HUD_H - 52;
        ui.panel((HUD_W - w) / 2, py, w, 28, 'dark', { blocking: false, edge: color });
        ui.text(title, HUD_W / 2, py + 4, C.white, { align: 'center' });
        ui.text(odds, HUD_W / 2, py + 16, color, { align: 'center' });
      }
    }
    if (v.screen === 'game' && v.seated && !v.atCollector && !v.cage?.open) ui.text('E / ESC  STAND UP', HUD_W / 2, HUD_H - 12, C.ash, { align: 'center' });

    // toasts rise from just under the crosshair; seated, from under the table's screen
    const ty = v.seated ? HUD_H - 30 : HUD_H / 2 + 40;
    v.toasts.forEach((t, i) => {
      const a = Math.min(1, t.t);
      const y = ty - (2.2 - t.t) * (v.seated ? 6 : 14) - i * 11;
      if (a > 0.15) ui.text(t.text, HUD_W / 2, Math.round(y), t.color, { align: 'center' });
    });

    // a banner (night start, 0:00, a life)
    if (v.banner && v.banner.t > 0) {
      const b = v.banner;
      // seated, the screen fills the middle: the banner goes under it
      const by = v.seated ? 284 : 92;
      ui.text(b.text, HUD_W / 2, by, b.color, { scale: 3, align: 'center' });
      if (b.sub) ui.text(b.sub, HUD_W / 2, by + 28, C.bone, { align: 'center' });
    }

    // a lesson card: two lines, the first time each thing happens (held back while the cage is open)
    if (v.lesson && v.lesson.t > 0 && !v.cage?.open) {
      const l = v.lesson;
      const w = Math.max(textWidth(l.title), textWidth(l.body)) + 20;
      ui.panel((HUD_W - w) / 2, 40, w, 30, 'dark', { blocking: false, edge: C.coll });
      ui.text(l.title, HUD_W / 2, 45, C.collHi, { align: 'center' });
      ui.text(l.body, HUD_W / 2, 57, C.bone, { align: 'center' });
    }
  }

  // ---------------------------------------------------------------- the cage

  private cage(ui: UI, v: HudView, out: HudAction[]) {
    const s = v.state!;
    const me = s.players[v.player];
    const cg = v.cage!;
    const w = 420, h = 292, x = (HUD_W - w) / 2, y = 38;
    ui.fill(0, 0, HUD_W, HUD_H, C.ink, 0.5);
    ui.panel(x, y, w, h, 'dark', { edge: C.marker });
    ui.text('THE CAGE', x + 10, y + 7, C.marker, { scale: 2 });
    ui.text(`${ICON.marker} ${s.markers} MARKERS TO SPEND`, x + w - 10, y + 10, C.white, { align: 'right' });
    ui.text(`CHARMS: WORN BY YOU, ${me.charms.length} OF ${cg.slots} SLOTS. EACH TOUCHES TWO THINGS.`, x + 10, y + 28, C.dust);
    let ry = y + 40;
    for (const c of CHARMS) {
      const worn = me.charms.includes(c.id as CharmId);
      const why = cg.why.get(c.id) ?? null;
      ui.panel(x + 8, ry, w - 16, 30, 'inset', { blocking: false });
      ui.text(c.name.toUpperCase(), x + 14, ry + 4, worn ? C.collHi : C.white);
      ui.text(`${c.price} ${ICON.marker}`, x + 120, ry + 4, C.marker);
      ui.text(c.text[0], x + 150, ry + 4, C.bone);
      ui.text(c.text[1], x + 150, ry + 16, C.bone);
      ui.text(c.systems.join(' + ').toUpperCase(), x + 14, ry + 16, C.ash);
      if (ui.button(`buy-${c.id}`, x + w - 74, ry + 5, 60, 20, worn ? 'WORN' : 'BUY', { edge: C.marker, disabled: !!why, tip: worn ? 'You wear it.' : why ? cap(why) : `Costs ${c.price} markers.` })) out.push({ t: 'buy', item: c.id });
      ry += 33;
    }
    ui.text('UPGRADES: PERMANENT, FOR EVERY RUN FROM NOW ON.', x + 10, ry + 2, C.dust);
    ry += 13;
    for (const u of UPGRADES) {
      const owned = s.upgrades.includes(u.id);
      const why = cg.why.get(u.id) ?? null;
      ui.panel(x + 8, ry, w - 16, 18, 'inset', { blocking: false });
      ui.text(u.name.toUpperCase(), x + 14, ry + 5, owned ? C.collHi : C.white);
      ui.text(`${u.price} ${ICON.marker}`, x + 120, ry + 5, C.marker);
      ui.text(u.text, x + 150, ry + 5, C.bone);
      if (ui.button(`buy-${u.id}`, x + w - 74, ry + 1, 60, 16, owned ? 'OWNED' : 'BUY', { edge: C.marker, disabled: !!why, tip: owned ? 'Yours for good.' : why ? cap(why) : `Costs ${u.price} markers.` })) out.push({ t: 'buy', item: u.id });
      ry += 20;
    }
    const solo = s.players.length === 1;
    ui.text(solo ? `${ICON.soul} SOULS: BOUGHT BACK HERE FOR 50% OF THE QUOTA (CO-OP).` : `${ICON.soul} SOUL BUYBACK: 50% OF THE QUOTA`, x + 10, ry + 4, C.soulLo);
    if (ui.button('closecage', x + w / 2 - 50, y + h - 26, 100, 20, 'CLOSE (E)', { tip: 'Back to the floor.' })) out.push({ t: 'closeCage' });
  }

  // ---------------------------------------------------------------- around play

  private card(ui: UI, w: number, h: number, edge = C.coll) {
    const x = Math.round((HUD_W - w) / 2), y = Math.round((HUD_H - h) / 2);
    ui.panel(x, y, w, h, 'dark', { edge });
    return { x, y };
  }

  private title(ui: UI, v: HudView, out: HudAction[]) {
    ui.fill(0, 0, HUD_W, HUD_H, C.ink, 0.55);
    ui.text('THE VIG', HUD_W / 2, 52, C.collHi, { scale: 4, align: 'center' });
    ui.text('THE HOUSE TAKES ITS CUT. EVERY NIGHT, A BIGGER ONE.', HUD_W / 2, 90, C.bone, { align: 'center' });
    const bx = HUD_W / 2 - 70;
    if (ui.button('newrun', bx, 128, 140, 24, 'NEW RUN', { edge: C.coll, tip: 'Three nights. Make the quota or pay in lives.' })) out.push({ t: 'newRun' });
    if (ui.button('howto', bx, 158, 140, 20, 'HOW TO PLAY')) out.push({ t: 'screen', to: 'howto' });
    if (ui.button('settings', bx, 184, 140, 20, 'SETTINGS')) out.push({ t: 'screen', to: 'settings' });
    const m = v.meta;
    const record = m.runs ? `RUNS ${m.runs}   WALKED OUT ${m.wins}   BEST NIGHT ${m.bestNight}` : 'NO RUNS YET';
    ui.text(record, HUD_W / 2, 220, C.dust, { align: 'center' });
    if (m.upgrades.length) ui.text(`UPGRADES: ${m.upgrades.map((u) => UPGRADES.find((x) => x.id === u)!.name.toUpperCase()).join(', ')}`, HUD_W / 2, 232, C.collHi, { align: 'center' });
    ui.text('WASD WALK   MOUSE LOOK   E SIT / STAND / CAGE   ESC PAUSE', HUD_W / 2, 330, C.ash, { align: 'center' });
    ui.text('NO REAL MONEY. EVER. EVERY ODD IS PRINTED.', HUD_W / 2, 342, C.smoke, { align: 'center' });
  }

  private howto(ui: UI, out: HudAction[]) {
    ui.fill(0, 0, HUD_W, HUD_H, C.ink, 0.7);
    const { x, y } = this.card(ui, 520, 300);
    ui.text('HOW TO PLAY', HUD_W / 2, y + 8, C.collHi, { scale: 2, align: 'center' });
    const lines: [string, number][] = [
      ['EVERY NIGHT LASTS 6 MINUTES. AT 0:00 THE COLLECTOR WANTS THE QUOTA FROM THE BANK.', C.white],
      ['SHORT OF IT, HE TAKES A LIFE FOR EVERY $1,000 YOU ARE SHORT, AND THE WHOLE BANK.', C.blood],
      ['', 0],
      ['THE TABLES HAVE TIERS. SAFETY IS A SLOW LOSS:', C.white],
      [`  LOW (GREEN): RETURNS UNDER $1 PER $1. YOU LOSE THE BET.`, C.low],
      [`  MID (YELLOW): PAYS. A LOSS MARKS YOU OR THE WHOLE TEAM.`, C.mid],
      [`  HIGH (RED): PAYS BEST. LOSING CAN COST A LIFE.`, C.high],
      ['EVERY TABLE PRINTS ITS WIN CHANCE, PAYOUT AND LOSS COST. WALK UP, READ, PRESS E.', C.dust],
      ['', 0],
      ['HIGH-TABLE WINS EARN MARKERS. SPEND THEM AT THE CAGE (EAST WALL) ON CHARMS.', C.marker],
      ['', 0],
      ['MADE THE QUOTA? PAY IT, OR GAMBLE: PAY IT AND PLAY THE CIRCUIT AGAINST HIM.', C.collHi],
      ['INSPECT, REROUTE OR ACTIVATE CIRCUITS. AN OVERLOAD COSTS A LIFE; HIS COST HIM FUSES.', C.dust],
      ['WIN FOR THE BOON WHEEL. LOSE FOR THE BANE WHEEL AND A STEEPER QUOTA.', C.dust],
      ['', 0],
      ['SURVIVE THREE NIGHTS. LOSE YOUR LAST LIFE AND THE HOUSE KEEPS YOU.', C.white],
    ];
    lines.forEach(([l, c], i) => l && ui.text(l, x + 14, y + 36 + i * 14, c));
    if (ui.button('back', HUD_W / 2 - 50, y + 270, 100, 20, 'BACK')) out.push({ t: 'screen', to: 'title' });
  }

  private settings(ui: UI, v: HudView, out: HudAction[]) {
    ui.fill(0, 0, HUD_W, HUD_H, C.ink, 0.7);
    const { x, y } = this.card(ui, 360, 240);
    ui.text('SETTINGS', HUD_W / 2, y + 8, C.collHi, { scale: 2, align: 'center' });
    const st = v.settings;
    let ry = y + 40;
    const stepper = (id: string, label: string, val: string, dec: () => void, inc: () => void) => {
      ui.text(label, x + 20, ry + 4, C.bone);
      if (ui.button(`${id}-`, x + 200, ry, 24, 16, '-')) dec();
      ui.text(val, x + 260, ry + 4, C.white, { align: 'center' });
      if (ui.button(`${id}+`, x + 296, ry, 24, 16, '+')) inc();
      ry += 24;
    };
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
    stepper('sens', 'MOUSE SENSITIVITY', `${st.sens.toFixed(1)}x`, () => out.push({ t: 'set', settings: { sens: clamp(r1(st.sens - 0.1), 0.2, 3) } }), () => out.push({ t: 'set', settings: { sens: clamp(r1(st.sens + 0.1), 0.2, 3) } }));
    stepper('inv', 'INVERT MOUSE Y', st.invert ? 'ON' : 'OFF', () => out.push({ t: 'set', settings: { invert: !st.invert } }), () => out.push({ t: 'set', settings: { invert: !st.invert } }));
    stepper('master', 'VOLUME', `${Math.round(st.master * 100)}%`, () => out.push({ t: 'set', settings: { master: clamp(r1(st.master - 0.1), 0, 1) } }), () => out.push({ t: 'set', settings: { master: clamp(r1(st.master + 0.1), 0, 1) } }));
    stepper('sfx', 'SOUND EFFECTS', `${Math.round(st.sfx * 100)}%`, () => out.push({ t: 'set', settings: { sfx: clamp(r1(st.sfx - 0.1), 0, 1) } }), () => out.push({ t: 'set', settings: { sfx: clamp(r1(st.sfx + 0.1), 0, 1) } }));
    const modes = ['auto', 'pixel', 'fill'] as const;
    const mi = modes.indexOf(st.scaling);
    const names = { auto: 'AUTO', pixel: 'PIXEL-PERFECT', fill: 'FILL WINDOW' };
    stepper('scale', 'SCREEN SCALING', names[st.scaling], () => out.push({ t: 'set', settings: { scaling: modes[(mi + 2) % 3] } }), () => out.push({ t: 'set', settings: { scaling: modes[(mi + 1) % 3] } }));
    stepper('bloom', 'NEON GLOW', st.bloom ? 'ON' : 'OFF', () => out.push({ t: 'set', settings: { bloom: !st.bloom } }), () => out.push({ t: 'set', settings: { bloom: !st.bloom } }));
    ui.text('GLOW OFF RUNS FASTER ON A WEAK MACHINE.', HUD_W / 2, ry + 4, C.ash, { align: 'center' });
    if (ui.button('back', HUD_W / 2 - 50, y + 210, 100, 20, 'BACK')) out.push({ t: 'screen', to: v.state ? 'game' : 'title' });
  }

  private pause(ui: UI, v: HudView, out: HudAction[]) {
    ui.fill(0, 0, HUD_W, HUD_H, C.ink, 0.6);
    const enter = v.overlay === 'enter';
    const title = enter ? (v.state && v.state.night > 1 ? `NIGHT ${v.state.night}` : 'THE FLOOR') : 'PAUSED';
    const lines = enter
      ? [`QUOTA ${money(v.state!.quota)} BY 0:00.  BANK ${money(v.state!.bank)}.`, 'CLICK TO STEP ONTO THE FLOOR', 'WASD WALK  MOUSE LOOK  E SIT / STAND  ESC PAUSE']
      : v.overlay === 'relock' ? ['THE BROWSER HELD THE MOUSE BACK.', 'CLICK AGAIN TO RETURN TO THE FLOOR'] : ['THE CLOCK IS STOPPED.', 'CLICK TO RETURN TO THE FLOOR'];
    const w = 320, h = 70 + lines.length * 12;
    const px = (HUD_W - w) / 2, py = (HUD_H - h) / 2;
    ui.panel(px, py, w, h, 'dark', { edge: C.coll, blocking: false });
    ui.text(title, HUD_W / 2, py + 8, C.collHi, { scale: 2, align: 'center' });
    lines.forEach((l, i) => ui.text(l, HUD_W / 2, py + 28 + i * 12, i === lines.length - (enter ? 2 : 1) ? C.white : C.dust, { align: 'center' }));
    if (!enter) {
      if (ui.button('psettings', px + 40, py + h - 26, 110, 18, 'SETTINGS')) out.push({ t: 'screen', to: 'settings' });
      if (ui.button('quit', px + w - 150, py + h - 26, 110, 18, 'QUIT RUN', { tip: 'Back to the title. The run is lost.' })) out.push({ t: 'quit' });
    }
  }

  private results(ui: UI, v: HudView, out: HudAction[]) {
    const s = v.state!;
    const r = s.result!;
    ui.fill(0, 0, HUD_W, HUD_H, C.ink, 0.75);
    const { x, y } = this.card(ui, 420, 250, r.won ? C.coll : C.blood);
    ui.text(r.won ? 'YOU WALKED OUT' : 'THE HOUSE KEEPS YOU', HUD_W / 2, y + 10, r.won ? C.collHi : C.blood, { scale: 2, align: 'center' });
    ui.para(r.why, x + 20, y + 34, 380, C.bone);
    const st = s.stats;
    const nights = r.won ? s.night : s.night - 1;
    const rows: [string, string][] = [
      ['NIGHTS SURVIVED', `${nights} OF ${ECONOMY.nights.v}`],
      ['ROUNDS PLAYED', `${st.rounds} (${st.wins} WON)`],
      ['WON AT THE TABLES', money(st.won$)],
      ['LOST AT THE TABLES', money(st.lost$)],
      ['BIGGEST WIN', money(st.biggest)],
      ['LIVES LOST', `${st.livesLost}`],
      ['MARKS TAKEN', `${st.marks}`],
      ['MARKERS EARNED', `${st.markersEarned}`],
    ];
    rows.forEach(([k, val], i) => {
      ui.text(k, x + 40, y + 62 + i * 13, C.dust);
      ui.text(val, x + 380, y + 62 + i * 13, C.white, { align: 'right' });
    });
    if (s.upgrades.length) ui.text('YOUR UPGRADES CARRY INTO THE NEXT RUN.', HUD_W / 2, y + 172, C.collHi, { align: 'center' });
    if (ui.button('again', HUD_W / 2 - 110, y + 220, 100, 20, 'NEW RUN', { edge: C.coll })) out.push({ t: 'newRun' });
    if (ui.button('totitle', HUD_W / 2 + 10, y + 220, 100, 20, 'TITLE')) out.push({ t: 'screen', to: 'title' });
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1) + '.';
