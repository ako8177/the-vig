// Floor layouts as data: the room, its colliders, where each table stands, where you sit and
// where its screen is. The sim's movement system collides against `colliders`; render3d builds
// the room's geometry from the same numbers, so what you bump into is what you see.
// Meters, Y up, the door on the south wall (+Z) looking north (-Z) into the room.

export interface Box { kind: 'box'; x0: number; z0: number; x1: number; z1: number; h: number; what: string }
export interface Circle { kind: 'circle'; x: number; z: number; r: number; h: number; what: string }
export type Collider = Box | Circle;

export interface Placement {
  table: string;
  /** table center */
  x: number;
  z: number;
  /** footprint (m): width along X, depth along Z */
  w: number;
  d: number;
  /** felt height */
  h: number;
  /** where you stand to sit down (the use volume is a circle of USE_RADIUS around it) */
  stand: { x: number; z: number };
  /** the seated camera: eye position and look target (rule 3: the camera eases here) */
  eye: { x: number; y: number; z: number };
  look: { x: number; y: number; z: number };
  /** the screen the panel is mapped onto: center, size, tilt back from vertical (radians) */
  screen: { x: number; y: number; z: number; w: number; h: number; tilt: number } | null;
  /** the neon sign over the table */
  signY: number;
}

export interface Floor {
  id: number;
  /** room extents (m) and ceiling height */
  w: number;
  d: number;
  ceiling: number;
  spawn: { x: number; z: number; yaw: number };
  door: { x: number; w: number; h: number };
  colliders: Collider[];
  tables: Placement[];
  /** the Collector's round table */
  collector: { x: number; z: number; r: number; h: number; stand: { x: number; z: number }; signY: number };
  bar: Box;
  cage: Box;
  pillars: Circle[];
}

/** You can sit at a table from this far from its stand point (m). */
export const USE_RADIUS = 1.3;
/** Eye height standing (THREEJS-NOTES rule 2). */
export const EYE_H = 1.6;
/** The player's capsule radius (m). */
export const PLAYER_R = 0.3;

const WALL = 0.4;
/** the seated eye's distance from the dealer's screen (m) */
const SEAT_D = 1.25;

/** A table's seat and screen from its footprint: the seat faces -Z, the screen stands on the far edge. */
function place(table: string, x: number, z: number, w: number, d: number, signY = 2.95, screen = true): Placement {
  const h = 0.9;
  // the dealer's screen: 1.28 x 0.72 m, leaning back 18 deg; from the seated eye 1.25 m out along
  // its normal it covers 180 of the view's 360 rows, so the 320x180 panel lands at about 1:1
  const sc = screen ? { x, y: 1.25, z: z - d / 2 + 0.12, w: 1.28, h: 0.72, tilt: 0.31 } : null;
  const eye = sc ? { x, y: sc.y + Math.sin(sc.tilt) * SEAT_D, z: sc.z + Math.cos(sc.tilt) * SEAT_D } : { x, y: 1.25, z: z + d / 2 + 0.45 };
  return {
    table, x, z, w, d, h,
    stand: { x, z: z + d / 2 + 0.75 },
    eye,
    look: sc ? { x, y: sc.y, z: sc.z } : { x, y: h, z },
    screen: sc,
    signY,
  };
}

const tables: Placement[] = [
  // Low tier nearest the door, mid out by the walls, high at the back flanking the Collector: the
  // deeper you walk, the worse it costs. Every sign is inside the 91 deg view from the door (the
  // whole question in one look) and no sign hides another from there.
  // the near signs hang higher so that from the door they clear the mid signs behind them
  place('bandit', -4, 2.5, 1.4, 0.9, 3.4),
  place('twentyone', 4, 2.5, 2.2, 1.2, 3.4),
  place('hilo', -8, -2, 1.8, 1.1),
  place('wheel', 8, -2, 2.0, 1.2),
  place('redline', -4.5, -5.5, 2.2, 1.2),
  place('deadman', 4.5, -5.5, 2.0, 1.2),
];

const bar: Box = { kind: 'box', x0: -12 + WALL / 2, z0: -6, x1: -10.6, z1: 2, h: 1.1, what: 'bar' };
const cage: Box = { kind: 'box', x0: 10.2, z0: -3.5, x1: 12 - WALL / 2, z1: 1.5, h: 3.0, what: 'cage' };
const pillars: Circle[] = [
  { kind: 'circle', x: -9.6, z: 6.4, r: 0.35, h: 4, what: 'pillar' },
  { kind: 'circle', x: 9.6, z: 6.4, r: 0.35, h: 4, what: 'pillar' },
  { kind: 'circle', x: -9.6, z: -6.6, r: 0.35, h: 4, what: 'pillar' },
  { kind: 'circle', x: 9.6, z: -6.6, r: 0.35, h: 4, what: 'pillar' },
];
const collector = { x: 0, z: -0.5, r: 1.3, h: 0.85, stand: { x: 0, z: 1.55 }, signY: 3.25 };

const W = 24, D = 16;
const walls: Box[] = [
  { kind: 'box', x0: -W / 2 - WALL / 2, z0: -D / 2 - WALL / 2, x1: W / 2 + WALL / 2, z1: -D / 2 + WALL / 2, h: 4, what: 'wall' },
  { kind: 'box', x0: -W / 2 - WALL / 2, z0: D / 2 - WALL / 2, x1: W / 2 + WALL / 2, z1: D / 2 + WALL / 2, h: 4, what: 'wall' },
  { kind: 'box', x0: -W / 2 - WALL / 2, z0: -D / 2, x1: -W / 2 + WALL / 2, z1: D / 2, h: 4, what: 'wall' },
  { kind: 'box', x0: W / 2 - WALL / 2, z0: -D / 2, x1: W / 2 + WALL / 2, z1: D / 2, h: 4, what: 'wall' },
];

export const FLOOR_1: Floor = {
  id: 1,
  w: W,
  d: D,
  ceiling: 4,
  spawn: { x: 0, z: 7.2, yaw: 0 },
  door: { x: 0, w: 2.2, h: 2.6 },
  colliders: [
    ...walls,
    bar,
    cage,
    ...pillars,
    ...tables.map((t): Box => ({ kind: 'box', x0: t.x - t.w / 2, z0: t.z - t.d / 2, x1: t.x + t.w / 2, z1: t.z + t.d / 2, h: t.h, what: t.table })),
    { kind: 'circle', x: collector.x, z: collector.z, r: collector.r, h: collector.h, what: 'collector' },
  ],
  tables,
  collector,
  bar,
  cage,
  pillars,
};

export const FLOORS: Floor[] = [FLOOR_1];
