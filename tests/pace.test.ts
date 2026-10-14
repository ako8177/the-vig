// The pace tests (DESIGN.md §8): bots play the real sim on 20 seeds, and each lesson the design
// leans on must hold. If one stops holding, the fix goes in DESIGN.md first (CLAUDE.md, rules).
import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/Game';
import { Bot, SEEDS, deadMan, midRotation, night, redBurst, safeOnly } from './bots';
import { newCircuit } from '../src/sim/circuit';
import type { CharmId } from '../src/data/charms';
import { ECONOMY } from '../src/data/economy';
import { buybackPrice } from '../src/sim/systems/lives';
import { loseLife } from '../src/sim/rules';

const count = <T>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length;

const N = SEEDS.length;
const pct = (k: number) => `${Math.round((k / N) * 100)}%`;

describe('pace tests (DESIGN.md §8, 200 seeds)', () => {
  it('1. safe-only (Bandit + Twenty-One, minimum stakes) makes night 1 at most 15% of the time, and loses money on average', () => {
    const runs = SEEDS.map((seed) => {
      const g = new Game({ seed });
      return { made: night(g, safeOnly).made, bank: g.state.bank };
    });
    const made = count(runs, (r) => r.made);
    const mean = runs.reduce((a, r) => a + r.bank, 0) / runs.length;
    console.log(`  safe-only: made ${pct(made)}, mean bank at 0:00 $${Math.round(mean)}`);
    expect(made / N).toBeLessThanOrEqual(0.15);
    expect(mean).toBeLessThan(ECONOMY.startBank.v);
  });

  it('2. mid rotation (Hi-Lo bursts, the Wheel while marked) makes night 1 at least 50% of the time, suffering >= 3 team marks on average', () => {
    const runs = SEEDS.map((seed) => night(new Game({ seed }), midRotation));
    const made = count(runs, (r) => r.made);
    const marks = runs.reduce((a, r) => a + r.bot.teamMarks, 0) / runs.length;
    console.log(`  mid rotation: made ${pct(made)}, mean team marks ${marks.toFixed(1)}`);
    expect(made / N).toBeGreaterThanOrEqual(0.5);
    expect(marks).toBeGreaterThanOrEqual(3);
  });

  it('3. Red Line bursts when behind make night 1 at least 60% of the time, more than the mid rotation alone, and a night that bursts loses a life there at least 20% of the time', () => {
    const runs = SEEDS.map((seed) => night(new Game({ seed }), redBurst()));
    const made = count(runs, (r) => r.made);
    const burst = runs.filter((r) => r.bot.redBursts > 0);
    const lost = count(burst, (r) => r.bot.redLives > 0);
    const mid = count(SEEDS.map((seed) => night(new Game({ seed }), midRotation)), (r) => r.made);
    console.log(`  red line bursts: made ${pct(made)} (mid alone ${pct(mid)}); ${burst.length} nights burst, ${Math.round((100 * lost) / burst.length)}% of them lost a life there`);
    expect(made / N).toBeGreaterThanOrEqual(0.6);
    expect(made).toBeGreaterThan(mid);
    expect(burst.length).toBeGreaterThan(0);
    expect(lost / burst.length).toBeGreaterThanOrEqual(0.2);
  });

  it("4. Dead Man's Hand from a $1,000 bank goes broke at least 30% of the time", () => {
    const runs = SEEDS.map((seed) => {
      const g = new Game({ seed });
      g.state.bank = 1000;
      night(g, deadMan);
      return g.state.bank < 1000 && g.state.bank < g.state.quota;
    });
    const broke = count(runs, (x) => x);
    console.log(`  dead man's: broke ${pct(broke)}`);
    expect(broke / N).toBeGreaterThanOrEqual(0.3);
  });

  /** Play one Circuit with a team policy; returns whether the team won and the lives it cost. */
  function circuit(seed: number, charms: CharmId[], policy: (g: Game, r: () => number) => Act) {
    const g = new Game({ seed, unlocked: ['insulated'] });
    const s = g.state;
    s.players[0].charms = [...charms];
    s.bank = 5000;
    s.phase = 'circuit';
    s.circuit = newCircuit(g);
    s.summary = { night: 1, quota: 3000, nextQuota: 0, bankAtMidnight: 5000, how: 'gambled', short: 0, livesTaken: 0, overshootMarkers: 0, circuit: null, wheel: null, ledger: null };
    const r = rng(seed);
    for (let k = 0; k < 4000 && s.phase === 'circuit' && !s.circuit!.done; k++) {
      if (s.circuit!.turn === 'team') g.submit(0, cmdOf(policy(g, r)));
      g.step();
      g.drainEvents();
    }
    return { won: !!s.circuit?.done?.won, lost: 3 - s.players[0].lives };
  }

  type Act = { t: 'inspect' | 'activate'; i: number };
  /** a seeded coin for the bots' own picks (the sim's RNG stays the sim's) */
  const rng = (seed: number) => {
    let x = (seed * 2654435761) >>> 0 || 1;
    return () => ((x = Math.imul(x ^ (x >>> 13), 1274126177) + 0x6d2b79f5 >>> 0) >>> 8) / 16777216;
  };
  /**
   * The only line there is (DESIGN.md §6, DECISIONS #80): pull at random; with the Insulated Kit's
   * traces left, trace a lever before pulling and pull one you traced dead.
   */
  const pull = (g: Game, r: () => number): Act => {
    const c = g.state.circuit!;
    const up = c.levers.map((l, i) => ({ l, i })).filter(({ l }) => !l.pulled);
    const dead = up.find(({ l }) => l.known && !l.live);
    if (dead) return { t: 'activate', i: dead.i };
    const unknown = up.filter(({ l }) => !l.known);
    if (c.traces[0] > 0 && unknown.length > 1) return { t: 'inspect', i: unknown[Math.floor(r() * unknown.length)].i };
    const pick = unknown.length ? unknown : up;
    return { t: 'activate', i: pick[Math.floor(r() * pick.length)].i };
  };
  const cmdOf = (a: Act) => (a.t === 'inspect' ? { t: 'inspect' as const, circuit: a.i } : { t: 'activate' as const, circuit: a.i });

  // one Circuit is a coin flip, so its band is measured on 400 games (±5%)
  const GAMES = Array.from({ length: 400 }, (_, i) => 77 + i * 7919);

  it("5. the Circuit (400 games): pulling at random wins 40-60%; the Insulated Kit's traces win at least 65%; Lead Apron takes the life cost to ~0", () => {
    const play = (charms: CharmId[]) => {
      const r = GAMES.map((s) => circuit(s, charms, pull));
      return { won: Math.round((count(r, (x) => x.won) / r.length) * 100), lost: r.reduce((a, x) => a + x.lost, 0) / r.length };
    };
    const bare = play([]), kit = play(['insulated']), apron = play(['leadapron']);
    const f = (x: { won: number; lost: number }) => `${x.won}% won, ${x.lost.toFixed(2)} lives`;
    console.log(`  circuit: at random ${f(bare)}; with the kit ${f(kit)}; with lead apron ${f(apron)}`);
    expect(bare.won).toBeGreaterThanOrEqual(40);
    expect(bare.won).toBeLessThanOrEqual(60);
    expect(kit.won).toBeGreaterThanOrEqual(65);
    expect(apron.lost).toBeLessThanOrEqual(0.02);
  });

  const survived: Record<string, number[]> = { decide: [0, 0, 0, 0], pay: [0, 0, 0, 0], gamble: [0, 0, 0, 0] };
  /** A whole three-night run: rotation with a Red Line burst, charms when markers allow, a Collector policy. */
  function run(seed: number, policy: 'decide' | 'pay' | 'gamble'): number {
    const g = new Game({ seed });
    const s = g.state;
    for (let guard = 0; guard < 10 && s.phase !== 'over'; guard++) {
      const bot = new Bot(g);
      // the cage first: a fuse charm if the markers are there
      if (s.markers >= 3) {
        bot.toCage();
        for (const c of ['leadapron', 'luckyfuse', 'magnet'] as CharmId[]) if (s.markers >= 3) bot.buy(c);
      }
      night(g, redBurst(), bot);
      // 0:00 → the choice (or a shortfall)
      for (let k = 0; k < 600 && s.phase === 'midnight'; k++) g.step();
      if (s.phase === 'choice') {
        const me = s.players[0];
        const fuse = me.charms.includes('leadapron') || me.charms.includes('luckyfuse');
        const gamble = policy === 'gamble' || (policy === 'decide' && fuse && me.lives > 1);
        g.submit(0, { t: gamble ? 'gamble' : 'pay' });
        g.step();
        const r = rng(seed + s.night);
        for (let k = 0; k < 8000 && (s.phase as string) === 'circuit'; k++) {
          if (s.circuit && !s.circuit.done && s.circuit.turn === 'team') g.submit(0, cmdOf(pull(g, r)));
          g.step();
        }
        if ((s.phase as string) === 'wheel') {
          g.submit(0, { t: 'fortune' });
          for (let k = 0; k < 600 && (s.phase as string) === 'wheel'; k++) g.step();
        }
      }
      if (s.phase === 'summary') {
        g.submit(0, { t: 'ready' });
        g.step();
      }
      g.drainEvents();
    }
    const nights = s.result?.won ? ECONOMY.nights.v : s.night - 1;
    survived[policy][nights]++;
    return nights + s.players[0].lives / 10;
  }

  it("6. the Collector's choice: challenging him survives at least as well as paying (a win keeps the quota)", () => {
    // DECISIONS #80: a won challenge keeps the whole quota and the surcharge is gone, so the
    // challenge is now worth taking far more often than not. Measured, and written down as an open
    // question for the owner (HANDOFF.md): today always challenging beats always paying.
    const score = (p: 'decide' | 'pay' | 'gamble') => SEEDS.reduce((a, seed) => a + run(seed, p), 0) / SEEDS.length;
    const d = score('decide'), p = score('pay'), gb = score('gamble');
    console.log(`  collector's choice (nights + lives/10): decide ${d.toFixed(2)}, always pay ${p.toFixed(2)}, always challenge ${gb.toFixed(2)}`);
    console.log(`  nights survived 0/1/2/3: ${JSON.stringify(survived)}`);
    expect(gb).toBeGreaterThanOrEqual(p);
    expect(d).toBeGreaterThanOrEqual(p - 0.15);
  });

  // a lower bound: the bot doesn't play the bought-back player, who in a real run plays a table too
  it('7. a ghost in the first minute: the survivor alone still makes night 1 at least 30% of the time, buying the soul back when the bank allows', () => {
    const made = count(SEEDS, (seed) => {
      const g = new Game({ seed, players: 2 });
      const s = g.state;
      for (let i = 0; i < 3; i++) loseLife(g, s.players[1], 'test');
      let bought = false;
      const play = redBurst();
      const r = night(g, (b) => {
        if (!bought && s.players[1].ghost && s.bank > buybackPrice(g) + 1000) {
          b.toCage();
          g.submit(0, { t: 'buyback', target: 1 });
          b.step();
          bought = !s.players[1].ghost;
        }
        play(b);
      });
      return r.made;
    });
    console.log(`  ghost: the survivor made night 1 ${pct(made)}`);
    expect(made / N).toBeGreaterThanOrEqual(0.3);
  });
});
