// The sim's whole state: plain data, JSON-serializable, hashed for the replay test.
import type { PlayerId } from './commands';
import { FLOOR_1 } from '../data/floors';
import { HOME_SPAWN } from '../data/home';
import { ECONOMY } from '../data/economy';
import type { MarkId } from '../data/marks';
import type { CharmId, UpgradeId } from '../data/charms';
import type { BaneId, BoonId } from '../data/wheels';
import type { DrinkId } from '../data/drinks';

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
  /** holding sprint (DESIGN.md §1) */
  run: boolean;
  /** the drinks' edges still running (DESIGN.md §10): which drink, ticks left of floor time */
  buffs: { drink: DrinkId; left: number }[];
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
  /** the Bandit's grid, cell symbols row by row */
  reels?: number[];
  /** the Bandit's whole grid alike */
  jackpot?: boolean;
  dice?: number[];
  card?: Card;
  call?: string;
  slot?: number;
  /** Twenty-One: each of your hands (two after a split) and the dealer's */
  hands21?: { cards: Card[]; bet: number; ret: number }[];
  dealer21?: Card[];
  streak?: number;
}

/** One of your Twenty-One hands: its cards, its stake (doubled or not), finished or not. */
export interface PlayerHand21 {
  cards: Card[];
  bet: number;
  done: boolean;
  /** a split ace: one card and it stands */
  aces: boolean;
}

/** A Twenty-One round in progress: your hands (two after a split), the one in play, the dealer's. */
export interface Hand21 {
  /** the stake you dealt in with */
  bet: number;
  hands: PlayerHand21[];
  active: number;
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
  /** Twenty-One's shoe: the cards left, as codes (code % 52: rank = floor / 4 + 1, suit = % 4) */
  shoe?: number[];
}

/** One lever under the Collector's table (DESIGN.md §6). */
export interface Lever {
  live: boolean;
  pulled: boolean;
  /** the team has seen whether it's live (pulled, or traced with the Insulated Kit) */
  known: boolean;
  by: 'team' | 'coll' | null;
}

export interface CircuitState {
  levers: Lever[];
  /** how many are live */
  live: number;
  /** each player's shocks so far, and his */
  shocks: number[];
  hisShocks: number;
  /** each player's free wire traces left (the Insulated Kit) */
  traces: number[];
  turn: 'team' | 'coll';
  /** the tick the Collector pulls on */
  wait: number;
  /** the latest action, as printed */
  log: string[];
  /** set when it's over */
  done: { won: boolean; why: string } | null;
  /** players who took a shock and lived (Lucky Fuse pays them if the team wins) */
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
  how: 'paid' | 'gambled' | 'kept' | 'short';
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

export type Phase = 'home' | 'floor' | 'midnight' | 'choice' | 'circuit' | 'wheel' | 'summary' | 'over';

/** An order from the computer at home: what, and whose. */
export interface PostItem {
  item: string;
  player: PlayerId;
}

export interface State {
  /** the run starts at the house and goes back to it between nights (DECISIONS #79); off for the
   *  pace bots, which play nights back to back */
  home: boolean;
  /** orders in the post, the tick they reach the mailbox, and what's waiting in it */
  post: { orders: PostItem[]; at: number; box: PostItem[] };
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
  /** who sits at the Collector's table tonight (an index into data/collectors.ts), and whether
   *  he died at it (the next night brings the next one: DECISIONS #81) */
  collector: { idx: number; dead: boolean };
  /** the Collectors killed this run, by index (the ending counts them) */
  killed: number[];
  /** the charms in the pool (meta: unlocked by killing Collectors, passed in at the start) */
  unlocked: CharmId[];
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

/** Where player `id` stands in the house (the start of a run, and after the drive home). */
export function homeSpawnOf(id: number, players: number) {
  const sp = HOME_SPAWN;
  return { x: sp.x, z: sp.z + (id - (players - 1) / 2) * 0.8, yaw: Math.round(sp.yaw * 1000) };
}

/** Where player `id` stands at the start of a night. */
export function spawnOf(id: number, players: number) {
  const sp = FLOOR_1.spawn;
  return { x: sp.x + (id - (players - 1) / 2) * 0.8, z: sp.z, yaw: Math.round(sp.yaw * 1000) };
}

export function newState(players: number, upgrades: UpgradeId[] = [], home = false, unlocked: CharmId[] = []): State {
  return {
    home,
    post: { orders: [], at: 0, box: [] },
    floor: 1,
    night: 1,
    phase: home ? 'home' : 'floor',
    phaseAt: 0,
    clock: NIGHT_TICKS,
    bank: START_BANK + (upgrades.includes('bank500') ? 500 : 0),
    quota: QUOTA_1,
    markers: ECONOMY.startMarkers.v,
    players: Array.from({ length: players }, (_, id) => ({
      id, ...(home ? homeSpawnOf(id, players) : spawnOf(id, players)), mx: 0, mz: 0, seat: null, lives: START_LIVES, ghost: false,
      charms: [], redStreak: 0, overclock: 0, apronUsed: false, drunk: 0, run: false, buffs: [],
    })),
    marks: [],
    tables: newTables(),
    upgrades: [...upgrades],
    mods: { ...NO_MODS },
    next: { ...NO_MODS },
    collector: { idx: 0, dead: false },
    killed: [],
    unlocked: [...unlocked],
    nextDock: 0,
    circuit: null,
    wheel: null,
    summary: null,
    result: null,
    stats: { rounds: 0, wins: 0, won$: 0, lost$: 0, livesLost: 0, marks: 0, biggest: 0, markersEarned: 0 },
  };
}
