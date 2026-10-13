// Read-only views of the sim's state for the panels and the HUD (they print; they never write).
import type { PlayerState, State } from '../sim/state';
import { factorOf } from '../sim/rules';

/** What this player's payouts are multiplied by at this table, right now. */
export const payoutFactorOf = (s: State, p: PlayerState, table: string) => factorOf(s, p, table);

/** Ticks of Blackout left (0: the odds are showing). */
export const blackoutLeft = (s: State) => s.marks.find((m) => m.id === 'blackout' && m.player === -1)?.left ?? 0;

/** Red Line losses in a row that cost a life tonight (two under the Bane). */
export const streakLimitOf = (s: State) => (s.mods.twoLoss ? 2 : 3);
