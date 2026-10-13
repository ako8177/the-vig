// Tables: sitting and standing (THREEJS-NOTES rule 3), and each table's module (odds, resolve,
// lossCost: src/sim/tables/) behind bet / call / spin. A round's stake leaves the bank at the call;
// its result is held back for the table's `resolveS` (the reels spin, the die rolls) and then lands.
import type { Game, System } from '../Game';
import type { PlayerState } from '../state';
import { FLOOR_1, USE_RADIUS } from '../../data/floors';
import { MODULE_BY_ID } from '../tables';
import { ticks } from '../rules';

/** Tables you can sit at (all six from Milestone 1). */
export const OPEN_TABLES = new Set(['bandit', 'twentyone', 'hilo', 'wheel', 'redline', 'deadman']);

/** Land a table's held-back result: pay it out and charge its price. */
export function land(g: Game, id: string) {
  const s = g.state;
  const t = s.tables[id];
  const o = t.pending;
  if (!o) return;
  t.pending = null;
  t.until = 0;
  const p = s.players[o.player];
  s.bank += o.ret;
  MODULE_BY_ID.get(id)!.resolve(g, p, o);
  t.last = o;
  t.rounds++;
  s.stats.rounds++;
  if (o.win) {
    s.stats.wins++;
    s.stats.won$ += o.ret - o.bet;
    s.stats.biggest = Math.max(s.stats.biggest, o.ret - o.bet);
  } else if (o.ret < o.bet) s.stats.lost$ += o.bet - o.ret;
  g.emit({ t: 'round', player: o.player, outcome: o });
}

/** Stand a player up (no event if they weren't seated). */
export function standUp(g: Game, p: PlayerState) {
  if (!p.seat) return;
  const table = p.seat;
  // walking away from a Twenty-One hand stands on it
  const t21 = g.state.tables.twentyone;
  if (table === 'twentyone' && t21.hand?.stage === 'play' && !t21.pending) {
    const mod = MODULE_BY_ID.get('twentyone')!;
    const o = mod.start(g, p, { t: 'call', table, call: 'stand' });
    if (o && typeof o !== 'string') {
      t21.pending = o;
      t21.until = g.tick + ticks(mod.def.resolveS);
    }
  }
  p.seat = null;
  g.emit({ t: 'stood', player: p.id, table });
}

export const tables: System = {
  id: 'tables',
  handles: ['sit', 'stand', 'bet', 'call', 'spin'],
  command(g, p, cmd) {
    const s = g.state;
    const refuse = (why: string) => g.emit({ t: 'refused', player: p.id, cmd: cmd.t, why });
    if (cmd.t === 'sit') {
      const pl = FLOOR_1.tables.find((t) => t.table === cmd.table);
      if (!pl || !OPEN_TABLES.has(cmd.table)) return refuse('no such table');
      if (s.phase !== 'floor') return refuse('the tables are closed');
      if (p.seat) return refuse('already seated');
      if (p.ghost) return refuse('ghosts cannot bet');
      const dx = p.x - pl.stand.x, dz = p.z - pl.stand.z;
      if (dx * dx + dz * dz > USE_RADIUS * USE_RADIUS) return refuse('too far');
      if (s.players.some((o) => o.seat === cmd.table)) return refuse('seat taken');
      p.seat = cmd.table;
      p.mx = p.mz = 0;
      p.x = pl.stand.x;
      p.z = pl.stand.z;
      g.emit({ t: 'sat', player: p.id, table: cmd.table });
      return;
    }
    if (cmd.t === 'stand') return standUp(g, p);

    // bet / call / spin: at the table you're sitting at, while the night runs
    if (cmd.t !== 'bet' && cmd.t !== 'call' && cmd.t !== 'spin') return;
    const id = cmd.table;
    const mod = MODULE_BY_ID.get(id);
    if (!mod || !mod.cmds.includes(cmd.t)) return refuse('not at this table');
    if (s.phase !== 'floor') return refuse('the tables are closed');
    if (p.seat !== id) return refuse('sit down first');
    const t = s.tables[id];
    if (t.pending) return refuse('wait for the result');
    const r = mod.start(g, p, cmd);
    if (typeof r === 'string') return refuse(r);
    if (r) {
      const n = ticks(mod.def.resolveS);
      t.pending = r;
      t.until = g.tick + n;
      g.emit({ t: 'play', player: p.id, table: id, ticks: n });
    }
  },
  tick(g) {
    const s = g.state;
    if (s.phase !== 'floor') return;
    for (const id in s.tables) {
      const t = s.tables[id];
      if (t.pending && g.tick >= t.until) land(g, id);
    }
  },
};
