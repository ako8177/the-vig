// The Collector's screen, on his table: through the night it shows what he wants and when; at 0:00
// it takes the team through the choice (pay or gamble), the Circuit, the Boon or Bane wheel and the
// night's summary (DESIGN.md §2, §6, §7). Every price and consequence is printed before the button.
import { Panel, PANEL_W, PANEL_H, type PanelView } from './panel';
import type { UI } from '../ui/ui';
import { C, TIER_ROLE } from '../data/palette';
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
  /** circuits picked on the panel (one to inspect or activate, two to reroute) */
  private picked: number[] = [];
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
    ui.text('MADE IT: PAY ME, OR GAMBLE ON THE CIRCUIT.', PANEL_W / 2, 124, C.dust, { align: 'center' });
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
    const odds = s.mods.overloads3 ? WHEEL.bigOverloads : r.overloads;
    card(164, 'GAMBLE', [
      ['PAY, THEN PLAY THE CIRCUIT', C.bone],
      [`${r.circuits} CIRCUITS, ${odds} OVERLOADED`, C.dust],
      [`SAFE: +$${r.safeBank} AND A MARKER`, C.gold],
      [`OVERLOAD: A LIFE ${ICON.heart}`, C.blood],
      [`YOU WIN ABOUT ${Math.round(r.odds.win * 100)}%`, C.dust],
      ...(last
        ? ([['WIN: A FREE PERMANENT UPGRADE', T.hi], ['LOSE: ONLY WHAT IT COST', T.hi]] as [string, number][])
        : ([['WIN: THE BOON WHEEL', T.hi], ['LOSE: BANE, QUOTA +10-40%', T.hi]] as [string, number][])),
    ]);
    const ghost = me.ghost;
    if (ui.button('pay', 8, 140, 148, 22, `PAY ${money(s.quota)}`, { edge: C.gold, disabled: ghost || !v.active, tip: ghost ? 'A ghost has no say.' : 'Pay and go on.' })) this.send({ t: 'pay' });
    if (ui.button('gamble', 164, 140, 148, 22, 'GAMBLE', { edge: T.base, disabled: ghost || !v.active, tip: ghost ? 'A ghost has no say.' : 'The quota is paid either way.' })) this.send({ t: 'gamble' });
    const charms = me.charms.map((c) => CHARM_BY_ID.get(c)!.name.toUpperCase()).join(', ') || 'NONE';
    ui.text(`${ICON.heart.repeat(me.lives)}  CHARMS: ${charms}`, PANEL_W / 2, 167, C.dust, { align: 'center' });
  }

  private circuit(ui: UI, v: PanelView) {
    const s = v.state;
    const c = s.circuit!;
    const me = s.players[v.player];
    const r = rulesFor(s.floor);
    ui.text('THE CIRCUIT', 86, 10, C.white);
    ui.text(`HIS FUSES ${ICON.bolt.repeat(Math.max(0, c.fuses))}`, PANEL_W - 12, 10, T.hi, { align: 'right' });
    ui.text(`YOU ${c.teamSafe}  HIM ${c.collSafe}`, PANEL_W / 2 + 40, 10, C.bone, { align: 'center' });
    // the panel of circuits
    const n = c.slots.length;
    const gap = 3, tw = Math.min(36, Math.floor((PANEL_W - 20 - (n - 1) * gap) / n)), x0 = Math.round((PANEL_W - (n * tw + (n - 1) * gap)) / 2), y = 32;
    const myTurn = c.turn === 'team' && !c.done;
    c.slots.forEach((sl, i) => {
      const x = x0 + i * (tw + gap);
      const sel = this.picked.includes(i);
      const over = ui.hover(x, y, tw, 44);
      let body = C.night, label = '?', col = C.dust;
      if (sl.known) {
        body = sl.over ? C.blood : C.soulLo;
        label = sl.over ? 'OVER' : 'SAFE';
        col = sl.over ? C.white : C.ink;
      }
      if (sl.spent) {
        body = C.ink;
        col = sl.over ? C.blood : C.soul;
      }
      ui.fill(x, y, tw, 44, sel ? C.white : over && myTurn && !sl.spent ? T.base : C.ink);
      ui.fill(x + 1, y + 1, tw - 2, 42, body);
      ui.text(ICON.bolt, x + tw / 2, y + 6, sl.spent ? C.smoke : col, { align: 'center' });
      ui.text(label, x + tw / 2, y + 18, col, { align: 'center' });
      if (sl.spent) ui.text(sl.by === 'team' ? 'YOU' : 'HIM', x + tw / 2, y + 30, C.ash, { align: 'center' });
      ui.text(`#${i + 1}`, x + tw / 2, y + 47, C.ash, { align: 'center' });
      if (v.active && myTurn && !sl.spent && over && ui.clicked) {
        ui.eat();
        if (sel) this.picked = this.picked.filter((k) => k !== i);
        else this.picked = [...this.picked.slice(-1), i];
      }
    });
    this.picked = this.picked.filter((i) => !c.slots[i].spent);

    if (c.done) {
      ui.text(c.done.won ? 'YOU BEAT HIM' : 'THE HOUSE WINS', PANEL_W / 2, 92, c.done.won ? T.hi : C.blood, { scale: 2, align: 'center' });
      ui.text(c.done.why, PANEL_W / 2, 112, C.bone, { align: 'center' });
      ui.text(c.done.won ? 'THE BOON WHEEL IS NEXT.' : 'THE BANE WHEEL IS NEXT.', PANEL_W / 2, 124, C.dust, { align: 'center' });
      return;
    }
    // the actions: what each costs is on the button
    const one = this.picked.length === 1 ? this.picked[0] : -1;
    const known = one >= 0 && c.slots[one].known;
    const magnet = me.charms.includes('magnet') && s.markers >= 1;
    const cost = magnet ? `1 ${ICON.marker}` : money(r.inspectCost);
    const off = !v.active || !myTurn;
    const pickTip = 'Click a circuit first.';
    const y2 = 96;
    if (ui.button('inspect', 8, y2, 96, 20, `INSPECT ${cost}`, {
      edge: T.base, disabled: off || one < 0 || known || me.ghost && false,
      tip: off ? "Wait for your turn." : one < 0 ? pickTip : known ? 'Already known.' : 'See its state. He sees it too.',
    })) this.act({ t: 'inspect', circuit: one });
    if (ui.button('activate', 112, y2, 96, 20, 'ACTIVATE', {
      edge: T.base, disabled: off || one < 0 || me.ghost,
      tip: me.ghost ? 'A ghost may only inspect.' : off ? 'Wait for your turn.' : one < 0 ? pickTip : `Safe: +$${r.safeBank} and a marker. Overloaded: a life.`,
    })) this.act({ t: 'activate', circuit: one });
    if (ui.button('reroute', 216, y2, 96, 20, 'REROUTE', {
      edge: T.base, disabled: off || this.picked.length !== 2 || me.ghost,
      tip: off ? 'Wait for your turn.' : this.picked.length !== 2 ? 'Click two circuits to swap.' : 'Swap them. He remembers positions, not circuits.',
    })) this.act({ t: 'reroute', a: this.picked[0], b: this.picked[1] });
    // the rules, every turn (critic F5): what he does, and how you win
    ui.text('HE TAKES THE LOWEST # HE TRUSTS; HE SKIPS OVERLOADS HE SAW.', 12, 120, C.collHi);
    ui.text(`WIN: BLOW HIS ${r.fuses} FUSES, OR CASH MORE SAFES. TIES: HOUSE.`, 12, 130, C.collHi);
    ui.text(myTurn ? 'YOUR TURN' : 'HIS TURN...', 12, 143, myTurn ? C.white : T.hi);
    c.log.slice(0, 2).forEach((l, i) => ui.text(l, 70, 143 + i * 10, i === 0 ? C.bone : C.ash));
  }

  /** Send a Circuit action; the picks clear (critic F6: the next click shouldn't toggle a stale pick off). */
  private act(c: Command) {
    this.picked = [];
    this.send(c);
  }

  private wheel(ui: UI, v: PanelView) {
    const s = v.state;
    const w = s.wheel!;
    const boon = w.kind === 'boon';
    const slots = boon ? BOONS : BANES;
    ui.text(boon ? 'THE BOON WHEEL' : 'THE BANE WHEEL', 86, 10, boon ? T.hi : C.blood);
    ui.text(boon ? 'ONE OF SIX, EQUALLY LIKELY. IT HELPS.' : 'ONE OF SIX, EQUALLY LIKELY. IT LASTS ALL NEXT NIGHT.', PANEL_W / 2, 30, C.dust, { align: 'center' });
    let lit = -1;
    if (w.slot !== null) {
      const left = Math.max(0, w.until - v.tick);
      const total = WHEEL.spinS * TICKS_PER_S;
      const t = 1 - left / total;
      // the light runs round and slows onto the slot it landed on
      const steps = Math.floor((1 - (1 - t) ** 2) * 24);
      lit = left > 0 ? (w.slot + 24 - (24 - steps)) % 6 : w.slot;
    }
    slots.forEach((sl, i) => {
      const x = 12 + (i % 3) * 100, y = 44 + Math.floor(i / 3) * 40;
      const on = i === lit;
      ui.fill(x, y, 96, 34, on ? (boon ? T.base : C.blood) : C.ink);
      ui.fill(x + 1, y + 1, 94, 32, on ? (boon ? T.lo : C.highLo) : C.night);
      ui.text(sl.label, x + 48, y + 13, on ? C.white : C.bone, { align: 'center' });
    });
    if (w.slot === null) {
      if (ui.button('fortune', 110, 140, 100, 22, 'SPIN', { edge: boon ? T.base : C.blood, disabled: !v.active, tip: 'Spin the wheel.' })) this.send({ t: 'fortune' });
    } else if (v.tick >= w.until) ui.text(slots[w.slot].text, PANEL_W / 2, 146, C.white, { align: 'center' });
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
      lines.push(['SPEND YOUR MARKERS AT THE CAGE ON THE EAST WALL.', C.dust]);
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
