// The Circuit (DESIGN.md §6): a panel of hidden circuits, some overloaded. The team and the
// Collector alternate turns, the team first. The team inspects ($100, or a marker with Marker
// Magnet), reroutes (swaps two positions) or activates; the Collector activates the position the
// team has left alone longest, skipping any he believes overloaded. Pure functions of the Game.
import type { Game } from './Game';
import type { CircuitState, PlayerState } from './state';
import { CIRCUIT_RULES } from '../data/circuit';
import { OVERCLOCK } from '../data/charms';
import { WHEEL } from '../data/wheels';
import { addMarkers, gainLife, living, loseLife, ticks } from './rules';

export const rulesFor = (floor: number) => CIRCUIT_RULES.find((r) => r.floor === floor) ?? CIRCUIT_RULES[0];

export function newCircuit(g: Game): CircuitState {
  const r = rulesFor(g.state.floor);
  // the Bane: three overloads, and he carries three fuses, so no trap can blow him out (DECISIONS #52)
  const overloads = g.state.mods.overloads3 ? WHEEL.bigOverloads : r.overloads;
  const states = Array.from({ length: r.circuits }, (_, i) => i < overloads);
  g.rng.shuffle(states);
  return {
    slots: states.map((over) => ({ over, spent: false, known: false, touched: -1, by: null })),
    mem: states.map(() => null),
    fuses: g.state.mods.overloads3 ? WHEEL.bigOverloads : r.fuses,
    overloadsLeft: overloads,
    teamSafe: 0,
    collSafe: 0,
    turn: 'team',
    wait: 0,
    survived: [],
    log: ['YOUR TURN: INSPECT, REROUTE OR ACTIVATE.'],
    done: null,
    endedAt: 0,
  };
}

const say = (c: CircuitState, line: string) => {
  c.log.unshift(line);
  c.log.length = Math.min(c.log.length, 4);
};

/** Check the end conditions (DESIGN.md §6); returns true when it's over. */
function checkEnd(g: Game, c: CircuitState): boolean {
  let done: CircuitState['done'] = null;
  // the team can still play a circuit that isn't spent and isn't a revealed overload
  const live = c.slots.some((s) => !s.spent && !(s.known && s.over));
  if (c.fuses <= 0) done = { won: true, why: 'THE COLLECTOR BLEW HIS LAST FUSE.' };
  else if (living(g).length === 0) done = { won: false, why: 'NO ONE IS LEFT STANDING.' };
  else if (c.overloadsLeft <= 0 || !live) {
    const how = c.overloadsLeft <= 0 ? 'BOTH OVERLOADS ARE SPENT' : 'NO SAFE CIRCUIT IS LEFT';
    done = c.teamSafe > c.collSafe
      ? { won: true, why: `${how}: YOU ${c.teamSafe} SAFE, HIM ${c.collSafe}.` }
      : { won: false, why: `${how}: YOU ${c.teamSafe} SAFE, HIM ${c.collSafe}.${c.teamSafe === c.collSafe ? ' TIES GO TO THE HOUSE.' : ''}` };
  }
  if (!done) return false;
  // Lucky Fuse: win the Circuit having survived an overload in it, +1 life (DECISIONS #53)
  if (done.won) for (const id of c.survived) {
    const p = g.state.players[id];
    if (p.charms.includes('luckyfuse') && !p.ghost) gainLife(g, p, 'lucky fuse');
  }
  c.done = done;
  c.endedAt = g.tick;
  g.emit({ t: 'circuitEnd', won: done.won, why: done.why });
  return true;
}

function passTurn(g: Game, c: CircuitState) {
  if (checkEnd(g, c)) return;
  c.turn = 'coll';
  c.wait = g.tick + ticks(rulesFor(g.state.floor).collectorTurnS);
}

/** A team action. Returns a refusal reason, or null when it was taken. */
export function teamAct(g: Game, p: PlayerState, act: 'inspect' | 'reroute' | 'activate', a: number, b = -1): string | null {
  const c = g.state.circuit;
  if (!c || c.done) return 'no circuit';
  if (c.turn !== 'team') return "it's the Collector's turn";
  const n = c.slots.length;
  const ok = (i: number) => Number.isInteger(i) && i >= 0 && i < n;
  if (!ok(a) || (act === 'reroute' && (!ok(b) || a === b))) return 'no such circuit';
  if (p.ghost && act !== 'inspect') return 'a ghost may only inspect';
  const r = rulesFor(g.state.floor);
  const s = c.slots[a];
  if (act === 'inspect') {
    if (s.spent) return 'already spent';
    if (s.known) return 'already known';
    const magnet = p.charms.includes('magnet') && g.state.markers >= 1;
    if (magnet) g.state.markers -= 1;
    else if (g.state.bank >= r.inspectCost) g.state.bank -= r.inspectCost;
    else return 'the bank is short';
    s.known = true;
    s.touched = g.tick;
    c.mem[a] = s.over; // he watches you look
    const text = `#${a + 1} IS ${s.over ? 'OVERLOADED' : 'SAFE'} (${magnet ? '1 MARKER' : '$' + r.inspectCost})`;
    say(c, text);
    g.emit({ t: 'circuit', who: 'team', action: 'inspect', slot: a, over: s.over, text });
  } else if (act === 'reroute') {
    if (s.spent || c.slots[b].spent) return 'already spent';
    // the circuits swap; what the team knew moves with them; his memory stays with the positions
    [c.slots[a], c.slots[b]] = [c.slots[b], c.slots[a]];
    const text = `REROUTED #${a + 1} AND #${b + 1}`;
    say(c, text);
    g.emit({ t: 'circuit', who: 'team', action: 'reroute', slot: a, text });
  } else {
    if (s.spent) return 'already spent';
    // a revealed overload is dead to the team: the only way to spend it is to route him into it
    if (s.known && s.over) return 'it is overloaded: reroute it into his path instead';
    s.spent = true;
    s.known = true;
    s.by = 'team';
    s.touched = g.tick;
    c.mem[a] = s.over;
    if (s.over) {
      c.overloadsLeft--;
      const lost = loseLife(g, p, 'overload');
      let text = lost === 'apron' ? `#${a + 1} OVERLOADS. THE LEAD APRON TAKES IT.` : `#${a + 1} OVERLOADS. IT COSTS A LIFE.`;
      // surviving an overload is what the fuse charms are for
      if (!p.ghost) {
        if (!c.survived.includes(p.id)) c.survived.push(p.id);
        if (p.charms.includes('overclock')) {
          p.overclock = ticks(OVERCLOCK.s);
          g.emit({ t: 'overclock', player: p.id });
          text += ' OVERCLOCKED.';
        }
      }
      say(c, text);
      g.emit({ t: 'circuit', who: 'team', action: 'activate', slot: a, over: true, text });
    } else {
      c.teamSafe++;
      g.state.bank += r.safeBank;
      addMarkers(g, r.safeMarkers, 'safe circuit');
      const text = `#${a + 1} IS SAFE: +$${r.safeBank}, +${r.safeMarkers} MARKER`;
      say(c, text);
      g.emit({ t: 'circuit', who: 'team', action: 'activate', slot: a, over: false, text });
    }
  }
  passTurn(g, c);
  return null;
}

/**
 * Which position the Collector takes: the lowest-numbered one he doesn't believe overloaded
 * (DESIGN.md §6; DECISIONS #52). He remembers what he saw by position, so you can predict him, and a
 * revealed overload rerouted into his next position is how you blow his fuse. -1: nothing he trusts.
 */
export function collectorPick(c: CircuitState): number {
  for (let i = 0; i < c.slots.length; i++) if (!c.slots[i].spent && c.mem[i] !== true) return i;
  return -1;
}

/** The Collector's turn. */
export function collectorAct(g: Game) {
  const c = g.state.circuit;
  if (!c || c.done || c.turn !== 'coll') return;
  const i = collectorPick(c);
  if (i < 0) {
    // nothing he trusts is left: he passes
    say(c, 'HE PASSES.');
    if (checkEnd(g, c)) return;
    c.turn = 'team';
    return;
  }
  const s = c.slots[i];
  s.spent = true;
  s.known = true;
  s.by = 'coll';
  c.mem[i] = s.over;
  let text: string;
  if (s.over) {
    c.overloadsLeft--;
    c.fuses--;
    text = `HE TAKES #${i + 1}: OVERLOAD. ${c.fuses} FUSE${c.fuses === 1 ? '' : 'S'} LEFT.`;
  } else {
    c.collSafe++;
    text = `HE TAKES #${i + 1}: SAFE.`;
  }
  say(c, text);
  g.emit({ t: 'circuit', who: 'coll', action: 'activate', slot: i, over: s.over, text });
  if (checkEnd(g, c)) return;
  c.turn = 'team';
}
