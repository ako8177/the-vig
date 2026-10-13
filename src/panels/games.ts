// The six floor-1 tables' panels: each draws its game (reels, dice, cards, the wheel) under the
// shared odds block (table.ts) and sends its commands. Faces in the air spin from the sim's tick;
// they land on the outcome the sim already drew.
import type { UI } from '../ui/ui';
import type { PanelView } from './panel';
import { PANEL_W } from './panel';
import { TablePanel, CTRL_Y, PLAY_Y, drawCard, drawDie, money } from './table';
import { C, TIER_ROLE } from '../data/palette';
import { ICON } from '../ui/font';
import { BLANK, BAR, STAR, SEVEN, STRIP, linePays } from '../sim/tables/bandit';
import { MARK_SLOTS, WHEEL_SLOTS } from '../sim/tables/wheel';
import { handValue } from '../sim/tables/twentyone';
import { hiloMarkSOf, streakLimitOf, streakRisk } from './view';
import { HILO_MARK } from '../data/marks';
import { ECONOMY } from '../data/economy';
import { minBet } from '../data/tables';
import { TICKS_PER_S } from '../sim/state';

/** A face that flickers while a round is in the air (deterministic from the tick). */
const flicker = (tick: number, n: number, salt: number, rate = 4) => (Math.floor(tick / rate) * 7 + salt * 13) % n;
const ease = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

// ---------------------------------------------------------------- The Bandit

export class BanditPanel extends TablePanel {
  constructor() {
    super('bandit');
  }

  private symbol(ui: UI, s: number, x: number, y: number) {
    if (s === SEVEN) ui.text('7', x + 20, y + 11, C.gold, { scale: 3, align: 'center' });
    else if (s === STAR) ui.text(ICON.star, x + 20, y + 14, C.white, { scale: 2, align: 'center' });
    else if (s === BAR) {
      ui.fill(x + 6, y + 15, 28, 13, C.smoke);
      ui.text('BAR', x + 20, y + 18, C.white, { align: 'center' });
    }
  }

  protected drawPlay(ui: UI, v: PanelView) {
    const { o, rolling } = this.shown(v);
    const t = this.progress(v);
    const x0 = 92;
    for (let i = 0; i < 3; i++) {
      const x = x0 + i * 46, y = PLAY_Y + 2;
      ui.fill(x, y, 42, 44, C.ink);
      ui.fill(x + 1, y + 1, 40, 42, C.bone);
      const stopped = !rolling || t >= 0.4 + i * 0.25;
      const stop = o?.reels ? o.reels[i] : i * 3;
      const sym = stopped ? STRIP[stop] : STRIP[flicker(v.tick, STRIP.length, i, 3)];
      if (sym !== BLANK) this.symbol(ui, sym, x + 1, y + 1);
      else ui.text('-', x + 21, y + 18, C.dust, { align: 'center' });
    }
    // the reel strip and the pay table, both printed: you can see how rare the 7 is
    const px = 12;
    ui.text('EACH REEL:', px, PLAY_Y + 4, C.dust);
    ui.text('7 x1', px, PLAY_Y + 14, C.gold);
    ui.text(`${ICON.star} x2`, px, PLAY_Y + 23, C.white);
    ui.text('BAR x3', px, PLAY_Y + 32, C.white);
    ui.text('BLANK x4', px, PLAY_Y + 41, C.ash);
    // the pay table, from the same function that pays it
    if (this.dark(v)) {
      this.result(ui, v);
      return;
    }
    const rows: [string, string][] = [
      ['7 7 7', `${linePays(SEVEN, SEVEN, SEVEN).x}x`],
      [`${ICON.star}${ICON.star}${ICON.star}`, `${linePays(STAR, STAR, STAR).x}x`],
      ['BAR x3', `${linePays(BAR, BAR, BAR).x}x`],
      ['ANY 3', `${linePays(SEVEN, STAR, BAR).x}x`],
      ['A 7', `${linePays(SEVEN, BLANK, BLANK).x}x`],
    ];
    rows.forEach(([a, b], i) => {
      ui.text(a, 238, PLAY_Y + 4 + i * 9, C.bone);
      ui.text(b, PANEL_W - 12, PLAY_Y + 4 + i * 9, C.gold, { align: 'right' });
    });
    this.result(ui, v);
  }

  protected drawControls(ui: UI, v: PanelView) {
    const bet = this.stake(v);
    if (this.betButton(ui, v, 'pull', 110, 100, `PULL  ${money(bet)}`, bet)) this.send({ t: 'spin', table: 'bandit' });
  }
}

// ---------------------------------------------------------------- Twenty-One

export class TwentyOnePanel extends TablePanel {
  constructor() {
    super('twentyone');
  }

  protected animating(v: PanelView) {
    return !!this.tableState(v).pending;
  }

  private row(ui: UI, label: string, cards: { r: number; s: number }[], hideHole: boolean, x: number) {
    const y = PLAY_Y + 14;
    const total = hideHole ? handValue(cards.slice(0, 1)).total : handValue(cards).total;
    ui.text(`${label} ${cards.length ? (hideHole ? total + ' +?' : total) : ''}`, x, PLAY_Y + 2, C.dust);
    cards.slice(0, 6).forEach((c, i) => drawCard(ui, x + i * 18, y, hideHole && i === 1 ? null : c));
  }

  protected drawPlay(ui: UI, v: PanelView) {
    const t = this.tableState(v);
    const hand = t.hand;
    const { o } = this.shown(v);
    if (hand && hand.stage === 'play') {
      this.row(ui, 'DEALER', hand.dealer, true, 12);
      this.row(ui, 'YOU', hand.player, false, 168);
      ui.text(`BET ${money(hand.bet)}`, PANEL_W - 12, PLAY_Y + 2, C.gold, { align: 'right' });
    } else if (o?.player21) {
      // the dealer's hand turns over while the result is in the air
      this.row(ui, 'DEALER', o.dealer21!, false, 12);
      this.row(ui, 'YOU', o.player21, false, 168);
    } else {
      ui.text('PLACE A BET TO DEAL.', PANEL_W / 2, PLAY_Y + 24, C.dust, { align: 'center' });
      if (!this.dark(v)) ui.text('NATURAL (A + 10) PAYS 3:2. A WIN PAYS 1:1.', PANEL_W / 2, PLAY_Y + 36, C.ash, { align: 'center' });
    }
    this.result(ui, v);
  }

  protected drawControls(ui: UI, v: PanelView) {
    const hand = this.tableState(v).hand;
    const tier = TIER_ROLE[this.def.tier];
    if (hand && hand.stage === 'play') {
      const off = !v.active || v.state.phase !== 'floor';
      if (ui.button('hit', 70, CTRL_Y, 84, 20, 'HIT', { edge: tier.base, disabled: off, tip: 'Take a card.' })) this.send({ t: 'call', table: 'twentyone', call: 'hit' });
      if (ui.button('stand', 166, CTRL_Y, 84, 20, 'STAND', { edge: tier.base, disabled: off, tip: 'The dealer draws to 17 (hits soft 17).' })) this.send({ t: 'call', table: 'twentyone', call: 'stand' });
      return;
    }
    [100, 200, 300].forEach((amount, i) => {
      const stake = this.stake(v, amount);
      if (this.betButton(ui, v, `bet${amount}`, 46 + i * 80, 68, `BET ${money(stake)}`, stake)) this.send({ t: 'bet', table: 'twentyone', amount });
    });
  }
}

// ---------------------------------------------------------------- Hi-Lo Dice

export class HiLoPanel extends TablePanel {
  constructor() {
    super('hilo');
  }

  protected drawPlay(ui: UI, v: PanelView) {
    const { o, rolling } = this.shown(v);
    const face = rolling ? flicker(v.tick, 6, 1, 3) + 1 : o?.dice?.[0] ?? 6;
    drawDie(ui, 142, PLAY_Y + 4, 36, face);
    // your marks: printed from the data (DESIGN.md §3); the stack where it stops paying is computed
    const s = v.state;
    const st = s.marks.find((m) => m.id === 'hilo' && m.player === v.player);
    const n = st?.stacks ?? 0;
    const losesAt = Math.floor((1 - 1 / this.def.rtp) / HILO_MARK.perStack) + 1;
    ui.text(`${ICON.mark} YOUR MARKS: ${n}`, 12, PLAY_Y + 6, n ? C.midHi : C.dust);
    ui.text(`-${Math.round(HILO_MARK.perStack * 100)}% A STACK, ${hiloMarkSOf(s)} S`, 12, PLAY_Y + 16, C.dust);
    ui.text(`AT ${losesAt} IT LOSES MONEY`, 12, PLAY_Y + 26, n >= losesAt ? C.midHi : C.ash);
    if (st) ui.text(`CLEARS IN ${Math.ceil(st.left / TICKS_PER_S)} S`, 12, PLAY_Y + 36, C.ash);
    const bet = minBet(this.def);
    const me = s.players[v.player];
    const f = 1 - HILO_MARK.perStack * n;
    const pay = Math.round(bet * this.def.pays! * f * (s.marks.some((m) => m.id === 'colddeck') ? 0.9 : 1) * (me.overclock > 0 ? 2 : 1));
    if (!this.dark(v)) {
      ui.text('A WIN PAYS', PANEL_W - 12, PLAY_Y + 6, C.dust, { align: 'right' });
      ui.text(money(pay), PANEL_W - 12, PLAY_Y + 16, C.gold, { align: 'right', scale: 2 });
    }
    this.result(ui, v);
  }

  protected drawControls(ui: UI, v: PanelView) {
    const bet = this.stake(v);
    if (this.betButton(ui, v, 'call-lo', 60, 96, 'CALL LO  1-3', bet)) this.send({ t: 'call', table: 'hilo', call: 'lo' });
    if (this.betButton(ui, v, 'call-hi', 164, 96, 'CALL HI  4-6', bet)) this.send({ t: 'call', table: 'hilo', call: 'hi' });
  }
}

// ---------------------------------------------------------------- The Wheel of Marks

export class WheelPanel extends TablePanel {
  constructor() {
    super('wheel');
  }

  protected drawPlay(ui: UI, v: PanelView) {
    const { o, rolling } = this.shown(v);
    const t = this.progress(v);
    const land = o?.slot ?? 0;
    // the wheel as a strip under a pointer: 11 of its 25 slots in view
    const pos = rolling ? land - (1 - ease(t)) * WHEEL_SLOTS * 3 : land;
    const W = 24, N = 11, x0 = PANEL_W / 2 - (N * W) / 2, y = PLAY_Y + 10;
    ui.fill(x0 - 2, y - 2, N * W + 4, 30, C.ink);
    const base = Math.floor(pos);
    const frac = pos - base;
    ui.clip(x0, y, N * W, 26);
    for (let k = -1; k <= N; k++) {
      const slot = (((base + k - 5) % WHEEL_SLOTS) + WHEEL_SLOTS) % WHEEL_SLOTS;
      const x = Math.round(x0 + (k - frac) * W);
      const mark = MARK_SLOTS.includes(slot);
      ui.fill(x + 1, y, W - 2, 26, mark ? C.midLo : C.night);
      ui.text(mark ? ICON.mark : '1.6', x + W / 2, y + 9, mark ? C.ink : C.bone, { align: 'center' });
    }
    ui.unclip();
    // the pointer
    ui.fill(PANEL_W / 2 - 1, y - 6, 3, 5, C.white);
    ui.fill(PANEL_W / 2 - 1, y + 27, 3, 5, C.white);
    ui.text(this.dark(v) ? `7 SLOTS ${ICON.mark} MARK THE TEAM:` : `18 SLOTS PAY 1.6x   7 SLOTS ${ICON.mark} MARK THE TEAM:`, PANEL_W / 2, PLAY_Y + 42, C.dust, { align: 'center' });
    ui.text('COLD DECK, STICKY FLOOR, BLACKOUT OR TAX', PANEL_W / 2, PLAY_Y + 51, C.midHi, { align: 'center' });
    this.result(ui, v);
  }

  protected drawControls(ui: UI, v: PanelView) {
    const bet = this.stake(v);
    if (this.betButton(ui, v, 'spin', 110, 100, `SPIN  ${money(bet)}`, bet)) this.send({ t: 'spin', table: 'wheel' });
  }
}

// ---------------------------------------------------------------- Red Line

export class RedLinePanel extends TablePanel {
  constructor() {
    super('redline');
  }

  protected drawPlay(ui: UI, v: PanelView) {
    const { o, rolling } = this.shown(v);
    const me = v.state.players[v.player];
    drawCard(ui, 148, PLAY_Y + 6, rolling ? null : o?.card ?? null);
    // the streak: one box a loss, the last box is a life
    const limit = streakLimitOf(v.state);
    const streak = rolling ? me.redStreak : me.redStreak;
    ui.text('LOSSES IN A ROW', 12, PLAY_Y + 4, C.dust);
    for (let i = 0; i < limit; i++) {
      const x = 12 + i * 22, y = PLAY_Y + 14;
      const filled = i < streak;
      const last = i === limit - 1;
      ui.fill(x, y, 18, 18, C.ink);
      ui.fill(x + 1, y + 1, 16, 16, filled ? C.highLo : C.night);
      if (last) ui.text(ICON.skull, x + 9, y + 6, filled ? C.white : C.high, { align: 'center' });
    }
    if (streak === limit - 1) ui.text('NEXT LOSS COSTS A LIFE', 12, PLAY_Y + 38, C.blood);
    else ui.text(`${limit} IN A ROW COSTS A LIFE`, 12, PLAY_Y + 38, C.ash);
    ui.text(`6 ROUNDS: ${Math.round(streakRisk(limit, 6) * 100)}% TO LOSE A LIFE`, 12, PLAY_Y + 48, C.highHi);
    const bet = minBet(this.def);
    if (!this.dark(v)) {
      ui.text('A WIN PAYS', PANEL_W - 12, PLAY_Y + 4, C.dust, { align: 'right' });
      ui.text(money(Math.round(bet * this.def.pays! * (me.overclock > 0 ? 2 : 1) * (v.state.marks.some((m) => m.id === 'colddeck') ? 0.9 : 1))), PANEL_W - 12, PLAY_Y + 14, C.gold, { align: 'right', scale: 2 });
    }
    const mk = ECONOMY.markers.redline.v * (me.charms.includes('magnet') ? 2 : 1);
    ui.text(`+${mk} ${ICON.marker} MARKER${mk > 1 ? 'S' : ''}`, PANEL_W - 12, PLAY_Y + 34, C.marker, { align: 'right' });
    this.result(ui, v);
  }

  protected drawControls(ui: UI, v: PanelView) {
    const bet = this.stake(v);
    if (this.betButton(ui, v, 'red', 60, 96, 'CALL RED', bet)) this.send({ t: 'call', table: 'redline', call: 'red' });
    if (this.betButton(ui, v, 'black', 164, 96, 'CALL BLACK', bet)) this.send({ t: 'call', table: 'redline', call: 'black' });
  }
}

// ---------------------------------------------------------------- Dead Man's Hand

export class DeadManPanel extends TablePanel {
  constructor() {
    super('deadman');
  }

  protected drawPlay(ui: UI, v: PanelView) {
    const { o, rolling } = this.shown(v);
    const a = rolling ? flicker(v.tick, 6, 2, 3) + 1 : o?.dice?.[0] ?? 6;
    const b = rolling ? flicker(v.tick, 6, 5, 3) + 1 : o?.dice?.[1] ?? 6;
    const snake = !rolling && o?.lifeLost;
    drawDie(ui, 122, PLAY_Y + 6, 34, a, snake ? C.blood : C.ink);
    drawDie(ui, 164, PLAY_Y + 6, 34, b, snake ? C.blood : C.ink);
    if (!this.dark(v)) {
      ui.text('WINS 6x:', 12, PLAY_Y + 4, C.dust);
      ui.text('ANY DOUBLE', 12, PLAY_Y + 14, C.bone);
      ui.text('OR 10, 11, 12', 12, PLAY_Y + 23, C.bone);
    }
    ui.text(`${ICON.skull} 1-1 COSTS A LIFE`, 12, PLAY_Y + 38, C.highHi);
    ui.text('1 IN 36 A ROLL (2.8%)', 12, PLAY_Y + 48, C.highHi);
    const me = v.state.players[v.player];
    const bet = minBet(this.def);
    if (!this.dark(v)) {
      ui.text('A WIN PAYS', PANEL_W - 12, PLAY_Y + 4, C.dust, { align: 'right' });
      ui.text(money(Math.round(bet * this.def.pays! * (me.overclock > 0 ? 2 : 1) * (v.state.marks.some((m) => m.id === 'colddeck') ? 0.9 : 1))), PANEL_W - 12, PLAY_Y + 14, C.gold, { align: 'right', scale: 2 });
    }
    const mk = ECONOMY.markers.deadman.v * (me.charms.includes('magnet') ? 2 : 1);
    ui.text(`+${mk} ${ICON.marker} MARKERS`, PANEL_W - 12, PLAY_Y + 34, C.marker, { align: 'right' });
    this.result(ui, v);
  }

  protected drawControls(ui: UI, v: PanelView) {
    const bet = this.stake(v);
    if (this.betButton(ui, v, 'roll', 100, 120, `ROLL  ${money(bet)}`, bet)) this.send({ t: 'spin', table: 'deadman' });
  }
}
