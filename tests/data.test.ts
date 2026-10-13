// The data validation test (CLAUDE.md, architecture rules): every number carries a derivation
// naming a DESIGN.md section; every table's RTP is what its outcomes add up to (exactly, by
// enumeration) and what 100k seeded rounds measure; every charm touches two systems (pillar 3).
import { describe, expect, it } from 'vitest';
import { TABLES } from '../src/data/tables';
import { CHARMS, UPGRADES } from '../src/data/charms';
import { MARKS } from '../src/data/marks';
import { BANES, BOONS } from '../src/data/wheels';
import { CIRCUIT_RULES } from '../src/data/circuit';
import { ECONOMY } from '../src/data/economy';
import { MODULES, MODULE_BY_ID } from '../src/sim/tables';
import { Game } from '../src/sim/Game';
import { FLOOR_1 } from '../src/data/floors';
import { best, handValue } from '../src/sim/tables/twentyone';
import { TIER_ROLE } from '../src/data/palette';

const NAMES_DESIGN = /DESIGN\.md §\d/;

describe('data validation', () => {
  it('every number names its DESIGN.md section', () => {
    const all: { derivation: string }[] = [
      ...TABLES, ...CHARMS, ...UPGRADES, ...MARKS, ...BOONS, ...BANES, ...CIRCUIT_RULES,
      ...Object.values(ECONOMY).flatMap((v) => ('derivation' in v ? [v as { derivation: string }] : Object.values(v))),
    ];
    for (const d of all) expect(d.derivation, JSON.stringify(d)).toMatch(NAMES_DESIGN);
  });

  it('every table has a module, a tier color, a seat and a sign', () => {
    for (const t of TABLES) {
      expect(MODULE_BY_ID.has(t.id), t.id).toBe(true);
      expect(TIER_ROLE[t.tier], t.id).toBeDefined();
      expect(FLOOR_1.tables.some((p) => p.table === t.id), t.id).toBe(true);
    }
    expect(MODULES.length).toBe(TABLES.length);
  });

  it("every table's RTP is exact by enumeration, and pays x p where it has one payout", () => {
    for (const m of MODULES) {
      const o = m.odds();
      expect(Math.abs(o.rtp - m.def.rtp) / m.def.rtp, `${m.id} rtp ${o.rtp}`).toBeLessThan(0.005);
      if (m.def.pays !== null) {
        expect(Math.abs(m.def.pays * m.def.winP - m.def.rtp) / m.def.rtp, `${m.id} pays x p`).toBeLessThan(0.005);
        expect(o.winP, m.id).toBeCloseTo(m.def.winP, 6);
      }
    }
  });

  it('the tier rule: RTP rises with the tier, low < 1 < mid < high', () => {
    const by = (tier: string) => TABLES.filter((t) => t.tier === tier).map((t) => t.rtp);
    for (const r of by('low')) expect(r).toBeLessThan(1);
    expect(Math.min(...by('mid'))).toBeGreaterThan(1);
    expect(Math.min(...by('high'))).toBeGreaterThan(Math.max(...by('mid')));
  });

  it('every charm touches at least two systems (pillar 3)', () => {
    for (const c of CHARMS) expect(new Set(c.systems).size, c.id).toBeGreaterThanOrEqual(2);
  });

  it('100k seeded rounds land within 4 standard errors of each RTP', () => {
    const N = 100_000;
    for (const m of MODULES) {
      const g = new Game({ seed: 4242 });
      const p = g.state.players[0];
      p.charms = [];
      let ret = 0, sq = 0, bet = 0;
      for (let i = 0; i < N; i++) {
        g.state.bank = 1e9;
        g.state.marks = [];
        p.lives = 3;
        p.redStreak = 0;
        let o;
        if (m.id === 'twentyone') {
          o = m.start(g, p, { t: 'bet', table: 'twentyone', amount: 100 });
          while (o === null) {
            const h = g.state.tables.twentyone.hand!;
            const v = handValue(h.player);
            const up = Math.min(10, h.dealer[0].r);
            o = m.start(g, p, { t: 'call', table: 'twentyone', call: best(v.total, v.soft, up).hit ? 'hit' : 'stand' });
          }
        } else if (m.id === 'hilo') o = m.start(g, p, { t: 'call', table: 'hilo', call: i % 2 ? 'hi' : 'lo' });
        else if (m.id === 'redline') o = m.start(g, p, { t: 'call', table: 'redline', call: i % 2 ? 'red' : 'black' });
        else o = m.start(g, p, { t: 'spin', table: m.id });
        if (!o || typeof o === 'string') throw new Error(`${m.id}: ${o}`);
        const x = o.ret / o.bet;
        ret += x;
        sq += x * x;
        bet++;
      }
      const mean = ret / bet;
      const se = Math.sqrt((sq / bet - mean * mean) / bet);
      expect(Math.abs(mean - m.def.rtp), `${m.id}: measured ${mean.toFixed(4)} ± ${se.toFixed(4)}`).toBeLessThan(4 * se);
    }
  });
});
