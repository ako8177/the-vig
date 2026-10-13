// Dead Man's Hand (high): two dice. Snake eyes (1-1) costs a life and the bet; any other double
// or a total of 10+ wins 6x (9 of 36); everything else loses the bet. p = 0.25 x 6 = RTP 1.50.
// A win: +2 markers (4 with Marker Magnet). DESIGN.md §3, §5.
import type { TableModule } from './table';
import { defOf, stake } from './table';
import { addMarkers, loseLife, payoutFactor } from '../rules';
import { ECONOMY } from '../../data/economy';

const def = defOf('deadman');

export const isSnake = (a: number, b: number) => a === 1 && b === 1;
export const dmWins = (a: number, b: number) => !isSnake(a, b) && (a === b || a + b >= 10);

export const deadman: TableModule = {
  id: 'deadman',
  def,
  cmds: ['spin'],
  odds() {
    let wins = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (dmWins(a, b)) wins++;
    return { rtp: (wins * def.pays!) / 36, winP: wins / 36 };
  },
  lossCost: () => def.lossText,
  start(g, p, cmd) {
    if (cmd.t !== 'spin') return 'roll the dice';
    const bet = def.bet as number;
    const why = stake(g, bet);
    if (why) return why;
    const dice = [g.rng.int(1, 6), g.rng.int(1, 6)];
    const win = dmWins(dice[0], dice[1]);
    const factor = payoutFactor(g, p, def.id);
    const ret = win ? Math.round(bet * def.pays! * factor) : 0;
    const snake = isSnake(dice[0], dice[1]);
    return { table: 'deadman', player: p.id, bet, ret, win, factor, dice, text: win ? `WINS $${ret}` : snake ? 'SNAKE EYES: A LIFE' : 'LOSES' };
  },
  resolve(g, p, o) {
    if (o.win) {
      const n = ECONOMY.markers.deadman.v * (p.charms.includes('magnet') ? 2 : 1);
      addMarkers(g, n, "dead man's win");
      o.markers = n;
    } else if (isSnake(o.dice![0], o.dice![1])) {
      o.lifeLost = true;
      loseLife(g, p, "dead man's hand");
    }
  },
};
