// Rules shared by the systems: payout factors, lives, marks, markers. Pure functions of the Game.
import type { Game } from './Game';
import type { PlayerState, Mark, State } from './state';
import { TICKS_PER_S } from './state';
import { ECONOMY } from '../data/economy';
import { COLD_DECK, HILO_MARK, MARK_BY_ID, TAX, type MarkId } from '../data/marks';
import { OVERCLOCK } from '../data/charms';
import { WHEEL } from '../data/wheels';

export const ticks = (s: number) => Math.round(s * TICKS_PER_S);

export function markOf(g: Game, id: MarkId, player: number): Mark | undefined {
  return g.state.marks.find((m) => m.id === id && m.player === player);
}

export function hasTeamMark(g: Game, id: MarkId) {
  return g.state.marks.some((m) => m.id === id && m.player === -1);
}

/** Hi-Lo mark stacks on a player. */
export function stacks(g: Game, player: number) {
  return markOf(g, 'hilo', player)?.stacks ?? 0;
}

/**
 * What a payout is multiplied by for this player at this table: Hi-Lo marks at the tables they
 * mark (-5% a stack), Cold Deck (-10%). DESIGN.md §3; DECISIONS #39. (Overclock doubles the stake.)
 */
export function payoutFactor(g: Game, p: PlayerState, table: string): number {
  return factorOf(g.state, p, table);
}

/** payoutFactor over a bare State (panels and the HUD print it). */
export function factorOf(s: State, p: PlayerState, table: string): number {
  let f = 1;
  if (HILO_MARK.tables.includes(table)) f *= 1 - HILO_MARK.perStack * (s.marks.find((m) => m.id === 'hilo' && m.player === p.id)?.stacks ?? 0);
  if (s.marks.some((m) => m.id === 'colddeck' && m.player === -1)) f *= COLD_DECK;
  return f;
}

/** A table's stake for this player: doubled under Overclock, so the win doubles and the odds don't (DECISIONS #54). */
export const stakeFor = (p: PlayerState, bet: number) => bet * (p.overclock > 0 ? OVERCLOCK.factor : 1);

/** Hi-Lo's mark length this night: 30 s, 20 s with the upgrade, 60 s under the Bane. */
export function hiloMarkS(g: Game) {
  if (g.state.mods.longMarks) return WHEEL.longMarksS;
  if (g.state.upgrades.includes('hilo20')) return 20;
  return MARK_BY_ID.get('hilo')!.durS;
}

/** Put a mark on a player (or the team: player -1). A Boon's clean slate blocks it. */
export function addMark(g: Game, id: MarkId, player: number): boolean {
  const s = g.state;
  if (s.mods.immune) return false;
  const def = MARK_BY_ID.get(id)!;
  s.stats.marks++;
  if (id === 'tax') {
    const amount = Math.floor(s.bank * TAX);
    s.bank -= amount;
    g.emit({ t: 'tax', amount });
    g.emit({ t: 'mark', player, id, stacks: 1 });
    return true;
  }
  const left = ticks(id === 'hilo' ? hiloMarkS(g) : def.durS);
  let m = markOf(g, id, player);
  if (m) {
    m.left = Math.max(m.left, left);
    if (id === 'hilo') m.stacks = Math.min(HILO_MARK.maxStacks, m.stacks + 1);
  } else {
    m = { id, player, left, stacks: 1 };
    s.marks.push(m);
  }
  g.emit({ t: 'mark', player, id, stacks: m.stacks });
  return true;
}

export function addMarkers(g: Game, n: number, why: string) {
  if (n <= 0) return;
  g.state.markers += n;
  g.state.stats.markersEarned += n;
  g.emit({ t: 'markers', delta: n, why });
}

export function gainLife(g: Game, p: PlayerState, why: string) {
  if (p.ghost) return;
  const before = p.lives;
  p.lives = Math.min(ECONOMY.maxLives.v, p.lives + 1);
  if (p.lives !== before) g.emit({ t: 'life', player: p.id, delta: 1, lives: p.lives, why });
}

/**
 * Take a life. Lead Apron takes the first one each night instead (DECISIONS #53). At 0 the player
 * is a ghost; when no one living is left, the run is over. Returns what happened.
 */
export function loseLife(g: Game, p: PlayerState, why: string): 'lost' | 'apron' | 'none' {
  if (p.ghost || p.lives <= 0) return 'none';
  if (p.charms.includes('leadapron') && !p.apronUsed) {
    p.apronUsed = true;
    g.emit({ t: 'life', player: p.id, delta: 0, lives: p.lives, why: `${why}: the lead apron took it` });
    return 'apron';
  }
  p.lives--;
  g.state.stats.livesLost++;
  g.emit({ t: 'life', player: p.id, delta: -1, lives: p.lives, why });
  if (p.lives === 0) {
    p.ghost = true;
    if (p.seat) {
      const table = p.seat;
      p.seat = null;
      g.emit({ t: 'stood', player: p.id, table });
    }
    g.emit({ t: 'ghost', player: p.id });
    if (g.state.players.every((o) => o.ghost)) endRun(g, false, g.state.players.length === 1 ? 'OUT OF LIVES. A GHOST ALONE CANNOT BE BOUGHT BACK.' : 'EVERY SOUL BELONGS TO THE HOUSE.');
  }
  return 'lost';
}

export function endRun(g: Game, won: boolean, why: string) {
  const s = g.state;
  if (s.phase === 'over') return;
  s.phase = 'over';
  s.phaseAt = g.tick;
  s.result = { won, why };
  g.emit({ t: 'over', won, why });
}

export const living = (g: Game) => g.state.players.filter((p) => !p.ghost);
