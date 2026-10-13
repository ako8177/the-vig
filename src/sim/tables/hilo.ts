// Hi-Lo Dice (mid): one die, call HI (4-6) or LO (1-3); p = 1/2, pays 2.4x; a loss marks you
// (-5% on your mid payouts a stack). DESIGN.md §3.
import type { TableModule } from './table';
import { defOf, stake } from './table';
import { addMark, payoutFactor } from '../rules';

const def = defOf('hilo');

export const hilo: TableModule = {
  id: 'hilo',
  def,
  cmds: ['call'],
  odds() {
    let ret = 0;
    for (const call of ['hi', 'lo']) for (let d = 1; d <= 6; d++) if ((call === 'hi') === d >= 4) ret += def.pays!;
    return { rtp: ret / 12, winP: 0.5 };
  },
  lossCost: () => def.lossText,
  start(g, p, cmd) {
    if (cmd.t !== 'call' || (cmd.call !== 'hi' && cmd.call !== 'lo')) return 'call hi or lo';
    const bet = def.bet as number;
    const why = stake(g, bet);
    if (why) return why;
    const die = g.rng.int(1, 6);
    const win = (cmd.call === 'hi') === die >= 4;
    const factor = payoutFactor(g, p, def.id);
    const ret = win ? Math.round(bet * def.pays! * factor) : 0;
    return {
      table: 'hilo', player: p.id, bet, ret, win, factor, dice: [die], call: cmd.call,
      text: win ? `${die}: ${cmd.call.toUpperCase()} WINS $${ret}` : `${die}: MARKED`,
    };
  },
  resolve(g, p, o) {
    if (!o.win && addMark(g, 'hilo', p.id)) o.mark = 'hilo';
  },
};
