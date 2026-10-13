// The Wheel of Marks (mid): 25 slots, 18 pay 1.6x, 7 hand the whole team a random mark (Cold
// Deck, Sticky Floor, Blackout, Tax). p = 0.72, RTP 1.152. DESIGN.md §3.
import type { TableModule } from './table';
import { stakeFor } from '../rules';
import { defOf, stake } from './table';
import { addMark, payoutFactor } from '../rules';
import { TEAM_MARKS } from '../../data/marks';

const def = defOf('wheel');

/** The 7 mark slots, spread round the 25 (the panel draws the wheel from this). */
export const MARK_SLOTS = [1, 5, 8, 12, 16, 19, 23];
export const WHEEL_SLOTS = 25;

export const wheel: TableModule = {
  id: 'wheel',
  def,
  cmds: ['spin'],
  odds() {
    const wins = WHEEL_SLOTS - MARK_SLOTS.length;
    return { rtp: (wins * def.pays!) / WHEEL_SLOTS, winP: wins / WHEEL_SLOTS };
  },
  lossCost: () => def.lossText,
  start(g, p, cmd) {
    if (cmd.t !== 'spin') return 'spin the wheel';
    const bet = stakeFor(p, def.bet as number);
    const why = stake(g, bet);
    if (why) return why;
    const slot = g.rng.int(0, WHEEL_SLOTS - 1);
    const win = !MARK_SLOTS.includes(slot);
    const mark = win ? undefined : g.rng.pick(TEAM_MARKS);
    const factor = payoutFactor(g, p, def.id);
    const ret = win ? Math.round(bet * def.pays! * factor) : 0;
    return { table: 'wheel', player: p.id, bet, ret, win, factor, slot, mark, text: win ? `PAYS $${ret}` : 'A MARK FOR THE TEAM' };
  },
  resolve(g, p, o) {
    if (!o.win && o.mark && !addMark(g, o.mark, -1)) o.text = 'MARK BLOCKED (CLEAN SLATE)';
  },
};
