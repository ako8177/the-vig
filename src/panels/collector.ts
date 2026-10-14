// The Collector's screen, on his table: through the night it shows what he wants and when; at 0:00
// it takes the team through the choice (pay or gamble), the Circuit, the Boon or Bane wheel and the
// night's summary (DESIGN.md §2, §6, §7). Every price and consequence is printed before the button.
import { Panel, PANEL_W, PANEL_H, type PanelView } from './panel';
import type { UI } from '../ui/ui';
import { C, PALETTE, TIER_ROLE } from '../data/palette';
import { out3 } from './fx';
import { ICON } from '../ui/font';
import { TICKS_PER_S } from '../sim/state';
import { money } from './table';
import { ECONOMY } from '../data/economy';
import { BANES, BOONS, DEAR_SOULS_SOLO, WHEEL } from '../data/wheels';
import { CHARM_BY_ID, UPGRADE_BY_ID, type UpgradeId } from '../data/charms';
import type { Command } from '../sim/commands';
import { rulesFor } from '../sim/circuit';

const T = TIER_ROLE.coll;

export class CollectorPanel extends Panel {
  /** kept for the phase change; the wheel's last peg under the pointer (a clack each) */
  private picked: number[] = [];
  private lastPeg = -1;
  private lastPhase = '';

  constructor() {
    super('collector');
  }

  protected animating(v: PanelView) {
    // on the floor it shows a clock: the once-a-second redraw covers it (a canvas upload every frame
    // stalls a software renderer: DECISIONS #68)
    const s = v.state;
    return s.phase === 'midnight' || s.phase === 'wheel' || s.phase === 'circuit';
  }

  protected draw(ui: UI, v: PanelView) {
    const s = v.state;
    if (s.phase !== this.lastPhase) {
      this.picked = [];
      this.lastPhase = s.phase;
    }
    ui.panel(0, 0, PANEL_W, PANEL_H, 'felt', { edge: T.base });
    ui.fill(8, 7, 70, 14, T.base);
    ui.text('COLLECTOR', 43, 10, C.ink, { align: 'center' });
    ui.fill(8, 24, PANEL_W - 16, 1, T.lo);
    switch (s.phase) {
      case 'floor': return this.waiting(ui, v);
      case 'midnight': return this.midnight(ui, v);
      case 'choice': return this.choice(ui, v);
      case 'circuit': return this.circuit(ui, v);
      case 'wheel': return this.wheel(ui, v);
      case 'summary': return this.summary(ui, v);
      case 'over': return this.over(ui, v);
    }
  }

  private waiting(ui: UI, v: PanelView) {
    const s = v.state;
    const secs = Math.ceil(s.clock / TICKS_PER_S);
    ui.text(`NIGHT ${s.night} OF ${ECONOMY.nights.v}`, 86, 10, C.white);
    ui.text('AT 0:00 I WANT', PANEL_W / 2, 40, C.dust, { align: 'center' });
    ui.text(money(s.quota), PANEL_W / 2, 52, C.gold, { scale: 3, align: 'center' });
    ui.text(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} LEFT`, PANEL_W / 2, 82, C.bone, { scale: 2, align: 'center' });
    ui.text(`SHORT: A LIFE FOR EVERY ${money(ECONOMY.shortfallPerLife.v)}, AND THE BANK.`, PANEL_W / 2, 112, T.hi, { align: 'center' });
    ui.text('MADE IT: PAY ME, OR CHALLENGE ME FOR IT.', PANEL_W / 2, 124, C.dust, { align: 'center' });
    ui.text('DONE EARLY, OR BROKE? STAND HERE AND PRESS E TO CALL IT.', PANEL_W / 2, 146, C.ash, { align: 'center' });
  }

  private midnight(ui: UI, v: PanelView) {
    const s = v.state;
    ui.text('0:00', PANEL_W / 2, 40, T.hi, { scale: 3, align: 'center' });
    ui.text(`I WANT ${money(s.quota)}.`, PANEL_W / 2, 76, C.white, { scale: 2, align: 'center' });
    ui.text(`THE BANK HOLDS ${money(s.bank)}.`, PANEL_W / 2, 100, s.bank >= s.quota ? C.gold : C.blood, { scale: 2, align: 'center' });
  }

  private choice(ui: UI, v: PanelView) {
    const s = v.state;
    const me = s.players[v.player];
    ui.text(`YOU MADE IT: ${money(s.bank)} OF ${money(s.quota)}`, 86, 10, C.gold);
    const over = Math.floor((s.bank - s.quota) / ECONOMY.overshootPerMarker.v);
    const left = s.bank - s.quota;
    const next = Math.round((s.quota * ECONOMY.quotaGrowth.v) / 10) * 10;
    const keep = Math.max(left, ECONOMY.bankFloor.v) + (s.upgrades.includes('bank500') ? 500 : 0);
    const last = s.night >= ECONOMY.nights.v;
    // two cards: what each choice costs and gives, then its button
    const card = (x: number, title: string, lines: [string, number][]) => {
      ui.panel(x, 30, 148, 106, 'inset', { blocking: false });
      ui.text(title, x + 74, 34, C.white, { align: 'center' });
      lines.forEach(([l, c], i) => ui.text(l, x + 6, 46 + i * 11, c));
    };
    card(8, 'PAY', [
      [`${money(s.quota)} LEAVES THE BANK`, C.bone],
      [over ? `+${over} ${ICON.marker} FOR THE OVERSHOOT` : 'NO OVERSHOOT MARKERS', over ? C.marker : C.ash],
      [last ? 'AND YOU WALK OUT ALIVE' : `NEXT QUOTA ${money(next)}`, C.dust],
      [last ? '' : `NEXT NIGHT STARTS AT ${money(keep)}`, C.dust],
    ]);
    const r = rulesFor(s.floor);
    const live = s.mods.overloads3 ? WHEEL.bigOverloads : r.live;
    const kit = me.charms.includes('insulated');
    const odds = s.mods.overloads3 ? r.odds.bane : kit ? r.odds.withKit : r.odds.win;
    card(164, 'CHALLENGE HIM', [
      ['NOTHING PAID YET. HIS GAME:', C.bone],
      [`${r.levers} LEVERS, ${live} LIVE. TAKE TURNS.`, C.dust],
      [`TWO SHOCKS EACH. YOU WIN ~${Math.round(odds * 100)}%`, C.dust],
      [`DEAD LEVER: +$${r.safeBank} AND A MARKER`, C.gold],
      ...(last
        ? ([['WIN: HE DIES, KEEP THE QUOTA,', T.hi], ['A FREE PERMANENT UPGRADE', T.hi], [`LOSE: A LIFE ${ICON.heart}, PAY THE QUOTA`, C.blood]] as [string, number][])
        : ([['WIN: HE DIES, KEEP THE QUOTA,', T.hi], ['AND SPIN THE BOON WHEEL', T.hi], [`LOSE: A LIFE ${ICON.heart}, PAY, THE BANE`, C.blood]] as [string, number][])),
    ]);
    const ghost = me.ghost;
    if (ui.button('pay', 8, 140, 148, 22, `PAY ${money(s.quota)}`, { edge: C.gold, disabled: ghost || !v.active, tip: ghost ? 'A ghost has no say.' : 'Pay and go on.' })) this.send({ t: 'pay' });
    if (ui.button('gamble', 164, 140, 148, 22, 'CHALLENGE', { edge: T.base, disabled: ghost || !v.active, tip: ghost ? 'A ghost has no say.' : 'Play him for the quota.' })) this.send({ t: 'gamble' });
    const charms = me.charms.map((c) => CHARM_BY_ID.get(c)!.name.toUpperCase()).join(', ') || 'NONE';
    ui.text(`${ICON.heart.repeat(me.lives)}  CHARMS: ${charms}`, PANEL_W / 2, 167, C.dust, { align: 'center' });
  }

  private circuit(ui: UI, v: PanelView) {
    // the table has turned over: the duel is played on the levers themselves (render3d/duel.ts);
    // this screen, face down under them, keeps a plain readout and a row of buttons (the screens
    // sweep and anyone without a mouse on the levers can still play it)
    const s = v.state;
    const c = s.circuit!;
    const me = s.players[v.player];
    const r = rulesFor(s.floor);
    ui.text('THE CIRCUIT', 86, 10, C.white);
    ui.text(`YOU ${ICON.bolt.repeat(c.shocks[v.player])}${'-'.repeat(Math.max(0, r.playerShocks - c.shocks[v.player]))}  HIM ${ICON.bolt.repeat(c.hisShocks)}${'-'.repeat(Math.max(0, r.collShocks - c.hisShocks))}`, PANEL_W - 12, 10, T.hi, { align: 'right' });
    const myTurn = c.turn === 'team' && !c.done;
    const n = c.levers.length, gap = 3, tw = Math.floor((PANEL_W - 20 - (n - 1) * gap) / n), x0 = Math.round((PANEL_W - (n * tw + (n - 1) * gap)) / 2);
    c.levers.forEach((l, i) => {
      const x = x0 + i * (tw + gap), y = 34;
      const col = l.pulled ? (l.live ? C.blood : C.smoke) : l.known ? (l.live ? C.blood : C.soulLo) : C.night;
      if (ui.button(`lever${i}`, x, y, tw, 40, `${i + 1}`, { edge: T.base, disabled: !v.active || !myTurn || l.pulled || me.ghost, tip: l.pulled ? (l.live ? 'Live.' : 'Dead.') : 'Pull it.' })) this.act({ t: 'activate', circuit: i });
      ui.fill(x + 2, y + 32, tw - 4, 5, col);
    });
    if (c.done) {
      ui.text(c.done.won ? 'HE IS DEAD' : 'THE HOUSE WINS', PANEL_W / 2, 92, c.done.won ? T.hi : C.blood, { scale: 2, align: 'center' });
      ui.para(c.done.why, 20, 112, PANEL_W - 40, C.bone);
      return;
    }
    ui.text(`${c.live} OF ${n} ARE LIVE. TWO SHOCKS: YOU LOSE A LIFE AND PAY.`, 12, 86, C.collHi);
    ui.text('TWO SHOCKS FOR HIM: HE DIES, YOU KEEP THE QUOTA.', 12, 96, C.collHi);
    if (c.traces[v.player] > 0) ui.text(`INSULATED KIT: ${c.traces[v.player]} FREE TRACES (RIGHT-CLICK A LEVER)`, 12, 108, C.soul);
    ui.text(myTurn ? 'YOUR PULL' : 'HIS PULL...', 12, 126, myTurn ? C.white : T.hi);
    c.log.slice(0, 2).forEach((l, i) => ui.text(l, 80, 126 + i * 10, i === 0 ? C.bone : C.ash));
  }

  /** Send a Circuit action; the picks clear (critic F6: the next click shouldn't toggle a stale pick off). */
  private act(c: Command) {
    this.picked = [];
    this.send(c);
  }

  private wheel(ui: UI, v: PanelView) {
    // a real wheel (the owner: "spin a wheel instead of the 6 random boxes"): six wedges, a pointer,
    // a spin that slows onto the slot the sim drew; the six printed beside it, the landed one lit
    const s = v.state;
    const w = s.wheel!;
    const boon = w.kind === 'boon';
    const slots = boon ? BOONS : BANES;
    ui.text(boon ? 'THE BOON WHEEL' : 'THE BANE WHEEL', 86, 10, boon ? T.hi : C.blood);
    ui.text(boon ? 'SIX SLOTS, EQUALLY LIKELY. IT HELPS.' : 'SIX SLOTS, EQUALLY LIKELY. IT LASTS ALL NEXT NIGHT.', 12, 30, C.dust);
    const cx = 236, cy = 100, rad = 58, th = (Math.PI * 2) / 6;
    const rest = (k: number) => -Math.PI / 2 - (k + 0.5) * th;
    let a = rest(0), lit = -1;
    if (w.slot !== null) {
      const left = Math.max(0, w.until - v.tick);
      const t = 1 - left / (WHEEL.spinS * TICKS_PER_S);
      a = rest(w.slot) - (1 - out3(t)) * (Math.PI * 2 * 4);
      if (left <= 0) lit = w.slot;
      const under = ((Math.floor((-Math.PI / 2 - a) / th) % 6) + 6) % 6;
      if (left > 0 && under !== this.lastPeg && v.active) this.sound('peg', 0.6, boon ? 1.1 : 0.8);
      this.lastPeg = under;
    }
    const ctx = ui.ctx;
    ctx.fillStyle = PALETTE[C.woodLo];
    ctx.beginPath();
    ctx.arc(cx, cy, rad + 5, 0, Math.PI * 2);
    ctx.fill();
    const cols = boon ? [T.base, C.collLo, T.hi, C.collLo, T.base, C.indigoHi] : [C.blood, C.highLo, C.blood, C.ink, C.highLo, C.ink];
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = PALETTE[i === lit ? C.white : cols[i]];
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, rad, a + i * th, a + (i + 1) * th);
      ctx.closePath();
      ctx.fill();
      const m = a + (i + 0.5) * th;
      ui.text(`${i + 1}`, Math.round(cx + Math.cos(m) * rad * 0.66), Math.round(cy + Math.sin(m) * rad * 0.66 - 3), i === lit ? C.ink : C.white, { align: 'center' });
    }
    ctx.fillStyle = PALETTE[C.ink];
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fill();
    ui.fill(cx - 3, cy - rad - 9, 7, 2, C.white);
    ui.fill(cx - 2, cy - rad - 7, 5, 2, C.white);
    ui.fill(cx - 1, cy - rad - 5, 3, 3, C.white);
    slots.forEach((sl, i) => {
      const y = 44 + i * 13;
      ui.text(`${i + 1}`, 14, y, i === lit ? C.white : C.ash);
      ui.text(sl.label, 26, y, i === lit ? (boon ? T.hi : C.blood) : C.bone);
    });
    if (w.slot === null) {
      if (ui.button('fortune', 12, 128, 140, 22, 'SPIN', { edge: boon ? T.base : C.blood, disabled: !v.active, tip: 'Spin the wheel.' })) this.send({ t: 'fortune' });
    } else if (v.tick >= w.until) ui.para(slots[w.slot].text, 12, 128, 150, C.white);
  }

  private summary(ui: UI, v: PanelView) {
    const s = v.state;
    const sm = s.summary!;
    const last = s.night >= ECONOMY.nights.v;
    ui.text(`NIGHT ${sm.night} IS OVER`, 86, 10, C.white);
    const lines: [string, number][] = [];
    if (sm.how === 'short') {
      lines.push([`SHORT ${money(sm.short)} OF ${money(sm.quota)}.`, C.blood]);
      lines.push([`HE TOOK THE BANK AND ${sm.livesTaken} ${sm.livesTaken === 1 ? 'LIFE' : 'LIVES'}.`, C.blood]);
    } else if (sm.how === 'kept') {
      lines.push([`THE COLLECTOR IS DEAD. YOU KEPT ${money(sm.quota)} (THE BANK HOLDS ${money(s.bank)}).`, T.hi]);
      if (sm.overshootMarkers) lines.push([`OVERSHOOT: +${sm.overshootMarkers} ${ICON.marker} MARKERS.`, C.marker]);
    } else {
      lines.push([`PAID ${money(sm.quota)} (THE BANK HELD ${money(sm.bankAtMidnight)}).`, C.gold]);
      if (sm.overshootMarkers) lines.push([`OVERSHOOT: +${sm.overshootMarkers} ${ICON.marker} MARKERS.`, C.marker]);
    }
    if (sm.circuit) lines.push([`THE CIRCUIT: ${sm.circuit.won ? 'WON' : 'LOST'}. ${sm.circuit.why}`, sm.circuit.won ? T.hi : C.blood]);
    if (sm.wheel) {
      const d = (sm.wheel.kind === 'boon' ? BOONS : BANES).find((b) => b.id === sm.wheel!.id)!;
      const solo = sm.wheel.id === 'dearsoul' && s.players.length === 1;
      lines.push([`${sm.wheel.kind === 'boon' ? 'BOON' : 'BANE'}: ${solo ? DEAR_SOULS_SOLO.text : d.text}`, sm.wheel.kind === 'boon' ? T.hi : C.blood]);
    }
    if (sm.ledger) lines.push([`THE HOUSE'S LEDGER: ${UPGRADE_BY_ID.get(sm.ledger as UpgradeId)!.name.toUpperCase()} IS YOURS FOR GOOD.`, T.hi]);
    if (!last) {
      const keep = Math.max(s.bank, ECONOMY.bankFloor.v) + (s.upgrades.includes('bank500') ? 500 : 0);
      lines.push([`NIGHT ${sm.night + 1}: QUOTA ${money(sm.nextQuota)}, THE BANK STARTS AT ${money(keep)}.`, C.white]);
      lines.push([s.home ? 'SPEND YOUR MARKERS ON THE COMPUTER AT HOME.' : 'SPEND YOUR MARKERS AT THE CAGE ON THE EAST WALL.', C.dust]);
    } else lines.push([`THAT WAS THE LAST NIGHT OF THE SLICE.`, C.white]);
    let y = 32;
    for (const [l, c] of lines) y += ui.para(l, 12, y, PANEL_W - 24, c) + 5;
    if (ui.button('ready', 100, 150, 120, 22, last ? 'WALK OUT' : `NIGHT ${sm.night + 1}`, { edge: T.base, disabled: !v.active, tip: last ? 'See how the run went.' : 'Back to the floor.' })) this.send({ t: 'ready' });
  }

  private over(ui: UI, v: PanelView) {
    const s = v.state;
    const r = s.result;
    ui.text(r?.won ? 'YOU WALK OUT' : 'THE HOUSE KEEPS YOU', PANEL_W / 2, 50, r?.won ? T.hi : C.blood, { scale: 2, align: 'center' });
    let y = 80;
    // a shortfall that took the last life: show the arithmetic (critic F11)
    const sm = s.summary;
    if (sm && sm.night === s.night && sm.how === 'short') y += ui.para(`SHORT ${money(sm.short)} OF ${money(sm.quota)}: ${sm.livesTaken} ${sm.livesTaken === 1 ? 'LIFE' : 'LIVES'} AND THE BANK.`, 20, y, PANEL_W - 40, C.blood) + 6;
    if (r) ui.para(r.why, 20, y, PANEL_W - 40, C.bone);
  }
}
