// Floor 1, built in code from the same numbers the sim collides against (data/floors.ts): three
// rooms (THE FLOOR, THE LOUNGE, THE BACK ROOM; DECISIONS #65), their walls and arches, the six
// tables and the Collector's, the bar, the cage, and everything that makes it a casino you'd walk
// into: banks of slots with live screens and chasing lights, a roulette wheel that turns, card
// tables, a craps rail, booths, a piano, chandeliers, bare bulbs, velvet ropes, plants.
// Rules (THREEJS-NOTES 6, 7, 9, 11): Lambert + pixel textures, ≤ 8 point lights, emissive neon on
// the GLOW layer, every interactive table signed in its tier's color; static meshes merged per
// material; things that move are kept apart and turned by `update`.
import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DoubleSide, Group, HemisphereLight, InstancedMesh, Material, Matrix4,
  Mesh, MeshBasicMaterial, MeshLambertMaterial, NearestFilter, Object3D, type Side, PlaneGeometry, PointLight, Scene, SphereGeometry, SRGBColorSpace,
  TorusGeometry, Box3, Vector3,
} from 'three';
import type { Floor, Placement, Prop, Room as RoomDef } from '../data/floors';
import { TABLE_BY_ID, COLLECTOR_TABLE } from '../data/tables';
import { C, PALETTE, TIER_ROLE, hexOf, type Tier } from '../data/palette';
import type { Textures, TextureName } from './textures';
import { GLOW } from './view';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Neon is a tier's base color pushed until its brightest channel is exactly 1 (DECISIONS #16). */
const NEON = 4;
const SIGN_GLOW = 1.2;
/** sign texels per meter: a 96 px sign is 2.8 m wide, about 1:1 on screen from 10 m */
const SIGN_TPM = 34;
const WALL = 0.4;

function neonColor(tier: Tier): Color {
  const c = new Color(hexOf(TIER_ROLE[tier].base));
  return c.multiplyScalar(Math.min(NEON, 1 / Math.max(c.r, c.g, c.b)));
}

/** Multiply a geometry's UVs so a texture repeats every `sx` × `sy` meters. */
function uvRepeat<T extends BufferGeometry>(g: T, rx: number, ry: number): T {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rx, uv.getY(i) * ry);
  uv.needsUpdate = true;
  return g;
}

/** A wall plane `len` wide from height y0 to y1, its texture 2 m a tile across and `texH` m tall. */
function wallPlane(len: number, y0: number, y1: number, texH: number): PlaneGeometry {
  const g = new PlaneGeometry(len, y1 - y0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len / 2), (uv.getY(i) > 0.5 ? y1 : y0) / texH);
  uv.needsUpdate = true;
  return g;
}

export interface Room {
  group: Group;
  /** the screen mesh a table's panel is mapped onto, by table id */
  screens: Map<string, Mesh>;
  /** the room's lights, for the 0:00 drop */
  lights: PointLight[];
  /** which of `lights` is the Collector's violet one (it burns on at 0:00) */
  collLight: number;
  /**
   * Light only these rooms (DECISIONS #68): every point light costs every lit pixel, and under
   * software WebGL eight of them cost five times four; a room you can't see needs no lamps.
   */
  lightRooms(rooms: Set<string>): void;
  hemi: HemisphereLight;
  /** neon materials by tier, so a palette swap can recolor them */
  neon: Map<Tier, MeshBasicMaterial[]>;
  /** the lights' intensities as built, for the 0:00 drop */
  base: { lights: number[]; hemi: number };
  /** turn what turns: the roulette wheel, the slots' screens and lights, the chandeliers' sparkle */
  update(dt: number, time: number): void;
  dispose(): void;
}

export function buildRoom(scene: Scene, floor: Floor, tx: Textures): Room {
  const group = new Group();
  group.name = 'room';
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  // one material per (texture, tint): shared materials are what lets the meshes merge into one draw
  const lamberts = new Map<string, MeshLambertMaterial>();
  const lambert = (t: TextureName | null, color = 0xffffff, extra: Partial<MeshLambertMaterial> = {}) => {
    const k = `${t}|${color}|${JSON.stringify(extra)}`;
    let m = lamberts.get(k);
    if (!m) lamberts.set(k, (m = keep(new MeshLambertMaterial({ map: t ? tx.get(t) : null, color, ...extra }))));
    return m;
  };
  const flat = (role: number) => lambert(null, hexOf(role));
  const neon = new Map<Tier, MeshBasicMaterial[]>();
  /** materials whose meshes go on the glow layer (selective bloom: view.ts) */
  const glowing = new Set<Material>();
  const neonMat = (tier: Tier) => {
    const had = neon.get(tier)?.[0];
    if (had) return had;
    const m = keep(new MeshBasicMaterial({ color: neonColor(tier) }));
    glowing.add(m);
    neon.set(tier, [m]);
    return m;
  };
  /** a glowing material that isn't a tier's (gold, white, pink: STYLE.md) */
  const glowMats = new Map<string, MeshBasicMaterial>();
  const glow = (role: number, k = 1) => {
    const key = `${role}|${k}`;
    let m = glowMats.get(key);
    if (!m) {
      m = keep(new MeshBasicMaterial({ color: new Color(hexOf(role)).multiplyScalar(k) }));
      glowing.add(m);
      glowMats.set(key, m);
    }
    return m;
  };
  const add = (geo: BufferGeometry, mat: Material, x: number, y: number, z: number, name = '') => {
    keep(geo);
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z);
    m.name = name;
    group.add(m);
    return m;
  };
  /** things that move: updated each frame, never merged */
  const moving: { mesh: Object3D; spin: number }[] = [];

  // ---------------------------------------------------------------- rooms: floors, ceilings, walls
  const TEX_H: Record<RoomDef['wallTex'], number> = { wall_floor: 5, wall: 4, wall_back: 4 };
  for (const r of floor.rooms) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const fl = add(uvRepeat(new PlaneGeometry(w, d), w / 2, d / 2), lambert(r.floorTex), cx, 0, cz, `floor-${r.id}`);
    fl.rotation.x = -Math.PI / 2;
    fl.userData.occluder = true;
    // the ceiling takes no light (DECISIONS #23): a basic material, dimmed
    const ceilMat = keep(new MeshBasicMaterial({ map: tx.get(r.ceilingTex), color: r.id === 'floor' ? 0x9a9a9a : 0x707070 }));
    const ce = add(uvRepeat(new PlaneGeometry(w, d), w / (r.ceilingTex === 'ceiling_floor' ? 2 : 1), d / (r.ceilingTex === 'ceiling_floor' ? 2 : 1)), ceilMat, cx, r.ceiling, cz, `ceiling-${r.id}`);
    ce.rotation.x = Math.PI / 2;
    ce.userData.occluder = true;
    const wallMat = lambert(r.wallTex);
    const texH = TEX_H[r.wallTex];
    // each side, inset half a wall, with the arches cut out of it
    const sides: { along: 'x' | 'z'; at: number; from: number; to: number; ry: number; inward: number }[] = [
      { along: 'x', at: r.z0, from: r.x0, to: r.x1, ry: 0, inward: 1 },
      { along: 'x', at: r.z1, from: r.x0, to: r.x1, ry: Math.PI, inward: -1 },
      { along: 'z', at: r.x0, from: r.z0, to: r.z1, ry: Math.PI / 2, inward: 1 },
      { along: 'z', at: r.x1, from: r.z0, to: r.z1, ry: -Math.PI / 2, inward: -1 },
    ];
    for (const sd of sides) {
      const gaps = floor.doorways.filter((dw) => dw.along === sd.along && Math.abs((sd.along === 'x' ? dw.z : dw.x) - sd.at) < 0.01 && (sd.along === 'x' ? dw.x : dw.z) > sd.from && (sd.along === 'x' ? dw.x : dw.z) < sd.to);
      const pieces: [number, number, number, number][] = []; // [from, to, y0, y1]
      let at = sd.from;
      for (const dw of gaps.sort((a, b) => (sd.along === 'x' ? a.x - b.x : a.z - b.z))) {
        const c = sd.along === 'x' ? dw.x : dw.z;
        pieces.push([at, c - dw.w / 2, 0, r.ceiling]);
        pieces.push([c - dw.w / 2, c + dw.w / 2, dw.h, r.ceiling]);
        at = c + dw.w / 2;
      }
      pieces.push([at, sd.to, 0, r.ceiling]);
      for (const [a, b, y0, y1] of pieces) {
        if (b - a < 0.01 || y1 - y0 < 0.01) continue;
        const mid = (a + b) / 2, off = sd.inward * WALL / 2;
        const m = add(wallPlane(b - a, y0, y1, texH), wallMat, sd.along === 'x' ? mid : sd.at + off, (y0 + y1) / 2, sd.along === 'x' ? sd.at + off : mid, `wall-${r.id}`);
        m.rotation.y = sd.ry;
        m.userData.occluder = true;
      }
    }
  }
  // the arches: a brass frame round each doorway, its room's sign over it on the main floor's side
  for (const dw of floor.doorways) {
    for (const side of [1, -1]) {
      const z = dw.z + side * (WALL / 2 + 0.02);
      add(new BoxGeometry(0.12, dw.h, 0.06), flat(C.brass), dw.x - dw.w / 2 - 0.06, dw.h / 2, z, 'arch');
      add(new BoxGeometry(0.12, dw.h, 0.06), flat(C.brass), dw.x + dw.w / 2 + 0.06, dw.h / 2, z, 'arch');
      add(new BoxGeometry(dw.w + 0.24, 0.12, 0.06), flat(C.brass), dw.x, dw.h + 0.06, z, 'arch');
    }
    // the floor's threshold: a brass strip where the carpet changes
    add(new BoxGeometry(dw.w, 0.01, WALL), flat(C.brassLo), dw.x, 0.005, dw.z, 'threshold');
    sign(dw.sign as TextureName, 128, dw.x, dw.h + 0.85, dw.z + WALL / 2 + 0.03, false);
  }

  const main = floor.rooms[0];
  // the entrance: closed padded doors behind you (you are trapped down here)
  const door = add(new PlaneGeometry(floor.door.w, floor.door.h), lambert('door'), floor.door.x, floor.door.h / 2, main.z1 - WALL / 2 - 0.01, 'door');
  door.rotation.y = Math.PI;
  // the house's own sign on the north wall, between the arches
  sign('sign_vig', 160, 0, 3.6, main.z0 + WALL / 2 + 0.03, false, 40);
  // a gold cove light round the main floor's ceiling
  for (const [x, z, w, d] of [[0, main.z0 + 0.3, main.x1 - main.x0 - 0.6, 0.06], [0, main.z1 - 0.3, main.x1 - main.x0 - 0.6, 0.06], [main.x0 + 0.3, (main.z0 + main.z1) / 2, 0.06, main.z1 - main.z0 - 0.6], [main.x1 - 0.3, (main.z0 + main.z1) / 2, 0.06, main.z1 - main.z0 - 0.6]] as const) {
    add(new BoxGeometry(w, 0.05, d), glow(C.gold, 0.85), x, main.ceiling - 0.25, z, 'cove');
  }
  // sconces along the main floor's and the lounge's walls: warm glows that cost no light budget
  for (const r of floor.rooms.filter((r) => r.id !== 'back')) {
    const y = r.id === 'floor' ? 2.6 : 2.1;
    const step = 3.2;
    for (let x = r.x0 + 1.6; x < r.x1 - 1; x += step) {
      for (const [z, dz] of [[r.z0, 1], [r.z1, -1]] as const) {
        if (floor.doorways.some((dw) => Math.abs(dw.z - z) < 0.01 && Math.abs(dw.x - x) < dw.w / 2 + 0.6)) continue;
        if (r.id === 'floor' && z === r.z1 && Math.abs(x - floor.door.x) < 2) continue;
        if (r.id === 'floor' && z === r.z0 && Math.abs(x) < 3.2) continue;
        add(new BoxGeometry(0.16, 0.22, 0.08), glow(C.cream, 0.95), x, y, z + dz * (WALL / 2 + 0.04), 'sconce');
        add(new BoxGeometry(0.22, 0.04, 0.12), flat(C.brass), x, y - 0.13, z + dz * (WALL / 2 + 0.04), 'sconcebase');
      }
    }
  }
  // the lounge's cove is pink (not the mid tier's yellow: STYLE.md)
  const lounge = floor.rooms[1];
  add(new BoxGeometry(lounge.x1 - lounge.x0 - 0.6, 0.04, 0.05), glow(C.pink, 1), (lounge.x0 + lounge.x1) / 2, lounge.ceiling - 0.2, lounge.z1 - 0.3, 'cove');
  add(new BoxGeometry(lounge.x1 - lounge.x0 - 0.6, 0.04, 0.05), glow(C.pink, 1), (lounge.x0 + lounge.x1) / 2, lounge.ceiling - 0.2, lounge.z0 + 0.3, 'cove');

  // ---------------------------------------------------------------- the bar on the west wall
  const b = floor.bar;
  const bw = b.x1 - b.x0, bd = b.z1 - b.z0, bcx = (b.x0 + b.x1) / 2, bcz = (b.z0 + b.z1) / 2;
  add(uvRepeat(new BoxGeometry(bw, b.h, bd), 1, 2), lambert('wood'), bcx, b.h / 2, bcz, 'bar');
  add(uvRepeat(new BoxGeometry(bw + 0.2, 0.07, bd + 0.2), 1, 4), lambert('marble'), bcx, b.h + 0.035, bcz, 'bartop');
  add(new BoxGeometry(0.05, 0.05, bd), flat(C.brass), b.x1 + 0.18, 0.18, bcz, 'footrail');
  // the back bar: shelves of bottles, lit from under each shelf
  for (const sy of [1.5, 2.1, 2.7]) {
    add(new BoxGeometry(0.4, 0.04, bd), lambert('wood'), main.x0 + 0.4, sy, bcz, 'shelf');
    add(new BoxGeometry(0.02, 0.02, bd - 0.2), glow(C.gold, 0.7), main.x0 + 0.55, sy - 0.04, bcz, 'shelflight');
  }
  {
    const per = 16, n = per * 3;
    const geo = keep(new BoxGeometry(0.08, 0.28, 0.08));
    const mat = keep(new MeshLambertMaterial({ color: 0xffffff }));
    const bottles = new InstancedMesh(geo, mat, n);
    const roles = [C.teal, C.pinkHi, C.brass, C.markerLo, C.soulLo, C.cream, C.woodHi];
    const m4 = new Matrix4();
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / per), k = i % per;
      m4.makeTranslation(main.x0 + 0.38, 1.66 + row * 0.6, b.z0 + 0.4 + (k * (bd - 0.8)) / (per - 1));
      bottles.setMatrixAt(i, m4);
      bottles.setColorAt(i, new Color(hexOf(roles[(i * 3) % roles.length])));
    }
    bottles.name = 'bottles';
    group.add(bottles);
  }
  // a pink COCKTAILS sign over the bar (pink: no tier's hue)
  {
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 20;
    const x = c.getContext('2d')!;
    x.fillStyle = PALETTE[C.ink];
    x.fillRect(0, 0, 96, 20);
    x.strokeStyle = PALETTE[C.pinkHi];
    x.lineWidth = 2;
    x.strokeRect(2, 2, 92, 16);
    x.fillStyle = PALETTE[C.pinkHi];
    x.font = 'bold 10px monospace';
    x.textAlign = 'center';
    x.fillText('COCKTAILS', 48, 14);
    const t = keep(new CanvasTexture(c));
    t.magFilter = t.minFilter = NearestFilter;
    t.colorSpace = SRGBColorSpace;
    const m = keep(new MeshBasicMaterial({ map: t }));
    glowing.add(m);
    const s = add(new PlaneGeometry(96 / SIGN_TPM, 20 / SIGN_TPM), m, main.x0 + WALL / 2 + 0.05, 3.5, bcz, 'barsign');
    s.rotation.y = Math.PI / 2;
  }

  // ---------------------------------------------------------------- the cage by the entrance
  const cg = floor.cage;
  const cw = cg.x1 - cg.x0, cd = cg.z1 - cg.z0;
  const cageMat = lambert('cage', 0xffffff, { transparent: false, alphaTest: 0.5, side: DoubleSide });
  const front = add(uvRepeat(new PlaneGeometry(cd, cg.h), cd, cg.h / 2), cageMat, cg.x0, cg.h / 2, (cg.z0 + cg.z1) / 2, 'cagefront');
  front.rotation.y = -Math.PI / 2;
  for (const z of [cg.z0, cg.z1]) add(uvRepeat(new PlaneGeometry(cw, cg.h), cw, cg.h / 2), cageMat, (cg.x0 + cg.x1) / 2, cg.h / 2, z, 'cageside');
  add(new BoxGeometry(cw, 1.0, cd), lambert('wood'), (cg.x0 + cg.x1) / 2, 0.5, (cg.z0 + cg.z1) / 2, 'cagecounter');
  add(new BoxGeometry(0.04, 0.04, cd), glow(C.marker, 1), cg.x0 - 0.02, cg.h + 0.05, (cg.z0 + cg.z1) / 2, 'cageneon');

  // ---------------------------------------------------------------- pillars: marble, brass collars
  for (const p of floor.pillars) {
    add(uvRepeat(new CylinderGeometry(p.r, p.r, p.h, 12), 3, 5), lambert('marble'), p.x, p.h / 2, p.z, 'pillar');
    for (const y of [0.15, 1.1, p.h - 0.25]) add(new CylinderGeometry(p.r + 0.06, p.r + 0.06, y < 0.5 ? 0.3 : 0.1, 12), flat(C.brass), p.x, y, p.z, 'pillarband');
  }

  // ---------------------------------------------------------------- signs
  function sign(name: TextureName, pxW: number, x: number, y: number, z: number, rods = true, pxH = 32) {
    const w = pxW / SIGN_TPM, h = pxH / SIGN_TPM;
    const mat = keep(new MeshBasicMaterial({ map: tx.get(name), color: new Color(1, 1, 1).multiplyScalar(SIGN_GLOW) }));
    glowing.add(mat);
    const g = keep(new PlaneGeometry(w, h));
    for (const ry of rods ? [0, Math.PI] : [0]) {
      const m = new Mesh(g, mat);
      m.position.set(x, y, z + (ry ? -0.01 : 0.01));
      m.rotation.y = ry;
      m.name = name;
      group.add(m);
    }
    if (rods) {
      const top = floor.rooms.find((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)?.ceiling ?? floor.ceiling;
      for (const dx of [-w / 2 + 0.1, w / 2 - 0.1]) add(new BoxGeometry(0.02, top - y - h / 2, 0.02), flat(C.brass), x + dx, (top + y + h / 2) / 2, z, 'signrod');
    }
  }

  // ---------------------------------------------------------------- slot cabinets (the Bandit and its bank)
  // the decorative machines' screens: one live canvas for all of them, reels blurring and stopping
  const slotCanvas = document.createElement('canvas');
  slotCanvas.width = 48;
  slotCanvas.height = 28;
  const slotCtx = slotCanvas.getContext('2d')!;
  const slotTex = keep(new CanvasTexture(slotCanvas));
  slotTex.magFilter = slotTex.minFilter = NearestFilter;
  slotTex.colorSpace = SRGBColorSpace;
  const slotScreen = keep(new MeshBasicMaterial({ map: slotTex, color: 0xdddddd }));
  /** the toppers' chasing lights: three materials whose colors cycle */
  const chase = [C.pinkHi, C.gold, C.marker, C.soul].map((r) => {
    const m = keep(new MeshBasicMaterial({ color: new Color(hexOf(r)) }));
    glowing.add(m);
    return m;
  });
  const CHASE = [C.pinkHi, C.gold, C.marker, C.soul, C.white];
  function slotCabinet(x: number, z: number, w: number, d: number, live: boolean) {
    add(new BoxGeometry(w, 1.85, d), flat(C.night), x, 0.925, z, 'cabinet');
    add(new BoxGeometry(w + 0.04, 0.06, d + 0.04), flat(C.brass), x, 1.88, z, 'cabinettrim');
    // the lower face: buttons, the coin tray
    const face = add(new PlaneGeometry(w - 0.1, 0.85), lambert('slot_face'), x, 0.5, z + d / 2 + 0.005, 'slotface');
    face.rotation.y = 0;
    if (live) {
      // a decorative machine: the shared screen, a topper of chasing lights
      add(new PlaneGeometry(w - 0.24, 0.62), slotScreen, x, 1.3, z + d / 2 + 0.006, 'slotscreen');
    }
    add(new BoxGeometry(w, 0.32, d * 0.7), flat(C.ink), x, 2.1, z - d * 0.1, 'topper');
    for (let k = 0; k < 5; k++) add(new BoxGeometry(0.12, 0.12, 0.02), chase[(k + Math.round(x * 3)) % chase.length], x - w / 2 + 0.2 + k * ((w - 0.4) / 4), 2.1, z + d * 0.25 + 0.01, 'bulb');
    add(new CylinderGeometry(0.22, 0.22, 0.06, 10), flat(C.pink), x, 0.66, z + d / 2 + 0.75, 'stool');
    add(new CylinderGeometry(0.04, 0.04, 0.6, 6), flat(C.brass), x, 0.3, z + d / 2 + 0.75, 'stoolpost');
  }

  /** A decorative cabinet inside a turned group (the carousel), facing the group's +Z. */
  function slotCabinetIn(g: Group, w: number, d: number) {
    const part = (geo: BufferGeometry, mat: Material, x: number, y: number, z: number) => {
      const m = new Mesh(keep(geo), mat);
      m.position.set(x, y, z);
      g.add(m);
    };
    part(new BoxGeometry(w, 1.85, d), flat(C.night), 0, 0.925, 0);
    part(new BoxGeometry(w + 0.04, 0.06, d + 0.04), flat(C.brass), 0, 1.88, 0);
    part(new PlaneGeometry(w - 0.1, 0.85), lambert('slot_face'), 0, 0.5, d / 2 + 0.005);
    part(new PlaneGeometry(w - 0.2, 0.55), slotScreen, 0, 1.3, d / 2 + 0.006);
    for (let k = 0; k < 4; k++) part(new BoxGeometry(0.1, 0.1, 0.02), chase[k % chase.length], -w / 2 + 0.2 + k * ((w - 0.4) / 3), 2.0, d / 2 - 0.05);
    part(new CylinderGeometry(0.2, 0.2, 0.06, 10), flat(C.pink), 0, 0.66, d / 2 + 0.75);
    part(new CylinderGeometry(0.035, 0.035, 0.6, 6), flat(C.brass), 0, 0.3, d / 2 + 0.75);
  }
  // the progressive jackpot's ticker: gold numbers on black, counting up all night
  const jackCanvas = document.createElement('canvas');
  jackCanvas.width = 96;
  jackCanvas.height = 36;
  const jackCtx = jackCanvas.getContext('2d')!;
  const jackTex = keep(new CanvasTexture(jackCanvas));
  jackTex.magFilter = jackTex.minFilter = NearestFilter;
  jackTex.colorSpace = SRGBColorSpace;
  const jackpotMat = keep(new MeshBasicMaterial({ map: jackTex }));
  glowing.add(jackpotMat);
  let jackpot = 1284520;

  // ---------------------------------------------------------------- the tables you can play
  const screens = new Map<string, Mesh>();
  const screenOff = keep(new MeshBasicMaterial({ color: hexOf(C.ink) }));
  for (const pl of floor.tables) buildTable(pl);

  function buildTable(pl: Placement) {
    const def = TABLE_BY_ID.get(pl.table)!;
    const nm = neonMat(def.tier);
    if (pl.table === 'bandit') {
      slotCabinet(pl.x, pl.z, pl.w, pl.d, false);
      // its tier's neon on the crown and kick, well clear of its screen (DECISIONS #25, #45)
      add(new BoxGeometry(pl.w + 0.04, 0.04, 0.04), nm, pl.x, 1.92, pl.z + pl.d / 2, 'neon');
      add(new BoxGeometry(pl.w + 0.04, 0.04, 0.04), nm, pl.x, 0.1, pl.z + pl.d / 2, 'neon');
    } else {
      add(new BoxGeometry(pl.w, pl.h - 0.06, pl.d), lambert('wood'), pl.x, (pl.h - 0.06) / 2, pl.z, pl.table);
      add(uvRepeat(new BoxGeometry(pl.w - 0.14, 0.06, pl.d - 0.14), (pl.w - 0.14) * 2, (pl.d - 0.14) * 2), lambert('felt'), pl.x, pl.h - 0.03, pl.z, 'felt');
      add(new BoxGeometry(pl.w + 0.06, 0.06, 0.08), flat(C.brassLo), pl.x, pl.h - 0.01, pl.z + pl.d / 2, 'rail');
      // the neon rim: front and back edges in the tier color
      for (const dz of [pl.d / 2 + 0.05, -pl.d / 2]) add(new BoxGeometry(pl.w, 0.035, 0.035), nm, pl.x, pl.h - 0.04, pl.z + dz, 'neon');
      add(new CylinderGeometry(0.22, 0.22, 0.06, 10), flat(C.brass), pl.stand.x, 0.62, pl.stand.z - 0.25, 'stool');
      add(new CylinderGeometry(0.04, 0.04, 0.6, 6), flat(C.brass), pl.stand.x, 0.3, pl.stand.z - 0.25, 'stoolpost');
    }
    if (pl.screen) {
      const s = pl.screen;
      const m = add(new PlaneGeometry(s.w, s.h), screenOff, s.x, s.y, s.z, `screen-${pl.table}`);
      m.rotation.x = -s.tilt;
      if (pl.table !== 'bandit') {
        const frame = add(new BoxGeometry(s.w + 0.06, s.h + 0.06, 0.03), lambert('wood'), s.x, s.y, s.z, 'screenframe');
        frame.rotation.x = -s.tilt;
        frame.translateZ(-0.02);
        add(new BoxGeometry(0.06, s.y - s.h / 2, 0.06), flat(C.brass), s.x, (s.y - s.h / 2) / 2, s.z - 0.05, 'screenpost');
      }
      screens.set(pl.table, m);
    }
    sign(`sign_${pl.table}` as TextureName, 96, pl.x, pl.signY, pl.z - (pl.table === 'bandit' ? 0 : 0));
  }

  // ---------------------------------------------------------------- decorations
  const crystal: { x: number; y: number; z: number; big: boolean }[] = [];
  for (const p of floor.props) buildProp(p);

  function feltTable(p: Prop, shape: 'oval' | 'box', baize = true) {
    const w = p.w ?? 2, d = p.d ?? 1.2;
    const top = baize ? flat(C.baize) : lambert('felt');
    if (shape === 'oval') {
      const base = add(new CylinderGeometry(0.5, 0.5, 0.86, 16), lambert('wood'), p.x, 0.43, p.z, 'decotable');
      base.scale.set(w / 1, 1, d / 1);
      const t = add(new CylinderGeometry(0.5, 0.5, 0.05, 24), top, p.x, 0.88, p.z, 'decofelt');
      t.scale.set(w - 0.1, 1, d - 0.1);
      const rim = add(new TorusGeometry(0.5, 0.035, 4, 32), flat(C.woodLo), p.x, 0.9, p.z, 'decorim');
      rim.rotation.x = Math.PI / 2;
      rim.scale.set(w, d, 1);
    } else {
      add(new BoxGeometry(w, 0.84, d), lambert('wood'), p.x, 0.42, p.z, 'decotable');
      add(new BoxGeometry(w - 0.12, 0.05, d - 0.12), top, p.x, 0.865, p.z, 'decofelt');
      add(new BoxGeometry(w + 0.04, 0.08, 0.08), flat(C.woodLo), p.x, 0.9, p.z + d / 2, 'decorim');
      add(new BoxGeometry(w + 0.04, 0.08, 0.08), flat(C.woodLo), p.x, 0.9, p.z - d / 2, 'decorim');
    }
    // the chips on the felt are the crowd's own bets now, moving with their game (tableplay.ts)
  }

  function buildProp(p: Prop) {
    switch (p.kind) {
      case 'carousel': {
        // eight machines in a ring facing out, round a tower whose ticker counts the jackpot up
        const r = p.w ?? 1.5;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const g = new Group();
          g.position.set(p.x + Math.sin(a) * r, 0, p.z + Math.cos(a) * r);
          g.rotation.y = a;
          group.add(g);
          slotCabinetIn(g, 1.1, 0.9);
        }
        add(new CylinderGeometry(0.75, 0.9, 3.1, 12), flat(C.ink), p.x, 1.55, p.z, 'tower');
        add(new CylinderGeometry(0.95, 0.95, 0.1, 16), flat(C.brass), p.x, 3.15, p.z, 'towercap');
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + Math.PI / 8;
          const face = new Mesh(keep(new PlaneGeometry(1.1, 0.42)), jackpotMat);
          face.position.set(p.x + Math.sin(a) * 0.8, 2.6, p.z + Math.cos(a) * 0.8);
          face.rotation.y = a;
          face.name = 'anim-jackpot';
          group.add(face);
        }
        break;
      }
      case 'slot':
        slotCabinet(p.x, p.z, p.w ?? 1.4, p.d ?? 0.9, true);
        break;
      case 'roulette': {
        feltTable(p, 'oval');
        // the wheel at one end, turning
        const wx = p.x + (p.w ?? 2.8) / 2 - 0.55;
        add(new CylinderGeometry(0.42, 0.36, 0.14, 20), lambert('wood'), wx, 0.96, p.z, 'roulettebowl');
        const disc = new Mesh(keep(new CylinderGeometry(0.34, 0.34, 0.03, 37)), keep(new MeshLambertMaterial({ map: rouletteTexture(keep) })));
        disc.position.set(wx, 1.045, p.z);
        disc.name = 'anim-roulette';
        disc.userData.occluder = true;
        group.add(disc);
        moving.push({ mesh: disc, spin: 1.6 });
        add(new CylinderGeometry(0.03, 0.05, 0.12, 6), flat(C.brass), wx, 1.11, p.z, 'turret');
        break;
      }
      case 'cardtable':
        feltTable(p, 'oval');
        break;
      case 'poker':
        feltTable(p, 'oval');
        break;
      case 'craps': {
        feltTable(p, 'box');
        const w = p.w ?? 3, d = p.d ?? 1.6;
        // the raised rail all round
        for (const dz of [-d / 2, d / 2]) add(new BoxGeometry(w + 0.1, 0.24, 0.12), lambert('wood'), p.x, 1.0, p.z + dz, 'crapsrail');
        for (const dx of [-w / 2, w / 2]) add(new BoxGeometry(0.12, 0.24, d), lambert('wood'), p.x + dx, 1.0, p.z, 'crapsrail');
        break;
      }
      case 'booth': {
        const w = p.w ?? 1.2, d = p.d ?? 2.4;
        add(new BoxGeometry(0.5, 0.45, d), flat(C.indigoHi), p.x - w / 2 + 0.3, 0.225, p.z, 'boothseat');
        add(new BoxGeometry(0.15, 1.3, d), flat(C.indigo), p.x - w / 2 + 0.05, 0.65, p.z, 'boothback');
        add(new BoxGeometry(0.55, 0.06, d * 0.55), lambert('wood'), p.x + w / 2 - 0.25, 0.74, p.z, 'boothtable');
        add(new CylinderGeometry(0.03, 0.03, 0.7, 6), flat(C.brass), p.x + w / 2 - 0.25, 0.35, p.z, 'boothleg');
        // a candle on the table
        add(new BoxGeometry(0.05, 0.08, 0.05), glow(C.gold, 1), p.x + w / 2 - 0.25, 0.81, p.z, 'candle');
        break;
      }
      case 'piano': {
        const w = p.w ?? 1.6, d = p.d ?? 1.2;
        add(new BoxGeometry(w, 0.3, d), flat(C.ink), p.x, 0.85, p.z, 'piano');
        for (const dx of [-w / 2 + 0.1, w / 2 - 0.1]) add(new BoxGeometry(0.1, 0.7, 0.1), flat(C.ink), p.x + dx, 0.35, p.z, 'pianoleg');
        const lid = add(new BoxGeometry(w, 0.03, d), flat(C.night), p.x, 1.25, p.z - 0.1, 'pianolid');
        lid.rotation.x = -0.5;
        add(new BoxGeometry(w * 0.9, 0.04, 0.16), flat(C.white), p.x, 0.97, p.z + d / 2 - 0.05, 'keys');
        add(new CylinderGeometry(0.25, 0.25, 0.08, 10), flat(C.indigoHi), p.x, 0.5, p.z + d / 2 + 0.55, 'pianostool');
        break;
      }
      case 'chandelier': {
        const room = floor.rooms.find((r) => r.id === p.room)!;
        const big = p.room === 'floor';
        const y = room.ceiling - (big ? 1.3 : 0.95);
        add(new CylinderGeometry(0.02, 0.02, room.ceiling - y, 4), flat(C.brass), p.x, (room.ceiling + y) / 2, p.z, 'chainrod');
        for (const [r, dy] of big ? [[0.9, 0], [0.55, -0.25], [0.25, -0.5]] : [[0.55, 0], [0.3, -0.2]]) {
          const ring = add(new TorusGeometry(r, 0.025, 4, 24), flat(C.brass), p.x, y + dy, p.z, 'chandring');
          ring.rotation.x = Math.PI / 2;
          const n = Math.round(r * 18);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            crystal.push({ x: p.x + Math.cos(a) * r, y: y + dy - 0.08, z: p.z + Math.sin(a) * r, big });
          }
        }
        add(new SphereGeometry(big ? 0.18 : 0.12, 8, 6), glow(C.cream, 1), p.x, y - 0.1, p.z, 'chandcore');
        break;
      }
      case 'bulb': {
        const room = floor.rooms.find((r) => r.id === p.room)!;
        add(new CylinderGeometry(0.008, 0.008, 1.2, 3), flat(C.ink), p.x, room.ceiling - 0.6, p.z, 'cord');
        add(new CylinderGeometry(0.05, 0.3, 0.2, 10, 1, true), flat(C.night), p.x, room.ceiling - 1.25, p.z, 'shade');
        add(new SphereGeometry(0.06, 6, 4), glow(C.cream, 1), p.x, room.ceiling - 1.32, p.z, 'bulb');
        break;
      }
      case 'rope': {
        const len = p.d ?? 4;
        for (let i = 0; i <= 2; i++) {
          const z = p.z - len / 2 + (i * len) / 2;
          add(new CylinderGeometry(0.04, 0.06, 0.95, 8), flat(C.brass), p.x, 0.475, z, 'ropepost');
          add(new SphereGeometry(0.06, 6, 4), flat(C.brass), p.x, 0.98, z, 'ropeknob');
        }
        for (let i = 0; i < 2; i++) {
          const rope = add(new CylinderGeometry(0.025, 0.025, len / 2, 5), flat(C.pink), p.x, 0.82, p.z - len / 4 + (i * len) / 2, 'rope');
          rope.rotation.x = Math.PI / 2;
        }
        break;
      }
      case 'plant':
        add(new CylinderGeometry(0.28, 0.22, 0.55, 10), flat(C.brassLo), p.x, 0.275, p.z, 'pot');
        add(new SphereGeometry(0.45, 7, 5), flat(C.baizeLo), p.x, 0.95, p.z, 'leaves');
        add(new SphereGeometry(0.3, 6, 4), flat(C.baize), p.x + 0.12, 1.3, p.z - 0.05, 'leaves');
        break;
      case 'stool':
        add(new CylinderGeometry(0.2, 0.2, 0.06, 10), flat(C.pink), p.x, 0.72, p.z, 'stool');
        add(new CylinderGeometry(0.035, 0.035, 0.7, 6), flat(C.brass), p.x, 0.35, p.z, 'stoolpost');
        break;
    }
  }

  // the chandeliers' crystals: one instanced draw, twinkling
  const crystalMesh = new InstancedMesh(keep(new BoxGeometry(0.05, 0.12, 0.05)), glow(C.white, 1), crystal.length);
  {
    const m4 = new Matrix4();
    crystal.forEach((c, i) => {
      m4.makeTranslation(c.x, c.y, c.z);
      crystalMesh.setMatrixAt(i, m4);
      crystalMesh.setColorAt(i, new Color(hexOf(i % 3 ? C.cream : C.white)));
    });
    crystalMesh.name = 'crystals';
    group.add(crystalMesh);
  }

  // ---------------------------------------------------------------- the Collector's table, in the back room
  const co = floor.collector;
  add(uvRepeat(new CylinderGeometry(co.r, co.r * 0.9, co.h - 0.05, 16), 6, 1), lambert('wood'), co.x, (co.h - 0.05) / 2, co.z, 'collector');
  add(new CylinderGeometry(co.r - 0.08, co.r - 0.08, 0.05, 24), lambert(null, hexOf(C.collLo)), co.x, co.h - 0.02, co.z, 'collectorfelt');
  for (const [y, r] of [[co.h, co.r], [0.04, co.r * 0.9]] as const) {
    const ring = add(new TorusGeometry(r, 0.025, 4, 32), neonMat('coll'), co.x, y, co.z, 'neon');
    ring.rotation.x = Math.PI / 2;
  }
  // his chair, from floor data (a collider), and his eyes in the dark above it
  const ch = co.chair;
  const chairZ = (ch.z0 + ch.z1) / 2 + 0.2;
  add(new BoxGeometry(ch.x1 - ch.x0 - 0.1, 2.5, ch.z1 - ch.z0 - 0.1), lambert('wood', hexOf(C.smoke)), co.x, 1.25, chairZ - 0.2, 'collectorchair');
  add(new BoxGeometry(ch.x1 - ch.x0, 0.1, ch.z1 - ch.z0), flat(C.brass), co.x, 2.5, chairZ - 0.2, 'collectorchairtop');
  const eyes = keep(new MeshBasicMaterial({ color: neonColor('coll') }));
  glowing.add(eyes);
  for (const dx of [-0.11, 0.11]) add(new BoxGeometry(0.07, 0.035, 0.02), eyes, co.x + dx, 1.62, chairZ - 0.06, 'eyes');
  sign('sign_collector', 128, co.x, co.signY, co.z);
  {
    const sc = co.screen;
    const m = add(new PlaneGeometry(sc.w, sc.h), screenOff, sc.x, sc.y, sc.z, 'screen-collector');
    m.rotation.x = -sc.tilt;
    const fr = add(new BoxGeometry(sc.w + 0.06, sc.h + 0.06, 0.03), lambert('wood'), sc.x, sc.y, sc.z, 'screenframe');
    fr.rotation.x = -sc.tilt;
    fr.translateZ(-0.02);
    screens.set('collector', m);
  }

  // ---------------------------------------------------------------- light: a dim hemisphere, ≤ 8 points
  // a little brighter than one room was: a popular casino, not a cellar (the back room stays dark)
  const hemi = new HemisphereLight(hexOf(C.wallHi), hexOf(C.carpetLo), 2.4);
  group.add(hemi);
  const lights: PointLight[] = [];
  const lightRoom: string[] = [];
  const lamp = (color: number, x: number, z: number, y: number, i: number, range = 16) => {
    const l = new PointLight(color, i, range, 2);
    l.position.set(x, y, z);
    group.add(l);
    lights.push(l);
    lightRoom.push(floor.rooms.find((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)?.id ?? 'floor');
    return lights.length - 1;
  };
  // THE FLOOR: warm and bright under the chandeliers, a lamp over the bar
  lamp(0xffe2b8, -3, 9.5, 3.6, 75, 22);
  lamp(0xffe2b8, 3, 3.5, 3.6, 70, 22);
  // THE LOUNGE: soft and warm-pink
  lamp(0xffc0d8, -7.2, -7.8, 3.2, 60, 14);
  lamp(0xffd8b0, -6, -13, 3.2, 40, 11);
  // THE BACK ROOM: two dirty bulbs over the blood tables, the Collector's violet
  lamp(0xffb070, 7.3, -6.6, 2.8, 34, 12);
  const collLight = lamp(hexOf(C.coll), co.x, co.z, 2.6, 24, 10);
  if (lights.length > 8) throw new Error(`room has ${lights.length} point lights; the budget is 8`);

  // the carousel's turned groups: bake their children into the room so they merge like the rest
  for (const g of [...group.children]) {
    if (!(g instanceof Group)) continue;
    g.updateMatrixWorld(true);
    for (const c of [...g.children]) {
      c.applyMatrix4(g.matrixWorld);
      group.add(c);
    }
    group.remove(g);
  }
  // split the room into one group per room (each mesh by where it stands; the walls between and the
  // arches go with the main floor), merged per material within each, so a room you can't see costs
  // nothing: drawing all three behind each other was most of the frame (DECISIONS #68)
  const roomGroups = new Map<string, Group>();
  for (const r of floor.rooms) {
    const g = new Group();
    g.name = `room-${r.id}`;
    roomGroups.set(r.id, g);
  }
  const box = new Box3(), at = new Vector3();
  for (const o of [...group.children]) {
    if (!(o instanceof Mesh)) continue;
    box.setFromObject(o).getCenter(at);
    const r = floor.rooms.find((rr) => at.x > rr.x0 + 0.05 && at.x < rr.x1 - 0.05 && at.z > rr.z0 + 0.05 && at.z < rr.z1 - 0.05);
    roomGroups.get(r?.id ?? 'floor')!.add(o);
  }
  for (const g of roomGroups.values()) {
    group.add(g);
    mergeByMaterial(g, keep);
    glowBlockers(g, glowing, keep);
  }
  group.traverse((o) => {
    if (o instanceof Mesh && glowing.has(o.material as Material)) o.layers.enable(GLOW);
  });
  scene.add(group);
  const base = { lights: lights.map((l) => l.intensity), hemi: hemi.intensity };

  // ---------------------------------------------------------------- what moves
  let screenT = 0;
  const reels = [0, 0, 0];
  return {
    group, screens, lights, collLight, hemi, neon, base,
    lightRooms(rooms) {
      lights.forEach((l, i) => (l.visible = rooms.has(lightRoom[i])));
      for (const [id, g] of roomGroups) g.visible = rooms.has(id);
    },
    update(dt, time) {
      for (const mv of moving) mv.mesh.rotation.y += mv.spin * dt;
      // the slots' screens: three reels blurring, landing, a win line now and then
      screenT += dt;
      // a canvas upload stalls a software renderer: the screens change 5 times a second, not 11
      if (screenT > 0.2) {
        screenT = 0;
        const c = slotCtx;
        c.fillStyle = PALETTE[C.ink];
        c.fillRect(0, 0, 48, 28);
        const phase = time % 3;
        for (let r = 0; r < 3; r++) {
          const x = 2 + r * 15;
          c.fillStyle = PALETTE[C.bone];
          c.fillRect(x, 3, 13, 22);
          if (phase < 1 + r * 0.4) reels[r] = Math.floor(Math.random() * 4);
          const col = [C.pink, C.marker, C.gold, C.teal][reels[r]];
          c.fillStyle = PALETTE[col];
          if (phase < 1 + r * 0.4) for (let k = 0; k < 3; k++) c.fillRect(x + 3, 4 + ((k * 7 + Math.floor(time * 40)) % 20), 7, 3);
          else c.fillRect(x + 3, 10, 7, 8);
        }
        if (phase > 2.4) {
          c.fillStyle = PALETTE[C.gold];
          c.fillRect(1, 13, 46, 2);
        }
        slotTex.needsUpdate = true;
      }
      // the jackpot ticks up
      jackpot += Math.floor(dt * 37 + Math.random() * 3);
      if (Math.floor(time) !== Math.floor(time - dt)) {
        const c = jackCtx;
        c.fillStyle = PALETTE[C.ink];
        c.fillRect(0, 0, 96, 36);
        c.strokeStyle = PALETTE[C.gold];
        c.strokeRect(1.5, 1.5, 93, 33);
        c.fillStyle = PALETTE[C.pinkHi];
        c.font = 'bold 8px monospace';
        c.textAlign = 'center';
        c.fillText('PROGRESSIVE JACKPOT', 48, 12);
        c.fillStyle = PALETTE[Math.floor(time) % 2 ? C.gold : C.white];
        c.font = 'bold 13px monospace';
        c.fillText('$' + jackpot.toLocaleString('en-US'), 48, 28);
        jackTex.needsUpdate = true;
      }
      // the toppers' lights chase
      const step = Math.floor(time * 6);
      chase.forEach((m, i) => m.color.set(hexOf(CHASE[(step + i) % CHASE.length])));
      // the crystals twinkle
      if (crystal.length && Math.floor(time * 10) % 2 === 0) {
        const i = Math.floor(Math.random() * crystal.length);
        crystalMesh.setColorAt(i, new Color(hexOf([C.white, C.cream, C.gold][Math.floor(Math.random() * 3)])));
        if (crystalMesh.instanceColor) crystalMesh.instanceColor.needsUpdate = true;
      }
    },
    dispose() {
      scene.remove(group);
      group.traverse((o: Object3D) => {
        if (o instanceof InstancedMesh) o.dispose();
      });
      for (const d of disposables) d.dispose();
    },
  };
}

/** A roulette wheel's face: 37 pockets, red and black round a single zero. */
function rouletteTexture(keep: <T extends { dispose(): void }>(x: T) => T) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = PALETTE[C.woodLo];
  x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 37; i++) {
    x.fillStyle = PALETTE[i === 0 ? C.teal : i % 2 ? C.blood : C.ink];
    x.beginPath();
    x.moveTo(32, 32);
    x.arc(32, 32, 30, (i / 37) * Math.PI * 2, ((i + 1) / 37) * Math.PI * 2);
    x.fill();
  }
  x.fillStyle = PALETTE[C.brassLo];
  x.beginPath();
  x.arc(32, 32, 12, 0, Math.PI * 2);
  x.fill();
  const t = keep(new CanvasTexture(c));
  t.magFilter = t.minFilter = NearestFilter;
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * One draw per material: every static mesh sharing a material is baked into one geometry
 * (≤ 80 draw calls, THREEJS-NOTES rule 11). Screens and moving things stay separate.
 */
export function mergeByMaterial(group: Group, keep: <T extends { dispose(): void }>(x: T) => T) {
  group.updateMatrixWorld(true);
  // (meshes here sit straight in the room group at the origin: their matrixWorld is their own)
  const byMat = new Map<Material, Mesh[]>();
  for (const o of [...group.children]) {
    if (!(o instanceof Mesh) || o instanceof InstancedMesh || o.name.startsWith('screen-') || o.name.startsWith('anim-') || Array.isArray(o.material)) continue;
    const list = byMat.get(o.material) ?? [];
    list.push(o);
    byMat.set(o.material, list);
  }
  for (const [mat, meshes] of byMat) {
    if (meshes.length < 2) continue;
    const geos = meshes.map((m) => {
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
      g.clearGroups();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      return g;
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    for (const m of meshes) group.remove(m);
    // centered on its own middle, so the renderer can sort it front to back (fewer pixels drawn twice)
    merged.computeBoundingBox();
    const c = merged.boundingBox!.getCenter(new Vector3());
    merged.translate(-c.x, -c.y, -c.z);
    const one = new Mesh(keep(merged), mat);
    one.position.copy(c);
    one.name = 'merged:' + meshes[0].name;
    one.userData.occluder = meshes.some((m) => m.userData.occluder);
    group.add(one);
  }
}

/**
 * The glow pass's blockers (view.ts): every static, opaque, unlit-by-neon mesh of a room baked into
 * one black mesh per face side, drawn only in that pass. Neon behind a table, a panel, a cabinet or
 * a pillar stays hidden in the bloom as it is in the frame: before this only the walls blocked it,
 * so a sign across the room glowed straight through a table's odds card. One or two draws a room.
 */
export function glowBlockers(group: Group, glowing: Set<Material>, keep: <T extends { dispose(): void }>(x: T) => T) {
  group.updateMatrixWorld(true);
  const bySide = new Map<Side, BufferGeometry[]>();
  for (const o of group.children) {
    if (!(o instanceof Mesh) || o instanceof InstancedMesh || o.name.startsWith('anim-') || Array.isArray(o.material)) continue;
    const mat = o.material as Material;
    // see-through things (the cage's grille, smoke) let the glow through, as they let the room through
    if (glowing.has(mat) || mat.transparent || mat.alphaTest > 0 || !mat.depthWrite) continue;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
    g.clearGroups();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    const list = bySide.get(mat.side) ?? [];
    list.push(g);
    bySide.set(mat.side, list);
    // the blocker stands in for it: the glow pass skips the mesh itself
    o.userData.occluder = false;
  }
  for (const [side, geos] of bySide) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const m = new Mesh(keep(merged), keep(new MeshBasicMaterial({ color: 0x000000, side })));
    m.name = 'glowblock';
    m.visible = false;
    m.userData.glowBlock = true;
    group.add(m);
  }
}

/**
 * The 0:00 drop (THREEJS-NOTES rule 9): `t` 0 = the night's lights, 1 = midnight, every lamp out
 * but the Collector's violet one, which burns a little hotter.
 */
export function setMidnight(room: Room, t: number) {
  room.lights.forEach((l, i) => {
    const b = room.base.lights[i];
    l.intensity = i === room.collLight ? b * (1 + 0.3 * t) : b * (1 - 0.94 * t);
  });
  room.hemi.intensity = room.base.hemi * (1 - 0.75 * t);
}

/** Recolor the neon after a palette swap. */
export function recolorNeon(room: Room) {
  for (const [tier, mats] of room.neon) for (const m of mats) m.color.copy(neonColor(tier));
}

export { COLLECTOR_TABLE };
