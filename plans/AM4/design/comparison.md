# AM4 — Variant comparison

Screenshots: `a-dense-list/screenshot.png`, `b-checklist/screenshot.png`, `c-cards/screenshot.png` (Hearth light, 900px viewport, real same-machine descriptor states).

| Dimension | A — Dense list | B — Checklist | C — Provider cards |
|---|---|---|---|
| Signature (one tell) | Whole fleet in one card, one viewport | The page has a goal state ("2 need sign-in") | Each backend a self-contained card with a dedicated auth zone |
| Component count | Lowest (1 card, repeated row) | Medium (2 row treatments + partition) | Medium (card + auth zone + Fold) |
| Density | Highest | Mixed (dense Ready, roomy Needs-you) | Lowest |
| Primary action surface | Inline button under a 152px gutter | Right-aligned CTA on the floated Needs-you rows | Distinct tinted auth-zone inset inside the card |
| State strategy | One row layout for all states | Distinct layout per readiness group | One card chrome; zones appear/disappear |
| Motion budget | None (build adds row hover) | None | Fold expand (`--motion-default`) |
| Best at | Steady-state scan / inspect all | First-run "get to working" path | Per-backend ownership + capability drill-down |
| Worst at | First-run next-step discoverability | Steady-state inspect (no caps fold) | Density / vertical economy |
| Descriptor-driven (zero per-backend branch) | Yes (shared mappers) | Yes (partition by state) | Yes (zones by state/authAction) |
| Phase-2 critique score | 7.1/10 | 7.4/10 | 8.0/10 |

## Phase-2 critique (9 dimensions, 0-10)

### A — Dense list
- Hierarchy 7 · Spacing 6 (152px action gutter buries the CTA; secondary lines feel orphaned) · Typography 8 · Color 8 (StatusChip carries status well) · Coherence 8 (SettingsModels lineage) · States 7 · A11y 8 · Anti-slop 7 (no AI tells; but the repeated "Capabilities confirmed after first run" reads as filler) · Premium 6 (functional, not distinctive). **7.1**
- Strength: zero-chrome density. Weakness: the actionable next step — the WHOLE point of the AC — is the least prominent thing on the row.

### B — Checklist
- Hierarchy 8 (the gap is the headline) · Spacing 7 · Typography 8 · Color 8 · Coherence 7 (two row treatments) · States 8 (partition naturally handles all-ready) · A11y 8 · Anti-slop 8 · Premium 7. **7.4**
- Strength: nails the first-run AC ("actionable next step, not silent failure") by construction — unfinished backends float up with their action. Weakness: degrades as a durable settings surface; no capability inspection; "Configure" is a dead-end here.

### C — Provider cards
- Hierarchy 8 (status header → auth zone → fold is a clean read) · Spacing 8 · Typography 8 · Color 8 · Coherence 9 (uniform card chrome IS the descriptor-driven contract made visible — same shape, different zones) · States 8 (zones map 1:1 to readiness; fold = progressive disclosure) · A11y 8 · Anti-slop 8 (matches the named t3code reference cleanly; no card-grid, single column, left-aligned) · Premium 8 (the tinted auth inset is the distinctive, purposeful detail). **8.0**
- Strength: the auth zone makes the next step unmissable on exactly the backends that need it, while ready backends stay quiet — and it serves BOTH first-run and steady-state (caps fold). Weakness: density; tall on short viewports.
