// The Circuit's rules per floor (DESIGN.md §6; DECISIONS #80, the owner's lever duel). Floor 1
// only in the slice: ten levers under the Collector's table, three of them wired live to the
// battery. You and he take turns pulling one; a live lever shocks whoever pulled it. Two shocks
// and you're done (a life, and the quota is paid); two shocks and he's dead (you keep the quota).

export interface CircuitRules {
  floor: number;
  levers: number;
  live: number;
  /** shocks that end it: yours (you lose a life and the duel), his (he dies) */
  playerShocks: number;
  collShocks: number;
  /** what a dead lever you pull pays the team */
  safeBank: number;
  safeMarkers: number;
  /** wire traces the Insulated Kit gives each duel (free; they don't use your turn) */
  kitTraces: number;
  /** how long his turn takes to come, and longer after a shock (presentation pacing in the sim) */
  collectorTurnS: number;
  afterShockS: number;
  /** measured by the pace test (tests/pace.test.ts), printed at the choice */
  odds: { win: number; withKit: number; bane: number };
  derivation: string;
}

export const CIRCUIT_RULES: CircuitRules[] = [
  {
    floor: 1, levers: 10, live: 3, playerShocks: 2, collShocks: 2, safeBank: 300, safeMarkers: 1, kitTraces: 2,
    collectorTurnS: 2.8, afterShockS: 4.6, odds: { win: 0.5, withKit: 0.76, bane: 0.42 },
    derivation: 'DESIGN.md §6 (DECISIONS #80): 10 levers, 3 live, two shocks each, both pick at random: a coin flip (50%); the Insulated Kit\'s 2 traces 76%; the Bane\'s 4 live levers 42%',
  },
];
