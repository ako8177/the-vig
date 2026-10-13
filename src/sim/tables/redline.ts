// Red Line (high): call RED or BLACK, one card from a fresh deck; p = 1/2, pays 2.5x. Three
// losses in a row (two under the Bane) cost a life; the streak is yours and survives standing up.
// A win: +1 marker (2 with Marker Magnet). DESIGN.md §3, §5; DECISIONS #8, #11.
import type { TableModule } from './table';
import { defOf, drawCard, isRed, stake } from './table';
import { addMarkers, loseLife, payoutFactor } from '../rules';
import { ECONOMY } from '../../data/economy';
import { WHEEL } from '../../data/wheels';
import type { Game } from '../Game';

const def = defOf('redline');

/** Losses in a row that cost a life tonight. */
export const streakLimit = (g: Game) => (g.state.mods.twoLoss ? WHEEL.twoLoss : 3);

export const redline: TableModule = {
  id: 'redline',
  def,
  cmds: ['call'],
  odds() {
    let ret = 0;
    for (const call of ['red', 'black']) for (let s = 0; s < 4; s++) if ((call === 'red') === s < 2) ret += def.pays!;
    return { rtp: ret / 8, winP: 0.5 };
  },
  lossCost: () => def.lossText,
  start(g, p, cmd) {
    if (cmd.t !== 'call' || (cmd.call !== 'red' && cmd.call !== 'black')) return 'call red or black';
    const bet = def.bet as number;
    const why = stake(g, bet);
    if (why) return why;
    const card = drawCard(g);
    const win = (cmd.call === 'red') === isRed(card);
    const factor = payoutFactor(g, p, def.id);
    const ret = win ? Math.round(bet * def.pays! * factor) : 0;
    return { table: 'redline', player: p.id, bet, ret, win, factor, card, call: cmd.call, text: win ? `WINS $${ret}` : 'LOSES' };
  },
  resolve(g, p, o) {
    if (o.win) {
      p.redStreak = 0;
      const n = ECONOMY.markers.redline.v * (p.charms.includes('magnet') ? 2 : 1);
      addMarkers(g, n, 'red line win');
      o.markers = n;
    } else {
      p.redStreak++;
      const limit = streakLimit(g);
      if (p.redStreak >= limit) {
        p.redStreak = 0;
        o.lifeLost = true;
        o.text = `${limit} IN A ROW: A LIFE`;
        loseLife(g, p, 'red line');
      } else if (p.redStreak === limit - 1) g.emit({ t: 'warning', player: p.id, table: 'redline' });
    }
    o.streak = p.redStreak;
  },
};
