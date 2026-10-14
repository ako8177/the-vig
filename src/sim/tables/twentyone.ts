// Twenty-One (low), dealt from a real shoe (DECISIONS #76): six decks shuffled by the sim's RNG,
// reshuffled when a quarter is left; the dealer hits soft 17 and peeks for a natural (a dealer
// natural ends the hand at once; a player natural pays 3:2); ties push. You may hit, stand, double
// on any first two cards (after a split too) and split a pair once (aces take one card each). The
// printed return is basic strategy's, by dynamic programming over an endless shoe (DESIGN.md §3);
// 100k hands from the real shoe land on it (tests/data.test.ts).
import type { TableModule } from './table';
import { defOf, stake } from './table';
import { payoutFactor, stakeFor } from '../rules';
import type { Card, Hand21, Outcome, PlayerState } from '../state';
import type { Game } from '../Game';

const def = defOf('twentyone');
const [MIN, MAX] = def.bet as [number, number];

/** Six decks; a fresh shuffle when fewer than a quarter remain at the start of a hand. */
export const DECKS = 6;
export const SHOE_SIZE = DECKS * 52;
export const RESHUFFLE_AT = SHOE_SIZE / 4;

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

/** Shuffle a fresh shoe (Fisher-Yates on the sim's RNG). Cards are codes 0..311. */
function shuffle(g: Game): number[] {
  const shoe = Array.from({ length: SHOE_SIZE }, (_, i) => i);
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = g.rng.int(0, i);
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

/** The next card off the shoe (a fresh shoe if it ran dry mid-hand, which six decks never do). */
function deal(g: Game): Card {
  const t = g.state.tables.twentyone;
  if (!t.shoe || !t.shoe.length) t.shoe = shuffle(g);
  const c = t.shoe.pop()! % 52;
  return { r: Math.floor(c / 4) + 1, s: c % 4 };
}

/** The dealer draws to 17 and hits soft 17. */
export function dealerPlays(g: Game, dealer: Card[]) {
  for (;;) {
    const v = handValue(dealer);
    if (v.total > 17 || (v.total === 17 && !v.soft)) return;
    dealer.push(deal(g));
  }
}

// ---- the exact odds (endless shoe): dealer final-total distributions, then basic strategy's EV

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

/** Doubling: one card, then stand, at twice the stake. */
function doubleEV(total: number, soft: boolean, up: number): number {
  const d = dealerFromUp(up).dist;
  let ev = 0;
  for (const v of VALS) {
    const [t] = step(total, soft, v);
    ev += P * (t > 21 ? -1 : standEV(t, d));
  }
  return 2 * ev;
}

/** A two-card hand's best EV: hit/stand, or double. */
function twoCardEV(total: number, soft: boolean, up: number): number {
  return Math.max(best(total, soft, up).ev, doubleEV(total, soft, up));
}

/** Splitting a pair of value `a`: two hands, each its own first card plus one (no resplit). */
function splitEV(a: number, up: number): number {
  let ev = 0;
  for (const v of VALS) {
    const [t1, s1] = step(0, false, a);
    const [t, s] = step(t1, s1, v);
    // split aces take one card and stand; any other split hand plays on (and may double)
    ev += P * (a === 1 ? standEV(t, dealerFromUp(up).dist) : twoCardEV(t, s, up));
  }
  return 2 * ev;
}

/** The best move for a hand against the dealer's upcard value (basic strategy, endless shoe). */
export function advise(cards: Card[], up: number, canDouble: boolean, canSplit: boolean): 'hit' | 'stand' | 'double' | 'split' {
  const { total, soft } = handValue(cards);
  const hs = best(total, soft, up);
  let move: 'hit' | 'stand' | 'double' | 'split' = hs.hit ? 'hit' : 'stand';
  let ev = hs.ev;
  if (canDouble) {
    const d = doubleEV(total, soft, up);
    if (d > ev) {
      ev = d;
      move = 'double';
    }
  }
  if (canSplit && splitEV(cardValue(cards[0]), up) > ev) move = 'split';
  return move;
}

/** The exact return per $1 with basic strategy (hit, stand, double, split) over an endless shoe. */
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
      const play = a === b ? Math.max(twoCardEV(t, s, up), splitEV(a, up)) : twoCardEV(t, s, up);
      ev += pp * (pDealerNat * -1 + noNat * play);
    }
    total += pUp * ev;
  }
  return 1 + total;
}

// ---- the round

/** Can the active hand double (two cards, not split aces) or split (an unsplit pair)? */
export function options(h: Hand21): { double: boolean; split: boolean } {
  const cur = h.hands[h.active];
  const two = !!cur && cur.cards.length === 2 && !cur.aces;
  return {
    double: two,
    split: two && h.hands.length === 1 && cardValue(cur.cards[0]) === cardValue(cur.cards[1]),
  };
}

function settle(g: Game, p: PlayerState): Outcome {
  const hand = g.state.tables.twentyone.hand!;
  const factor = payoutFactor(g, p, def.id);
  const one = hand.hands.length === 1;
  const pn = one && isNatural(hand.hands[0].cards), dn = isNatural(hand.dealer);
  const words: string[] = [];
  const res: { cards: Card[]; bet: number; ret: number }[] = [];
  // the dealer plays only while a hand still stands (not every hand bust, no naturals)
  if (!pn && !dn && hand.hands.some((h) => handValue(h.cards).total <= 21)) dealerPlays(g, hand.dealer);
  const dv = handValue(hand.dealer).total;
  for (const h of hand.hands) {
    const pv = handValue(h.cards).total;
    let x = 0, word: string;
    if (pn && dn) {
      x = 1;
      word = 'BOTH NATURAL: PUSH';
    } else if (pn) {
      x = 2.5;
      word = 'NATURAL';
    } else if (dn) word = 'DEALER NATURAL';
    else if (pv > 21) word = `BUST ${pv}`;
    else if (dv > 21) {
      x = 2;
      word = one ? `DEALER BUSTS ${dv}` : `WIN ${pv}`;
    } else if (pv > dv) {
      x = 2;
      word = one ? `${pv} BEATS ${dv}` : `WIN ${pv}`;
    } else if (pv === dv) {
      x = 1;
      word = `PUSH ${pv}`;
    } else word = one ? `${dv} BEATS ${pv}` : `LOSE ${pv}`;
    // a push hands the stake back untouched; a win is a payout (marks and Cold Deck apply)
    const ret = x === 1 ? h.bet : Math.round(h.bet * x * factor);
    words.push(word);
    res.push({ cards: [...h.cards], bet: h.bet, ret });
  }
  const bet = res.reduce((a, r) => a + r.bet, 0), ret = res.reduce((a, r) => a + r.ret, 0);
  let text = words.join(' / ');
  if (ret > bet) text += `: $${ret}`;
  hand.stage = 'done';
  return { table: 'twentyone', player: p.id, bet, ret, win: ret > bet, factor, text, hands21: res, dealer21: [...hand.dealer] };
}

/** The active hand is finished: move to the next (it gets its second card), or settle. */
function next(g: Game, p: PlayerState): Outcome | null {
  const hand = g.state.tables.twentyone.hand!;
  hand.hands[hand.active].done = true;
  while (hand.active < hand.hands.length - 1) {
    hand.active++;
    const h = hand.hands[hand.active];
    if (h.cards.length < 2) h.cards.push(deal(g));
    if (h.aces || handValue(h.cards).total >= 21) h.done = true;
    if (!h.done) return null;
  }
  return settle(g, p);
}

export const twentyone: TableModule = {
  id: 'twentyone',
  def,
  cmds: ['bet', 'call'],
  odds() {
    // the chance of coming out ahead is measured (tests); the RTP is exact for basic strategy
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
      if (!t.shoe || t.shoe.length < RESHUFFLE_AT) {
        t.shoe = shuffle(g);
        g.emit({ t: 'shuffle', table: 'twentyone' });
      }
      // you, the dealer, you, the dealer (face down)
      const a = deal(g), d1 = deal(g), b = deal(g), d2 = deal(g);
      t.hand = { bet: amount, hands: [{ cards: [a, b], bet: amount, done: false, aces: false }], active: 0, dealer: [d1, d2], stage: 'play' };
      if (isNatural(t.hand.hands[0].cards) || isNatural(t.hand.dealer)) return settle(g, p);
      return null;
    }
    if (cmd.t === 'call') {
      const hand = t.hand;
      if (!hand || hand.stage !== 'play') return 'place a bet first';
      const h = hand.hands[hand.active];
      const can = options(hand);
      switch (cmd.call) {
        case 'hit':
          h.cards.push(deal(g));
          return handValue(h.cards).total >= 21 ? next(g, p) : null;
        case 'stand':
          return next(g, p);
        case 'double': {
          if (!can.double) return 'double on your first two cards';
          const why = stake(g, h.bet);
          if (why) return why;
          h.bet *= 2;
          h.cards.push(deal(g));
          return next(g, p);
        }
        case 'split': {
          if (!can.split) return 'split a pair, once';
          const why = stake(g, h.bet);
          if (why) return why;
          const aces = h.cards[0].r === 1;
          const second = { cards: [h.cards.pop()!], bet: h.bet, done: false, aces };
          h.aces = aces;
          h.cards.push(deal(g));
          hand.hands.push(second);
          // split aces take one card each and stand
          if (aces || handValue(h.cards).total >= 21) return next(g, p);
          return null;
        }
        case 'leave':
          // walking away (or 0:00) stands every hand still in play
          while (hand.stage === 'play') {
            const o = next(g, p);
            if (o) return o;
          }
          return null;
      }
      return 'hit, stand, double or split';
    }
    return 'bet, then play the hand';
  },
  resolve() {},
};
