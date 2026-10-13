// What every table's panel shares (pillar 5, "every risk is shown"): the header (tier badge, name,
// loss glyph), the odds block (win chance, payout, what losing costs, the return per $1, the
// rule) printed before any bet button, the payout factor you're on right now, and the last result.
// A Blackout team mark is the only thing that hides the odds, and the panel says it is doing so.
import { Panel, PANEL_W, PANEL_H, type PanelView } from './panel';
import type { UI } from '../ui/ui';
import { C, TIER_NAME, TIER_ROLE } from '../data/palette';
import { TABLE_BY_ID, minBet, type TableDef } from '../data/tables';
import { ICON } from '../ui/font';
import { TICKS_PER_S, type Card, type Outcome, type TableState } from '../sim/state';
import { payoutFactorOf, blackoutLeft, lossTextOf } from './view';
import { stakeFor } from '../sim/rules';
import { isRed, RANK } from '../sim/tables/table';

export const LOSS_ICON = { coin: ICON.coin, mark: ICON.mark, skull: ICON.skull };
const SUIT = [ICON.hearts, ICON.diamonds, ICON.clubs, ICON.spades];
export const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

/** The y where a table panel's play area starts and its controls row sits. */
export const PLAY_Y = 70;
export const CTRL_Y = 146;

export abstract class TablePanel extends Panel {
  readonly def: TableDef;

  constructor(table: string) {
    super(table);
    this.def = TABLE_BY_ID.get(table)!;
  }

  protected tableState(v: PanelView): TableState {
    return v.state.tables[this.table];
  }

  /** 0..1 through the round in the air (0 when idle). */
  protected progress(v: PanelView): number {
    const t = this.tableState(v);
    if (!t.pending) return 0;
    const n = this.def.resolveS * TICKS_PER_S;
    return Math.max(0, Math.min(1, 1 - (t.until - v.tick) / n));
  }

  protected animating(v: PanelView) {
    return !!this.tableState(v).pending;
  }

  /** The outcome to show: the one in the air (its faces animate) or the last that landed. */
  protected shown(v: PanelView): { o: Outcome | null; rolling: boolean } {
    const t = this.tableState(v);
    if (t.pending) return { o: t.pending, rolling: true };
    return { o: t.last, rolling: false };
  }

  protected draw(ui: UI, v: PanelView) {
    const d = this.def;
    const tier = TIER_ROLE[d.tier];
    ui.panel(0, 0, PANEL_W, PANEL_H, 'felt', { edge: tier.base });
    // header: the tier badge, the name, the loss glyph
    ui.fill(8, 7, 40, 14, tier.base);
    ui.text(TIER_NAME[d.tier], 28, 10, C.ink, { align: 'center' });
    ui.text(d.name.toUpperCase(), 54, 10, C.white);
    ui.text(LOSS_ICON[d.loss], PANEL_W - 16, 10, tier.hi);
    ui.fill(8, 24, PANEL_W - 16, 1, tier.lo);

    // the odds, in the order a gambler reads them
    const me = v.state.players[v.player];
    const bo = blackoutLeft(v.state);
    if (bo > 0) {
      ui.panel(8, 28, PANEL_W - 16, 38, 'inset', { blocking: false });
      ui.text(`${ICON.mark} BLACKOUT: THE ODDS ARE HIDDEN`, PANEL_W / 2, 36, C.midHi, { align: 'center' });
      ui.text(`A TEAM MARK. ${Math.ceil(bo / TICKS_PER_S)} S LEFT. THE TABLE STILL PLAYS.`, PANEL_W / 2, 50, C.dust, { align: 'center' });
    } else {
      const bet = minBet(d);
      const win = `WIN ${Math.round(d.winP * 100)}%`;
      const pays = d.pays !== null ? `PAYS ${d.paysText} (${money(bet * d.pays)} ON ${money(bet)})` : `PAYS ${d.paysText}`;
      ui.text(win, 12, 29, C.white);
      ui.text(pays, 70, 29, C.white);
      ui.text(`LOSE: ${lossTextOf(d, v.state).replace('THE BET', '$' + (typeof d.bet === 'number' ? d.bet : `${d.bet[0]}-${d.bet[1]}`))}`, 12, 40, tier.hi);
      ui.text(`RETURNS $${d.rtp.toFixed(2)} PER $1`, 12, 51, C.dust);
      const f = payoutFactorOf(v.state, me, d.id);
      if (me.overclock > 0) ui.text(`OVERCLOCK: STAKES AND WINS x2, ${Math.ceil(me.overclock / TICKS_PER_S)} S`, PANEL_W - 12, 51, C.gold, { align: 'right' });
      else if (Math.abs(f - 1) > 1e-9) ui.text(`YOUR PAYOUTS NOW x${f.toFixed(2)}`, PANEL_W - 12, 51, f < 1 ? C.midHi : C.gold, { align: 'right' });
      ui.text(d.howText, 12, 60, C.ash);
    }
    this.drawPlay(ui, v);
    this.drawControls(ui, v);
  }

  /** The table's own game: reels, dice, cards, the wheel. */
  protected abstract drawPlay(ui: UI, v: PanelView): void;
  /** The bet buttons (drawn after the odds: the odds always come first). */
  protected abstract drawControls(ui: UI, v: PanelView): void;

  /** This player's stake at this table now (Overclock doubles it). */
  protected stake(v: PanelView, base = minBet(this.def)): number {
    return stakeFor(v.state.players[v.player], base);
  }

  /** The odds are hidden by a Blackout (the header says so). */
  protected dark(v: PanelView): boolean {
    return blackoutLeft(v.state) > 0;
  }

  /** Why a bet button is disabled, or '' when it isn't. */
  protected blocked(v: PanelView, amount: number): string {
    const s = v.state;
    if (!v.active) return 'Sit down to play.';
    if (s.phase !== 'floor') return 'The tables are closed.';
    if (this.tableState(v).pending) return 'Wait for the result.';
    if (s.bank < amount) return `The bank is short: ${money(s.bank)} of ${money(amount)}.`;
    return '';
  }

  /** A bet button with its stake on it; its tooltip says what it costs or why it's off. */
  protected betButton(ui: UI, v: PanelView, id: string, x: number, w: number, label: string, amount: number): boolean {
    const why = this.blocked(v, amount);
    const tier = TIER_ROLE[this.def.tier];
    return ui.button(id, x, CTRL_Y, w, 20, label, { edge: tier.base, disabled: !!why, tip: why || `Stakes ${money(amount)} from the bank.` });
  }

  /** The result line under the play area. */
  protected result(ui: UI, v: PanelView, y = CTRL_Y - 12) {
    const { o, rolling } = this.shown(v);
    if (!o || rolling) return;
    const col = o.lifeLost ? C.blood : o.mark ? C.midHi : o.win ? C.gold : o.ret > 0 ? C.bone : C.ash;
    let text = o.text;
    if (o.markers) text += `  +${o.markers} ${ICON.marker}`;
    ui.text(text, PANEL_W / 2, y, col, { align: 'center' });
  }
}

// ---- faces

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

/** A die, `s` px square, showing `face` (1..6). */
export function drawDie(ui: UI, x: number, y: number, s: number, face: number, pip = C.ink, body = C.bone) {
  ui.fill(x, y, s, s, C.ink);
  ui.fill(x + 1, y + 1, s - 2, s - 2, body);
  ui.fill(x + 1, y + s - 2, s - 2, 1, C.dust);
  const p = Math.max(2, Math.round(s / 7));
  const step = (s - 2 * p - 4) / 2;
  for (const [cx, cy] of PIPS[face] ?? []) ui.fill(Math.round(x + p + 2 + cx * step), Math.round(y + p + 2 + cy * step), p, p, pip);
}

/** A playing card (24×34), face up or down. Red suits are drawn in blood (STYLE.md: DECISIONS #37). */
export function drawCard(ui: UI, x: number, y: number, c: Card | null) {
  ui.fill(x, y, 24, 34, C.ink);
  if (!c) {
    ui.fill(x + 1, y + 1, 22, 32, C.collLo);
    ui.frame(x + 3, y + 3, 18, 28, C.coll);
    return;
  }
  ui.fill(x + 1, y + 1, 22, 32, C.bone);
  const col = isRed(c) ? C.blood : C.ink;
  ui.text(RANK[c.r], x + 3, y + 3, col);
  ui.text(SUIT[c.s], x + 12, y + 16, col, { align: 'center' });
}
