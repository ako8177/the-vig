// The crowd's talk (DECISIONS #78, the owner: "background noise emulating talking when passing by
// groups of people"). No recordings and no words: each group of people (a table, the bar, a booth,
// a cluster of railbirds) has two or three synthesized voices, a buzzing source at a speaking pitch
// through two vowel-like formant filters, cut into syllables and phrases with pauses and the odd
// laugh, muffled so it reads as talk you can't follow. A group is heard within 9 m, louder as you
// walk up to it, panned to where it stands; at 0:00 the room hushes.
import type { Audio } from '../engine/audio/audio';
import type { Floor } from '../data/floors';

interface Voice {
  /** the voice's pitch (Hz) and when its next syllable starts (audio time) */
  f0: number;
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
          return { f0: k % 2 ? 100 + ((k * 37) % 50) : 175 + ((k * 53) % 60), next: 0, left: 0 };
        }),
      });
    }
  }

  private setup(ctx: AudioContext) {
    // the talk is muffled (you hear it, you can't follow it) and sits under the sound effects
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 1700;
    this.bus = ctx.createGain();
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

  /** One syllable: a voiced buzz through two formants, a breath of consonant at its front. */
  private syllable(ctx: AudioContext, out: GainNode, v: Voice, at: number, dur: number, laugh: boolean) {
    const f0 = v.f0 * (laugh ? 1.35 : 0.9 + Math.random() * 0.25);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, at);
    o.frequency.linearRampToValueAtTime(f0 * (laugh ? 0.85 : 0.92 + Math.random() * 0.16), at + dur);
    const env = ctx.createGain();
    const peak = laugh ? 0.05 : 0.035 + Math.random() * 0.02;
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(peak, at + 0.025);
    env.gain.setValueAtTime(peak, at + dur * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    // a vowel: F1 300-800 Hz, F2 900-2300 Hz, a new one each syllable
    const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
    f1.type = f2.type = 'bandpass';
    f1.frequency.value = laugh ? 750 : 300 + Math.random() * 500;
    f2.frequency.value = laugh ? 1250 : 900 + Math.random() * 1400;
    f1.Q.value = 7;
    f2.Q.value = 9;
    o.connect(f1);
    o.connect(f2);
    f1.connect(env);
    f2.connect(env);
    env.connect(out);
    o.start(at);
    o.stop(at + dur + 0.02);
    // a consonant's hiss or tap at the front, now and then
    if (!laugh && Math.random() < 0.5) {
      const len = Math.ceil(ctx.sampleRate * 0.03);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2500 + Math.random() * 2000;
      const g = ctx.createGain();
      g.gain.value = 0.02;
      src.connect(bp);
      bp.connect(g);
      g.connect(out);
      src.start(at);
    }
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
            continue;
          }
          const laugh = v.left > 2 && Math.random() < 0.04;
          const n = laugh ? 4 : 1;
          for (let i = 0; i < n; i++) {
            const dur = laugh ? 0.11 : 0.08 + Math.random() * 0.14;
            this.syllable(ctx, g.gain!, v, v.next, dur, laugh);
            v.next += dur + (laugh ? 0.05 : 0.015 + Math.random() * 0.05);
          }
          v.left -= n;
        }
      }
    }
  }
}
