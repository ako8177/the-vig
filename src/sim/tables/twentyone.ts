// Twenty-One (low): an endless shoe (every card an independent draw of 13 ranks), hit or stand
// only, the dealer hits soft 17, a natural pays 3:2, ties push, a dealer natural beats all but a
// player natural. With the best hit/stand play the return is 0.9736 (DESIGN.md §3; DECISIONS #32),
// computed below by dynamic programming over the endless shoe.
import type { TableModule } from './table';
import { defOf, drawCard, stake } from './table';
import { payoutFactor, stakeFor } from '../rules';
import type { Card, Outcome, PlayerState } from '../state';
import type { Game } from '../Game';

const def = defOf('twentyone');
const [MIN, MAX] = def.bet as [number, number];

/** A card's value: ace 1, face cards 10. */
export const cardValue = (c: Card) => Math.min(10, c.r);

/** A hand's best total and whether an ace is counting 11. */
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let t = 0, ace = false;
  for (const c of cards) {
    t += cardValue(c);
    if (c.r === 1) ace = true;
  }
  if (ace && t + 10 <= 21) return { total: t + 10, soft: true };
  return { total: t, soft: false };
}

export const isNatural = (cards: Card[]) => cards.length === 2 && handValue(cards).total === 21;

/** The dealer draws to 17 and hits soft 17. */
export function dealerPlays(g: Game, dealer: Card[]) {
  for (;;) {
    const v = handValue(dealer);
    if (v.total > 17 || (v.total === 17 && !v.soft)) return;
    dealer.push(drawCard(g));
  }
}

// ---- the exact odds (endless shoe): dealer final-total distributions, then the best hit/stand EV

const VALS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10];
const P = 1 / 13;
type Dist = Map<number, number>; // final total (22 = bust) -> probability

function addTo(d: Dist, k: number, p: number) {
  d.set(k, (d.get(k) ?? 0) + p);
}

function step(total: number, soft: boolean, v: number): [number, boolean] {
  let t = total + v, s = soft;
  if (v === 1 && t + 10 <= 21) {
    t += 10;
    s = true;
  }
  if (t > 21 && s) {
    t -= 10;
    s = false;
  }
  return [t, s];
}

const dealerMemo = new Map<string, Dist>();
function dealerFrom(total: number, soft: boolean): Dist {
  const key = `${total},${soft}`;
  const hit = dealerMemo.get(key);
  if (hit) return hit;
  const d: Dist = new Map();
  if (total > 21) d.set(22, 1);
  else if (total > 17 || (total === 17 && !soft)) d.set(total, 1);
  else for (const v of VALS) {
    const [t, s] = step(total, soft, v);
    for (const [k, p] of dealerFrom(t, s)) addTo(d, k, p * P);
  }
  dealerMemo.set(key, d);
  return d;
}

/** The dealer's final distribution from an upcard, given the hole card doesn't make a natural. */
const upMemo = new Map<number, { dist: Dist; noNat: number }>();
function dealerFromUp(up: number) {
  const hit = upMemo.get(up);
  if (hit) return hit;
  const dist: Dist = new Map();
  let mass = 0;
  for (const v of VALS) {
    if ((up === 1 && v === 10) || (up === 10 && v === 1)) continue;
    const [t0, s0] = step(up === 1 ? 11 : up, up === 1, v);
    for (const [k, p] of dealerFrom(t0, s0)) addTo(dist, k, p * P);
    mass += P;
  }
  for (const [k, p] of dist) dist.set(k, p / mass);
  const r = { dist, noNat: mass };
  upMemo.set(up, r);
  return r;
}

function standEV(t: number, d: Dist) {
  let ev = 0;
  for (const [k, p] of d) ev += k === 22 || t > k ? p : t < k ? -p : 0;
  return ev;
}

const playMemo = new Map<string, { ev: number; hit: boolean }>();
/** The best play and its EV (per $1, profit) for a non-bust total against a dealer upcard. */
export function best(total: number, soft: boolean, up: number): { ev: number; hit: boolean } {
  const key = `${total},${soft},${up}`;
  const m = playMemo.get(key);
  if (m) return m;
  const d = dealerFromUp(up).dist;
  const st = standEV(total, d);
  let h = 0;
  if (total < 21) {
    for (const v of VALS) {
      const [t, s] = step(total, soft, v);
      h += P * (t > 21 ? -1 : best(t, s, up).ev);
    }
  } else h = -Infinity;
  const r = { ev: Math.max(st, h), hit: h > st };
  playMemo.set(key, r);
  return r;
}

/** The exact return per $1 with the best hit/stand play. */
export function exactRtp(): number {
  let total = 0;
  for (let up = 1; up <= 10; up++) {
    const pUp = up === 10 ? 4 / 13 : 1 / 13;
    const { noNat } = dealerFromUp(up);
    const pDealerNat = 1 - noNat;
    let ev = 0;
    for (const a of VALS) for (const b of VALS) {
      const pp = P * P;
      const nat = (a === 1 && b === 10) || (a === 10 && b === 1);
      if (nat) {
        ev += pp * noNat * 1.5;
        continue;
      }
      const [t1, s1] = step(0, false, a);
      const [t, s] = step(t1, s1, b);
      ev += pp * (pDealerNat * -1 + noNat * best(t, s, up).ev);
    }
    total += pUp * ev;
  }
  return 1 + total;
}

// ---- the round

function settle(g: Game, p: PlayerState): Outcome {
  const hand = g.state.tables.twentyone.hand!;
  const pv = handValue(hand.player).total;
  const factor = payoutFactor(g, p, def.id);
  const pn = isNatural(hand.player), dn = isNatural(hand.dealer);
  let x = 0, text: string;
  if (pn && dn) {
    x = 1;
    text = 'BOTH NATURAL: PUSH';
  } else if (pn) {
    x = 2.5;
    text = 'NATURAL';
  } else if (dn) text = 'DEALER NATURAL';
  else if (pv > 21) text = `BUST ${pv}`;
  else {
    if (!dn) dealerPlays(g, hand.dealer);
    const dv = handValue(hand.dealer).total;
    if (dv > 21) {
      x = 2;
      text = `DEALER BUSTS ${dv}`;
    } else if (pv > dv) {
      x = 2;
      text = `${pv} BEATS ${dv}`;
    } else if (pv === dv) {
      x = 1;
      text = `PUSH ${pv}`;
    } else text = `${dv} BEATS ${pv}`;
  }
  // a push hands the stake back untouched; a win is a payout (marks and Cold Deck apply)
  const ret = x === 1 ? hand.bet : Math.round(hand.bet * x * factor);
  hand.stage = 'done';
  if (ret > hand.bet) text += `: $${ret}`;
  return { table: 'twentyone', player: p.id, bet: hand.bet, ret, win: ret > hand.bet, factor, text, player21: [...hand.player], dealer21: [...hand.dealer] };
}

export const twentyone: TableModule = {
  id: 'twentyone',
  def,
  cmds: ['bet', 'call'],
  odds() {
    // the chance of coming out ahead is measured (tests); the RTP is exact
    return { rtp: exactRtp(), winP: def.winP };
  },
  lossCost: () => def.lossText,
  start(g, p, cmd) {
    const t = g.state.tables.twentyone;
    if (cmd.t === 'bet') {
      if (t.hand && t.hand.stage === 'play') return 'finish the hand';
      const base = Math.round(cmd.amount / 100) * 100;
      if (base < MIN || base > MAX) return `bet $${MIN}-$${MAX}`;
      const amount = stakeFor(p, base);
      const why = stake(g, amount);
      if (why) return why;
      t.hand = { bet: amount, player: [drawCard(g), drawCard(g)], dealer: [drawCard(g), drawCard(g)], stage: 'play' };
      if (isNatural(t.hand.player) || isNatural(t.hand.dealer)) return settle(g, p);
      return null;
    }
    if (cmd.t === 'call') {
      const hand = t.hand;
      if (!hand || hand.stage !== 'play') return 'place a bet first';
      if (cmd.call === 'hit') {
        hand.player.push(drawCard(g));
        g.emit({ t: 'card', player: p.id, to: 'player' });
        const v = handValue(hand.player).total;
        return v >= 21 ? settle(g, p) : null;
      }
      if (cmd.call === 'stand') return settle(g, p);
      return 'hit or stand';
    }
    return 'bet, then hit or stand';
  },
  resolve() {},
};
