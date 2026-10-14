// The crowd's own games (DECISIONS #78, the owner: "lets get them actually playing"). Presentation
// only, never in the sim: each decorative table with players round it runs a loop of its game on
// the felt. A card table deals each seat and the dealer, hits, turns the hole card, pays or takes
// the bets and sweeps up; the back room's poker table antes, deals hole cards, a flop, a turn and a
// river, shows down and pushes the pot; the craps rail's shooter throws two dice the length of the
// table; the roulette layout fills with chips while a ball rides the wheel and drops. Cards, chips,
// dice and the ball are four instanced draws for the whole floor; a table in a room you can't see
// isn't drawn. `update` reports cards and chips landing near you, for their sounds.
import { BoxGeometry, Color, CylinderGeometry, Euler, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, SphereGeometry, Vector3, type Scene } from 'three';
import type { Floor, Prop } from '../data/floors';
import { C, hexOf } from '../data/palette';

type V3 = [number, number, number];

/** One thing on the felt for one round: where it comes from and goes, and when. */
interface Piece {
  kind: 'card' | 'chip' | 'die';
  from: V3;
  to: V3;
  /** when it leaves `from` (s into the round), how long it travels */
  t0: number;
  dur: number;
  /** cards: when it turns face up (Infinity: stays down) */
  flip: number;
  /** when it leaves again for `away`, and where it goes */
  out: number;
  away: V3;
  color: number;
  /** a die's resting spin; a chip stack's height in chips */
  spin: number;
  /** the landing has been heard */
  heard: boolean;
}

interface Game {
  prop: Prop;
  room: string;
  kind: 'cardtable' | 'poker' | 'craps' | 'roulette';
  /** the felt's top (m) */
  top: number;
  seats: V3[];
  dealer: V3;
  /** round length (s), the round number, and its pieces */
  len: number;
  round: number;
  pieces: Piece[];
  /** roulette: the wheel's center, and the ball's landing time and pocket angle */
  wheel?: V3;
  ballLand?: number;
  ballAt?: number;
}

/** one chip's thickness (m): drawn a little fat, so a stack reads at 640x360 */
const CHIP_H = 0.016;
const CHIP_COLS = [C.pink, C.teal, C.gold, C.marker, C.white, C.blood];
const rnd = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0;
    return (s >>> 8) / 16777216;
  };
};
const lerp = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

export class TablePlay {
  private games: Game[] = [];
  private cards: InstancedMesh;
  private chips: InstancedMesh;
  private dice: InstancedMesh;
  private ball: InstancedMesh;
  private m4 = new Matrix4();
  private q = new Quaternion();
  private e = new Euler();
  private v = new Vector3();
  private s = new Vector3();
  private col = new Color();
  private acc = 1;

  constructor(private scene: Scene, floor: Floor) {
    for (const prop of floor.props) {
      if (prop.kind !== 'cardtable' && prop.kind !== 'poker' && prop.kind !== 'craps' && prop.kind !== 'roulette') continue;
      const near = (role: string) => floor.npcs.filter((n) => n.role === role && Math.hypot(n.x - prop.x, n.z - prop.z) < 2.6);
      const players = near('table');
      const dealers = near('dealer').filter((d) => !d.table);
      if (!players.length) continue;
      const top = prop.kind === 'craps' ? 0.89 : 0.915;
      const w = prop.w ?? 2, d = prop.d ?? 1.2;
      // a spot on the felt between the table's middle and a person, `k` of the way to the edge
      const spot = (x: number, z: number, k: number): V3 => {
        const dx = x - prop.x, dz = z - prop.z;
        const len = Math.hypot(dx, dz) || 1;
        const ux = dx / len, uz = dz / len;
        const edge = 1 / Math.hypot(ux / (w / 2), uz / (d / 2));
        return [prop.x + ux * edge * k, top, prop.z + uz * edge * k];
      };
      const dealer = dealers[0] ? spot(dealers[0].x, dealers[0].z, 0.7) : ([prop.x, top, prop.z - d * 0.35] as V3);
      const g: Game = {
        prop, room: prop.room, kind: prop.kind, top, dealer,
        seats: players.map((p) => spot(p.x, p.z, 0.62)),
        len: { cardtable: 10, poker: 14, craps: 8, roulette: 12 }[prop.kind],
        round: -1, pieces: [],
      };
      if (prop.kind === 'roulette') g.wheel = [prop.x + w / 2 - 0.55, 1.07, prop.z];
      this.games.push(g);
    }
    const lam = () => new MeshLambertMaterial({ color: 0xffffff });
    this.cards = new InstancedMesh(new BoxGeometry(0.07, 0.004, 0.1), lam(), 160);
    this.chips = new InstancedMesh(new CylinderGeometry(0.04, 0.04, CHIP_H, 8), lam(), 240);
    this.dice = new InstancedMesh(new BoxGeometry(0.045, 0.045, 0.045), lam(), 8);
    this.ball = new InstancedMesh(new SphereGeometry(0.018, 6, 4), new MeshLambertMaterial({ color: hexOf(C.white) }), 4);
    for (const m of [this.cards, this.chips, this.dice, this.ball]) {
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
  }

  /** Plan round `n` of a table's game. */
  private plan(g: Game, n: number) {
    const r = rnd(n * 7919 + Math.round(g.prop.x * 100) * 31 + Math.round(g.prop.z * 100));
    const P: Piece[] = [];
    const add = (p: Partial<Piece> & Pick<Piece, 'kind' | 'from' | 'to' | 't0'>) =>
      P.push({ dur: 0.25, flip: Infinity, out: g.len - 1.2, away: g.dealer, color: C.bone, spin: p.kind === 'chip' ? 2 + Math.floor(r() * 4) : 0, heard: false, ...p });
    const pot: V3 = [g.prop.x, g.top, g.prop.z];
    const toward = (a: V3, b: V3, k: number) => lerp(a, b, k);
    const stack = (base: V3, i: number): V3 => [base[0] + i * 0.05, base[1], base[2] + i * 0.02];
    switch (g.kind) {
      case 'cardtable': {
        // bets out, two cards round, a hit or two, the hole card, pay or take, sweep
        g.seats.forEach((s, i) => {
          const bet = toward(s, g.dealer, 0.25);
          const won = r() < 0.45;
          const back: V3 = [s[0], s[1], s[2]];
          add({ kind: 'chip', from: back, to: bet, t0: 0.2 + i * 0.15, color: CHIP_COLS[Math.floor(r() * 4)], out: 7 + i * 0.1, away: won ? back : g.dealer });
          if (won) add({ kind: 'chip', from: g.dealer, to: stack(bet, 1), t0: 7 + i * 0.1, color: C.gold, out: 7.8, away: back });
        });
        const seats = [...g.seats, g.dealer];
        for (let k = 0; k < 2; k++) seats.forEach((s, i) => {
          const isDealer = i === g.seats.length;
          const at: V3 = [s[0] + (k * 0.04 - 0.02) + (isDealer ? 0 : 0), s[1] + k * 0.004, s[2] + (isDealer ? 0 : 0)];
          const t0 = 1 + (k * seats.length + i) * 0.28;
          add({ kind: 'card', from: g.dealer, to: at, t0, flip: isDealer && k === 1 ? 5.5 : t0 + 0.3 });
        });
        g.seats.forEach((s, i) => {
          if (r() < 0.55) add({ kind: 'card', from: g.dealer, to: [s[0] + 0.06, s[1] + 0.008, s[2]], t0: 3.6 + i * 0.4, flip: 3.9 + i * 0.4 });
        });
        if (r() < 0.6) add({ kind: 'card', from: g.dealer, to: [g.dealer[0] + 0.06, g.dealer[1] + 0.008, g.dealer[2]], t0: 6, flip: 6.3 });
        break;
      }
      case 'poker': {
        // antes, hole cards face down, the flop, turn and river, a bet each street, showdown, the pot
        const winner = Math.floor(r() * g.seats.length);
        let chip = 0;
        const bet = (s: number, t0: number) => {
          add({ kind: 'chip', from: g.seats[s], to: stack([pot[0] + (r() - 0.5) * 0.12, pot[1], pot[2] + (r() - 0.5) * 0.08], chip++ % 4), t0, color: CHIP_COLS[Math.floor(r() * 5)], out: 11, away: g.seats[winner] });
        };
        g.seats.forEach((_, i) => bet(i, 0.3 + i * 0.2));
        for (let k = 0; k < 2; k++) g.seats.forEach((s, i) => add({ kind: 'card', from: g.dealer, to: [s[0] + k * 0.04, s[1] + k * 0.004, s[2]], t0: 1.2 + (k * g.seats.length + i) * 0.25, flip: 10 }));
        const board = (j: number): V3 => [pot[0] - 0.2 + j * 0.09, g.top, pot[2] + 0.18];
        [0, 1, 2].forEach((j) => add({ kind: 'card', from: g.dealer, to: board(j), t0: 3.6 + j * 0.2, flip: 4.4 }));
        add({ kind: 'card', from: g.dealer, to: board(3), t0: 6.2, flip: 6.5 });
        add({ kind: 'card', from: g.dealer, to: board(4), t0: 8.2, flip: 8.5 });
        g.seats.forEach((_, i) => r() < 0.7 && bet(i, 5 + i * 0.3));
        g.seats.forEach((_, i) => r() < 0.5 && bet(i, 7.4 + i * 0.3));
        break;
      }
      case 'craps': {
        // bets on the line, the shooter throws two dice the length of the table, pay or take
        const shooter = n % g.seats.length;
        g.seats.forEach((s, i) => {
          const won = r() < 0.5;
          const bet = toward(s, pot, 0.35);
          add({ kind: 'chip', from: s, to: bet, t0: 0.3 + i * 0.2, color: CHIP_COLS[Math.floor(r() * 4)], out: 5 + i * 0.15, away: won ? s : g.dealer });
          if (won) add({ kind: 'chip', from: g.dealer, to: stack(bet, 1), t0: 5 + i * 0.15, color: C.gold, out: 5.8, away: s });
        });
        const s = g.seats[shooter];
        const w = g.prop.w ?? 3;
        const far: V3 = [g.prop.x + (s[0] < g.prop.x ? 1 : -1) * w * 0.38, g.top + 0.0225, g.prop.z + (r() - 0.5) * 0.5];
        for (let k = 0; k < 2; k++) {
          const to: V3 = [far[0] + (r() - 0.5) * 0.25, far[1], far[2] + (k - 0.5) * 0.14];
          add({ kind: 'die', from: [s[0], s[1] + 0.25, s[2]], to, t0: 2, dur: 0.9, color: C.white, spin: r() * 6, out: 6.5, away: [s[0], s[1] + 0.0225, s[2]] });
        }
        break;
      }
      case 'roulette': {
        // chips across the layout, the ball, then the losers swept and the winners paid
        const lay = (): V3 => [g.prop.x - (g.prop.w ?? 2.8) / 2 + 0.3 + r() * ((g.prop.w ?? 2.8) - 1.3), g.top, g.prop.z + (r() - 0.5) * ((g.prop.d ?? 1.5) * 0.55)];
        g.seats.forEach((s, i) => {
          const m = 1 + Math.floor(r() * 3);
          for (let k = 0; k < m; k++) {
            const won = r() < 0.2;
            add({ kind: 'chip', from: s, to: lay(), t0: 0.3 + i * 0.3 + k * 0.4, color: CHIP_COLS[(i + k) % CHIP_COLS.length], out: 9 + r() * 0.8, away: won ? s : g.dealer });
          }
        });
        g.ballLand = 8;
        g.ballAt = r() * Math.PI * 2;
        break;
      }
    }
    g.pieces = P;
    g.round = n;
  }

  /** Where a piece is at time `t` into the round, its turn, and whether it's on the felt at all. */
  private place(g: Game, p: Piece, t: number): { at: V3; up: boolean; tilt: number; landed: boolean } | null {
    if (t < p.t0) return null;
    const back = p.away;
    if (t >= p.out + 0.35) return null;
    let at: V3, landed = false;
    if (t >= p.out) {
      at = lerp(p.to, back, (t - p.out) / 0.35);
    } else if (t < p.t0 + p.dur) {
      const k = (t - p.t0) / p.dur;
      at = lerp(p.from, p.to, k);
      // a card or chip slides low; a die flies in an arc and bounces twice
      const hop = p.kind === 'die' ? Math.abs(Math.sin(k * Math.PI * 2.5)) * 0.25 * (1 - k) : Math.sin(k * Math.PI) * 0.03;
      at = [at[0], at[1] + hop, at[2]];
    } else {
      at = p.to;
      landed = true;
    }
    const up = t >= p.flip;
    const tilt = p.kind === 'card' && t >= p.flip && t < p.flip + 0.15 ? Math.PI * (1 - (t - p.flip) / 0.15) : p.kind === 'die' ? p.spin + (t < p.t0 + p.dur ? (t - p.t0) * 14 : 0) : 0;
    return { at, up, tilt, landed };
  }

  /**
   * Run every visible table's game to `time` (s). `rooms` are the rooms drawn this frame; `you`
   * hears a card or a chip land within a few meters (returned for the app to play).
   */
  update(dt: number, time: number, rooms: ReadonlySet<string>, you: { x: number; z: number }): { sound: 'card' | 'chips'; dist: number }[] {
    this.acc += dt;
    if (this.acc < 1 / 30) return [];
    this.acc = 0;
    const heard: { sound: 'card' | 'chips'; dist: number }[] = [];
    let nc = 0, nh = 0, nd = 0, nb = 0;
    for (const g of this.games) {
      if (!rooms.has(g.room)) continue;
      const n = Math.floor(time / g.len);
      if (n !== g.round) this.plan(g, n);
      const t = time - n * g.len;
      const dist = Math.hypot(you.x - g.prop.x, you.z - g.prop.z);
      for (const p of g.pieces) {
        const s = this.place(g, p, t);
        if (!s) continue;
        if (s.landed && !p.heard) {
          p.heard = true;
          if (dist < 6 && p.kind !== 'die') heard.push({ sound: p.kind === 'card' ? 'card' : 'chips', dist });
        }
        if (p.kind === 'card' && nc < 160) {
          this.e.set(0, 0, s.tilt);
          this.q.setFromEuler(this.e);
          this.m4.compose(this.v.set(s.at[0], s.at[1] + 0.003, s.at[2]), this.q, this.s.set(1, 1, 1));
          this.cards.setMatrixAt(nc, this.m4);
          this.cards.setColorAt(nc, this.col.set(hexOf(s.up && s.tilt < Math.PI / 2 ? C.bone : C.blood)));
          nc++;
        } else if (p.kind === 'chip' && nh < 240) {
          // a bet is a little stack, drawn as one cylinder that tall
          const n = Math.max(1, p.spin);
          this.m4.compose(this.v.set(s.at[0], s.at[1] + (CHIP_H * n) / 2, s.at[2]), this.q.identity(), this.s.set(1, n, 1));
          this.chips.setMatrixAt(nh, this.m4);
          this.chips.setColorAt(nh, this.col.set(hexOf(p.color)));
          nh++;
        } else if (p.kind === 'die' && nd < 8) {
          this.e.set(s.tilt, s.tilt * 0.7, 0);
          this.q.setFromEuler(this.e);
          this.m4.compose(this.v.set(s.at[0], s.at[1], s.at[2]), this.q, this.s.set(1, 1, 1));
          this.dice.setMatrixAt(nd, this.m4);
          this.dice.setColorAt(nd, this.col.set(hexOf(C.bone)));
          nd++;
        }
      }
      // the roulette ball: launched fast against the turn, slowing, dropping into a pocket that
      // then rides the wheel round (the wheel turns at 1.6 rad/s in room.ts)
      if (g.wheel && g.ballLand !== undefined && nb < 4) {
        const L = g.ballLand, at0 = g.ballAt ?? 0;
        let a: number, rad: number;
        if (t < 3) {
          a = at0 + time * 1.6;
          rad = 0.2;
        } else if (t < L) {
          const k = (t - 3) / (L - 3);
          a = at0 - (1 - (1 - k) * (1 - k)) * 40 + time * 1.6 * k;
          rad = 0.36 - 0.16 * k * k;
        } else {
          a = at0 - 40 + time * 1.6;
          rad = 0.2;
        }
        this.m4.makeTranslation(g.wheel[0] + Math.cos(a) * rad, g.wheel[1] + (t >= 3 && t < L ? 0.01 : 0), g.wheel[2] + Math.sin(a) * rad);
        this.ball.setMatrixAt(nb++, this.m4);
      }
    }
    this.cards.count = nc;
    this.chips.count = nh;
    this.dice.count = nd;
    this.ball.count = nb;
    for (const m of [this.cards, this.chips, this.dice, this.ball]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    return heard;
  }

  dispose() {
    for (const m of [this.cards, this.chips, this.dice, this.ball]) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as MeshLambertMaterial).dispose();
      m.dispose();
    }
  }
}
