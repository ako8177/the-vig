// The lever duel (DECISIONS #80, #81): win and he dies, you keep the quota, his charm joins the pool
// and a new Collector sits down tomorrow; lose and it's a life and the quota.
import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/Game';
import { startNight } from '../src/sim/systems/economy';
import { AFTER_CIRCUIT_S } from '../src/sim/systems/collector';
import { TICKS_PER_S } from '../src/sim/state';
import { FLOOR_1 } from '../src/data/floors';

/** Reach the choice with the bank over quota, challenge, then rig the levers. */
function duel(seed: number) {
  const g = new Game({ seed });
  const s = g.state;
  s.bank = 5000;
  s.phase = 'choice';
  g.submit(0, { t: 'gamble' });
  g.step();
  expect(s.phase).toBe('circuit');
  expect(s.bank).toBe(5000);
  return g;
}
const finish = (g: Game) => {
  for (let i = 0; i < (AFTER_CIRCUIT_S + 1) * TICKS_PER_S && g.state.phase === 'circuit'; i++) g.step();
};

describe('the lever duel', () => {
  it('kills him on his second shock: the quota stays, the Kit unlocks, the next Collector comes', () => {
    const g = duel(1);
    const s = g.state, c = s.circuit!;
    // every lever live but the first two you pull: he shocks himself twice
    c.levers.forEach((l, i) => (l.live = i >= 2));
    for (const i of [0, 1]) {
      g.submit(0, { t: 'activate', circuit: i });
      g.step();
      for (let k = 0; k < 400 && c.turn === 'coll'; k++) g.step();
    }
    expect(c.done?.won).toBe(true);
    finish(g);
    expect(s.phase).toBe('wheel');
    expect(s.bank).toBeGreaterThanOrEqual(5000 + 600);
    expect(s.collector.dead).toBe(true);
    expect(s.unlocked).toContain('insulated');
    expect(s.killed).toEqual([0]);
    s.summary!.nextQuota = 4500;
    startNight(g);
    expect(s.collector).toEqual({ idx: 1, dead: false });
  });

  it('takes a life on your second shock and the quota is paid', () => {
    const g = duel(2);
    const s = g.state, c = s.circuit!;
    c.levers.forEach((l) => (l.live = true));
    g.submit(0, { t: 'activate', circuit: 0 });
    g.step();
    expect(c.shocks[0]).toBe(1);
    // his pull: rig him dead first
    c.levers.forEach((l, i) => (l.live = i < 5 || l.pulled));
    for (let k = 0; k < 400 && c.turn === 'coll'; k++) g.step();
    const up = c.levers.findIndex((l) => !l.pulled && l.live);
    g.submit(0, { t: 'activate', circuit: up });
    g.step();
    expect(c.done?.won).toBe(false);
    expect(s.players[0].lives).toBe(2);
    finish(g);
    expect(s.bank).toBe(5000 - 3000);
    expect(s.collector.dead).toBe(false);
  });

  it('keeps the Insulated Kit out of the shop until it is unlocked', () => {
    for (const unlocked of [[], ['insulated']] as const) {
      const g = new Game({ seed: 3, unlocked: [...unlocked] });
      const p = g.state.players[0];
      g.state.markers = 9;
      Object.assign(p, FLOOR_1.cageStand);
      g.submit(0, { t: 'buy', item: 'insulated' });
      g.step();
      expect(p.charms.includes('insulated')).toBe(unlocked.length > 0);
    }
  });
});
