// The Milestone 0 neon-and-palette test (ROADMAP.md): one table per tier color, seen from 10 m at
// 640×360, in each candidate palette. For each palette: the four signs at exactly 10 m, head-on,
// cropped from the 640×360 frame (no upscale tricks) into one 2×2 sheet, plus the room from the door.
// Output: e2e/out/palette/<palette>-tiers.png and <palette>-door.png.
import fs from 'node:fs';
import { open, OUT } from './launch.mjs';

const out = `${OUT}/palette`;
fs.mkdirSync(out, { recursive: true });
// one table per tier, each with the bearing (degrees off straight-on, + = from the right) of a
// clear 10 m sightline in this room: Red Line straight on would look through the Bandit cabinet
const TIERS = [['twentyone', 'low', 0], ['hilo', 'mid', 0], ['redline', 'high', -12], ['collector', 'coll', 0]];

const { browser, page, ev, wait } = await open({ width: 1280, height: 720 });
await ev(() => window.__app.enter());
for (const pal of ['tano48']) {
  await ev((pal) => window.__app.setPalette(pal), pal);
  await wait(300);
  // the room from the door
  await ev(() => { const sp = window.__floors.FLOOR_1.spawn; window.__app.pose(sp.x, sp.z, 0, -0.04); });
  await wait(400);
  await page.screenshot({ path: `${out}/${pal}-door.png` });
  // each tier's sign from 10 m, straight on, at eye height: crop the middle 320x180 of the 640x360 view
  const crops = [];
  for (const [table, tier, bearing] of TIERS) {
    await ev(({ table, bearing }) => {
      const { FLOOR_1 } = window.__floors;
      const a = window.__app;
      const s = table === 'collector' ? { x: FLOOR_1.collector.x, z: FLOOR_1.collector.z, y: FLOOR_1.collector.signY } : (() => { const p = FLOOR_1.tables.find((t) => t.table === table); return { x: p.x, z: p.z, y: p.signY }; })();
      // stand 10 m from the sign (the walls are single-sided, so from outside the room they let the view through)
      const b = (bearing * Math.PI) / 180;
      const cx = s.x + Math.sin(b) * 10, cz = s.z + Math.cos(b) * 10;
      a.pose(cx, cz, Math.atan2(-(s.x - cx), -(s.z - cz)), Math.atan2(s.y - 1.6, 10));
    }, { table, bearing });
    await wait(350);
    // the letterboxed 640x360 is drawn at 2x into the 1280x720 page: crop the center 640x360 page px = 320x180 game px
    const buf = await page.screenshot({ clip: { x: 320, y: 180, width: 640, height: 360 } });
    crops.push({ tier, b64: buf.toString('base64') });
  }
  const sheet = await ev(async (crops) => {
    const imgs = await Promise.all(crops.map((c) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + c.b64; })));
    const cv = document.createElement('canvas');
    cv.width = 1280 + 12; cv.height = 720 + 36;
    const x = cv.getContext('2d');
    x.fillStyle = '#111'; x.fillRect(0, 0, cv.width, cv.height);
    imgs.forEach((im, i) => x.drawImage(im, (i % 2) * 646 + 3, Math.floor(i / 2) * 378 + 15));
    x.fillStyle = '#ddd'; x.font = '14px monospace';
    crops.forEach((c, i) => x.fillText(`${c.tier} tier, 10 m`, (i % 2) * 646 + 8, Math.floor(i / 2) * 378 + 12));
    return cv.toDataURL('image/png');
  }, crops);
  fs.writeFileSync(`${out}/${pal}-tiers.png`, Buffer.from(sheet.split(',')[1], 'base64'));
  console.log('palette', pal, 'done');
}
await browser.close();
