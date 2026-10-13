// The cage (DESIGN.md §5): markers buy charms (worn by the buyer, one a slot) and permanent upgrades.
// Open all night, from its window on the east wall; the choice is when to stop gambling and shop.
import type { Game, System } from '../Game';
import type { PlayerState } from '../state';
import { CAGE_RADIUS, FLOOR_1 } from '../../data/floors';
import { CHARM_BY_ID, UPGRADE_BY_ID, type CharmId, type UpgradeId } from '../../data/charms';
import { ECONOMY } from '../../data/economy';

/** A player's charm slots (3, 4 with the upgrade). */
export const slotsOf = (g: Game) => ECONOMY.charmSlots.v + (g.state.upgrades.includes('slot4') ? 1 : 0);

/** Close enough to the cage's window to use it. */
export function atCage(p: PlayerState): boolean {
  const c = FLOOR_1.cageStand;
  const dx = p.x - c.x, dz = p.z - c.z;
  return dx * dx + dz * dz <= CAGE_RADIUS * CAGE_RADIUS;
}

/** Why a player can't buy this now, or null if they can. */
export function cantBuy(g: Game, p: PlayerState, item: string): string | null {
  const s = g.state;
  if (s.phase !== 'floor') return 'the cage is shut';
  if (p.ghost) return 'ghosts cannot buy';
  if (!atCage(p)) return 'walk to the cage';
  const charm = CHARM_BY_ID.get(item as CharmId);
  const up = UPGRADE_BY_ID.get(item as UpgradeId);
  if (charm) {
    if (p.charms.includes(charm.id)) return 'already worn';
    if (p.charms.length >= slotsOf(g)) return 'no free slot';
    if (s.markers < charm.price) return 'not enough markers';
    return null;
  }
  if (up) {
    if (s.upgrades.includes(up.id)) return 'already owned';
    if (s.markers < up.price) return 'not enough markers';
    return null;
  }
  return 'no such item';
}

export const cage: System = {
  id: 'cage',
  handles: ['buy'],
  command(g, p, cmd) {
    if (cmd.t !== 'buy') return;
    const why = cantBuy(g, p, cmd.item);
    if (why) return g.emit({ t: 'refused', player: p.id, cmd: 'buy', why });
    const s = g.state;
    const charm = CHARM_BY_ID.get(cmd.item as CharmId);
    if (charm) {
      s.markers -= charm.price;
      p.charms.push(charm.id);
      g.emit({ t: 'bought', player: p.id, item: charm.id, kind: 'charm' });
      return;
    }
    const up = UPGRADE_BY_ID.get(cmd.item as UpgradeId)!;
    s.markers -= up.price;
    s.upgrades.push(up.id);
    g.emit({ t: 'bought', player: p.id, item: up.id, kind: 'upgrade' });
  },
};
