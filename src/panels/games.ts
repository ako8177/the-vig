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
import { BAR, CELLS, GRID, PAYS, STAR, SEVEN, STRIP, gridPays } from '../sim/tables/bandit';
import { WHEEL_COUNT, WHEEL_LAYOUT, WHEEL_PAYS, WHEEL_SLOTS, type WheelColor } from '../sim/tables/wheel';
import { RESHUFFLE_AT, SHOE_SIZE, handValue, options } from '../sim/tables/twentyone';
import { hiloMarkSOf, streakLimitOf, streakRisk } from './view';
import type { Card, Outcome } from '../sim/state';
import { HILO_MARK } from '../data/marks';
import { ECONOMY } from '../data/economy';
import { minBet } from '../data/tables';
import { TICKS_PER_S } from '../sim/state';

/** A salt for a round's animation, so no two throws look the same (from the round count). */
const saltOf = (rounds: number, k = 0) => (rounds * 7 + k * 3) % 6;

// ---------------------------------------------------------------- The Bandit

export class BanditPanel extends TablePanel {
  /** columns already stopped this round (each one clunks once) */
  private stopped = [true, true, true];

  constructor() {
    super('bandit');
    this.popY = PLAY_Y + 24;
    // the grid needs the room: its strip and pay table say what the rule line would
    this.showHow = false;
  }

  /** A column's reel for this round: its three results first (top to bottom), then a run of the
   *  strip above them, the same every frame of the round. */
  private reel(c: number, grid: readonly number[], round: number): number[] {
    const { cols: K } = GRID;
    const seq = [grid[c], grid[K + c], grid[2 * K + c]];
    let x = (round * 7919 + c * 104729) >>> 0;
    for (let k = 0; k < REEL_RUN + 2; k++) {
      x = (Math.imul(x, 1103515245) + 12345) >>> 0;
      seq.push(STRIP[(x >>> 16) % STRIP.length]);
    }
    return seq;
  }

  /** One cell's symbol, centered in a CW x CH cell at (x, y). */
  private symbol(ui: UI, s: number, x: number, y: number) {
    const cx = x + CW / 2;
    if (s === SEVEN) ui.text('7', cx, y + 5, C.gold, { scale: 2, align: 'center' });
    else if (s === STAR) ui.text(ICON.star, cx, y + 8, C.white, { align: 'center' });
    else if (s === BAR) {
      ui.fill(x + 4, y + 7, CW - 8, 10, C.smoke);
      ui.text('BAR', cx, y + 9, C.white, { align: 'center' });
    } else ui.text('-', cx + 1, y + 8, C.dust, { align: 'center' });
  }

  protected drawPlay(ui: UI, v: PanelView) {
    const { o, rolling } = this.shown(v);
    const t = this.progress(v);
    const { rows: R, cols: K } = GRID;
    const x0 = 112, y0 = PLAY_Y - 10;
    if (rolling && t < 0.05) this.stopped = Array(K).fill(false);
    const grid = o?.reels?.length === CELLS ? o.reels : [SEVEN, STAR, BAR, STAR, SEVEN, BAR, BAR, BAR, SEVEN];
    ui.fill(x0 - 2, y0 - 2, K * (CW + 2) + 2, R * (CH + 2) + 2, C.ink);
    for (let c = 0; c < K; c++) {
      // a column is a reel: it runs past, slows and locks, the columns stopping left to right
      const stopAt = FEEL.bandit.stops[c] ?? 0.9;
      const done = !rolling || t >= stopAt;
      if (rolling && done && !this.stopped[c]) {
        this.stopped[c] = true;
        this.sound('clunk', 0.9, 1 + c * 0.06);
      }
      const x = x0 + c * (CW + 2);
      ui.clip(x, y0, CW, R * (CH + 2) - 2);
      for (let r = 0; r < R; r++) ui.fill(x, y0 + r * (CH + 2), CW, CH, C.bone);
      if (!done) {
        // the reel: a run of symbols whose last three are this column's result, rolling down and
        // slowing until exactly those three sit in the window (what you watch is what lands)
        const seq = this.reel(c, grid, this.tableState(v).rounds);
        const s = REEL_RUN * Math.pow(1 - t / stopAt, 3);
        const i0 = Math.floor(s), f = s - i0;
        for (let r = -1; r <= R; r++) {
          const sym = seq[i0 + r] ?? seq[seq.length - 1];
          if (i0 + r >= 0) this.symbol(ui, sym, x, y0 + Math.round((r - f) * (CH + 2)));
        }
      } else {
        const since = rolling ? (t - stopAt) * FEEL.bandit.s : 1;
        const bob = since < 0.12 ? Math.round(Math.sin((since / 0.12) * Math.PI) * 3) : 0;
        for (let r = 0; r < R; r++) this.symbol(ui, grid[r * K + c], x, y0 + r * (CH + 2) + bob);
      }
      ui.unclip();
    }
    // the patterns that paid, outlined once the grid has landed
    if (o?.reels && !rolling) {
      const { hits } = gridPays(o.reels);
      const blink = Math.floor(this.since(v) * 4) % 2 === 0 || this.since(v) > FEEL.celebrateS;
      if (blink) for (const h of hits) for (const i of h.cells) {
        const cx = x0 + (i % K) * (CW + 2), cy = y0 + Math.floor(i / K) * (CH + 2);
        ui.frame(cx, cy, CW, CH, h.x >= PAYS.lineStar ? C.gold : C.low);
      }
    }
    // the strip and the pay table, both printed: you can see how rare the 7 is
    const px = 12;
    ui.text('EACH CELL:', px, y0 + 2, C.dust);
    ui.text('7 x1', px, y0 + 12, C.gold);
    ui.text(`${ICON.star} x2`, px, y0 + 21, C.white);
    ui.text('BAR x3', px, y0 + 30, C.white);
    ui.text('BLANK x4', px, y0 + 39, C.ash);
    ui.text('OF 10 STOPS', px, y0 + 48, C.dust);
    if (!this.dark(v)) {
      // the pay table, from the same numbers that pay it
      ui.text('8 LINES, EACH:', 222, y0 + 2, C.dust);
      const rows: [string, number][] = [
        ['7 7 7', PAYS.line7],
        [`${ICON.star}${ICON.star}${ICON.star}`, PAYS.lineStar],
        ['BAR x3', PAYS.lineBar],
        ['ANY 3', PAYS.lineAny],
        ['CORNERS', PAYS.corners],
        ['ALL 9', PAYS.full],
      ];
      rows.forEach(([a, x], i) => {
        const y = y0 + 12 + i * 9 + (i >= 4 ? 3 : 0);
        ui.text(a, 222, y, i >= 4 ? C.white : C.bone);
        ui.text(`${x}x`, PANEL_W - 12, y, C.gold, { align: 'right' });
      });
    }
    this.result(ui, v);
  }

  protected drawControls(ui: UI, v: PanelView) {
    const bet = this.stake(v);
    if (this.betButton(ui, v, 'pull', 110, 100, `PULL  ${money(bet)}`, bet)) this.send({ t: 'spin', table: 'bandit' });
  }
}

/** A Bandit cell, in panel pixels; how many cells a reel rolls past before it stops. */
const CW = 30, CH = 20;
const REEL_RUN = 24;

// ---------------------------------------------------------------- Twenty-One

/** Where Twenty-One's shoe sits on the panel (its cards fly from here). */
const SHOE = { x: 290, y: 27 };

export class TwentyOnePanel extends TablePanel {
  /** cards on the cloth so far, per hand and the dealer's: the rest are still coming out of the
   *  shoe, one every FEEL.deal.gap */
  private seenH: number[] = [];
  private seenD = 0;
  /** the dealer's hole card turned over; when the last card came down (s); a round in play last frame */
  private holeUp = false;
  private lastAt = -1e9;
  private lastWasFlip = false;
  private live = false;
  private started = false;

  constructor() {
    super('twentyone');
  }

  protected animating(v: PanelView) {
    return super.animating(v) || this.dealing(v);
  }

  /** The hands the cards are heading for: the round in play (hole down) or the last settled. */
  private target(v: PanelView): { hands: Card[][]; dealer: Card[]; hole: boolean; active: number; bets: number[] } | null {
    const hand = this.tableState(v).hand;
    if (hand && hand.stage === 'play') return { hands: hand.hands.map((h) => h.cards), dealer: hand.dealer, hole: true, active: hand.active, bets: hand.hands.map((h) => h.bet) };
    const { o } = this.shown(v);
    if (o?.hands21) return { hands: o.hands21.map((h) => h.cards), dealer: o.dealer21!, hole: false, active: -1, bets: o.hands21.map((h) => h.bet) };
    return null;
  }

  private dealing(v: PanelView) {
    const t = this.target(v);
    return !!t && (t.hands.some((h, i) => (this.seenH[i] ?? 0) < h.length) || this.seenD < t.dealer.length || (!t.hole && !this.holeUp));
  }

  /**
   * Bring the cloth up to the round, one card at a time: the deal goes you, dealer, you, dealer
   * (face down); a hit or a double slides in; a split parts the pair and each hand gets its card;
   * at the stand the hole card turns over, then the dealer draws. Each card snaps down with a
   * sound, so a hand you can't see is one you can hear.
   */
  private step(v: PanelView) {
    const ts = this.tableState(v);
    const live = !!ts.pending || ts.hand?.stage === 'play';
    const t = this.target(v);
    const now = v.tick / TICKS_PER_S;
    if (!this.started || !t) {
      // a panel opening on a round already dealt shows it as it is
      this.started = true;
      this.seenH = t ? t.hands.map((h) => h.length) : [];
      this.seenD = t?.dealer.length ?? 0;
      this.holeUp = !!t && !t.hole;
    } else if (live && !this.live) {
      // a new round: the chips go down, the cloth is cleared
      this.seenH = [0];
      this.seenD = 0;
      this.holeUp = false;
      this.lastAt = now - FEEL.deal.gap * 0.6;
      this.sound('chips', 0.6);
    }
    this.live = live;
    if (!t) return;
    if (this.seenH.length < t.hands.length) {
      // the split: the pair parts, one card to each hand, and a second stake goes down
      this.seenH = t.hands.map((_, i) => (i === 0 ? Math.min(this.seenH[0] ?? 0, 1) : 1));
      this.sound('chips', 0.5);
    }
    if (now - this.lastAt < FEEL.deal.gap) return;
    const h0 = this.seenH[0] ?? 0;
    const opening = t.hands.length === 1 && (h0 < 2 || this.seenD < 2);
    const more = t.hands.findIndex((h, i) => (this.seenH[i] ?? 0) < h.length);
    if (opening && h0 <= this.seenD && h0 < t.hands[0].length) this.seenH[0] = h0 + 1;
    else if (opening && this.seenD < t.dealer.length) this.seenD++;
    else if (more >= 0) this.seenH[more] = (this.seenH[more] ?? 0) + 1;
    else if (!t.hole && !this.holeUp && this.seenD >= 2) {
      this.holeUp = true;
      this.lastAt = now;
      this.lastWasFlip = true;
      this.sound('flip');
      return;
    } else if (this.seenD < t.dealer.length) this.seenD++;
    else return;
    this.lastAt = now;
    this.lastWasFlip = false;
    this.sound('card', 1, 0.94 + Math.random() * 0.12);
  }

  /** One hand's cards and its label; `gap` is the fan between cards. */
  private row(ui: UI, label: string, cards: Card[], shown: number, hideHole: boolean, x: number, gap: number, now: number, dealer: boolean, col: number = C.dust) {
    const y = PLAY_Y + 14;
    const vis = cards.slice(0, shown);
    const total = handValue(hideHole ? vis.slice(0, 1) : vis).total;
    ui.text(`${label} ${vis.length ? (hideHole && vis.length > 1 ? total + ' +?' : total) : ''}`, x, PLAY_Y + 2, col);
    const since = now - this.lastAt;
    vis.slice(0, 6).forEach((c, i) => {
      if (dealer && i === 1 && !hideHole && since < FEEL.deal.gap && this.holeUp && shown === 2 && this.lastWasFlip) {
        // the hole card turns over edge-on
        const k = clamp01(since / (FEEL.deal.gap * 0.8));
        drawCard(ui, x + i * gap, y, k < 0.5 ? null : c, 24 * Math.abs(Math.cos(k * Math.PI)));
        return;
      }
      const face = hideHole && i === 1 ? null : c;
      const newest = i === vis.length - 1 && since < FEEL.deal.gap && !this.lastWasFlip;
      if (newest) {
        // the newest card leaves the shoe face down, slides across the felt and turns as it lands
        const k = out3(clamp01(since / (FEEL.deal.gap * 0.7)));
        const cx = Math.round(SHOE.x + (x + i * gap - SHOE.x) * k), cy = Math.round(SHOE.y + (y - SHOE.y) * k - Math.sin(k * Math.PI) * 6);
        if (k < 0.8 || !face) drawCard(ui, cx, cy, null);
        else drawCard(ui, cx, cy, face, 24 * clamp01((k - 0.8) / 0.2));
        return;
      }
      drawCard(ui, x + i * gap, y, face);
    });
  }

  protected drawPlay(ui: UI, v: PanelView) {
    this.step(v);
    const ts = this.tableState(v);
    const t = this.target(v);
    const now = v.tick / TICKS_PER_S;
    if (t) {
      this.row(ui, 'DEALER', t.dealer, this.seenD, !this.holeUp, 12, 18, now, true);
      const two = t.hands.length > 1;
      t.hands.forEach((cards, i) => {
        // after a split the two hands sit side by side, fanned tighter; the one in play is gold
        const x = two ? 160 + i * 80 : 168;
        const label = two ? `${i + 1}:` : 'YOU';
        const doubled = t.bets[i] > (ts.hand?.bet ?? t.bets[i]) ? ' x2' : '';
        this.row(ui, label + doubled, cards, this.seenH[i] ?? 0, false, x, two ? 12 : 18, now, false, two && i === t.active ? C.gold : C.dust);
      });
      if (ts.hand && ts.hand.stage === 'play') ui.text(`BET ${money(t.bets.reduce((a, b) => a + b, 0))}`, PANEL_W - 12, PLAY_Y + 52, C.gold, { align: 'right' });
    } else {
      ui.text('PLACE A BET TO DEAL.', PANEL_W / 2, PLAY_Y + 24, C.dust, { align: 'center' });
      if (!this.dark(v)) ui.text('NATURAL (A + 10) PAYS 3:2. A WIN PAYS 1:1.', PANEL_W / 2, PLAY_Y + 36, C.ash, { align: 'center' });
    }
    // the shoe, top right: every card comes out of it
    ui.fill(SHOE.x - 4, SHOE.y - 2, 32, 38, C.woodLo);
    ui.fill(SHOE.x - 2, SHOE.y, 28, 34, C.ink);
    drawCard(ui, SHOE.x, SHOE.y + 1, null);
    ui.fill(SHOE.x - 4, SHOE.y + 22, 32, 14, C.woodLo);
    // the shoe: how deep it is, so a counter can count
    const left = ts.shoe?.length ?? SHOE_SIZE;
    ui.text(`SHOE: ${left} OF ${SHOE_SIZE} LEFT${left < RESHUFFLE_AT ? ', SHUFFLE NEXT' : ''}`, 12, PLAY_Y + 52, C.ash);
    // the verdict waits for the last card, and the last round's goes once a new one is dealt
    if (!this.dealing(v) && ts.hand?.stage !== 'play') this.result(ui, v);
  }

  protected drawControls(ui: UI, v: PanelView) {
    const hand = this.tableState(v).hand;
    const tier = TIER_ROLE[this.def.tier];
    if (hand && hand.stage === 'play') {
      const off = !v.active || v.state.phase !== 'floor';
      const can = options(hand);
      const cost = hand.hands[hand.active]?.bet ?? 0;
      const short = v.state.bank < cost;
      const call = (c: string) => this.send({ t: 'call', table: 'twentyone', call: c });
      if (ui.button('hit', 12, CTRL_Y, 70, 20, 'HIT', { edge: tier.base, disabled: off, tip: 'Take a card.' })) call('hit');
      if (ui.button('stand', 88, CTRL_Y, 70, 20, 'STAND', { edge: tier.base, disabled: off, tip: 'Stop here. The dealer draws to 17 (hits soft 17).' })) call('stand');
      if (ui.button('double', 164, CTRL_Y, 70, 20, 'DOUBLE', { edge: tier.base, disabled: off || !can.double || short, tip: can.double ? `Stake ${money(cost)} more, take one card, stand.` : 'Only on your first two cards.' })) call('double');
      if (ui.button('split', 240, CTRL_Y, 68, 20, 'SPLIT', { edge: tier.base, disabled: off || !can.split || short, tip: can.split ? `Stake ${money(cost)} more: two hands, one card each.` : 'Only a pair, once.' })) call('split');
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
/** The wheel's wedge colors (the owner's red, black and purple; gold for the one big slot). */
const WEDGE_LABEL: Record<WheelColor, string> = { red: '1.5', black: '.5', purple: '2.5', gold: '6', mark: '' };
const WEDGE: Record<WheelColor, number> = { red: C.blood, black: C.ink, purple: C.collLo, gold: C.gold, mark: C.midLo };

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
    ui.text(`PAYS ${d.paysText}`, 12, 39, C.white);
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
    // the wedges, in their colors
    for (let i = 0; i < WHEEL_SLOTS; i++) {
      ctx.fillStyle = PALETTE[WEDGE[WHEEL_LAYOUT[i]]];
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
      const c = WHEEL_LAYOUT[i];
      // the multiple on the wedge itself, read from the outside in
      if (c === 'mark') ui.text(ICON.mark, Math.round(x), Math.round(y - 3), C.ink, { align: 'center' });
      else ui.text(WEDGE_LABEL[c], Math.round(x), Math.round(y - 3), c === 'gold' ? C.ink : c === 'black' ? C.dust : C.white, { align: 'center' });
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
    // the hub shows what the pointer is on
    const now = WHEEL_LAYOUT[under];
    ui.text(now === 'mark' ? ICON.mark : `${WHEEL_PAYS[now]}x`, cx, cy - 3, C.ink, { align: 'center' });

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

    // the legend, in the column under the odds: each color, its count and what it pays on this bet
    const bet = this.stake(v);
    (['gold', 'purple', 'red', 'black'] as WheelColor[]).forEach((c, i) => {
      const y = PLAY_Y + 2 + i * 9;
      ui.fill(12, y + 1, 6, 6, WEDGE[c]);
      ui.frame(12, y + 1, 6, 6, C.dust);
      ui.text(`${c.toUpperCase()} x${WHEEL_COUNT(c)}`, 22, y, C.bone);
      ui.text(`${WHEEL_PAYS[c]}x  ${money(Math.round(bet * WHEEL_PAYS[c]))}`, 150, y, c === 'black' ? C.dust : C.gold, { align: 'right' });
    });
    ui.text(`${ICON.mark} x${WHEEL_COUNT('mark')}: 0 + A TEAM MARK`, 12, PLAY_Y + 38, C.midHi);
    ui.text('COLD DECK, STICKY FLOOR,', 16, PLAY_Y + 47, C.dust);
    ui.text('BLACKOUT OR TAX', 16, PLAY_Y + 56, C.dust);
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
