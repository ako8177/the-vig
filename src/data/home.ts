// The house (DECISIONS #79, the owner's plan): where a run starts and where you come back to after
// every Collector. A one-room home (the living room, the family, a kitchen corner, the desk with
// the computer), the front yard with the mailbox by the curb and the car in the driveway, the
// street beyond. Laid out as data like a floor, far from the casino's coordinates (the two are
// never drawn together): the sim collides against `colliders`, render3d/home.ts builds the same
// numbers. Meters, Y up; the house's front door faces south (+Z) onto the yard.
import type { Box, Circle, Collider, NpcSpot } from './floors';
import { NPC_R } from './floors';

/** Where the house sits in the world: far east of the casino, so their geometry never meets. */
export const HOME_X = 200;
const ox = (x: number) => HOME_X + x;

const box = (x0: number, z0: number, x1: number, z1: number, h: number, what: string): Box => ({ kind: 'box', x0: ox(x0), z0, x1: ox(x1), z1, h, what });

/** The house's interior: x -6..6, z -5..1, a 2.8 m ceiling; the front door is a gap at x -0.6..0.6. */
export const HOUSE = { x0: ox(-6), x1: ox(6), z0: -5, z1: 1, ceiling: 2.8, door: { x: ox(0), w: 1.2, h: 2.1 } };
/** The yard and the street: everything outside, out to the hedges and the far curb. */
export const YARD = { x0: ox(-9.5), x1: ox(9.5), z0: 1, z1: 16, street: 12.5 };

const W = 0.2;

/** Furniture and the things you use: the sim and the builder read the same boxes. */
export const FURNITURE = {
  couch: box(-3.6, -3, -2.4, -1, 0.8, 'couch'),
  coffee: box(-4.7, -2.5, -4.1, -1.5, 0.45, 'coffee table'),
  tv: box(-6, -2.7, -5.6, -1.3, 1.1, 'tv'),
  rug: { x: ox(-4), z: -2, w: 3, d: 2.6 },
  desk: box(3.6, -5, 5.6, -4.3, 0.76, 'desk'),
  counter: box(0.8, -5, 2.8, -4.4, 0.92, 'counter'),
  fridge: box(-0.2, -5, 0.6, -4.3, 1.8, 'fridge'),
  shelf: box(5.6, -3, 6, -0.5, 1.9, 'shelf'),
  car: box(4.1, 3.9, 5.9, 8.1, 1.4, 'car'),
  mailbox: { kind: 'circle', x: ox(-3), z: 11.6, r: 0.18, h: 1.2, what: 'mailbox' } as Circle,
};

/** Where you stand to use the computer, the mailbox, the car (each a circle of USE_HOME_R). */
export const COMPUTER_STAND = { x: ox(4.6), z: -3.5 };
export const MAILBOX_STAND = { x: ox(-3), z: 10.8 };
export const CAR_STAND = { x: ox(3.5), z: 5.6 };
export const USE_HOME_R = 1.2;

/** Where a player stands at the start of a run and after the drive home. */
export const HOME_SPAWN = { x: ox(-0.8), z: -1.6, yaw: Math.PI / 2 };

/** The family: presentation only, like the crowd (DECISIONS #66). */
export const FAMILY: NpcSpot[] = [
  // on the couch with a drink, watching the television
  { role: 'booth', x: ox(-2.9), z: -2.3, yaw: Math.PI / 2, seated: true, room: 'home' },
  // pottering about the kitchen
  { role: 'walker', x: ox(1), z: -3.7, yaw: 0, seated: false, room: 'home', path: [{ x: ox(1), z: -3.7 }, { x: ox(2.6), z: -3.7 }, { x: ox(2.6), z: -2.6 }] },
  // by the window, watching you go
  { role: 'watcher', x: ox(-1.2), z: 0.2, yaw: Math.PI, seated: false, room: 'home' },
];

export const HOME_COLLIDERS: Collider[] = [
  // the house's walls, the front one with the door in it
  box(-6 - W, -5 - W, 6 + W, -5, 3, 'wall'),
  box(-6 - W, -5, -6, 1 + W, 3, 'wall'),
  box(6, -5, 6 + W, 1 + W, 3, 'wall'),
  box(-6 - W, 1, -0.6, 1 + W, 3, 'wall'),
  box(0.6, 1, 6 + W, 1 + W, 3, 'wall'),
  // the yard's hedges and the far side of the street
  box(-9.5 - W, 1, -9.5, 16, 1.2, 'hedge'),
  box(9.5, 1, 9.5 + W, 16, 1.2, 'hedge'),
  box(-9.5, 16, 9.5, 16 + W, 1.2, 'curb'),
  // the house's outside walls block the yard behind it
  box(-9.5, -5.2, -6.2, 1.2, 3, 'house'),
  box(6.2, -5.2, 9.5, 1.2, 3, 'house'),
  ...Object.values(FURNITURE).filter((f): f is Box | Circle => 'kind' in f),
  ...FAMILY.filter((n) => n.role !== 'walker').map((n): Circle => ({ kind: 'circle', x: n.x, z: n.z, r: NPC_R, h: 1.7, what: 'npc' })),
];

/** The post: how long an order takes to reach the mailbox (s of time at home). */
export const POST_S = { v: 6, derivation: 'DESIGN.md §5: long enough to walk from the desk to the curb, short enough not to wait on' };
