# The Vig — Design model

Every number derives from this file. These are **starting hypotheses for the slice**, chosen
from the model and tuned by play and by the pace tests, never by looking at another game's
numbers. Change a number → write the new derivation here first.

## 1. Units and the one rule

- Tick 1/60 s. A night is **360 s**. Money in whole dollars. Lives are integers per player.
- **RTP** (return to player) is the expected payout per dollar bet. **The rule: RTP rises with
  the tier, and the price of losing rises from money → marks → lives.** Low < 1.0; mid > 1.0
  with marks; high ≫ 1.0 with death.
- Every random outcome comes from the seeded RNG through the command log, so a night can be
  replayed from inputs.

## 2. The quota

Night 1 **$3,000**, then ×1.5: $4,500, $6,750, $10,125… Start bank **$1,000**. A lost
Collector gamble adds a random +10–40% on top of the ×1.5 for the next night. Shortfall:
**one life per $1,000 short**, rounded up, taken from the player with the most lives (ties:
team picks). Overshoot pays **1 marker per $500 over**.

## 3. Tables (floor 1) and their derivations

Rates assume one player at the table continuously.

| Table | Tier | Bet | Round | Win p | Pays | RTP | EV/round | EV/min | Losing costs |
|---|---|---|---|---|---|---|---|---|---|
| The Bandit | low | $100 | 2.5 s | per reel table | per reel table | 0.95 | −$5 | −$120 | the bet |
| Twenty-One | low | $100–300 | 8 s | ≈0.43 | 1:1, 3:2 natural | 0.97 | −$6 at $200 | −$45 | the bet |
| Hi-Lo Dice | mid | $200 | 3 s | 0.50 | 2.4× | 1.20 | +$40 | +$800 (unmarked) | the bet + 1 **mark** |
| Wheel of Marks | mid | $300 | 5 s | 0.72 | 1.6× | 1.15 | +$46 | +$550 | the bet + 1 **team mark** |
| Red Line | high | $500 | 6 s | 0.50 | 2.5× | 1.25 | +$125 | +$1,250 | the bet; **3 losses in a row = death** |
| Dead Man's Hand | high | $1,000 | 4 s | 0.30 | 5× | 1.50 | +$500 | +$7,500 | the bet; **a 1–1 (1/36) = death**, checked before the win roll |

**Marks (Hi-Lo):** −5% to *that player's* mid-table payouts for 30 s, stacking to 10. Hi-Lo
breaks even at 1.20 × (1 − m) = 1 → m = 16.7% → **3 stacks**. At 3 s a round and 50% losses
you earn a mark every 6 s, so a Hi-Lo burst is profitable for about **5 rounds (15 s, ~+$150
expected)**, then the player should move. Marks make the mid tables a rotation, not a camp.

**Team marks (Wheel):** one of four, 45 s: Cold Deck (all payouts −10%), Sticky Floor (move
speed −30%), Blackout (odds hidden on every table), Tax (5% of bank, immediately). 28% of
rounds → ~3.4 team marks a minute from one player at the Wheel. The Wheel is money that costs
your friends something.

**Red Line death:** with p(loss) = 0.5, the chance of a three-loss streak within n rounds is
≈ 0.125 at n = 3, ≈ 0.37 at n = 6, ≈ 0.52 at n = 10. A **six-round burst (36 s) is +$750
expected at ~37% risk of death**. That's the table's sentence, and it's printed on the felt.

**Dead Man's Hand:** 2.8% death per roll, 34% per minute of rolling. Bank variance is the
other killer: at $1,000 a roll a $1,000 bank is one loss from broke. It exists for the last
minute of a night you're about to fail.

**Why night 1 forces risk.** You need +$2,000 in 360 s. Low tables are negative. Hi-Lo bursts
alone (+$150 per 15 s then 30 s off) average ~+$200/min → +$1,200 → **short**. Hi-Lo bursts
rotated with the Wheel ≈ +$600/min → quota in ~4 min at the cost of team marks. Two Red Line
bursts (+$1,500 expected) make it with a ~60% chance of someone dying once. The model says: a
night-1 team spreads across Hi-Lo, Wheel and one brave Red Line player.

## 4. Souls

Death → the player is a **ghost**: can walk, watch, talk, and **inspect one circuit per
Circuit round**; cannot bet or buy. **Buyback: 50% of the current quota** ($1,500 on night 1),
from the bank, by any living player at the cage. A ghost at the end of a night stays a ghost
(their lives don't refill) and the Collector counts a ghost as 0 lives for shortfalls.

## 5. The cage: markers and charms

**Markers** come from: a Red Line win (+1), a Dead Man's Hand win (+2), each safe circuit you
activate (+1), each $500 over quota (+1). Slice charms (one per player slot, 3 slots):

| Charm | Price | Table side | Circuit / Collector side |
|---|---|---|---|
| Lucky Fuse | 3 | — | survive an overload: **+1 life** |
| Overclock | 4 | **payouts ×2 for 60 s** | …after surviving an overload |
| Lead Apron | 3 | — | your **first overload each night costs nothing** |

Derived check: Lead Apron + Overclock turns the first Circuit overload of a night from a lost
life into a free ×2 window, which makes **activating blind early** the right play for that
player, where without them it is the wrong play. That flip is a pace test (§8). Upgrades
(permanent, markers): a fourth charm slot (6), +$500 starting bank per night (4), Hi-Lo marks
last 20 s (4).

## 6. The Circuit (floor 1 rules)

A panel of **7 circuits, 2 overloaded**, shuffled by the seeded RNG. **Players vs the Collector**,
alternating turns, players first (the team picks who acts each turn; a ghost may only inspect).

- **Inspect** a circuit: costs **$100** (or 1 marker with Marker Magnet); its state is shown to
  the whole team. Uses the turn.
- **Reroute**: swap two circuits' positions blind. Uses the turn. (Useful after the Collector
  inspects: he remembers positions, not states.)
- **Activate** a circuit: safe → **+$300 and +1 marker** to the team, the circuit is spent;
  overloaded → the activator **loses 1 life** (floor 1 house rule; floor 2 switches to bank
  damage), the circuit is spent.
- The **Collector** has **2 fuses**. He never inspects; he activates the circuit the team has
  not touched for longest, remembers any state he has seen, and avoids a circuit the team
  revealed as overloaded. An overload he activates costs him a fuse.
- **End**: when both overloads are spent, or the Collector is out of fuses, or every living
  player is out of lives. **Win** if the Collector is out of fuses, or if the team activated
  more safe circuits than he did when the panel is spent. Ties go to the house.

Derived: with 5 safe of 7 and the Collector blind, the team's best line is to inspect twice
($200) and then activate known safes; expected team score 3 safe vs his 2 with ~30% chance he
blows a fuse twice. Win rate for a sensible team ≈ 55–60% on floor 1 with no charms, higher
with Lead Apron (a free blind activation on turn one). The pace test checks the band.

## 7. The Collector's choice and the wheels

Made quota → **Pay** (quota leaves the bank; next ×1.5) or **Gamble** (play the Circuit).
Win: quota paid, spin the **Boon wheel**. Lose: quota paid, next quota ×1.5 then
**+10–40%**, spin the **Bane wheel**.

Boon (6 slots): everyone +1 life · +$1,000 · +3 markers · a random charm · next quota −20% ·
all marks cleared and the team is mark-immune next night.

Bane (6 slots, all last the next night): Cold Deck all night · one random living player −1
life now · blood tables kill on **two** losses · Hi-Lo marks last 60 s · soul buyback 75% ·
the Circuit has 3 overloads.

Derived: gambling is the right call when the team has a charm that fires on overloads or a
strong bank cushion; paying is right at 2 lives with no charms. Both must be chosen by a
sensible bot in different states (pace test).

## 8. Derived checks (these become pace tests, run on 20 seeds)

1. **Safe-only** bot (Bandit + Twenty-One) fails night 1 on ≥ 19/20 seeds.
2. **Mid-rotation** bot (Hi-Lo 5-round bursts, Wheel between) makes night 1 on ≥ 12/20 with
   mean ≥ 3 team marks suffered.
3. **Red Line burst** bot makes night 1 on ≥ 14/20 and dies at least once on ≥ 8/20.
4. **Dead Man's** bot from a $1,000 bank goes broke on ≥ 6/20.
5. **Circuit**: a sensible team bot (inspect ×2, activate known safes) wins 10–13 of 20
   against the floor-1 Collector; with Lead Apron equipped, the bot that activates blind on
   turn one wins more than the bot that inspects first (the flip).
6. **Collector's choice**: the decision bot gambles when holding Lucky Fuse or Lead Apron and
   pays at ≤ 2 lives with no charms, and gets a better three-night outcome than always-pay and
   always-gamble.
7. **Ghost**: a two-player run where one dies in the first minute still makes night 1 on
   ≥ 8/20 when the survivor buys the soul back at the right time (the bot buys back when bank
   > quota × 0.5 + $1,000).

## 9. What the slice must answer

1. Does the room feel like one question (how much risk does this quota force), or like six
   minigames?
2. Does a charm make you play the Circuit differently?
3. Is "pay or gamble" a real argument with a friend, or an obvious pick?
4. Can you read a table's tier, odds and loss cost before you commit, in first person, in one
   glance?

If any answer is no, fix the model here before Milestone 3.
