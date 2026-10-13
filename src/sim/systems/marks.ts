// Marks and the other timed statuses (DESIGN.md §3, §5): marks and Overclock windows count down in
// table time only. At the Collector's table the clock has stopped, and so do they.
import type { System } from '../Game';

export const marks: System = {
  id: 'marks',
  handles: [],
  tick(g) {
    const s = g.state;
    if (s.phase !== 'floor') return;
    for (const m of s.marks) m.left--;
    if (s.marks.some((m) => m.left <= 0)) s.marks = s.marks.filter((m) => m.left > 0);
    for (const p of s.players) if (p.overclock > 0) p.overclock--;
  },
};
