// Hi-Lo Dice's panel. Milestone 0: the static odds card. Every number on it comes from the
// table's data (src/data/tables.ts → DESIGN.md §3): the tier, the win chance, the payout and what
// losing costs are all on the card before the call buttons (pillar 5, "every risk is shown").
import { Panel, PANEL_W, PANEL_H, type PanelView } from './panel';
import type { UI } from '../ui/ui';
import { C, TIER_ROLE, TIER_NAME } from '../data/palette';
import { TABLE_BY_ID } from '../data/tables';
import { ICON } from '../ui/font';

const LOSS_ICON = { coin: ICON.coin, mark: ICON.mark, skull: ICON.skull };

export class HiLoPanel extends Panel {
  constructor() {
    super('hilo');
  }

  protected key(v: PanelView) {
    return `${v.state.bank}`;
  }

  protected draw(ui: UI, v: PanelView) {
    const t = TABLE_BY_ID.get('hilo')!;
    const tier = TIER_ROLE[t.tier];
    const bet = typeof t.bet === 'number' ? t.bet : t.bet[0];
    // the felt, edged in the tier color
    ui.panel(0, 0, PANEL_W, PANEL_H, 'felt', { edge: tier.base });
    // header: the tier badge, the name, the loss glyph
    const badge = TIER_NAME[t.tier];
    ui.fill(8, 8, 40, 15, tier.base);
    ui.text(badge, 28, 12, C.ink, { align: 'center' });
    ui.text(t.name.toUpperCase(), 56, 12, C.white);
    ui.text(LOSS_ICON[t.loss], PANEL_W - 14, 12, tier.hi);
    ui.fill(8, 27, PANEL_W - 16, 1, tier.lo);

    // the odds, in the order a gambler reads them
    const rows: [string, string, number][] = [
      ['WIN CHANCE', `${Math.round((t.winP ?? 0) * 100)}%  (CALL HI OR LO)`, C.white],
      ['PAYS', `${t.paysText}  ($${Math.round(bet * (t.pays ?? 0))} ON $${bet})`, C.white],
      ['RETURN', `$${t.rtp.toFixed(2)} PER $1 BET`, C.white],
      ['LOSING COSTS', `$${bet} + 1 MARK ${ICON.mark}`, tier.hi],
    ];
    let y = 36;
    for (const [k, val, col] of rows) {
      ui.text(k, 12, y, C.dust);
      ui.text(val, 100, y, col);
      y += 14;
    }
    // what a mark is, said once, right where it is earned (DESIGN.md §3)
    ui.panel(8, y + 1, PANEL_W - 16, 26, 'inset', { blocking: false });
    ui.text(`${ICON.mark} MARK: -5% ON YOUR MID-TABLE PAYOUTS FOR 30 S.`, 14, y + 5, tier.hi);
    ui.text('STACKS TO 10. AT 3 STACKS THIS TABLE STOPS PAYING.', 14, y + 16, C.dust);
    y += 34;

    // the bet and the calls (bets open with the night in Milestone 1)
    ui.text('BET', 12, y + 6, C.dust);
    ui.text(`$${bet}`, 40, y + 6, C.white);
    const open = false;
    const tip = 'Bets open when the night starts.';
    if (ui.button('call-hi', 96, y, 96, 20, 'CALL HI', { edge: tier.base, disabled: !open, tip })) this.send({ t: 'call', table: 'hilo', call: 'hi' });
    if (ui.button('call-lo', 200, y, 96, 20, 'CALL LO', { edge: tier.base, disabled: !open, tip })) this.send({ t: 'call', table: 'hilo', call: 'lo' });
    ui.text(v.active ? 'E OR ESC: STAND UP' : '', PANEL_W / 2, PANEL_H - 14, C.ash, { align: 'center' });
  }
}
