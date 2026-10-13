// Audio: one AudioContext with master / music / sfx / room buses. Sound effects come from the
// jsfxr bank (sfxr.ts) or, failing that, a small synthesized fallback; music from the synth
// player (music.ts). Unlocked on the first user gesture, as browsers require. Positional table
// sounds (THREEJS-NOTES rule 10) hang off render3d's AudioListener and arrive with Milestone 7.
import { playSfxr } from './sfxr';
import { Music } from './music';

export interface Vol { master: number; music: number; sfx: number }

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
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = (id === 'click' ? 880 : 440) * pitch;
    g.gain.setValueAtTime(0.06 * v, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    o.connect(g);
    g.connect(this.sfxBus);
    o.start(now);
    o.stop(now + 0.1);
  }

  update() {
    if (this.ctx && this.music) this.music.update(this.ctx.currentTime);
  }
}
