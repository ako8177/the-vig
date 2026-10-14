// The sim's whole state: plain data, JSON-serializable, hashed for the replay test.
import type { PlayerId } from './commands';
import { FLOOR_1 } from '../data/floors';
import { ECONOMY } from '../data/economy';
import type { MarkId } from '../data/marks';
import type { CharmId, UpgradeId } from '../data/charms';
import type { BaneId, BoonId } from '../data/wheels';

/** A timed debuff (DESIGN.md §3). `team` marks hit everyone. */
export interface Mark {
  id: MarkId;
  /** who wears it, or -1 for a team mark */
  player: PlayerId;
  /** ticks left (of floor time: marks don't tick at the Collector's table) */
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
  charms: CharmId[];
  /** Red Line losses in a row (per player; survives standing up: DECISIONS #11) */
  redStreak: number;
  /** Overclock: ticks of x2 payouts left, counted only while the tables are open (DECISIONS #9) */
  overclock: number;
  /** Lead Apron already spent this night */
  apronUsed: boolean;
  /** ticks of buzz from the bar (DESIGN.md §10), counted down in floor time */
  drunk: number;
}

/** A card: rank 1 (ace) .. 13 (king), suit 0..3 (0, 1 red; 2, 3 black). */
export interface Card {
  r: number;
  s: number;
}

/** What one round at a table came to: the panel draws it, the HUD toasts it. */
export interface Outcome {
  table: string;
  player: PlayerId;
  bet: number;
  /** total returned to the bank (0 on a loss) */
  ret: number;
  /** came out ahead */
  win: boolean;
  /** the payout factor applied (marks, Cold Deck, Overclock) */
  factor: number;
  /** a one-line result, as printed */
  text: string;
  lifeLost?: boolean;
  mark?: MarkId;
  markers?: number;
  /** table-specific faces: reels, dice, the card, the wheel slot, the hands */
  reels?: number[];
  dice?: number[];
  card?: Card;
  call?: string;
  slot?: number;
  player21?: Card[];
  dealer21?: Card[];
  streak?: number;
}

/** A Twenty-One hand in progress. */
export interface Hand21 {
  bet: number;
  player: Card[];
  dealer: Card[];
  /** 'play': your move; 'done': waiting for the result tick */
  stage: 'play' | 'done';
}

export interface TableState {
  /** the tick the pending result lands on (0: idle) */
  until: number;
  pending: Outcome | null;
  last: Outcome | null;
  rounds: number;
  hand: Hand21 | null;
}

export interface CircuitSlot {
  over: boolean;
  spent: boolean;
  /** the team has seen its state (inspected, or spent) */
  known: boolean;
  /** last tick the team touched it (inspect, reroute); -1 never */
  touched: number;
  /** who activated it */
  by: 'team' | 'coll' | null;
}

export interface CircuitState {
  slots: CircuitSlot[];
  /** what the Collector believes about each position (DESIGN.md §6: positions, not circuits) */
  mem: (boolean | null)[];
  fuses: number;
  overloadsLeft: number;
  teamSafe: number;
  collSafe: number;
  turn: 'team' | 'coll';
  /** the tick the Collector acts on */
  wait: number;
  /** the latest action, as printed */
  log: string[];
  /** set when it's over */
  done: { won: boolean; why: string } | null;
  /** players who activated an overload and lived (Lucky Fuse pays them if the team wins) */
  survived: number[];
  /** the tick it ended (the wheel opens after a beat) */
  endedAt: number;
}

export interface WheelState {
  kind: 'boon' | 'bane';
  /** the slot it lands on, once spun */
  slot: number | null;
  /** the tick it lands */
  until: number;
  applied: boolean;
}

/** What a Boon or Bane does to the next night (DESIGN.md §7). */
export interface NightMods {
  colddeck: boolean;
  twoLoss: boolean;
  longMarks: boolean;
  dearSoul: boolean;
  overloads3: boolean;
  immune: boolean;
  discount: boolean;
}

export const NO_MODS: NightMods = { colddeck: false, twoLoss: false, longMarks: false, dearSoul: false, overloads3: false, immune: false, discount: false };

export interface NightSummary {
  night: number;
  quota: number;
  bankAtMidnight: number;
  /** what happened at the Collector's table */
  how: 'paid' | 'gambled' | 'short';
  short: number;
  livesTaken: number;
  overshootMarkers: number;
  circuit: { won: boolean; why: string } | null;
  wheel: { kind: 'boon' | 'bane'; id: BoonId | BaneId } | null;
  /** the last night's won gamble: the permanent upgrade it took (null: none) */
  ledger: string | null;
  /** next night's quota (if there is one) */
  nextQuota: number;
}

export interface RunStats {
  rounds: number;
  wins: number;
  won$: number;
  lost$: number;
  livesLost: number;
  marks: number;
  biggest: number;
  markersEarned: number;
}

export type Phase = 'floor' | 'midnight' | 'choice' | 'circuit' | 'wheel' | 'summary' | 'over';

export interface State {
  floor: number;
  night: number;
  phase: Phase;
  /** the tick the current phase began */
  phaseAt: number;
  /** ticks left in the night (360 s at 60 Hz; DESIGN.md §1) */
  clock: number;
  bank: number;
  quota: number;
  markers: number;
  players: PlayerState[];
  marks: Mark[];
  tables: Record<string, TableState>;
  /** permanent upgrades owned (meta, passed in at the start of a run; DESIGN.md §5) */
  upgrades: UpgradeId[];
  /** this night's Boon/Bane effects, and the next night's */
  mods: NightMods;
  next: NightMods;
  /** a lost gamble's extra on the next quota (+10-40%) */
  nextExtra: number;
  /** a solo Bane: next night's bank starts this much lower (DECISIONS #51) */
  nextDock: number;
  circuit: CircuitState | null;
  wheel: WheelState | null;
  summary: NightSummary | null;
  result: { won: boolean; why: string } | null;
  stats: RunStats;
}

export const TICKS_PER_S = 60;
/** A night is 360 s (DESIGN.md §1). */
export const NIGHT_TICKS = ECONOMY.nightS.v * TICKS_PER_S;
/** Night 1's quota and the starting bank (DESIGN.md §2). */
export const QUOTA_1 = ECONOMY.quota1.v;
export const START_BANK = ECONOMY.startBank.v;
/** Lives per player (PLAN.md, currencies). */
export const START_LIVES = ECONOMY.startLives.v;

export const TABLE_IDS = ['bandit', 'twentyone', 'hilo', 'wheel', 'redline', 'deadman'] as const;

export function newTables(): Record<string, TableState> {
  const t: Record<string, TableState> = {};
  for (const id of TABLE_IDS) t[id] = { until: 0, pending: null, last: null, rounds: 0, hand: null };
  return t;
}

/** Where player `id` stands at the start of a night. */
export function spawnOf(id: number, players: number) {
  const sp = FLOOR_1.spawn;
  return { x: sp.x + (id - (players - 1) / 2) * 0.8, z: sp.z, yaw: Math.round(sp.yaw * 1000) };
}

export function newState(players: number, upgrades: UpgradeId[] = []): State {
  return {
    floor: 1,
    night: 1,
    phase: 'floor',
    phaseAt: 0,
    clock: NIGHT_TICKS,
    bank: START_BANK + (upgrades.includes('bank500') ? 500 : 0),
    quota: QUOTA_1,
    markers: 0,
    players: Array.from({ length: players }, (_, id) => ({
      id, ...spawnOf(id, players), mx: 0, mz: 0, seat: null, lives: START_LIVES, ghost: false,
      charms: [], redStreak: 0, overclock: 0, apronUsed: false, drunk: 0,
    })),
    marks: [],
    tables: newTables(),
    upgrades: [...upgrades],
    mods: { ...NO_MODS },
    next: { ...NO_MODS },
    nextExtra: 0,
    nextDock: 0,
    circuit: null,
    wheel: null,
    summary: null,
    result: null,
    stats: { rounds: 0, wins: 0, won$: 0, lost$: 0, livesLost: 0, marks: 0, biggest: 0, markersEarned: 0 },
  };
}
