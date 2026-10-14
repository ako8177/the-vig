// The tables' show: how long each round is in the air and where its beats fall, as fractions of
// that time. The panels animate from these and the sounds are built from them, so a bounce you see
// is a thud you hear. The sim holds each result back for `s` (the table's resolveS). Presentation
// pacing, not a design number: every s stays under the table's round time in DESIGN.md §3.

export const FEEL = {
  /** Hi-Lo's die: shaken, thrown onto the baize, five bounces, settles */
  dice: { s: 1.6, shake: 0.16, bounces: [0.3, 0.5, 0.65, 0.76, 0.84], land: 0.9 },
  /** Dead Man's two dice: the second lands a beat after the first */
  deadman: { s: 2.2, shake: 0.14, landA: 0.62, landB: 0.9 },
  /** Red Line: a riffle shuffle, the deal, the flip */
  card: { s: 2.1, shuffle: [0.02, 0.42], deal: [0.47, 0.62], flip: [0.7, 0.8] },
  /** Twenty-One: a card off the shoe every `gap` s (the deal, a hit, the hole card turning, the
   *  dealer's draws), so the dealer's run of draws fits inside the table's 0.6 s resolve */
  deal: { gap: 0.14 },
  /** the Wheel of Marks: whole turns before it slows onto the slot */
  wheel: { s: 4.2, turns: 3 },
  /** the Bandit: the lever, then each reel stops in turn */
  bandit: { s: 1.8, stops: [0.45, 0.66, 0.86] },
  /** a won round's celebration on the panel (s) */
  celebrateS: 2.2,
  /** what a win must clear to be big, or a jackpot (net $) */
  bigWin: 700,
  jackpot: 4000,
};
