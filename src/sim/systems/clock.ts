// The night clock: 6:00 down to 0:00 (DESIGN.md §1), and the lights dropping at 0:00.
// Milestone 0: empty. Milestone 1 step 1 counts it down.
import type { System } from '../Game';

export const clock: System = {
  id: 'clock',
  handles: [],
};
