// Headless Chromium with SwiftShader (software WebGL), the proxy for a weak laptop
// (THREEJS-NOTES, testing). Flags confirmed with Playwright 1.48 driving the installed Chrome 154 on this PC
// on 2026-10-12: WebGL2 comes up as "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device ...))".
// Every e2e script opens the game through here.
import { chromium } from 'playwright';
import fs from 'node:fs';

export const BASE = process.env.BASE ?? 'http://127.0.0.1:5180/';
export const OUT = 'e2e/out';
/** The installed Chrome: Windows blocks Playwright's own Chromium build from running on this PC. */
export const CHANNEL = process.env.PW_CHANNEL ?? 'chrome';
// (on other PCs `PW_CHANNEL=chromium` uses Playwright's own build after `npx playwright install chromium`)
export const FLAGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];

/** Launch, open the game, wait for the room's textures; returns { browser, page, errors, ev, wait }. */
export async function open({ width = 1280, height = 720, extraFlags = [] } = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: CHANNEL, headless: true, args: [...FLAGS, ...extraFlags] });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.goto(BASE);
  await page.waitForFunction(() => window.__app);
  await page.evaluate(() => window.__app.tex.ready);
  const ev = (f, a) => page.evaluate(f, a);
  const wait = (ms) => page.waitForTimeout(ms);
  return { browser, page, errors, ev, wait };
}

/** The GL renderer string, to confirm SwiftShader is what ran. */
export async function glInfo(page) {
  return page.evaluate(() => {
    const gl = window.__app.view.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
}
