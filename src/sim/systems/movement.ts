// Movement: walking the floor at 3 m/s (THREEJS-NOTES rule 2) with the player's capsule
// (a circle on the floor plane: no jump, flat floor) pushed out of the room's colliders.
// No trigonometry: the client sends a world-space direction (commands.ts, `move`).
import type { Game, System } from '../Game';
import type { Collider } from '../../data/floors';
import { FLOOR_1, PLAYER_R } from '../../data/floors';
import { HOME_COLLIDERS } from '../../data/home';
import { TICKS_PER_S } from '../state';
import { STICKY } from '../../data/marks';
import { hasTeamMark } from '../rules';

/** Walking speed, m/s (THREEJS-NOTES rule 2). Sticky Floor (DESIGN.md §3) scales it by 0.7. */
export const WALK_SPEED = 3;
/** Holding sprint (DESIGN.md §1): 5.1 m/s, the 28 m floor crossed in under 6 s instead of 9 */
export const SPRINT = 1.7;
const STEP = WALK_SPEED / TICKS_PER_S;

const clampInt = (v: number, a: number, b: number) => Math.max(a, Math.min(b, Math.round(Number.isFinite(v) ? v : 0)));

/**
 * Push a circle (x, z, r) out of every collider, two passes so a corner between two boxes
 * settles. Returns the corrected position. Pure; exported for tests.
 */
export function collide(x: number, z: number, r: number, cols: readonly Collider[]): { x: number; z: number } {
  for (let pass = 0; pass < 2; pass++) {
    for (const c of cols) {
      if (c.kind === 'box') {
        const cx = Math.max(c.x0, Math.min(x, c.x1));
        const cz = Math.max(c.z0, Math.min(z, c.z1));
        const dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-12) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          z = cz + (dz / d) * r;
        } else {
          // the center is inside the box: leave by the shortest way out
          const outs = [x - c.x0, c.x1 - x, z - c.z0, c.z1 - z];
          const m = Math.min(...outs);
          if (m === outs[0]) x = c.x0 - r;
          else if (m === outs[1]) x = c.x1 + r;
          else if (m === outs[2]) z = c.z0 - r;
          else z = c.z1 + r;
        }
      } else {
        const dx = x - c.x, dz = z - c.z;
        const rr = r + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2);
        if (d > 1e-9) {
          x = c.x + (dx / d) * rr;
          z = c.z + (dz / d) * rr;
        } else z = c.z + rr;
      }
    }
  }
  return { x, z };
}

export const movement: System = {
  id: 'movement',
  handles: ['move'],
  command(_g, p, cmd) {
    if (cmd.t !== 'move') return;
    p.mx = clampInt(cmd.mx, -1000, 1000);
    p.mz = clampInt(cmd.mz, -1000, 1000);
    p.yaw = clampInt(cmd.yaw, -7000, 7000);
    p.run = cmd.run === true;
  },
  tick(g: Game) {
    // you walk the floor while the night runs, and the house between nights; at 0:00 you're held
    // at the Collector's table
    const ph = g.state.phase;
    if (ph !== 'floor' && ph !== 'home') return;
    const cols = ph === 'home' ? HOME_COLLIDERS : FLOOR_1.colliders;
    const step = STEP * (hasTeamMark(g, 'sticky') ? STICKY : 1);
    for (const p of g.state.players) {
      if (p.seat || (p.mx === 0 && p.mz === 0)) continue;
      const k = p.run ? SPRINT : 1;
      let vx = p.mx / 1000, vz = p.mz / 1000;
      const len = Math.sqrt(vx * vx + vz * vz);
      if (len > 1) {
        vx /= len;
        vz /= len;
      }
      const to = collide(p.x + vx * step * k, p.z + vz * step * k, PLAYER_R, cols);
      p.x = to.x;
      p.z = to.z;
    }
  },
};
