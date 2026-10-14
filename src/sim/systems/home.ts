// The house (DESIGN.md §5; DECISIONS #79): between nights, and before the first, the run is at
// home. The computer takes orders (the cage system checks and charges them: `buy`); the post brings
// them to the mailbox POST_S later; `pickup` at the mailbox carries them in (a charm to whoever
// ordered it, an upgrade to the run); `drive` at the car starts the night at the casino's door.
// Time at home doesn't count against the night: the clock only runs on the floor.
import type { Game, System } from '../Game';
import type { PlayerState } from '../state';
import { spawnOf } from '../state';
import { CAR_STAND, COMPUTER_STAND, MAILBOX_STAND, POST_S, USE_HOME_R } from '../../data/home';
import { CHARM_BY_ID, type CharmId, type UpgradeId } from '../../data/charms';
import { ticks } from '../rules';

const near = (p: PlayerState, at: { x: number; z: number }) => (p.x - at.x) ** 2 + (p.z - at.z) ** 2 <= USE_HOME_R * USE_HOME_R;
export const atComputer = (p: PlayerState) => near(p, COMPUTER_STAND);
export const atMailbox = (p: PlayerState) => near(p, MAILBOX_STAND);
export const atCar = (p: PlayerState) => near(p, CAR_STAND);

/** Post an order: it reaches the mailbox POST_S after the latest order. */
export function post(g: Game, p: PlayerState, item: string) {
  const s = g.state;
  s.post.orders.push({ item, player: p.id });
  s.post.at = g.tick + ticks(POST_S.v);
}

/** What a player has coming: charms in the post or the mailbox (they hold a slot already). */
export function pendingCharms(g: Game, player: number): string[] {
  const s = g.state;
  return [...s.post.orders, ...s.post.box].filter((o) => o.player === player && CHARM_BY_ID.has(o.item as CharmId)).map((o) => o.item);
}
export const pendingItems = (g: Game) => [...g.state.post.orders, ...g.state.post.box].map((o) => o.item);

export const home: System = {
  id: 'home',
  handles: ['pickup', 'drive'],
  command(g, p, cmd) {
    const s = g.state;
    const refuse = (why: string) => g.emit({ t: 'refused', player: p.id, cmd: cmd.t, why });
    if (s.phase !== 'home') return refuse("you're not home");
    if (cmd.t === 'pickup') {
      if (!atMailbox(p)) return refuse('walk to the mailbox');
      if (!s.post.box.length) return refuse(s.post.orders.length ? 'the post is on its way' : 'the mailbox is empty');
      const items: string[] = [];
      for (const o of s.post.box) {
        const buyer = s.players[o.player] ?? p;
        if (CHARM_BY_ID.has(o.item as CharmId)) {
          if (!buyer.charms.includes(o.item as CharmId)) buyer.charms.push(o.item as CharmId);
        } else if (!s.upgrades.includes(o.item as UpgradeId)) s.upgrades.push(o.item as UpgradeId);
        items.push(o.item);
      }
      s.post.box = [];
      g.emit({ t: 'collected', player: p.id, items });
      return;
    }
    if (cmd.t === 'drive') {
      if (!atCar(p)) return refuse('walk to the car');
      // the car takes everyone: the night starts at the casino's door
      s.players.forEach((q, i) => {
        Object.assign(q, spawnOf(i, s.players.length));
        q.mx = q.mz = 0;
        q.seat = null;
      });
      s.phase = 'floor';
      s.phaseAt = g.tick;
      g.emit({ t: 'drive', night: s.night });
    }
  },
  tick(g) {
    const s = g.state;
    if (s.phase !== 'home' || !s.post.orders.length || g.tick < s.post.at) return;
    s.post.box.push(...s.post.orders);
    g.emit({ t: 'post', count: s.post.orders.length });
    s.post.orders = [];
  },
};
