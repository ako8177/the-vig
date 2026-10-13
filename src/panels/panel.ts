// A table's panel: a 320×180 2D canvas drawn by the IMGUI kit. render3d shows it on the table's
// screen as a CanvasTexture and only re-uploads it on frames it redrew (THREEJS-NOTES rule 4).
// Panels read the sim's state to draw and send commands to act; they never write state.
import { UI, NO_POINTER, type Pointer } from '../ui/ui';
import type { Input } from '../engine/input';
import type { Command } from '../sim/commands';
import type { State } from '../sim/state';

export const PANEL_W = 320;
export const PANEL_H = 180;

export interface PanelView {
  state: State;
  /** the player looking at this panel */
  player: number;
  /** seated here: the panel takes input */
  active: boolean;
}

export abstract class Panel {
  readonly canvas: HTMLCanvasElement;
  readonly ui = new UI();
  /** commands this panel wants sent (the app drains them into the sim) */
  out: Command[] = [];
  private ctx: CanvasRenderingContext2D;
  private lastKey = '';

  constructor(readonly table: string) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = PANEL_W;
    this.canvas.height = PANEL_H;
    this.ctx = this.canvas.getContext('2d')!;
  }

  /** What the panel's look depends on, besides the pointer. */
  protected abstract key(v: PanelView): string;
  protected abstract draw(ui: UI, v: PanelView): void;

  /** Redraw if anything it shows changed. Returns true when the canvas changed. */
  update(v: PanelView, pointer: Pointer | null, dt: number, input: Input | null, force = false): boolean {
    const p = v.active && pointer ? pointer : NO_POINTER;
    const k = this.key(v) + `|${v.active}|${p.x | 0},${p.y | 0},${p.down},${p.pressed}`;
    if (!force && k === this.lastKey && !this.ui.audit) return false;
    this.lastKey = k;
    this.ui.begin(this.ctx, p, 1, dt, v.active ? input : null);
    this.draw(this.ui, v);
    this.ui.end();
    return true;
  }

  send(c: Command) {
    this.out.push(c);
  }
}
