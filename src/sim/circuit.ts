// The Circuit (DESIGN.md §6; DECISIONS #80): the owner's lever duel. Ten levers under the
// Collector's table, some wired live to the battery, the wires too tangled to follow. You and he
// take turns pulling one, you first. A dead lever pays the team; a live one shocks whoever pulled
// it. Your second shock ends it: a life, and the quota is paid. His second shock kills him: you
// keep the quota. He picks at random; so do you, unless the Insulated Kit lets you trace a wire.
// Pure functions of the Game.
import type { Game } from './Game';
import type { CircuitState, PlayerState } from './state';
import { CIRCUIT_RULES } from '../data/circuit';
import { OVERCLOCK } from '../data/charms';
import { WHEEL } from '../data/wheels';
import { addMarkers, gainLife, living, loseLife, ticks } from './rules';

export const rulesFor = (floor: number) => CIRCUIT_RULES.find((r) => r.floor === floor) ?? CIRCUIT_RULES[0];

export function newCircuit(g: Game): CircuitState {
  const r = rulesFor(g.state.floor);
  // the Bane: a fourth live lever (DESIGN.md §7)
  const live = g.state.mods.overloads3 ? WHEEL.bigOverloads : r.live;
  const states = Array.from({ length: r.levers }, (_, i) => i < live);
  g.rng.shuffle(states);
  return {
    levers: states.map((l) => ({ live: l, pulled: false, known: false, by: null })),
    live,
    shocks: g.state.players.map(() => 0),
    hisShocks: 0,
    traces: g.state.players.map((p) => (p.charms.includes('insulated') ? r.kitTraces : 0)),
    turn: 'team',
    wait: 0,
    survived: [],
    log: ['YOUR PULL.'],
    done: null,
    endedAt: 0,
  };
}

const say = (c: CircuitState, line: string) => {
  c.log.unshift(line);
  c.log.length = Math.min(c.log.length, 4);
};

/** End it: the team won (he's dead) or lost. Lucky Fuse pays a survivor of a shock on a win. */
function finish(g: Game, c: CircuitState, won: boolean, why: string) {
  if (won) for (const id of c.survived) {
    const p = g.state.players[id];
    if (p.charms.includes('luckyfuse') && !p.ghost) gainLife(g, p, 'lucky fuse');
  }
  c.done = { won, why };
  c.endedAt = g.tick;
  g.emit({ t: 'circuitEnd', won, why });
}

/** The levers still up. */
const up = (c: CircuitState) => c.levers.map((l, i) => ({ l, i })).filter(({ l }) => !l.pulled);

/**
 * A team action: `activate` pulls a lever (uses the turn), `inspect` traces one wire with the
 * Insulated Kit (free, doesn't use the turn). Returns a refusal reason, or null when it was taken.
 */
export function teamAct(g: Game, p: PlayerState, act: 'inspect' | 'reroute' | 'activate', a: number): string | null {
  const c = g.state.circuit;
  if (!c || c.done) return 'no circuit';
  if (act === 'reroute') return 'the wires are too tangled to move';
  if (c.turn !== 'team') return "it's his pull";
  if (!Number.isInteger(a) || a < 0 || a >= c.levers.length) return 'no such lever';
  if (p.ghost) return 'a ghost cannot pull';
  const r = rulesFor(g.state.floor);
  const lv = c.levers[a];
  if (lv.pulled) return 'already pulled';
  if (act === 'inspect') {
    if (c.traces[p.id] <= 0) return 'no traces left (the Insulated Kit gives two)';
    if (lv.known) return 'already traced';
    c.traces[p.id]--;
    lv.known = true;
    const text = `YOU TRACE #${a + 1}: ${lv.live ? 'LIVE' : 'DEAD'}.`;
    say(c, text);
    g.emit({ t: 'circuit', who: 'team', action: 'inspect', slot: a, over: lv.live, text });
    return null;
  }
  // a lever you traced live is one you'd only pull with nothing else left
  if (lv.known && lv.live && up(c).some(({ l }) => !(l.known && l.live))) return 'you traced it live: pull another';
  lv.pulled = true;
  lv.known = true;
  lv.by = 'team';
  if (lv.live) {
    c.shocks[p.id]++;
    const n = c.shocks[p.id];
    if (n >= r.playerShocks) {
      const lost = loseLife(g, p, 'circuit');
      const text = `#${a + 1} IS LIVE. YOUR SECOND SHOCK${lost === 'apron' ? ': THE LEAD APRON SAVES THE LIFE' : ''}.`;
      say(c, text);
      g.emit({ t: 'circuit', who: 'team', action: 'activate', slot: a, over: true, text });
      finish(g, c, false, lost === 'apron' ? 'TWO SHOCKS. THE APRON KEPT YOUR LIFE; THE QUOTA IS HIS.' : 'TWO SHOCKS. A LIFE, AND THE QUOTA IS HIS.');
      return null;
    }
    let text = `#${a + 1} IS LIVE. A SHOCK: ${n} OF ${r.playerShocks}.`;
    // surviving a shock is what the fuse charms are for
    if (!c.survived.includes(p.id)) c.survived.push(p.id);
    if (p.charms.includes('overclock')) {
      p.overclock = ticks(OVERCLOCK.s);
      g.emit({ t: 'overclock', player: p.id });
      text += ' OVERCLOCKED.';
    }
    say(c, text);
    g.emit({ t: 'circuit', who: 'team', action: 'activate', slot: a, over: true, text });
  } else {
    g.state.bank += r.safeBank;
    const markers = r.safeMarkers * (p.charms.includes('magnet') ? 2 : 1);
    addMarkers(g, markers, 'dead lever');
    const text = `#${a + 1} IS DEAD: +$${r.safeBank}, +${markers} MARKER${markers === 1 ? '' : 'S'}.`;
    say(c, text);
    g.emit({ t: 'circuit', who: 'team', action: 'activate', slot: a, over: false, text });
  }
  if (living(g).length === 0) return finish(g, c, false, 'NO ONE IS LEFT STANDING.'), null;
  c.turn = 'coll';
  c.wait = g.tick + ticks(lv.live ? r.afterShockS : r.collectorTurnS);
  return null;
}

/** The lever he takes: any one still up, at random (the owner's rule: he doesn't count up). */
export function collectorPick(g: Game, c: CircuitState): number {
  const open = up(c);
  return open.length ? g.rng.pick(open).i : -1;
}

/** The Collector's pull. */
export function collectorAct(g: Game) {
  const c = g.state.circuit;
  if (!c || c.done || c.turn !== 'coll') return;
  const r = rulesFor(g.state.floor);
  const i = collectorPick(g, c);
  if (i < 0) return finish(g, c, false, 'NO LEVER LEFT. TIES GO TO THE HOUSE.');
  const lv = c.levers[i];
  lv.pulled = true;
  lv.known = true;
  lv.by = 'coll';
  let text: string;
  if (lv.live) {
    c.hisShocks++;
    const limit = r.collShocks;
    text = `HE PULLS #${i + 1}: LIVE. ${c.hisShocks >= limit ? 'HIS LAST SHOCK.' : `A SHOCK: ${c.hisShocks} OF ${limit}.`}`;
  } else text = `HE PULLS #${i + 1}: DEAD.`;
  say(c, text);
  g.emit({ t: 'circuit', who: 'coll', action: 'activate', slot: i, over: lv.live, text });
  if (c.hisShocks >= r.collShocks) return finish(g, c, true, 'TWO SHOCKS. THE COLLECTOR IS DEAD: KEEP THE QUOTA.');
  if (!up(c).length) return finish(g, c, false, 'NO LEVER LEFT. TIES GO TO THE HOUSE.');
  c.turn = 'team';
}
