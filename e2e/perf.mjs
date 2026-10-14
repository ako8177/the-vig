// Performance: fps, draw calls and triangles from the door (the busiest view) under SwiftShader.
// Budgets (THREEJS-NOTES rules 11, 13): ≤ 80 draw calls, ≤ 40k triangles on screen, ≥ 15 fps
// headless. Exits non-zero over budget. Writes e2e/out/perf.json.
import fs from 'node:fs';
import { open, glInfo, OUT } from './launch.mjs';

const { browser, page, errors, ev, wait } = await open({ extraFlags: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const gl = await glInfo(page);
await ev(() => { const a = window.__app; a.enter(); const sp = window.__floors.FLOOR_1.spawn; a.pose(sp.x, sp.z, 0, -0.04); });
await wait(800);
const scene = await ev(() => window.__app.view.measure());
const sim = await ev(() => {
  const g = new window.__Game({ seed: 9 });
  g.submit(0, { t: 'move', mx: 0, mz: -1000, yaw: 0 });
  const t0 = performance.now();
  for (let i = 0; i < 3600; i++) g.step();
  return { msPerTick: (performance.now() - t0) / 3600 };
});
const frames = await ev(() => new Promise((resolve) => {
  const s = [];
  let last = performance.now(), n = 0;
  const f = () => {
    const now = performance.now();
    s.push(now - last);
    last = now;
    if (++n < 180) requestAnimationFrame(f);
    else {
      s.sort((a, b) => a - b);
      const avg = s.reduce((a, b) => a + b, 0) / s.length;
      resolve({ avgFrameMs: +avg.toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), fps: +(1000 / avg).toFixed(1) });
    }
  };
  requestAnimationFrame(f);
}));
const res = { gl, scene, sim, frames, budgets: { calls: 80, triangles: 40000, fps: 15 } };
console.log(JSON.stringify(res, null, 1));
const over = [];
if (scene.calls > 80) over.push(`draw calls ${scene.calls} > 80`);
if (scene.triangles > 40000) over.push(`triangles ${scene.triangles} > 40k`);
if (frames.fps < 15) over.push(`fps ${frames.fps} < 15`);
console.log(over.length ? 'OVER BUDGET: ' + over.join('; ') : 'within budget');
fs.writeFileSync(`${OUT}/perf.json`, JSON.stringify(res, null, 1));
if (over.length) process.exitCode = 1;
if (errors.length) console.log(errors);
await browser.close();
