# Favorability Rulesets

ISDA Jigsaw scores every clause as dealer-favorable, buy-side-favorable, or neutral — but that classification is one editorial view, not a fact. A favorability ruleset lets anyone write their own view as a small JSON file and load it into the app, where it actually changes the scoring (Risk Gauge, board tags, outputs) instead of just being a note on the side. See [`../ENGINE-DESIGN.md`](../ENGINE-DESIGN.md) for the reasoning behind this tool's own built-in view, clause by clause — the thing these files are meant to let you disagree with.

## Files here

- **`favorability-ruleset.template.json`** — every clause the app knows about, pre-filled with its built-in view. Copy it, rename it, and change whichever values you disagree with. Anything you leave alone behaves exactly like the built-in default.
- **`favorability-ruleset.example.json`** — "Buy-side Counsel View": treats Close-out Amount (2002) as a real, if partial, win over the 1992 Loss standard it replaced, and treats two "neutral" fallback standards (recallable rehypothecation; an undefined "reasonable time" fish-or-cut-bait window) as functionally still dealer-favorable given how they've played out in real dealer insolvencies.
- **`favorability-ruleset.dealer-desk-view.json`** — "Dealer Trading & Credit Desk View": argues that single-determining-party close-out, "joint" valuation, and even a standard (not tight) concentration cap all leave practical control or protection with the dealer's own desk, despite this tool's neutral default.
- **`favorability-ruleset.sovereign-counterparty-view.json`** — "Sovereign / State-Owned Counterparty View": argues a home-jurisdiction arbitration seat and a pledge (rather than title-transfer) collateral structure both matter specifically because of sovereign immunity and asset-title concerns an ordinary corporate counterparty wouldn't have.

Every file here is validated against the app's own import logic before being committed — none of them silently lose an override when loaded.

## The format

```json
{
  "name": "Whatever you want to call your view",
  "description": "Optional — not read by the app, but a good place to record your reasoning for anyone reading the file.",
  "overrides": {
    "<category>": {
      "<clause key>": {
        "<option value>": "dealer" | "buyside" | "neutral"
      }
    }
  }
}
```

One clause — Automatic Early Termination (`core` / `aet`) — affects each party differently, so its value is `{ "favorsA": ..., "favorsB": ... }` instead of a single word. Every other clause uses a plain string.

You don't need to memorize the category/clause/option keys: open the app, set the board to whatever position you're interested in, click **Export JSON**, and read the key names straight out of the downloaded file's `config` object.

## Using a ruleset

In the app: **Import…** → **Import Favorability Ruleset** → pick your file → give it a name. It shows up in the **Favorability** dropdown and applies immediately.
