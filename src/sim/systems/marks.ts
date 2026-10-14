// Marks and the other timed statuses (DESIGN.md §3, §5, §10): marks, Overclock windows and a buzz count down in
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
    for (const p of s.players) {
      if (p.overclock > 0) p.overclock--;
      // a buzz wears off in floor time too (DESIGN.md §10)
      if (p.drunk > 0) p.drunk--;
      if (p.buffs.length) {
        for (const b of p.buffs) b.left--;
        p.buffs = p.buffs.filter((b) => b.left > 0);
      }
    }
  },
};
