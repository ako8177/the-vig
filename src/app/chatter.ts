// The crowd's talk (DECISIONS #78, the owner: "background noise emulating talking when passing by
// groups of people"). No recordings and no words: each group of people (a table, the bar, a booth,
// a cluster of railbirds) has two or three synthesized voices, a buzzing source at a speaking pitch
// through two vowel-like formant filters, cut into syllables and phrases with pauses and the odd
// laugh, muffled so it reads as talk you can't follow. A group is heard within 9 m, louder as you
// walk up to it, panned to where it stands; at 0:00 the room hushes.
import type { Audio } from '../engine/audio/audio';
import type { Floor } from '../data/floors';

interface Voice {
  /** the voice's pitch (Hz) and when its next syllable starts (audio time); the last pitch and
   *  vowel, so the next syllable glides on from them */
  f0: number;
  last: number;
  f1: number;
  f2: number;
  next: number;
  /** syllables left in this phrase */
  left: number;
}

interface Group {
  x: number;
  z: number;
  room: string;
  voices: Voice[];
  gain: GainNode | null;
  pan: StereoPannerNode | null;
}

const HEAR_M = 9;
const AHEAD = 0.3;

export class Chatter {
  private groups: Group[] = [];
  private bus: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;

  constructor(private audio: Audio, floor: Floor) {
    // cluster the crowd: everyone not walking, joined to a group within 2.4 m of its middle
    const raw: { x: number; z: number; room: string; n: number }[] = [];
    for (const p of floor.npcs) {
      if (p.role === 'walker' || p.role === 'pianist') continue;
      const g = raw.find((r) => r.room === p.room && Math.hypot(r.x - p.x, r.z - p.z) < 2.4);
      if (g) {
        g.x = (g.x * g.n + p.x) / (g.n + 1);
        g.z = (g.z * g.n + p.z) / (g.n + 1);
        g.n++;
      } else raw.push({ x: p.x, z: p.z, room: p.room, n: 1 });
    }
    let k = 0;
    for (const r of raw) {
      const voices = Math.min(3, Math.max(1, r.n - (r.n > 3 ? 1 : 0)));
      this.groups.push({
        x: r.x, z: r.z, room: r.room, gain: null, pan: null,
        voices: Array.from({ length: voices }, () => {
          k++;
          // a mix of lower and higher voices
          return { f0: k % 2 ? 100 + ((k * 37) % 50) : 175 + ((k * 53) % 60), next: 0, left: 0, last: 0, f1: 0, f2: 0 };
        }),
      });
    }
  }

  private setup(ctx: AudioContext) {
    // the talk is muffled (you hear it, you can't follow it) and sits under the sound effects
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 1250;
    this.bus = ctx.createGain();
    // a little room: two short echoes, so the syllables smear together as a crowd's do
    for (const [t, k] of [[0.043, 0.3], [0.071, 0.22]] as [number, number][]) {
      const dl = ctx.createDelay(0.2);
      dl.delayTime.value = t;
      const dg = ctx.createGain();
      dg.gain.value = k;
      this.filter.connect(dl);
      dl.connect(dg);
      dg.connect(this.bus);
    }
    // measured: 3.5 puts a group you stand beside a few dB under the music (DECISIONS #78)
    this.bus.gain.value = 3.5;
    this.filter.connect(this.bus);
    this.bus.connect(this.audio.sfxBus);
    for (const g of this.groups) {
      g.gain = ctx.createGain();
      g.gain.gain.value = 0;
      g.pan = ctx.createStereoPanner();
      g.gain.connect(g.pan);
      g.pan.connect(this.filter);
    }
  }

  /**
   * One syllable, made to blur into the next (DECISIONS #83: the first version beeped): a buzz at a
   * gliding pitch, a soft low hum of it under two wide vowel formants that slide from the last
   * vowel to this one, a breath through the same vowel, slow edges. The bus muffles and smears it.
   */
  private syllable(ctx: AudioContext, out: GainNode, v: Voice, at: number, dur: number, laugh: boolean) {
    const f0 = v.f0 * (laugh ? 1.3 : 0.92 + Math.random() * 0.16);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(v.last || f0, at);
    o.frequency.linearRampToValueAtTime(f0, at + dur * 0.3);
    o.frequency.linearRampToValueAtTime(f0 * (laugh ? 0.8 : 0.9 + Math.random() * 0.12), at + dur);
    v.last = f0 * 0.97;
    const env = ctx.createGain();
    const peak = (laugh ? 0.05 : 0.03 + Math.random() * 0.015) * 1.4;
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.05, dur * 0.35));
    env.gain.setValueAtTime(peak * 0.85, at + dur * 0.65);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.07);
    // the vowel, sliding from the last one
    const t1 = laugh ? 750 : 320 + Math.random() * 450, t2 = laugh ? 1250 : 950 + Math.random() * 1200;
    const mk = (from: number, to: number, q: number, gain: number) => {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(from, at);
      f.frequency.linearRampToValueAtTime(to, at + dur * 0.6);
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(f);
      f.connect(g);
      g.connect(env);
      return f;
    };
    mk(v.f1 || t1, t1, 3.5, 1);
    const f2 = mk(v.f2 || t2, t2, 4.5, 0.55);
    v.f1 = t1;
    v.f2 = t2;
    // the body: the same buzz, low-passed, under the vowel
    const body = ctx.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = 700;
    const bg = ctx.createGain();
    bg.gain.value = 0.35;
    o.connect(body);
    body.connect(bg);
    bg.connect(env);
    // breath through the vowel
    const len = Math.ceil(ctx.sampleRate * (dur + 0.08));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const nb = ctx.createBiquadFilter();
    nb.type = 'bandpass';
    nb.frequency.value = f2.frequency.value;
    nb.Q.value = 2;
    const ng = ctx.createGain();
    ng.gain.value = Math.random() < 0.35 ? 0.5 : 0.18;
    src.connect(nb);
    nb.connect(ng);
    ng.connect(env);
    env.connect(out);
    o.start(at);
    o.stop(at + dur + 0.1);
    src.start(at);
  }

  /**
   * Follow the listener: `you` (position and facing yaw, radians, 0 looking down -Z), the rooms
   * drawn, and how far into the 0:00 dark the room is (0..1).
   */
  update(you: { x: number; z: number; yaw: number }, rooms: ReadonlySet<string>, hush: number) {
    const ctx = this.audio.ctx;
    if (!ctx || this.audio.muted) return;
    if (!this.bus) this.setup(ctx);
    const now = ctx.currentTime;
    const fx = -Math.sin(you.yaw), fz = -Math.cos(you.yaw);
    for (const g of this.groups) {
      const dx = g.x - you.x, dz = g.z - you.z;
      const d = Math.hypot(dx, dz);
      const near = rooms.has(g.room) && d < HEAR_M;
      const level = near ? Math.pow(1 - d / HEAR_M, 1.6) * (1 - 0.85 * hush) : 0;
      g.gain!.gain.setTargetAtTime(level, now, 0.15);
      if (!near) {
        for (const v of g.voices) v.next = 0;
        continue;
      }
      // left or right of where you face: the side of the cross product
      const side = (fx * dz - fz * dx) / (d || 1);
      g.pan!.pan.setTargetAtTime(Math.max(-0.85, Math.min(0.85, -side)), now, 0.1);
      for (const v of g.voices) {
        if (v.next < now) v.next = now + Math.random() * 0.8;
        while (v.next < now + AHEAD) {
          if (v.left <= 0) {
            // a new phrase after a pause (now and then a syllable becomes a laugh)
            v.left = 3 + Math.floor(Math.random() * 7);
            v.next += 0.35 + Math.random() * 1.4;
            v.last = 0;
            continue;
          }
          const laugh = v.left > 2 && Math.random() < 0.04;
          const n = laugh ? 4 : 1;
          for (let i = 0; i < n; i++) {
            const dur = laugh ? 0.12 : 0.12 + Math.random() * 0.16;
            this.syllable(ctx, g.gain!, v, v.next, dur, laugh);
            // the next starts as this one fades: connected speech, not blips
            v.next += dur - (laugh ? -0.04 : 0.02 + Math.random() * 0.03);
          }
          v.left -= n;
        }
      }
    }
  }
}
