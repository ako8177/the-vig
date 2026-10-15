// The Collector at his table, and the lever duel under it (DECISIONS #80, #81; the owner's scene).
// Presentation only: the sim decides every pull; this draws it.
// - The Collector: a tall figure in a hat, seated across the table, eyes burning. He breathes,
//   nods as he talks, leans in and reaches across to pull a lever, convulses when it's live, and
//   at his second shock slumps over the table with his eyes going out. The next night's Collector
//   is the same figure with other eyes (DECISIONS #81: one model for now).
// - The table top lifts and turns over (the owner asked for Buckshot Roulette's reveal: flagged,
//   DECISIONS #80) to show its underside: ten levers in a row, a battery, a junction box, and the
//   wires from every lever knotted together on the way there, so you can't follow one.
// - The battery sparks now and then; a live lever throws an arc from it to the lever.
// Everything here is on the back room's side of the floor and costs ~40 draws only there.
import {
  BoxGeometry, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, CylinderGeometry, Float32BufferAttribute, Group, InstancedMesh, Line, PointLight,
  LineBasicMaterial, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, NearestFilter, Object3D, PlaneGeometry, SphereGeometry,
  SRGBColorSpace, TubeGeometry, Vector3, type Material, type Scene,
} from 'three';
import type { Floor } from '../data/floors';
import { C, PALETTE, hexOf } from '../data/palette';
import { GLOW } from './view';

const LEVERS = 10;
/** the levers' row across the board, toward him (board space: after the flip, world offsets from the table's center) */
const ROW_Z = -0.12;
const SPACING = 0.19;
const LEVER_UP = -0.5;
const LEVER_DOWN = 0.95;
const FLIP_S = 1.4;
const WIRE_COLS = [C.blood, C.marker, C.gold, C.teal, C.pinkHi, C.white, C.brass, C.soulLo, C.cream, C.highHi];

export interface Duel {
  /** every lever mesh carries userData.lever (its index), for picking */
  pickables: Object3D[];
  /** put the top's cover on (its blank screen) before it turns over */
  cover(): void;
  /** turn the table over (true) or back (false); `onLand` fires when it comes down */
  flip(over: boolean, onLand?: () => void): void;
  /** is it over and still? */
  readonly flipped: boolean;
  readonly flipping: boolean;
  /** match the levers to the sim: pulled down, and a tag on what the team knows */
  setLevers(levers: { pulled: boolean; known: boolean; live: boolean }[]): void;
  hover(i: number): void;
  /** a lever goes down with a clunk (presentation timing); a live one throws an arc */
  pull(i: number, live: boolean): void;
  /** where a lever's knob is in the world */
  leverAt(i: number): Vector3;
  /** the Collector */
  reach(i: number): void;
  talk(on: boolean): void;
  shock(): void;
  die(): void;
  /** after a death: the pit boss comes through the staff door, says his piece (`speak`), drags
   *  the body out the way he came, and the door shuts (`done`) */
  funeral(on: { speak: () => void; done: () => void }): void;
  /** where the camera should look while the pit boss works, or null */
  focus(): Vector3 | null;
  reset(eyes: number): void;
  update(dt: number, time: number): { spark: boolean };
  dispose(): void;
}

export function buildDuel(scene: Scene, floor: Floor): Duel {
  const co = floor.collector;
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const mats = new Map<number, MeshLambertMaterial>();
  const flat = (role: number) => {
    let m = mats.get(role);
    if (!m) mats.set(role, (m = keep(new MeshLambertMaterial({ color: hexOf(role) }))));
    return m;
  };
  const glowMat = (role: number, k = 1) => keep(new MeshBasicMaterial({ color: new Color(hexOf(role)).multiplyScalar(k) }));
  const box = (w: number, h: number, d: number, mat: Material, parent: Object3D, x = 0, y = 0, z = 0) => {
    const m = new Mesh(keep(new BoxGeometry(w, h, d)), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const glow = (o: Object3D) => o.traverse((c) => c.layers.enable(GLOW));

  const root = new Group();
  root.name = 'duel';
  scene.add(root);

  // ---------------------------------------------------------------- the Collector
  const chairFront = co.chair.z1;
  const him = new Group();
  him.position.set(co.x, 0, chairFront + 0.13);
  root.add(him);
  const coat = flat(C.night), shade = flat(C.ink), pale = flat(C.dust);
  const hips = new Group();
  hips.position.y = 0.82;
  him.add(hips);
  const torso = box(0.62, 0.72, 0.24, coat, hips, 0, 0.36, 0);
  box(0.16, 0.5, 0.02, flat(C.collLo), hips, 0, 0.42, 0.125); // a waistcoat's stripe
  const neck = new Group();
  neck.position.y = 0.74;
  hips.add(neck);
  box(0.12, 0.1, 0.12, shade, neck, 0, 0.05, 0);
  const head = new Group();
  head.position.y = 0.1;
  neck.add(head);
  box(0.3, 0.34, 0.28, shade, head, 0, 0.17, 0);
  box(0.52, 0.03, 0.5, shade, head, 0, 0.36, 0);
  box(0.3, 0.26, 0.3, shade, head, 0, 0.5, 0);
  const band = box(0.31, 0.05, 0.31, flat(C.collLo), head, 0, 0.4, 0);
  const eyeMat = keep(new MeshBasicMaterial({ color: new Color(hexOf(C.coll)).multiplyScalar(1.6) }));
  const eyes = [-0.07, 0.07].map((x) => box(0.07, 0.035, 0.02, eyeMat, head, x, 0.2, 0.145));
  for (const e of eyes) glow(e);
  /** shoulders: each a pivot whose +Z points down the arm, so `lookAt` aims a straight arm */
  const arm = (side: number) => {
    const sh = new Group();
    sh.position.set(side * 0.36, 0.64, 0);
    hips.add(sh);
    box(0.12, 0.12, 0.98, coat, sh, 0, 0, 0.49);
    box(0.1, 0.05, 0.16, pale, sh, 0, 0, 1.02);
    return sh;
  };
  const shL = arm(-1), shR = arm(1);
  // resting: hands on the table's near edge to him
  const restL = new Vector3(co.x - 0.32, co.h + 0.04, co.z - co.r + 0.25);
  const restR = new Vector3(co.x + 0.32, co.h + 0.04, co.z - co.r + 0.25);

  // ---------------------------------------------------------------- the table top, and its underside
  const lid = new Group();
  const baseY = co.h + 0.035;
  lid.position.set(co.x, baseY, co.z);
  lid.visible = false;
  root.add(lid);
  const R = co.r - 0.08;
  const top = new Mesh(keep(new CylinderGeometry(R, R, 0.05, 24)), flat(C.collLo));
  lid.add(top);
  // the screen and its frame ride the top (the real ones hide while it's turned)
  {
    const sc = co.screen;
    const slab = box(sc.w, sc.h, 0.03, flat(C.ink), lid, 0, sc.y - baseY, sc.z - co.z);
    slab.rotation.x = -sc.tilt;
    const fr = box(sc.w + 0.06, sc.h + 0.06, 0.03, flat(C.woodLo), lid, 0, sc.y - baseY, sc.z - co.z - 0.02);
    fr.rotation.x = -sc.tilt;
  }
  const under = new Group();
  under.rotation.x = Math.PI;
  under.position.y = -0.026;
  lid.add(under);
  const plate = new Mesh(keep(new CylinderGeometry(R - 0.02, R - 0.02, 0.01, 24)), flat(C.night));
  plate.position.y = 0.005;
  under.add(plate);
  // the battery, toward him, and the junction box every wire runs into
  const batt = new Group();
  batt.position.set(0, 0, -0.62);
  under.add(batt);
  box(0.42, 0.26, 0.24, flat(C.ink), batt, 0, 0.13, 0);
  box(0.43, 0.08, 0.245, flat(C.blood), batt, 0, 0.15, 0);
  const terminals = [-0.12, 0.12].map((x) => {
    const t = new Mesh(keep(new CylinderGeometry(0.03, 0.03, 0.06, 8)), flat(C.brass));
    t.position.set(x, 0.29, 0);
    batt.add(t);
    return t;
  });
  const lamp = box(0.05, 0.04, 0.02, glowMat(C.low, 1.2), batt, 0.15, 0.2, 0.125);
  glow(lamp);
  const junction = box(0.6, 0.08, 0.12, flat(C.smoke), under, 0, 0.04, -0.36);
  // the feed from the junction to the battery: two thick cables
  for (const x of [-0.12, 0.12]) {
    const curve = new CatmullRomCurve3([new Vector3(x * 0.6, 0.06, -0.36), new Vector3(x * 0.8, 0.2, -0.48), new Vector3(x, 0.32, -0.62)]);
    under.add(new Mesh(keep(new TubeGeometry(curve, 12, 0.016, 5, false)), flat(x < 0 ? C.ink : C.blood)));
  }
  // the levers, each with a number plate and a wire knotted in with the rest
  const rnd = (() => {
    let s = 9301;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();
  const pivots: Group[] = [], knobs: Mesh[] = [], tags: Mesh[] = [], bases: Mesh[] = [];
  const pickables: Object3D[] = [];
  const knobMat = flat(C.blood), knobHot = keep(new MeshBasicMaterial({ color: hexOf(C.white) }));
  const tagLive = glowMat(C.blood, 1.3), tagDead = glowMat(C.soul, 1);
  const digits = digitTextures(keep);
  for (let i = 0; i < LEVERS; i++) {
    const x = (i - (LEVERS - 1) / 2) * SPACING;
    const base = box(0.11, 0.05, 0.11, flat(C.smoke), under, x, 0.035, ROW_Z);
    base.userData.lever = i;
    bases.push(base);
    const pv = new Group();
    pv.position.set(x, 0.06, ROW_Z);
    pv.rotation.x = LEVER_UP;
    under.add(pv);
    const handle = new Mesh(keep(new CylinderGeometry(0.012, 0.012, 0.22, 6)), flat(C.brassLo));
    handle.position.y = 0.11;
    handle.userData.lever = i;
    pv.add(handle);
    const knob = new Mesh(keep(new SphereGeometry(0.032, 8, 6)), knobMat);
    knob.position.y = 0.23;
    knob.userData.lever = i;
    pv.add(knob);
    pivots.push(pv);
    knobs.push(knob);
    pickables.push(base, handle, knob);
    const plateM = new Mesh(keep(new PlaneGeometry(0.075, 0.05)), keep(new MeshBasicMaterial({ map: digits[i] })));
    plateM.rotation.x = -Math.PI / 2;
    plateM.position.set(x, 0.012, ROW_Z + 0.1);
    under.add(plateM);
    const tag = box(0.05, 0.03, 0.03, tagDead, under, x, 0.075, ROW_Z - 0.07);
    tag.visible = false;
    glow(tag);
    tags.push(tag);
    // its wire: out toward you in a loop, across the others, and back into the junction
    const pts = [new Vector3(x, 0.02, ROW_Z + 0.04)];
    for (let k = 0; k < 3; k++) pts.push(new Vector3((rnd() - 0.5) * 1.5, 0.02 + rnd() * 0.05, ROW_Z + 0.12 + rnd() * 0.42 - k * 0.08));
    pts.push(new Vector3((rnd() - 0.5) * 0.9, 0.04, ROW_Z - 0.1));
    pts.push(new Vector3((i / (LEVERS - 1) - 0.5) * 0.5, 0.05, -0.31));
    const wire = new Mesh(keep(new TubeGeometry(new CatmullRomCurve3(pts), 40, 0.009, 4, false)), flat(WIRE_COLS[i % WIRE_COLS.length]));
    under.add(wire);
  }

  // ---------------------------------------------------------------- sparks and arcs
  const SPARKS = 48;
  const sparkMesh = new InstancedMesh(keep(new BoxGeometry(0.012, 0.012, 0.012)), glowMat(C.midHi, 1.4), SPARKS);
  sparkMesh.frustumCulled = false;
  sparkMesh.count = 0;
  glow(sparkMesh);
  root.add(sparkMesh);
  const sparks: { p: Vector3; v: Vector3; t: number }[] = [];
  const arcMat = keep(new LineBasicMaterial({ color: new Color(hexOf(C.soul)).multiplyScalar(2) }));
  const arcs: { line: Line; from: () => Vector3; to: () => Vector3; t: number }[] = [];
  const arcPool = Array.from({ length: 6 }, () => {
    const g = keep(new BufferGeometry());
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(12 * 3), 3));
    const l = new Line(g, arcMat);
    l.frustumCulled = false;
    l.visible = false;
    glow(l);
    root.add(l);
    return l;
  });
  const arc = (from: () => Vector3, to: () => Vector3, t: number) => {
    const line = arcPool.find((l) => !l.visible);
    if (!line) return;
    line.visible = true;
    arcs.push({ line, from, to, t });
  };
  const termWorld = () => terminals[Math.random() < 0.5 ? 0 : 1].getWorldPosition(new Vector3());
  const burst = (at: Vector3, n: number) => {
    for (let k = 0; k < n && sparks.length < SPARKS; k++) sparks.push({ p: at.clone(), v: new Vector3((Math.random() - 0.5) * 1.6, Math.random() * 1.8, (Math.random() - 0.5) * 1.6), t: 0.25 + Math.random() * 0.25 });
  };

  // he and the table top stand in front of neon: the glow pass draws them black (view.ts)
  him.traverse((o) => {
    if (o instanceof Mesh && !o.layers.isEnabled(GLOW)) o.userData.occluder = true;
  });
  top.userData.occluder = true;
  plate.userData.occluder = true;

  // ---------------------------------------------------------------- the staff door and the pit boss
  // the door in the back room's far right corner (seen from your seat), and the man who comes
  // through it when a Collector dies (DECISIONS #83)
  const DOOR = new Vector3(12, 0, -15.78);
  const doorFrame = new Group();
  doorFrame.position.copy(DOOR);
  root.add(doorFrame);
  box(0.12, 2.3, 0.14, flat(C.woodLo), doorFrame, -0.62, 1.15, 0);
  box(0.12, 2.3, 0.14, flat(C.woodLo), doorFrame, 0.62, 1.15, 0);
  box(1.36, 0.14, 0.14, flat(C.woodLo), doorFrame, 0, 2.3, 0);
  box(1.12, 2.2, 0.02, flat(C.ink), doorFrame, 0, 1.1, -0.06);
  const doorPivot = new Group();
  doorPivot.position.set(-0.55, 0, 0.02);
  doorFrame.add(doorPivot);
  box(1.1, 2.18, 0.06, flat(C.wood), doorPivot, 0.55, 1.09, 0);
  box(0.06, 0.06, 0.06, flat(C.brass), doorPivot, 1.0, 1.05, 0.05);
  const staff = box(0.5, 0.14, 0.03, glowMat(C.blood, 1.2), doorFrame, 0, 2.52, 0.03);
  glow(staff);
  // the corridor's light, spilling in while the door stands open (off the rest of the time)
  const spill = new PointLight(0xffd8a0, 0, 9, 2);
  spill.position.set(DOOR.x, 2, DOOR.z + 0.8);
  spill.visible = false;
  root.add(spill);
  const boss = new Group();
  boss.visible = false;
  root.add(boss);
  const bHips = new Group();
  bHips.position.y = 0.95;
  boss.add(bHips);
  const suit = flat(C.ink);
  box(0.5, 0.66, 0.26, suit, bHips, 0, 0.33, 0);
  box(0.14, 0.5, 0.02, flat(C.bone), bHips, 0, 0.38, -0.135);
  box(0.05, 0.3, 0.025, flat(C.gold), bHips, 0, 0.4, -0.14);
  const bHead = new Group();
  bHead.position.y = 0.72;
  bHips.add(bHead);
  box(0.24, 0.27, 0.24, flat(C.cream), bHead, 0, 0.13, 0);
  box(0.26, 0.08, 0.26, flat(C.ink), bHead, 0, 0.29, 0.01);
  const bLeg = (side: number) => {
    const hp = new Group();
    hp.position.set(side * 0.12, 0.95, 0);
    boss.add(hp);
    box(0.16, 0.93, 0.18, suit, hp, 0, -0.47, 0);
    box(0.16, 0.06, 0.26, flat(C.ink), hp, 0, -0.93, -0.04);
    return hp;
  };
  const legs = [bLeg(-1), bLeg(1)];
  const bArm = (side: number) => {
    const sh = new Group();
    sh.position.set(side * 0.31, 0.62, 0);
    bHips.add(sh);
    box(0.12, 0.66, 0.13, suit, sh, 0, -0.33, 0);
    box(0.1, 0.1, 0.1, flat(C.cream), sh, 0, -0.7, 0);
    return sh;
  };
  const bArms = [bArm(-1), bArm(1)];
  let funeralT = -1;
  let funeralOn: { speak: () => void; done: () => void } | null = null;
  let spoke = false;
  const outside = DOOR.clone().add(new Vector3(0, 0, -1.2));
  const inDoor = DOOR.clone().add(new Vector3(0, 0, 0.6));
  const side = new Vector3(co.x + 0.85, 0, chairFront + 0.35);
  const at = new Vector3();
  /** walk the boss from a to b over [t0, t1] of the errand; facing where he goes (or `back`ward) */
  const walk = (a: Vector3, b: Vector3, u: number, back = false) => {
    at.lerpVectors(a, b, u);
    boss.position.copy(at);
    const d = b.clone().sub(a);
    boss.rotation.y = Math.atan2(-d.x, -d.z) + (back ? Math.PI : 0);
    const sw = Math.sin(u * 14) * 0.45;
    legs[0].rotation.x = sw;
    legs[1].rotation.x = -sw;
    bArms[0].rotation.x = -sw * 0.6;
    bArms[1].rotation.x = sw * 0.6;
  };
  const still = () => {
    legs[0].rotation.x = legs[1].rotation.x = 0;
  };
  const runFuneral = (dt: number) => {
    funeralT += dt;
    const t = funeralT;
    const u = (a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
    // the door: open by 0.9 s, shut again after they're through
    doorPivot.rotation.y = t < 12.3 ? -1.35 * u(0, 0.9) : -1.35 * (1 - u(12.3, 13.2));
    spill.visible = t < 13.2;
    spill.intensity = 30 * (t < 12.3 ? u(0, 0.9) : 1 - u(12.3, 13.2));
    boss.visible = t > 0.6 && t < 12.2;
    if (t < 1) walk(outside, inDoor, u(0.4, 1));
    else if (t < 4) walk(inDoor, side, u(1, 4));
    else if (t < 6) {
      // he stops by the chair and turns to you
      still();
      boss.rotation.y = Math.PI;
      bHead.rotation.y = 0;
      if (!spoke && t > 4.3) {
        spoke = true;
        funeralOn?.speak();
      }
    } else if (t < 6.8) {
      // he takes the body under the arms
      boss.rotation.y = Math.PI / 2;
      bArms[0].rotation.x = bArms[1].rotation.x = -1.2 * u(6, 6.8);
    } else if (t < 11.5) {
      // and drags it out, backing toward the door, heels scraping
      const k = u(6.8, 11.5);
      const pts = [side, inDoor, outside];
      const seg = k < 0.82 ? 0 : 1;
      const kk = seg === 0 ? k / 0.82 : (k - 0.82) / 0.18;
      walk(pts[seg], pts[seg + 1], kk, true);
      bArms[0].rotation.x = bArms[1].rotation.x = -1.2;
      const back = new Vector3(Math.sin(boss.rotation.y), 0, Math.cos(boss.rotation.y));
      him.position.copy(boss.position).addScaledVector(back, -0.75);
      him.position.y = -0.35;
      him.rotation.set(-1.05, boss.rotation.y + Math.PI, 0);
      hips.rotation.x = 0.2;
      him.visible = t < 11.3;
    } else if (t > 13.2) {
      funeralT = -1;
      boss.visible = false;
      him.visible = false;
      const on = funeralOn;
      funeralOn = null;
      on?.done();
    }
  };

  // ---------------------------------------------------------------- state and motion
  let flipT = 0, flipTo = 0, onLand: (() => void) | undefined;
  const pullAnim: { i: number; t: number }[] = [];
  const target = pivots.map(() => LEVER_UP);
  let reachT = 0, reachI = -1;
  let talking = false, shockT = 0, dead = 0, sparkIn = 2, eyeColor: number = C.coll;
  const m4 = new Matrix4();
  const tmp = new Vector3();
  const aim = (sh: Group, at: Vector3) => {
    sh.lookAt(at);
  };

  const duel: Duel = {
    pickables,
    get flipped() {
      return flipT >= 1 && flipTo === 1;
    },
    get flipping() {
      return flipT !== flipTo;
    },
    cover() {
      lid.visible = true;
    },
    flip(over, land) {
      flipTo = over ? 1 : 0;
      onLand = land;
      lid.visible = true;
    },
    setLevers(levers) {
      levers.forEach((l, i) => {
        if (!pullAnim.some((a) => a.i === i)) target[i] = l.pulled ? LEVER_DOWN : LEVER_UP;
        tags[i].visible = l.known;
        tags[i].material = l.live ? tagLive : tagDead;
        bases[i].material = flat(l.pulled ? (l.live ? C.blood : C.ink) : C.smoke);
      });
    },
    hover(i) {
      knobs.forEach((k, j) => (k.material = j === i ? knobHot : knobMat));
    },
    pull(i, live) {
      pullAnim.push({ i, t: 0 });
      target[i] = LEVER_DOWN;
      if (live) {
        arc(termWorld, () => knobs[i].getWorldPosition(new Vector3()), 0.9);
        arc(termWorld, () => knobs[i].getWorldPosition(new Vector3()), 0.7);
        burst(knobs[i].getWorldPosition(new Vector3()), 14);
      }
    },
    leverAt(i) {
      return knobs[i].getWorldPosition(new Vector3());
    },
    funeral(on) {
      funeralOn = on;
      funeralT = 0;
      spoke = false;
    },
    focus() {
      if (funeralT < 0 || funeralT > 12.6) return null;
      // follow him from the door, and the body out of it
      return funeralT < 6.8 ? bHead.getWorldPosition(new Vector3()) : boss.position.clone().add(new Vector3(0, 1.1, 0));
    },
    reach(i) {
      reachI = i;
      reachT = 0.9;
    },
    talk(on) {
      talking = on;
    },
    shock() {
      shockT = 1.5;
      const at = () => head.getWorldPosition(new Vector3()).add(new Vector3((Math.random() - 0.5) * 0.8, -Math.random() * 0.8, 0.1));
      for (let k = 0; k < 3; k++) arc(() => head.getWorldPosition(new Vector3()), at, 1.2);
    },
    die() {
      shockT = 2.6;
      dead = 0.001;
      const at = () => head.getWorldPosition(new Vector3()).add(new Vector3((Math.random() - 0.5) * 1, -Math.random(), 0.1));
      for (let k = 0; k < 4; k++) arc(() => head.getWorldPosition(new Vector3()), at, 2.4);
    },
    reset(color) {
      dead = 0;
      shockT = 0;
      funeralT = -1;
      him.visible = true;
      him.position.set(co.x, 0, chairFront + 0.13);
      him.rotation.set(0, 0, 0);
      boss.visible = false;
      doorPivot.rotation.y = 0;
      eyeColor = color;
      eyeMat.color.copy(new Color(hexOf(color)).multiplyScalar(1.6));
      band.material = flat(color === C.coll ? C.collLo : color);
      for (const e of eyes) e.visible = true;
    },
    update(dt, time) {
      // the flip: up, over, down
      if (flipT !== flipTo) {
        flipT = flipTo > flipT ? Math.min(1, flipT + dt / FLIP_S) : Math.max(0, flipT - dt / FLIP_S);
        if (flipT === flipTo) {
          onLand?.();
          onLand = undefined;
          if (flipT === 0) lid.visible = false;
        }
      }
      const k = flipT * flipT * (3 - 2 * flipT);
      lid.position.y = baseY + Math.sin(flipT * Math.PI) * 0.55;
      lid.rotation.x = k * Math.PI;
      // the levers ease to where they belong; a pull snaps down
      pivots.forEach((pv, i) => {
        pv.rotation.x += (target[i] - pv.rotation.x) * Math.min(1, dt * 14);
      });
      for (const a of pullAnim) a.t += dt;
      while (pullAnim.length && pullAnim[0].t > 0.4) pullAnim.shift();

      // him: breathing, talking, reaching, convulsing, dying
      const breathe = Math.sin(time * 1.3) * 0.012;
      hips.position.y = 0.82 + breathe * 0.5;
      let lean = 0.05, headX = 0.05 + Math.sin(time * 0.5) * 0.03, headY = Math.sin(time * 0.37) * 0.08;
      if (talking && !dead) headX += Math.abs(Math.sin(time * 9)) * 0.06;
      // the arms rest on the table, unless one reaches for a lever
      let hl = restL.clone(), hr = restR.clone();
      if (reachT > 0) {
        reachT = Math.max(0, reachT - dt);
        const u = Math.sin((1 - reachT / 0.9) * Math.PI);
        lean = 0.05 + 0.45 * u;
        if (reachI >= 0) hr = restR.clone().lerp(knobs[reachI].getWorldPosition(tmp), u);
      }
      if (dead > 0 && shockT <= 0) {
        // slumped over the table, eyes going out
        dead = Math.min(1, dead + dt / 2.5);
        lean = 0.05 + 0.85 * dead;
        headX = 0.5 * dead;
        hl = restL.clone().add(new Vector3(-0.1, -0.02, 0.2 * dead));
        hr = restR.clone().add(new Vector3(0.15, -0.02, 0.3 * dead));
        eyeMat.color.copy(new Color(hexOf(eyeColor)).multiplyScalar(1.6 * (1 - dead)));
        if (dead >= 1) for (const e of eyes) e.visible = false;
      }
      hips.rotation.x = lean;
      head.rotation.set(headX, headY, 0);
      aim(shL, hl);
      aim(shR, hr);
      if (shockT > 0) {
        // the current through him: everything jerks, the eyes flare and blink
        shockT = Math.max(0, shockT - dt);
        const j = () => (Math.random() - 0.5) * 0.5;
        hips.rotation.x += j() * 0.4;
        hips.rotation.z = j() * 0.3;
        head.rotation.x += j();
        head.rotation.z = j();
        shL.rotation.x += j() * 2;
        shR.rotation.x += j() * 2;
        shL.rotation.y += j();
        shR.rotation.y += j();
        him.position.x = co.x + j() * 0.06;
        for (const e of eyes) e.visible = Math.random() < 0.6;
        eyeMat.color.copy(new Color(hexOf(Math.random() < 0.5 ? C.white : C.soul)).multiplyScalar(1.8));
        if (shockT === 0) {
          him.position.x = co.x;
          hips.rotation.z = 0;
          if (!dead) {
            for (const e of eyes) e.visible = true;
            eyeMat.color.copy(new Color(hexOf(eyeColor)).multiplyScalar(1.6));
          }
        }
        if (Math.random() < dt * 8) burst(torso.getWorldPosition(tmp), 4);
      } else him.position.x = co.x;

      // the pit boss's errand: the door, the walk, the word, the drag, the door again
      if (funeralT >= 0) runFuneral(dt);

      // the battery sparks now and then while the board is up
      let spark = false;
      if (flipT >= 1) {
        sparkIn -= dt;
        if (sparkIn <= 0) {
          sparkIn = 1.4 + Math.random() * 3;
          burst(termWorld(), 8 + Math.floor(Math.random() * 8));
          if (Math.random() < 0.5) arc(termWorld, termWorld, 0.15);
          spark = true;
        }
      }
      sparks.forEach((s) => {
        s.t -= dt;
        s.v.y -= dt * 6;
        s.p.addScaledVector(s.v, dt);
      });
      for (let n = sparks.length - 1; n >= 0; n--) if (sparks[n].t <= 0) sparks.splice(n, 1);
      sparks.forEach((s, n) => sparkMesh.setMatrixAt(n, m4.makeTranslation(s.p.x, s.p.y, s.p.z)));
      sparkMesh.count = sparks.length;
      sparkMesh.instanceMatrix.needsUpdate = true;
      // the arcs: a jagged line that redraws every frame between its ends
      for (let n = arcs.length - 1; n >= 0; n--) {
        const a = arcs[n];
        a.t -= dt;
        if (a.t <= 0) {
          a.line.visible = false;
          arcs.splice(n, 1);
          continue;
        }
        const f = a.from(), t = a.to();
        const pos = a.line.geometry.attributes.position as Float32BufferAttribute;
        for (let q = 0; q < 12; q++) {
          const u = q / 11;
          const jit = q === 0 || q === 11 ? 0 : 0.06;
          pos.setXYZ(q, f.x + (t.x - f.x) * u + (Math.random() - 0.5) * jit, f.y + (t.y - f.y) * u + (Math.random() - 0.5) * jit, f.z + (t.z - f.z) * u + (Math.random() - 0.5) * jit);
        }
        pos.needsUpdate = true;
        a.line.visible = Math.random() < 0.85;
      }
      return { spark };
    },
    dispose() {
      scene.remove(root);
      for (const d of disposables) d.dispose();
      sparkMesh.dispose();
    },
  };
  return duel;
}

/** The levers' number plates, 1 to 10, each its own little canvas. */
function digitTextures(keep: <T extends { dispose(): void }>(x: T) => T): CanvasTexture[] {
  return Array.from({ length: LEVERS }, (_, i) => {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 12;
    const x = c.getContext('2d')!;
    x.fillStyle = PALETTE[C.bone];
    x.fillRect(0, 0, 16, 12);
    x.fillStyle = PALETTE[C.ink];
    x.font = 'bold 10px monospace';
    x.textAlign = 'center';
    x.fillText(String(i + 1), 8, 10);
    const t = keep(new CanvasTexture(c));
    t.magFilter = t.minFilter = NearestFilter;
    t.colorSpace = SRGBColorSpace;
    return t;
  });
}
