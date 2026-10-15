// The night's economy as data: the quota curve, the bank floor, shortfall and overshoot. Every
// number names its DESIGN.md section (CLAUDE.md, architecture rules).

export interface Num {
  v: number;
  derivation: string;
}

const n = (v: number, derivation: string): Num => ({ v, derivation });

export const ECONOMY = {
  nightS: n(360, 'DESIGN.md §1: a night is 360 s'),
  nights: n(3, 'DESIGN.md §1: the slice is three nights on floor 1 (ROADMAP Milestone 1)'),
  quota1: n(3000, 'DESIGN.md §2: night 1 quota $3,000'),
  quotaGrowth: n(1.5, 'DESIGN.md §2: the quota x1.5 each night'),
  startBank: n(1500, 'DESIGN.md §2: start bank $1,500 (DECISIONS #40: $1,000 went broke on 42% of mid rotations)'),
  bankFloor: n(1000, 'DESIGN.md §2 (DECISIONS #10): the bank carries over with a $1,000 floor'),
  shortfallPerLife: n(2000, 'DESIGN.md §2: one life per $2,000 short, rounded up (DECISIONS #55)'),
  overshootPerMarker: n(500, 'DESIGN.md §2: 1 marker per $500 over quota'),
  startLives: n(3, 'DESIGN.md §1: 3 lives per player (PLAN.md currencies)'),
  startMarkers: n(6, 'DESIGN.md §5 (DECISIONS #85): a run starts with 6 markers: a charm or two at home, or saved'),
  maxLives: n(5, 'DESIGN.md §7: lives cap at 5 (Boon and Lucky Fuse can lift you past 3)'),
  charmSlots: n(3, 'DESIGN.md §5: 3 charm slots per player'),
  buybackShare: n(0.5, 'DESIGN.md §4: soul buyback costs 50% of the current quota'),
  markers: {
    redline: n(1, 'DESIGN.md §5: a Red Line win +1 marker'),
    deadman: n(2, "DESIGN.md §5: a Dead Man's Hand win +2 markers"),
  },
};
