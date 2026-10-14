// Events: what the sim tells presentation (renderer, panels, HUD, audio) happened this tick.
// Presentation reacts; it never writes state back.
import type { PlayerId } from './commands';
import type { Outcome, NightSummary } from './state';
import type { MarkId } from '../data/marks';

export type SimEvent =
  | { t: 'sat'; player: PlayerId; table: string }
  | { t: 'stood'; player: PlayerId; table: string }
  /** a round started: the result lands `ticks` from now */
  | { t: 'play'; player: PlayerId; table: string; ticks: number }
  /** a round's result landed */
  | { t: 'round'; player: PlayerId; outcome: Outcome }
  /** Twenty-One: a fresh shoe */
  | { t: 'shuffle'; table: string }
  | { t: 'mark'; player: PlayerId; id: MarkId; stacks: number }
  | { t: 'tax'; amount: number }
  | { t: 'life'; player: PlayerId; delta: number; lives: number; why: string }
  | { t: 'ghost'; player: PlayerId }
  | { t: 'markers'; delta: number; why: string }
  /** Red Line: two losses in a row, the next one costs a life */
  | { t: 'warning'; player: PlayerId; table: string }
  | { t: 'midnight' }
  | { t: 'choice' }
  | { t: 'shortfall'; short: number; lives: number }
  | { t: 'paid'; quota: number; overshootMarkers: number }
  | { t: 'circuit'; who: 'team' | 'coll'; action: 'inspect' | 'reroute' | 'activate'; slot: number; over?: boolean; text: string }
  | { t: 'circuitEnd'; won: boolean; why: string }
  | { t: 'spinning'; kind: 'boon' | 'bane'; slot: number; ticks: number }
  | { t: 'landed'; kind: 'boon' | 'bane'; id: string; text: string }
  | { t: 'summary'; summary: NightSummary }
  | { t: 'night'; night: number; quota: number; bank: number }
  | { t: 'over'; won: boolean; why: string }
  | { t: 'bought'; player: PlayerId; item: string; kind: 'charm' | 'upgrade' }
  /** the house (DESIGN.md §5): an order is in the post, it has reached the mailbox, it's been carried
   *  in, the car has left for the casino */
  | { t: 'ordered'; player: PlayerId; item: string; kind: 'charm' | 'upgrade' }
  | { t: 'post'; count: number }
  | { t: 'collected'; player: PlayerId; items: string[] }
  | { t: 'drive'; night: number }
  | { t: 'overclock'; player: PlayerId }
  | { t: 'drank'; player: PlayerId; drink: string }
  /** a command the sim refused, and why (out of range, seat taken, ...) */
  | { t: 'refused'; player: PlayerId; cmd: string; why: string };
