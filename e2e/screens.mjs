// Screenshot sweep + overlap audit of every 2D surface: the HUD (640×360) in each of its states and
// every table panel (320×180). For each, the UI kit's audit (src/ui/audit.ts) lists texts that clash,
// overflow their panel/button or get painted over; surfaces with issues also get <name>.issues.png
// with the problems boxed (red clash, orange overflow, blue covered). Results: e2e/out/screens/
// (report.md, report.json, PNGs); the previous run is kept in e2e/out/screens-prev/.
//
// Usage: npm run screens            (dev server on 5180, or BASE=...)
//        npm run screens -- hud-marks,panel-hilo
import fs from 'node:fs';
import { open, OUT } from './launch.mjs';

const only = process.argv[2]?.split(',');
const out = `${OUT}/screens`, prev = out + '-prev';
if (!only && fs.existsSync(out)) {
  fs.rmSync(prev, { recursive: true, force: true });
  fs.renameSync(out, prev);
}
fs.mkdirSync(out, { recursive: true });

const { browser, page, errors, ev, wait } = await open();
await ev(async () => {
  window.__audit = await import('/src/ui/audit.ts');
  const a = window.__app;
  a.hud.ui.audit = true;
  for (const { panel } of a.panels.values()) panel.ui.audit = true;
});

/** Box the issues on a copy of a canvas, scaled up, as a PNG data URL. */
const BOXES = `(canvas, issues, k) => {
  const c = document.createElement('canvas'); c.width = canvas.width * k; c.height = canvas.height * k;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(canvas, 0, 0, c.width, c.height);
  const col = { clash: '#ff2d55', overflow: '#ff9500', covered: '#00c7ff' };
  for (const i of issues) for (const [r, dashed] of [[i.rect, false], [i.otherRect, true]]) {
    if (!r) continue; x.strokeStyle = col[i.type]; x.lineWidth = 2; x.setLineDash(dashed ? [4, 3] : []);
    x.strokeRect(r.x * k, r.y * k, r.w * k, r.h * k);
  }
  return c.toDataURL('image/png');
}`;

const report = [];
const save = (name, dataUrl) => fs.writeFileSync(`${out}/${name}`, Buffer.from(dataUrl.split(',')[1], 'base64'));

/** Audit one surface: 'hud' or a panel's table id. Saves the window screenshot and the surface at 3x. */
async function shot(name, surface) {
  await page.mouse.move(1279, 719); // park the mouse so no hover state shows
  await wait(350);
  await page.screenshot({ path: `${out}/${name}.png` });
  const res = await ev(({ surface, BOXES }) => {
    const a = window.__app;
    const ui = surface === 'hud' ? a.hud.ui : a.panels.get(surface).panel.ui;
    const canvas = surface === 'hud' ? a.hud.canvas : a.panels.get(surface).panel.canvas;
    const issues = window.__audit.findIssues(ui.lastAudit, { w: ui.w, h: ui.h });
    const boxes = (0, eval)(BOXES);
    return { issues, n: ui.lastAudit.length, png: boxes(canvas, issues, 3) };
  }, { surface, BOXES });
  save(`${name}.surface.png`, res.png);
  if (res.issues.length) save(`${name}.issues.png`, res.png);
  report.push({ name, surface, records: res.n, issues: res.issues });
  console.log(`${res.issues.length ? '!' : ' '} ${name} (${res.n} records${res.issues.length ? `, ${res.issues.length} issues` : ''})`);
}

const SC = {
  'hud-enter': async () => {},
  'hud-walking': async () => ev(() => { const a = window.__app; a.enter(); a.pose(0, 7.2, 0, -0.04); }),
  // standing at Hi-Lo's stand point, facing it: the seat prompt shows
  'hud-prompt': async () => ev(() => window.__app.pose(-8, -0.7, 0, -0.1)),
  'hud-marks': async () => ev(() => {
    const s = window.__app.game.state;
    s.marks = [
      { id: 'hi-lo mark', player: 0, left: 27 * 60, stacks: 3 },
      { id: 'cold deck', player: -1, left: 41 * 60, stacks: 1 },
      { id: 'sticky floor', player: -1, left: 12 * 60, stacks: 1 },
    ];
    s.bank = 12345; s.markers = 7; s.players[0].lives = 1;
  }),
  'hud-paused': async () => ev(() => { const a = window.__app; a.game.state.marks = []; a.paused = true; }),
  'panel-hilo': async () => {
    await ev(() => { const a = window.__app; a.paused = false; a.game.state.bank = 1000; a.game.state.players[0].lives = 3; a.sitAt('hilo'); });
    await wait(900);
  },
};
const SURFACE = { 'panel-hilo': 'hilo' };

for (const [name, fn] of Object.entries(SC)) {
  if (only && !only.includes(name)) continue;
  try {
    await fn();
    await wait(200);
    await shot(name, SURFACE[name] ?? 'hud');
    // the seated view's HUD gets its own audit too
    if (name === 'panel-hilo' && (!only || only.includes('hud-seated'))) await shot('hud-seated', 'hud');
  } catch (e) {
    console.log(`x ${name}: FAILED ${e.message.split('\n')[0]}`);
    report.push({ name, failed: e.message.split('\n')[0] });
  }
}

const count = (t) => report.reduce((n, r) => n + (r.issues?.filter((i) => i.type === t).length ?? 0), 0);
const lines = [
  '# Screens sweep',
  '',
  `${report.length} surfaces, ${count('clash')} clash, ${count('overflow')} overflow, ${count('covered')} covered, ${errors.length} console errors/warnings.`,
  '',
  'clash: two texts overlap. overflow: text runs past the panel/button it starts in. covered: something drawn later paints over the text.',
  'Each surface is saved at 3x as <name>.surface.png; the window as <name>.png.',
  '',
];
for (const r of report) {
  if (r.failed) { lines.push(`## ${r.name}: FAILED`, '', r.failed, ''); continue; }
  lines.push(`- ${r.name} (${r.surface}): ${r.records} records, ${r.issues.length} issues`);
  for (const i of r.issues) lines.push(`  - **${i.type}** "${i.text}" at ${i.rect.x},${i.rect.y}${i.other ? ` vs ${i.other}` : ''}`);
}
if (errors.length) lines.push('', '## Console', '', ...errors.slice(0, 40).map((e) => '- ' + e.split('\n')[0]));
fs.writeFileSync(`${out}/report.md`, lines.join('\n') + '\n');
fs.writeFileSync(`${out}/report.json`, JSON.stringify({ report, errors }, null, 1));
console.log(`\n${lines[2]}\nReport: ${out}/report.md`);
await browser.close();
