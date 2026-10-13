// Floor 1's room, built in code from the same numbers the sim collides against (data/floors.ts).
// Placeholder geometry until Milestone 1 step 10 brings Blender-built models; the rules already
// hold: Lambert + pixel textures, ≤ 8 point lights, emissive neon strips in the four tier colors,
// a sign over every table with its tier color and loss glyph (THREEJS-NOTES rules 6, 7, 9).
import {
  BoxGeometry, BufferGeometry, Color, CylinderGeometry, DoubleSide, Group, HemisphereLight, InstancedMesh, Material, Matrix4,
  Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, PlaneGeometry, PointLight, Scene, TorusGeometry,
} from 'three';
import type { Floor, Placement } from '../data/floors';
import { TABLE_BY_ID, COLLECTOR_TABLE } from '../data/tables';
import { C, TIER_ROLE, hexOf, type Tier } from '../data/palette';
import type { Textures, TextureName } from './textures';
import { GLOW } from './view';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Neon is emissive and pushed past 1.0 so the bloom threshold catches it and nothing else. */
/** Kept near 1 so the brightest channel never clips and the tier hue survives the output pass. */
const NEON = 4;
const SIGN_GLOW = 1.2;
/** sign texels per meter: a 96 px sign is 2.8 m wide, about 1:1 on screen from 10 m */
const SIGN_TPM = 34;

/** A tier's neon: its base color pushed until the brightest channel is exactly 1, so it is as
 *  bright as it can be without clipping toward white (the hue is the message). */
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

export interface Room {
  group: Group;
  /** the screen mesh a table's panel is mapped onto, by table id */
  screens: Map<string, Mesh>;
  /** the room's lights, for the 0:00 drop (Milestone 1) */
  lights: PointLight[];
  hemi: HemisphereLight;
  /** neon materials by tier, so a palette swap can recolor them */
  neon: Map<Tier, MeshBasicMaterial[]>;
  /** the lights' intensities as built, for the 0:00 drop */
  base: { lights: number[]; hemi: number };
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
  const neon = new Map<Tier, MeshBasicMaterial[]>();
  /** materials whose meshes go on the glow layer (selective bloom: view.ts) */
  const glowing = new Set<Material>();
  const neonMat = (tier: Tier) => {
    const had = neon.get(tier)?.[0];
    if (had) return had;
    const m = keep(new MeshBasicMaterial({ color: neonColor(tier) }));
    glowing.add(m);
    if (!neon.has(tier)) neon.set(tier, []);
    neon.get(tier)!.push(m);
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

  const W = floor.w, D = floor.d, H = floor.ceiling;
  // ---- shell: carpet, ceiling, four walls (single-sided, facing in)
  const carpet = add(uvRepeat(new PlaneGeometry(W, D), W / 2, D / 2), lambert('carpet'), 0, 0, 0, 'carpet');
  carpet.rotation.x = -Math.PI / 2;
  // the ceiling takes no light: a lamp a meter under it would bloom a haze over the signs
  const ceil = add(uvRepeat(new PlaneGeometry(W, D), W, D), keep(new MeshBasicMaterial({ map: tx.get('ceiling'), color: 0x808080 })), 0, H, 0, 'ceiling');
  ceil.rotation.x = Math.PI / 2;
  const wallMat = lambert('wall');
  const wall = (len: number, x: number, z: number, ry: number) => {
    const m = add(uvRepeat(new PlaneGeometry(len, H), len / 2, 1), wallMat, x, H / 2, z, 'wall');
    m.rotation.y = ry;
  };
  wall(W, 0, -D / 2, 0);
  wall(W, 0, D / 2, Math.PI);
  wall(D, -W / 2, 0, Math.PI / 2);
  wall(D, W / 2, 0, -Math.PI / 2);
  // the door you came in by (closed: you are trapped down here)
  const door = add(new PlaneGeometry(floor.door.w, floor.door.h * 1.12), lambert('door'), floor.door.x, (floor.door.h * 1.12) / 2, D / 2 - 0.01, 'door');
  door.rotation.y = Math.PI;

  // ---- the bar on the west wall: a counter, a brass rail, a back shelf of bottles
  const b = floor.bar;
  const bw = b.x1 - b.x0, bd = b.z1 - b.z0;
  add(uvRepeat(new BoxGeometry(bw, b.h, bd), 1, 1), lambert('wood'), (b.x0 + b.x1) / 2, b.h / 2, (b.z0 + b.z1) / 2, 'bar');
  add(new BoxGeometry(bw + 0.1, 0.06, bd + 0.1), lambert('brass'), (b.x0 + b.x1) / 2, b.h + 0.03, (b.z0 + b.z1) / 2, 'bartop');
  add(new BoxGeometry(0.35, 0.05, bd), lambert('wood'), -W / 2 + 0.2, 1.7, (b.z0 + b.z1) / 2, 'shelf');
  {
    const n = 14;
    const geo = keep(new BoxGeometry(0.09, 0.3, 0.09));
    const mat = keep(new MeshLambertMaterial({ color: 0xffffff }));
    const bottles = new InstancedMesh(geo, mat, n);
    const roles = [C.lowLo, C.highLo, C.brass, C.markerLo, C.collLo, C.soulLo];
    const m4 = new Matrix4();
    for (let i = 0; i < n; i++) {
      m4.makeTranslation(-W / 2 + 0.25, 1.88, b.z0 + 0.4 + (i * (bd - 0.8)) / (n - 1));
      bottles.setMatrixAt(i, m4);
      bottles.setColorAt(i, new Color(hexOf(roles[i % roles.length])));
    }
    bottles.name = 'bottles';
    group.add(bottles);
  }

  // ---- the cage on the east wall: a booth of bars, a counter window, a marker-blue strip
  const cg = floor.cage;
  const cw = cg.x1 - cg.x0, cd = cg.z1 - cg.z0;
  const cageMat = lambert('cage', 0xffffff, { transparent: false, alphaTest: 0.5, side: DoubleSide });
  const front = add(uvRepeat(new PlaneGeometry(cd, cg.h), cd / 1, cg.h / 2), cageMat, cg.x0, cg.h / 2, (cg.z0 + cg.z1) / 2, 'cagefront');
  front.rotation.y = -Math.PI / 2;
  for (const z of [cg.z0, cg.z1]) add(uvRepeat(new PlaneGeometry(cw, cg.h), cw, cg.h / 2), cageMat, (cg.x0 + cg.x1) / 2, cg.h / 2, z, 'cageside');
  add(new BoxGeometry(cw, 1.0, cd), lambert('wood'), (cg.x0 + cg.x1) / 2, 0.5, (cg.z0 + cg.z1) / 2, 'cagecounter');
  const cageNeon = keep(new MeshBasicMaterial({ color: new Color(hexOf(C.marker)) }));
  glowing.add(cageNeon);
  add(new BoxGeometry(0.04, 0.04, cd), cageNeon, cg.x0 - 0.02, cg.h + 0.05, (cg.z0 + cg.z1) / 2, 'cageneon');

  // ---- pillars
  for (const p of floor.pillars) {
    add(uvRepeat(new CylinderGeometry(p.r, p.r, p.h, 8), 2, 2), lambert('wood'), p.x, p.h / 2, p.z, 'pillar');
    add(new CylinderGeometry(p.r + 0.04, p.r + 0.04, 0.08, 8), lambert('brass'), p.x, 1.1, p.z, 'pillarband');
  }

  // ---- the tables
  const screens = new Map<string, Mesh>();
  const screenOff = keep(new MeshBasicMaterial({ color: hexOf(C.ink) }));
  const signGeo = new Map<number, PlaneGeometry>();
  const sign = (name: TextureName, pxW: number, x: number, y: number, z: number) => {
    const w = pxW / SIGN_TPM, h = 32 / SIGN_TPM;
    let g = signGeo.get(pxW);
    if (!g) signGeo.set(pxW, (g = keep(new PlaneGeometry(w, h))));
    const mat = keep(new MeshBasicMaterial({ map: tx.get(name), color: new Color(1, 1, 1).multiplyScalar(SIGN_GLOW) }));
    glowing.add(mat);
    for (const ry of [0, Math.PI]) {
      const m = new Mesh(g, mat);
      m.position.set(x, y, z + (ry ? -0.01 : 0.01));
      m.rotation.y = ry;
      m.name = name;
      group.add(m);
    }
    // the hanging rods
    for (const dx of [-w / 2 + 0.1, w / 2 - 0.1]) add(new BoxGeometry(0.02, H - y - h / 2, 0.02), lambert('brass'), x + dx, (H + y + h / 2) / 2, z);
  };

  for (const pl of floor.tables) buildTable(pl);

  function buildTable(pl: Placement) {
    const def = TABLE_BY_ID.get(pl.table)!;
    const nm = neonMat(def.tier);
    if (pl.table === 'bandit') {
      // a slot cabinet rather than a table
      add(new BoxGeometry(pl.w, 1.8, pl.d), lambert('wood'), pl.x, 0.9, pl.z, 'bandit');
      // neon on the cabinet's crown and kick, well clear of its screen (it bloomed across the glass:
      // DECISIONS #25 is the same lesson on the tables)
      add(new BoxGeometry(pl.w + 0.04, 0.04, 0.04), nm, pl.x, 1.82, pl.z + pl.d / 2, 'neon');
      add(new BoxGeometry(pl.w + 0.04, 0.04, 0.04), nm, pl.x, 0.1, pl.z + pl.d / 2, 'neon');
    } else {
      add(new BoxGeometry(pl.w, pl.h - 0.06, pl.d), lambert('wood'), pl.x, (pl.h - 0.06) / 2, pl.z, pl.table);
      add(uvRepeat(new BoxGeometry(pl.w - 0.14, 0.06, pl.d - 0.14), (pl.w - 0.14) * 2, (pl.d - 0.14) * 2), lambert('felt'), pl.x, pl.h - 0.03, pl.z, 'felt');
      // the neon rim: front and back edges in the tier color (no side strips: from the seat they run
      // straight at your eye and bloom across the panel)
      for (const dz of [pl.d / 2, -pl.d / 2]) add(new BoxGeometry(pl.w, 0.035, 0.035), nm, pl.x, pl.h - 0.02, pl.z + dz, 'neon');
    }
    // the stool
    add(new CylinderGeometry(0.22, 0.22, 0.06, 8), lambert('brass'), pl.stand.x, 0.62, pl.stand.z - 0.25, 'stool');
    add(new CylinderGeometry(0.04, 0.04, 0.6, 6), lambert('brass'), pl.stand.x, 0.3, pl.stand.z - 0.25, 'stoolpost');
    // the dealer's screen
    if (pl.screen) {
      const s = pl.screen;
      const m = add(new PlaneGeometry(s.w, s.h), screenOff, s.x, s.y, s.z, `screen-${pl.table}`);
      m.rotation.x = -s.tilt;
      const frame = add(new BoxGeometry(s.w + 0.06, s.h + 0.06, 0.03), lambert('wood'), s.x, s.y, s.z, 'screenframe');
      frame.rotation.x = -s.tilt;
      frame.translateZ(-0.02);
      // a table's screen stands on a post; the Bandit's is set in its cabinet
      if (pl.table !== 'bandit') add(new BoxGeometry(0.06, s.y - s.h / 2, 0.06), lambert('brass'), s.x, (s.y - s.h / 2) / 2, s.z - 0.05, 'screenpost');
      screens.set(pl.table, m);
    }
    sign(`sign_${pl.table}` as TextureName, 96, pl.x, pl.signY, pl.z);
  }

  // ---- the Collector's table: round, violet ring, his chair across from yours
  const co = floor.collector;
  add(uvRepeat(new CylinderGeometry(co.r, co.r * 0.9, co.h - 0.05, 16), 6, 1), lambert('wood'), co.x, (co.h - 0.05) / 2, co.z, 'collector');
  add(new CylinderGeometry(co.r - 0.08, co.r - 0.08, 0.05, 24), lambert(null, hexOf(C.collLo)), co.x, co.h - 0.02, co.z, 'collectorfelt');
  for (const [y, r] of [[co.h, co.r], [0.04, co.r * 0.9]] as const) {
    const ring = add(new TorusGeometry(r, 0.025, 4, 32), neonMat('coll'), co.x, y, co.z, 'neon');
    ring.rotation.x = Math.PI / 2;
  }
  // his chair: a high back across the table from yours, and his eyes in the dark above it
  // the chair's box is floor data (a collider), so you can't walk into his eyes
  const ch = co.chair;
  const chairZ = (ch.z0 + ch.z1) / 2 + 0.2;
  add(new BoxGeometry(ch.x1 - ch.x0 - 0.1, 2.5, ch.z1 - ch.z0 - 0.1), lambert('wood', hexOf(C.smoke)), co.x, 1.25, chairZ - 0.2, 'collectorchair');
  add(new BoxGeometry(ch.x1 - ch.x0, 0.1, ch.z1 - ch.z0), lambert('brass'), co.x, 2.5, chairZ - 0.2, 'collectorchairtop');
  const eyes = keep(new MeshBasicMaterial({ color: neonColor('coll') }));
  glowing.add(eyes);
  for (const dx of [-0.11, 0.11]) add(new BoxGeometry(0.07, 0.035, 0.02), eyes, co.x + dx, 1.62, chairZ - 0.06, 'eyes');
  sign('sign_collector', 128, co.x, co.signY, co.z);
  // his screen lies back on the felt: the Circuit, the choice and the wheels are drawn on it
  {
    const sc = co.screen;
    const m = add(new PlaneGeometry(sc.w, sc.h), screenOff, sc.x, sc.y, sc.z, 'screen-collector');
    m.rotation.x = -sc.tilt;
    const fr = add(new BoxGeometry(sc.w + 0.06, sc.h + 0.06, 0.03), lambert('wood'), sc.x, sc.y, sc.z, 'screenframe');
    fr.rotation.x = -sc.tilt;
    fr.translateZ(-0.02);
    screens.set('collector', m);
  }

  // ---- lights: one dim hemisphere, one point light per table cluster (≤ 8 in all)
  const hemi = new HemisphereLight(hexOf(C.wallHi), hexOf(C.carpetLo), 2.2);
  group.add(hemi);
  const lights: PointLight[] = [];
  const lamp = (color: number, x: number, z: number, y = 2.95, i = 34) => {
    const l = new PointLight(color, i, 14, 2);
    l.position.set(x, y, z);
    group.add(l);
    lights.push(l);
  };
  for (const pl of floor.tables) lamp(0xffe2b8, pl.x, pl.z);
  lamp(hexOf(C.coll), co.x, co.z, 2.9, 26);
  lamp(0xffd09a, (b.x0 + b.x1) / 2 + 0.8, (b.z0 + b.z1) / 2, 2.9, 26);
  if (lights.length > 8) throw new Error(`room has ${lights.length} point lights; the budget is 8`);

  mergeByMaterial(group, keep);
  group.traverse((o) => {
    if (o instanceof Mesh && glowing.has(o.material as Material)) o.layers.enable(GLOW);
  });
  scene.add(group);
  const base = { lights: lights.map((l) => l.intensity), hemi: hemi.intensity };
  return {
    group, screens, lights, hemi, neon, base,
    dispose() {
      scene.remove(group);
      group.traverse((o: Object3D) => {
        if (o instanceof InstancedMesh) o.dispose();
      });
      for (const d of disposables) d.dispose();
    },
  };
}

/**
 * One draw per material: every static mesh sharing a material is baked into one geometry
 * (≤ 80 draw calls, THREEJS-NOTES rule 11). Screens stay separate (their panels are swapped in
 * by table), and instanced meshes already are one draw.
 */
function mergeByMaterial(group: Group, keep: <T extends { dispose(): void }>(x: T) => T) {
  group.updateMatrixWorld(true);
  const byMat = new Map<Material, Mesh[]>();
  for (const o of [...group.children]) {
    if (!(o instanceof Mesh) || o instanceof InstancedMesh || o.name.startsWith('screen-') || Array.isArray(o.material)) continue;
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
    const one = new Mesh(keep(merged), mat);
    one.name = 'merged:' + meshes[0].name;
    group.add(one);
  }
}

/**
 * The 0:00 drop (THREEJS-NOTES rule 9): `t` 0 = the night's lights, 1 = midnight, every lamp out
 * but the Collector's violet one (the seventh light), which burns a little hotter.
 */
export function setMidnight(room: Room, t: number) {
  room.lights.forEach((l, i) => {
    const b = room.base.lights[i];
    l.intensity = i === 6 ? b * (1 + 0.3 * t) : b * (1 - 0.94 * t);
  });
  room.hemi.intensity = room.base.hemi * (1 - 0.75 * t);
}

/** Recolor the neon after a palette swap. */
export function recolorNeon(room: Room) {
  for (const [tier, mats] of room.neon) for (const m of mats) m.color.copy(neonColor(tier));
}

export { COLLECTOR_TABLE };
