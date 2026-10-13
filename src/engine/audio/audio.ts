// Audio: one AudioContext with master / music / sfx / room buses. Sound effects come from the
// jsfxr bank (sfxr.ts) or, failing that, a small synthesized fallback; music from the synth
// player (music.ts). Unlocked on the first user gesture, as browsers require. Positional table
// sounds (THREEJS-NOTES rule 10) hang off render3d's AudioListener and arrive with Milestone 7.
import { playSfxr } from './sfxr';
import { Music } from './music';

export interface Vol { master: number; music: number; sfx: number }

/** A fallback sound's note: a tone (optionally sliding to `to`) or a band of noise. */
interface Note { f: number; dur: number; at?: number; to?: number; vol?: number; type?: OscillatorType | 'noise' }

/** The fallback sounds, until Milestone 7's jsfxr bank (sfxr.ts) replaces them one by one. */
const SYNTH: Record<string, Note[]> = {
  click: [{ f: 880, dur: 0.06, vol: 0.04 }],
  deny: [{ f: 180, dur: 0.12, vol: 0.05 }, { f: 140, dur: 0.12, at: 0.08, vol: 0.05 }],
  chip: [{ f: 2400, dur: 0.04, vol: 0.03, type: 'triangle' }, { f: 3100, dur: 0.05, at: 0.03, vol: 0.025, type: 'triangle' }],
  dice: [0, 0.05, 0.11, 0.18, 0.26].map((at) => ({ f: 900, dur: 0.04, at, vol: 0.07, type: 'noise' as const })),
  reel: [0, 0.08, 0.16, 0.24, 0.32, 0.4].map((at) => ({ f: 1300, dur: 0.03, at, vol: 0.03, type: 'noise' as const })),
  card: [{ f: 2000, dur: 0.07, vol: 0.05, type: 'noise' }],
  tick: [{ f: 1600, dur: 0.02, vol: 0.03, type: 'triangle' }],
  win: [523, 659, 784].map((f, i) => ({ f, dur: 0.12, at: i * 0.07, vol: 0.05, type: 'square' as const })),
  bigwin: [523, 659, 784, 1047, 1319].map((f, i) => ({ f, dur: 0.16, at: i * 0.07, vol: 0.05, type: 'square' as const })),
  push: [{ f: 440, dur: 0.1, vol: 0.04 }],
  lose: [{ f: 220, to: 110, dur: 0.3, vol: 0.05, type: 'sawtooth' }],
  mark: [{ f: 330, dur: 0.1, vol: 0.05 }, { f: 311, dur: 0.18, at: 0.1, vol: 0.05 }],
  life: [{ f: 160, to: 55, dur: 0.7, vol: 0.09, type: 'sawtooth' }, { f: 200, dur: 0.4, vol: 0.06, type: 'noise' }],
  warning: [0, 0.18].map((at) => ({ f: 740, dur: 0.12, at, vol: 0.05, type: 'square' as const })),
  midnight: [{ f: 98, dur: 2.4, vol: 0.09, type: 'sawtooth' }, { f: 73, dur: 2.8, at: 0.2, vol: 0.08, type: 'triangle' }],
  buy: [{ f: 988, dur: 0.08, vol: 0.04 }, { f: 1319, dur: 0.14, at: 0.07, vol: 0.04 }],
  safe: [{ f: 660, dur: 0.1, vol: 0.05, type: 'triangle' }, { f: 990, dur: 0.16, at: 0.08, vol: 0.05, type: 'triangle' }],
  overload: [{ f: 120, dur: 0.5, vol: 0.1, type: 'noise' }, { f: 80, to: 40, dur: 0.6, vol: 0.08, type: 'sawtooth' }],
  inspect: [{ f: 1200, to: 1800, dur: 0.12, vol: 0.03, type: 'sine' }],
  spin: [0, 0.1, 0.2, 0.32, 0.46, 0.62, 0.8, 1.0, 1.25, 1.55, 1.9, 2.3].map((at) => ({ f: 1500, dur: 0.025, at, vol: 0.03, type: 'triangle' as const })),
  boon: [523, 784, 1047, 1568].map((f, i) => ({ f, dur: 0.25, at: i * 0.1, vol: 0.05, type: 'triangle' as const })),
  bane: [{ f: 147, dur: 0.6, vol: 0.08, type: 'sawtooth' }, { f: 139, dur: 0.8, at: 0.3, vol: 0.08, type: 'sawtooth' }],
  night: [392, 523].map((f, i) => ({ f, dur: 0.3, at: i * 0.15, vol: 0.05, type: 'triangle' as const })),
};

export class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  musicBus!: GainNode;
  sfxBus!: GainNode;
  /** the room's non-positional bed; it drops at 0:00 (THREEJS-NOTES rule 10) */
  roomBus!: GainNode;
  music: Music | null = null;
  vol: Vol;
  muted = false;
  private lastSfx = new Map<string, number>();

  constructor(settings: Vol) {
    this.vol = { ...settings };
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx: AudioContext = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.musicBus = ctx.createGain();
      this.sfxBus = ctx.createGain();
      this.roomBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.roomBus.connect(this.master);
      this.applyVol();
      this.music = new Music(ctx, this.musicBus);
      this.music.start(0, ctx.currentTime + 0.3);
    } catch {
      this.ctx = null;
      this.music = null;
    }
  }

  applySettings(s: Vol) {
    this.vol = { ...s };
    this.applyVol();
  }

  private applyVol() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.24, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
  }

  /** Play a sound effect: from the jsfxr bank if it has one, else a short synthesized blip. */
  sfx(id: string, v = 1, pitch = 1) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    // the same sound twice within 30 ms is one sound
    if (now - (this.lastSfx.get(id) ?? -1) < 0.03) return;
    this.lastSfx.set(id, now);
    if (playSfxr(ctx, this.sfxBus, id, v, pitch)) return;
    const recipe = SYNTH[id] ?? SYNTH.click;
    for (const n of recipe) this.note(n, now, v, pitch);
  }

  /** One synthesized note or noise burst of a fallback sound. */
  private note(n: Note, now: number, v: number, pitch: number) {
    const ctx = this.ctx!;
    const t0 = now + (n.at ?? 0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime((n.vol ?? 0.06) * v, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
    g.connect(this.sfxBus);
    if (n.type === 'noise') {
      const len = Math.ceil(ctx.sampleRate * n.dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = n.f * pitch;
      f.Q.value = 1.2;
      src.connect(f);
      f.connect(g);
      src.start(t0);
      return;
    }
    const o = ctx.createOscillator();
    o.type = n.type ?? 'square';
    o.frequency.setValueAtTime(n.f * pitch, t0);
    if (n.to) o.frequency.exponentialRampToValueAtTime(n.to * pitch, t0 + n.dur);
    o.connect(g);
    o.start(t0);
    o.stop(t0 + n.dur + 0.02);
  }

  /** The room's bed: a low hum and murmur, `level` 0..1 (it drops at 0:00). */
  roomBed(level: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.bed) {
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = last * 0.985 + (Math.random() * 2 - 1) * 0.015;
        d[i] = last * 6;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const hum = ctx.createOscillator();
      hum.type = 'sine';
      hum.frequency.value = 55;
      const hg = ctx.createGain();
      hg.gain.value = 0.25;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain);
      hum.connect(hg);
      hg.connect(gain);
      gain.connect(this.roomBus);
      src.start();
      hum.start();
      this.bed = gain;
    }
    this.bed.gain.setTargetAtTime(0.05 * level, ctx.currentTime, 0.6);
  }
  private bed: GainNode | null = null;

  update() {
    if (this.ctx && this.music) this.music.update(this.ctx.currentTime);
  }
}
