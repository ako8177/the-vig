// The crowd (DECISIONS #66): presentation only, never in the sim. Each person is nine boxes (two legs,
// two shins, torso, head, hair, two arms) in one instanced draw, posed every frame by what they're
// doing: pulling a slot's handle, pushing chips, dealing, polishing glasses behind the bar, lifting
// a drink, smoking, playing piano, pacing the floor. The railbirds by each table turn to watch when
// you sit down there, and cheer your wins (a big one brings the room in) and groan at your losses.
import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, MeshLambertMaterial, Quaternion, Euler, Vector3, type Scene } from 'three';
import type { Floor, NpcSpot } from '../data/floors';
import { C, hexOf } from '../data/palette';
import { GLOW } from './view';

/** the parts, in instance order within a person */
const PARTS = ['legL', 'legR', 'shinL', 'shinR', 'torso', 'head', 'hair', 'armL', 'armR'] as const;
type Part = (typeof PARTS)[number];
const NP = PARTS.length;

const SKIN = [C.cream, C.woodHi, C.wood, C.woodLo, C.brass];
const HAIR = [C.ink, C.woodLo, C.ink, C.brassLo, C.bone, C.night];
// dressed up for a night out: bright enough to read against the dark cabinets, a few dark suits
const COAT = [C.pink, C.teal, C.indigoHi, C.marker, C.woodHi, C.cream, C.pinkHi, C.brassLo, C.night, C.soulLo, C.smoke, C.bone];
const PANTS = [C.ink, C.night, C.smoke, C.woodLo, C.indigo, C.ash];

interface Person {
  spot: NpcSpot;
  x: number;
  z: number;
  yaw: number;
  /** a per-person offset so no two move in step */
  phase: number;
  speed: number;
  /** walkers: which waypoint they head for, and which way along the path */
  leg: number;
  dir: number;
  /** cheering (s left, how big), groaning (s left) */
  cheer: number;
  big: boolean;
  groan: number;
  coat: number;
}

const rand = (i: number, k: number) => {
  const h = Math.imul(i * 374761393 + k * 668265263, 1274126177) >>> 0;
  return (h % 10000) / 10000;
};

export class Crowd {
  readonly people: Person[];
  private body: InstancedMesh;
  private glass: InstancedMesh;
  private ember: InstancedMesh;
  private smoke: InstancedMesh;
  private puffs: { x: number; y: number; z: number; t: number; vx: number; vz: number }[] = [];
  private puffT = 0;
  private acc = 1;
  private m4 = new Matrix4();
  private q = new Quaternion();
  private e = new Euler(0, 0, 0, 'YXZ');
  private v = new Vector3();
  private s = new Vector3();

  constructor(private scene: Scene, floor: Floor) {
    this.people = floor.npcs.map((spot, i) => ({
      spot, x: spot.x, z: spot.z, yaw: spot.yaw, phase: rand(i, 1) * 10, speed: 0.9 + rand(i, 2) * 0.5,
      leg: 1, dir: 1, cheer: 0, big: false, groan: 0, coat: i,
    }));
    const unit = new BoxGeometry(1, 1, 1);
    this.body = new InstancedMesh(unit, new MeshLambertMaterial({ color: 0xffffff }), this.people.length * NP);
    this.body.name = 'crowd';
    this.body.frustumCulled = false;
    // each part's color is the person's: skin, hair, coat, trousers; dealers and bartenders in white shirts
    this.people.forEach((p, i) => {
      const white = p.spot.role === 'dealer' || p.spot.role === 'bartender';
      const skin = SKIN[Math.floor(rand(i, 3) * SKIN.length)];
      const hair = HAIR[Math.floor(rand(i, 4) * HAIR.length)];
      const coat = white ? C.bone : COAT[Math.floor(rand(i, 5) * COAT.length)];
      const pants = PANTS[Math.floor(rand(i, 6) * PANTS.length)];
      const col: Record<Part, number> = {
        legL: pants, legR: pants, shinL: pants, shinR: pants, torso: coat, head: skin, hair,
        armL: white ? C.bone : coat, armR: white ? C.bone : coat,
      };
      PARTS.forEach((part, k) => this.body.setColorAt(i * NP + k, new Color(hexOf(col[part]))));
    });
    scene.add(this.body);
    const drinkers = this.people.length;
    this.glass = new InstancedMesh(new BoxGeometry(0.07, 0.12, 0.07), new MeshLambertMaterial({ color: hexOf(C.cream) }), drinkers);
    this.glass.frustumCulled = false;
    scene.add(this.glass);
    // embers glow (the bloom catches them); smoke drifts up, pale and thin
    this.ember = new InstancedMesh(new BoxGeometry(0.03, 0.03, 0.03), new MeshBasicMaterial({ color: new Color(hexOf(C.woodHi)).multiplyScalar(1.4) }), drinkers);
    this.ember.frustumCulled = false;
    this.ember.layers.enable(GLOW);
    scene.add(this.ember);
    this.smoke = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: hexOf(C.dust), transparent: true, opacity: 0.22, depthWrite: false }), 120);
    this.smoke.frustumCulled = false;
    scene.add(this.smoke);
  }

  /** A result at `table`: its railbirds cheer a win (a big one brings the room in), groan at a loss. */
  react(table: string, win: boolean, big: boolean, at: { x: number; z: number }) {
    for (const p of this.people) {
      const near = Math.hypot(p.x - at.x, p.z - at.z);
      const mine = p.spot.table === table;
      if (win && (mine || (big && near < 9 && p.spot.role !== 'walker'))) {
        p.cheer = big ? 2.2 : 1.3;
        p.big = big;
      } else if (!win && mine && big) p.groan = 1.4;
    }
  }

  /**
   * Pose everyone for this frame. `seat` is where you sit (the table and its stand point), or null;
   * `you` is where you are, so people near you glance at you.
   */
  update(dt: number, t: number, seat: { table: string; x: number; z: number } | null, you: { x: number; z: number }) {
    // pose at 30 Hz: the matrices go up to the GPU each pose, and under software WebGL a per-frame
    // upload stalls the pipeline (DECISIONS #68); people don't need 60 poses a second
    this.acc += dt;
    if (this.acc < 1 / 30) return;
    dt = this.acc;
    this.acc = 0;
    const bodyM = this.body, glassM = this.glass, emberM = this.ember;
    let g = 0, em = 0;
    const smokeAt: { x: number; y: number; z: number }[] = [];
    this.people.forEach((p, i) => {
      const role = p.spot.role;
      const tt = t * p.speed + p.phase;
      let yaw = p.spot.yaw, x = p.x, z = p.z;
      let walk = 0;
      // walkers and the bartender move along their path, out and back
      if ((role === 'walker' || role === 'bartender') && p.spot.path && p.spot.path.length > 1) {
        const path = p.spot.path;
        const to = path[p.leg];
        const dx = to.x - p.x, dz = to.z - p.z, d = Math.hypot(dx, dz);
        const sp = role === 'walker' ? 1.1 : 0.5;
        if (d < 0.05) {
          if (p.leg + p.dir < 0 || p.leg + p.dir >= path.length) p.dir = -p.dir;
          p.leg += p.dir;
        } else {
          // the bartender pauses to polish a glass now and then
          const pause = role === 'bartender' && Math.sin(tt * 0.4) > 0.3;
          if (!pause) {
            const k = Math.min(1, (sp * dt) / d);
            p.x += dx * k;
            p.z += dz * k;
            walk = 1;
          }
          yaw = Math.atan2(-dx, -dz);
          if (role === 'bartender' && pause) yaw = Math.PI / 2;
        }
        x = p.x;
        z = p.z;
        p.yaw = yaw;
      }
      // the railbirds by a table turn to watch you play it; anyone close by glances at you
      let headYaw = 0;
      if (role === 'watcher' && seat && seat.table === p.spot.table) {
        const want = Math.atan2(-(seat.x - x), -(seat.z - z));
        p.yaw += angleTo(p.yaw, want) * Math.min(1, dt * 3);
        yaw = p.yaw;
      } else if (role === 'watcher') {
        p.yaw += angleTo(p.yaw, p.spot.yaw) * Math.min(1, dt * 1.5);
        yaw = p.yaw;
      }
      const toYou = Math.hypot(you.x - x, you.z - z);
      if (toYou < 3.5 && role !== 'walker') {
        const want = Math.atan2(-(you.x - x), -(you.z - z));
        headYaw = Math.max(-0.9, Math.min(0.9, angleTo(yaw, want)));
      }
      p.cheer = Math.max(0, p.cheer - dt);
      p.groan = Math.max(0, p.groan - dt);

      // ---- the pose: heights and swings for this role and moment
      const seated = p.spot.seated;
      const hip = seated ? 0.62 : 0.88;
      let armL = 0.05, armR = 0.05, armLz = 0, armRz = 0, lean = 0, hop = 0, legSwing = 0;
      let holding: 'glass' | 'cig' | null = null;
      const pulse = (period: number, len: number) => {
        const k = ((tt % period) + period) % period;
        return k < len ? Math.sin((k / len) * Math.PI) : 0;
      };
      switch (role) {
        case 'slots':
          armL = -0.7;
          armR = -0.9 - 0.9 * pulse(3.2, 0.8);
          lean = 0.12;
          break;
        case 'table':
          armL = -1.25;
          armR = -1.25 - 0.35 * pulse(4.5, 0.7);
          lean = 0.18;
          break;
        case 'dealer':
          armL = -1.1;
          armR = -1.0 - 0.6 * pulse(1.6, 0.6);
          armRz = 0.4 * pulse(1.6, 0.6);
          break;
        case 'bartender':
          if (!walk) {
            armL = -1.0;
            armR = -1.3 + 0.25 * Math.sin(tt * 6);
            holding = 'glass';
          }
          break;
        case 'drinker':
        case 'booth': {
          const sip = pulse(6, 1.6);
          armR = -0.5 - 1.9 * sip;
          armL = seated ? -0.9 : 0.05;
          holding = 'glass';
          break;
        }
        case 'smoker': {
          const drag = pulse(5, 1.4);
          armR = -0.6 - 1.7 * drag;
          armL = -0.4;
          armLz = 0.3;
          holding = 'cig';
          if (drag > 0 && drag < 0.15 && ((tt % 5) + 5) % 5 > 0.7) smokeAt.push({ x, y: hip + 0.85, z });
          break;
        }
        case 'pianist':
          armL = -1.3 + 0.15 * Math.sin(tt * 9);
          armR = -1.3 + 0.15 * Math.sin(tt * 9 + 1.7);
          lean = 0.1;
          break;
        case 'watcher':
          armL = 0.08 + 0.03 * Math.sin(tt);
          armR = 0.08;
          lean = seat && seat.table === p.spot.table ? 0.12 : 0;
          break;
        case 'walker':
          legSwing = Math.sin(tt * 7) * 0.45 * walk;
          armL = -legSwing * 0.8;
          armR = legSwing * 0.8;
          break;
      }
      if (role === 'bartender' && walk) {
        legSwing = Math.sin(tt * 6) * 0.35;
        armL = -legSwing;
        armR = legSwing;
      }
      if (p.cheer > 0) {
        // arms up and a hop (a big win: higher, longer)
        const k = Math.abs(Math.sin(p.cheer * 9));
        armL = armR = -2.9;
        armLz = 0.35;
        armRz = -0.35;
        hop = seated ? 0 : (p.big ? 0.14 : 0.07) * k;
        holding = holding === 'glass' ? 'glass' : null;
      } else if (p.groan > 0) {
        armL = armR = -2.5;
        armLz = 0.9;
        armRz = -0.9;
        lean = 0.25;
      }

      // ---- the boxes
      const base = i * NP;
      const put = (k: number, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, rx = 0, rz = 0, py = 0) => {
        // a part pivoting about (lx, ly + py, lz) in the person's frame, hanging `py` above its center
        this.e.set(rx, 0, rz);
        this.q.setFromEuler(this.e);
        const off = new Vector3(0, -py, 0).applyQuaternion(this.q);
        const local = new Vector3(lx, ly + py, lz).add(off);
        local.applyAxisAngle(UP, yaw);
        this.e.set(rx, yaw, rz, 'YXZ');
        this.q.setFromEuler(this.e);
        this.v.set(x + local.x, local.y + hop, z + local.z);
        this.s.set(sx, sy, sz);
        this.m4.compose(this.v, this.q, this.s);
        bodyM.setMatrixAt(base + k, this.m4);
      };
      const torsoY = hip + 0.3;
      if (seated) {
        // thighs forward, shins down to the floor
        put(0, -0.09, hip, -0.18, 0.13, 0.13, 0.42);
        put(1, 0.09, hip, -0.18, 0.13, 0.13, 0.42);
        put(2, -0.09, hip / 2, -0.38, 0.12, hip, 0.13);
        put(3, 0.09, hip / 2, -0.38, 0.12, hip, 0.13);
      } else {
        put(0, -0.09, hip / 2, 0, 0.13, hip, 0.15, legSwing, 0, hip / 2);
        put(1, 0.09, hip / 2, 0, 0.13, hip, 0.15, -legSwing, 0, hip / 2);
        put(2, 0, 0, 0, 0, 0, 0);
        put(3, 0, 0, 0, 0, 0, 0);
      }
      put(4, 0, torsoY, 0, 0.38, 0.6, 0.22, -lean);
      const headY = torsoY + 0.44;
      // the head turns toward you when you're close
      put(5, 0, headY, -lean * 0.3, 0.22, 0.24, 0.22);
      if (headYaw) {
        // re-pose the head with its own turn
        const local = new Vector3(0, headY, -lean * 0.3).applyAxisAngle(UP, yaw);
        this.q.setFromEuler(new Euler(0, yaw + headYaw, 0, 'YXZ'));
        this.m4.compose(new Vector3(x + local.x, local.y + hop, z + local.z), this.q, new Vector3(0.22, 0.24, 0.22));
        bodyM.setMatrixAt(base + 5, this.m4);
      }
      put(6, 0, headY + 0.13, 0.02, 0.24, 0.07, 0.24);
      const shoulderY = torsoY + 0.27;
      // the swings above are written as "negative is forward": a box turns the other way about X
      put(7, -0.24, shoulderY - 0.28, 0, 0.1, 0.56, 0.11, -armL, -armLz, 0.28);
      put(8, 0.24, shoulderY - 0.28, 0, 0.1, 0.56, 0.11, -armR, -armRz, 0.28);

      // what's in the right hand: where the hand is, from the arm's swing
      if (holding) {
        const hand = new Vector3(0, -0.56, 0).applyEuler(new Euler(-armR, 0, -armRz)).add(new Vector3(0.24, shoulderY, 0)).applyAxisAngle(UP, yaw);
        if (holding === 'glass') {
          this.m4.makeTranslation(x + hand.x, hand.y + hop, z + hand.z);
          glassM.setMatrixAt(g++, this.m4);
        } else {
          this.m4.makeTranslation(x + hand.x, hand.y + hop, z + hand.z);
          emberM.setMatrixAt(em++, this.m4);
        }
      }
    });
    glassM.count = g;
    emberM.count = em;
    bodyM.instanceMatrix.needsUpdate = true;
    glassM.instanceMatrix.needsUpdate = true;
    emberM.instanceMatrix.needsUpdate = true;

    // smoke: a puff from each drag, rising, spreading, gone in a few seconds
    for (const s of smokeAt) {
      if (this.puffs.length < 110) this.puffs.push({ x: s.x, y: s.y, z: s.z, t: 0, vx: (Math.random() - 0.5) * 0.1, vz: (Math.random() - 0.5) * 0.1 });
    }
    this.puffT += dt;
    if (this.puffT > 0.25) {
      this.puffT = 0;
      // an idle smoker's cigarette smoulders too
      for (const p of this.people) if (p.spot.role === 'smoker' && this.puffs.length < 110) this.puffs.push({ x: p.x + 0.2, y: (p.spot.seated ? 0.62 : 0.88) + 0.55, z: p.z, t: 0, vx: (Math.random() - 0.5) * 0.04, vz: (Math.random() - 0.5) * 0.04 });
    }
    let n = 0;
    for (const s of this.puffs) {
      s.t += dt;
      s.y += dt * 0.25;
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      const k = s.t / 3.5;
      if (k >= 1) continue;
      const size = 0.05 + k * 0.35;
      this.m4.compose(this.v.set(s.x, s.y, s.z), this.q.identity(), this.s.set(size, size * 0.7, size));
      this.smoke.setMatrixAt(n++, this.m4);
    }
    this.puffs = this.puffs.filter((s) => s.t < 3.5);
    this.smoke.count = n;
    this.smoke.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const m of [this.body, this.glass, this.ember, this.smoke]) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as MeshLambertMaterial).dispose();
      m.dispose();
    }
  }
}

const UP = new Vector3(0, 1, 0);

/** The shortest signed turn from angle a to angle b. */
function angleTo(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

