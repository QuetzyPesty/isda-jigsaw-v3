# How the scoring engine was built

This walks through the actual judgment calls behind the Risk Gauge — the dealer/buy-side/neutral tag on every clause option, and the formula that turns those tags into one number. It's written so you can decide where you disagree, and encode that disagreement as a [favorability ruleset](favorability-rulesets/) instead of just distrusting the number.

Scope: this covers the general framework, every scoring rule, and the reasoning behind the calls most likely to be contested. It does not re-list all ~174 individual option tags — `app.js`'s `PIECES` object is the single source of truth for those, and a prose copy here would just drift out of sync with it over time. Search `app.js` for a clause's `key` (shown in any Export JSON file) to see its exact tag.

## What "favors" actually means

Every clause option in `PIECES` carries a `favors` value: `"dealer"`, `"buyside"`, or `"neutral"`. It's an editorial judgment about which party's commercial interest the option serves *as market practice generally understands that clause* — not a measure of which option is "better drafting," "more common," or "more conservative." A tightly-drafted, well-advised neutral clause and a one-sided dealer clause can both be perfectly valid drafting; the tag only says who it benefits.

Two structural fields don't fit the single "who does this favor" question, and are handled differently:

- **`aet` (Automatic Early Termination)** is a `dualSelect`: it's elected once per party, and — critically — AET applying *to* a party benefits the *other* party (it lets the other side close out automatically on that party's insolvency without depending on a notice that an automatic stay could otherwise block). So each option carries `favorsA`/`favorsB` separately rather than one shared `favors`, and the two are opposites of each other by construction.
- **The four `dualNumber` fields** (Cross Default Threshold, Independent Amount, CSA Threshold, MTA) aren't a small set of discrete options at all — they're negotiated dollar amounts for each party. There's no "this specific number is dealer-favorable" tag to assign; instead each field carries a `polarity` (which direction of imbalance favors which side) and a `weight` (see below), and the *actual, current gap between the two parties' numbers* drives the contribution, not a fixed tag.

## The scoring formula, exactly

`computeRiskScore()` walks every field currently in the config and sums a signed contribution, clamped to ±100 for the gauge display:

| Field type | Contribution |
|---|---|
| `select` | ± the chosen option's weight: **10** normally, **18** if the option is flagged `aggressive` |
| `multiselect` | ± each *elected* option's weight, summed: **6** normally, **10** if `aggressive` |
| `dualSelect` | ± **8** for each side independently, using that side's own `favorsA`/`favorsB` for the option elected on that side |
| `dualNumber` | `polarity × −(normalizedDiff) × weight`, where `normalizedDiff = (counterparty value − dealer value) / (counterparty value + dealer value)`, and `weight` is field-specific (see below) |

`+` means dealer-favorable, `−` means buy-side-favorable.

**Why `aggressive` options get more weight (18 vs. 10, 10 vs. 6):** a small number of options in the data model represent elections genuinely outside prevailing market practice, not just one end of a normal negotiating range (e.g. uncapped Additional Termination Events with no carve-outs, a bespoke aggressive haircut schedule well past the standard tiers). The extra weight reflects that these aren't just "a bit more dealer-favorable than the alternative" — they're a materially different kind of ask, and the gauge should move more when one is elected.

**Why `dualNumber` fields use a continuous ratio instead of a fixed weight:** unlike a `select` field's handful of qualitatively different options, a Threshold or MTA is a number that can be negotiated to any value — $10mm vs. $10.5mm is a rounding error, $10mm vs. $100mm is a real imbalance. A fixed per-option weight can't capture that; `normalizedDiff` scales the contribution by *how lopsided the actual numbers on the board are*, from 0 (equal) toward ±1 (one side effectively unlimited relative to the other). `polarity` then encodes which direction of imbalance helps which party:

- **Threshold-like fields** (`crossDefaultThreshold`, `threshold`) use `polarity: 1`: a *higher* threshold benefits whichever party's threshold it is, because it takes a larger exposure before that party's default rights (or margin call obligations) trigger against the other side. The formula is written from the counterparty's side, so a higher counterparty threshold is buy-side-favorable — matching the direction most negotiations actually run in (the buy-side asking for headroom).
- **Independent Amount** uses `polarity: -1`: this is collateral posted *upfront*, before any exposure exists — so a party posting more IA is giving the dealer a bigger buffer, which is dealer-favorable, the opposite direction from Threshold.
- **MTA** uses `polarity: 1` like Threshold, but a lower `weight` (8 vs. 15): a wide MTA reduces transfer friction for whoever's exposure it applies to, but it's a smaller, more operational lever than Threshold or IA — not a plausible route to walking away from a real exposure the way a very high Threshold can be — so it moves the gauge less per dollar of imbalance.

## Category-by-category: the calls worth knowing about

### Frame (Governing Law, jurisdiction, immunity, transfer)

Most Frame options are genuinely `neutral` — governing-law choice (NY vs. English vs. other) doesn't structurally favor either side; it's usually a function of which market the deal is booked from, not a negotiating win. The two fields where a clear side does emerge:

- **Sovereign immunity waiver**: a full waiver of suit and execution is `dealer`-favorable (it gives the dealer an enforceable remedy against a state counterparty like it would against any other); the printed-form default of no waiver is `buyside`-favorable (it preserves the sovereign's immunity, which is exactly what sovereign counterparties negotiate hardest to keep).
- **Transfer/assignment**: anything that lets the dealer transfer/novate freely (to an Affiliate, or with a deemed-consent timer) is `dealer`-favorable — it's the dealer buying flexibility to manage its own book; requiring the counterparty's consent for every transfer with no exception is `buyside`-favorable, since it blocks the dealer from novating the trade to a party the counterparty never agreed to face.

### Core (Credit / Triggers)

This is where the sharpest, most consequential calls live, because these clauses decide when a default actually gets declared:

- **Cross Default trigger scope**: "default or becoming capable of being declared due" (broad — catches technical/covenant breaches before any payment is actually missed) is `dealer`-favorable; "actual default only" (payment/acceleration already occurred) is `buyside`-favorable, since it narrows the trigger to something that actually happened rather than something that merely could.
- **Specified Entities**: scoping cross-default/bankruptcy triggers to "All Affiliates, present and future, worldwide" is `dealer`-favorable (maximum trigger surface); "none specified" is `buyside`-favorable (the printed form's narrowest scope, no affiliate contagion).
- **Additional Termination Events** (NAV decline, key person, ratings downgrade) are each `dealer`-favorable as a *class* — every one is an extra way for the dealer to walk away that the printed form doesn't otherwise give it. This is a `multiselect`, so electing more of them compounds the dealer-favorable contribution rather than being an either/or choice.
- **Close-out valuation methodology** — the one most worth reading closely if you're going to disagree with it: `closeOutAmount2002` is tagged `neutral`, `marketQuotation1992` (third-party dealer quotes required) is `buyside`, and `loss1992` (the non-defaulting party's own reasonable determination) is `dealer`. The reasoning: Market Quotation is the most objective of the three (an outside check on the number), Loss is the most self-serving (whoever's calculating marks their own homework), and Close-out Amount — introduced in 2002 specifically to replace Loss's one-sidedness with a "commercially reasonable procedures" standard — sits genuinely in between rather than clearly on one side. Real drafting practice disputes exactly where in that middle it belongs (see the `favorability-rulesets/` examples, two of which take opposite positions on this specific clause).
- **Automatic Early Termination**: as noted above, this is scored per-side from the *other* party's benefit, not the electing party's — see `favorsA`/`favorsB` in the data model rather than a single `favors`.

### Attachments (CSA / Collateral)

- **Eligible collateral**: cash (USD or another G7 currency) is `neutral` — the CSA baseline; every non-cash asset class (government bonds, equities, money-market fund shares) is `buyside`-favorable, because each additional accepted asset class is optionality for whoever's *posting* collateral (usually the party more likely to be out-of-the-money) to post something other than cash.
- **Haircut schedule**: cash-only/zero haircut is `buyside` (nothing is discounted); the ISDA/SIMM standard schedule is `neutral` (market convention); a bespoke aggressive schedule well past standard tiers is `dealer` (and `aggressive`-weighted, per above) — it demands more collateral value than market practice for the same asset.
- **Valuation Agent**: dealer-sole is `dealer` (one side marks the collateral calculation with no built-in check); a disclosed methodology with a dispute mechanism is `neutral`; counterparty-or-third-party is `buyside`.
- **Rehypothecation rights**: full rehypothecation is `dealer` (the dealer can use posted collateral as if it were its own); no rehypothecation (pure segregated pledge) is `buyside`; a recallable right sits at `neutral` in this tool's baseline — though real dealer-insolvency history (Lehman, MF Global) is exactly why one of the example rulesets argues recallable should function as effectively dealer-favorable in practice, not neutral.

### Edge (Ops / Tax) and Inserts (Bespoke)

These two categories are the least uniform — many fields here are genuinely `neutral` by design (protocol adherence, confirmation method, tax representations track a regulatory fact rather than a negotiating position). Where a side does emerge, the pattern is consistent with the categories above: whichever option gives one party more unilateral control or optionality (sole calculation agent, uncapped fish-or-cut-bait timing, no MFN protection) is tagged for that party; whichever option adds a check, a deadline, or a mutual/symmetric standard is tagged for the other.

## What this scoring does *not* cover

The Compatibility Engine (the panel that flags mismatches, aggressive combinations, and drafting notes as you edit the board) is a **separate rules system** — hand-written structural checks (e.g. "AET applies with no Process Agent named"), not derived from `favors` at all. Overriding favorability via a ruleset changes the Risk Gauge, card tags, and output leans; it does not change which Compatibility Engine flags fire.

## Disagree with something here?

That's the point of [favorability rulesets](favorability-rulesets/) — write your own view of any clause this document didn't convince you of, and load it in. The app will actually score it your way, not just note your objection on the side.
