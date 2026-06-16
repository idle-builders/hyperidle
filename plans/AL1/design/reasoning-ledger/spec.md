# Variant C — The Reasoning Ledger

**User workpackage:** A reviewer of agent work who trusts the diff least and the *reasoning* most — reads the agent's structured decisions against the spec, **sorted by confidence (riskiest first)**, spot-checks the code under any decision in one click, and decides.

**Constraint:** lead with the one thing no shipped tool has — structured **Rationale × Intent** as the spine; demote the diff to drill-down. **Reference borrowed:** Linear's calm issue view + Graphite's inbox header + the research's *intent-contract* ("the prompt is the unit of review, not the diff"). **Thesis:** for agent work **the *why* is the unit of review.** Read reasoning against intent; the diff is evidence one click under each decision.

**Signature (the one tell):** the **confidence-sorted Decision Ledger** — each row is one agent decision with a confidence meter, the alternative it discarded, the intent item it serves (or the gap it leaves), and its diff one click below; default sort puts the 45%-confidence partial-refund decision and the unaddressed-event decision at the top. "Show me where the agent was unsure" is the *default view*, not a filter you hunt for.

---

## Information hierarchy (two columns; calm, Linear-density)

**Sticky top bar (`--surface-elevated`, `--shadow-subtle`):** Orientation + verdict, Graphite-inbox calm.
- Left: work identity (`--text-lg`/600), below it author **Atlas** (agent-distinct avatar) `→` reviewer **Robin**, `·` standing pill `Awaiting verdict · Blocking`, `·` autonomy `L2 · money-mutating`, `·` `ArtifactCostChip`.
- Right (sticky): the 5 verdict buttons (`Approve` primary pill + ghost pills + `Reject` destructive), kbd hints, `Blocking · 3 unresolved`.

**Center spine — the Decision Ledger (flex-1, `--surface-page`):**
- Ledger header: `Reasoning · 5 decisions` + a segmented control `Confidence ▲ (default) · Order · Risk only` + `3 of 4 intent items met`.
- Each **ledger row** (`--surface-elevated` card, `--r-default`, `--shadow-subtle`, hover-lift per AQ-010):
  1. **Confidence meter** (left, ~64px): a vertical/horizontal `Progress` + `45%` label; color band <60 amber, <50 red-tinted, ≥80 green. The riskiest rows read hot at a glance.
  2. **Decision** (primary, `--text-base`). Below it `instead of: <discarded alternative>` (secondary).
  3. **Trace chips** (row): `serves: Idempotent retries ✓` (green `Tag`) — or for the gap decision `leaves UNADDRESSED: RefundProcessed event ✗` (red `Tag`); plus an anchor chip `refund-webhook.ts:54`.
  4. **Risk flag**: decision #2 carries an amber `RISK` `Tag` and a faint `--accent-secondary-dim` wash.
  5. **Expand → evidence inline**: clicking the anchor chip (or the row) expands the **real renderer** scrolled to that spot — `CodeRenderer` for code decisions, `TextRenderer` for the compensating-entry note (#3). Under the evidence: any anchored `CommentRow` on that spot + replies + resolve + an inline `Composer`. Evidence is drill-down — collapsed by default; **one decision is expanded in the default screenshot** to prove it.
- Default sort surfaces #2 (45%) then #5 (60%, the gap) then #1 (70%) … so the reviewer's eye lands on uncertainty.

**Right rail (~300px, `--surface-container`):**
1. **Intent panel** — the ask statement (secondary) + the 4 intent items as a checklist (3✓ green / 1✗ red `NOT ADDRESSED`), `Progress` `3 of 4 met`. Clicking an item **filters the ledger** to the decisions serving it.
2. **Needs attention · 3** — the derived set (gap/risk/blocking-comment), each a jump to its ledger row.
3. **Subject · 4 artifacts** — compact `Row` list (`ArtifactKindBadge` + path + reviewed state) so the raw artifacts stay directly reachable even though the ledger is decision-first. A code/data/action artifact opens its renderer in place.

## States
- **Populated / awaiting (default)** — ledger confidence-sorted, #2 expanded showing the diff + Robin's comment.
- **No rationale (human-authored work)** — the ledger is replaced by an `EmptyState` `No rationale — this work was human-authored. Review the artifacts directly.` and the right-rail `Subject` list is promoted to the spine. (Concept: Rationale may be empty.)
- **Risk only** — ledger filtered to `risk` decisions (just #2).
- **Resolved** — top-bar verdict shows `Changes requested · Robin · 2:41 PM`; ledger read-only.
- **Loading** — `SkeletonList` ledger + skeleton rail. **Error** — `ErrorState` in the spine.

## Behavior / motion / keyboard
- Sort/filter change: rows reorder (keep it simple — fade-reorder at `--motion-default`; no layout-property animation, AQ-014 — animate opacity, let order change instantly).
- Row expand: evidence height/opacity at `--motion-default`.
- Keyboard: `1` confidence sort · `2` order · `3` risk-only · `j/k` move rows · `Enter` expand evidence · `A/C/R/E/X` verdicts.

## Mobile (three-tab layout)
Ledger stacks full-width (`Examine`/decisions tab). Intent + needs-attention become the `Subject` tab. Verdict → bottom sheet.

## Trade-offs (what this is bad at)
- Degrades when the agent gave **no** rationale — must fall back to an artifact list (handled, but it's then a worse Bench).
- Novel grammar — a reviewer expecting a diff-first PR must learn the ledger (mitigated: every decision is one click from its diff).
- Leads with the agent's *self-reported* confidence; a reviewer who distrusts that must still drill to code — the ledger orders attention, it doesn't replace verification.

---

## Agent build contract
- Files: `packages/web/src/pages/review/ReviewLedger.tsx` + `ReviewLedger.stories.tsx` (default `{ title: "Page: Review/C — Reasoning Ledger" }`; named exports `Populated`, `RiskOnly`, `NoRationale`).
- Import `./review-fixtures`. Sort `REVIEW_FIXTURE.rationale` by `confidence` ascending for the default view. Render evidence through real renderers via `getRenderer`. Map a decision's `intentItemId` to the intent item for the trace chip; a decision whose `intentItemId` points at an unaddressed item (or `r5`) shows the red `leaves UNADDRESSED` chip. Use `Avatar`, `StatusChip`, `Tag`, `Button`, `Progress`, `ArtifactCostChip`, `ArtifactKindBadge`, `Row`, `RowDot`, `CommentRow`, `Composer`, `EmptyState`, `ErrorState`, `SkeletonList`, `TabBar`/segmented control.
- Self-contained presentational: `useState` for sort mode, expanded decision, intent filter. No router/context → no `MockProviders`; wrap in `<div style={{height:'100vh', display:'flex', flexDirection:'column'}}>`. `Populated` must screenshot with the confidence-sorted ledger (45% row first, hot meter), one row expanded showing the diff + Robin's comment, the intent panel, and the verdict bar — proving the signature.
- Hard rules: Hearth tokens only, 6px grid, closed scales, pill buttons, agent-avatar distinct, realistic content, no centered body, hover-lift on cards. NO tests/check/lint/bless — story-render only.
