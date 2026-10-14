// Smoke test: the title loads with no console errors; NEW RUN starts a run; a click asks for pointer
// lock; W walks you forward; E at Hi-Lo seats you and a call lands a result; E stands you up; the
// clock runs to 0:00 and the Collector's choice opens; paying and READY start night 2.
// Exits non-zero on any failure.
import { open } from './launch.mjs';

const { browser, page, errors, ev, wait } = await open();
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };

check(await ev(() => window.__app.screen === 'title'), 'the title shows first');
// NEW RUN: the HUD's 640x360 is drawn 2x into the 1280x720 window
await page.mouse.click(640, 280);
await wait(200);
check(await ev(() => window.__app.screen === 'game'), 'NEW RUN starts a run');

await ev(() => {
  window.__lockAsked = 0;
  const c = document.getElementById('game');
  const orig = c.requestPointerLock.bind(c);
  c.requestPointerLock = (...a) => { window.__lockAsked++; try { return orig(...a); } catch { return undefined; } };
});
await page.mouse.click(640, 360);
await wait(200);
check(await ev(() => window.__lockAsked > 0), 'a click asks for pointer lock');
await ev(() => window.__app.enter()); // headless: no real pointer lock

const z0 = await ev(() => window.__game.state.players[0].z);
await page.keyboard.down('KeyW');
await wait(1000);
await page.keyboard.up('KeyW');
const z1 = await ev(() => window.__game.state.players[0].z);
check(z0 - z1 > 1.5 && z0 - z1 < 4, `W walks forward (${(z0 - z1).toFixed(2)} m in ~1 s)`);

await ev(() => { const h = window.__floors.FLOOR_1.tables.find((t) => t.table === 'hilo'); window.__app.pose(h.stand.x, h.stand.z, 0, -0.1); });
await wait(100);
await page.keyboard.press('KeyE');
await wait(700);
check(await ev(() => window.__game.state.players[0].seat === 'hilo'), 'E at Hi-Lo sits you down');
check(await ev(() => window.__app.fp.seated), 'the camera is seated');
const bank0 = await ev(() => window.__game.state.bank);
await ev(() => window.__game.submit(0, { t: 'call', table: 'hilo', call: 'hi' }));
await wait(2200); // the die is thrown, bounces and settles (src/data/feel.ts)
check(await ev(() => window.__game.state.tables.hilo.rounds === 1), 'a Hi-Lo call lands a result');
check(await ev((b) => window.__game.state.bank !== b, bank0), 'the bank moved');
await page.keyboard.press('KeyE');
await wait(400);
check(await ev(() => window.__game.state.players[0].seat === null && !window.__app.fp.seated), 'E stands you up');

await ev(() => { const a = window.__app; a.game.state.bank = 3600; a.skipTo(a.game.tick + a.game.state.clock + 200); });
await wait(300);
check(await ev(() => window.__game.state.phase === 'choice'), "0:00 brings the Collector's choice");
await ev(() => { const a = window.__app; a.game.submit(0, { t: 'pay' }); a.skipTo(a.game.tick + 2); });
check(await ev(() => window.__game.state.phase === 'summary'), 'paying closes the night');
await ev(() => { const a = window.__app; a.game.submit(0, { t: 'ready' }); a.skipTo(a.game.tick + 2); });
check(await ev(() => window.__game.state.night === 2 && window.__game.state.quota === 4500), 'READY starts night 2 at $4,500');

check(errors.length === 0, `no console errors (${errors.length})`);
for (const e of errors.slice(0, 10)) console.log('  ', e);
await browser.close();
if (fails.length) process.exitCode = 1;
