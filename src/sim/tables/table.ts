// The table module interface (CLAUDE.md: each table a module with `odds`, `resolve`, `lossCost`).
// `start` takes the stake and draws the outcome from the sim's RNG; the tables system holds it back
// `resolveS` seconds (the dice roll, the reels spin) and then calls `resolve` to pay it out and
// apply its price: a mark, a team mark, a life.
import type { Game } from '../Game';
import type { Command } from '../commands';
import type { Card, Outcome, PlayerState } from '../state';
import { TABLE_BY_ID, limitsOf, type TableDef } from '../../data/tables';

export interface Odds {
  /** expected return per $1 bet, exact (enumerated) */
  rtp: number;
  /** chance a round comes out ahead */
  winP: number;
}

export interface TableModule {
  id: string;
  def: TableDef;
  /** the commands it answers (besides sit/stand) */
  cmds: Command['t'][];
  /** the exact odds, by enumerating every outcome */
  odds(): Odds;
  /** what losing costs, as printed */
  lossCost(): string;
  /**
   * Start a round: check the command, take the stake, draw the outcome. Returns the outcome to
   * hold back, null if the round goes on (Twenty-One between cards), or a refusal reason.
   */
  start(g: Game, p: PlayerState, cmd: Command): Outcome | null | string;
  /** The held-back result lands: pay it, and charge its price (marks, lives, markers). */
  resolve(g: Game, p: PlayerState, o: Outcome): void;
  /** how long this outcome is held before it lands (s), when it isn't the table's `resolveS` */
  holdS?(o: Outcome): number;
}

export const defOf = (id: string) => TABLE_BY_ID.get(id)!;

/**
 * The stake a player asked for at this table (none: the table's standard), checked against its
 * limits on this floor and rounded to its step; or why not (DECISIONS #85).
 */
export function betOf(g: Game, def: TableDef, amount?: number): number | string {
  const l = limitsOf(def, g.state.floor);
  if (amount === undefined) return l.std;
  if (!Number.isFinite(amount)) return 'no such bet';
  const a = Math.round(amount / l.step) * l.step;
  if (a < l.min || a > l.max) return `bet $${l.min}-$${l.max}`;
  return a;
}

/** Take a stake from the bank, or say why not. */
export function stake(g: Game, amount: number): string | null {
  if (g.state.bank < amount) return 'the bank is short';
  g.state.bank -= amount;
  return null;
}

export const drawCard = (g: Game): Card => ({ r: g.rng.int(1, 13), s: g.rng.int(0, 3) });

export const RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const isRed = (c: Card) => c.s < 2;
