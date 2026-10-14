# The Vig — Design model

Every number derives from this file. These are **starting hypotheses for the slice**, chosen
from the model and tuned by play and by the pace tests, never by looking at another game's
numbers. Change a number → write the new derivation here first.

## 1. Units and the one rule

- Tick 1/60 s. A night is **360 s**. Money in whole dollars. Lives are integers per player:
  **3 each** at the start of a run. The slice is **three nights** on floor 1; surviving the
  third Collector wins it.
- **RTP** (return to player) is the expected payout per dollar bet. **The rule: RTP rises with
  the tier, and the price of losing rises from money → marks → lives.** Low < 1.0; mid > 1.0
  with marks; high ≫ 1.0 with death.
- Every random outcome comes from the seeded RNG through the command log, so a night can be
  replayed from inputs.

## 2. The quota

Night 1 **$3,000**, then ×1.5: $4,500, $6,750, $10,125… Start bank **$1,500** (DECISIONS #40;
it was $1,000, and the pace bots went broke before the night's drift could show). A lost
Collector gamble adds a random +10–40% on top of the ×1.5 for the next night. Shortfall:
**one life per $2,000 short** (DECISIONS #55; it was $1,000, and 23% of sensible runs died on
night 1 before seeing the Collector), rounded up, taken from the player with the most lives (ties:
team picks; solo: you), and the Collector takes the whole bank. Overshoot pays **1 marker per
$500 over** (whole $500s, counted before the quota leaves the bank).

**The bank carries over (DECISIONS #10).** After the quota is paid, whatever is left starts the
next night; under $1,000 it is raised to $1,000 (the floor), and the +$500 upgrade adds on top.
After a shortfall the bank is empty, so the next night starts at the floor. The quota still
rises ×1.5 after a shortfall: the curve is per night, not per payment.

**Nights 2 and 3, re-derived.** A team that paid night 1 exactly starts night 2 at $1,000 and
needs **+$3,500** in 360 s; night 3 needs **+$5,750**. Measured (§8, the pace bots, which pay
walking time and every mark): a solo Hi-Lo/Wheel rotation earns **≈ +$2,000 a night** (σ ≈ $1,700),
and adding two Red Line bursts **≈ +$3,400** (σ ≈ $2,600). So night 2 asks for the bursts plus a
carried cushion, and night 3 asks for more than one player can expect: the high tables, an
Overclock window, the Boon, or the overshoot carried from night 2. Overshooting is worth twice:
markers now, and money tomorrow. That is the escalation: night 1 forces mid risk, night 3 forces
blood. Measured on 200 seeds (§8): a sensible solo bot that always pays dies on night 1 6.5% of
the time and survives all three nights 38% of the time. **Open questions for the owner** (the quota
curve and the win condition are theirs): whether a lost gamble's +10–40% is too steep (it is why
paying beats gambling, §7), and whether being short on the last night with lives to spare should
still count as walking out (today it does: DECISIONS #56).

## 3. Tables (floor 1) and their derivations

Rates assume one player at the table continuously.

| Table | Tier | Bet | Round | Win p | Pays | RTP | EV/round | EV/min | Losing costs |
|---|---|---|---|---|---|---|---|---|---|
| The Bandit | low | $100 | 2.5 s | 0.216 (0.396 incl. money back) | reel table below | 0.95 | −$5 | −$120 | the bet |
| Twenty-One | low | $100–300 | 8 s | ≈0.43 | 2× (1:1), 2.5× natural (3:2) | 0.974 | −$5 at $200 | −$39 | the bet |
| Hi-Lo Dice | mid | $200 | 3 s | 0.50 | 2.4× | 1.20 | +$40 | +$800 (unmarked) | the bet + 1 **mark** |
| Wheel of Marks | mid | $300 | 5 s | 0.72 | 1.6× | 1.152 | +$46 | +$550 | the bet + 1 **team mark** |
| Red Line | high | $500 | 6 s | 0.50 | 2.5× | 1.25 | +$125 | +$1,250 | the bet; **3 losses in a row cost a life** |
| Dead Man's Hand | high | $1,000 | 4 s | 0.25 | 6× | 1.50 | +$500 | +$7,500 | the bet; **snake eyes (1/36) costs a life** |

"Pays" is the total returned on a win, stake included. Every table is a finite set of equally
likely outcomes from the seeded RNG, so its RTP is exact by enumeration (the data test checks
it), and a 100k-round seeded run must land within 4 standard errors of it.

**The mechanics** (one honest random draw each; the odds printed are the odds):
- **The Bandit**: three reels of 10 stops each: one 7, two ★, three BAR, four blanks
  (1,000 equally likely lines). Pays, first match wins: 7 7 7 **12×** (1 line), ★ ★ ★ **7×**
  (8), BAR BAR BAR **6×** (27), any three non-blank symbols **3×** (180), a 7 with a blank
  **1×**, your money back (180). Σ = 12 + 56 + 162 + 540 + 180 = 950 → **RTP 0.950 exactly**.
  Something comes back on 39.6% of pulls; you are ahead on 21.6%. No line pays more than
  $1,200 (σ ≈ $155 a pull): a low table must bleed, not hand out a night's quota on one line
  (DECISIONS #38: at 75×/25× the safe-only bot made night 1 on 9% of nights).
- **Twenty-One**: an endless shoe (every card an independent draw of 13 ranks), hit or stand
  only (no doubles, no splits), the dealer hits soft 17, a natural pays 3:2, ties push, a dealer
  natural beats everything but a player natural. With the best hit/stand play the return is
  **0.9736** (computed by dynamic programming over the endless shoe; DECISIONS #32); worse play
  returns less. Win ≈ 0.43, push ≈ 0.09.
- **Hi-Lo Dice**: one die; call HI (4–6) or LO (1–3). p = 1/2 exactly, pays 2.4×.
- **Wheel of Marks**: 25 slots, 18 pay 1.6× and 7 are marks: p = 0.72, RTP 1.152.
- **Red Line**: call RED or BLACK; one card from a fresh deck. p = 1/2 exactly, pays 2.5×.
- **Dead Man's Hand**: two dice. **Snake eyes (1–1) costs a life** and the bet; **any other
  double or a total of 10+ wins 6×** (2–2, 3–3, 4–4, 5–5, 6–6, 4–6, 6–4, 5–6, 6–5: 9 of 36);
  everything else loses the bet. p = 9/36 = 0.25 × 6 = **RTP 1.50 exactly**. (Old wording: 5× at
  p 0.30 with the 1–1 checked before a separate win roll, which made the real RTP 35/36 × 1.5 =
  1.458; DECISIONS #11.)

**Marks (Hi-Lo):** −5% to *that player's* **Hi-Lo** payouts, stacking to 10 (DECISIONS #39: they
used to tax both mid tables, which made the Wheel worth ≈ $1.00 a dollar to a marked player and
the rotation below earn +$590 a night, not a minute); each new stack
resets the timer to 30 s, and the whole mark falls off 30 s after your last Hi-Lo loss. Hi-Lo
breaks even at 1.20 × (1 − m) = 1 → m = 16.7%: **3 stacks still pay (+2%), 4 stacks lose (−4%)**.
At 3 s a round and 50% losses you earn a mark every 6 s, so a Hi-Lo burst is profitable for
about **5 rounds (15 s, ~+$150 expected)**, then the player should move. Marks make the mid
tables a rotation, not a camp.

**Team marks (Wheel):** one of four, equally likely: Cold Deck (all payouts −10%, 45 s),
Sticky Floor (move speed −30%, 45 s), Blackout (odds hidden on every table, 45 s; the panels
say so), Tax (5% of the bank, taken at once; no timer). The same mark again resets its timer.
28% of rounds → ~3.4 team marks a minute from one player at the Wheel. The Wheel is money that
costs your friends something.

**Blood (DECISIONS #8): a blood-table "death" costs one life; you become a ghost only at 0
lives.** Red Line's third loss in a row and Dead Man's snake eyes each take a life. The Red Line
streak is **per player and survives standing up** (otherwise you'd stand after two losses and
the death would never come); a win resets it, and so does the life it takes.

**Red Line's sentence:** with p(loss) = 1/2, the chance of a three-loss streak within n rounds
is 1 − a(n)/2ⁿ, where a(n) counts the win/loss strings with no three losses in a row
(1, 2, 4, 7, 13, 24, 44, 81, 149, 274, 504): **0.125 at n = 3, 0.3125 at n = 6 (1 − 44/64),
0.508 at n = 10**. A **six-round burst (36 s) is +$750 expected at a 31% risk of losing a life**.
That's the table's sentence, and it's printed on the felt.

**Dead Man's Hand:** 2.8% chance of losing a life per roll, 34% per minute of rolling (15 rolls).
Bank variance is the other killer: at $1,000 a roll a $1,000 bank is broke on one loss (75%). It
exists for the last minute of a night you're about to fail.

**Why night 1 forces risk.** You need +$1,500 in 360 s. Low tables are negative. Hi-Lo bursts
alone (+$150 per 15 s then 30 s off) average ~+$200/min → +$1,200 → **short**. Hi-Lo bursts
rotated with the Wheel ≈ +$600/min on paper, **≈ +$330/min measured** (walking 16 m between them,
Cold Deck, waits) → makes it about 2 nights in 3, at the cost of team marks. Two Red Line bursts
(+$1,500 expected) on top, once the bank can take three $500 losses (≥ $2,000), make it about
3 nights in 4 and cost a life on Red Line about 3 nights in 10 (§8, 200 seeds). The model says: a night-1 team spreads across
Hi-Lo, Wheel and one brave Red Line player.

## 4. Souls

Blood tables, overloads and shortfalls take **lives**; a player at **0 lives** is a **ghost**
(DECISIONS #8): can walk, watch, talk, and **inspect one circuit per Circuit round**; cannot bet
or buy. **Solo, a ghost ends the run** (no one is left to buy you back); the results screen says
what the soul rule would have offered. **Buyback: 50% of the current quota** ($1,500 on night 1),
from the bank, by any living player at the cage. A ghost at the end of a night stays a ghost
(their lives don't refill) and the Collector counts a ghost as 0 lives for shortfalls.

## 5. The cage: markers and charms

**Markers** come from: a Red Line win (+1), a Dead Man's Hand win (+2), each safe circuit you
activate (+1), each $500 over quota (+1). Markers are the team's, like the bank. Slice charms
(each player has **3 charm slots**; a charm is bought once and worn by the buyer):

| Charm | Price | Table side | Circuit / Collector side |
|---|---|---|---|
| Lucky Fuse | 3 | — (lives) | **win a Circuit after surviving an overload in it: +1 life** |
| Overclock | 4 | **your stakes, and so your wins, ×2 for 60 s** of table play | …starting when you survive an overload |
| Lead Apron | 3 | **the first life you would lose each night** (blood table, Circuit or shortfall) **costs nothing** | (the same: an overload, too) |
| Marker Magnet | 3 | **high-table wins give double markers** | **inspections cost 1 marker instead of $100** |

Revised after the Milestone 1 review (DECISIONS #53, #54): as first written, Lucky Fuse made every
overload free, Lead Apron + Lucky Fuse made the Circuit a life generator (+0.6 lives a game), and
Overclock doubled the whole return (the Bandit returned 1.90 a dollar for a minute). Now:
Overclock doubles the stake, so the expected win doubles and the odds don't; Lead Apron reaches
onto the floor (it changes whether you'll take a Red Line burst); and Lucky Fuse pays only for an
overload survived on the way to beating him. A revealed overload is dead to the team (§6), so no
charm can be farmed by activating a known overload. "Survive an overload" means activating an
overloaded circuit and still having a life after it. **Overclock's window counts floor time
(DECISIONS #9)**: the Circuit is played at 0:00 when the tables are closed, so the 60 s run from
the next night's first second. **Marker Magnet** runs
the other way, from the tables into the Circuit: a Red Line burst (≈3 wins) pays for it, and
it turns the team's two inspections from $200 into 2 markers. Price derivation: 3 markers ≈ one
Red Line burst's wins plus one safe circuit; Overclock costs one more because its window is worth
≈ +$600 on a mid rotation (+$1,250 on Red Line).

Derived check (§8 test 5): Lead Apron takes the Circuit's life cost to ≈ 0 for any line (0.16 →
0.00 lives a game), which is what makes gambling cheap for the player who wears it.

**Upgrades** (permanent across runs, bought with markers at the cage, saved with the settings):
a fourth charm slot (6), +$500 starting bank every night (4), Hi-Lo marks last 20 s (4).

## 6. The Circuit (floor 1 rules)

A panel of **10 circuits, 2 overloaded** (DECISIONS #52; it was 7), shuffled by the seeded RNG.
**Players vs the Collector**,
alternating turns, players first (the team picks who acts each turn; a ghost may only inspect).

- **Inspect** a circuit: costs **$100** (or 1 marker with Marker Magnet); its state is shown to
  the whole team. Uses the turn.
- **Reroute**: swap two circuits' positions blind. Uses the turn. The team sees which two
  moved (what it knew moves with them); **the Collector remembers positions, not circuits**, so
  after a reroute his memory of those two positions is wrong. Rerouting a revealed overload
  into his next pick is how you blow his fuse.
- **Activate** a circuit: safe → **+$300 and +1 marker** to the team, the circuit is spent;
  overloaded → the activator **loses 1 life** (floor 1 house rule; floor 2 switches to bank
  damage), the circuit is spent. **A revealed overload can't be activated by the team**: the only
  way to spend it is to route him into it.
- The **Collector** has **2 fuses**. He never inspects; he sees what the team inspects (it is
  shown at the table) and remembers it by position. **He activates the lowest-numbered circuit he
  doesn't believe overloaded** (DECISIONS #52; it was "the one left alone longest"), so his next
  move is always visible, and he passes when he trusts nothing left. An overload he activates
  costs him a fuse; a safe one scores for him.
- **End**: when both overloads are spent, or the Collector is out of fuses, or every living
  player is out of lives, or the team has no circuit left to play. **Win** if the Collector is out
  of fuses, or if the team activated more safe circuits than he did. Ties go to the house.
- The screen prints his rule and the win rule every turn.

Measured (400 games): **looking at his next pick, cashing safes you know and routing overloads you
know into his path wins ≈ 48%** at ≈ 0.16 lives a game; activating blind wins ≈ 37% at ≈ 0.34 lives.
The line is about positions, which Buckshot Roulette's shells don't have (the review's derivative
flag; DECISIONS #52). Sweeping the panel: with as many overloads as he has fuses the team wins
37–51% as the panel grows from 7 to 12; with more overloads than fuses the trap wins 83–91%; with
one fuse it always wins. He uses what he sees only to avoid revealed overloads (DECISIONS #41: a
Collector who also took the safes you revealed made inspecting pointless). The pace test checks
the band, and the choice screen prints "you win about 48%".

## 7. The Collector's choice and the wheels

Made quota → **Pay** (quota leaves the bank; next ×1.5) or **Gamble** (play the Circuit).
Win: quota paid, spin the **Boon wheel**. Lose: quota paid, next quota ×1.5 then
**+10–40%**, spin the **Bane wheel**.

Boon (6 slots): everyone +1 life · +$1,000 · +3 markers · a random charm · next quota −20% ·
all marks cleared and the team is mark-immune next night.

Bane (6 slots, all last the next night): Cold Deck all night · one random living player −1
life now · blood tables kill on **two** losses · Hi-Lo marks last 60 s · soul buyback 75% (solo:
the next bank starts $500 lower, DECISIONS #51) · the Circuit has 3 overloads **and he 3 fuses**
(with 3 fuses he can't be blown out, so the team must out-cash him: ≈ 28%; DECISIONS #52).

**The last night** has no tomorrow for a wheel to touch (DECISIONS #50): won, the Circuit takes a
free permanent upgrade from the house's ledger; lost, it costs only what it cost (lives, a turn of
your bank). The choice card says so.

Details for the slice: lives cap at **5** (the Boon and Lucky Fuse can lift you past 3). "A random
charm" goes to the player with a free slot (none free: +3 markers instead). "Next quota −20%"
applies after the ×1.5. In the Circuit, a solo player takes every team turn. A broke player can
end the night early from the Collector's table ("call it", DECISIONS #49).

Intended: gambling is the right call when the team has a charm that fires on overloads or a
strong bank cushion; paying is right at 2 lives with no charms. **Measured (§8 test 6): not yet.**
Always paying scores 2.09, deciding by charms 1.98, always gambling 1.35 (survive-all-three: 38%,
30%, 15%). A lost gamble's +10–40% on the next quota outweighs a 48% Circuit and the Boon. The
lever is the surcharge, which is part of the quota curve: the owner's call (§2).

## 8. Derived checks (pace tests, 200 seeds)

The bots (tests/bots.ts) play through commands and pay walking time at 3 m/s, and wait out each
table's animation (src/data/feel.ts, inside its round time). 200 seeds since the
Milestone 1 review: 20 gave a lucky sample (80% where 200 say 64%). Thresholds are rates
(DECISIONS #42, #57); the last run's numbers are in brackets.

1. **Safe-only** bot (Bandit + Twenty-One at minimum stakes) makes night 1 at most 15% of the time
   and ends the night poorer than it started on average [5%; mean bank $1,236 from $1,500].
   Luck can carry a low table for a night now and then; expectation never does.
2. **Mid-rotation** bot (Hi-Lo bursts of ≤ 5 rounds, out at 3 stacks, the Wheel while marked)
   makes night 1 at least 50% of the time with ≥ 3 team marks suffered on average [63%; 5.3].
3. **Red Line burst** bot (two six-round bursts once the bank holds $2,000, mid rotation around
   them) makes night 1 at least 60% of the time and more often than the mid rotation alone, and
   loses a life on Red Line at least 20% of the time [70% vs 63%; 31%].
4. **Dead Man's** bot from a $1,000 bank goes broke at least 30% of the time [78%].
5. **Circuit** (400 games): the sensible line (§6) wins 40–65%; activating blind costs more lives;
   Lead Apron takes any line's life cost to ≈ 0 [48% at 0.16 lives; blind 37% at 0.34; with the
   apron 0.00 and 0.00].
6. **Collector's choice**: the decision bot gambles when holding Lucky Fuse or Lead Apron with
   more than one life, else pays; it must score at least as well as always-gamble and within
   0.15 of always-pay (score = nights survived + lives/10) [1.85 vs 1.23 and 1.91]. The intended
   lesson, that gambling with a fuse charm is *better*, does not hold yet (§7).
7. **Ghost**: a two-player run where one becomes a ghost in the first minute still makes night 1
   at least 30% of the time when the survivor buys the soul back once the bank holds
   quota × 0.5 + $1,000. A lower bound: the bot doesn't play the bought-back player [52%].

## 9. What the slice must answer

1. Does the room feel like one question (how much risk does this quota force), or like six
   minigames?
2. Does a charm make you play the Circuit differently?
3. Is "pay or gamble" a real argument with a friend, or an obvious pick?
4. Can you read a table's tier, odds and loss cost before you commit, in first person, in one
   glance?

If any answer is no, fix the model here before Milestone 3.
