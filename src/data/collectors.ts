// The Collectors (DECISIONS #81, the owner's plan): the house sends one to your table every night.
// Kill one at his signature game and the next night a new one sits in his chair. Each has a game
// (only the Circuit exists yet: every one plays it for now), may unlock a charm for every run to
// come, and the ones you've killed by the end of a run decide its ending. What each one says is
// here too: presentation reads it, the sim never does.
import type { CharmId } from './charms';
import { C } from './palette';

export interface CollectorDef {
  id: string;
  name: string;
  /** his signature game (the only one built: the Circuit) */
  game: 'circuit';
  /** the charm that joins the pool, for every run after, the first time you kill him */
  unlocks: CharmId | null;
  /** the color his eyes burn */
  eyes: number;
  /** how he introduces himself the first night he sits down (null: he needs no introduction) */
  intro: string[] | null;
  derivation: string;
}

export const COLLECTORS: CollectorDef[] = [
  {
    id: 'collector', name: 'THE COLLECTOR', game: 'circuit', unlocks: 'insulated', eyes: C.coll, intro: null,
    derivation: 'DESIGN.md §7 (DECISIONS #81): the first; beat him at the Circuit and the Insulated Kit joins the pool',
  },
  {
    id: 'auditor', name: 'THE AUDITOR', game: 'circuit', unlocks: null, eyes: C.high,
    intro: ['SO YOU ARE THE ONE.', 'I REPLACE THE LAST COLLECTOR. I AM NOT AS PATIENT.'],
    derivation: 'DESIGN.md §7 (DECISIONS #81): the second; his own game comes later (the Circuit for now)',
  },
  {
    id: 'receiver', name: 'THE RECEIVER', game: 'circuit', unlocks: null, eyes: C.soul,
    intro: ['TWO OF US, GONE.', 'THE HOUSE SENT ME TO TIDY UP.'],
    derivation: 'DESIGN.md §7 (DECISIONS #81): the third; his own game comes later (the Circuit for now)',
  },
];

/** Who sits at the table on a run's n-th Collector (past the roster, the last one again). */
export const collectorOf = (idx: number) => COLLECTORS[Math.min(idx, COLLECTORS.length - 1)];

export interface EndingDef {
  id: string;
  title: string;
  text: string;
  /** how many Collectors you killed in the run (at least) */
  killed: number;
  derivation: string;
}

/** The run's ending, by how many Collectors you killed before walking out (the most killed wins). */
export const ENDINGS: EndingDef[] = [
  { id: 'paid', title: 'PAID IN FULL', killed: 0, text: 'THREE NIGHTS, THREE QUOTAS. THE DEBT IS PAID. THE STAIRS GO DOWN, NOT UP.', derivation: 'DESIGN.md §7 (DECISIONS #81): walked out, no Collector killed' },
  { id: 'chair', title: 'AN EMPTY CHAIR', killed: 1, text: 'A COLLECTOR DIED AT YOUR TABLE. YOU WALK OUT RICHER, AND THE HOUSE KNOWS YOUR FACE.', derivation: 'DESIGN.md §7 (DECISIONS #81): walked out having killed one or two' },
  { id: 'house', title: 'THE HOUSE IS YOURS', killed: 3, text: 'THREE CHAIRS, EMPTY. ON THE LAST ONE, THE KEYS TO THE VIG.', derivation: 'DESIGN.md §7 (DECISIONS #81): walked out having killed three' },
];

export const endingFor = (killed: number) => [...ENDINGS].reverse().find((e) => killed >= e.killed)!;

/** What a Collector says, by the moment ({quota}, {short}, {name} are filled in). */
export const LINES = {
  made: [['MIDNIGHT. SIT DOWN.', 'YOU OWE ME {quota}. PAY ME... OR PLAY ME FOR IT.'], ['THERE YOU ARE.', '{quota}. PAY IT, OR WE PLAY A LITTLE GAME.']],
  short: [['{short} SHORT.', 'THAT IS A SHAME. FOR YOU.'], ['NOT ENOUGH.', 'I TAKE WHAT I AM OWED, ONE WAY OR ANOTHER.']],
  paid: [['SENSIBLE. DULL, BUT SENSIBLE.'], ['MONEY. HOW ORDINARY.']],
  challenge: [['OH, GOOD.', 'LET ME SHOW YOU SOMETHING.']],
  rules: [['TEN LEVERS. THREE ARE WIRED TO THE BATTERY.', 'WE TAKE TURNS. TWO SHOCKS AND YOU ARE FINISHED.', 'TWO FOR ME... WELL. WE WILL SEE. YOU FIRST.']],
  youSafe: [['LUCKY.'], ['THAT ONE WAS DEAD. THIS TIME.'], ['YOU ARE ENJOYING THIS.'], ['HM. KEEP GOING.']],
  hisSafe: [['NOTHING. AS I EXPECTED.'], ['YOUR TURN.'], ['STILL HERE.'], ['THE HOUSE PROVIDES.']],
  youShocked: [['HOW DOES THAT FEEL?'], ["THAT'S ONE."], ["DON'T STOP NOW. IT GETS WORSE."]],
  hisShocked: [['...THAT STUNG.'], ['ONE. YOU ARE COUNTING TOO, AREN\'T YOU.'], ['HH. IMPRESSIVE.']],
  hisDeath: [['NO... NOT LIKE TH—']],
  youLost: [['...YOU ARE STILL BREATHING? CURIOUS.', 'NO MATTER. LET US TALK ABOUT YOUR PUNISHMENT.']],
};
