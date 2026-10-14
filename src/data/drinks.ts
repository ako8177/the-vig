// The bar on the main floor (DESIGN.md §10; DECISIONS #67, the owner's idea): drinks bought with
// cash from the bank. A drink is a buzz: seconds of being drunk, which stack up to a ceiling, and
// the drunker you are, the more the room swims (presentation: src/render3d/view.ts, src/app/app.ts).
// In the slice a drink buys nothing but the feeling: it's a way to spend money that isn't a bet.

export type DrinkId = 'beer' | 'martini' | 'whiskey' | 'collector';

export interface DrinkDef {
  id: DrinkId;
  name: string;
  price: number;
  /** seconds of buzz it adds (of floor time) */
  buzzS: number;
  /** what the bartender says it is */
  text: string;
  derivation: string;
}

export const DRINKS: DrinkDef[] = [
  { id: 'beer', name: 'Draft Beer', price: 40, buzzS: 25, text: 'A LITTLE LOOSE', derivation: 'DESIGN.md §10: the cheapest drink, a short buzz' },
  { id: 'martini', name: 'Dry Martini', price: 120, buzzS: 50, text: 'THE ROOM GETS WARM', derivation: 'DESIGN.md §10: a cocktail, about two beers of buzz' },
  { id: 'whiskey', name: 'Double Whiskey', price: 200, buzzS: 80, text: 'THE FLOOR TILTS', derivation: 'DESIGN.md §10: a double, nearly the ceiling on its own' },
  { id: 'collector', name: "The Collector's Own", price: 500, buzzS: 150, text: 'NOBODY REMEMBERS THE REST', derivation: 'DESIGN.md §10: the house special, past the ceiling in one glass' },
];

export const DRINK_BY_ID = new Map(DRINKS.map((d) => [d.id, d]));

/** The most buzz you can carry (s), and the buzz at which you're fully drunk (s). */
export const BUZZ = {
  maxS: 180,
  fullS: 90,
  derivation: 'DESIGN.md §10: buzz stacks to 180 s; 90 s of it is as drunk as the screen gets',
};
