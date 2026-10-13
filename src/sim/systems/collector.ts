// The Collector: the 0:00 phase, the Circuit and the wheels (DESIGN.md §6, §7).
// Milestone 0: empty. Milestone 1 step 6.
import type { System } from '../Game';

export const collector: System = {
  id: 'collector',
  handles: ['inspect', 'reroute', 'activate', 'pay', 'gamble'],
};
