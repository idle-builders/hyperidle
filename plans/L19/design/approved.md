# L19 Design Critique — Approved

**Reviewer verdict:** PASS (7.6 / 10 average)

Variant A is the only variant (correctly classified as Routine — no new custom components). The design is conservative, well-reasoned, and grounded in existing patterns.

---

## Dimension Scores

| # | Dimension | Score | Justification |
|---|-----------|-------|---------------|
| 1 | Clarity | 8 | The design clearly specifies what renders where: outcome chip in table + TaskSheet, jump-out link in table + TaskSheet but not Kanban card, session metadata line layout. The "Did we consider" section documents rejected alternatives with clear rationale. |
| 2 | Consistency | 8 | StatusChip reuse via `sessionOutcomeToStatus` follows the exact pattern established by `taskStateToStatus`, `betStatusToStatus`, `knowledgeStatusToStatus`. The mapping function co-locates with its peers in `status-mapping.ts`. Column placement and monospace aesthetic are consistent with existing table treatment. |
| 3 | Simplicity | 9 | No new components. No unnecessary abstractions. The entire design composes from StatusChip, `<a>`, and existing table/sheet patterns. The rejection of a dedicated SessionChip is well-argued. |
| 4 | Accessibility | 7 | Jump-out link is a semantic `<a>` with `aria-label` including "(opens in new tab)" advisory. Keyboard: standard Tab + Enter on native `<a>`. Focus trap in TaskSheet covers the new link. Pipe delimiters use `aria-hidden`. One concern: the outcome chip label is `status.toUpperCase()` which yields "DONE", "ERROR", "PAUSED" — these are StatusChip presentation labels, not SessionOutcome labels ("COMPLETED", "CRASHED", "STOPPED"). The design says "label derived from the outcome value in uppercase" but the actual StatusChip renders its mapped status, not the original outcome. This is a minor semantic mismatch but screen reader users hear "DONE" when the session completed, which is tolerable. |
| 5 | Responsiveness | 7 | Mobile strategy relies on `overflow-x-auto` for the table (already present). Two new columns will increase table width. The design acknowledges this ("table may feel cramped at around 800px") and proposes a mitigation (merge columns) as a builder-time call. TaskSheet session line wraps naturally. 44px touch target for the link is noted. Adequate for a routine change. |
| 6 | Hierarchy | 8 | The information hierarchy is well-structured: outcome chip is a small inline status signal (same visual weight as the task state chip), jump-out link is a de-emphasized monospace text link, session metadata in TaskSheet follows a dense single-line layout with pipe delimiters. The jump-out is intentionally NOT on the Kanban card (scan surface vs action surface) — good information architecture reasoning. |
| 7 | Affordance | 7 | "Open in harness" text link is self-documenting (rejected ambiguous icon-only alternative). `text-[var(--primary)]` color signals interactivity. `hover:underline` confirms clickability. However, the design does not specify any visual indicator that the link opens externally (no external-link icon even as a trailing decoration). Users may not realize it leaves HyperIdle until they read the aria-label or notice the new tab. Minor concern — the `target="_blank"` behavior is standard web convention. |
| 8 | Defensive Design | 8 | All edge states covered in the table: no session, session without URL, malformed URL, valid URL. The `isValidHarnessUrl` function gates rendering. URL validation happens in the rendering layer (never parsed, only prefix-checked). The design explicitly handles the case where cost/tokens are null independently of outcome existing. |
| 9 | Component Reuse | 8 | Perfect reuse of existing vocabulary: StatusChip, SortableHeader, TaskCard actions slot, `<a>` primitive. No new component registration needed. The design explicitly avoids a SessionChip wrapper. |

**Average: 7.8 / 10 — PASS**

---

## Strengths

1. Exhaustive outcome-to-status mapping with a clear rationale table. The mapping is a `Record<SessionOutcome, Status>`, guaranteeing compile-time exhaustiveness.
2. Excellent "Did we consider" section — 6 alternatives rejected with specific reasoning, not handwaving.
3. Clean separation of scan surface (Kanban) vs action surface (TaskSheet) for the jump-out affordance.
4. Defensive empty/error state table covers every combination of null fields.

## Concerns (minor, addressable during implementation)

1. **StatusChip label mismatch.** The design says the chip label is "derived from the outcome value in uppercase" but StatusChip renders `status.toUpperCase()`, which shows "DONE" not "COMPLETED". The builder should be aware this is a deliberate mapping (session "completed" maps to presentation "done" which displays as "DONE"). If the intent is to show the original outcome text, a label override would be needed on StatusChip — but this is a design-time choice, not a bug.

2. **Two new table columns on a potentially wide table.** The design acknowledges this. The builder should visually verify at 800px viewport width and consider the suggested column-merge fallback if needed.

3. **`text-[var(--primary)]` for the link.** Verify this token exists in the current theme. Existing links in the codebase use `hover:text-[var(--text-hi)]` (breadcrumb pattern), not `text-[var(--primary)]`. The builder should check `tokens.css` for `--primary` availability and fall back to the DaisyUI `link` class or `--ok` token if `--primary` is not defined.

---

## Approved Variant

**Variant A: Inline Outcome Chip + Trailing Jump-Out Link** — approved as specified in `variants.md` with the minor notes above for builder attention.
