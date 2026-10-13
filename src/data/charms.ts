// Charms and upgrades, bought with markers at the cage (DESIGN.md §5). Pillar 3: every charm
// declares effects on at least two systems; the data test enforces it.

export type GameSystem = 'table' | 'circuit' | 'collector' | 'lives';

export type CharmId = 'luckyfuse' | 'overclock' | 'leadapron' | 'magnet';

export interface CharmDef {
  id: CharmId;
  name: string;
  price: number;
  /** the systems it touches (at least two: pillar 3) */
  systems: GameSystem[];
  /** one line per side, as printed at the cage */
  text: string[];
  derivation: string;
}

export const CHARMS: CharmDef[] = [
  {
    id: 'luckyfuse', name: 'Lucky Fuse', price: 3, systems: ['circuit', 'collector', 'lives'],
    text: ['WIN A CIRCUIT AFTER SURVIVING', 'AN OVERLOAD IN IT: +1 LIFE'],
    derivation: 'DESIGN.md §5 (DECISIONS #53): win the Circuit having survived an overload in it, +1 life; price 3',
  },
  {
    id: 'overclock', name: 'Overclock', price: 4, systems: ['circuit', 'table'],
    text: ['SURVIVE AN OVERLOAD: STAKES AND', 'WINS x2, FIRST 60 S OF THE NIGHT'],
    derivation: 'DESIGN.md §5 (DECISIONS #9, #54): stakes x2 (so wins x2, odds unchanged) for the next night\'s first 60 s after surviving an overload; price 4',
  },
  {
    id: 'leadapron', name: 'Lead Apron', price: 3, systems: ['table', 'circuit', 'lives'],
    text: ['THE FIRST LIFE YOU WOULD LOSE', 'EACH NIGHT COSTS NOTHING'],
    derivation: 'DESIGN.md §5 (DECISIONS #53): the first life lost each night (blood table, Circuit or shortfall) costs nothing; price 3',
  },
  {
    id: 'magnet', name: 'Marker Magnet', price: 3, systems: ['table', 'circuit'],
    text: ['HIGH-TABLE WINS: x2 MARKERS', 'INSPECTING COSTS 1 MARKER, NOT $100'],
    derivation: 'DESIGN.md §5 (DECISIONS #9): double markers from high-table wins; inspections cost a marker; price 3',
  },
];

export const CHARM_BY_ID = new Map(CHARMS.map((c) => [c.id, c]));

/** Overclock's window (s of table time) and factor (DESIGN.md §5). */
export const OVERCLOCK = { s: 60, factor: 2 };

export type UpgradeId = 'slot4' | 'bank500' | 'hilo20';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  price: number;
  text: string;
  derivation: string;
}

/** Permanent across runs (DESIGN.md §5); saved with the settings. */
export const UPGRADES: UpgradeDef[] = [
  { id: 'slot4', name: 'Fourth Slot', price: 6, text: 'A FOURTH CHARM SLOT', derivation: 'DESIGN.md §5: a fourth charm slot, 6 markers' },
  { id: 'bank500', name: 'Float', price: 4, text: '+$500 BANK EVERY NIGHT', derivation: 'DESIGN.md §5: +$500 starting bank per night, 4 markers' },
  { id: 'hilo20', name: 'Short Memory', price: 4, text: 'HI-LO MARKS LAST 20 S', derivation: 'DESIGN.md §5: Hi-Lo marks last 20 s, 4 markers' },
];

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));
