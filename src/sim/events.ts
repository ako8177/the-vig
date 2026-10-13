// Events: what the sim tells presentation (renderer, panels, HUD, audio) happened this tick.
// Presentation reacts; it never writes state back.
import type { PlayerId } from './commands';

export type SimEvent =
  | { t: 'sat'; player: PlayerId; table: string }
  | { t: 'stood'; player: PlayerId; table: string }
  /** a command the sim refused, and why (out of range, seat taken, ...) */
  | { t: 'refused'; player: PlayerId; cmd: string; why: string };
