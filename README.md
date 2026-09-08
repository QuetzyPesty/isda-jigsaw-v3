# ISDA Jigsaw v3

A visual planner for ISDA Master Agreement negotiations.
- Configure clauses on a board,
- see a live dealer/buy-side risk score,
- generate a full-form Schedule (Markdown or Word with real tracked changes),
- practice negotiating against researched market scenarios,
-  "what breaks?" hypothetical stress test against your current position.

Static site, no build step, no server-side code. Everything runs in the browser and saves to your `localStorage` (private to each visitor's own browser — nothing is shared between people).

## Run it

try it out on quetzypesty.github.io/isda-jigsaw-v3

Or

git clone https://github.com/QuetzyPesty/isda-jigsaw-v3.git
cd isda-jigsaw-v3


Then:

Any static file server works. For example:

```bash
npx http-server -p 8083 -c-1 .
```
or if you have Python installed
```
python -m http.server 8083.
```

Then open `http://localhost:8083`.

## Files

- `index.html` — page structure and every modal
- `app.js` — all app logic (clause data model, scoring, rendering, negotiation/stress-test engines)
- `docx-writer.js` — dependency-free .docx generator (used for the Schedule/redline export)
- `style.css` — styling
- `favorability-rulesets/` — ready-to-use favorability ruleset files (see below)
- `ENGINE-DESIGN.md` — a walkthrough of how the scoring engine's judgment calls were made, clause by clause

## The "Import…" menu: four kinds, four different effects

The topbar's single **Import…** button opens a menu with four options. They all read a JSON file, but each does something different — pick carefully. This section documents the file format each one expects, in more depth than the in-app modal has room for.

### 1. Import JSON — replaces your board

The same shape **Export JSON** produces:

```json
{
  "exportedFrom": "ISDA Master Agreement Jigsaw v3",
  "presetId": "hedgeFund",
  "config": { "frame": { "...": "..." }, "core": { "...": "..." }, "attachments": { "...": "..." }, "edge": { "...": "..." }, "inserts": { "...": "..." } },
  "notes": { "...": "..." }
}
```

Only `config` is required — `presetId`/`notes`/`exportedFrom` are ignored or optional. `config` needs one key per category (`frame`, `core`, `attachments`, `edge`, `inserts`), each holding that category's clause values. It doesn't need to be complete: any field a partial config leaves out is filled in from this tool's own defaults (`mergeConfigWithDefaults`), and any field with a malformed value for its type is dropped back to the default too, rather than corrupting the board.

**Effect:** overwrites your current board outright. This is the only one of the four that touches the board — Undo can bring your prior board back.

### 2. Import Comparison Scenario — adds to your scenario library

The same shape as Import JSON, plus an optional display name:

```json
{
  "playbookName": "Acme Legal — Dealer Position",
  "config": { "...": "..." },
  "notes": { "...": "..." }
}
```

You'll be prompted to confirm/edit the name on import.

**Effect:** adds it to the same "Custom Scenarios" list **Save As…** writes to. It never touches your current board — it only becomes a new option in the Scenario dropdown, Compare, Schedule Redline, and Negotiation Scenarios.

### 3. Import Guardrails — live-flags your board

Two accepted shapes. The full, tiered shape:

```json
{
  "name": "Acme Legal — Dealer Guardrails",
  "entries": {
    "core": {
      "closeoutMethodology": { "preferred": "closeOutAmount2002", "fallbacks": ["loss1992"] }
    }
  }
}
```

...or the same flat shape Export JSON/Import JSON produces (`{ "config": {...} }`) — every field it specifies is auto-upgraded into a preferred-only rule with no fallbacks, so an already-exported board doubles as a guardrail set with no separate format to learn.

Coverage doesn't need to be total: a clause the file doesn't mention is simply not flagged (shown as neither on-guardrail nor off — not the same as "outside").

**Effect:** doesn't touch your board. Once picked from the **Guardrails** dropdown, every visible card is tagged live — **Preferred**, **Fallback**, or **Outside Guardrails** — as you edit, with a running compliance count in the status bar under the topbar.

### 4. Import Favorability Ruleset — overrides the scoring itself

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

One clause — Automatic Early Termination (`core` / `aet`) — affects each party differently, so its override is `{ "favorsA": ..., "favorsB": ... }` instead of a plain string; every other clause uses a plain string. Coverage doesn't need to be total: anything a file doesn't mention keeps this tool's own built-in tag for that option.

Full docs, a ready-to-edit template covering every clause, and three example rulesets representing different negotiating perspectives are in [`favorability-rulesets/`](favorability-rulesets/).

**Effect:** doesn't touch your board. Once picked from the **Favorability** dropdown, it actually changes how the app scores every clause it covers — the Risk Gauge, board card lean colors/tags, the option-editor preview, and every output (Term Sheet, Elections Summary, Fallback Matrix) that reads a card's lean. This is the one import kind that can change a number, not just add a label.

### Finding the exact keys

None of the four formats above ask you to memorize category/clause/option key names. The fastest way to find them: configure the board to the position you're interested in, click **Export JSON**, and read the key names straight out of the downloaded file's `config` object. Every one of the four import formats reuses those same keys.

## How the scoring engine's own judgment calls were made

The dealer/buy-side/neutral tag baked into this tool is one editorial view, not a fact — that's the entire premise behind favorability rulesets (above). [`ENGINE-DESIGN.md`](ENGINE-DESIGN.md) walks through, clause cluster by clause cluster, the reasoning behind the built-in classification and the scoring formula itself, so you can see exactly where you might disagree — and then encode that disagreement as a ruleset instead of just complaining about it.

## Disclaimer

Partially-parodical, arguably educational. Not legal advice, not a substitute for counsel. Clause overviews are indicative and may be inspired by publicly available executed ISDAs.

## License

MIT — see [LICENSE](LICENSE).
