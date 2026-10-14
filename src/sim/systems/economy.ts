// The economy between nights (DESIGN.md §2): paying the quota, overshoot markers, the next
// quota, the bank floor, and starting the next night (the `ready` command).
import type { Game, System } from '../Game';
import { NIGHT_TICKS, NO_MODS, homeSpawnOf, newTables, spawnOf, type NightSummary } from '../state';
import { ECONOMY } from '../../data/economy';
import { WHEEL } from '../../data/wheels';
import { addMarkers, endRun } from '../rules';
import { endingFor } from '../../data/collectors';

/** Pay the quota out of the bank; overshoot pays a marker per whole $500 over. Returns the markers. */
export function payQuota(g: Game): number {
  const s = g.state;
  const over = Math.floor((s.bank - s.quota) / ECONOMY.overshootPerMarker.v);
  s.bank -= s.quota;
  addMarkers(g, over, 'overshoot');
  g.emit({ t: 'paid', quota: s.quota, overshootMarkers: over });
  return over;
}

/** The overshoot markers alone, the quota kept (a won challenge: DECISIONS #80). */
export function overshoot(g: Game): number {
  const s = g.state;
  const over = Math.max(0, Math.floor((s.bank - s.quota) / ECONOMY.overshootPerMarker.v));
  addMarkers(g, over, 'overshoot');
  return over;
}

/** Next night's quota: x1.5, a lost gamble's +10-40%, a Boon's -20%; to the nearest $10. */
export function nextQuota(g: Game): number {
  const s = g.state;
  const q = s.quota * ECONOMY.quotaGrowth.v * (s.next.discount ? 1 - WHEEL.discount : 1);
  return Math.round(q / 10) * 10;
}

/** Close the night: the summary card waits for `ready`. */
export function summarize(g: Game, part: Omit<NightSummary, 'night' | 'quota' | 'nextQuota'>) {
  const s = g.state;
  s.summary = { night: s.night, quota: s.quota, nextQuota: nextQuota(g), ...part };
  if (s.phase === 'over') return;
  s.phase = 'summary';
  s.phaseAt = g.tick;
  g.emit({ t: 'summary', summary: s.summary });
}

export function startNight(g: Game) {
  const s = g.state;
  const sum = s.summary!;
  s.night++;
  s.quota = sum.nextQuota;
  s.bank = Math.max(s.bank, ECONOMY.bankFloor.v) + (s.upgrades.includes('bank500') ? 500 : 0) - s.nextDock;
  s.nextDock = 0;
  s.clock = NIGHT_TICKS;
  s.mods = { ...s.next };
  s.next = { ...NO_MODS };
  // a Collector who died at the table is replaced by the next one (DECISIONS #81)
  if (s.collector.dead) s.collector = { idx: s.collector.idx + 1, dead: false };
  s.marks = s.mods.colddeck ? [{ id: 'colddeck', player: -1, left: NIGHT_TICKS, stacks: 1 }] : [];
  s.tables = newTables();
  s.circuit = null;
  s.wheel = null;
  s.summary = null;
  s.players.forEach((p, i) => {
    // with the house, the night begins at home: the car takes you to the casino (DECISIONS #79)
    Object.assign(p, s.home ? homeSpawnOf(i, s.players.length) : spawnOf(i, s.players.length));
    p.mx = p.mz = 0;
    p.seat = null;
    p.apronUsed = false;
    p.redStreak = 0;
  });
  s.phase = s.home ? 'home' : 'floor';
  s.phaseAt = g.tick;
  g.emit({ t: 'night', night: s.night, quota: s.quota, bank: s.bank });
}

export const economy: System = {
  id: 'economy',
  handles: ['ready'],
  command(g) {
    const s = g.state;
    if (s.phase !== 'summary') return;
    if (s.night >= ECONOMY.nights.v) {
      // the ending: by how many Collectors died at your table (DECISIONS #81)
      const e = endingFor(s.killed.length);
      endRun(g, true, `${e.title}. ${e.text}`);
      g.emit({ t: 'ending', id: e.id });
    }
    else startNight(g);
  },
};
