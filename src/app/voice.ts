// Voices, synthesized (DECISIONS #82): the Collector's murmur while his words come up on screen,
// and a scream when the current goes through someone (the owner: "a painful scream, not too loud").
// No recordings and no words: a buzzing source at a pitch, two or three vowel formants, an envelope.
import type { Audio } from '../engine/audio/audio';

interface Vowel {
  f1: number;
  f2: number;
  f3: number;
}
const VOWELS: Vowel[] = [
  { f1: 700, f2: 1150, f3: 2600 }, // ah
  { f1: 450, f2: 1900, f3: 2600 }, // eh
  { f1: 350, f2: 800, f3: 2400 }, // oh
  { f1: 300, f2: 2200, f3: 3000 }, // ee
  { f1: 600, f2: 1000, f3: 2500 }, // uh
];

/** One voiced sound through formant filters into the SFX bus. */
function voiced(a: Audio, opts: { f0: number; f0To?: number; vibrato?: number; vowel: Vowel; dur: number; vol: number; grit?: number; at?: number }) {
  const ctx = a.ctx;
  if (!ctx || a.muted) return;
  const t0 = ctx.currentTime + (opts.at ?? 0);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(opts.f0, t0);
  if (opts.f0To) o.frequency.exponentialRampToValueAtTime(opts.f0To, t0 + opts.dur * 0.8);
  if (opts.vibrato) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 7 + Math.random() * 3;
    depth.gain.value = opts.f0 * opts.vibrato;
    lfo.connect(depth);
    depth.connect(o.frequency);
    lfo.start(t0);
    lfo.stop(t0 + opts.dur + 0.05);
  }
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(opts.vol, t0 + Math.min(0.06, opts.dur * 0.2));
  env.gain.setValueAtTime(opts.vol, t0 + opts.dur * 0.55);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  for (const [f, q, g] of [[opts.vowel.f1, 6, 1], [opts.vowel.f2, 8, 0.7], [opts.vowel.f3, 10, 0.35]] as [number, number, number][]) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = q;
    const gg = ctx.createGain();
    gg.gain.value = g;
    o.connect(bp);
    bp.connect(gg);
    gg.connect(env);
  }
  // a rasp under it: filtered noise, for a throat under strain
  if (opts.grit) {
    const len = Math.ceil(ctx.sampleRate * opts.dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = opts.vowel.f2;
    bp.Q.value = 1.2;
    const gg = ctx.createGain();
    gg.gain.value = opts.grit;
    src.connect(bp);
    bp.connect(gg);
    gg.connect(env);
    src.start(t0);
  }
  env.connect(a.sfxBus);
  o.start(t0);
  o.stop(t0 + opts.dur + 0.05);
}

/** A syllable of the Collector's speech: low, slow, a little hoarse. `pitch` is per Collector. */
export function murmur(a: Audio, pitch = 1) {
  voiced(a, {
    f0: (78 + Math.random() * 18) * pitch, f0To: (70 + Math.random() * 14) * pitch,
    vowel: VOWELS[Math.floor(Math.random() * VOWELS.length)], dur: 0.09 + Math.random() * 0.08, vol: 0.09, grit: 0.15,
  });
}

/** A scream: yours (higher), or his (lower, rougher). Kept under the sound effects' peaks. */
export function scream(a: Audio, who: 'you' | 'him') {
  const you = who === 'you';
  const f0 = you ? 240 + Math.random() * 40 : 110 + Math.random() * 20;
  voiced(a, { f0, f0To: f0 * (you ? 1.5 : 1.35), vibrato: 0.07, vowel: VOWELS[0], dur: you ? 1.1 : 1.3, vol: you ? 0.11 : 0.12, grit: you ? 0.25 : 0.5 });
  // a gasp after it
  voiced(a, { f0: f0 * 0.9, f0To: f0 * 0.7, vowel: VOWELS[4], dur: 0.35, vol: 0.05, grit: 0.4, at: you ? 1.2 : 1.4 });
}
