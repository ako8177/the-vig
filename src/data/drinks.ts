// The bar on the main floor (DESIGN.md §10; DECISIONS #67, the owner's idea): drinks bought with
// cash from the bank. A drink is a buzz: seconds of being drunk, which stack up to a ceiling, and
// the drunker you are, the more the room swims (presentation: src/render3d/view.ts, src/app/app.ts).
// Each drink also gives a small edge for as long as its buzz (DECISIONS #77): a few percent on the
// payouts of one tier of table. Played at that tier the whole time, the edge about pays the price
// back (DESIGN.md §10): a drink is a tempo call, not free money, and the room still swims.
import type { Tier } from './palette';

export type DrinkId = 'beer' | 'martini' | 'whiskey' | 'collector';

export interface DrinkDef {
  id: DrinkId;
  name: string;
  price: number;
  /** seconds of buzz it adds (of floor time) */
  buzzS: number;
  /** what the bartender says it is */
  text: string;
  /** the edge: payouts at these tiers' tables x (1 + bonus), for buzzS of floor time */
  bonus: number;
  tiers: Tier[];
  /** the edge, as printed */
  edgeText: string;
  derivation: string;
}

export const DRINKS: DrinkDef[] = [
  {
    id: 'beer', name: 'Draft Beer', price: 40, buzzS: 25, text: 'A LITTLE LOOSE', bonus: 0.06, tiers: ['low'], edgeText: 'LOW TABLES PAY +6%',
    derivation: 'DESIGN.md §10: the cheapest drink, a short buzz; +6% low for 25 s ≈ $57 back at the Bandit for $40',
  },
  {
    id: 'martini', name: 'Dry Martini', price: 120, buzzS: 50, text: 'THE ROOM GETS WARM', bonus: 0.04, tiers: ['mid'], edgeText: 'MID TABLES PAY +4%',
    derivation: 'DESIGN.md §10: about two beers of buzz; +4% mid for 50 s ≈ $150 back at Hi-Lo for $120',
  },
  {
    id: 'whiskey', name: 'Double Whiskey', price: 200, buzzS: 80, text: 'THE FLOOR TILTS', bonus: 0.03, tiers: ['high'], edgeText: 'HIGH TABLES PAY +3%',
    derivation: "DESIGN.md §10: nearly the ceiling on its own; +3% high for 80 s ≈ $250 back at Red Line for $200",
  },
  {
    id: 'collector', name: "The Collector's Own", price: 500, buzzS: 150, text: 'NOBODY REMEMBERS THE REST', bonus: 0.05, tiers: ['low', 'mid', 'high'], edgeText: 'EVERY TABLE PAYS +5%',
    derivation: 'DESIGN.md §10: past the ceiling in one glass; +5% everywhere for 150 s ≈ $500 back on a mixed floor',
  },
];

export const DRINK_BY_ID = new Map(DRINKS.map((d) => [d.id, d]));

/** The most buzz you can carry (s), and the buzz at which you're fully drunk (s). */
export const BUZZ = {
  maxS: 180,
  fullS: 90,
  derivation: 'DESIGN.md §10: buzz stacks to 180 s; 90 s of it is as drunk as the screen gets',
};
