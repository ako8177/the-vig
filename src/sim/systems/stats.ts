// Stats for the results screen and the pace bots (DESIGN.md §8). The counters live in
// State.stats and are kept where things happen (tables.ts land, rules.ts); this system keeps
// the fixed order's slot for anything that needs a per-tick view.
import type { System } from '../Game';

export const stats: System = {
  id: 'stats',
  handles: [],
};
