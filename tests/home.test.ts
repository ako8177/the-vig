// The house (DECISIONS #79): order at the computer, the post reaches the mailbox, carry it in,
// drive to the casino; after the Collector's summary the run goes home again.
import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/Game';
import { CAR_STAND, COMPUTER_STAND, HOME_SPAWN, MAILBOX_STAND, POST_S } from '../src/data/home';
import { FLOOR_1 } from '../src/data/floors';
import { TICKS_PER_S } from '../src/sim/state';
import { startNight } from '../src/sim/systems/economy';

const at = (g: Game, s: { x: number; z: number }) => Object.assign(g.state.players[0], { x: s.x, z: s.z });

describe('the house', () => {
  it('starts a run at home, takes an order by post, and drives to the casino', () => {
    const g = new Game({ seed: 3, home: true });
    const s = g.state, p = s.players[0];
    expect(s.phase).toBe('home');
    expect(p.x).toBeCloseTo(HOME_SPAWN.x);
    s.markers = 10;
    // not at the desk: refused
    g.submit(0, { t: 'buy', item: 'luckyfuse' });
    g.step();
    expect(g.drainEvents()).toContainEqual({ t: 'refused', player: 0, cmd: 'buy', why: 'walk to the computer' });
    at(g, COMPUTER_STAND);
    g.submit(0, { t: 'buy', item: 'luckyfuse' });
    g.step();
    expect(s.markers).toBe(7);
    expect(s.post.orders).toEqual([{ item: 'luckyfuse', player: 0 }]);
    expect(p.charms).toEqual([]);
    // the same charm again is already coming
    g.submit(0, { t: 'buy', item: 'luckyfuse' });
    g.step();
    expect(s.markers).toBe(7);
    // the post takes its time; the clock doesn't run at home
    const clock = s.clock;
    for (let i = 0; i < POST_S.v * TICKS_PER_S + 2; i++) g.step();
    expect(s.clock).toBe(clock);
    expect(s.post.box.length).toBe(1);
    expect(g.drainEvents().some((e) => e.t === 'post')).toBe(true);
    at(g, MAILBOX_STAND);
    g.submit(0, { t: 'pickup' });
    g.step();
    expect(p.charms).toEqual(['luckyfuse']);
    expect(s.post.box).toEqual([]);
    at(g, CAR_STAND);
    g.submit(0, { t: 'drive' });
    g.step();
    expect(s.phase).toBe('floor');
    expect(p.z).toBeCloseTo(FLOOR_1.spawn.z);
    g.step();
    // the night clock starts with the drive
    expect(s.clock).toBe(clock - 2);
  });

  it('goes home after the night, and the cage no longer sells', () => {
    const g = new Game({ seed: 4, home: true });
    const s = g.state;
    at(g, CAR_STAND);
    g.submit(0, { t: 'drive' });
    g.step();
    s.markers = 10;
    at(g, FLOOR_1.cageStand);
    g.submit(0, { t: 'buy', item: 'magnet' });
    g.step();
    expect(g.drainEvents()).toContainEqual({ t: 'refused', player: 0, cmd: 'buy', why: 'order it from the computer at home' });
    s.summary = { night: 1, quota: 3000, nextQuota: 4500, bankAtMidnight: 5000, how: 'paid', short: 0, livesTaken: 0, overshootMarkers: 0, circuit: null, wheel: null, ledger: null };
    startNight(g);
    expect(s.phase).toBe('home');
    expect(s.night).toBe(2);
    expect(s.players[0].x).toBeCloseTo(HOME_SPAWN.x);
  });
});
