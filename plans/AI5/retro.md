# Retro: AI5 — Shared-primitive adoption sweep

Branch `feat/AI5-shared-primitive-adoption`. Pure consolidation sweep (DS primitive
extensions + adoption across web). Two convergence loops (arch critique, code review),
each closed in 1 round.

## Cost / shape signals (from commit sizes)

| Phase | Commit(s) | Shape |
|---|---|---|
| Plan + design + concept | `528f15f5` | ~396 lines docs (arch 205 + concept 66 + design 125) |
| Critique round 0 | arch-crit + design-crit | arch-crit 38 + design-crit 21 lines |
| Plan revision | `8b1de6b2` | arch +138 / design +63 — substantial rewrite driven by critique |
| Re-critique round 1 | re-review appended | APPROVED (6→9) |
| Red-phase tests | `195c8ace` | 627 lines, 6 test files |
| DS extensions (Phase A) | E1–E5 | Skeleton single-bar, EmptyState/ErrorState compact, ScopePicker, deriveInitials |
| Adoption sweep | feat commits | Avatar/scope/Skeleton/compact-state/TabBar/Button across web |
| Review round 0 | `7ce2aea2` | review.md, NOT DONE (AC2) |
| AC2 fix | `8c8e0a26` | 9 files, btn→Button migration + Skeleton inline dims |
| Re-review round 1 | `eb34242d` | review.md +56 lines, DONE |

Upfront investment (concept+design+arch+2 critique rounds) preceded any code. Both
correction loops converged in exactly 1 round — critique→revise and review→fix machinery
paid off without thrash.

## What drifted

### CC-007 — scope-pill inventory wrong, caught by critique (high)
Plan claimed 2 pill rows + 2 `<Select>`; tree had 3 pill `radiogroup`s + 1 `<Select>`.
`KnowledgeCreateDialog:192` was ALREADY a hand-rolled pill row (hardcoding
`rgba(22,118,79,0.08)` at :213), not a Select. The arch critique spot-checked the
inventory against the tree, caught it (`architecture-critique.md:9-12`), drove the round-0
6/10. Revision corrected the framing to `3+1` (`architecture.md:31`) and pinned a 4-prefix
testId map. Recurring class: **adoption-sweep inventories drift from the tree and MUST be
re-grepped at plan time, not trusted from an upstream review doc.** The designer inherited
the spec's loose "~16 sites / 2 Selects" count instead of verifying.

### AC2 — candidate btn sites silently dropped (high)
Plan split `btn` sites into "Candidate migrate" (standalone actions) vs "KEEP" (dialog
footers, AG5 triggers). Builder migrated ZERO candidates, justifying only the KEEP class.
Spec named `btn` sites as in-scope bypasses. Review caught the gap (AC2 NOT MET,
`review.md` findings), builder fixed all flagged sites in one round (`8c8e0a26`). Pattern:
**"candidate-migrate" plan items get silently dropped under budget pressure unless the AC
gate is explicit and binary** — "builder judgment" is not a sufficient keep-reason when the
spec enumerates the sites.

## What worked
- Two-round critique→revise loop (arch 6→9, design 8→9) converged in 1 round; every prior
  CRITICAL/WARNING tree-verified as genuinely fixed.
- Review→fix loop (AC2 NOT DONE → DONE) converged in 1 round, no protected test weakened,
  no regression.
- TDD red phase (`195c8ace`, 627 lines) froze contracts before impl; compact-as-a-prop
  (not a 2nd component) honored the concept rejection list.
- Boundary-yields discipline held: AG5 menu triggers / AI2 dialog footers correctly kept;
  ScopePicker naming fenced AI5 from AG5.

## Reusable lesson — lint gate gap (Track AI/AG sweeps)
Both AI5 gaps (AC4 rgba tint, AC2 hand-rolled button) are exactly the class an automated
static gate should catch — yet neither was gated:
- `eslint-plugin-design` has **no hand-rolled-button rule**. `no-handrolled-select` covers
  ScopePicker/AG5 only; AC2 `btn`/hand-rolled-button bypasses go uncaught.
- `no-hardcoded-color` DOES match `rgba(...)` literals but is registered at **`warn`, not
  `error`** — the tint bypass would not fail CI.
- Precedent: AI2/AI4 promoted `no-raw-overlay-z`, `no-dialog-boilerplate`,
  `no-local-status-builder` from warn→error post-migration. Same move applies here.

Recommendation for `/compound`: after AI5 lands clean, promote `no-hardcoded-color` to
`error` and add a `no-handrolled-button` rule (flag DaisyUI `btn btn-*` className on a bare
`<button>` outside Dialog footer / AG5 menu-trigger allowlist). Both gaps become CI-fatal
instead of relying on a critique/review round to catch them by hand.
