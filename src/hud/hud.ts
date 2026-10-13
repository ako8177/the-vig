// The HUD: a 640×360 2D canvas over the 3D view, scaled with it (THREEJS-NOTES rule 4: one UI
// code path for the HUD and the table panels). Clock, bank against quota, lives, souls, markers,
// active marks; the seat prompt and the crosshair while walking; the pause and enter cards.
import { UI, type Pointer } from '../ui/ui';
import { C } from '../data/palette';
import { ICON, textWidth } from '../ui/font';
import type { State } from '../sim/state';
import { TICKS_PER_S } from '../sim/state';
import type { Input } from '../engine/input';

export const HUD_W = 640;
export const HUD_H = 360;

export interface HudView {
  state: State;
  player: number;
  /** when a table is in reach: "E  SIT  HI-LO DICE" and its odds line, in its tier color
   *  (pillar 5: tier, odds and loss cost readable in one glance, before you even sit) */
  prompt: { title: string; odds: string; color: number } | null;
  seated: boolean;
  overlay: 'enter' | 'paused' | null;
}

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

export class Hud {
  readonly ui = new UI();
  private ctx: CanvasRenderingContext2D;

  constructor(readonly canvas: HTMLCanvasElement) {
    canvas.width = HUD_W;
    canvas.height = HUD_H;
    this.ctx = canvas.getContext('2d')!;
  }

  draw(v: HudView, pointer: Pointer, dt: number, input: Input) {
    const ui = this.ui;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, HUD_W, HUD_H);
    ui.begin(this.ctx, pointer, 1, dt, input);
    const s = v.state;
    const me = s.players[v.player];

    // top left: the clock, counting down to 0:00
    const secs = Math.ceil(s.clock / TICKS_PER_S);
    const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    ui.panel(6, 6, 64, 26, 'dark', { blocking: false });
    ui.text(ICON.clock, 12, 15, C.dust);
    ui.text(clock, 24, 11, C.white, { scale: 2 });

    // top center: the bank against the quota
    const bw = 200, bx = (HUD_W - bw) / 2;
    ui.panel(bx, 6, bw, 26, 'dark', { blocking: false });
    ui.text('BANK', bx + 6, 10, C.dust);
    ui.text(money(s.bank), bx + 6 + textWidth('BANK') + 6, 10, C.gold);
    const q = `QUOTA ${money(s.quota)}`;
    ui.text(q, bx + bw - 6, 10, C.bone, { align: 'right' });
    ui.bar(bx + 6, 22, bw - 12, 6, s.bank / s.quota, s.bank >= s.quota ? C.low : C.mid);

    // top right: lives, souls, markers
    const rx = HUD_W - 6 - 118;
    ui.panel(rx, 6, 118, 26, 'dark', { blocking: false });
    let x = rx + 6;
    for (let i = 0; i < 3; i++) {
      ui.text(ICON.heart, x, 9, i < me.lives ? C.high : C.smoke);
      x += 8;
    }
    ui.text(`${ICON.soul}${me.ghost ? 1 : 0}`, rx + 6, 20, me.ghost ? C.soul : C.ash);
    ui.text(`${ICON.marker} ${s.markers}`, rx + 70, 9, C.marker);
    ui.text('MARKERS', rx + 70, 20, C.ash);

    // bottom left: active marks
    const mine = s.marks.filter((m) => m.player === v.player || m.player === -1);
    let my = HUD_H - 8 - mine.length * 12;
    for (const m of mine) {
      const label = `${ICON.mark} ${m.id.toUpperCase()}${m.stacks > 1 ? ' x' + m.stacks : ''}  ${Math.ceil(m.left / TICKS_PER_S)}S${m.player === -1 ? '  TEAM' : ''}`;
      ui.panel(6, my - 2, textWidth(label) + 10, 12, 'dark', { blocking: false, edge: C.mid });
      ui.text(label, 11, my, C.midHi);
      my += 12;
    }

    // walking: a crosshair dot and the seat prompt
    if (!v.seated && !v.overlay) {
      ui.fill(HUD_W / 2, HUD_H / 2, 1, 1, C.white);
      if (v.prompt) {
        const { title, odds, color } = v.prompt;
        const w = Math.max(textWidth(title), textWidth(odds)) + 16;
        const py = HUD_H / 2 + 24;
        ui.panel((HUD_W - w) / 2, py, w, 28, 'dark', { blocking: false, edge: color });
        ui.text(title, HUD_W / 2, py + 4, C.white, { align: 'center' });
        ui.text(odds, HUD_W / 2, py + 16, color, { align: 'center' });
      }
    }

    if (v.overlay) {
      ui.fill(0, 0, HUD_W, HUD_H, C.ink, 0.6);
      const title = v.overlay === 'enter' ? 'THE VIG' : 'PAUSED';
      const lines = v.overlay === 'enter'
        ? ['CLICK TO STEP ONTO THE FLOOR', 'WASD WALK  MOUSE LOOK  E SIT / STAND  ESC PAUSE']
        : ['CLICK TO RETURN TO THE FLOOR'];
      const w = 300, h = 34 + lines.length * 12;
      const px = (HUD_W - w) / 2, py = (HUD_H - h) / 2;
      ui.panel(px, py, w, h, 'dark', { edge: C.coll });
      ui.text(title, HUD_W / 2, py + 8, C.collHi, { scale: 2, align: 'center' });
      lines.forEach((l, i) => ui.text(l, HUD_W / 2, py + 28 + i * 12, i === 0 ? C.white : C.dust, { align: 'center' }));
    }
    ui.end();
  }
}
