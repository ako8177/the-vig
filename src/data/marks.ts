// Marks: timed debuffs (statuses, not currencies: DECISIONS #3). Hi-Lo's personal mark and the
// Wheel of Marks' four team marks (DESIGN.md §3).

export type MarkId = 'hilo' | 'colddeck' | 'sticky' | 'blackout' | 'tax';

export interface MarkDef {
  id: MarkId;
  name: string;
  /** hits the whole team */
  team: boolean;
  /** seconds; 0 = instant (Tax) */
  durS: number;
  /** what it does, as the HUD and the lesson card say it */
  text: string;
  derivation: string;
}

export const MARKS: MarkDef[] = [
  {
    id: 'hilo', name: 'Marked', team: false, durS: 30,
    text: '-5% ON YOUR HI-LO PAYOUTS PER STACK',
    derivation: 'DESIGN.md §3: -5% to that player\'s mid payouts for 30 s, stacking to 10',
  },
  {
    id: 'colddeck', name: 'Cold Deck', team: true, durS: 45,
    text: 'ALL PAYOUTS -10%',
    derivation: 'DESIGN.md §3: Cold Deck, all payouts -10% for 45 s',
  },
  {
    id: 'sticky', name: 'Sticky Floor', team: true, durS: 45,
    text: 'WALK SPEED -30%',
    derivation: 'DESIGN.md §3: Sticky Floor, move speed -30% for 45 s',
  },
  {
    id: 'blackout', name: 'Blackout', team: true, durS: 45,
    text: 'ODDS HIDDEN ON EVERY TABLE',
    derivation: 'DESIGN.md §3: Blackout, odds hidden on every table for 45 s (and it says so)',
  },
  {
    id: 'tax', name: 'Tax', team: true, durS: 0,
    text: '5% OF THE BANK, TAKEN NOW',
    derivation: 'DESIGN.md §3: Tax, 5% of the bank, immediately',
  },
];

export const MARK_BY_ID = new Map(MARKS.map((m) => [m.id, m]));

/** Hi-Lo's mark: -5% a stack, at most 10 stacks (DESIGN.md §3). */
export const HILO_MARK = {
  perStack: 0.05, maxStacks: 10,
  /** the tables a Hi-Lo mark taxes: Hi-Lo itself, so the Wheel is where a marked player goes (DECISIONS #39) */
  tables: ['hilo'],
  derivation: 'DESIGN.md §3: -5% a stack on your Hi-Lo payouts, stacking to 10',
};
/** Cold Deck's payout factor and Sticky Floor's speed factor (DESIGN.md §3). */
export const COLD_DECK = 0.9;
export const STICKY = 0.7;
export const TAX = 0.05;
/** The Wheel of Marks draws one of these four, equally likely (DESIGN.md §3). */
export const TEAM_MARKS: MarkId[] = ['colddeck', 'sticky', 'blackout', 'tax'];
