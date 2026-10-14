// Keyboard + mouse input with rebindable actions. Edges are latched per frame.
// Under pointer lock the mouse's movement accumulates into `look` (first-person mouse look);
// without it the mouse is a cursor over the HUD or a seated table's panel.

export const ACTIONS = ['forward', 'back', 'left', 'right', 'interact', 'pause', 'debug'] as const;
export type Action = (typeof ACTIONS)[number];

/** The debug keys exist only in dev builds or with ?debug in the address. */
export const DEBUG_KEYS = !!import.meta.env?.DEV || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug'));
/** The actions a player sees in the controls lists. */
export const SHOWN_ACTIONS = ACTIONS.filter((a) => a !== 'debug' || DEBUG_KEYS);

export const ACTION_LABELS: Record<Action, string> = {
  forward: 'Walk forward', back: 'Walk back', left: 'Step left', right: 'Step right',
  interact: 'Sit / stand', pause: 'Stand / pause', debug: 'Debug panel',
};

export const DEFAULT_BINDS: Record<Action, string[]> = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  interact: ['KeyE'], pause: ['Escape'], debug: ['Backquote'],
};

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', ShiftLeft: 'LShift',
    ShiftRight: 'RShift', ControlLeft: 'LCtrl', Escape: 'Esc', Backquote: '`', Equal: '=', Minus: '-',
    Space: 'Space', Tab: 'Tab', Enter: 'Enter', Backspace: 'Bksp',
  };
  return map[code] ?? code;
}

export class Input {
  down = new Set<string>();
  pressed = new Set<string>();
  released = new Set<string>();
  binds: Record<Action, string[]> = structuredClone(DEFAULT_BINDS);
  mouse = { x: 0, y: 0, down: [false, false, false], pressed: [false, false, false], released: [false, false, false], wheel: 0, moved: false };
  /** Mouse movement (CSS px) accumulated under pointer lock since the last frame. */
  look = { dx: 0, dy: 0 };
  /** Is the pointer locked to the game (first-person look)? */
  locked = false;
  /** The last lock request was refused (the browser blocks a re-lock for ~1 s after Esc). */
  lockFailed = false;
  /** Typed characters this frame (for text fields). */
  text = '';
  /** When true, actions are suppressed (a text field has focus). */
  textFocus = false;
  /** Set by UI to capture the next key for rebinding. */
  captureKey: ((code: string) => void) | null = null;
  private el: HTMLElement | null = null;
  /** the size of the last mouse step under lock, and whether the next is the first since locking */
  private lastStep = 0;
  private fresh = false;

  attach(el: HTMLElement) {
    this.el = el;
    window.addEventListener('keydown', (e) => {
      if (this.captureKey) {
        e.preventDefault();
        const cb = this.captureKey;
        this.captureKey = null;
        cb(e.code);
        return;
      }
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) this.text += e.key;
      if (e.key === 'Backspace') this.text += '\b';
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Backquote') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouse.down = [false, false, false];
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      this.fresh = this.locked;
      // leaving pointer lock with Esc: the browser eats the keydown, so latch it here
      if (!this.locked) this.pressed.add('PointerUnlock');
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockFailed = true;
    });
    el.addEventListener('mousemove', (e) => {
      if (this.locked) {
        // Chromium on Windows sends a bogus jump under pointer lock now and then (the first event
        // after locking, and lone spikes of hundreds of pixels): the view skipped across the room.
        // Drop the first event, and any step far bigger than both a sane flick and the one before.
        const step = Math.hypot(e.movementX, e.movementY);
        const spike = this.fresh || (step > 300 && step > 6 * Math.max(this.lastStep, 20));
        this.fresh = false;
        this.lastStep = step;
        if (spike) return;
        this.look.dx += e.movementX;
        this.look.dy += e.movementY;
        return;
      }
      this.mouse.x = e.offsetX;
      this.mouse.y = e.offsetY;
      this.mouse.moved = true;
    });
    el.addEventListener('mousedown', (e) => {
      if (e.button > 2) return;
      this.mouse.down[e.button] = true;
      this.mouse.pressed[e.button] = true;
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button > 2) return;
      this.mouse.down[e.button] = false;
      this.mouse.released[e.button] = true;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => {
      this.mouse.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
  }

  /** Ask for pointer lock (must run inside a user gesture: a click). */
  lock() {
    if (!this.el || this.locked) return;
    this.lockFailed = false;
    const el = this.el;
    const plain = () => {
      try {
        const p = el.requestPointerLock() as unknown;
        if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => (this.lockFailed = true));
      } catch {
        /* headless browsers without pointer lock */
      }
    };
    try {
      // raw mouse counts, no OS acceleration: steadier, and it skips the path Windows' jumps come
      // through. Where it isn't supported, the promise rejects and we ask again without it.
      const p = (el as unknown as { requestPointerLock(o?: { unadjustedMovement?: boolean }): unknown }).requestPointerLock({ unadjustedMovement: true });
      if (p && typeof (p as Promise<void>).catch === 'function') {
        (p as Promise<void>).catch((err: unknown) => {
          if ((err as { name?: string })?.name === 'NotSupportedError') plain();
          else this.lockFailed = true;
        });
      }
    } catch {
      plain();
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
    this.locked = false;
  }

  /** Did the pointer lock end this frame (Esc in the browser, alt-tab)? */
  get unlockedThisFrame() {
    return this.pressed.has('PointerUnlock');
  }

  isDown(a: Action): boolean {
    if (this.textFocus) return false;
    for (const k of this.binds[a]) if (this.down.has(k)) return true;
    return false;
  }

  wasPressed(a: Action): boolean {
    if (this.textFocus && a !== 'pause') return false;
    for (const k of this.binds[a]) if (this.pressed.has(k)) return true;
    return false;
  }

  keyPressed(code: string) {
    return this.pressed.has(code);
  }

  /** Consume an action edge so lower UI layers don't also react. */
  consume(a: Action) {
    for (const k of this.binds[a]) this.pressed.delete(k);
  }

  consumeMouse(button = 0) {
    this.mouse.pressed[button] = false;
    this.mouse.released[button] = false;
  }

  /** Take the mouse look accumulated since the last call. */
  takeLook(): { dx: number; dy: number } {
    const l = { ...this.look };
    this.look.dx = this.look.dy = 0;
    return l;
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouse.pressed = [false, false, false];
    this.mouse.released = [false, false, false];
    this.mouse.wheel = 0;
    this.mouse.moved = false;
    this.text = '';
  }
}
