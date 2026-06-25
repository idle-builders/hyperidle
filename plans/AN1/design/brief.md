DESIGN-CLASS: routine  ref=SettingsConnections(#353 VariantAInheritedDefault)  pattern=SettingsConnections

# AN1 — Connections settings surface · design brief

## Classification (Phase 0a)
- **Existing component reference:** YES — recovering the founder-approved `SettingsConnections` from #353 (`16c3fe62`), a settings panel that already shipped through `/design` + human-design-review.
- **Pattern match:** YES — the grouped `SectionLabel + ItemList + Row` settings-panel pattern is live across `SettingsHarnesses`, `SettingsAgents`, `SettingsModels`.
- Both axes yes → **routine**. Single variant + a rejected-directions list. Human-design-review = **No** (a subtraction + an in-family addition does not re-open the approved shape; per concept Phase-0 forecast + TRACK-AN gate).

## What changed vs the #353 approved design (the adaptation)
The concept lock forces three subtractions and one addition. None alters the approved *shape* (inherited group first, grouped-by-source, per-row health chip, header add-button):

1. **authSource renamed to the locked closed set `{ token, mcp, inherited }`** (was `{ harness, token, mcp-oauth }`). `harness → inherited`, `mcp-oauth → mcp`.
2. **health collapsed to the locked closed set `{ working, needs-attention }`** (was `{ usable, needs-attention, expired }`). `usable → working`; `expired` folds into `needs-attention` (a token that stopped working "needs attention" — the concept's single not-working state).
3. **Trust tier removed entirely** — no `vetted`/`community` dot, no `TrustTag`, no `trustTier` field. (ETHOS §2 / concept rejection-list #1.)
4. **"agents never see the secret" framing removed.** Concept hard-rule #2: the secret IS resolved into the agent's sandbox so its tools can authenticate — the rule is only that it is never *displayed back* in this UI or *logged*. Copy rewritten: header → "A secret you paste is stored encrypted and never shown back — your agents' tools use it to authenticate"; token note → "Stored encrypted · resolved server-side".
5. **Inherited group is LIVE in AN1** (founder decision, concept scope-note) — rendered populated (GitHub/Git/Linear), not an empty seam. Architecture wires it from the AM2 harness descriptor.

Also dropped the `toolCount` cell (it was `null` until AN2 anyway and added a column for no AN1 signal); the row is title + via/note + health chip + overflow.

## Reuse inventory (Phase 0b — hard gate)
| Visual element | Component | New? |
|---|---|---|
| Page header + subtitle | plain `<h2>`/`<p>` (matches every Settings panel) | reuse |
| "+ Add connection" button | `Button variant="secondary" size="sm"` | reuse |
| Group heading + "Auto-detected" caption | `SectionLabel` (`trailing` slot) + `<p>` help | reuse |
| Grouped list container | `ItemList variant="contained"` | reuse |
| Connection row (lead mark, title, subtitle, actions) | `Row` (`lead`/`title`/`subtitle`/`actions`) | reuse |
| Service initial mark | inline `ServiceMark` span (2-letter) | reuse (inline single-use, NOT promoted — already the #353 decision) |
| Health chip | `StatusChip` (`healthy` for working, `behind` for needs-attention) | reuse |
| Row overflow menu | `Button` (ghost) + `Menu` | reuse |
| Add dialog | `Dialog` + `Select` + `Input` | reuse |
| Loading (build phase) | `SkeletonList` | reuse |
- **NEW shapes: zero.** Everything composes from the catalogued budget. The story renders only the populated state (per design scope); loading/error live in the production scaffold for the builder.

## Rejected directions (considered, not generated)
- **One flat list with a per-row "Source" tag** instead of three groups — rejected: the inherited-vs-held distinction (HyperIdle stores nothing vs holds a secret) is the load-bearing concept split; flattening it hides exactly the thing the user needs to reason about. The founder approved grouping in #353.
- **A per-service "Connect with GitHub" branded-logo catalog** (Zapier/OAuth-app style) — rejected: HyperIdle registers no per-service OAuth app and is never an OAuth provider (concept hard-rule #2/rejection #3). A branded "Connect with X" affordance implies exactly that flow. Neutral 2-letter mark instead.
- **Group-level rollup "needs attention" chip on the section header** — rejected in #353 (founder, 2026-06-23): the per-row `StatusChip` is the single source of the signal; a group chip duplicates it.
- **Inline add-affordance per group header** — rejected: a single header "+ Add connection" with a source `Select` in the dialog is one entry point, not three; the inherited group has no add (it is reflected, not created).
