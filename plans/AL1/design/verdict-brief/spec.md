# Variant A — The Verdict Brief

**User workpackage:** A reviewer opens a completed task's review and, in the *fast read*, decides approve-or-block responsibly — seeing what's missing and what's risky *before* any diff — and can drop into evidence inline only when they want it.

**Constraint:** smallest surface; near-zero new shapes; reuse the renderer + thread + verdict budget. **Thesis:** the review is a **briefing that reads top-down and ends in a decision**. Examine is *nested inside* converse — one scrollable narrative, evidence expands in place, the verdict bar is always pinned.

**Signature (the one tell):** the **"Needs you" panel** sitting at the very top, above any artifact. If it's empty you approve in 5 seconds; if not, it's the agenda. The diff lives *collapsed, below*. No other review tool puts "what needs the human" above the diff.

---

## Information hierarchy (top → bottom, one ~820px reading column on `--surface-page`)

1. **Orientation band.** Breadcrumb (Bet *Billing reliability* › Task). Work identity as page title (`--text-2xl`/700). Meta strip (`--text-sm`/secondary): author **Atlas** (agent avatar — AQ-012 green-distinct) → reviewer **Robin** (human avatar) · standing pill `Awaiting your verdict · Blocking` (`StatusChip` blue+amber) · `ArtifactCostChip` ($2.14 · 312k) · `14 min ago`. One quiet line below: autonomy context — `Why you're here: L2 · money-mutating action`.
2. **Result headline.** One sentence (`--text-base`, primary) — the outcome in plain language. Reads like the TL;DR of a brief.
3. **"Needs you" panel** — the signature. A card tinted `--accent-secondary-dim` (amber) with a `--bw-default` amber left edge is too banner-y → instead a flat `--surface-elevated` card, `--r-default`, `--shadow-default`, header `3 things need you before you can approve` (`--text-sm`/600). Three `Row`s, each = a `RowDot` (gap=blue, risk=amber, comment=earth) + label (primary) + detail (secondary, one line) + a trailing `Jump ↓` ghost affordance. Clicking scrolls to + expands the matching evidence below. **Empty state (must also be specified):** when the set is empty, this becomes a calm `--accent-primary-dim` card: green check + `Nothing needs you. 4 artifacts, intent fully met.` — the explicit "approve responsibly without drilling" affordance.
4. **Ask ↔ Result.** Section header `The ask` (AQ-013 quiet caps). Intent statement (secondary, italic). Then the 4 intent items as a checklist: addressed = `--status-success` check + text; the gap = `--status-error`/`--status-info` ✗ + text + a `Tag` `NOT ADDRESSED`, on a faint tinted row. Footer: `3 of 4 met` with a `Progress` bar. Each addressed item carries a small `→ refund-webhook.ts:9` anchor link that expands that artifact below.
5. **The Subject (evidence — collapsed).** Section header `What Atlas produced · 4 artifacts`. Four collapsed `Row`s: `ArtifactKindBadge` + path (mono) + result summary (secondary) + reviewed-state check (`reviewed`=green check, else hollow). Click a row → expands the **real renderer** inline (`getRenderer(kind)` → `CodeRenderer` for the diff, `DataRenderer` for tests, `TextRenderer` for the note, a bespoke action card for the deploy: summary + `Consequence:` + `Undo:` lines). This is examine, nested.
6. **Rationale (collapsed).** Header `Why — 5 decisions, least-confident first`. Expand → decision cards sorted confidence ascending. Card: decision (primary) · `instead of:` discarded alt (secondary) · a confidence meter (small `Progress`, color by band: <60 amber, ≥80 green) · anchor chip + the intent item it serves. Decision #2 (45%) sits first with a faint amber tint + `RISK` tag.
7. **Conversation (inline).** Header `Discussion`. The one thread: `CommentRow`s with `inlineAnchor` labels (`refund-webhook.ts:54`), replies indented, resolved ones dimmed with a `RESOLVED` tag. End with a `Composer`.

**Pinned verdict bar (sticky bottom, `--z-sticky`, `--surface-elevated`, `--shadow-elevated` top edge):** the 5 verdict buttons — `Approve` (primary pill), `Approve w/ comments`, `Request changes`, `Edit` (ghost pills), `Reject` (destructive ghost) — each with a kbd hint (`A` `C` `R` `E` `X`). Left of the buttons: `Blocking · 3 unresolved` so approving over open items is a conscious act. Always reachable without scrolling.

## States
- **Populated / awaiting (default)** — as above.
- **Empty needs-you** — panel #3 flips to the calm green variant; diff still collapsed.
- **Resolved** — verdict bar collapses to `Approved with comments · Robin · 2:38 PM` + `Re-expand`; needs-you panel becomes a read-only summary.
- **Loading** — `SkeletonList` for the column + a skeleton verdict bar.
- **Error** — `ErrorState` card in place of the column body; verdict bar disabled.

## Behavior / motion / keyboard
- Section + artifact expand/collapse: height/opacity at `--motion-default`, content fades (`transform`/`opacity` only, AQ-014).
- Needs-you `Jump ↓` → smooth-scroll + auto-expand the target.
- Keyboard: `A/C/R/E/X` fire verdicts; `j/k` move between needs-you items; `Esc` collapses the open artifact.

## Mobile (three-tab layout)
Single column already maps down. Verdict bar → a bottom sheet (DS `Dialog` mobile sheet pattern). Needs-you panel stays pinned at top of the scroll. Renderers go horizontal-scroll inside their card.

## Trade-offs (what this is bad at)
- Cross-referencing many artifacts at once — you scroll a document, you don't pivot between panes.
- A 12-artifact Subject makes the collapsed list long; fine for the task grain (1–5), weaker at large bets.
- No persistent side-by-side examine; deep code review is sequential.

---

## Agent build contract
- Files: `packages/web/src/pages/review/ReviewBrief.tsx` (the component, default props from fixture) + `packages/web/src/pages/review/ReviewBrief.stories.tsx` (default export `{ title: "Page: Review/A — Verdict Brief" }`; named exports `Populated`, `NothingNeedsYou`, `Resolved`).
- Import data from `./review-fixtures` (`REVIEW_FIXTURE`, `NEEDS_ATTENTION`, `REVIEW_PROGRESS`). Render through real DS renderers via `getRenderer(artifact.kind === 'code' ? 'code' : …)` passing the matching `*Preview`. Use `ArtifactCostChip`, `StatusChip`, `Tag`, `Avatar`, `Breadcrumb`, `Button`, `Progress`, `Row`, `RowDot`, `CommentRow`, `Composer`, `EmptyState`, `ErrorState`, `Skeleton`/`SkeletonList`, `Checkbox`, `KeyValue` where they fit.
- Self-contained presentational story: local `useState` for expand/collapse + which sections are open; callbacks are no-ops. NO router/context needed → no `MockProviders` required (but wrap in a `<div style={{height:'100vh'}}>` so the sticky bar anchors). `Populated` story must show the diff artifact **expanded** so the screenshot proves the nested-examine signature, plus the needs-you panel and verdict bar visible.
- Hard rules: Hearth tokens only (no hex/raw-tailwind-color), 6px grid spacing, closed radius/type/motion scales, pill buttons, agent avatar distinct (AQ-012), left-aligned content (no `text-center`/`mx-auto` on body), realistic fixture content. NO tests/check/lint/bless — story-render only.
