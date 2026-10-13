// The floor-1 tables as typed data. Every number carries a `derivation` naming the DESIGN.md
// section it comes from (CLAUDE.md, architecture rules). The sim's table modules
// (src/sim/tables/) play them; the panels and signs print them. The exact outcome sets that make
// each RTP exact live with the modules and are checked by tests/data.test.ts.
// (pixel-art/vig-room/build.py reads `id`, `sign`, `tier` and `loss` from this file with a regex:
// keep them in that order on one object each.)
import type { Tier } from './palette';

/** What losing costs, which is also the sign's one-glyph loss icon (THREEJS-NOTES rule 7). */
export type LossKind = 'coin' | 'mark' | 'skull';

export interface TableDef {
  id: string;
  name: string;
  /** a short name for the neon sign */
  sign: string;
  tier: Tier;
  loss: LossKind;
  /** the bet, or [min, max] for a table that lets you choose */
  bet: number | [number, number];
  /** seconds per round with one player seated (decision + result; the pace bots play at this rate) */
  roundS: number;
  /** seconds from the call until the result lands (the sim holds the result back this long) */
  resolveS: number;
  /** chance a round comes out ahead (Bandit: lines that pay more than the bet) */
  winP: number;
  /** total return per $1 bet on a win (stake included); null where it varies by outcome */
  pays: number | null;
  /** expected return per $1 bet (exact, by enumeration; Twenty-One with best hit/stand play) */
  rtp: number;
  /** what losing costs, in the words printed on the felt */
  lossText: string;
  /** the payout as printed */
  paysText: string;
  /** the rule in one line, printed on the panel */
  howText: string;
  derivation: string;
}

export const TABLES: TableDef[] = [
  {
    id: 'bandit', name: 'The Bandit', sign: 'BANDIT', tier: 'low', loss: 'coin', bet: 100, roundS: 2.5, resolveS: 1.4,
    winP: 0.216, pays: null, rtp: 0.95, paysText: 'BY LINE, UP TO 12x', lossText: 'THE BET',
    howText: 'PULL. 3 REELS OF 10: ONE 7, TWO STARS, THREE BARS.',
    derivation: 'DESIGN.md §3: low tier; reel table 12/7/6/3/1 over 1,000 lines = 950 → RTP 0.95; -$5 a round',
  },
  {
    id: 'twentyone', name: 'Twenty-One', sign: '21', tier: 'low', loss: 'coin', bet: [100, 300], roundS: 8, resolveS: 0.6,
    winP: 0.43, pays: null, rtp: 0.974, paysText: '1:1, NATURAL 3:2', lossText: 'THE BET',
    howText: 'HIT OR STAND. DEALER HITS SOFT 17. TIES PUSH.',
    derivation: 'DESIGN.md §3: low tier; endless shoe, H17, hit/stand only, 3:2 natural → RTP 0.9736 with best play',
  },
  {
    id: 'hilo', name: 'Hi-Lo Dice', sign: 'HI-LO', tier: 'mid', loss: 'mark', bet: 200, roundS: 3, resolveS: 0.9,
    winP: 0.5, pays: 2.4, rtp: 1.2, paysText: '2.4x', lossText: 'THE BET + 1 MARK',
    howText: 'ONE DIE. CALL HI (4-6) OR LO (1-3).',
    derivation: 'DESIGN.md §3: mid tier, p 0.50 x 2.4 = RTP 1.20, +$40 a round; 3 marks still pay, 4 lose',
  },
  {
    id: 'wheel', name: 'Wheel of Marks', sign: 'WHEEL', tier: 'mid', loss: 'mark', bet: 300, roundS: 5, resolveS: 2.4,
    winP: 0.72, pays: 1.6, rtp: 1.152, paysText: '1.6x', lossText: 'THE BET + 1 TEAM MARK',
    howText: '25 SLOTS: 18 PAY, 7 MARK THE WHOLE TEAM.',
    derivation: 'DESIGN.md §3: mid tier, p 18/25 = 0.72 x 1.6 = RTP 1.152, +$46 a round',
  },
  {
    id: 'redline', name: 'Red Line', sign: 'RED LINE', tier: 'high', loss: 'skull', bet: 500, roundS: 6, resolveS: 1.2,
    winP: 0.5, pays: 2.5, rtp: 1.25, paysText: '2.5x', lossText: 'THE BET; 3 LOSSES IN A ROW COST A LIFE',
    howText: 'CALL RED OR BLACK. ONE CARD, FRESH DECK.',
    derivation: 'DESIGN.md §3: high tier, p 0.50 x 2.5 = RTP 1.25, +$125 a round; a three-loss streak costs a life (31% in 6 rounds)',
  },
  {
    id: 'deadman', name: "Dead Man's Hand", sign: 'DEAD MAN', tier: 'high', loss: 'skull', bet: 1000, roundS: 4, resolveS: 1.2,
    winP: 0.25, pays: 6, rtp: 1.5, paysText: '6x', lossText: 'THE BET; SNAKE EYES COSTS A LIFE',
    howText: 'TWO DICE. DOUBLES OR 10+ WIN. 1-1 COSTS A LIFE.',
    derivation: "DESIGN.md §3: high tier, p 9/36 = 0.25 x 6 = RTP 1.50, +$500 a round; snake eyes (1/36) costs a life",
  },
];

/** The Collector's table at the center of the room (violet; DESIGN.md §6, §7). */
export const COLLECTOR_TABLE = {
  id: 'collector', name: 'The Collector', sign: 'COLLECTOR', tier: 'coll' as Tier, loss: 'skull' as LossKind,
  derivation: 'DESIGN.md §6: the Circuit; an overload costs a life on floor 1',
};

export const TABLE_BY_ID = new Map(TABLES.map((t) => [t.id, t]));

/** The smallest bet a table takes. */
export const minBet = (t: TableDef) => (typeof t.bet === 'number' ? t.bet : t.bet[0]);
