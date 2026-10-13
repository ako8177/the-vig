// Art coverage: every texture the renderer asked for, per palette, and whether it loaded.
// Models join the list when Milestone 1 step 10 brings .glb files. Writes e2e/out/coverage.json.
import fs from 'node:fs';
import { open, OUT } from './launch.mjs';

const { browser, ev } = await open();
const res = {};
for (const pal of ['r64', 'r64teal', 'tano48']) {
  res[pal] = await ev(async (pal) => {
    const a = window.__app;
    await a.setPalette(pal);
    return [...a.tex.tex.entries()].map(([name, t]) => ({ name, loaded: !!(t.image && t.image.width), size: t.image ? `${t.image.width}x${t.image.height}` : '-' }));
  }, pal);
  const missing = res[pal].filter((t) => !t.loaded);
  console.log(`${pal}: ${res[pal].length} textures, ${missing.length} missing${missing.length ? ': ' + missing.map((m) => m.name).join(', ') : ''}`);
}
res.requested = await ev(() => [...window.__app.tex.requested]);
fs.writeFileSync(`${OUT}/coverage.json`, JSON.stringify(res, null, 1));
await browser.close();
