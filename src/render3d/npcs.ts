// The crowd (DECISIONS #66): presentation only, never in the sim. Each person is a little jointed
// figure of boxes (hips, torso, a head with eyes and hair, upper arms, forearms and hands, thighs,
// shins and shoes; a chair for a card player), everyone in one instanced draw, posed by what they're
// doing: pulling a slot's handle, pushing chips, dealing, polishing glasses behind the bar, lifting
// a drink, smoking, playing piano, pacing the floor. The railbirds by each table turn to watch when
// you sit down there, and cheer your wins (a big one brings the room in) and groan at your losses.
import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, MeshLambertMaterial, Quaternion, Euler, Vector3, type Scene } from 'three';
import type { Floor, NpcSpot } from '../data/floors';
import { C, hexOf } from '../data/palette';
import { GLOW } from './view';

/** the parts, in instance order within a person */
const PARTS = [
  'pelvis', 'torso', 'head', 'hairTop', 'hairBack', 'eyeL', 'eyeR',
  'uArmL', 'uArmR', 'fArmL', 'fArmR', 'handL', 'handR',
  'thighL', 'thighR', 'shinL', 'shinR', 'shoeL', 'shoeR', 'seat', 'post',
] as const;
type Part = (typeof PARTS)[number];
const NP = PARTS.length;

const SKIN = [C.cream, C.woodHi, C.wood, C.woodLo, C.brass];
const HAIR = [C.ink, C.woodLo, C.ink, C.brassLo, C.bone, C.night];
// dressed up for a night out: bright enough to read against the dark cabinets, a few dark suits
const COAT = [C.pink, C.teal, C.indigoHi, C.marker, C.woodHi, C.cream, C.pinkHi, C.brassLo, C.night, C.soulLo, C.smoke, C.bone];
const PANTS = [C.ink, C.night, C.smoke, C.woodLo, C.indigo, C.ash];
const SHOES = [C.ink, C.ink, C.woodLo, C.night];

/** the figure's measures (m): about 1.72 m standing */
const LEG = { thigh: 0.44, shin: 0.4, foot: 0.07 };
const STAND_HIP = LEG.thigh + LEG.shin + LEG.foot - 0.01;
const ARM = { upper: 0.3, fore: 0.27 };
const SHOULDER = { x: 0.24, y: 0.53 };
/** where each seated role sits: the top of what's under them (room.ts's stools, booths, the piano bench) */
const SEAT_TOP: Partial<Record<NpcSpot['role'], number>> = { slots: 0.69, drinker: 0.75, booth: 0.45, pianist: 0.54, table: 0.55 };

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
  /** the joints of the person being posed, and where their parts start in the instance list */
  private J = {
    root: new Matrix4(), torso: new Matrix4(), head: new Matrix4(), shL: new Matrix4(), shR: new Matrix4(),
    elL: new Matrix4(), elR: new Matrix4(), hipL: new Matrix4(), hipR: new Matrix4(), knL: new Matrix4(), knR: new Matrix4(),
  };
  private base = 0;
  /** each person's part colors, and who is drawn in each slot of the instance list */
  private colors: Color[][] = [];
  private owner: number[] = [];

  constructor(private scene: Scene, floor: Floor) {
    this.people = floor.npcs.map((spot, i) => ({
      spot, x: spot.x, z: spot.z, yaw: spot.yaw, phase: rand(i, 1) * 10, speed: 0.9 + rand(i, 2) * 0.5,
      leg: 1, dir: 1, cheer: 0, big: false, groan: 0, coat: i,
    }));
    const unit = new BoxGeometry(1, 1, 1);
    this.body = new InstancedMesh(unit, new MeshLambertMaterial({ color: 0xffffff }), this.people.length * NP);
    this.body.name = 'crowd';
    this.body.frustumCulled = false;
    // people stand in front of neon: the glow pass draws them black (view.ts)
    this.body.userData.occluder = true;
    // each part's color is the person's: skin, hair, coat, trousers, shoes; dealers and bartenders
    // in a dark vest over white shirtsleeves, so the staff read as staff from across the room
    this.people.forEach((p, i) => {
      const staff = p.spot.role === 'dealer' || p.spot.role === 'bartender';
      const skin = SKIN[Math.floor(rand(i, 3) * SKIN.length)];
      const hair = HAIR[Math.floor(rand(i, 4) * HAIR.length)];
      const coat = staff ? C.ink : COAT[Math.floor(rand(i, 5) * COAT.length)];
      const sleeve = staff ? C.bone : coat;
      const pants = staff ? C.ink : PANTS[Math.floor(rand(i, 6) * PANTS.length)];
      const shoe = SHOES[Math.floor(rand(i, 7) * SHOES.length)];
      const col: Record<Part, number> = {
        pelvis: pants, torso: coat, head: skin, hairTop: hair, hairBack: hair, eyeL: C.ink, eyeR: C.ink,
        uArmL: sleeve, uArmR: sleeve, fArmL: sleeve, fArmR: sleeve, handL: skin, handR: skin,
        thighL: pants, thighR: pants, shinL: pants, shinR: pants, shoeL: shoe, shoeR: shoe, seat: C.woodLo, post: C.brassLo,
      };
      this.colors.push(PARTS.map((part) => new Color(hexOf(col[part]))));
    });
    this.colors.forEach((cs, i) => cs.forEach((c, k) => this.body.setColorAt(i * NP + k, c)));
    this.owner = this.people.map((_, i) => i);
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
   * `you` is where you are and which way you face, so people near you glance at you; `rooms` are the
   * rooms drawn this frame. Only the people you could see are drawn: those in a drawn room and not
   * behind you (a person is 21 boxes, twice a frame with the glow pass: DECISIONS #68's budget).
   */
  update(dt: number, t: number, seat: { table: string; x: number; z: number } | null, you: { x: number; z: number; fx: number; fz: number }, rooms: ReadonlySet<string>) {
    // pose at 30 Hz: the matrices go up to the GPU each pose, and under software WebGL a per-frame
    // upload stalls the pipeline (DECISIONS #68); people don't need 60 poses a second
    this.acc += dt;
    if (this.acc < 1 / 30) return;
    dt = this.acc;
    this.acc = 0;
    const glassM = this.glass, emberM = this.ember;
    let g = 0, em = 0, slot = 0;
    let recolor = false;
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
      // out of sight: they keep walking and cheering, but cost nothing to draw
      const seen = rooms.has(p.spot.room) && (x - you.x) * you.fx + (z - you.z) * you.fz > -1.2;
      if (!seen) return;
      if (this.owner[slot] !== i) {
        this.owner[slot] = i;
        this.colors[i].forEach((c, k) => this.body.setColorAt(slot * NP + k, c));
        recolor = true;
      }

      // ---- the pose: joint angles for this role and moment, in radians. A positive shoulder or hip
      // swings the limb forward, a positive elbow bends the forearm forward, a positive knee folds the
      // shin back; `ab` lifts an arm out to the side (negative tucks it across the body)
      const seated = p.spot.seated;
      const seatTop = SEAT_TOP[role] ?? 0.55;
      const hip = seated ? seatTop + 0.07 : STAND_HIP;
      let shL = 0.05, shR = 0.05, elL = 0.15, elR = 0.15, abL = 0.06, abR = 0.06, lean = 0, hop = 0;
      let thL = seated ? Math.PI / 2 : 0, thR = thL, knL = thL, knR = thL;
      let holding: 'glass' | 'cig' | null = null;
      const pulse = (period: number, len: number) => {
        const k = ((tt % period) + period) % period;
        return k < len ? Math.sin((k / len) * Math.PI) : 0;
      };
      switch (role) {
        case 'slots': {
          // a hand on the buttons, the other on the handle: up, pull down, let go
          const pl = pulse(3.2, 0.8);
          shL = 0.75;
          elL = 0.7;
          shR = 1.25 - 0.8 * pl;
          elR = 0.3 + 0.3 * pl;
          abR = 0.25;
          lean = 0.1;
          break;
        }
        case 'table': {
          // forearms on the rail; the right pushes chips out now and then
          const push = pulse(4.5, 0.7);
          shL = 0.35;
          elL = 1.2;
          shR = 0.35 + 0.4 * push;
          elR = 1.2 - 0.25 * push;
          abL = abR = 0.12;
          lean = 0.16;
          break;
        }
        case 'dealer': {
          const deal = pulse(1.6, 0.6);
          shL = 0.45;
          elL = 0.75;
          shR = 0.45 + 0.4 * deal;
          elR = 0.75 - 0.3 * deal;
          abR = 0.08 + 0.3 * deal;
          lean = 0.12;
          break;
        }
        case 'bartender':
          if (!walk) {
            // polishing a glass at the chest
            shL = shR = 0.4;
            elL = 1.25;
            elR = 1.3 + 0.25 * Math.sin(tt * 6);
            abL = abR = -0.12;
            holding = 'glass';
          }
          break;
        case 'drinker':
        case 'booth': {
          const sip = pulse(6, 1.6);
          shR = 0.3 + 0.5 * sip;
          elR = 0.95 + 1.4 * sip;
          if (seated) {
            shL = 0.4;
            elL = 1.15;
          }
          holding = 'glass';
          break;
        }
        case 'smoker': {
          // one arm across the body, the cigarette hand up to the mouth for a drag
          const drag = pulse(5, 1.4);
          shR = 0.25 + 0.45 * drag;
          elR = 0.65 + 1.9 * drag;
          shL = 0.25;
          elL = 1.45;
          abL = -0.25;
          holding = 'cig';
          if (drag > 0 && drag < 0.15 && ((tt % 5) + 5) % 5 > 0.7) smokeAt.push({ x, y: hip + 0.85, z });
          break;
        }
        case 'pianist':
          shL = shR = 0.5;
          elL = 0.9 + 0.12 * Math.sin(tt * 9);
          elR = 0.9 + 0.12 * Math.sin(tt * 9 + 1.7);
          lean = 0.1;
          break;
        case 'watcher':
          // half of them fold their arms, the rest let them hang
          if (rand(i, 8) < 0.5) {
            shL = shR = 0.3;
            elL = elR = 1.65;
            abL = abR = -0.35;
          } else shL = 0.06 + 0.03 * Math.sin(tt);
          lean = seat && seat.table === p.spot.table ? 0.12 : 0;
          break;
      }
      if (walk) {
        // a stride: the legs swing, the back knee folds, the arms swing against the legs
        const st = tt * (role === 'walker' ? 7 : 6);
        const amp = role === 'walker' ? 0.45 : 0.35;
        const sw = Math.sin(st);
        thL = sw * amp;
        thR = -sw * amp;
        knL = Math.max(0, -Math.cos(st)) * 0.6;
        knR = Math.max(0, Math.cos(st)) * 0.6;
        shL = -sw * amp * 0.8;
        shR = sw * amp * 0.8;
        elL = elR = 0.25;
      }
      if (p.cheer > 0) {
        // arms up and a hop (a big win: higher, longer)
        const k = Math.abs(Math.sin(p.cheer * 9));
        shL = shR = 2.9;
        elL = elR = 0.2;
        abL = abR = 0.35;
        hop = seated ? 0 : (p.big ? 0.14 : 0.07) * k;
        holding = holding === 'glass' ? 'glass' : null;
      } else if (p.groan > 0) {
        // hands to the head
        shL = shR = 2.7;
        elL = elR = 2.0;
        abL = abR = 0.5;
        lean = 0.25;
      }

      // ---- the boxes, hung off the joints
      const J = this.J, joint = this.joint, box = this.box;
      this.base = slot++ * NP;
      joint(J.root, null, x, hop, z, 0, yaw, 0);
      // a slot player's spot is at the machine; the stool is a hand's width behind it
      if (role === 'slots') J.root.multiply(this.m4.makeTranslation(0, 0, 0.12));
      joint(J.torso, J.root, 0, hip, 0, -lean, 0, 0);
      box(0, J.torso, 0, 0.05, 0, 0.34, 0.17, 0.21);
      box(1, J.torso, 0, 0.35, 0, 0.38, 0.44, 0.22);
      // the head stays upright as the body leans, and turns toward you when you're close
      joint(J.head, J.torso, 0, SHOULDER.y + 0.05, 0, lean * 0.7, headYaw, 0);
      box(2, J.head, 0, 0.13, 0, 0.22, 0.24, 0.22);
      box(3, J.head, 0, 0.265, 0.01, 0.24, 0.06, 0.245);
      box(4, J.head, 0, 0.16, 0.1, 0.24, 0.2, 0.05);
      box(5, J.head, -0.055, 0.15, -0.112, 0.045, 0.03, 0.012);
      box(6, J.head, 0.055, 0.15, -0.112, 0.045, 0.03, 0.012);
      joint(J.shL, J.torso, -SHOULDER.x, SHOULDER.y, 0, shL, 0, -abL);
      joint(J.shR, J.torso, SHOULDER.x, SHOULDER.y, 0, shR, 0, abR);
      box(7, J.shL, 0, -ARM.upper / 2, 0, 0.1, ARM.upper, 0.11);
      box(8, J.shR, 0, -ARM.upper / 2, 0, 0.1, ARM.upper, 0.11);
      joint(J.elL, J.shL, 0, -ARM.upper, 0, elL, 0, 0);
      joint(J.elR, J.shR, 0, -ARM.upper, 0, elR, 0, 0);
      box(9, J.elL, 0, -ARM.fore / 2 + 0.01, 0, 0.09, ARM.fore, 0.1);
      box(10, J.elR, 0, -ARM.fore / 2 + 0.01, 0, 0.09, ARM.fore, 0.1);
      box(11, J.elL, 0, -ARM.fore - 0.03, 0, 0.08, 0.08, 0.08);
      box(12, J.elR, 0, -ARM.fore - 0.03, 0, 0.08, 0.08, 0.08);
      joint(J.hipL, J.root, -0.09, hip, 0, thL, 0, 0);
      joint(J.hipR, J.root, 0.09, hip, 0, thR, 0, 0);
      box(13, J.hipL, 0, -LEG.thigh / 2, 0, 0.14, LEG.thigh, 0.16);
      box(14, J.hipR, 0, -LEG.thigh / 2, 0, 0.14, LEG.thigh, 0.16);
      joint(J.knL, J.hipL, 0, -LEG.thigh, 0, -knL, 0, 0);
      joint(J.knR, J.hipR, 0, -LEG.thigh, 0, -knR, 0, 0);
      box(15, J.knL, 0, -LEG.shin / 2, 0, 0.12, LEG.shin, 0.13);
      box(16, J.knR, 0, -LEG.shin / 2, 0, 0.12, LEG.shin, 0.13);
      box(17, J.knL, 0, -LEG.shin - LEG.foot / 2, -0.045, 0.12, LEG.foot, 0.23);
      box(18, J.knR, 0, -LEG.shin - LEG.foot / 2, -0.045, 0.12, LEG.foot, 0.23);
      // a card player brings a chair (room.ts's card tables have none of their own)
      const chair = role === 'table' ? 1 : 0;
      box(19, J.root, 0, seatTop - 0.03, -0.08, 0.44 * chair, 0.06 * chair, 0.42 * chair);
      box(20, J.root, 0, (seatTop - 0.06) / 2, -0.08, 0.06 * chair, (seatTop - 0.06) * chair, 0.06 * chair);

      // what's in the right hand: a glass upright, a cigarette's ember
      if (holding) {
        this.v.set(0, -ARM.fore - 0.03, 0).applyMatrix4(J.elR);
        this.m4.makeTranslation(this.v.x, this.v.y + (holding === 'glass' ? 0.05 : 0.04), this.v.z);
        if (holding === 'glass') glassM.setMatrixAt(g++, this.m4);
        else emberM.setMatrixAt(em++, this.m4);
      }
    });
    glassM.count = g;
    emberM.count = em;
    this.body.count = slot * NP;
    this.body.instanceMatrix.needsUpdate = true;
    if (recolor && this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
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
      for (const p of this.people) {
        if (p.spot.role !== 'smoker' || this.puffs.length >= 110) continue;
        this.puffs.push({ x: p.x + 0.2, y: STAND_HIP + 0.55, z: p.z, t: 0, vx: (Math.random() - 0.5) * 0.04, vz: (Math.random() - 0.5) * 0.04 });
      }
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

  /** out = parent · translate(x, y, z) · rotate(rx, ry, rz) (Y, then X, then Z): one joint. */
  private joint = (out: Matrix4, parent: Matrix4 | null, x: number, y: number, z: number, rx: number, ry: number, rz: number) => {
    this.e.set(rx, ry, rz, 'YXZ');
    out.makeRotationFromEuler(this.e).setPosition(x, y, z);
    if (parent) out.premultiply(parent);
  };

  /** Part `k` of the person being posed: a box (sx, sy, sz) centered at (x, y, z) in a joint's frame. */
  private box = (k: number, parent: Matrix4, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    this.m4.makeScale(sx, sy, sz).setPosition(x, y, z).premultiply(parent);
    this.body.setMatrixAt(this.base + k, this.m4);
  };

  dispose() {
    for (const m of [this.body, this.glass, this.ember, this.smoke]) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as MeshLambertMaterial).dispose();
      m.dispose();
    }
  }
}

/** The shortest signed turn from angle a to angle b. */
function angleTo(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
