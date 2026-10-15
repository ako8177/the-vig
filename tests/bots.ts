// Bots for the pace tests (DESIGN.md §8). They play the real sim through commands only; the one
// shortcut is walking: a bot steps straight to a table's stand point and pays the walk in clock
// time at a sprint (5.1 m/s: a player holds Shift), so the night's arithmetic stays honest.
import { Game } from '../src/sim/Game';
import type { PlayerState } from '../src/sim/state';
import { NIGHT_TICKS, TICKS_PER_S } from '../src/sim/state';
import { FLOOR_1 } from '../src/data/floors';
import { TABLE_BY_ID } from '../src/data/tables';
import { SPRINT } from '../src/sim/systems/movement';
import { advise, cardValue, options } from '../src/sim/tables/twentyone';
import type { CharmId } from '../src/data/charms';

/** 200 seeds: 20 gave a lucky sample (the M1 design review measured 80% where 200 said 64%). */
export const SEEDS = Array.from({ length: 200 }, (_, i) => 1000 + i * 7919);

export class Bot {
  /** team marks suffered, Red Line lives lost */
  teamMarks = 0;
  redLives = 0;
  /** Red Line bursts played */
  redBursts = 0;
  /** money the Tax mark took */
  taxed = 0;
  constructor(readonly g: Game, readonly id = 0) {}

  get p(): PlayerState {
    return this.g.state.players[this.id];
  }
  get floor() {
    return this.g.state.phase === 'floor';
  }

  step(n = 1) {
    for (let i = 0; i < n && this.floor; i++) {
      this.g.step();
      for (const e of this.g.drainEvents()) {
        if (e.t === 'mark' && e.player === -1) this.teamMarks++;
        if (e.t === 'tax') this.taxed += e.amount;
        if (e.t === 'life' && e.delta < 0 && e.why === 'red line' && e.player === this.id) this.redLives++;
      }
    }
  }
  wait(s: number) {
    this.step(Math.round(s * TICKS_PER_S));
  }

  /** Walk to a table (paying the walk in time) and sit. */
  sit(table: string) {
    const p = this.p;
    if (p.seat === table) return;
    if (p.seat) {
      this.g.submit(this.id, { t: 'stand' });
      this.step();
    }
    const pl = FLOOR_1.tables.find((t) => t.table === table)!;
    const d = Math.hypot(p.x - pl.stand.x, p.z - pl.stand.z);
    this.wait(d / (3 * SPRINT));
    if (!this.floor) return;
    p.x = pl.stand.x;
    p.z = pl.stand.z;
    this.g.submit(this.id, { t: 'sit', table });
    this.step();
  }

  /** Walk to the cage window. */
  toCage() {
    const p = this.p;
    if (p.seat) {
      this.g.submit(this.id, { t: 'stand' });
      this.step();
    }
    const c = FLOOR_1.cageStand;
    this.wait(Math.hypot(p.x - c.x, p.z - c.z) / (3 * SPRINT));
    p.x = c.x;
    p.z = c.z;
  }

  /** One round at the table you sit at, at that table's pace (DESIGN.md §3 "Round"). */
  /** Twenty-One stake */
  bet21 = 200;

  round(table: string, call?: string) {
    if (!this.floor || this.p.ghost) return;
    const def = TABLE_BY_ID.get(table)!;
    const t0 = this.g.tick;
    if (table === 'twentyone') {
      this.g.submit(this.id, { t: 'bet', table, amount: this.bet21 });
      this.step();
      for (let k = 0; k < 20 && this.g.state.tables.twentyone.hand?.stage === 'play'; k++) {
        const h = this.g.state.tables.twentyone.hand!;
        const can = options(h);
        // basic strategy; a double or split it can't stake is a hit or a stand
        let call: string = advise(h.hands[h.active].cards, cardValue(h.dealer[0]), can.double, can.split);
        if ((call === 'double' || call === 'split') && this.g.state.bank < h.hands[h.active].bet) call = advise(h.hands[h.active].cards, cardValue(h.dealer[0]), false, false);
        this.g.submit(this.id, { t: 'call', table, call });
        this.step();
      }
    } else {
      this.g.submit(this.id, call ? { t: 'call', table, call } : { t: 'spin', table });
      this.step();
    }
    const left = Math.round(def.roundS * TICKS_PER_S) - (this.g.tick - t0);
    this.step(Math.max(1, left));
  }

  canBet(table: string) {
    const d = TABLE_BY_ID.get(table)!;
    return this.g.state.bank >= (d.id === 'twentyone' ? this.bet21 : d.bet.std);
  }
  hiloStacks() {
    return this.g.state.marks.find((m) => m.id === 'hilo' && m.player === this.id)?.stacks ?? 0;
  }
  hiloMarked() {
    return this.g.state.marks.some((m) => m.id === 'hilo' && m.player === this.id);
  }
  made(cushion = 300) {
    return this.g.state.bank >= this.g.state.quota + cushion;
  }

  /** Sit out the rest of the night. */
  idle() {
    if (this.p.seat) {
      this.g.submit(this.id, { t: 'stand' });
      this.step();
    }
    while (this.floor) this.step(600);
  }

  buy(item: CharmId | string) {
    this.g.submit(this.id, { t: 'buy', item });
    this.step();
  }
}

/** Run a bot's night strategy until 0:00; return whether the bank made the quota. */
export function night(g: Game, play: (b: Bot) => void, bot = new Bot(g)): { made: boolean; bot: Bot } {
  while (bot.floor) {
    const t = g.tick;
    play(bot);
    if (g.tick === t) bot.step(60); // a strategy with nothing to do waits
  }
  // the night ends at 0:00 with every round landed: the bank either holds the quota or it doesn't
  return { made: g.state.phase === 'midnight' && g.state.bank >= g.state.quota, bot };
}

// ---- strategies

/** The cautious player: the low tables at their minimum stakes. */
export const safeOnly = (b: Bot) => {
  b.bet21 = 100;
  if (!b.canBet('bandit')) return b.idle();
  b.sit('bandit');
  for (let i = 0; i < 6; i++) b.round('bandit');
  if (!b.canBet('twentyone')) return;
  b.sit('twentyone');
  for (let i = 0; i < 3; i++) b.round('twentyone');
};

/** Hi-Lo 5-round bursts (out at 3 stacks), the Wheel while the marks clear. */
export const midRotation = (b: Bot) => {
  if (b.made()) return b.idle();
  if (!b.hiloMarked() && b.canBet('hilo')) {
    b.sit('hilo');
    for (let i = 0; i < 5 && b.hiloStacks() < 3 && b.canBet('hilo') && !b.made(); i++) b.round('hilo', i % 2 ? 'hi' : 'lo');
  }
  if (b.canBet('wheel')) {
    b.sit('wheel');
    while (b.floor && b.hiloMarked() && b.canBet('wheel') && !b.made()) b.round('wheel');
  } else if (b.hiloMarked()) b.wait(2);
};

/**
 * Mid rotation, and up to two six-round Red Line bursts when it's behind: past the night's halfway
 * mark, short of the quota, with a bank that can take three losses. (It used to burst as soon as
 * the bank allowed, on pace or not; once sprinting and the swingier Wheel came in that gambled
 * away nights the rotation alone would have made. DECISIONS #73.)
 */
export function redBurst() {
  let bursts = 0;
  return (b: Bot) => {
    if (b.made()) return b.idle();
    const s = b.g.state;
    const behind = s.clock < NIGHT_TICKS / 2 && s.bank < s.quota;
    // a burst needs a cushion: three losses in a row are $1,500
    if (bursts < 2 && behind && s.bank >= 2000) {
      bursts++;
      b.redBursts++;
      b.sit('redline');
      for (let i = 0; i < 6 && b.canBet('redline') && !b.p.ghost; i++) b.round('redline', i % 2 ? 'red' : 'black');
    }
    midRotation(b);
  };
}

export const deadMan = (b: Bot) => {
  if (!b.canBet('deadman') || b.made()) return b.idle();
  b.sit('deadman');
  b.round('deadman');
};
