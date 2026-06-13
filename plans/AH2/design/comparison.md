# AH2 Design Comparison (routine — single variant)

Routine class → one variant, scored in-session, plus rejected directions. No multi-variant board (the shape is locked by existing components + concept).

| Dimension | "Constrained selectors" (chosen) |
|---|---|
| Signature | Two equal-weight `Select`s — Model then Harness — both fed from live system truth; zero free-text |
| Component count | 0 new (swaps free-text `<input>` → existing `Select`) |
| Density | Unchanged from current `table table-xs` + inline form; one column removed (Model Tier), one added (Model) → net flat |
| Primary action surface | Inline edit/add form; explicit Save (Agents), debounced auto-save (Models, existing) |
| State strategy | One canonical layout; degraded = disabled flagged option + `StatusChip` warning |
| Motion budget | Zero new motion (inherits `Select` `--motion-fast` border transition) |
| Best at | Making an agent runnable-by-construction with no typo path; honors component budget |
| Worst at | Per-agent provider diversity (Anthropic-only picker — scoped out by concept) |
| Phase-2 critique score | **8.5/10** (below) |

## In-session critique (9 dimensions)
- **Spec alignment** 9 — directly satisfies all 5 ACs: per-agent model, constrained harness, default-on-create (architecture wires seeds), current catalog, demoted tier table.
- **Hierarchy** 8 — Model→Harness left-to-right (brain→body) reads cleanly; both equal weight is correct (neither dominates). Minor: 3 fields on one row can feel busy on narrow desktop — flex-wrap handles it.
- **Density** 8 — net-neutral column change; no bloat.
- **State coverage** 9 — populated/loading/error/empty/overflow/degraded all specified; degraded (unregistered harness) is the genuinely new state and is handled visibly, not silently.
- **Anti-slop** 9 — no AI tells; reuses warm-token table + Select; no new card grid, no hero, no emoji (the `●` in the warn chip is a status dot, not iconography — borderline AQ-105; **use a `StatusChip` not a literal bullet in TSX**).
- **Component budget** 10 — zero new components.
- **Copy** 8 — "Harness unavailable", "System default models. Used only when an agent has no model of its own" — terse, guiding, no superlatives.
- **Motion** 8 — minimal, appropriate.
- **Mobile** 7 — flex-wrap stacks, but AQ-005 (≥16px input at ≤768px) must be verified on the two `Select`s — flagged.

Weakest: Mobile (7) and the literal-bullet anti-slop risk — both addressable in architecture/build, neither triggers low-confidence fallback (no dimension <5). Single variant stands.
