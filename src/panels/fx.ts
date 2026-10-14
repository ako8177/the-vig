// The panels' moving parts: dice that tumble and bounce on the baize, sparkles, easing. Pure
// drawing from a time value, so every frame is a function of the sim's tick (and the same on every
// peer). Rotated sprites are drawn with nearest sampling, then the pixel pass snaps them like the rest.
import type { UI } from '../ui/ui';
import { C, PALETTE } from '../data/palette';
import { FEEL } from '../data/feel';

export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
export const out3 = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const outBack = (t: number) => {
  const c = 1.7, x = clamp01(t) - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};

// ---------------------------------------------------------------- dice

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

const sprites = new Map<string, HTMLCanvasElement>();
/** A die face as a small canvas (cached): a bone body, a bevel, the pips. */
function dieSprite(size: number, face: number, pip: number, body: number): HTMLCanvasElement {
  const key = `${size}|${face}|${pip}|${body}|${PALETTE[body]}`;
  let c = sprites.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  const f = (px: number, py: number, w: number, h: number, role: number) => {
    x.fillStyle = PALETTE[role];
    x.fillRect(px, py, w, h);
  };
  f(1, 0, size - 2, size, C.ink);
  f(0, 1, size, size - 2, C.ink);
  f(1, 1, size - 2, size - 2, body);
  f(2, 1, size - 4, 1, C.white);
  f(1, size - 3, size - 2, 2, C.dust);
  const p = Math.max(2, Math.round(size / 7));
  const step = (size - 2 * p - 6) / 2;
  for (const [cx, cy] of PIPS[face] ?? []) f(Math.round(3 + cx * step), Math.round(3 + cy * step), p, p, pip);
  sprites.set(key, c);
  return c;
}

/** A die centered on (cx, cy), turned `angle` radians. */
export function drawDieAt(ui: UI, cx: number, cy: number, size: number, face: number, angle = 0, pip = C.ink, body = C.bone) {
  const ctx = ui.ctx;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(cx), Math.round(cy));
  ctx.rotate(angle);
  ctx.drawImage(dieSprite(size, face, pip, body), -size / 2, -size / 2);
  ctx.restore();
}

/**
 * A thrown die's flight, `u` 0..1 from release to rest: how far along (0..1), how high above the
 * cloth (px), its spin, and which hop it is on. The bounces fall where FEEL.dice puts the thuds.
 */
export function throwPath(u: number, height: number, turns = 2.5) {
  const land = FEEL.dice.land;
  const b = FEEL.dice.bounces.map((f) => f / land);
  u = clamp01(u);
  let h = 0, hop = b.length;
  if (u < b[0]) {
    hop = 0;
    h = height * (1 - Math.pow(u / b[0], 2));
  } else {
    for (let k = 1; k < b.length; k++) {
      if (u < b[k]) {
        hop = k;
        const s = (u - b[k - 1]) / (b[k] - b[k - 1]);
        h = 4 * height * Math.pow(0.42, k) * s * (1 - s);
        break;
      }
    }
  }
  return { along: out3(u), h, angle: (1 - out3(u)) * turns * Math.PI * 2, hop };
}

/**
 * A die thrown across a tray from (x0, y0) to rest on (x1, y1): rattled in the hand before the
 * throw, a face that changes every hop, the real face once it lands. `t` 0..1 is the round's time.
 */
export function drawThrownDie(
  ui: UI, t: number, from: { x: number; y: number }, to: { x: number; y: number }, size: number,
  face: number, salt: number, land = FEEL.dice.land, shakeEnd = FEEL.dice.shake / FEEL.dice.s, pip = C.ink,
) {
  if (t < shakeEnd) {
    // in the hand: a rattle at the throw point
    const j = Math.sin(t * 90 + salt) * 2;
    drawDieAt(ui, from.x + j, from.y - 16 + Math.cos(t * 70) * 2, size, ((salt + Math.floor(t * 40)) % 6) + 1, j * 0.2, pip);
    return;
  }
  const u = (t - shakeEnd) / (land - shakeEnd);
  if (u >= 1) {
    drawShadow(ui, to.x, to.y + size / 2 - 1, size, 1);
    drawDieAt(ui, to.x, to.y, size, face, 0, pip);
    return;
  }
  const p = throwPath(u, 26);
  const x = from.x + (to.x - from.x) * p.along;
  const y = from.y + (to.y - from.y) * p.along;
  drawShadow(ui, x, y + size / 2 - 1, size * (1 - Math.min(0.5, p.h / 60)), 1 - Math.min(0.7, p.h / 40));
  drawDieAt(ui, x, y - p.h, size, ((salt + p.hop * 5) % 6) + 1, p.angle, pip);
}

/** A soft shadow on the cloth. */
export function drawShadow(ui: UI, cx: number, y: number, w: number, a: number) {
  ui.fill(Math.round(cx - w / 2 + 2), Math.round(y), Math.round(w - 4), 2, C.ink, 0.45 * a);
  ui.fill(Math.round(cx - w / 2 + 4), Math.round(y + 2), Math.round(w - 8), 1, C.ink, 0.3 * a);
}

/** A baize tray: dark green cloth, a wooden rail, a few fibres catching the lamp. */
export function drawTray(ui: UI, x: number, y: number, w: number, h: number) {
  ui.fill(x - 3, y - 3, w + 6, h + 6, C.woodLo);
  ui.fill(x - 2, y - 2, w + 4, 1, C.wood);
  ui.fill(x, y, w, h, C.baize);
  ui.fill(x, y, w, 2, C.baizeLo);
  ui.fill(x, y, 2, h, C.baizeLo);
  for (let i = 0; i < 30; i++) {
    // scattered by a hash (a plain stride lined them up on a diagonal)
    const hx = Math.imul(i + 1, 2654435761) >>> 0, hy = Math.imul(i + 7, 40503) ^ (hx >>> 13);
    const px = x + 3 + (hx % (w - 6)), py = y + 3 + ((hy >>> 0) % (h - 6));
    ui.fill(px, py, 1, 1, i % 3 ? C.baizeLo : C.baizeHi);
  }
}

// ---------------------------------------------------------------- celebration

/** Sparkles bursting from (cx, cy): `t` seconds since the win, `n` of them, out to `r` px. */
export function drawSparkles(ui: UI, cx: number, cy: number, t: number, n: number, r: number, life = 1.2) {
  for (let i = 0; i < n; i++) {
    const delay = (i % 5) * 0.08;
    const k = (t - delay) / life;
    if (k <= 0 || k >= 1) continue;
    const ang = i * 2.399 + (i % 3) * 0.4;
    const d = out3(k) * r * (0.55 + ((i * 7) % 5) / 10);
    const x = Math.round(cx + Math.cos(ang) * d), y = Math.round(cy + Math.sin(ang) * d * 0.7);
    const col = i % 3 === 0 ? C.white : i % 3 === 1 ? C.gold : C.brass;
    const s = k < 0.6 ? 2 : 1;
    ui.fill(x - s, y, s * 2 + 1, 1, col);
    ui.fill(x, y - s, 1, s * 2 + 1, col);
  }
}
