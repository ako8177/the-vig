// The Collector's wheels (DESIGN.md §7): the Boon wheel after a won Circuit, the Bane wheel after
// a lost one. Six equally likely slots each. Banes last the next night.

export type BoonId = 'life' | 'cash' | 'markers' | 'charm' | 'discount' | 'immune';
export type BaneId = 'colddeck' | 'bleed' | 'twoloss' | 'longmarks' | 'dearsoul' | 'overloads';

export interface SlotDef<T extends string> {
  id: T;
  /** on the wheel (short) */
  label: string;
  /** on the result card */
  text: string;
  derivation: string;
}

export const BOONS: SlotDef<BoonId>[] = [
  { id: 'life', label: '+1 LIFE', text: 'EVERYONE +1 LIFE', derivation: 'DESIGN.md §7: Boon, everyone +1 life' },
  { id: 'cash', label: '+$1,000', text: '+$1,000 TO THE BANK', derivation: 'DESIGN.md §7: Boon, +$1,000' },
  { id: 'markers', label: '+3 MARKERS', text: '+3 MARKERS', derivation: 'DESIGN.md §7: Boon, +3 markers' },
  { id: 'charm', label: 'A CHARM', text: 'A RANDOM CHARM (FULL SLOTS: +3 MARKERS)', derivation: 'DESIGN.md §7: Boon, a random charm' },
  { id: 'discount', label: 'QUOTA -20%', text: "NEXT NIGHT'S QUOTA -20%", derivation: 'DESIGN.md §7: Boon, next quota -20%' },
  { id: 'immune', label: 'CLEAN SLATE', text: 'MARKS CLEARED; NO MARKS NEXT NIGHT', derivation: 'DESIGN.md §7: Boon, all marks cleared and mark-immune next night' },
];

export const BANES: SlotDef<BaneId>[] = [
  { id: 'colddeck', label: 'COLD DECK', text: 'COLD DECK ALL NEXT NIGHT', derivation: 'DESIGN.md §7: Bane, Cold Deck all night' },
  { id: 'bleed', label: '-1 LIFE', text: 'A LIVING PLAYER LOSES A LIFE NOW', derivation: 'DESIGN.md §7: Bane, one random living player -1 life now' },
  { id: 'twoloss', label: 'TWO LOSSES', text: 'RED LINE TAKES A LIFE ON 2 LOSSES', derivation: 'DESIGN.md §7: Bane, blood tables kill on two losses' },
  { id: 'longmarks', label: 'LONG MARKS', text: 'HI-LO MARKS LAST 60 S', derivation: 'DESIGN.md §7: Bane, Hi-Lo marks last 60 s' },
  { id: 'dearsoul', label: 'DEAR SOULS', text: 'SOUL BUYBACK COSTS 75%', derivation: 'DESIGN.md §7: Bane, soul buyback 75%; solo, -$500 off the next bank (DECISIONS #51)' },
  { id: 'overloads', label: '3 OVERLOADS', text: 'THE CIRCUIT HAS 3 OVERLOADS; HE HAS 3 FUSES', derivation: 'DESIGN.md §7: Bane, the Circuit has 3 overloads (and he 3 fuses: DECISIONS #52)' },
];

/** Solo, Dear Souls has no soul to price: it docks the next night's bank instead (DECISIONS #51). */
export const DEAR_SOULS_SOLO = { label: 'DEAR SOULS', text: 'SOLO: THE NEXT BANK STARTS $500 LOWER', dock: 500 };

/** Boon and Bane numbers (DESIGN.md §7). */
export const WHEEL = {
  cash: 1000, markers: 3, discount: 0.2, dearSoul: 0.75, longMarksS: 60, twoLoss: 2, bigOverloads: 3,
  /** seconds the wheel spins before it lands (presentation pacing, mirrored in the sim) */
  spinS: 3,
};
