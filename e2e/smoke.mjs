// Smoke test: the page loads with no console errors, a click asks for pointer lock, W walks you
// forward, E at Hi-Lo seats you (the camera eases in, the panel takes the mouse), E stands you up.
// Exits non-zero on any failure.
import { open } from './launch.mjs';

const { browser, page, errors, ev, wait } = await open();
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };

await ev(() => {
  window.__lockAsked = 0;
  const c = document.getElementById('game');
  const orig = c.requestPointerLock.bind(c);
  c.requestPointerLock = (...a) => { window.__lockAsked++; try { return orig(...a); } catch { return undefined; } };
});
await page.mouse.click(640, 360);
await wait(200);
check(await ev(() => window.__lockAsked > 0), 'a click asks for pointer lock');
check(await ev(() => window.__app.started), 'a click steps onto the floor');

const z0 = await ev(() => window.__game.state.players[0].z);
await page.keyboard.down('KeyW');
await wait(1000);
await page.keyboard.up('KeyW');
const z1 = await ev(() => window.__game.state.players[0].z);
check(z0 - z1 > 1.5 && z0 - z1 < 4, `W walks forward (${(z0 - z1).toFixed(2)} m in ~1 s)`);

await ev(() => window.__app.pose(-8, -0.7, 0, -0.1));
await wait(100);
await page.keyboard.press('KeyE');
await wait(700);
check(await ev(() => window.__game.state.players[0].seat === 'hilo'), 'E at Hi-Lo sits you down');
check(await ev(() => window.__app.fp.seated), 'the camera is seated');
await page.keyboard.press('KeyE');
await wait(400);
check(await ev(() => window.__game.state.players[0].seat === null && !window.__app.fp.seated), 'E stands you up');

check(errors.length === 0, `no console errors (${errors.length})`);
for (const e of errors.slice(0, 10)) console.log('  ', e);
await browser.close();
if (fails.length) process.exitCode = 1;
