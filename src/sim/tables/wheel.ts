// The Wheel of Marks (mid): 25 colored slots, each paying its own multiple of the bet: red 1.5x,
// purple 2.5x, one gold 6x, black hands half the bet back, and 6 mark slots pay nothing and hand the
// whole team a random mark (Cold Deck, Sticky Floor, Blackout, Tax). Ahead on 12 of 25 (p 0.48),
// RTP 29/25 = 1.16. DESIGN.md §3 (DECISIONS #74: it was 18 slots of a flat 1.6x, the one reliable
// earner on the floor).
import type { TableModule } from './table';
import { stakeFor } from '../rules';
import { defOf, stake } from './table';
import { addMark, payoutFactor } from '../rules';
import { TEAM_MARKS } from '../../data/marks';

const def = defOf('wheel');

export type WheelColor = 'red' | 'black' | 'purple' | 'gold' | 'mark';

/** What each color returns per $1 bet (stake included). */
export const WHEEL_PAYS: Record<WheelColor, number> = { red: 1.5, black: 0.5, purple: 2.5, gold: 6, mark: 0 };

/** The 25 slots in order round the wheel (the panel draws it from this). */
export const WHEEL_LAYOUT: readonly WheelColor[] = [
  'gold', 'red', 'black', 'mark', 'red', 'purple', 'black', 'red', 'mark', 'black', 'red', 'purple', 'black',
  'mark', 'red', 'black', 'red', 'mark', 'black', 'purple', 'red', 'mark', 'black', 'red', 'mark',
];
export const WHEEL_SLOTS = WHEEL_LAYOUT.length;
/** The mark slots' indices. */
export const MARK_SLOTS = WHEEL_LAYOUT.flatMap((c, i) => (c === 'mark' ? [i] : []));
/** How many slots of each color. */
export const WHEEL_COUNT = (c: WheelColor) => WHEEL_LAYOUT.filter((x) => x === c).length;

export const wheel: TableModule = {
  id: 'wheel',
  def,
  cmds: ['spin'],
  odds() {
    const rtp = WHEEL_LAYOUT.reduce((s, c) => s + WHEEL_PAYS[c], 0) / WHEEL_SLOTS;
    return { rtp, winP: WHEEL_LAYOUT.filter((c) => WHEEL_PAYS[c] > 1).length / WHEEL_SLOTS };
  },
  lossCost: () => def.lossText,
  start(g, p, cmd) {
    if (cmd.t !== 'spin') return 'spin the wheel';
    const bet = stakeFor(p, def.bet as number);
    const why = stake(g, bet);
    if (why) return why;
    const slot = g.rng.int(0, WHEEL_SLOTS - 1);
    const color = WHEEL_LAYOUT[slot];
    const mark = color === 'mark' ? g.rng.pick(TEAM_MARKS) : undefined;
    const factor = payoutFactor(g, p, def.id);
    const ret = Math.round(bet * WHEEL_PAYS[color] * factor);
    const text =
      color === 'mark' ? 'A MARK FOR THE TEAM'
      : color === 'black' ? `BLACK: HALF BACK, $${ret}`
      : `${color.toUpperCase()} ${WHEEL_PAYS[color]}x: $${ret}`;
    return { table: 'wheel', player: p.id, bet, ret, win: ret > bet, factor, slot, mark, text };
  },
  resolve(g, p, o) {
    if (o.mark && !addMark(g, o.mark, -1)) o.text = 'MARK BLOCKED (CLEAN SLATE)';
  },
};
