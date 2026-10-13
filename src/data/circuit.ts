// The Circuit's rules per floor (DESIGN.md §6). Floor 1 only in the slice.

export interface CircuitRules {
  floor: number;
  circuits: number;
  overloads: number;
  fuses: number;
  inspectCost: number;
  safeBank: number;
  safeMarkers: number;
  /** what an overloaded activation costs the team on this floor */
  overloadCost: 'life' | 'bank';
  /** what the Collector does with what he sees: 'avoid' revealed overloads only, or also 'take' revealed safes */
  sees: 'avoid' | 'take';
  /** the Collector's turn takes this long, so you can watch it (presentation pacing in the sim) */
  collectorTurnS: number;
  /** measured by the pace test's sensible team (tests/pace.test.ts), printed at the choice */
  odds: { win: number; lives: number };
  derivation: string;
}

export const CIRCUIT_RULES: CircuitRules[] = [
  {
    floor: 1, circuits: 10, overloads: 2, fuses: 2, inspectCost: 100, safeBank: 300, safeMarkers: 1,
    overloadCost: 'life', sees: 'avoid', collectorTurnS: 1.2, odds: { win: 0.48, lives: 0.16 },
    derivation: 'DESIGN.md §6 (DECISIONS #52): 10 circuits, 2 overloaded, the Collector has 2 fuses; inspect $100; safe +$300 +1 marker; an overload costs a life; a sensible team wins 48%',
  },
];
