// The cage (DESIGN.md §5): markers buy charms (worn by the buyer, one a slot) and permanent upgrades.
// Open all night, from its window by the entrance; the choice is when to stop gambling and shop.
// The bar (DESIGN.md §10) is the floor's other counter: cash buys a drink, and the drink a buzz.
import type { Game, System } from '../Game';
import type { PlayerState } from '../state';
import { BAR_RADIUS, CAGE_RADIUS, FLOOR_1 } from '../../data/floors';
import { BUZZ, DRINK_BY_ID, type DrinkId } from '../../data/drinks';
import { ticks } from '../rules';
import { CHARM_BY_ID, UPGRADE_BY_ID, type CharmId, type UpgradeId } from '../../data/charms';
import { ECONOMY } from '../../data/economy';
import { atComputer, pendingCharms, pendingItems, post } from './home';

/** A player's charm slots (3, 4 with the upgrade). */
export const slotsOf = (g: Game) => ECONOMY.charmSlots.v + (g.state.upgrades.includes('slot4') ? 1 : 0);

/** Close enough to the cage's window to use it. */
export function atCage(p: PlayerState): boolean {
  const c = FLOOR_1.cageStand;
  const dx = p.x - c.x, dz = p.z - c.z;
  return dx * dx + dz * dz <= CAGE_RADIUS * CAGE_RADIUS;
}

/** Close enough to the bar to order. */
export function atBar(p: PlayerState): boolean {
  const c = FLOOR_1.barStand;
  const dx = p.x - c.x, dz = p.z - c.z;
  return dx * dx + dz * dz <= BAR_RADIUS * BAR_RADIUS;
}

/** Why a player can't order this drink now, or null if they can. */
export function cantOrder(g: Game, p: PlayerState, drink: string): string | null {
  const d = DRINK_BY_ID.get(drink as DrinkId);
  if (!d) return 'no such drink';
  if (g.state.phase !== 'floor') return 'the bar is shut';
  if (p.ghost) return "the bartender can't see you";
  if (!atBar(p)) return 'walk to the bar';
  if (g.state.bank < d.price) return 'the bank is short';
  return null;
}

/** Why a player can't buy this now, or null if they can. */
export function cantBuy(g: Game, p: PlayerState, item: string): string | null {
  const s = g.state;
  // with the house, charms and upgrades come from the computer at home, by post (DECISIONS #79)
  if (s.home) {
    if (s.phase !== 'home') return 'order it from the computer at home';
    if (!atComputer(p)) return 'walk to the computer';
  } else {
    if (s.phase !== 'floor') return 'the cage is shut';
    if (!atCage(p)) return 'walk to the cage';
  }
  if (p.ghost) return 'ghosts cannot buy';
  const charm = CHARM_BY_ID.get(item as CharmId);
  const up = UPGRADE_BY_ID.get(item as UpgradeId);
  if (charm) {
    const coming = pendingCharms(g, p.id);
    if (p.charms.includes(charm.id)) return 'already worn';
    if (coming.includes(charm.id)) return 'already in the post';
    if (p.charms.length + coming.length >= slotsOf(g)) return 'no free slot';
    if (s.markers < charm.price) return 'not enough markers';
    return null;
  }
  if (up) {
    if (s.upgrades.includes(up.id)) return 'already owned';
    if (pendingItems(g).includes(up.id)) return 'already in the post';
    if (s.markers < up.price) return 'not enough markers';
    return null;
  }
  return 'no such item';
}

export const cage: System = {
  id: 'cage',
  handles: ['buy', 'order'],
  command(g, p, cmd) {
    if (cmd.t === 'order') {
      const why = cantOrder(g, p, cmd.drink);
      if (why) return g.emit({ t: 'refused', player: p.id, cmd: 'order', why });
      const d = DRINK_BY_ID.get(cmd.drink as DrinkId)!;
      g.state.bank -= d.price;
      p.drunk = Math.min(ticks(BUZZ.maxS), p.drunk + ticks(d.buzzS));
      // its edge runs for its own buzz; the same drink again starts it over, it doesn't stack
      const b = p.buffs.find((x) => x.drink === d.id);
      if (b) b.left = Math.max(b.left, ticks(d.buzzS));
      else p.buffs.push({ drink: d.id, left: ticks(d.buzzS) });
      g.emit({ t: 'drank', player: p.id, drink: d.id });
      return;
    }
    if (cmd.t !== 'buy') return;
    const why = cantBuy(g, p, cmd.item);
    if (why) return g.emit({ t: 'refused', player: p.id, cmd: 'buy', why });
    const s = g.state;
    const charm = CHARM_BY_ID.get(cmd.item as CharmId);
    if (s.home) {
      // paid now, carried in from the mailbox later
      const price = charm ? charm.price : UPGRADE_BY_ID.get(cmd.item as UpgradeId)!.price;
      s.markers -= price;
      post(g, p, cmd.item);
      g.emit({ t: 'ordered', player: p.id, item: cmd.item, kind: charm ? 'charm' : 'upgrade' });
      return;
    }
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
