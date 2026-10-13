// Tables: sitting and standing (THREEJS-NOTES rule 3), and in Milestone 1 each table's module
// (odds, resolve, lossCost) behind bet / call / spin. Milestone 0 seats you at the one table with
// a panel (Hi-Lo).
import type { System } from '../Game';
import { FLOOR_1, USE_RADIUS } from '../../data/floors';

/** Tables you can sit at in this build (Milestone 0: the one with a panel). */
export const OPEN_TABLES = new Set(['hilo']);

export const tables: System = {
  id: 'tables',
  handles: ['sit', 'stand', 'bet', 'call', 'spin'],
  command(g, p, cmd) {
    if (cmd.t === 'sit') {
      const pl = FLOOR_1.tables.find((t) => t.table === cmd.table);
      const refuse = (why: string) => g.emit({ t: 'refused', player: p.id, cmd: 'sit', why });
      if (!pl || !OPEN_TABLES.has(cmd.table)) return refuse('no such table');
      if (p.seat) return refuse('already seated');
      if (p.ghost) return refuse('ghosts cannot bet');
      const dx = p.x - pl.stand.x, dz = p.z - pl.stand.z;
      if (dx * dx + dz * dz > USE_RADIUS * USE_RADIUS) return refuse('too far');
      if (g.state.players.some((o) => o.seat === cmd.table)) return refuse('seat taken');
      p.seat = cmd.table;
      p.mx = p.mz = 0;
      p.x = pl.stand.x;
      p.z = pl.stand.z;
      g.emit({ t: 'sat', player: p.id, table: cmd.table });
    } else if (cmd.t === 'stand') {
      if (!p.seat) return;
      const table = p.seat;
      p.seat = null;
      g.emit({ t: 'stood', player: p.id, table });
    }
  },
};
