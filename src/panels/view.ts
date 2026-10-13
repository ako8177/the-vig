// Read-only views of the sim's state for the panels and the HUD (they print; they never write).
import type { PlayerState, State } from '../sim/state';
import { factorOf } from '../sim/rules';
import type { TableDef } from '../data/tables';
import { WHEEL } from '../data/wheels';
import { MARK_BY_ID } from '../data/marks';

/** What this player's payouts are multiplied by at this table, right now. */
export const payoutFactorOf = (s: State, p: PlayerState, table: string) => factorOf(s, p, table);

/** Ticks of Blackout left (0: the odds are showing). */
export const blackoutLeft = (s: State) => s.marks.find((m) => m.id === 'blackout' && m.player === -1)?.left ?? 0;

/** Red Line losses in a row that cost a life tonight (two under the Bane). */
export const streakLimitOf = (s: State) => (s.mods.twoLoss ? 2 : 3);

/** What losing costs at a table tonight, as printed: the Bane can make Red Line's streak 2 (critic F2). */
export function lossTextOf(def: TableDef, s: State): string {
  if (def.id === 'redline') return `THE BET; ${streakLimitOf(s)} LOSSES IN A ROW COST A LIFE`;
  return def.lossText;
}

/** How long a Hi-Lo mark lasts tonight (s): 60 under the Bane, 20 with Short Memory, else 30. */
export const hiloMarkSOf = (s: State) => (s.mods.longMarks ? WHEEL.longMarksS : s.upgrades.includes('hilo20') ? 20 : MARK_BY_ID.get('hilo')!.durS);

/** The chance of losing `limit` in a row somewhere in `n` fair rounds (Red Line's sentence, DESIGN.md §3). */
export function streakRisk(limit: number, n: number): number {
  // a[k] = probability of no run of `limit` losses yet, ending in k losses in a row
  let a = [1, ...Array(limit - 1).fill(0)];
  for (let i = 0; i < n; i++) {
    const b = Array(limit).fill(0);
    for (let k = 0; k < limit; k++) {
      b[0] += a[k] / 2;
      if (k + 1 < limit) b[k + 1] += a[k] / 2;
    }
    a = b;
  }
  return 1 - a.reduce((x, y) => x + y, 0);
}
