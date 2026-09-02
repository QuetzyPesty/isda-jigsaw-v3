# Favorability Rulesets

ISDA Jigsaw scores every clause as dealer-favorable, buy-side-favorable, or neutral — but that classification is one editorial view, not a fact. A favorability ruleset lets anyone write their own view as a small JSON file and load it into the app, where it actually changes the scoring (Risk Gauge, board tags, outputs) instead of just being a note on the side.

## Files here

- **`favorability-ruleset.template.json`** — every clause the app knows about, pre-filled with its built-in view. Copy it, rename it, and change whichever values you disagree with. Anything you leave alone behaves exactly like the built-in default.
- **`favorability-ruleset.example.json`** — a small example that only overrides a few clauses, to show that a file doesn't need to be complete.

## The format

```json
{
  "name": "Whatever you want to call your view",
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
