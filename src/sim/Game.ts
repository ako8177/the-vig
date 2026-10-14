// The sim: pure, deterministic, command-driven (CLAUDE.md, architecture rules). It never sees
// input, DOM, canvas, audio, wall-clock time or the network. Commands are queued with the tick
// they apply on; each step applies that tick's commands in (player, arrival) order, then runs
// the systems in their fixed order, and leaves the events for presentation to drain.
import { Rng, hashStr } from '../engine/rng';
import type { Command, PlayerId, Stamped } from './commands';
import type { SimEvent } from './events';
import { newState, type PlayerState, type State } from './state';
import { clock } from './systems/clock';
import { movement } from './systems/movement';
import { tables } from './systems/tables';
import { marks } from './systems/marks';
import { lives } from './systems/lives';
import { cage } from './systems/cage';
import { home } from './systems/home';
import { collector } from './systems/collector';
import { economy } from './systems/economy';
import { stats } from './systems/stats';

export interface System {
  id: string;
  /** the commands this system owns */
  handles: readonly Command['t'][];
  command?(g: Game, p: PlayerState, cmd: Command): void;
  tick?(g: Game): void;
}

/** The fixed system order (CLAUDE.md): clock → movement → tables → marks → lives and souls → cage → home → collector → economy → stats. */
export const SYSTEMS: readonly System[] = [clock, movement, tables, marks, lives, cage, home, collector, economy, stats];

export interface GameOpts {
  seed: number;
  players?: number;
  /** permanent upgrades the run starts with (meta; DESIGN.md §5) */
  upgrades?: import('../data/charms').UpgradeId[];
  /** start at the house and go home between nights (the game); off for the pace bots */
  home?: boolean;
}

export class Game {
  readonly seed: number;
  tick = 0;
  /** every random number in the sim comes from here */
  rng: Rng;
  state: State;
  /** counts emitted events: presentation redraws a panel when it moves (not part of the hash) */
  rev = 0;
    /** the applied command log, in the order applied (replaying it reproduces the night) */
  log: Stamped[] = [];
  private queue: Stamped[] = [];
  private events: SimEvent[] = [];
  private owner = new Map<Command['t'], System>();

  constructor(opts: GameOpts) {
    this.seed = opts.seed >>> 0;
    this.rng = new Rng(this.seed);
    this.state = newState(opts.players ?? 1, opts.upgrades ?? [], opts.home ?? false);
    for (const s of SYSTEMS) for (const t of s.handles) {
      if (this.owner.has(t)) throw new Error(`command ${t} owned by both ${this.owner.get(t)!.id} and ${s.id}`);
      this.owner.set(t, s);
    }
  }

  /** Queue a command for the tick it names (a command for a past tick applies on the next one). */
  submit(player: PlayerId, cmd: Command, tick = this.tick) {
    this.queue.push({ tick: Math.max(tick, this.tick), player, cmd });
  }

  /** Advance one tick. */
  step() {
    const now = this.queue.filter((c) => c.tick === this.tick);
    if (now.length) {
      this.queue = this.queue.filter((c) => c.tick !== this.tick);
      // stable: same player keeps arrival order
      now.sort((a, b) => a.player - b.player);
      for (const c of now) {
        const p = this.state.players[c.player];
        const sys = this.owner.get(c.cmd.t);
        this.log.push(c);
        if (p && sys?.command) sys.command(this, p, c.cmd);
      }
    }
    for (const s of SYSTEMS) s.tick?.(this);
    this.tick++;
  }

  emit(e: SimEvent) {
    this.events.push(e);
    this.rev++;
  }

  /** Hand the events since the last drain to presentation. */
  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** A hash of everything that matters: two runs agree on this or they diverged. */
  hash(): string {
    const s = JSON.stringify({ tick: this.tick, rng: this.rng.s, state: this.state });
    return (hashStr(s) >>> 0).toString(16).padStart(8, '0') + (hashStr(s.split('').reverse().join('')) >>> 0).toString(16).padStart(8, '0');
  }

  /** Replay a command log from a fresh game with the same seed, to `ticks`. */
  static replay(seed: number, players: number, log: readonly Stamped[], ticks: number): Game {
    const g = new Game({ seed, players });
    for (const c of log) g.submit(c.player, c.cmd, c.tick);
    while (g.tick < ticks) g.step();
    return g;
  }
}
