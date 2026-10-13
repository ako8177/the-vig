// The night clock: 6:00 down to 0:00 (DESIGN.md §1). At 0:00 every round on the felt lands, everyone
// is pulled from their seat to the Collector's table and the lights drop (the 'midnight' beat); the
// collector system takes it from there.
import type { Game, System } from '../Game';
import { land, standUp } from './tables';
import { MODULE_BY_ID } from '../tables';

/** How long the 0:00 beat lasts before the Collector speaks (s). */
export const MIDNIGHT_S = 3;

export function midnight(g: Game) {
  const s = g.state;
  // an unfinished Twenty-One hand stands where it is
  const hand = s.tables.twentyone.hand;
  if (hand && hand.stage === 'play') {
    const owner = s.players.find((p) => p.seat === 'twentyone') ?? s.players[0];
    const o = MODULE_BY_ID.get('twentyone')!.start(g, owner, { t: 'call', table: 'twentyone', call: 'stand' });
    if (o && typeof o !== 'string') s.tables.twentyone.pending = o;
  }
  for (const id in s.tables) land(g, id);
  for (const p of s.players) {
    standUp(g, p);
    p.mx = p.mz = 0;
  }
  s.clock = 0;
  s.phase = 'midnight';
  s.phaseAt = g.tick;
  g.emit({ t: 'midnight' });
}

export const clock: System = {
  id: 'clock',
  handles: [],
  tick(g) {
    const s = g.state;
    if (s.phase !== 'floor') return;
    if (s.clock > 0) s.clock--;
    if (s.clock === 0) midnight(g);
  },
};
