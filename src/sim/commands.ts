// Commands: the only way anything changes the sim (CLAUDE.md, architecture rules). Panels, the
// first-person controller, bots and (Milestone 3) remote peers all produce these; the sim applies
// them in tick order. Same seed + same command log = same night.

export type PlayerId = number;

export type Command =
  | { t: 'sit'; table: string }
  | { t: 'stand' }
  | { t: 'bet'; table: string; amount: number }
  | { t: 'call'; table: string; call: string }
  | { t: 'spin'; table: string }
  | { t: 'buy'; item: string }
  | { t: 'inspect'; circuit: number }
  | { t: 'reroute'; a: number; b: number }
  | { t: 'activate'; circuit: number }
  | { t: 'pay' }
  | { t: 'gamble' }
  | { t: 'buyback'; target: PlayerId }
  /**
   * Walk intent in world space, in thousandths (|(mx, mz)| <= 1000 after the sim clamps it), and
   * the facing in milliradians for other players' views. The sim does no trigonometry: the client
   * turns its yaw into a world direction, so every peer integrates the same numbers (Milestone 3).
   */
  | { t: 'move'; mx: number; mz: number; yaw: number };

export type CommandType = Command['t'];

/** A command as it goes into the log: who sent it, and the tick it applies on. */
export interface Stamped {
  tick: number;
  player: PlayerId;
  cmd: Command;
}
