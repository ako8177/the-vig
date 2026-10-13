// Fixed views of the room, screenshotted (Read every PNG before calling it done).
// Usage: npm run shots [-- name,name]   (dev server on 5180, or BASE=...)
// Shots: door (the room from the door), hilo (seated at Hi-Lo), collector (the Collector's table),
// midnight (the 0:00 drop), and the pass comparison: door-nobloom, door-nopixel, door-fullres.
import fs from 'node:fs';
import { open, glInfo, OUT } from './launch.mjs';

const only = process.argv[2]?.split(',');
const { browser, page, errors, ev, wait } = await open();
console.log('GL:', await glInfo(page));
await ev(() => window.__app.enter());

const door = () => ev(() => { const a = window.__app; a.setToggles({ bloom: true, pixel: true, lowRes: true }); a.pose(0, 7.2, 0, -0.04); });
const SHOTS = {
  door,
  'door-nobloom': async () => { await door(); await ev(() => window.__app.setToggles({ bloom: false })); },
  'door-nopixel': async () => { await door(); await ev(() => window.__app.setToggles({ pixel: false })); },
  'door-fullres': async () => { await door(); await ev(() => window.__app.setToggles({ lowRes: false })); },
  hilo: async () => {
    await door();
    await ev(() => window.__app.sitAt('hilo'));
    await wait(900); // the camera eases to the seat
    // park the cursor over the screen's empty corner so no hover tint shows
    await page.mouse.move(5, 5);
  },
  collector: async () => {
    await ev(() => { const a = window.__app; if (a.game.state.players[0].seat) a.game.submit(0, { t: 'stand' }); });
    await wait(700);
    await ev(() => window.__app.pose(0, 3.6, 0, -0.32));
  },
  // the lights dropping at 0:00, seen from the Collector's seat
  midnight: async () => {
    await ev(() => { const a = window.__app; a.game.state.bank = 3600; a.skipTo(a.game.tick + a.game.state.clock + 1); });
    await wait(2500);
  },
};

for (const [name, fn] of Object.entries(SHOTS)) {
  if (only && !only.includes(name)) continue;
  await fn();
  await wait(400);
  await page.screenshot({ path: `${OUT}/shot-${name}.png` });
  console.log('shot', name);
}
fs.writeFileSync(`${OUT}/console-shots.txt`, errors.join('\n'));
console.log('console errors/warnings:', errors.length);
for (const e of errors.slice(0, 20)) console.log(e);
await browser.close();
