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

describe('pace tests (DESIGN.md §8, 20 seeds)', () => {
  it('1. safe-only (Bandit + Twenty-One, minimum stakes) fails night 1 on >= 17/20, and loses money on average', () => {
    const runs = SEEDS.map((seed) => {
      const g = new Game({ seed });
      return { made: night(g, safeOnly).made, bank: g.state.bank };
    });
    const made = count(runs, (r) => r.made);
    const mean = runs.reduce((a, r) => a + r.bank, 0) / runs.length;
    console.log(`  safe-only: made ${made}/20, mean bank at 0:00 $${Math.round(mean)}`);
    expect(20 - made).toBeGreaterThanOrEqual(17);
    expect(mean).toBeLessThan(ECONOMY.startBank.v);
  });

  it('2. mid rotation (Hi-Lo bursts, the Wheel while marked) makes night 1 on >= 10/20, suffering >= 3 team marks on average', () => {
    const runs = SEEDS.map((seed) => night(new Game({ seed }), midRotation));
    const made = count(runs, (r) => r.made);
    const marks = runs.reduce((a, r) => a + r.bot.teamMarks, 0) / runs.length;
    console.log(`  mid rotation: made ${made}/20, mean team marks ${marks.toFixed(1)}`);
    expect(made).toBeGreaterThanOrEqual(10);
    expect(marks).toBeGreaterThanOrEqual(3);
  });

  it('3. two Red Line bursts make night 1 on >= 13/20 and cost a life there on >= 5/20', () => {
    const runs = SEEDS.map((seed) => night(new Game({ seed }), redBurst()));
    const made = count(runs, (r) => r.made);
    const lost = count(runs, (r) => r.bot.redLives > 0);
    console.log(`  red line bursts: made ${made}/20, lost a life there ${lost}/20`);
    expect(made).toBeGreaterThanOrEqual(13);
    expect(lost).toBeGreaterThanOrEqual(5);
  });

  it("4. Dead Man's Hand from a $1,000 bank goes broke on >= 6/20", () => {
    const runs = SEEDS.map((seed) => {
      const g = new Game({ seed });
      g.state.bank = 1000;
      night(g, deadMan);
      return g.state.bank < 1000 && g.state.bank < g.state.quota;
    });
    const broke = count(runs, (x) => x);
    console.log(`  dead man's: broke ${broke}/20`);
    expect(broke).toBeGreaterThanOrEqual(6);
  });

  /** Play one Circuit with a team policy; returns whether the team won. */
  function circuit(seed: number, charms: CharmId[], policy: (g: Game, turn: number) => Act) {
    const g = new Game({ seed });
    const s = g.state;
    s.players[0].charms = [...charms];
    s.bank = 5000;
    s.phase = 'circuit';
    s.circuit = newCircuit(g);
    s.summary = { night: 1, quota: 3000, nextQuota: 0, bankAtMidnight: 5000, how: 'gambled', short: 0, livesTaken: 0, overshootMarkers: 0, circuit: null, wheel: null };
    let turn = 0;
    for (let k = 0; k < 2000 && s.phase === 'circuit' && !s.circuit!.done; k++) {
      if (s.circuit!.turn === 'team') {
        g.submit(0, cmdOf(policy(g, turn++)));
      }
      g.step();
      g.drainEvents();
    }
    return { won: !!s.circuit?.done?.won, lost: 3 - s.players[0].lives };
  }

  type Act = { t: 'inspect' | 'activate'; i: number };
  /**
   * Inspect `n` times, then activate known safes; blind only when nothing safe is known (DESIGN.md §6).
   * `blindFirst`: activate blind on the very first turn (the Lead Apron line).
   */
  const sensible = (n: number, blindFirst = false) => (g: Game, turn: number): Act => {
    const c = g.state.circuit!;
    const open = c.slots.map((sl, i) => ({ sl, i })).filter(({ sl }) => !sl.spent);
    const unknown = open.filter(({ sl }) => !sl.known);
    if (blindFirst && turn === 0 && unknown.length) return { t: 'activate', i: unknown[0].i };
    const safe = open.find(({ sl }) => sl.known && !sl.over);
    if (safe) return { t: 'activate', i: safe.i };
    if (turn - (blindFirst ? 1 : 0) < n && unknown.length) return { t: 'inspect', i: unknown[unknown.length - 1].i };
    const pick = unknown[0] ?? open.find(({ sl }) => !sl.over) ?? open[0];
    return { t: 'activate', i: pick.i };
  };
  const cmdOf = (a: Act) => (a.t === 'inspect' ? { t: 'inspect' as const, circuit: a.i } : { t: 'activate' as const, circuit: a.i });

  // one Circuit is close to a coin flip (±11% at 20 games), so its band is measured on 100 games
  const GAMES = Array.from({ length: 100 }, (_, i) => 77 + i * 7919);

  it('5. the Circuit (100 games): inspecting once then cashing safes wins 30-65%; Lead Apron flips the blind first move from costly to free (the flip)', () => {
    const play = (charms: CharmId[], blind: boolean) => {
      const r = GAMES.map((s) => circuit(s, charms, sensible(1, blind)));
      return { won: count(r, (x) => x.won), lost: r.reduce((a, x) => a + x.lost, 0) / r.length };
    };
    const inspect = play([], false), blind = play([], true);
    const aInspect = play(['leadapron'], false), aBlind = play(['leadapron'], true);
    const f = (x: { won: number; lost: number }) => `${x.won}% won, ${x.lost.toFixed(2)} lives`;
    console.log(`  circuit: inspect first ${f(inspect)}; blind first ${f(blind)}; with lead apron: inspect first ${f(aInspect)}, blind first ${f(aBlind)}`);
    expect(inspect.won).toBeGreaterThanOrEqual(30);
    expect(inspect.won).toBeLessThanOrEqual(65);
    // without the apron the blind move costs lives; with it, it costs no more than inspecting and wins as often
    expect(blind.lost).toBeGreaterThan(inspect.lost);
    expect(aBlind.lost).toBeLessThanOrEqual(aInspect.lost + 0.05);
    expect(aBlind.won).toBeGreaterThanOrEqual(aInspect.won - 3);
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
        let turn = 0;
        for (let k = 0; k < 5000 && (s.phase as string) === 'circuit'; k++) {
          if (s.circuit && !s.circuit.done && s.circuit.turn === 'team') {
            g.submit(0, cmdOf(sensible(1, me.charms.includes('leadapron'))(g, turn++)));
          }
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

  it("6. the Collector's choice: gambling with a fuse charm and paying without one beats always-pay and always-gamble", () => {
    const score = (p: 'decide' | 'pay' | 'gamble') => SEEDS.reduce((a, seed) => a + run(seed, p), 0) / SEEDS.length;
    const d = score('decide'), p = score('pay'), gb = score('gamble');
    console.log(`  collector's choice (nights + lives/10): decide ${d.toFixed(2)}, always pay ${p.toFixed(2)}, always gamble ${gb.toFixed(2)}`);
    console.log(`  nights survived 0/1/2/3: ${JSON.stringify(survived)}`);
    expect(d).toBeGreaterThanOrEqual(gb);
    expect(d).toBeGreaterThanOrEqual(p - 0.15);
  });

  // a lower bound: the bot doesn't play the bought-back player, who in a real run plays a table too
  it('7. a ghost in the first minute: the survivor alone still makes night 1 on >= 6/20, buying the soul back when the bank allows', () => {
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
    console.log(`  ghost: the survivor made night 1 ${made}/20`);
    expect(made).toBeGreaterThanOrEqual(6);
  });
});
