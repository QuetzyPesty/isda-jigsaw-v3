# ISDA Jigsaw v3

A visual planner for ISDA Master Agreement / CSA negotiations. Configure clauses on a board, see a live dealer/buy-side risk score, generate a full-form Schedule (Markdown or Word with real tracked changes), practice negotiating against researched market scenarios, and run a "what breaks?" stress test against your current position.

Static site, no build step, no server-side code. Everything runs in the browser and saves to `localStorage`.

## Run it

Any static file server works. For example:

```bash
npx http-server -p 8083 -c-1 .
```

Then open `http://localhost:8083`.

## Files

- `index.html` — page structure and every modal
- `app.js` — all app logic (clause data model, scoring, rendering, negotiation/stress-test engines)
- `docx-writer.js` — dependency-free .docx generator (used for the Schedule/redline export)
- `style.css` — styling

## Extending it

Two of this app's features are built around user-supplied JSON files:

- **Import Guardrails** — a tiered preferred/fallback negotiating position that live-flags the board as you edit
- **Import Favorability Ruleset** — overrides this tool's own dealer/buy-side/neutral view per clause, changing how it actually scores

See [isda-favorability-rulesets](https://github.com/QuetzyPesty/isda-favorability-rulesets) for the favorability ruleset format, a ready-to-edit template, and an example.

## Disclaimer

Partially-parodical, arguably educational. Not legal advice, not a substitute for counsel. Clause overviews are indicative and may be inspired by publicly available executed ISDAs.
