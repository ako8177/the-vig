// The Bandit (low): a 3x3 grid (DECISIONS #75). Each of the 9 cells is an independent stop of a
// 10-stop strip (one 7, two stars, three BARs, four blanks). Every pattern that hits pays, summed:
// on each of the 8 lines (3 rows, 3 columns, 2 diagonals) three 7s 10x, three stars 3x, three BARs
// 1x, any three symbols 0.3x; the four corners alike 3x; the whole grid alike 50x. 4^9 weighted
// grids enumerate to RTP 0.9504 (DESIGN.md §3). No line pays more than 10x, $1,000 on a pull: a low
// table must not hand out a night's quota (DECISIONS #38); the full grid is the one jackpot.
// GRID is data so a later floor's machine can be bigger.
import type { TableModule } from './table';
import { stakeFor } from '../rules';
import { defOf, stake } from './table';
import { payoutFactor } from '../rules';

/** Symbols. */
export const BLANK = 0, BAR = 1, STAR = 2, SEVEN = 3;
/** The 10-stop strip every cell draws from (and the panel spins). */
export const STRIP = [SEVEN, STAR, BAR, BLANK, STAR, BAR, BLANK, BAR, BLANK, BLANK];
/** The machine's grid on floor 1: rows x columns. */
export const GRID = { rows: 3, cols: 3 };
export const CELLS = GRID.rows * GRID.cols;

/** The lines: every row, every column, both diagonals (cells numbered row by row). */
export const LINES: readonly number[][] = (() => {
  const { rows: R, cols: K } = GRID;
  const out: number[][] = [];
  for (let r = 0; r < R; r++) out.push(Array.from({ length: K }, (_, c) => r * K + c));
  for (let c = 0; c < K; c++) out.push(Array.from({ length: R }, (_, r) => r * K + c));
  if (R === K) {
    out.push(Array.from({ length: R }, (_, i) => i * K + i));
    out.push(Array.from({ length: R }, (_, i) => i * K + (K - 1 - i)));
  }
  return out;
})();
export const CORNERS = [0, GRID.cols - 1, CELLS - GRID.cols, CELLS - 1];

/** What each pattern returns, as a multiple of the bet. */
export const PAYS = { line7: 10, lineStar: 3, lineBar: 1, lineAny: 0.3, corners: 3, full: 50 };

/** One pattern that hit: its cells, its name and what it pays. */
export interface Hit {
  cells: number[];
  name: string;
  x: number;
}

/** Every pattern a grid hits, and the total it returns per $1 bet. */
export function gridPays(g: readonly number[]): { x: number; hits: Hit[] } {
  const hits: Hit[] = [];
  for (const line of LINES) {
    const s = line.map((i) => g[i]);
    if (s.includes(BLANK)) continue;
    const same = s.every((v) => v === s[0]);
    if (same && s[0] === SEVEN) hits.push({ cells: line, name: '7 7 7', x: PAYS.line7 });
    else if (same && s[0] === STAR) hits.push({ cells: line, name: 'THREE STARS', x: PAYS.lineStar });
    else if (same) hits.push({ cells: line, name: 'THREE BARS', x: PAYS.lineBar });
    else hits.push({ cells: line, name: 'THREE SYMBOLS', x: PAYS.lineAny });
  }
  const c0 = g[CORNERS[0]];
  if (c0 !== BLANK && CORNERS.every((i) => g[i] === c0)) hits.push({ cells: CORNERS, name: 'CORNERS', x: PAYS.corners });
  if (g[0] !== BLANK && g.every((v) => v === g[0])) hits.push({ cells: g.map((_, i) => i), name: 'THE WHOLE GRID', x: PAYS.full });
  return { x: Math.round(hits.reduce((a, h) => a + h.x, 0) * 1000) / 1000, hits };
}

/** A grid's result in one line, as printed. */
export function gridText(hits: readonly Hit[], ret: number): string {
  if (!hits.length) return 'NOTHING';
  if (hits.some((h) => h.name === 'THE WHOLE GRID')) return `THE WHOLE GRID: $${ret}`;
  if (hits.length === 1) return `${hits[0].name}: $${ret}`;
  return `${hits.length} HITS: $${ret}`;
}

const def = defOf('bandit');

let exact: { rtp: number; winP: number } | null = null;

export const bandit: TableModule = {
  id: 'bandit',
  def,
  cmds: ['spin'],
  odds() {
    // every grid of symbols, weighted by how many strip stops show each (4^9 = 262,144)
    if (exact) return exact;
    const w = [0, 0, 0, 0];
    for (const s of STRIP) w[s]++;
    const n = STRIP.length;
    const g = new Array<number>(CELLS).fill(0);
    let rtp = 0, winP = 0;
    const total = 4 ** CELLS;
    for (let k = 0; k < total; k++) {
      let r = k, pr = 1;
      for (let i = 0; i < CELLS; i++) {
        g[i] = r % 4;
        r = Math.floor(r / 4);
        pr *= w[g[i]] / n;
      }
      const x = gridPays(g).x;
      rtp += pr * x;
      if (x > 1) winP += pr;
    }
    exact = { rtp, winP };
    return exact;
  },
  lossCost: () => def.lossText,
  start(g, p, cmd) {
    if (cmd.t !== 'spin') return 'pull the lever';
    const bet = stakeFor(p, def.bet as number);
    const why = stake(g, bet);
    if (why) return why;
    const grid = Array.from({ length: CELLS }, () => STRIP[g.rng.int(0, STRIP.length - 1)]);
    const { x, hits } = gridPays(grid);
    const factor = payoutFactor(g, p, def.id);
    const ret = Math.round(bet * x * factor);
    return {
      table: 'bandit', player: p.id, bet, ret, win: ret > bet, factor, reels: grid,
      jackpot: hits.some((h) => h.name === 'THE WHOLE GRID'), text: gridText(hits, ret),
    };
  },
  resolve() {},
};
