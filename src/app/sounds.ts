// The Vig's sounds, synthesized (no files): dice shaken and thrown onto baize, a riffle shuffle and
// a card flip, a wheel's pegs clacking past the pointer, a slot's lever, whirr and reel stops, and
// wins that sound like wins. Timings come from src/data/feel.ts so each thud lands on a bounce the
// panel draws. Registered on the audio engine at start (Audio.define); Milestone 7's jsfxr bank can
// replace any of them by id.
import type { Audio, Note } from '../engine/audio/audio';
import { FEEL } from '../data/feel';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** a die rattling in a cupped hand */
const shake = (dur: number): Note[] =>
  Array.from({ length: Math.round(dur / 0.03) }, (_, i) => ({ f: rnd(2200, 3400), dur: 0.018, at: i * 0.03 + rnd(0, 0.01), vol: 0.035, type: 'noise' as const, q: 3 }));

/** a die landing on baize: a soft thud with a little clack of its corner */
const thud = (at: number, vol: number): Note[] => [
  { f: rnd(160, 240), dur: 0.09, at, vol: 0.16 * vol, type: 'noise', q: 0.7 },
  { f: 95, to: 60, dur: 0.08, at, vol: 0.09 * vol, type: 'sine' },
  { f: rnd(1800, 2600), dur: 0.02, at: at + 0.005, vol: 0.04 * vol, type: 'noise', q: 4 },
];

/** a die skidding to rest on the cloth */
const settle = (at: number): Note[] => [{ f: 700, dur: 0.16, at, vol: 0.03, type: 'noise', q: 0.8 }];

/** the throw: rattle, then a thud on every bounce, softer each time */
function diceThrow(land: number, s: number, shakeS: number): Note[] {
  const out: Note[] = [...shake(shakeS)];
  const b = FEEL.dice.bounces.map((f) => f / FEEL.dice.land);
  b.forEach((f, i) => out.push(...thud(shakeS + (land * s - shakeS) * f, Math.pow(0.68, i))));
  out.push(...settle(land * s));
  return out;
}

/** a coin dropping on a pile: a bright tink */
const tink = (at: number, vol = 0.04): Note => ({ f: rnd(2400, 4200), dur: 0.09, at, vol, type: 'triangle' });

/** coins cascading for `dur` seconds */
const cascade = (n: number, dur: number, from = 0, vol = 0.04): Note[] =>
  Array.from({ length: n }, () => tink(from + Math.pow(Math.random(), 0.7) * dur, vol * rnd(0.5, 1)));

/** a chord, struck together */
const chord = (fs: number[], at: number, dur: number, vol: number, type: OscillatorType = 'square'): Note[] =>
  fs.map((f) => ({ f, at, dur, vol, type }));

const N = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export function defineSounds(a: Audio) {
  // ---- dice
  a.define('dice', () => diceThrow(FEEL.dice.land, FEEL.dice.s, FEEL.dice.shake));
  a.define('dice2', () => {
    const d = FEEL.deadman;
    const one = diceThrow(d.landA, d.s, d.shake);
    // the second die: the same throw, landing later
    const lag = (d.landB - d.landA) * d.s;
    const two = FEEL.dice.bounces.map((f, i) => thud(d.shake + (d.landA * d.s - d.shake) * (f / FEEL.dice.land) + lag * 0.9, Math.pow(0.6, i) * 0.9)).flat();
    return [...one, ...two, ...settle(d.landB * d.s)];
  });

  // ---- cards: a riffle shuffle, the bridge, the deal, the flip
  a.define('riffle', () => {
    const c = FEEL.card, s = c.s;
    const [a0, a1] = c.shuffle.map((f) => f * s);
    const n = 26;
    const out: Note[] = Array.from({ length: n }, (_, i) => {
      // the riffle speeds up as the halves fall together
      const u = i / (n - 1);
      return { f: rnd(2600, 3800), dur: 0.016, at: a0 + (a1 - a0) * Math.pow(u, 0.8), vol: 0.035, type: 'noise' as const, q: 2.5 };
    });
    out.push({ f: 1400, dur: 0.22, at: a1, vol: 0.05, type: 'noise', q: 0.9 });
    out.push({ f: 1800, dur: 0.16, at: c.deal[0] * s, vol: 0.05, type: 'noise', q: 1.2 });
    out.push({ f: 2600, dur: 0.035, at: c.flip[0] * s + 0.05, vol: 0.09, type: 'noise', q: 2 }, { f: 1300, dur: 0.03, at: c.flip[0] * s + 0.05, vol: 0.04, type: 'triangle' });
    return out;
  });
  // a card off the shoe: the snap of it leaving, the slap of it landing flat on the felt
  a.define('card', () => [
    { f: rnd(3600, 4400), dur: 0.035, vol: 0.12, type: 'noise', q: 1.6 },
    { f: rnd(900, 1200), dur: 0.06, at: 0.03, vol: 0.16, type: 'noise', q: 0.9 },
    { f: 180, to: 110, dur: 0.04, at: 0.03, vol: 0.05, type: 'sine' },
  ]);
  // the hole card turned over: a flick of the corner, then it lands face up
  a.define('flip', () => [
    { f: rnd(2600, 3000), dur: 0.025, vol: 0.12, type: 'noise', q: 2.2 },
    { f: 1300, dur: 0.03, at: 0.01, vol: 0.04, type: 'triangle' },
    { f: rnd(1000, 1300), dur: 0.05, at: 0.07, vol: 0.13, type: 'noise', q: 1 },
  ]);

  // ---- the wheel: a hand spins it; each peg clacks past the pointer
  a.define('wheelspin', [{ f: 900, to: 300, dur: 0.5, vol: 0.05, type: 'noise' }]);
  a.define('peg', () => [
    { f: rnd(1600, 1900), dur: 0.018, vol: 0.06, type: 'triangle' },
    { f: 3200, dur: 0.012, vol: 0.03, type: 'noise', q: 3 },
  ]);

  // ---- the Bandit: lever, the reels whirring, a clunk as each stops
  a.define('lever', [
    { f: 420, dur: 0.07, vol: 0.12, type: 'noise', q: 1 },
    { f: 140, to: 80, dur: 0.12, vol: 0.08, type: 'sine' },
    ...Array.from({ length: 22 }, (_, i) => ({ f: 1100, dur: 0.02, at: 0.1 + i * 0.05, vol: 0.022, type: 'noise' as const, q: 2 })),
  ]);
  a.define('clunk', [
    { f: 520, dur: 0.06, vol: 0.12, type: 'noise', q: 1.2 },
    { f: 150, to: 90, dur: 0.08, vol: 0.08, type: 'sine' },
  ]);

  // ---- outcomes
  a.define('win', () => [...chord([N(84), N(88)], 0, 0.12, 0.03, 'triangle'), ...chord([N(91)], 0.1, 0.22, 0.035, 'triangle'), ...cascade(5, 0.35, 0.05)]);
  a.define('bigwin', () => [
    ...[72, 76, 79, 84, 88, 91].map((m, i) => ({ f: N(m), dur: 0.14, at: i * 0.07, vol: 0.04, type: 'square' as const })),
    ...chord([N(84), N(88), N(91), N(96)], 0.45, 0.6, 0.025, 'triangle'),
    ...cascade(18, 1.0, 0.3),
  ]);
  a.define('jackpot', () => [
    // a fanfare: three hits and a held chord, bells, and a long spill of coins
    ...chord([N(72), N(76), N(79)], 0, 0.12, 0.035),
    ...chord([N(72), N(76), N(79)], 0.16, 0.12, 0.035),
    ...chord([N(74), N(77), N(81)], 0.32, 0.12, 0.035),
    ...chord([N(76), N(79), N(84), N(88)], 0.5, 1.1, 0.035),
    ...[96, 100, 103, 108].map((m, i) => ({ f: N(m), dur: 0.5, at: 0.55 + i * 0.12, vol: 0.03, type: 'sine' as const })),
    ...cascade(40, 2.0, 0.4, 0.05),
  ]);
  a.define('lose', () => [
    { f: 200, dur: 0.1, vol: 0.12, type: 'noise', q: 0.7 },
    { f: N(57), to: N(52), dur: 0.35, at: 0.05, vol: 0.04, type: 'triangle' },
  ]);
  a.define('life', [
    // a heartbeat, then the floor drops
    { f: 70, to: 45, dur: 0.12, vol: 0.18, type: 'sine' },
    { f: 70, to: 45, dur: 0.12, at: 0.22, vol: 0.14, type: 'sine' },
    { f: 110, to: 40, dur: 0.9, at: 0.45, vol: 0.08, type: 'sawtooth' },
    { f: 240, dur: 0.5, at: 0.45, vol: 0.06, type: 'noise', q: 0.6 },
  ]);
  a.define('chips', () => cascade(6, 0.25, 0, 0.03).map((n) => ({ ...n, f: n.f * 0.6 })));
  // a pour, ice, a clink of glasses
  a.define('pour', () => [
    ...Array.from({ length: 10 }, (_, i) => ({ f: rnd(500, 900), dur: 0.06, at: i * 0.05, vol: 0.03, type: 'noise' as const, q: 4 })),
    { f: 3100, dur: 0.12, at: 0.6, vol: 0.04, type: 'triangle' },
    { f: 4150, dur: 0.18, at: 0.62, vol: 0.03, type: 'triangle' },
  ]);

  // ---- the room: somewhere across the floor, another machine pays
  a.define('distant', () => {
    const root = [72, 74, 77, 79][Math.floor(Math.random() * 4)];
    return [0, 4, 7, 12].map((iv, i) => ({ f: N(root + iv), dur: 0.12, at: i * 0.08, vol: 0.006, type: 'square' as const }));
  });
}
