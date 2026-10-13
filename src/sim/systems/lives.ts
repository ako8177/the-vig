// Lives and souls (DESIGN.md §4): a living player at the cage buys a ghost's soul back from the
// bank for 50% of the current quota (75% under the Bane). The soul comes back with one life
// (DECISIONS #34). Losing and gaining lives happens in rules.ts, where the tables and the Circuit
// call it.
import type { Game, System } from '../Game';
import { atCage } from './cage';
import { ECONOMY } from '../../data/economy';
import { WHEEL } from '../../data/wheels';

export const buybackPrice = (g: Game) =>
  Math.round(g.state.quota * (g.state.mods.dearSoul ? WHEEL.dearSoul : ECONOMY.buybackShare.v));

export const lives: System = {
  id: 'lives',
  handles: ['buyback'],
  command(g, p, cmd) {
    if (cmd.t !== 'buyback') return;
    const s = g.state;
    const refuse = (why: string) => g.emit({ t: 'refused', player: p.id, cmd: 'buyback', why });
    const ghost = s.players[cmd.target];
    if (s.phase !== 'floor') return refuse('the cage is shut');
    if (!ghost || !ghost.ghost) return refuse('no soul to buy');
    if (p.ghost) return refuse('a ghost cannot buy');
    if (!atCage(p)) return refuse('walk to the cage');
    const price = buybackPrice(g);
    if (s.bank < price) return refuse('the bank is short');
    s.bank -= price;
    ghost.ghost = false;
    ghost.lives = 1;
    g.emit({ t: 'life', player: ghost.id, delta: 1, lives: 1, why: 'bought back' });
  },
};
