import { describe, expect, it } from 'vitest';
import { Game, SYSTEMS } from '../src/sim/Game';
import { collide } from '../src/sim/systems/movement';
import { FLOOR_1, PLAYER_R } from '../src/data/floors';
import { Rng } from '../src/engine/rng';

/** A pseudo-random night of walking, sitting and standing, from a seed (not the game's seed). */
function randomLog(g: Game, seed: number, ticks: number) {
  const r = new Rng(seed);
  while (g.tick < ticks) {
    if (r.chance(0.05)) g.submit(0, { t: 'move', mx: r.int(-1000, 1000), mz: r.int(-1000, 1000), yaw: r.int(-3141, 3141) });
    if (r.chance(0.004)) g.submit(0, { t: 'sit', table: 'hilo' });
    if (r.chance(0.004)) g.submit(0, { t: 'stand' });
    g.step();
  }
}

describe('sim scaffold', () => {
  it('runs the systems in the order CLAUDE.md fixes', () => {
    expect(SYSTEMS.map((s) => s.id)).toEqual(['clock', 'movement', 'tables', 'marks', 'lives', 'cage', 'home', 'collector', 'economy', 'stats']);
  });

  it('starts night 1 from DESIGN.md §2', () => {
    const s = new Game({ seed: 1 }).state;
    expect([s.bank, s.quota, s.night, s.clock]).toEqual([1500, 3000, 1, 360 * 60]);
    expect(s.players[0].lives).toBe(3);
  });

  it('replays a command log to an identical state hash', () => {
    for (const seed of [1, 7, 1234]) {
      const a = new Game({ seed });
      randomLog(a, seed * 31 + 5, 3600);
      const b = Game.replay(seed, 1, a.log, 3600);
      expect(b.hash()).toBe(a.hash());
      expect(b.state).toEqual(a.state);
    }
  });

  it('diverges when the log differs', () => {
    const a = new Game({ seed: 3 });
    randomLog(a, 99, 600);
    // drop the first walk: right after it, the player is somewhere else (compared early: given
    // long enough, two random walks can both end pressed into the same corner of the room)
    const first = a.log.findIndex((c) => c.cmd.t === 'move');
    const log = a.log.filter((_, i) => i !== first);
    const at = a.log[first].tick + 20;
    expect(Game.replay(3, 1, log, at).hash()).not.toBe(Game.replay(3, 1, a.log, at).hash());
  });

  it('walks at 3 m/s and stops at walls', () => {
    const g = new Game({ seed: 1 });
    const p = g.state.players[0];
    const z0 = p.z;
    g.submit(0, { t: 'move', mx: 0, mz: -1000, yaw: 0 });
    for (let i = 0; i < 60; i++) g.step();
    expect(z0 - p.z).toBeCloseTo(3, 5);
    // walk into the south wall for 10 s: the capsule stays inside the room
    g.submit(0, { t: 'move', mx: 0, mz: 1000, yaw: 0 });
    for (let i = 0; i < 600; i++) g.step();
    const main = FLOOR_1.rooms[0];
    expect(p.z).toBeLessThanOrEqual(main.z1 - 0.2 - PLAYER_R + 1e-9);
  });

  it('pushes a circle out of boxes and circles', () => {
    const box = { kind: 'box' as const, x0: 0, z0: 0, x1: 2, z1: 1, h: 1, what: 't' };
    expect(collide(1, 1.1, 0.3, [box])).toEqual({ x: 1, z: 1.3 });
    expect(collide(1, 0.9, 0.3, [box]).z).toBeCloseTo(1.3);
    const c = { kind: 'circle' as const, x: 0, z: 0, r: 1, h: 1, what: 'c' };
    const out = collide(0.5, 0, 0.3, [c]);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(1.3);
  });

  it('seats you at Hi-Lo only from its stand point, and stands you up', () => {
    const g = new Game({ seed: 1 });
    g.submit(0, { t: 'sit', table: 'hilo' });
    g.step();
    expect(g.state.players[0].seat).toBe(null);
    expect(g.drainEvents()).toEqual([{ t: 'refused', player: 0, cmd: 'sit', why: 'too far' }]);
    const hilo = FLOOR_1.tables.find((t) => t.table === 'hilo')!;
    Object.assign(g.state.players[0], { x: hilo.stand.x, z: hilo.stand.z });
    g.submit(0, { t: 'sit', table: 'hilo' });
    g.step();
    expect(g.state.players[0].seat).toBe('hilo');
    g.submit(0, { t: 'stand' });
    g.step();
    expect(g.drainEvents().map((e) => e.t)).toEqual(['sat', 'stood']);
  });
});
