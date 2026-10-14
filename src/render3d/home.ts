// The house, built from src/data/home.ts (DECISIONS #79): the living room (the couch and the
// television, the family, a kitchen corner, the desk with the computer whose screen is the shop),
// the front of the house with its lit windows and porch light, the yard, the walk and the
// driveway, the mailbox by the curb (its flag goes up when the post comes), the car, the street
// and the dark houses across it, a street lamp, stars. Drawn only while the run is at home: the
// casino and the house are never on screen together. Same rules as the casino (THREEJS-NOTES):
// Lambert and flat palette colors, neon and windows on the glow layer, static meshes merged per
// material with a black glow blocker, two or three point lights.
import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, CylinderGeometry, Group, HemisphereLight, Material, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  NearestFilter, PlaneGeometry, PointLight, SphereGeometry, SRGBColorSpace, type Scene,
} from 'three';
import { C, PALETTE, hexOf } from '../data/palette';
import { FURNITURE, HOME_X, HOUSE, YARD } from '../data/home';
import type { Box } from '../data/floors';
import type { Textures, TextureName } from './textures';
import { GLOW } from './view';
import { glowBlockers, mergeByMaterial } from './room';

export interface Home {
  group: Group;
  lights: PointLight[];
  /** the mailbox's flag: up when the post has come */
  setFlag(up: boolean): void;
  update(dt: number, time: number): void;
  setVisible(v: boolean): void;
  dispose(): void;
}

const ox = (x: number) => HOME_X + x;

export function buildHome(scene: Scene, tx: Textures): Home {
  const group = new Group();
  group.name = 'home';
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const lamberts = new Map<string, MeshLambertMaterial>();
  const lambert = (t: TextureName | null, color = 0xffffff) => {
    const k = `${t}|${color}`;
    let m = lamberts.get(k);
    if (!m) lamberts.set(k, (m = keep(new MeshLambertMaterial({ map: t ? tx.get(t) : null, color }))));
    return m;
  };
  const flat = (role: number) => lambert(null, hexOf(role));
  const glowing = new Set<Material>();
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
  /** a box from a data Box (its footprint) and a height range */
  const block = (b: Box, y0: number, y1: number, mat: Material, name: string) =>
    add(new BoxGeometry(b.x1 - b.x0, y1 - y0, b.z1 - b.z0), mat, (b.x0 + b.x1) / 2, (y0 + y1) / 2, (b.z0 + b.z1) / 2, name);
  /** a flat plane on the ground, (x0, z0)-(x1, z1), at height y */
  const ground = (x0: number, z0: number, x1: number, z1: number, y: number, mat: Material, name: string, rx = 1, rz = 1) => {
    const g = new PlaneGeometry(x1 - x0, z1 - z0);
    if (rx !== 1 || rz !== 1) {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rx, uv.getY(i) * rz);
    }
    const m = add(g, mat, (x0 + x1) / 2, y, (z0 + z1) / 2, name);
    m.rotation.x = -Math.PI / 2;
    return m;
  };
  /** a wall plane facing +z (ry 0), -z (ry π), +x (ry π/2) or -x (ry -π/2) */
  const wall = (len: number, h: number, x: number, y: number, z: number, ry: number, mat: Material, name: string, tile = 2) => {
    const g = new PlaneGeometry(len, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len / tile), uv.getY(i) * (h / tile));
    const m = add(g, mat, x, y, z, name);
    m.rotation.y = ry;
    return m;
  };

  const H = HOUSE.ceiling;
  // painted plaster inside (not the casino's damask), pale siding outside
  const inside = flat(C.bone);
  const siding = flat(C.dust);
  // ---------------------------------------------------------------- inside
  ground(ox(-6), -5, ox(6), 1, 0, lambert('planks', 0xd0a080), 'homefloor', 6, 3);
  const ceil = ground(ox(-6), -5, ox(6), 1, H, flat(C.cream), 'homeceiling');
  ceil.rotation.x = Math.PI / 2;
  wall(12, H, ox(0), H / 2, -5, 0, inside, 'homewall');
  wall(6, H, ox(-6), H / 2, -2, Math.PI / 2, inside, 'homewall');
  wall(6, H, ox(6), H / 2, -2, -Math.PI / 2, inside, 'homewall');
  wall(5.4, H, ox(-3.3), H / 2, 1, Math.PI, inside, 'homewall');
  wall(5.4, H, ox(3.3), H / 2, 1, Math.PI, inside, 'homewall');
  wall(1.2, H - HOUSE.door.h, ox(0), (H + HOUSE.door.h) / 2, 1, Math.PI, inside, 'homewall');
  // baseboards
  for (const [len, x, z, ry] of [[12, 0, -4.98, 0], [6, -5.98, -2, Math.PI / 2], [6, 5.98, -2, -Math.PI / 2]] as [number, number, number, number][]) {
    const b = add(new BoxGeometry(len, 0.12, 0.03), flat(C.woodLo), ox(x), 0.06, z, 'baseboard');
    b.rotation.y = ry;
  }
  // the windows in the front wall: night outside, from in here
  for (const x of [-3.6, 3.4]) {
    add(new BoxGeometry(1.4, 1, 0.24), flat(C.wood), ox(x), 1.55, 1, 'windowframe');
    const pane = add(new PlaneGeometry(1.2, 0.85), flat(C.indigo), ox(x), 1.55, 0.87, 'windowpane');
    pane.rotation.y = Math.PI;
  }
  // the living room: a rug, the couch, the coffee table, the television (it flickers)
  const rug = FURNITURE.rug;
  ground(rug.x - rug.w / 2, rug.z - rug.d / 2, rug.x + rug.w / 2, rug.z + rug.d / 2, 0.01, flat(C.indigoHi), 'rug');
  ground(rug.x - rug.w / 2 + 0.2, rug.z - rug.d / 2 + 0.2, rug.x + rug.w / 2 - 0.2, rug.z + rug.d / 2 - 0.2, 0.012, flat(C.pink), 'rugin');
  const cb = FURNITURE.couch;
  block(cb, 0, 0.45, flat(C.teal), 'couch');
  block({ ...cb, x0: cb.x1 - 0.25 }, 0.45, 0.95, flat(C.teal), 'couchback');
  block({ ...cb, z1: cb.z0 + 0.2 }, 0.45, 0.68, flat(C.teal), 'couch');
  block({ ...cb, z0: cb.z1 - 0.2 }, 0.45, 0.68, flat(C.teal), 'couch');
  block(FURNITURE.coffee, 0.36, 0.42, lambert('wood'), 'coffee');
  block({ ...FURNITURE.coffee, x0: FURNITURE.coffee.x0 + 0.05, x1: FURNITURE.coffee.x1 - 0.05, z0: FURNITURE.coffee.z0 + 0.05, z1: FURNITURE.coffee.z1 - 0.05 }, 0, 0.36, flat(C.woodLo), 'coffee');
  add(new BoxGeometry(0.08, 0.12, 0.08), flat(C.cream), ox(-4.4), 0.48, -1.8, 'mug');
  const tvb = FURNITURE.tv;
  block(tvb, 0, 0.5, flat(C.woodLo), 'tvstand');
  add(new BoxGeometry(0.06, 0.72, 1.24), flat(C.ink), ox(-5.75), 0.95, -2, 'tv');
  const tvScreen = keep(new MeshBasicMaterial({ color: new Color(hexOf(C.soulLo)).multiplyScalar(0.9) }));
  glowing.add(tvScreen);
  const tvs = new Mesh(keep(new PlaneGeometry(1.12, 0.62)), tvScreen);
  tvs.position.set(ox(-5.715), 0.95, -2);
  tvs.rotation.y = Math.PI / 2;
  tvs.name = 'anim-tv';
  group.add(tvs);
  // a floor lamp in the corner, warm
  add(new CylinderGeometry(0.02, 0.02, 1.5, 6), flat(C.brass), ox(-5.5), 0.75, -4.5, 'lamppole');
  add(new CylinderGeometry(0.14, 0.2, 0.25, 8), glow(C.cream, 0.9), ox(-5.5), 1.6, -4.5, 'lampshade');
  // family photographs on the back wall
  for (const [x, y, c] of [[-4.2, 1.5, C.gold], [-3.6, 1.75, C.pinkHi], [-3.0, 1.5, C.cream]] as [number, number, number][]) {
    add(new BoxGeometry(0.28, 0.36, 0.03), flat(C.woodLo), ox(x), y, -4.985, 'frame');
    add(new BoxGeometry(0.2, 0.28, 0.035), flat(c), ox(x), y, -4.98, 'photo');
  }
  // the kitchen corner: the counter, the fridge, a kettle
  block(FURNITURE.counter, 0, 0.86, flat(C.bone), 'counter');
  block(FURNITURE.counter, 0.86, 0.92, flat(C.smoke), 'countertop');
  block(FURNITURE.fridge, 0, 1.8, flat(C.white), 'fridge');
  add(new BoxGeometry(0.03, 0.4, 0.03), flat(C.smoke), ox(0.55), 1.2, -4.28, 'fridgehandle');
  add(new BoxGeometry(0.18, 0.2, 0.18), flat(C.blood), ox(1.4), 1.02, -4.75, 'kettle');
  // the bookshelf on the east wall
  block(FURNITURE.shelf, 0, 1.9, lambert('wood'), 'shelf');
  for (let k = 0; k < 4; k++) for (let j = 0; j < 6; j++) {
    const c = [C.blood, C.teal, C.gold, C.indigoHi, C.cream, C.pink][(j + k * 2) % 6];
    add(new BoxGeometry(0.22, 0.28, 0.07), flat(c), ox(5.72), 0.3 + k * 0.45, -2.8 + j * 0.38, 'books');
  }
  // the desk and the computer: its screen is the shop
  const dk = FURNITURE.desk;
  block({ ...dk }, 0.72, 0.78, lambert('wood'), 'desktop');
  for (const [x, z] of [[dk.x0 + 0.05, dk.z0 + 0.05], [dk.x1 - 0.05, dk.z0 + 0.05], [dk.x0 + 0.05, dk.z1 - 0.05], [dk.x1 - 0.05, dk.z1 - 0.05]]) add(new BoxGeometry(0.05, 0.72, 0.05), flat(C.woodLo), x, 0.36, z, 'deskleg');
  add(new BoxGeometry(0.7, 0.45, 0.05), flat(C.ink), ox(4.6), 1.06, -4.75, 'monitor');
  add(new BoxGeometry(0.08, 0.2, 0.08), flat(C.ink), ox(4.6), 0.86, -4.75, 'monitorstand');
  add(new BoxGeometry(0.5, 0.03, 0.18), flat(C.smoke), ox(4.6), 0.8, -4.5, 'keyboard');
  const shop = shopScreen(keep);
  const sm = keep(new MeshBasicMaterial({ map: shop, color: new Color(1, 1, 1).multiplyScalar(1.1) }));
  glowing.add(sm);
  add(new PlaneGeometry(0.64, 0.4), sm, ox(4.6), 1.06, -4.72, 'shopscreen');
  add(new BoxGeometry(0.5, 0.06, 0.5), flat(C.night), ox(4.6), 0.48, -3.9, 'deskchair');
  add(new BoxGeometry(0.5, 0.6, 0.06), flat(C.night), ox(4.6), 0.8, -3.65, 'deskchairback');

  // ---------------------------------------------------------------- outside
  // the house's face: siding, the lit windows, the door standing open, the porch light, the roof
  wall(5.6, 3, ox(-3.4), 1.5, 1.2, 0, siding, 'facade');
  wall(5.6, 3, ox(3.4), 1.5, 1.2, 0, siding, 'facade');
  wall(1.2, 3 - HOUSE.door.h, ox(0), (3 + HOUSE.door.h) / 2, 1.2, 0, siding, 'facade');
  wall(6.4, 3, ox(-6.2), 1.5, -2, -Math.PI / 2, siding, 'facade');
  wall(6.4, 3, ox(6.2), 1.5, -2, Math.PI / 2, siding, 'facade');
  for (const x of [-3.6, 3.4]) add(new PlaneGeometry(1.2, 0.85), glow(C.cream, 0.85), ox(x), 1.55, 1.21, 'windowlit');
  add(new BoxGeometry(0.08, HOUSE.door.h, 0.9), flat(C.wood), ox(0.62), HOUSE.door.h / 2, 1.6, 'frontdoor');
  add(new BoxGeometry(0.1, 0.06, 0.06), flat(C.brass), ox(0.62), 1.0, 1.95, 'doorknob');
  add(new BoxGeometry(1.6, 0.12, 0.9), flat(C.smoke), ox(0), 0.06, 1.65, 'step');
  add(new BoxGeometry(0.12, 0.16, 0.1), glow(C.gold, 1), ox(-0.95), 2.3, 1.26, 'porchlight');
  for (const s of [-1, 1]) {
    const roof = add(new BoxGeometry(13.2, 0.15, 3.9), flat(C.woodLo), ox(0), 3.55, -2 + s * 1.65, 'roof');
    roof.rotation.x = s * 0.55;
  }
  // the ground: grass, the walk, the driveway, the sidewalk, the street and its line
  ground(YARD.x0, 1.2, YARD.x1, 11.8, 0, flat(C.baizeHi), 'grass');
  ground(ox(-0.6), 1.2, ox(0.6), 11.8, 0.01, flat(C.smoke), 'walk');
  ground(ox(3.5), 1.2, ox(6.5), 11.8, 0.01, flat(C.night), 'driveway');
  ground(ox(-30), 11.8, ox(30), 12.5, 0.02, flat(C.smoke), 'sidewalk');
  ground(ox(-30), 12.5, ox(30), 16.6, 0, flat(C.ink), 'street');
  for (let x = -28; x < 28; x += 3) ground(ox(x), 14.45, ox(x + 1.5), 14.6, 0.01, flat(C.cream), 'line');
  ground(ox(-30), 16.6, ox(30), 17.4, 0.02, flat(C.smoke), 'sidewalk');
  ground(ox(-30), -12, ox(30), 1.2, -0.01, flat(C.baize), 'grassback');
  // hedges down each side
  for (const x of [YARD.x0 - 0.1, YARD.x1 + 0.1]) add(new BoxGeometry(0.6, 1.2, 10.6), flat(C.baize), x, 0.6, 6.5, 'hedge');
  // the houses across the street, dark, a few windows lit
  for (let k = -3; k <= 3; k++) {
    const x = ox(k * 8.5);
    add(new BoxGeometry(7, 3.4, 6), flat(C.night), x, 1.7, 21, 'farhouse');
    const roof = add(new BoxGeometry(7.4, 0.15, 3.6), flat(C.ink), x, 3.9, 19.4, 'farroof');
    roof.rotation.x = -0.55;
    if ((k + 7) % 3 !== 1) add(new PlaneGeometry(1, 0.8), glow(k % 2 ? C.cream : C.gold, 0.7), x + (k % 2 ? -1.6 : 1.6), 1.7, 17.99, 'farwindow').rotation.y = Math.PI;
  }
  // the mailbox by the curb: a post, the box, the flag
  const mb = FURNITURE.mailbox;
  add(new BoxGeometry(0.1, 1.05, 0.1), lambert('wood'), mb.x, 0.52, mb.z, 'mailpost');
  add(new BoxGeometry(0.3, 0.26, 0.5), flat(C.blood), mb.x, 1.15, mb.z, 'mailbox');
  const flag = new Mesh(keep(new BoxGeometry(0.03, 0.22, 0.08)), flat(C.gold));
  flag.position.set(mb.x + 0.17, 1.1, mb.z + 0.1);
  flag.name = 'anim-flag';
  group.add(flag);
  // the car in the driveway, nose to the street
  const car = FURNITURE.car;
  const cx = (car.x0 + car.x1) / 2, cz = (car.z0 + car.z1) / 2;
  add(new BoxGeometry(1.8, 0.62, 4.2), flat(C.marker), cx, 0.55, cz, 'carbody');
  add(new BoxGeometry(1.6, 0.5, 2.1), flat(C.markerLo), cx, 1.1, cz - 0.2, 'carcabin');
  add(new BoxGeometry(1.62, 0.36, 1.9), flat(C.ink), cx, 1.12, cz - 0.2, 'carglass');
  for (const [dx, dz] of [[-0.9, -1.3], [0.9, -1.3], [-0.9, 1.3], [0.9, 1.3]]) {
    const w = add(new CylinderGeometry(0.32, 0.32, 0.22, 10), flat(C.ink), cx + dx, 0.32, cz + dz, 'wheel');
    w.rotation.z = Math.PI / 2;
  }
  for (const dx of [-0.6, 0.6]) {
    add(new BoxGeometry(0.32, 0.14, 0.04), glow(C.cream, 1), cx + dx, 0.66, car.z1 + 0.01, 'headlight');
    add(new BoxGeometry(0.3, 0.12, 0.04), glow(C.blood, 1), cx + dx, 0.66, car.z0 - 0.01, 'taillight');
  }
  // the street lamp, and the sky: a moon and stars
  add(new CylinderGeometry(0.06, 0.08, 4.4, 6), flat(C.smoke), ox(-7), 2.2, 12.2, 'lamppost');
  add(new BoxGeometry(0.5, 0.15, 0.3), glow(C.cream, 1), ox(-6.8), 4.4, 12.2, 'streetlamp');
  add(new SphereGeometry(2.2, 10, 8), glow(C.bone, 1), ox(-25), 38, 70, 'moon');
  for (let k = 0; k < 60; k++) {
    const a = (k * 2.399) % (Math.PI * 2), r = 30 + ((k * 37) % 50);
    add(new BoxGeometry(0.25, 0.25, 0.25), glow(C.white, 0.9), ox(Math.cos(a) * r), 22 + ((k * 13) % 20), 10 + Math.sin(a) * r, 'star');
  }

  // ---------------------------------------------------------------- lights: inside, the porch, the street
  const lights: PointLight[] = [];
  const lamp = (color: number, x: number, y: number, z: number, i: number, range: number) => {
    const l = new PointLight(color, i, range, 2);
    l.position.set(x, y, z);
    group.add(l);
    lights.push(l);
  };
  lamp(0xffd8a8, ox(-2), 2.4, -2.2, 22, 11);
  lamp(0xffe0c0, ox(3.6), 2.4, -3.2, 12, 8);
  lamp(0xffc890, ox(-0.9), 2.3, 2.2, 16, 9);
  lamp(0xffe8c0, ox(-6.6), 4.2, 12.4, 26, 13);
  // moonlight: a cool sky over a dark ground, so the yard reads at night (only at home)
  const moon = new HemisphereLight(0x8090c8, 0x203020, 1.6);
  group.add(moon);

  mergeByMaterial(group, keep);
  glowBlockers(group, glowing, keep);
  group.traverse((o) => {
    if (o instanceof Mesh && glowing.has(o.material as Material)) o.layers.enable(GLOW);
  });
  group.visible = false;
  scene.add(group);

  // the television's light changes now and then
  const TV = [C.soulLo, C.marker, C.teal, C.cream, C.pinkHi];
  let tvT = 0, tvK = 0;
  return {
    group, lights,
    setFlag(up) {
      flag.rotation.z = up ? 0 : Math.PI / 2;
      flag.position.y = up ? 1.28 : 1.12;
    },
    update(dt) {
      tvT += dt;
      if (tvT > 1.3) {
        tvT = 0;
        tvK = (tvK + 1 + Math.floor(Math.random() * 3)) % TV.length;
        tvScreen.color.copy(new Color(hexOf(TV[tvK])).multiplyScalar(0.9));
      }
    },
    setVisible(v) {
      group.visible = v;
    },
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose();
    },
  };
}

/** The computer's screen: the shop's front page, drawn once. */
function shopScreen(keep: <T extends { dispose(): void }>(x: T) => T) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 40;
  const x = c.getContext('2d')!;
  x.fillStyle = PALETTE[C.night];
  x.fillRect(0, 0, 64, 40);
  x.fillStyle = PALETTE[C.coll];
  x.fillRect(0, 0, 64, 9);
  x.fillStyle = PALETTE[C.white];
  x.font = 'bold 7px monospace';
  x.fillText('LUCKSHOP', 4, 7);
  for (let i = 0; i < 3; i++) {
    x.fillStyle = PALETTE[[C.marker, C.gold, C.soul][i]];
    x.fillRect(4 + i * 20, 13, 16, 14);
    x.fillStyle = PALETTE[C.dust];
    x.fillRect(4 + i * 20, 30, 16, 3);
  }
  const t = keep(new CanvasTexture(c));
  t.magFilter = t.minFilter = NearestFilter;
  t.colorSpace = SRGBColorSpace;
  return t;
}
