// The floor-1 tables as typed data. Every number carries a `derivation` naming the DESIGN.md
// section it comes from (CLAUDE.md, architecture rules). Milestone 0 uses these for the signs and
// the Hi-Lo odds card; Milestone 1 adds each table's sim module (odds, resolve, lossCost) and the
// full validation (RTP measured over 100k seeded rounds).
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
  /** seconds per round with one player seated */
  roundS: number;
  /** chance a round pays; null where the reel or card tables make it a table of outcomes */
  winP: number | null;
  /** total return per $1 bet on a win (stake included); null where it varies by outcome */
  pays: number | null;
  /** expected return per $1 bet */
  rtp: number;
  /** what losing costs, in the words printed on the felt */
  lossText: string;
  /** the payout as printed */
  paysText: string;
  derivation: string;
}

export const TABLES: TableDef[] = [
  {
    id: 'bandit', name: 'The Bandit', sign: 'BANDIT', tier: 'low', loss: 'coin', bet: 100, roundS: 2.5,
    winP: null, pays: null, rtp: 0.95, paysText: 'PER REEL TABLE', lossText: 'THE BET',
    derivation: 'DESIGN.md §3: low tier, RTP 0.95, -$5 a round, -$120 a minute',
  },
  {
    id: 'twentyone', name: 'Twenty-One', sign: '21', tier: 'low', loss: 'coin', bet: [100, 300], roundS: 8,
    winP: 0.43, pays: null, rtp: 0.97, paysText: '1:1, 3:2 NATURAL', lossText: 'THE BET',
    derivation: 'DESIGN.md §3: low tier, win about 0.43, RTP 0.97, -$6 a round at $200',
  },
  {
    id: 'hilo', name: 'Hi-Lo Dice', sign: 'HI-LO', tier: 'mid', loss: 'mark', bet: 200, roundS: 3,
    winP: 0.5, pays: 2.4, rtp: 1.2, paysText: '2.4x', lossText: 'THE BET + 1 MARK',
    derivation: 'DESIGN.md §3: mid tier, p 0.50 x 2.4 = RTP 1.20, +$40 a round; a mark breaks it even at 3 stacks',
  },
  {
    id: 'wheel', name: 'Wheel of Marks', sign: 'WHEEL', tier: 'mid', loss: 'mark', bet: 300, roundS: 5,
    winP: 0.72, pays: 1.6, rtp: 1.15, paysText: '1.6x', lossText: 'THE BET + 1 TEAM MARK',
    derivation: 'DESIGN.md §3: mid tier, p 0.72 x 1.6 = RTP 1.152, +$46 a round',
  },
  {
    id: 'redline', name: 'Red Line', sign: 'RED LINE', tier: 'high', loss: 'skull', bet: 500, roundS: 6,
    winP: 0.5, pays: 2.5, rtp: 1.25, paysText: '2.5x', lossText: 'THE BET; 3 LOSSES IN A ROW KILL',
    derivation: 'DESIGN.md §3: high tier, p 0.50 x 2.5 = RTP 1.25, +$125 a round; death on a three-loss streak',
  },
  {
    id: 'deadman', name: "Dead Man's Hand", sign: 'DEAD MAN', tier: 'high', loss: 'skull', bet: 1000, roundS: 4,
    winP: 0.3, pays: 5, rtp: 1.5, paysText: '5x', lossText: 'THE BET; A 1-1 KILLS',
    derivation: "DESIGN.md §3: high tier, p 0.30 x 5 = RTP 1.50, +$500 a round; a 1-1 (1/36) kills",
  },
];

/** The Collector's table at the center of the room (violet; DESIGN.md §6, §7). */
export const COLLECTOR_TABLE = {
  id: 'collector', name: 'The Collector', sign: 'COLLECTOR', tier: 'coll' as Tier, loss: 'skull' as LossKind,
  derivation: 'DESIGN.md §6: the Circuit; an overload costs a life on floor 1',
};

export const TABLE_BY_ID = new Map(TABLES.map((t) => [t.id, t]));
