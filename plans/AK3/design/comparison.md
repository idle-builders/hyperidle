# Phase 2 — In-session critique (routine: single variant "Honest task state")

Routine class → one variant, scored on the 9-dim rubric. No side-by-side; the comparison is against the *status quo* (the permanent placeholder) and the rejected directions (synthesis.md).

| Dimension | Score /10 | Note |
|---|---|---|
| Hierarchy | 8 | Heading → state region → action. The one actionable state (blocked-no-agent) is the only one with a button, so the eye lands on the recovery path exactly when it matters. |
| Spacing | 9 | All `EmptyState` internal padding is design-system-owned (36px page / 18px compact), on-grid. Section uses existing 18px/9px rhythm. No off-grid values introduced. |
| Typography | 9 | Inherits EmptyState's 20/15 (title/desc) and the existing uppercase-tertiary section label. No new sizes/weights. |
| Color | 8 | Green-dim tint for the benign "decomposing"; amber (`--accent-secondary`) for blocked — warning, not error-red. Correct semantic: a blocker is a state to act on, not a crash. No hardcoded color. |
| Coherence | 9 | Same `EmptyState` primitive the page already uses for `bet-tasks-empty`; same task-row list. Reads as the same surface, just truthful. |
| States | 9 | This variant IS a states exercise: draft / decomposing / blocked(×2 reasons) / populated, each with final copy and a precedence rule (tasks always beat a late blocker). This is the dimension the workpackage exists for. |
| A11y | 8 | `EmptyState` is `role="status"`; blocked carries an actionable Button in tab order. (Open: should blocked be `role="alert"`? Decided no — it's not an interrupt; it's persistent honest state. Founder discovers it on view, not as a popped alert.) |
| Anti-slop | 9 | No spinner, no hero, no decorative icon spam — icons appear only on the two states that need a status signal (live/alert). No AI-aesthetic tells. |
| Premium polish | 7 | LiveDot for "planning" is a quiet, premium touch over a generic spinner. Loses a point: no skeleton/shimmer for the decomposing→populated transition — acceptable for v1 (plain remount). |

**Aggregate: 8.4/10.** No dimension below 5 → no low-confidence fallback to a second variant. Locked.

## Status quo it replaces
A single `EmptyState title="No tasks yet" description="Tasks will appear here once agents start work on this bet."` rendered whenever `bet.tasks.length === 0` — regardless of bet status or whether work *can* start. That is the C1 violation. The variant's whole job is to make that slot conditional on real state.
