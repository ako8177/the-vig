// The sim's whole state: plain data, JSON-serializable, hashed for the replay test.
import type { PlayerId } from './commands';
import { FLOOR_1 } from '../data/floors';

/** A timed debuff (DESIGN.md §3). `team` marks hit everyone. */
export interface Mark {
  id: string;
  /** who wears it, or -1 for a team mark */
  player: PlayerId;
  /** ticks left */
  left: number;
  stacks: number;
}

export interface PlayerState {
  id: PlayerId;
  /** meters on the floor plane */
  x: number;
  z: number;
  /** facing (milliradians), for other players' views only */
  yaw: number;
  /** current walk intent (thousandths, world space) */
  mx: number;
  mz: number;
  /** the table this player is seated at */
  seat: string | null;
  lives: number;
  ghost: boolean;
}

export interface State {
  floor: number;
  night: number;
  /** ticks left in the night (360 s at 60 Hz; DESIGN.md §1) */
  clock: number;
  bank: number;
  quota: number;
  markers: number;
  players: PlayerState[];
  marks: Mark[];
}

export const TICKS_PER_S = 60;
/** A night is 360 s (DESIGN.md §1). */
export const NIGHT_TICKS = 360 * TICKS_PER_S;
/** Night 1's quota and the starting bank (DESIGN.md §2). */
export const QUOTA_1 = 3000;
export const START_BANK = 1000;
/** Lives per player (PLAN.md, currencies). */
export const START_LIVES = 3;

export function newState(players: number): State {
  const sp = FLOOR_1.spawn;
  return {
    floor: 1,
    night: 1,
    clock: NIGHT_TICKS,
    bank: START_BANK,
    quota: QUOTA_1,
    markers: 0,
    players: Array.from({ length: players }, (_, id) => ({
      id, x: sp.x + (id - (players - 1) / 2) * 0.8, z: sp.z, yaw: Math.round(sp.yaw * 1000), mx: 0, mz: 0, seat: null, lives: START_LIVES, ghost: false,
    })),
    marks: [],
  };
}
