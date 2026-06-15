# AG7 Retro — Settings design-consistency pass

**Date:** 2026-06-15 · **Complexity:** M · **PR:** #318
**Scope:** 27 files, +1028/-587. Consistency/presentation pass over 10 Settings sections onto shared design-system primitives + a custom static consistency gate.

## Trajectory (cost signals for the A/B harness)
- **Phases run:** all 6 + ship. Designer (concept→design→architecture) + 1 revision round; reviewer critique (Phase 2) + code review (Phase 4); builder red→green + 1 fix batch; docs; retro.
- **Critique outcome:** APPROVED first pass (design 8/10, arch 7/10) — but surfaced **2 CRITICAL build-time corrections**, folded in via 1 revision commit (`d2c47a9a`) before any code.
- **Review outcome:** DONE, 0 CRITICAL, 3 WARNING. 2 WARNINGs (W1 type cast, W2 off-grid `ml-2`) folded in; static check extended to catch margin aliases.
- **Rework cycles:** 0 builder rework loops (no BLOCKER, no NOT-DONE). Green phase completed in one builder session despite 10 sections.
- **Verify:** 5663/5663 tests, 481/481 files green; snapshot net green (no re-bless needed — "unknown" routed to same neutral-grey style).

## Top observations

### 1. Lint-gate blind spot for consistency work (reusable lesson)
`npm run lint` only flags arbitrary-value classes (`gap-[16px]`, `text-[14px]`), NOT Tailwind/DaisyUI **alias** classes (`gap-4`, `text-sm`) — which are the actual divergences a consistency pass targets. AC-1/AC-2 had **no enforcing gate** until a custom static check (`scripts/ag7-no-divergent-classes.ts`) was added. The critique caught this pre-build. Any future "consistency / token-adoption" WP must ship its own enumerated static check; lint alone is a false sense of coverage.

### 2. TDD applied to a presentation pass works
The static check was written red (84 violations on current code), then driven to 0 as sections converted. This makes a presentation pass falsifiable — the gate can't be claimed unreachable or vacuously green (it has an enumeration guard: 10 files, non-empty forbidden list, whole-token bounding). Worth protecting as the pattern for consistency contracts.

### 3. Combined-gate blind spots (W2)
`ml-2` (8px off-grid) slipped BOTH gates: the AG7 check forbade `gap-*`/`text-*` but not margin aliases; eslint forbade arbitrary `m-[Npx]` but not aliases. Each gate was reasonable alone; the union left a hole. Fix was cheap (extend the check with `ml/mr/mt/mb-*` aliases). Lesson: a custom static gate should document its blacklist scope + cross-gate dependency so the next maintainer knows whether an omission is intentional.

### 4. Critique-before-build avoids rework (CC-010 reuse)
Both CRITICAL findings (lint hole; wrong test paths + 2 omitted root test files) were corrected in the plan via 1 revision commit before the builder started. Found post-build, each would have cost a rework cycle. Producer/evaluator separation paid off again.

## Cost-signal summary
- Critique gate caught 2 real issues that would otherwise have shipped (lint hole = silent AC miss; wrong test paths = red-suite-at-task-11 surprise).
- Review gate caught 2 real issues (type-unsafe cast; off-grid alias that the static check itself missed).
- M-presentation WP cost profile: low (one green session, 0 rework, 0 re-bless). Similar to L-process, distinct from L/M full-stack.
