// A table's panel: a 320×180 2D canvas drawn by the IMGUI kit. render3d shows it on the table's
// screen as a CanvasTexture and only re-uploads it on frames it redrew (THREEJS-NOTES rule 4).
// Panels read the sim's state to draw and send commands to act; they never write state.
//
// When to redraw: the panel you're sitting at, every frame (it follows the mouse and animates);
// any other panel when the sim has emitted something since (Game.rev) or while its table has a
// round in the air. A hand-picked key went stale the moment a panel showed more than the bank.
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
  /** the sim's tick (round animations) and its event count (redraws) */
  tick: number;
  rev: number;
}

export abstract class Panel {
  readonly canvas: HTMLCanvasElement;
  readonly ui = new UI();
  /** commands this panel wants sent (the app drains them into the sim) */
  out: Command[] = [];
  /** play a sound (the app hooks this to the audio engine) */
  sound: (id: string, vol?: number, pitch?: number) => void = () => {};
  private ctx: CanvasRenderingContext2D;
  private lastRev = -1;
  /** timers on a panel (a mark clearing) tick once a second even with no events */
  private lastSec = -1;
  private wasActive = false;

  constructor(readonly table: string) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = PANEL_W;
    this.canvas.height = PANEL_H;
    this.ctx = this.canvas.getContext('2d')!;
  }

  protected abstract draw(ui: UI, v: PanelView): void;

  /** Something on it is moving (a round in the air, a wheel spinning): keep redrawing. */
  protected animating(_v: PanelView): boolean {
    return false;
  }

  /** Redraw if anything it shows may have changed. Returns true when the canvas changed. */
  update(v: PanelView, pointer: Pointer | null, dt: number, input: Input | null, force = false): boolean {
    const sec = Math.floor(v.tick / 60);
    const due = force || v.active || this.wasActive || v.rev !== this.lastRev || sec !== this.lastSec || this.animating(v) || this.ui.audit;
    this.wasActive = v.active;
    if (!due) return false;
    this.lastRev = v.rev;
    this.lastSec = sec;
    const p = v.active && pointer ? pointer : NO_POINTER;
    this.ui.begin(this.ctx, p, 1, dt, v.active ? input : null);
    this.draw(this.ui, v);
    this.ui.end();
    return true;
  }

  send(c: Command) {
    this.out.push(c);
  }
}
