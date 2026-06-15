# Design Critique: AD9 — Uniform Section Navigation & Work Overview as Team List

DESIGN-CRITIQUE: variant=A-switch-and-overview+B-attention-sort score=8/10  rounds=1  axes: H:8 S:9 T:9 C:9 Co:9 St:8 A:9 AS:9 PP:7

**Critique mode:** spec-level. The variant TSX sketch was deliberately removed from the catalog (`approved.md` §"Cleanup note" — it must not ship a stray snapshot story). No rendered TSX exists yet; the real deliverable is `WorkOverview.tsx` + its `.stories.tsx`, built in Phase 4. So this scores the **locked visual contract** in `approved.md` against the rubric, with every composition claim verified against the actual primitives in `packages/design-system/src/`. Painted-pixel scoring (premium polish ceiling) re-runs in Phase 4 against the rendered story.

## Verification performed (composition claims → real primitives)

- `Row` (`Row.tsx`): supports `title`, `subtitle`, `cells[]`, `onClick`, `as="li"` — matches the design's row composition exactly.
- `RowCell` (`Row.tsx:44-59`): `align?: "start"|"end"`, `numeric?: boolean`, `tone?: RowTone`, `hideBelow?: number` — design uses all four correctly; `numeric` already emits `tabular-nums` (AQ-006 satisfied for the count cells).
- `RowTone` (`RowDot.tsx:12`): `"success"|"warning"|"error"|"info"|"neutral"` — design's `tone: agentHealthWarning ? "warning" : "info"` is valid.
- `ItemList` (`ItemList.tsx`): `variant="flush"`, `as="ul"` — exact match.
- `StatusChip` (`StatusChip.tsx:4`): `Status = healthy|behind|blocked|paused|done|error` ⊇ `TeamStatus` (healthy/behind/blocked) — 1:1 mapping confirmed; chip carries both color token AND label text (status is not color-only → A11y).
- `TeamListItem` (`packages/shared/src/team.ts:100-113`): carries `status` (via `TeamSummary`), `phase`, `activeBets`, `progress{done,total}`, `agentCount`, `activeAgentCount`, `agentHealthWarning`, `routineCount`. Every signal the row reads is present and server-derived. No new field, no new endpoint — claim verified.

**New shapes: zero — confirmed.** Every slot maps to an existing primitive.

## Scores (9-dim)

1. **Visual Hierarchy — 8.** Team name primary (flex-1 truncate), status chip a clean right-anchored scan column, counts trailing. One focal point. Loses a point only because a flat list's "which team needs me" answer is a column read, not a pre-attentive grab (the deliberate trade for uniformity — see Premium Polish). Attention-sort (from B) compensates by putting the urgent team in row 1.
2. **Spacing & Density — 9.** Pure `Row`/`ItemList` grid, on-grid by construction; header `px-[24px] py-[18px]` matches the existing overview frame. No arbitrary padding.
3. **Typography — 9.** DS tokens only (20/600 title, 13 subtitle, tabular-nums counts). No raw families/weights beyond 400/600.
4. **Color Usage — 9.** `StatusChip` semantic tokens; warning tone on `agentHealthWarning` carries meaning; no hardcoded hex. Every colored signal has a non-color partner (chip label, numeric text).
5. **Component Coherence — 9.** Literal sibling of the Conversations/Knowledge overviews — same frame, same primitives, one nav rule. Zero inline reimplementation.
6. **States & Feedback — 8.** All five+ states defined (loading→SkeletonList, error→ErrorState+retry, empty→EmptyState→/setup, populated, 1-team-skip, overflow→truncate). Hover/selected inherited from `Row`/`ItemList`. Minus one: see WARNING on empty-state reachability copy.
7. **Accessibility — 9.** `Row` a11y inherited (button/role semantics from `as`); status not color-only; count cells legible. Keyboard nav inherited.
8. **Anti-Slop — 9.** No dashboard, no metrics bar, no card grid, no filter pills. Dense purposeful list. Filters/verdict/team pills explicitly retired (concept rejection list honored).
9. **Premium Polish — 7.** Correct and quiet. The flat list is right for the 1-3 team common case but doesn't *help* the eye find urgency beyond the column + sort. This is the deliberate, defensible trade (C's sectioning was correctly deferred to the 4+ mixed-health case). Real painted-pixel verification (hover/focus rings, halation, tabular jitter) re-runs in Phase 4 against the rendered story — cannot be fully scored from spec.

## CRITICAL

None.

## WARNING

- **[approved.md §3, empty-state row]** Empty-state copy says "Finish setup to create your first team" with an action → `/setup`. This state is documented as defensive (FirstRunRedirect routes 0-team users to `/setup` before this renders). Fine — but confirm in Phase 4 that the empty state is genuinely reachable in at least the story (the `.stories.tsx` must render it) so it is not dead, untested copy. The snapshot net only covers it if the story includes the empty variant.
- **[approved.md §2 vs concept AD3 exception]** The design states "1 team — overview NOT shown — header navigates to `/work/team/:onlyId`." That is the *sidebar header* path (`handleViewChange`). The design does NOT specify what happens when a 1-team user reaches `/work` by *any other route* (post-setup landing, breadcrumb, bookmarked redirect). The visual contract for the overview page itself has no 1-team branch — so a 1-team user landing on `/work` would see a 1-row list, which the concept explicitly calls "noise." This is an interaction-coherence gap that the **architecture** must resolve (it is flagged in the architecture-critique as CRITICAL) — not a visual defect in this contract, but the design should have named the resolution. Phase-4 design verification depends on the architecture closing it.

## SUGGESTION

- **[approved.md §2, subtitle]** `${activeBets} active bet(s) · ${phase}` mixes a count and a raw phase string. `phase` is a free-text server value ("shape"|"build"|"cool-down"|…). Confirm in Phase 4 it renders title-cased / mapped, not the raw lowercase enum, to match Hearth copy polish. Low stakes.
- **[approved.md §2, cells]** Three trailing cells (status, agents, progress) on a flush row at desktop — verify the agents `active/total` cell reads unambiguously without a label at a glance (the `team-agents` testid helps tests, not users). Consider whether a tiny "agents" affordance is needed, or accept the column convention from the overview siblings. Defer to Phase-4 render.

## What's Working Well

- **Uniformity is honestly delivered.** Variant A is the only choice that makes the Work overview a literal sibling of *both* other overviews — the workpackage's headline goal. The synthesis correctly rejected C's sectioning (breaks Knowledge parity, pays off only at the deferred 4+ team case) and B's leading RowDot (redundant double-encoding with the right-anchored chip). Clean, well-reasoned variant selection.
- **Zero new shapes, every prop verified against the real primitives.** This is a reuse-discipline exemplar — the design earns its "novel" class purely on the nav-grammar reshape, not on any new component.

**Verdict: 8/10 — APPROVED for build at the design layer.** No CRITICAL design findings. One WARNING (1-team reach-of-`/work`) is an architecture concern, escalated there. Re-score painted pixels in Phase 4 against the rendered `WorkOverview.stories.tsx`.
