# Popover comparison — A (reuse NotificationRow) vs B (purpose-built row)

| Dimension | A — Reuse `NotificationRow` | B — Purpose-built row |
|---|---|---|
| Signature | Status-dashboard consistency (StatusChip + colored border everywhere) | Dense, title-forward triage queue; one urgency color |
| Component count | 0 new shapes (reuses DS `NotificationRow`) + 1 shell file | 0 new DS primitives (inline row in shell composition) + 1 shell file |
| Density | ~4–5 rows in 70vh; `px-24` + circle + chip = heavy | ~10 rows in 70vh; `py-9 px-12`, one dot |
| Primary action surface | Trailing icons always visible; whole-row jump | Title = jump; mute/dismiss hover-reveal (always-on touch) |
| State strategy | Empty/loading/error/populated (shared EmptyState, spinner) | Same four, identical patterns |
| Motion budget | row hover bg; dismiss fade | row hover bg; dismiss fade + 4px translate |
| Best at | Looking like the rest of the app | Reading the title; triaging fast |
| Worst at | **Title truncates to "Revie…" at 360px** (screenshot-proven); 3 color signals fight | Diverges from `NotificationRow` vocabulary; affordances hidden at rest |
| Anti-slop | borderline AQ-113 (empty decorative icon circle) | clean |
| Phase-2 critique | **5.4/10** | **8.3/10** |

## In-session critique scores (9 dims, 0–10)

| Dim | A | B | Note |
|---|---|---|---|
| Hierarchy | 4 | 9 | A: title loses to chip+circle+border; B: title dominates, the eye lands right. |
| Spacing/density | 4 | 8 | A: `px-24` + 24px circle eats width → truncation; B: on-grid `9/12`, fits ~10 rows. |
| Typography | 6 | 8 | B uses mono caps for type label (`tracking-caps-sm`), tabular time. |
| Color | 5 | 9 | A: StatusChip + border + circle = 3 signals; B: one red/muted dot (red-only danger, Lucid). |
| Coherence | 7 | 7 | A matches health rows; B matches the dense Sidebar/ThreadRow grammar. Tie. |
| States | 7 | 8 | Both cover 4 states; B's empty copy is terser. |
| A11y | 6 | 7 | A: decorative circle aria-hidden ok; B: hover-reveal mitigated by focus + touch-always-on. |
| Anti-slop | 4 | 9 | A: empty icon circle is decorative iconography (AQ-113 smell). |
| Premium polish | 5 | 8 | B reads like Linear's inbox; A reads like a generic status list. |
| **Mean** | **5.3** | **8.1** | |

Screenshots prove the decisive failure: at the locked 360px popover width, Variant A truncates every title to ~6 chars. The notification's whole job is to say *what crossed the threshold* — A fails the core task.
