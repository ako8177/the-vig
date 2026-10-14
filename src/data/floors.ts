// Floor layouts as data: the rooms, their walls and doorways, where each table stands, where you
// sit and where its screen is, the bar, the cage, the decorations and where the crowd stands. The
// sim's movement system collides against `colliders`; render3d builds the rooms from the same
// numbers, so what you bump into is what you see. Meters, Y up, the entrance on the south wall (+Z)
// looking north (-Z).
//
// Floor 1 is three rooms (DECISIONS #65, the owner's plan): THE FLOOR, the big bright main room
// by the entrance with the low tables, the bar and the cage; THE LOUNGE through the north-west
// arch, violet and soft, with the mid tables; THE BACK ROOM through the north-east arch, dark and
// smoky, with the high tables and the Collector. The deeper you walk, the worse it costs.
import type { Tier } from './palette';

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

export type RoomId = 'floor' | 'lounge' | 'back' | 'home';

/** A room: its extent, its ceiling, its look. */
export interface Room {
  id: RoomId;
  name: string;
  /** the tier whose tables it holds (its arch sign's color) */
  tier: Tier;
  x0: number; z0: number; x1: number; z1: number;
  ceiling: number;
  floorTex: 'carpet_floor' | 'carpet' | 'planks';
  wallTex: 'wall_floor' | 'wall' | 'wall_back';
  ceilingTex: 'ceiling_floor' | 'ceiling';
}

/** A gap in a wall you walk through: centered on (x, z), `w` wide, in a wall running along `along`. */
export interface Doorway { x: number; z: number; w: number; h: number; along: 'x' | 'z'; to: RoomId; sign: string }

/** Decorations: things that make it a casino, but you can't play. */
export type PropKind = 'carousel' | 'slot' | 'roulette' | 'cardtable' | 'craps' | 'poker' | 'booth' | 'piano' | 'chandelier' | 'bulb' | 'rope' | 'plant' | 'stool';
export interface Prop { kind: PropKind; x: number; z: number; w?: number; d?: number; rot?: number; room: RoomId }

/** Where the crowd is: what each is doing, facing `yaw` (radians: 0 looks north, -Z). */
export type NpcRole = 'slots' | 'table' | 'drinker' | 'smoker' | 'bartender' | 'watcher' | 'walker' | 'booth' | 'pianist' | 'dealer';
export interface NpcSpot { role: NpcRole; x: number; z: number; yaw: number; seated: boolean; room: RoomId; table?: string; path?: { x: number; z: number }[] }

export interface Floor {
  id: number;
  rooms: Room[];
  doorways: Doorway[];
  /** the main room's ceiling (the tallest) */
  ceiling: number;
  spawn: { x: number; z: number; yaw: number };
  /** the entrance doors (closed behind you), on the south wall */
  door: { x: number; w: number; h: number };
  colliders: Collider[];
  tables: Placement[];
  /** the Collector's round table, and where you sit at it at 0:00 (his screen lies on the felt) */
  collector: {
    x: number; z: number; r: number; h: number; stand: { x: number; z: number }; signY: number;
    eye: { x: number; y: number; z: number }; look: { x: number; y: number; z: number };
    screen: { x: number; y: number; z: number; w: number; h: number; tilt: number };
    /** his high-backed chair across the table (a collider too: what you bump into is what you see) */
    chair: Box;
  };
  bar: Box;
  /** where you stand to order at the bar */
  barStand: { x: number; z: number };
  cage: Box;
  /** where you stand to use the cage (charms, upgrades, buybacks) */
  cageStand: { x: number; z: number };
  pillars: Circle[];
  props: Prop[];
  npcs: NpcSpot[];
}

/** You can sit at a table from this far from its stand point (m). */
export const USE_RADIUS = 1.3;
/** You can use the cage's window from this far from its stand point (m). */
export const CAGE_RADIUS = 1.8;
/** You can order at the bar from this far from its stand point (m): it is a long counter. */
export const BAR_RADIUS = 2.4;
/** Eye height standing (THREEJS-NOTES rule 2). */
export const EYE_H = 1.6;
/** The player's capsule radius (m). */
export const PLAYER_R = 0.3;
/** A person in the crowd, for collision (m). */
export const NPC_R = 0.28;

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

/** A slot cabinet: its screen is the glass on its front, upright, and you sit facing it. */
function cabinet(p: Placement): Placement {
  const sc = { x: p.x, y: 1.3, z: p.z + p.d / 2 + 0.02, w: 1.28, h: 0.72, tilt: 0 };
  return { ...p, screen: sc, eye: { x: p.x, y: sc.y, z: sc.z + SEAT_D }, look: { x: p.x, y: sc.y, z: sc.z } };
}

// ---------------------------------------------------------------- the rooms

const ROOMS: Room[] = [
  { id: 'floor', name: 'THE FLOOR', tier: 'low', x0: -14, z0: -2, x1: 14, z1: 18, ceiling: 5, floorTex: 'carpet_floor', wallTex: 'wall_floor', ceilingTex: 'ceiling_floor' },
  { id: 'lounge', name: 'THE LOUNGE', tier: 'mid', x0: -14, z0: -16, x1: -0.2, z1: -2, ceiling: 3.6, floorTex: 'carpet', wallTex: 'wall', ceilingTex: 'ceiling' },
  { id: 'back', name: 'THE BACK ROOM', tier: 'high', x0: 0.2, z0: -16, x1: 14, z1: -2, ceiling: 3.6, floorTex: 'planks', wallTex: 'wall_back', ceilingTex: 'ceiling' },
];

const DOORWAYS: Doorway[] = [
  { x: -8, z: -2, w: 2.6, h: 2.8, along: 'x', to: 'lounge', sign: 'sign_lounge' },
  { x: 8, z: -2, w: 2.6, h: 2.8, along: 'x', to: 'back', sign: 'sign_back' },
];

// ---------------------------------------------------------------- the tables

const tables: Placement[] = [
  // THE FLOOR: the Bandit sits in a bank of slots by the entrance, Twenty-One beside the bar's light
  cabinet(place('bandit', -6.9, 11, 1.4, 0.9, 3.6)),
  place('twentyone', 6.5, 5, 2.2, 1.2, 3.6),
  // THE LOUNGE
  place('hilo', -10.5, -8, 1.8, 1.1),
  place('wheel', -4, -8, 2.0, 1.2),
  // THE BACK ROOM
  place('redline', 3.6, -7, 2.2, 1.2),
  place('deadman', 11, -7, 2.0, 1.2),
];

const bar: Box = { kind: 'box', x0: -13.8, z0: 1, x1: -12.2, z1: 9.5, h: 1.1, what: 'bar' };
const cage: Box = { kind: 'box', x0: 12.2, z0: 12.5, x1: 13.8, z1: 16.5, h: 3.0, what: 'cage' };
const pillars: Circle[] = [
  { kind: 'circle', x: -3.5, z: 8, r: 0.42, h: 5, what: 'pillar' },
  { kind: 'circle', x: 3.5, z: 8, r: 0.42, h: 5, what: 'pillar' },
  { kind: 'circle', x: -3.5, z: 1.5, r: 0.42, h: 5, what: 'pillar' },
  { kind: 'circle', x: 3.5, z: 1.5, r: 0.42, h: 5, what: 'pillar' },
];

// the Collector's round table, at the back of the back room; his screen lies back on the felt
// (0.6 rad keeps his eyes in view above it) and the seat sits 1.25 m out along its normal
const CO = { x: 7.4, z: -11.8, r: 1.3 };
const CO_SCREEN = { x: CO.x, y: 1.18, z: CO.z + 0.2, w: 1.28, h: 0.72, tilt: 0.6 };
const collector = {
  x: CO.x, z: CO.z, r: CO.r, h: 0.85, stand: { x: CO.x, z: CO.z + CO.r + 0.75 }, signY: 3.0,
  screen: CO_SCREEN,
  eye: { x: CO.x, y: CO_SCREEN.y + Math.sin(CO_SCREEN.tilt) * SEAT_D, z: CO_SCREEN.z + Math.cos(CO_SCREEN.tilt) * SEAT_D },
  look: { x: CO.x, y: CO_SCREEN.y, z: CO_SCREEN.z },
  chair: { kind: 'box', x0: CO.x - 0.55, z0: CO.z - CO.r - 0.55 - 0.375, x1: CO.x + 0.55, z1: CO.z - CO.r - 0.55 - 0.025, h: 2.55, what: 'collectorchair' } as Box,
};

// ---------------------------------------------------------------- the decorations

const SLOT_Z = 11;
const slots = (xs: number[]): Prop[] => xs.map((x) => ({ kind: 'slot', x, z: SLOT_Z, w: 1.4, d: 0.9, room: 'floor' }));

const props: Prop[] = [
  // the banks of slots either side of the entrance aisle (the Bandit is one of the west bank)
  ...slots([-11.4, -9.9, -8.4, -5.4, -3.9]),
  ...slots([3.9, 5.4, 6.9, 8.4, 9.9]),
  // the centerpiece: a ring of slots round a progressive jackpot tower
  { kind: 'carousel', x: 0, z: 5.6, w: 1.5, room: 'floor' },
  { kind: 'roulette', x: -6.5, z: 4.5, w: 2.8, d: 1.5, room: 'floor' },
  { kind: 'cardtable', x: 10.4, z: 4.5, w: 2.2, d: 1.2, room: 'floor' },
  { kind: 'cardtable', x: -4.6, z: 0.3, w: 2.2, d: 1.2, room: 'floor' },
  { kind: 'chandelier', x: 0, z: 9.5, room: 'floor' },
  { kind: 'chandelier', x: 0, z: 3.5, room: 'floor' },
  { kind: 'chandelier', x: -8, z: 7, room: 'floor' },
  { kind: 'chandelier', x: 8, z: 7, room: 'floor' },
  // velvet ropes along the entrance aisle
  { kind: 'rope', x: -1.7, z: 15, d: 4, room: 'floor' },
  { kind: 'rope', x: 1.7, z: 15, d: 4, room: 'floor' },
  { kind: 'plant', x: -13, z: 16.8, room: 'floor' },
  { kind: 'plant', x: 11.2, z: 16.8, room: 'floor' },
  { kind: 'plant', x: -13, z: -0.8, room: 'floor' },
  { kind: 'plant', x: 13, z: -0.8, room: 'floor' },
  ...[2.5, 4, 5.5, 7, 8.5].map((z): Prop => ({ kind: 'stool', x: -11.7, z, room: 'floor' })),
  // THE LOUNGE: a craps rail, booths, a piano
  { kind: 'craps', x: -7.2, z: -13, w: 3.2, d: 1.6, room: 'lounge' },
  { kind: 'booth', x: -13.2, z: -5, w: 1.2, d: 2.4, room: 'lounge' },
  { kind: 'booth', x: -13.2, z: -11, w: 1.2, d: 2.4, room: 'lounge' },
  { kind: 'piano', x: -2.2, z: -14, w: 1.6, d: 1.2, room: 'lounge' },
  { kind: 'chandelier', x: -7.2, z: -8.5, room: 'lounge' },
  { kind: 'plant', x: -1.1, z: -3, room: 'lounge' },
  // THE BACK ROOM: a poker table under a bare bulb, bulbs over the blood tables
  { kind: 'poker', x: 3.4, z: -13.6, w: 2.4, d: 1.4, room: 'back' },
  { kind: 'bulb', x: 3.4, z: -13.6, room: 'back' },
  { kind: 'bulb', x: 3.6, z: -7, room: 'back' },
  { kind: 'bulb', x: 11, z: -7, room: 'back' },
];

/** The colliders a prop puts on the floor (the slot cabinets, the tables, the booths and the piano). */
function propColliders(p: Prop): Collider[] {
  if (p.kind === 'chandelier' || p.kind === 'bulb' || p.kind === 'stool') return [];
  if (p.kind === 'plant') return [{ kind: 'circle', x: p.x, z: p.z, r: 0.35, h: 1.2, what: 'plant' }];
  if (p.kind === 'carousel') return [{ kind: 'circle', x: p.x, z: p.z, r: (p.w ?? 1.5) + 0.9, h: 2, what: 'carousel' }];
  if (p.kind === 'rope') return [{ kind: 'box', x0: p.x - 0.06, z0: p.z - (p.d ?? 4) / 2, x1: p.x + 0.06, z1: p.z + (p.d ?? 4) / 2, h: 1, what: 'rope' }];
  const w = p.w ?? 1, d = p.d ?? 1;
  return [{ kind: 'box', x0: p.x - w / 2, z0: p.z - d / 2, x1: p.x + w / 2, z1: p.z + d / 2, h: 1, what: p.kind }];
}

// ---------------------------------------------------------------- the crowd

const N = 0, S = Math.PI, E = -Math.PI / 2, Wd = Math.PI / 2;
const npcs: NpcSpot[] = [
  // at the slots (west bank, east bank): seated, facing their machines
  ...[-11.4, -8.4, -5.4].map((x): NpcSpot => ({ role: 'slots', x, z: SLOT_Z + 1.05, yaw: N, seated: true, room: 'floor' })),
  ...[3.9, 6.9, 8.4, 9.9].map((x): NpcSpot => ({ role: 'slots', x, z: SLOT_Z + 1.05, yaw: N, seated: true, room: 'floor' })),
  // round the roulette wheel and the card tables, and their dealers
  { role: 'table', x: -7.6, z: 5.75, yaw: N, seated: true, room: 'floor' },
  { role: 'table', x: -5.4, z: 5.75, yaw: N, seated: true, room: 'floor' },
  { role: 'table', x: -8.4, z: 4.5, yaw: E, seated: true, room: 'floor' },
  { role: 'dealer', x: -6.5, z: 3.35, yaw: S, seated: false, room: 'floor' },
  { role: 'table', x: 9.6, z: 5.6, yaw: N, seated: true, room: 'floor' },
  { role: 'table', x: 11.2, z: 5.6, yaw: N, seated: true, room: 'floor' },
  { role: 'dealer', x: 10.4, z: 3.5, yaw: S, seated: false, room: 'floor' },
  { role: 'table', x: -5.4, z: 1.4, yaw: N, seated: true, room: 'floor' },
  { role: 'dealer', x: -4.6, z: -0.7, yaw: S, seated: false, room: 'floor' },
  { role: 'dealer', x: 6.5, z: 3.95, yaw: S, seated: false, room: 'floor', table: 'twentyone' },
  // the bar: the bartender behind it, drinkers at it
  { role: 'bartender', x: -13.3, z: 5, yaw: Wd, seated: false, room: 'floor', path: [{ x: -13.3, z: 2 }, { x: -13.3, z: 8.6 }] },
  { role: 'drinker', x: -11.7, z: 2.5, yaw: E, seated: true, room: 'floor' },
  { role: 'drinker', x: -11.7, z: 8.5, yaw: E, seated: true, room: 'floor' },
  { role: 'drinker', x: -10.8, z: 7.2, yaw: E + 0.4, seated: false, room: 'floor' },
  { role: 'smoker', x: 12.8, z: 0.6, yaw: Wd + 0.3, seated: false, room: 'floor' },
  // railbirds: they watch whoever plays the table beside them
  { role: 'watcher', x: 4.6, z: 7, yaw: N + 0.5, seated: false, room: 'floor', table: 'twentyone' },
  { role: 'watcher', x: 8.7, z: 7.1, yaw: N - 0.5, seated: false, room: 'floor', table: 'twentyone' },
  { role: 'watcher', x: -8.6, z: 13.2, yaw: N + 0.7, seated: false, room: 'floor', table: 'bandit' },
  // walkers: they pace out and back along clear lines across the floor
  { role: 'walker', x: -1, z: 12.6, yaw: N, seated: false, room: 'floor', path: [{ x: -1, z: 12.6 }, { x: -1, z: 9.7 }, { x: -9.6, z: 9.7 }, { x: -9.6, z: 7.6 }] },
  { role: 'walker', x: 2.5, z: 2.4, yaw: N, seated: false, room: 'floor', path: [{ x: 2.5, z: 2.4 }, { x: 2.5, z: 9.8 }, { x: 11, z: 9.8 }] },
  // at the carousel: three players on its outward-facing machines
  ...[0, 2, 5].map((k): NpcSpot => {
    const a = (k / 8) * Math.PI * 2, r = 1.5 + 0.45 + 0.75;
    return { role: 'slots', x: Math.sin(a) * r, z: 5.6 + Math.cos(a) * r, yaw: a, seated: true, room: 'floor' };
  }),
  // THE LOUNGE
  { role: 'table', x: -8.4, z: -11.75, yaw: N, seated: false, room: 'lounge' },
  { role: 'table', x: -6, z: -11.75, yaw: N, seated: false, room: 'lounge' },
  { role: 'dealer', x: -7.2, z: -14.2, yaw: S, seated: false, room: 'lounge' },
  { role: 'booth', x: -12.9, z: -4.4, yaw: Wd, seated: true, room: 'lounge' },
  { role: 'booth', x: -12.9, z: -5.8, yaw: Wd, seated: true, room: 'lounge' },
  { role: 'booth', x: -12.9, z: -11, yaw: Wd, seated: true, room: 'lounge' },
  { role: 'pianist', x: -2.2, z: -13, yaw: N, seated: true, room: 'lounge' },
  { role: 'watcher', x: -12, z: -6.4, yaw: N + 0.4, seated: false, room: 'lounge', table: 'hilo' },
  { role: 'watcher', x: -9, z: -6.1, yaw: N - 0.5, seated: false, room: 'lounge', table: 'hilo' },
  { role: 'watcher', x: -2.4, z: -6.1, yaw: N - 0.5, seated: false, room: 'lounge', table: 'wheel' },
  { role: 'watcher', x: -5.6, z: -6, yaw: N + 0.5, seated: false, room: 'lounge', table: 'wheel' },
  { role: 'drinker', x: -1.4, z: -9.5, yaw: Wd, seated: false, room: 'lounge' },
  // THE BACK ROOM
  { role: 'table', x: 2.6, z: -12.6, yaw: N, seated: true, room: 'back' },
  { role: 'table', x: 4.2, z: -12.6, yaw: N, seated: true, room: 'back' },
  { role: 'table', x: 4.9, z: -13.6, yaw: Wd, seated: true, room: 'back' },
  { role: 'smoker', x: 1, z: -9.4, yaw: E, seated: false, room: 'back' },
  { role: 'smoker', x: 13.3, z: -3.2, yaw: Wd + 0.6, seated: false, room: 'back' },
  { role: 'smoker', x: 13.2, z: -14.6, yaw: Wd - 0.5, seated: false, room: 'back' },
  { role: 'watcher', x: 1.9, z: -5.2, yaw: N + 0.6, seated: false, room: 'back', table: 'redline' },
  { role: 'watcher', x: 5.4, z: -5.1, yaw: N - 0.6, seated: false, room: 'back', table: 'redline' },
  { role: 'watcher', x: 9.3, z: -5.2, yaw: N + 0.6, seated: false, room: 'back', table: 'deadman' },
  { role: 'watcher', x: 12.6, z: -5.3, yaw: N - 0.5, seated: false, room: 'back', table: 'deadman' },
];

// ---------------------------------------------------------------- the walls

/** A wall along X at `z` from x0 to x1, with gaps where doorways stand. */
function wallX(z: number, x0: number, x1: number, gaps: Doorway[], h: number, what = 'wall'): Box[] {
  const cuts = gaps.filter((d) => d.along === 'x' && Math.abs(d.z - z) < 0.01).map((d) => [d.x - d.w / 2, d.x + d.w / 2]).sort((a, b) => a[0] - b[0]);
  const out: Box[] = [];
  let at = x0;
  for (const [a, b] of cuts) {
    if (a > at) out.push({ kind: 'box', x0: at, z0: z - WALL / 2, x1: a, z1: z + WALL / 2, h, what });
    at = b;
  }
  if (x1 > at) out.push({ kind: 'box', x0: at, z0: z - WALL / 2, x1, z1: z + WALL / 2, h, what });
  return out;
}

const walls: Box[] = [
  ...wallX(18, -14.2, 14.2, [], 5),
  ...wallX(-16, -14.2, 14.2, [], 3.6),
  ...wallX(-2, -14.2, 14.2, DOORWAYS, 5),
  { kind: 'box', x0: -14.2, z0: -16, x1: -13.8, z1: 18, h: 5, what: 'wall' },
  { kind: 'box', x0: 13.8, z0: -16, x1: 14.2, z1: 18, h: 5, what: 'wall' },
  { kind: 'box', x0: -0.2, z0: -16, x1: 0.2, z1: -2, h: 3.6, what: 'wall' },
];

export const FLOOR_1: Floor = {
  id: 1,
  rooms: ROOMS,
  doorways: DOORWAYS,
  ceiling: 5,
  spawn: { x: 0, z: 16.6, yaw: 0 },
  door: { x: 0, w: 2.4, h: 3 },
  colliders: [
    ...walls,
    bar,
    cage,
    ...pillars,
    ...tables.map((t): Box => ({ kind: 'box', x0: t.x - t.w / 2, z0: t.z - t.d / 2, x1: t.x + t.w / 2, z1: t.z + t.d / 2, h: t.h, what: t.table })),
    { kind: 'circle', x: collector.x, z: collector.z, r: collector.r, h: collector.h, what: 'collector' },
    collector.chair,
    ...props.flatMap(propColliders),
    // the crowd stands where it stands (walkers move, and you can brush past them)
    ...npcs.filter((n) => n.role !== 'walker' && n.role !== 'bartender').map((n): Circle => ({ kind: 'circle', x: n.x, z: n.z, r: NPC_R, h: 1.7, what: 'npc' })),
  ],
  tables,
  collector,
  bar,
  barStand: { x: bar.x1 + 1, z: (bar.z0 + bar.z1) / 2 },
  cage,
  cageStand: { x: cage.x0 - 0.9, z: (cage.z0 + cage.z1) / 2 },
  pillars,
  props,
  npcs,
};

export const FLOORS: Floor[] = [FLOOR_1];

/** The room a point is in (null: in a doorway or a wall). */
export function roomAt(f: Floor, x: number, z: number): Room | null {
  return f.rooms.find((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) ?? null;
}
