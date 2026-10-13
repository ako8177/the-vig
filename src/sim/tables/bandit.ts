// The Bandit (low): three reels of 10 stops (one 7, two stars, three BARs, four blanks), 1,000
// equally likely lines. Pays, first match wins: 777 12x, three stars 7x, three BARs 6x, any three
// symbols 3x, a 7 with a blank 1x (money back). Σ 950 / 1000 → RTP 0.950 (DESIGN.md §3). No line
// pays more than $1,200: a low table must not hand out a night's quota (DECISIONS #38).
import type { TableModule } from './table';
import { stakeFor } from '../rules';
import { defOf, stake } from './table';
import { payoutFactor } from '../rules';

/** Reel symbols. */
export const BLANK = 0, BAR = 1, STAR = 2, SEVEN = 3;
/** One reel's 10 stops (the same on all three reels). */
export const STRIP = [SEVEN, STAR, BAR, BLANK, STAR, BAR, BLANK, BAR, BLANK, BLANK];

/** What a line returns, as a multiple of the bet, and its name. */
export function linePays(a: number, b: number, c: number): { x: number; name: string } {
  const r = [a, b, c];
  if (r.every((s) => s === SEVEN)) return { x: 12, name: '7 7 7' };
  if (r.every((s) => s === STAR)) return { x: 7, name: 'THREE STARS' };
  if (r.every((s) => s === BAR)) return { x: 6, name: 'THREE BARS' };
  if (r.every((s) => s !== BLANK)) return { x: 3, name: 'THREE SYMBOLS' };
  if (r.includes(SEVEN)) return { x: 1, name: 'A 7: MONEY BACK' };
  return { x: 0, name: 'NOTHING' };
}

const def = defOf('bandit');

export const bandit: TableModule = {
  id: 'bandit',
  def,
  cmds: ['spin'],
  odds() {
    let ret = 0, ahead = 0;
    for (const a of STRIP) for (const b of STRIP) for (const c of STRIP) {
      const x = linePays(a, b, c).x;
      ret += x;
      if (x > 1) ahead++;
    }
    const n = STRIP.length ** 3;
    return { rtp: ret / n, winP: ahead / n };
  },
  lossCost: () => def.lossText,
  start(g, p, cmd) {
    if (cmd.t !== 'spin') return 'pull the lever';
    const bet = stakeFor(p, def.bet as number);
    const why = stake(g, bet);
    if (why) return why;
    const stops = [g.rng.int(0, 9), g.rng.int(0, 9), g.rng.int(0, 9)];
    const [a, b, c] = stops.map((i) => STRIP[i]);
    const line = linePays(a, b, c);
    const factor = payoutFactor(g, p, def.id);
    const ret = Math.round(bet * line.x * factor);
    return {
      table: 'bandit', player: p.id, bet, ret, win: ret > bet, factor, reels: stops,
      text: line.x ? `${line.name}: $${ret}` : 'NOTHING',
    };
  },
  resolve() {},
};
