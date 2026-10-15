// Commands: the only way anything changes the sim (CLAUDE.md, architecture rules). Panels, the
// first-person controller, bots and (Milestone 3) remote peers all produce these; the sim applies
// them in tick order. Same seed + same command log = same night.

export type PlayerId = number;

export type Command =
  | { t: 'sit'; table: string }
  | { t: 'stand' }
  /** Twenty-One: place a bet and deal */
  | { t: 'bet'; table: string; amount: number }
  /** Hi-Lo 'hi' | 'lo'; Red Line 'red' | 'black'; Twenty-One 'hit' | 'stand' */
  | { t: 'call'; table: string; call: string; amount?: number }
  /** the one-button tables: the Bandit, the Wheel of Marks, Dead Man's Hand */
  | { t: 'spin'; table: string; amount?: number }
  /** a charm or an upgrade: from the computer at home (into the post), or at the cage in a run without the house */
  | { t: 'buy'; item: string }
  /** the house: take what's in the mailbox; get in the car and drive to the casino */
  | { t: 'pickup' }
  | { t: 'drive' }
  /** a drink, at the bar (DESIGN.md §10; DECISIONS #67) */
  | { t: 'order'; drink: string }
  | { t: 'inspect'; circuit: number }
  | { t: 'reroute'; a: number; b: number }
  | { t: 'activate'; circuit: number }
  | { t: 'pay' }
  | { t: 'gamble' }
  | { t: 'buyback'; target: PlayerId }
  /** spin the Collector's Boon or Bane wheel (DECISIONS #33) */
  | { t: 'fortune' }
  /** end the night now: the clock jumps to 0:00 (at the Collector's table; DECISIONS #49) */
  | { t: 'callit' }
  /** done reading the night's summary: start the next night (DECISIONS #33) */
  | { t: 'ready' }
  /**
   * Walk intent in world space, in thousandths (|(mx, mz)| <= 1000 after the sim clamps it), and
   * the facing in milliradians for other players' views. The sim does no trigonometry: the client
   * turns its yaw into a world direction, so every peer integrates the same numbers (Milestone 3).
   */
  | { t: 'move'; mx: number; mz: number; yaw: number; run?: boolean };

export type CommandType = Command['t'];

/** A command as it goes into the log: who sent it, and the tick it applies on. */
export interface Stamped {
  tick: number;
  player: PlayerId;
  cmd: Command;
}
