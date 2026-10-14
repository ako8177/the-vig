// The duel's music (DECISIONS #82, the owner: "high pressure music that ends when the game ends"):
// while you and the Collector pull levers, the lounge music drops away under a driving pulse in a
// minor key: an eighth-note bass that leans on its flat second, a heartbeat kick, a ticking hat, and
// a high two-note cluster that swells. Each shock tightens it (the bass's filter opens a step).
// Scheduled a beat ahead on the audio clock; `stop` fades it out over half a second.
import type { Audio } from '../engine/audio/audio';

const BPM = 132;
const N = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
// A minor, leaning on B-flat: the bass line, one note an eighth
const BASS = [33, 33, 33, 34, 33, 33, 36, 34];

export class Tension {
  private bus: GainNode | null = null;
  private next = 0;
  private step = 0;
  private on = false;
  /** 0..1: how tight it is (each shock adds to it) */
  heat = 0;

  constructor(private audio: Audio) {}

  start() {
    const ctx = this.audio.ctx;
    if (!ctx || this.on) return;
    this.bus = ctx.createGain();
    this.bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.bus.gain.exponentialRampToValueAtTime(this.level(), ctx.currentTime + 0.8);
    // its own way out (the music bus ducks at the Collector's table), at the music volume
    this.bus.connect(this.audio.roomBus);
    this.next = ctx.currentTime + 0.1;
    this.step = 0;
    this.heat = 0;
    this.on = true;
  }

  stop() {
    const ctx = this.audio.ctx;
    if (!ctx || !this.on || !this.bus) return;
    this.on = false;
    const b = this.bus;
    b.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
    setTimeout(() => b.disconnect(), 1500);
    this.bus = null;
  }

  get playing() {
    return this.on;
  }

  /** the music slider's level, a touch above the lounge music's */
  private level() {
    return Math.max(0.0002, this.audio.vol.music * 0.32);
  }

  update() {
    const ctx = this.audio.ctx;
    if (!ctx || !this.on || !this.bus) return;
    const e8 = 60 / BPM / 2;
    while (this.next < ctx.currentTime + 0.25) {
      this.note(this.next, this.step);
      this.next += e8;
      this.step++;
    }
  }

  private note(t: number, k: number) {
    const ctx = this.audio.ctx!;
    const out = this.bus!;
    const tone = (f: number, dur: number, vol: number, type: OscillatorType, cutoff?: number, at = t) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, at);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      if (cutoff) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(cutoff * 2.5, at);
        lp.frequency.exponentialRampToValueAtTime(cutoff, at + dur * 0.6);
        o.connect(lp);
        lp.connect(g);
      } else o.connect(g);
      g.connect(out);
      o.start(at);
      o.stop(at + dur + 0.02);
    };
    // the bass, every eighth
    tone(N(BASS[k % BASS.length]), 0.2, 0.16, 'sawtooth', 300 + this.heat * 900);
    // the heartbeat: a kick on the beat, a softer one just after on the downbeat of each bar
    if (k % 2 === 0) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(k % 8 === 0 ? 0.42 : 0.3, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + 0.2);
    }
    // a hat ticking on the off-eighths
    if (k % 2 === 1) {
      const len = Math.ceil(ctx.sampleRate * 0.03);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.value = 0.05;
      src.connect(hp);
      hp.connect(g);
      g.connect(out);
      src.start(t);
    }
    // the cluster: two high notes a semitone apart, swelling over two bars, again and again
    if (k % 16 === 0) for (const m of [81, 82]) tone(N(m), 60 / BPM * 8, 0.025 + this.heat * 0.02, 'triangle');
  }
}
