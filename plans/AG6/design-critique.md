# Design Critique: AG6 — shared `Row` + `ItemList` primitive

DESIGN-CRITIQUE: variant=b-self-contained score=8/10  rounds=1  axes: H:9 S:9 T:9 C:8 Co:9 St:8 A:9 AS:9 PP:8

Scored from the three rendered variant screenshots + specs, against the AG6 spec (TRACK-AG.md §AG6) and the AQ hard rules. The chosen base (Variant B + `RowDot`) is the right call and the synthesis reasoning is sound — Variant A's mockup literally re-creates the 13px/15px divergence AG6 exists to kill (visible in its screenshot: "15PX TITLE — DIVERGED"), and C overspends the component budget for the same hierarchy B gets from props. Findings below are polish, not structural.

## Does the chosen primitive actually kill divergence?
Yes, by construction — the dimension that matters most for this workpackage. B fixes title at 13px/500, cells at 11px mono tertiary, owns separator/hover/focus/44px and the wrapper-element decision. A consumer cannot pick its own title size (the proven failure mode). The `RowCell[]` config maps onto AC-4 ("thin column config, not a hand-rolled row") almost word-for-word. Coherence and consistency-enforcement are the real wins and they are genuine.

## Column-config model — sound
`RowCell { content, width?, align?, numeric?, tone?, hideBelow? }` is dumb-by-design: cells render mono-tertiary regardless of content. The one re-divergence risk (consumers stuffing complex nodes into `content`) is acknowledged in architecture Risk 1 and bounded by fixed styling. Acceptable. tabular-nums gated on `numeric` (AQ-006). Good.

## Keep-distinct justifications — defensible
ThreadRow (overlapping-avatar group + presence dots + host pill + blocking badge), CommentRow (vertical sender-header + body message bubble, not a scannable row), BetCard (elevated decision card, not a flat row) are each justified on anatomy that genuinely doesn't map to lead/title/cells without an escape hatch that would bloat the primitive. This is the correct restraint — not every row should collapse. Confirmed against the real components.

## Empty/loading/error coherence
`ItemList` owns all four states (error → loading → empty → children precedence). EmptyState/SkeletonList/ErrorState are reused, not reimplemented (verified they exist in the DS). This is exactly what AC-5 asks for. The screenshot shows a clean in-list empty companion ("No routines / This team has no recurring work configured").

## Nested-button a11y — preserved correctly
The HARD constraint is handled: `onClick` + `actions` → `div role=button` + tabIndex + onKeyDown (never a real nested `<button>`). Auto-heuristic + `as` escape hatch. This matches the existing `clickableProps` helper behavior in the codebase exactly (verified `packages/design-system/src/clickable.ts`). Lore citations (AB2 S4/W4, AF8 W1) are accurate.

## Touch target + Hearth compliance
44px owned by the primitive, consumer cannot forget — verified the existing WorkTeam rows already force `min-h-[44px]` so this is parity, not regression. All radii/spacing/type on-scale. `--bw-strong` (2.5px) and `--shadow-subtle` confirmed real tokens for the selected-row treatment.

### CRITICAL
- None.

### WARNING
- [approved.md:30,87] Hover is specified as `bg-[rgba(44,36,26,0.02)]` — a hardcoded rgba. In production TSX this fails **AQ-008** (no hardcoded colors / no `rgb()`) and **AQ-018** (warm-tint must trace to a token). It also diverges from the established row hover used by KnowledgeRow/NotificationRow/`clickableProps`: `bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]`. The raw rgba is fine *in the self-contained mockup HTML* (mockups inline values by design) but must not carry into the TSX. → Builder uses the existing `color-mix` hover token, not the rgba. The architecture plan should restate the hover as the token form so the builder doesn't transcribe the rgba literally. Same-role-same-treatment: the new primitive's hover must equal its sibling rows' hover.

### SUGGESTION
- [approved.md §1] Title is `font-[500]` 13px; existing KnowledgeRow title is 15px. Since KnowledgeListRow collapses onto `Row`, the knowledge list title will visually shrink 15→13px. Intentional (uniformity is the point) and acceptable, but call it out in the migration so the visual-parity reviewer in Phase 4 doesn't flag it as a regression against the old KnowledgeRow.
- [approved.md §3] `ItemList.rows` declarative array is correctly deferred as YAGNI (children-only floor). Good restraint — keep it deferred unless a pure-config consumer actually appears.
- [approved.md §5] `RowDot` is a new 6px status dot. A `LiveDot` (6px pulsing accent dot) already exists in the DS. They are semantically distinct (LiveDot = animated live-activity pulse, RowDot = static tone-keyed status) so a separate component is justified, but the builder should not duplicate LiveDot's markup — and Phase 4 should confirm RowDot isn't reinventing it.

### What's Working Well
- The variant comparison is honest and the weighting (Coherence + consistency-enforcement) correctly reflects that AG6 *is* about killing divergence — Variant A's self-sabotaging mockup is the clearest possible argument for B.
- `lead?` omitted → renders nothing, no placeholder (AQ-113) is baked in, visible in the knowledge screenshot (no leading-dot gutter). Anti-slop discipline: dense, no icon-on-everything, no airy padding.

---

## Re-critique (round 2) — confirmation pass

DESIGN-CRITIQUE: variant=b-self-contained score=9/10  rounds=2  axes: H:9 S:9 T:9 C:9 Co:9 St:9 A:9 AS:9 PP:9

**Verdict: APPROVED.**

The one WARNING is resolved. `approved.md:30,88` now state the hover as the token form `bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]` via `clickableProps`/`clickable.ts`, and the `rgba(44,36,26,0.02)` literal is explicitly flagged as mockup-only and forbidden in TSX (AQ-008/AQ-018). The raw rgba survives only in the mockup HTML and rejected-variant spec files — correct, mockups inline values by design. Same-role-same-treatment with sibling rows is now contractually pinned.

SUGGESTIONs folded:
- 15→13px knowledge-title shrink: the migration note (§9.3) + the carryover here mean the Phase-4 visual reviewer won't false-flag it as a regression. Acceptable, intentional uniformity.
- `RowDot` vs `LiveDot`: `approved.md:74` now mandates authoring `RowDot` fresh and explicitly forbids copying `LiveDot` markup / pulse animation. Phase-4 still confirms.

+1 (8→9): the divergence-vector ambiguity that kept the hover and consistency axes off a clean 9 is now closed. No structural or polish blockers remain. No new findings.
