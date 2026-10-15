// The Collector (DESIGN.md §2, §6, §7): at 0:00, short of quota he takes a life per $2,000 short
// and the bank; at or over it, the team pays, or challenges him at the Circuit: win and he dies,
// you keep the quota and spin the Boon; lose and it's a life, the quota and the Bane.
import type { Game, System } from '../Game';
import type { PlayerState } from '../state';
import { MIDNIGHT_S } from './clock';
import { overshoot, payQuota, summarize } from './economy';
import { collectorAct, newCircuit, teamAct } from '../circuit';
import { ECONOMY } from '../../data/economy';
import { FLOOR_1 } from '../../data/floors';
import { BANES, BOONS, DEAR_SOULS_SOLO, WHEEL } from '../../data/wheels';
import { CHARMS, UPGRADES } from '../../data/charms';
import { collectorOf } from '../../data/collectors';
import { midnight } from './clock';
import { addMarkers, gainLife, living, loseLife, ticks } from '../rules';

/** How close to the Collector's table you must stand to call the night (m). */
export const CALL_RADIUS = 1.6;

/** The beat between the Circuit ending and the wheel coming up (s): a loss, your last shock, his
 *  words and the table turning back; a win, his slow death, the pit boss coming through the staff
 *  door and dragging him out, and the table turning back (presentation pacing in the sim). */
export const AFTER_CIRCUIT_S = 7;
export const AFTER_DEATH_S = 23.5;

function shortfall(g: Game) {
  const s = g.state;
  const short = s.quota - s.bank;
  const lives = Math.ceil(short / ECONOMY.shortfallPerLife.v);
  const bank = s.bank;
  s.bank = 0;
  g.emit({ t: 'shortfall', short, lives });
  let taken = 0;
  for (let i = 0; i < lives; i++) {
    const alive = living(g);
    if (!alive.length) break;
    // from the player with the most lives (ties: the lowest id; the team picks in co-op later)
    const p = alive.reduce((a, b) => (b.lives > a.lives ? b : a));
    if (loseLife(g, p, 'shortfall') === 'lost') taken++;
  }
  summarize(g, { bankAtMidnight: bank, how: 'short', short, livesTaken: taken, overshootMarkers: 0, circuit: null, wheel: null, ledger: null });
}

function charmFor(g: Game): PlayerState | null {
  const slots = ECONOMY.charmSlots.v + (g.state.upgrades.includes('slot4') ? 1 : 0);
  return living(g).find((p) => p.charms.length < slots && p.charms.length < CHARMS.length) ?? null;
}

function applyWheel(g: Game, kind: 'boon' | 'bane', slot: number): { id: string; text: string } {
  const s = g.state;
  if (kind === 'boon') {
    const b = BOONS[slot];
    switch (b.id) {
      case 'life': for (const p of living(g)) gainLife(g, p, 'boon'); break;
      case 'cash': s.bank += WHEEL.cash; break;
      case 'markers': addMarkers(g, WHEEL.markers, 'boon'); break;
      case 'charm': {
        const p = charmFor(g);
        // only from the pool: a locked charm can't come off the wheel either
        const free = p ? CHARMS.filter((c) => !p.charms.includes(c.id) && (!c.unlock || s.unlocked.includes(c.id))) : [];
        if (p && free.length) {
          const c = g.rng.pick(free);
          p.charms.push(c.id);
          g.emit({ t: 'bought', player: p.id, item: c.id, kind: 'charm' });
          return { id: b.id, text: `${c.name.toUpperCase()} IS YOURS` };
        }
        addMarkers(g, WHEEL.markers, 'boon');
        return { id: b.id, text: 'NO FREE SLOT: +3 MARKERS' };
      }
      case 'discount': s.next.discount = true; break;
      case 'immune': s.marks = []; s.next.immune = true; break;
    }
    return { id: b.id, text: b.text };
  }
  const b = BANES[slot];
  switch (b.id) {
    case 'colddeck': s.next.colddeck = true; break;
    case 'bleed': { const alive = living(g); if (alive.length) loseLife(g, g.rng.pick(alive), 'bane'); break; }
    case 'twoloss': s.next.twoLoss = true; break;
    case 'longmarks': s.next.longMarks = true; break;
    case 'dearsoul':
      if (s.players.length === 1) {
        s.nextDock = DEAR_SOULS_SOLO.dock;
        return { id: b.id, text: DEAR_SOULS_SOLO.text };
      }
      s.next.dearSoul = true;
      break;
    case 'overloads': s.next.overloads3 = true; break;
  }
  return { id: b.id, text: b.text };
}

export const collector: System = {
  id: 'collector',
  handles: ['pay', 'gamble', 'inspect', 'reroute', 'activate', 'fortune', 'callit'],
  command(g, p, cmd) {
    const s = g.state;
    const refuse = (why: string) => g.emit({ t: 'refused', player: p.id, cmd: cmd.t, why });
    if (cmd.t === 'callit') {
      // a broke team need not wait out the clock (the night is no shorter for anyone who plays it)
      if (s.phase !== 'floor') return refuse('not now');
      if (p.ghost) return refuse('a ghost has no say');
      if (s.players.length > 1) return refuse('the whole team must agree (co-op: Milestone 3)');
      const c = FLOOR_1.collector.stand;
      if ((p.x - c.x) ** 2 + (p.z - c.z) ** 2 > CALL_RADIUS ** 2) return refuse("walk to the Collector's table");
      midnight(g);
      return;
    }
    if (cmd.t === 'pay' || cmd.t === 'gamble') {
      if (s.phase !== 'choice') return refuse('not now');
      if (p.ghost) return refuse('a ghost has no say');
      const bank = s.bank;
      if (cmd.t === 'pay') {
        const over = payQuota(g);
        summarize(g, { bankAtMidnight: bank, how: 'paid', short: 0, livesTaken: 0, overshootMarkers: over, circuit: null, wheel: null, ledger: null });
        return;
      }
      // the challenge: nothing is paid yet. Win and you keep the quota; lose and it's his (DECISIONS #80)
      s.circuit = newCircuit(g);
      s.summary = { night: s.night, quota: s.quota, nextQuota: 0, bankAtMidnight: bank, how: 'gambled', short: 0, livesTaken: 0, overshootMarkers: 0, circuit: null, wheel: null, ledger: null };
      s.phase = 'circuit';
      s.phaseAt = g.tick;
      return;
    }
    if (cmd.t === 'inspect' || cmd.t === 'reroute' || cmd.t === 'activate') {
      if (s.phase !== 'circuit') return refuse('no circuit');
      const why = cmd.t === 'reroute' ? teamAct(g, p, 'reroute', cmd.a) : teamAct(g, p, cmd.t, cmd.circuit);
      if (why) refuse(why);
      return;
    }
    if (cmd.t === 'fortune') {
      const w = s.wheel;
      if (s.phase !== 'wheel' || !w || w.slot !== null) return refuse('not now');
      if (p.ghost) return refuse('a ghost has no say');
      w.slot = g.rng.int(0, 5);
      w.until = g.tick + ticks(WHEEL.spinS);
      g.emit({ t: 'spinning', kind: w.kind, slot: w.slot, ticks: ticks(WHEEL.spinS) });
    }
  },
  tick(g) {
    const s = g.state;
    if (s.phase === 'midnight' && g.tick - s.phaseAt >= ticks(MIDNIGHT_S)) {
      if (s.bank >= s.quota) {
        s.phase = 'choice';
        s.phaseAt = g.tick;
        g.emit({ t: 'choice' });
      } else shortfall(g);
    } else if (s.phase === 'circuit' && s.circuit) {
      const c = s.circuit;
      if (!c.done && c.turn === 'coll' && g.tick >= c.wait) collectorAct(g);
      if (c.done && s.phase === 'circuit' && g.tick - c.endedAt >= ticks(c.done.won ? AFTER_DEATH_S : AFTER_CIRCUIT_S)) {
        s.summary!.circuit = c.done;
        // won: he's dead, the quota stays in the bank (its overshoot still pays markers), and the
        // first kill of each Collector puts his charm in the pool; lost: the quota is paid now
        if (c.done.won) {
          s.summary!.overshootMarkers = overshoot(g);
          s.summary!.how = 'kept';
          s.collector.dead = true;
          s.killed.push(s.collector.idx);
          g.emit({ t: 'killed', idx: s.collector.idx });
          const charm = collectorOf(s.collector.idx).unlocks;
          if (charm && !s.unlocked.includes(charm)) {
            s.unlocked.push(charm);
            g.emit({ t: 'unlocked', charm });
          }
        } else s.summary!.overshootMarkers = payQuota(g);
        // the last night: no tomorrow for a Boon or a Bane to touch. A win takes one permanent
        // upgrade from the house's ledger; a loss costs only what the Circuit cost (DECISIONS #50).
        if (s.night >= ECONOMY.nights.v) {
          const part = s.summary!;
          let ledger: string | null = null;
          if (c.done.won) {
            const free = UPGRADES.filter((u) => !s.upgrades.includes(u.id));
            if (free.length) {
              const u = g.rng.pick(free);
              s.upgrades.push(u.id);
              ledger = u.id;
              g.emit({ t: 'bought', player: 0, item: u.id, kind: 'upgrade' });
            }
          }
          summarize(g, {
            bankAtMidnight: part.bankAtMidnight, how: part.how, short: 0, livesTaken: 0, overshootMarkers: part.overshootMarkers,
            circuit: c.done, wheel: null, ledger,
          });
          return;
        }
        s.wheel = { kind: c.done.won ? 'boon' : 'bane', slot: null, until: 0, applied: false };
        s.phase = 'wheel';
        s.phaseAt = g.tick;
      }
    } else if (s.phase === 'wheel' && s.wheel && s.wheel.slot !== null && !s.wheel.applied && g.tick >= s.wheel.until) {
      const w = s.wheel;
      w.applied = true;
      const r = applyWheel(g, w.kind, w.slot!);
      g.emit({ t: 'landed', kind: w.kind, id: r.id, text: r.text });
      const part = s.summary!;
      summarize(g, {
        bankAtMidnight: part.bankAtMidnight, how: part.how, short: 0, livesTaken: 0, overshootMarkers: part.overshootMarkers,
        circuit: part.circuit, wheel: { kind: w.kind, id: r.id as never }, ledger: null,
      });
    }
  },
};
