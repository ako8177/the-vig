// Immediate-mode UI kit drawn on a 2D canvas in "UI pixels" (canvas px / scale). The same kit
// draws the HUD overlay and every table's panel (a canvas shown on the table's screen as a
// CanvasTexture), so a slot machine's reels are the same code as the HUD (THREEJS-NOTES rule 4).
// The pointer is passed in: for the HUD it is the mouse, for a seated table it is the mouse
// mapped onto the table's screen.
import { C, PALETTE, rgba } from '../data/palette';
import type { Input } from '../engine/input';
import { drawText, textWidth, wrapText, LINE_H, FONT_H } from './font';
import type { AuditRec, AuditKind } from './audit';

export interface Rect { x: number; y: number; w: number; h: number }
export interface TipLine { text: string; color?: number; icon?: string }
/** Where the pointer is on this canvas (canvas px) and what its left button did this frame. */
export interface Pointer { x: number; y: number; down: boolean; pressed: boolean }

export type PanelStyle = 'dark' | 'card' | 'felt' | 'inset';

export const NO_POINTER: Pointer = { x: -1e4, y: -1e4, down: false, pressed: false };

export class UI {
  ctx!: CanvasRenderingContext2D;
  input: Input | null = null;
  scale = 1;
  w = 0;
  h = 0;
  mx = 0;
  my = 0;
  private pointer: Pointer = NO_POINTER;
  /** mouse is over some UI element this frame */
  captured = false;
  private blocks: Rect[] = [];
  private prevBlocks: Rect[] = [];
  tooltip: TipLine[] | null = null;
  tipWidth = 180;
  /** where the mouse stood when tooltips were held (holdTips): none until it moves */
  private tipsHeldAt: { x: number; y: number } | null = null;
  time = 0;
  clicked = false;
  /** key -> scroll offset */
  scroll = new Map<string, number>();
  focus: string | null = null;
  /** seconds since the last frame (for things that animate per second, not per frame) */
  dt = 1 / 60;
  hoverId: string | null = null;
  sfx: (id: string) => void = () => {};
  /** record what each frame draws for the overlap audit (src/ui/audit.ts, npm run screens) */
  audit = false;
  /** the last complete frame's records, while audit is on */
  lastAudit: AuditRec[] = [];
  private auditLog: AuditRec[] = [];
  private auditLayer: AuditRec['layer'] = 'ui';
  private clips: Rect[] = [];

  private rec(kind: AuditKind, x: number, y: number, w: number, h: number, s?: string) {
    this.auditLog.push({ kind, x, y, w, h, s, clip: this.clips[this.clips.length - 1], layer: this.auditLayer, seq: this.auditLog.length });
  }

  begin(ctx: CanvasRenderingContext2D, pointer: Pointer, scale: number, dt: number, input: Input | null = null) {
    this.ctx = ctx;
    this.input = input;
    this.pointer = pointer;
    this.scale = scale;
    this.w = Math.floor(ctx.canvas.width / scale);
    this.h = Math.floor(ctx.canvas.height / scale);
    this.mx = Math.floor(pointer.x / scale);
    this.my = Math.floor(pointer.y / scale);
    if (this.tipsHeldAt && Math.hypot(this.mx - this.tipsHeldAt.x, this.my - this.tipsHeldAt.y) > 2) this.tipsHeldAt = null;
    this.time += dt;
    this.dt = dt;
    this.tooltip = null;
    this.prevBlocks = this.blocks;
    this.blocks = [];
    this.captured = this.prevBlocks.some((b) => this.inside(b));
    this.clicked = pointer.pressed;
    this.hoverId = null;
    if (this.audit) {
      this.lastAudit = this.auditLog;
      this.auditLog = [];
      this.clips = [];
    }
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  /** mouse captured by UI drawn this frame (call after drawing) */
  get overUI() {
    return this.blocks.some((b) => this.inside(b)) || this.captured;
  }

  inside(r: Rect) {
    return this.mx >= r.x && this.my >= r.y && this.mx < r.x + r.w && this.my < r.y + r.h;
  }

  hover(x: number, y: number, w: number, h: number) {
    return this.mx >= x && this.my >= y && this.mx < x + w && this.my < y + h;
  }

  block(x: number, y: number, w: number, h: number) {
    this.blocks.push({ x, y, w, h });
  }

  /** consume the left click (so it doesn't fall through) */
  eat() {
    this.clicked = false;
    this.input?.consumeMouse(0);
  }

  fill(x: number, y: number, w: number, h: number, c: number, a = 1) {
    if (this.audit && a >= 0.85 && w > 2 && h > 2) this.rec('fill', x, y, w, h);
    this.ctx.fillStyle = a >= 1 ? PALETTE[c] : rgba(c, a);
    this.ctx.fillRect(x, y, w, h);
  }

  /** a 1 px rectangle outline */
  frame(x: number, y: number, w: number, h: number, c: number) {
    this.ctx.fillStyle = PALETTE[c];
    this.ctx.fillRect(x, y, w, 1);
    this.ctx.fillRect(x, y + h - 1, w, 1);
    this.ctx.fillRect(x, y, 1, h);
    this.ctx.fillRect(x + w - 1, y, 1, h);
  }

  /** A panel. `edge` colors the border (a tier color on a table's card). */
  panel(x: number, y: number, w: number, h: number, style: PanelStyle = 'dark', opts: { edge?: number; blocking?: boolean } = {}) {
    x = Math.round(x);
    y = Math.round(y);
    if (opts.blocking ?? true) this.block(x, y, w, h);
    if (this.audit) this.rec('panel', x, y, w, h);
    const f = (xx: number, yy: number, ww: number, hh: number, c: number) => this.fill(xx, yy, ww, hh, c);
    switch (style) {
      case 'dark':
        this.fill(x, y, w, h, C.ink, 0.9);
        this.frame(x, y, w, h, opts.edge ?? C.smoke);
        break;
      case 'card':
        f(x, y, w, h, C.ink);
        f(x + 1, y + 1, w - 2, h - 2, C.bone);
        f(x + 1, y + h - 2, w - 2, 1, C.dust);
        if (opts.edge !== undefined) this.frame(x, y, w, h, opts.edge);
        break;
      case 'felt':
        f(x, y, w, h, C.ink);
        f(x + 1, y + 1, w - 2, h - 2, C.felt);
        f(x + 1, y + 1, w - 2, 1, C.feltLo);
        if (opts.edge !== undefined) {
          this.frame(x, y, w, h, opts.edge);
          this.frame(x + 2, y + 2, w - 4, h - 4, opts.edge);
        }
        break;
      case 'inset':
        f(x, y, w, h, C.night);
        f(x, y, w, 1, C.ink);
        f(x, y, 1, h, C.ink);
        break;
    }
  }

  text(s: string, x: number, y: number, c = C.bone, opts: { scale?: number; shadow?: number; align?: 'left' | 'center' | 'right' } = {}) {
    const sc = opts.scale ?? 1;
    let tx = x;
    if (opts.align === 'center') tx = x - Math.floor((textWidth(s) * sc) / 2);
    else if (opts.align === 'right') tx = x - textWidth(s) * sc;
    if (this.audit && s.trim()) this.rec('text', Math.round(tx), Math.round(y), textWidth(s) * sc, FONT_H * sc, s);
    return drawText(this.ctx, s, Math.round(tx), Math.round(y), PALETTE[c], sc, opts.shadow !== undefined ? PALETTE[opts.shadow] : null);
  }

  /** wrapped paragraph; returns height used */
  para(s: string, x: number, y: number, w: number, c = C.bone, lineH = LINE_H): number {
    const lines = wrapText(s, w);
    lines.forEach((l, i) => this.text(l, x, y + i * lineH, c));
    return lines.length * lineH;
  }

  /** A button. `edge` is the color of its border and label (a tier color on a table's bet button). */
  button(id: string, x: number, y: number, w: number, h: number, label: string, opts: { disabled?: boolean; active?: boolean; tip?: TipLine[] | string; edge?: number } = {}): boolean {
    const hov = this.hover(x, y, w, h) && !opts.disabled;
    const down = hov && this.pointer.down;
    const edge = opts.disabled ? C.smoke : opts.edge ?? C.dust;
    if (this.audit) this.rec('button', x, y, w, h);
    this.fill(x, y, w, h, C.ink);
    this.fill(x + 1, y + 1, w - 2, h - 2, opts.disabled ? C.night : down ? C.ink : hov || opts.active ? C.smoke : C.night);
    this.frame(x, y, w, h, edge);
    if (!down && !opts.disabled) this.fill(x + 1, y + 1, w - 2, 1, hov ? edge : C.smoke);
    if (label) {
      const col = opts.disabled ? C.ash : hov ? C.white : opts.edge ?? C.bone;
      this.text(label, x + w / 2, y + Math.floor((h - 7) / 2) + (down ? 1 : 0), col, { align: 'center' });
    }
    if (hov) {
      this.hoverId = id;
      if (opts.tip) this.tip(typeof opts.tip === 'string' ? [{ text: opts.tip }] : opts.tip);
    }
    if (hov && this.clicked) {
      this.eat();
      this.sfx('click');
      return true;
    }
    return false;
  }

  bar(x: number, y: number, w: number, h: number, frac: number, col: number, bg = C.ink) {
    this.fill(x, y, w, h, bg);
    this.fill(x + 1, y + 1, Math.round((w - 2) * Math.max(0, Math.min(1, frac))), h - 2, col);
  }

  /** vertical scroll region helper: returns offset after wheel input */
  scrollOffset(id: string, x: number, y: number, w: number, h: number, contentH: number): number {
    let off = this.scroll.get(id) ?? 0;
    const wheel = this.input?.mouse.wheel ?? 0;
    if (this.hover(x, y, w, h) && wheel && this.input) {
      off += wheel * 24;
      this.input.mouse.wheel = 0;
    }
    off = Math.max(0, Math.min(Math.max(0, contentH - h), off));
    this.scroll.set(id, off);
    if (contentH > h) {
      const th = Math.max(10, (h * h) / contentH);
      this.fill(x + w - 3, y, 3, h, C.night);
      this.fill(x + w - 3, y + (off / (contentH - h)) * (h - th), 3, th, C.ash);
    }
    return off;
  }

  clip(x: number, y: number, w: number, h: number) {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(x, y, w, h);
    this.ctx.clip();
    if (this.audit) this.clips.push({ x, y, w, h });
  }
  unclip() {
    this.ctx.restore();
    if (this.audit) this.clips.pop();
  }

  /** single-line text field */
  textField(id: string, x: number, y: number, w: number, value: string, max = 20): string {
    const hov = this.hover(x, y, w, 16);
    if (this.clicked && hov) {
      this.focus = id;
      this.eat();
    } else if (this.clicked && !hov && this.focus === id) this.focus = null;
    const focused = this.focus === id;
    this.fill(x, y, w, 16, C.ink);
    this.fill(x + 1, y + 1, w - 2, 14, focused ? C.smoke : C.night);
    const input = this.input;
    if (focused && input) {
      input.textFocus = true;
      for (const ch of input.text) {
        if (ch === '\b') value = value.slice(0, -1);
        else if (value.length < max && /[\w .'!?&-]/.test(ch)) value += ch;
      }
      // a letter typed here is never also a hotkey
      for (const c of [...input.pressed]) if (c.startsWith('Key') || c.startsWith('Digit')) input.pressed.delete(c);
      if (input.keyPressed('Enter')) this.focus = null;
    }
    this.text(value, x + 4, y + 4, C.bone);
    if (focused && Math.floor(this.time * 2) % 2 === 0) this.fill(x + 5 + textWidth(value), y + 3, 1, 9, C.bone);
    return value;
  }

  /** no tooltips until the mouse moves (a new screen opened under a resting cursor) */
  holdTips() {
    this.tipsHeldAt = { x: this.mx, y: this.my };
  }

  tip(lines: TipLine[], width = 180) {
    this.tooltip = lines;
    this.tipWidth = width;
  }

  end() {
    // the tooltip floats above the UI on purpose
    this.auditLayer = 'tip';
    if (this.tooltip && this.tooltip.length && !this.tipsHeldAt) this.drawTip(this.tooltip);
    this.auditLayer = 'ui';
    if (!this.focus && this.input) this.input.textFocus = false;
  }

  private drawTip(lines: TipLine[]) {
    const maxW = this.tipWidth;
    const wrapped: { text: string; color: number }[] = [];
    for (const l of lines) for (const t of wrapText(l.text, maxW)) wrapped.push({ text: t, color: l.color ?? C.bone });
    let w = 0;
    for (const l of wrapped) w = Math.max(w, textWidth(l.text));
    w += 10;
    const h = wrapped.length * LINE_H + 8;
    let x = this.mx + 12, y = this.my + 12;
    if (x + w > this.w) x = this.mx - w - 4;
    if (y + h > this.h) y = this.h - h - 2;
    x = Math.max(2, x);
    y = Math.max(2, y);
    this.fill(x + 2, y + 2, w, h, C.ink, 0.4);
    this.fill(x, y, w, h, C.ink);
    this.fill(x + 1, y + 1, w - 2, h - 2, C.night);
    this.fill(x + 1, y + 1, w - 2, 1, C.smoke);
    wrapped.forEach((l, i) => this.text(l.text, x + 5, y + 5 + i * LINE_H, l.color));
  }
}
