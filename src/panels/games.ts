// The six floor-1 tables' panels: each draws its game (reels, dice, cards, the wheel) under the
// shared odds block (table.ts) and sends its commands. Faces in the air spin from the sim's tick;
// they land on the outcome the sim already drew.
import type { UI } from '../ui/ui';
import type { PanelView } from './panel';
import { PANEL_W } from './panel';
import { TablePanel, CTRL_Y, PLAY_Y, drawCard, money } from './table';
import { C, PALETTE, TIER_ROLE, TIER_NAME } from '../data/palette';
import { FEEL } from '../data/feel';
import { clamp01, drawDieAt, drawThrownDie, drawTray, out3 } from './fx';
import { blackoutLeft, lossTextOf } from './view';
import { ICON } from '../ui/font';
import { BLANK, BAR, STAR, SEVEN, STRIP, linePays } from '../sim/tables/bandit';
import { MARK_SLOTS, WHEEL_SLOTS } from '../sim/tables/wheel';
import { handValue } from '../sim/tables/twentyone';
import { hiloMarkSOf, streakLimitOf, streakRisk } from './view';
import type { Outcome } from '../sim/state';
import { HILO_MARK } from '../data/marks';
import { ECONOMY } from '../data/economy';
import { minBet } from '../data/tables';
import { TICKS_PER_S } from '../sim/state';

/** A salt for a round's animation, so no two throws look the same (from the round count). */
const saltOf = (rounds: number, k = 0) => (rounds * 7 + k * 3) % 6;

// ---------------------------------------------------------------- The Bandit

export class BanditPanel extends TablePanel {
  /** reels already stopped this round (each one clunks once) */
  private stopped = [true, true, true];

  constructor() {
    super('bandit');
    this.popY = PLAY_Y + 24;
  }

  private symbol(ui: UI, s: number, x: number, y: number) {
    if (s === SEVEN) ui.text('7', x + 20, y + 11, C.gold, { scale: 3, align: 'center' });
    else if (s === STAR) ui.text(ICON.star, x + 20, y + 14, C.white, { scale: 2, align: 'center' });
    else if (s === BAR) {
      ui.fill(x + 6, y + 15, 28, 13, C.smoke);
      ui.text('BAR', x + 20, y + 18, C.white, { align: 'center' });
    } else ui.text('-', x + 21, y + 18, C.dust, { align: 'center' });
  }

  protected drawPlay(ui: UI, v: PanelView) {
    const { o, rolling } = this.shown(v);
    const t = this.progress(v);
    const x0 = 92, H = 42;
    if (rolling && t < 0.05) this.stopped = [false, false, false];
    for (let i = 0; i < 3; i++) {
      const x = x0 + i * 46, y = PLAY_Y + 2;
      ui.fill(x, y, 42, 44, C.ink);
      ui.fill(x + 1, y + 1, 40, 42, C.bone);
      const stopAt = FEEL.bandit.stops[i];
      const stop = o?.reels ? o.reels[i] : i * 3;
      const done = !rolling || t >= stopAt;
      if (rolling && done && !this.stopped[i]) {
        this.stopped[i] = true;
        this.sound('clunk', 0.9, 1 + i * 0.06);
      }
      ui.clip(x + 1, y + 1, 40, 42);
      if (!done) {
        // the strip runs past, fast, then slows into its stop
        const pos = stop - (1 - out3(t / stopAt)) * 30;
        const base = Math.floor(pos), frac = pos - base;
        for (let k = -1; k <= 1; k++) {
          const sym = STRIP[(((base + k) % STRIP.length) + STRIP.length) % STRIP.length];
          this.symbol(ui, sym, x + 1, y + 1 + Math.round((k - frac) * H));
        }
      } else {
        // a little bounce as it locks
        const since = rolling ? (t - stopAt) * FEEL.bandit.s : 1;
        const bob = since < 0.12 ? Math.round(Math.sin((since / 0.12) * Math.PI) * 4) : 0;
        this.symbol(ui, STRIP[stop], x + 1, y + 1 + bob);
      }
      ui.unclip();
    }
    // the reel strip and the pay table, both printed: you can see how rare the 7 is
    const px = 12;
    ui.text('EACH REEL:', px, PLAY_Y + 4, C.dust);
    ui.text('7 x1', px, PLAY_Y + 14, C.gold);
    ui.text(`${ICON.star} x2`, px, PLAY_Y + 23, C.white);
    ui.text('BAR x3', px, PLAY_Y + 32, C.white);
    ui.text('BLANK x4', px, PLAY_Y + 41, C.ash);
    if (!this.dark(v)) {
      // the pay table, from the same function that pays it
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
    }
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
    this.popX = 166;
  }

  protected drawPlay(ui: UI, v: PanelView) {
    const { o, rolling } = this.shown(v);
    const tx = 110, ty = PLAY_Y + 2, tw = 112, th = 58;
    drawTray(ui, tx, ty, tw, th);
    const rest = { x: tx + 48, y: ty + 32 };
    const face = o?.dice?.[0] ?? 6;
    if (rolling) drawThrownDie(ui, this.progress(v), { x: tx + tw - 14, y: ty + 18 }, rest, 24, face, saltOf(this.tableState(v).rounds));
    else drawDieAt(ui, rest.x, rest.y, 24, face);
    // what the call was, on the cloth
    if (o?.call) ui.text(o.call === 'hi' ? 'HI 4-6' : 'LO 1-3', tx + tw - 4, ty + th - 10, C.baizeHi, { align: 'right' });
    // your marks: printed from the data (DESIGN.md §3); the stack where it stops paying is computed
    const s = v.state;
    const st = s.marks.find((m) => m.id === 'hilo' && m.player === v.player);
    const n = st?.stacks ?? 0;
    const losesAt = Math.floor((1 - 1 / this.def.rtp) / HILO_MARK.perStack) + 1;
    ui.text(`${ICON.mark} YOUR MARKS: ${n}`, 12, PLAY_Y + 6, n ? C.midHi : C.dust);
    ui.text(`-${Math.round(HILO_MARK.perStack * 100)}% A STACK,`, 12, PLAY_Y + 16, C.dust);
    ui.text(`${hiloMarkSOf(s)} S EACH`, 12, PLAY_Y + 25, C.dust);
    ui.text(`AT ${losesAt} IT LOSES`, 12, PLAY_Y + 35, n >= losesAt ? C.midHi : C.ash);
    if (st) ui.text(`CLEARS IN ${Math.ceil(st.left / TICKS_PER_S)} S`, 12, PLAY_Y + 45, C.ash);
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

/**
 * A big-six wheel of 25 slots under a pointer at the top: lamps chase round the rim while it spins,
 * a peg clacks past the pointer every slot, and it slows onto the slot the sim drew. Drawn for this
 * game in the palette (DECISIONS #62): the wheel's spectacle is the reference, not anyone's art.
 */
export class WheelPanel extends TablePanel {
  private lastPeg = -1;
  private readonly cx = 246;
  private readonly cy = 104;
  private readonly r = 62;

  constructor() {
    super('wheel');
    this.popX = 246;
    this.popY = 104;
  }

  /** The wheel's turn (radians) with slot `slot` under the pointer. */
  private restAngle(slot: number, jitter = 0) {
    const th = (Math.PI * 2) / WHEEL_SLOTS;
    return -Math.PI / 2 - (slot + 0.5 + jitter) * th;
  }

  /** The wheel's angle now: slowing onto the landing slot over the round, else resting there. */
  private angle(v: PanelView, o: Outcome | null, rolling: boolean): number {
    const land = o?.slot ?? 0;
    const jitter = ((this.tableState(v).rounds * 37) % 9 - 4) / 14;
    const rest = this.restAngle(land, jitter);
    if (!rolling) return rest;
    const t = this.progress(v);
    return rest - (1 - out3(t)) * (FEEL.wheel.turns * Math.PI * 2 + 1.3);
  }

  protected draw(ui: UI, v: PanelView) {
    // its own layout: the odds down the left, the wheel big on the right
    this.watch(v);
    this.drawHeader(ui);
    this.drawSideOdds(ui, v);
    this.drawPlay(ui, v);
    this.drawControls(ui, v);
    this.drawCelebration(ui, v);
  }

  /** The odds block in a column (the same facts as every table: tier, win chance, payout, loss cost). */
  private drawSideOdds(ui: UI, v: PanelView) {
    const d = this.def;
    const tier = TIER_ROLE[d.tier];
    const bo = blackoutLeft(v.state);
    if (bo > 0) {
      ui.text(`${ICON.mark} BLACKOUT:`, 12, 30, C.midHi);
      ui.text('THE ODDS ARE HIDDEN', 12, 40, C.midHi);
      ui.text(`TEAM MARK, ${Math.ceil(bo / TICKS_PER_S)} S LEFT`, 12, 50, C.dust);
      return;
    }
    const bet = minBet(d);
    ui.text(`${TIER_NAME[d.tier]}  WIN ${Math.round(d.winP * 100)}%`, 12, 29, C.white);
    ui.text(`PAYS ${d.paysText} (${money(bet * d.pays!)} ON ${money(bet)})`, 12, 39, C.white);
    ui.text(`LOSE: ${lossTextOf(d, v.state).replace('THE BET', money(bet))}`, 12, 50, tier.hi);
    ui.text(`RETURNS $${d.rtp.toFixed(2)} PER $1`, 12, 61, C.dust);
  }

  protected drawPlay(ui: UI, v: PanelView) {
    const { o, rolling } = this.shown(v);
    const { cx, cy, r } = this;
    const ctx = ui.ctx;
    const th = (Math.PI * 2) / WHEEL_SLOTS;
    const a = this.angle(v, o, rolling);
    const t = this.progress(v);

    // the peg under the pointer: a clack every time it changes while the wheel turns
    const under = ((Math.floor((-Math.PI / 2 - a) / th) % WHEEL_SLOTS) + WHEEL_SLOTS) % WHEEL_SLOTS;
    if (rolling && under !== this.lastPeg && v.active) this.sound('peg', 0.5 + 0.5 * (1 - t), 0.9 + 0.3 * (1 - t));
    this.lastPeg = under;

    // the rim and its lamps
    ctx.fillStyle = PALETTE[C.woodLo];
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE[C.brassLo];
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
    ctx.fill();
    // the wedges
    for (let i = 0; i < WHEEL_SLOTS; i++) {
      const mark = MARK_SLOTS.includes(i);
      ctx.fillStyle = PALETTE[mark ? C.midLo : i % 2 ? C.night : C.wood];
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a + i * th, a + (i + 1) * th);
      ctx.closePath();
      ctx.fill();
    }
    // each wedge's sign, upright: a mark glyph, or a gold chip that pays
    for (let i = 0; i < WHEEL_SLOTS; i++) {
      const mid = a + (i + 0.5) * th;
      const x = cx + Math.cos(mid) * (r - 10), y = cy + Math.sin(mid) * (r - 10);
      if (MARK_SLOTS.includes(i)) ui.text(ICON.mark, Math.round(x), Math.round(y - 3), C.ink, { align: 'center' });
      else ui.fill(Math.round(x - 1), Math.round(y - 1), 3, 3, C.gold);
    }
    // the pegs, the hub
    for (let i = 0; i < WHEEL_SLOTS; i++) {
      const pa = a + i * th;
      ui.fill(Math.round(cx + Math.cos(pa) * (r + 1) - 1), Math.round(cy + Math.sin(pa) * (r + 1) - 1), 2, 2, C.brass);
    }
    ctx.fillStyle = PALETTE[C.ink];
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE[C.mid];
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fill();
    ui.text('1.6x', cx, cy - 3, C.ink, { align: 'center' });

    // the lamps round the rim: chasing while it spins, all lit gold on a win, amber on a mark
    const since = this.since(v);
    const landedWin = !rolling && o && since < FEEL.celebrateS ? (o.win ? C.gold : C.midHi) : -1;
    for (let k = 0; k < 20; k++) {
      const la = (k / 20) * Math.PI * 2;
      const lit = landedWin >= 0 ? Math.floor(since * 6) % 2 === 0 : rolling ? (k + Math.floor(v.tick / 3)) % 4 === 0 : k % 2 === 0;
      const col = landedWin >= 0 ? landedWin : lit ? C.white : C.brassLo;
      ui.fill(Math.round(cx + Math.cos(la) * (r + 4) - 1), Math.round(cy + Math.sin(la) * (r + 4) - 1), 3, 3, lit || landedWin >= 0 ? col : C.woodLo);
    }
    // the pointer, at the top
    const px = cx, py = cy - r - 8;
    ui.fill(px - 4, py, 9, 2, C.white);
    ui.fill(px - 3, py + 2, 7, 2, C.white);
    ui.fill(px - 2, py + 4, 5, 2, C.white);
    ui.fill(px - 1, py + 6, 3, 3, C.white);

    // the legend, in the column under the odds
    ui.text(`${ICON.mark} 7 SLOTS MARK THE TEAM:`, 12, PLAY_Y + 6, C.dust);
    ['COLD DECK  -10% PAY', 'STICKY FLOOR  -30% WALK', 'BLACKOUT  ODDS HIDDEN', 'TAX  5% OF THE BANK'].forEach((l, i) => ui.text(l, 16, PLAY_Y + 17 + i * 9, C.midHi));
    // the result, under the legend
    if (o && !rolling) {
      const col = o.mark ? C.midHi : o.win ? C.gold : C.ash;
      ui.text(o.text, 12, CTRL_Y - 10, col);
    }
  }

  protected drawControls(ui: UI, v: PanelView) {
    const bet = this.stake(v);
    if (this.betButton(ui, v, 'spin', 12, 150, `SPIN THE WHEEL  ${money(bet)}`, bet)) this.send({ t: 'spin', table: 'wheel' });
  }
}

// ---------------------------------------------------------------- Red Line

export class RedLinePanel extends TablePanel {
  constructor() {
    super('redline');
    this.popX = 172;
  }

  /** The deck: a squared stack of backs, or, while shuffling, two halves riffling together. */
  private deck(ui: UI, t: number, rolling: boolean) {
    const dx = 130, dy = PLAY_Y + 6;
    const [s0, s1] = FEEL.card.shuffle;
    if (rolling && t >= s0 && t < s1) {
      const p = (t - s0) / (s1 - s0);
      const gap = Math.round(Math.sin(p * Math.PI) * 9);
      // the halves bend apart and fall together, a card from each side in turn
      for (let i = 0; i < 3; i++) {
        drawCard(ui, dx - gap - 2 + i, dy + 2 - i, null);
        drawCard(ui, dx + gap + 2 - i, dy + 2 - i, null);
      }
      const n = Math.floor(p * 18);
      drawCard(ui, dx + (n % 2 ? 2 : -2), dy - Math.min(6, Math.floor(p * 8)), null);
      return;
    }
    for (let i = 0; i < 4; i++) drawCard(ui, dx + i, dy + 3 - i, null);
  }

  protected drawPlay(ui: UI, v: PanelView) {
    const { o, rolling } = this.shown(v);
    const me = v.state.players[v.player];
    const t = this.progress(v);
    const c = FEEL.card;
    this.deck(ui, t, rolling);
    // the card: dealt off the deck face down, then turned over
    const fx = 166, fy = PLAY_Y + 6;
    if (rolling) {
      if (t >= c.deal[0]) {
        const k = out3((t - c.deal[0]) / (c.deal[1] - c.deal[0]));
        const x = Math.round(133 + (fx - 133) * k), y = Math.round(fy - 2 * Math.sin(k * Math.PI));
        if (t < c.flip[0]) drawCard(ui, x, y, null);
        else {
          const u = clamp01((t - c.flip[0]) / (c.flip[1] - c.flip[0]));
          const w = 24 * Math.abs(Math.cos(u * Math.PI));
          drawCard(ui, fx, fy - Math.round(Math.sin(u * Math.PI) * 4), u < 0.5 ? null : o?.card ?? null, w);
        }
      }
    } else if (o?.card) drawCard(ui, fx, fy, o.card);
    if (o?.call) ui.text(`CALLED ${o.call.toUpperCase()}`, fx + 12, fy + 38, o.call === 'red' ? C.blood : C.bone, { align: 'center' });
    // the streak: one box a loss, the last box is a life
    const limit = streakLimitOf(v.state);
    const streak = me.redStreak;
    ui.text('LOSSES IN A ROW', 12, PLAY_Y + 4, C.dust);
    for (let i = 0; i < limit; i++) {
      const x = 12 + i * 22, y = PLAY_Y + 14;
      const filled = i < streak;
      const last = i === limit - 1;
      ui.fill(x, y, 18, 18, C.ink);
      ui.fill(x + 1, y + 1, 16, 16, filled ? C.highLo : C.night);
      if (last) ui.text(ICON.skull, x + 9, y + 6, filled ? C.white : C.high, { align: 'center' });
    }
    if (streak === limit - 1) ui.text('NEXT LOSS: A LIFE', 12, PLAY_Y + 38, C.blood);
    else ui.text(`${limit} IN A ROW: A LIFE`, 12, PLAY_Y + 38, C.ash);
    ui.text(`6 ROUNDS: ${Math.round(streakRisk(limit, 6) * 100)}% A LIFE`, 12, PLAY_Y + 48, C.highHi);
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
    this.popX = 172;
  }

  protected drawPlay(ui: UI, v: PanelView) {
    const { o, rolling } = this.shown(v);
    const tx = 120, ty = PLAY_Y + 2, tw = 106, th = 58;
    drawTray(ui, tx, ty, tw, th);
    const d = FEEL.deadman;
    const snake = !rolling && o?.lifeLost;
    const pip = snake ? C.blood : C.ink;
    const a = o?.dice?.[0] ?? 6, b = o?.dice?.[1] ?? 6;
    const restA = { x: tx + 34, y: ty + 32 }, restB = { x: tx + 64, y: ty + 30 };
    const salt = saltOf(this.tableState(v).rounds);
    if (rolling) {
      const t = this.progress(v);
      const shakeEnd = d.shake / d.s;
      // the first die lands, then the second, a beat later: the wait is the game
      drawThrownDie(ui, t, { x: tx + tw - 12, y: ty + 16 }, restA, 22, a, salt, d.landA, shakeEnd);
      drawThrownDie(ui, t, { x: tx + tw - 10, y: ty + 22 }, restB, 22, b, salt + 2, d.landB, shakeEnd + (d.landB - d.landA) * 0.85);
    } else {
      drawDieAt(ui, restA.x, restA.y, 22, a, 0, pip);
      drawDieAt(ui, restB.x, restB.y, 22, b, 0, pip);
    }
    if (!this.dark(v)) {
      ui.text('WINS 6x:', 12, PLAY_Y + 4, C.dust);
      ui.text('ANY DOUBLE', 12, PLAY_Y + 14, C.bone);
      ui.text('OR 10, 11, 12', 12, PLAY_Y + 23, C.bone);
    }
    ui.text(`${ICON.skull} 1-1: A LIFE`, 12, PLAY_Y + 38, C.highHi);
    ui.text('1 IN 36 (2.8%)', 12, PLAY_Y + 48, C.highHi);
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
