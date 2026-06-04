# X7 Retrospective: Eval Framework

## Timeline

| Phase | Duration | Notes |
|---|---|---|
| 1 — Designer (concept + architecture) | ~15 min | No concept work needed (eval is infrastructure). Architecture plan: 19 sections, 935 lines. |
| 2 — Reviewer (architecture critique) | ~5 min | Score: 8/10 (SA:8 LI:9 AC:8 DM:7 N:9 MD:9 FMC:8 S:9 V:7). 1 CRITICAL, 4 WARNINGs. |
| 3 — Builder (red + green) | ~45 min | Types, seeding (8 helpers), scoring, provision harness, runner, CLI, POC scenario. |
| 4 — Reviewer (code review) | ~6 min | Verdict: DONE. 0 MUST-FIX. 2 non-blocking (duration bug, dynamic imports). |
| 5 — Retro | ~3 min | This document. |

**Commits:** 5 productive + 1 scaffolding. Single code-review cycle (no rework).

## What Went Well

1. **Architecture plan reconciliation eliminated surprises.** The reconciliation table (7 spec-vs-reality discrepancies) resolved before code. Prevented mid-stream scope surprises (e.g., teamId↔productId mapping, PGlite vs test-utils coupling, missing server exports).

2. **Proactive critique fix application.** All 4 architecture critique findings addressed during implementation with `@lore` comments. Zero findings re-discovered during code review.

3. **Clean eval/test separation.** Framework correctly positioned outside the three-layer architecture as developer infrastructure. vitest config excludes packages/eval. npm run test runs 0 eval files. Evals are not tests — enforced structurally.

4. **Composable seeding library.** 8 helpers + seedMinimalWorld provide forward-investment for X8 without over-engineering.

5. **No breaking changes.** Purely additive: 7 server sub-path exports, 2 root scripts. Zero existing code modified. Zero regression risk.

6. **OpenRouter default model.** Builder adapted the architecture plan's Anthropic default to OpenRouter with DeepSeek v3, matching the project's actual API key configuration.

## What Could Improve

1. **Error-path duration bug.** runner.ts line 270 uses `totalStart` instead of per-scenario start time. For scenario 2+ that crashes, duration includes all previous scenario time. Fix: record per-scenario start.

2. **Dynamic imports unnecessary.** runner.ts lines 168-169 dynamically import `bets` and `eq` despite both being available as top-level imports.

3. **seedThread deferred.** Plan specified 9 helpers; 8 implemented (seedThread deferred to X8).

4. **resolvedFastModel never resolved.** TriggerContext.resolvedFastModel defined but runner never constructs it; always undefined.

## Cost Signals

- **Lines added:** ~2,500 (implementation) + ~72KB (plans/artifacts)
- **Test files added:** 0 (correct — eval is not part of test suite)
- **Test files broken:** 0
- **Verify passes:** check ✓, lint ✓, test (505 files, 5604 tests all green)
- **Code review cycles:** 1 (DONE on first pass)
- **Architecture critique rounds:** 1 (8/10, above threshold)

## Observations for /compound

1. **Plan reconciliation pattern confirmed.** When architecture plan includes spec-vs-codebase reconciliation table, implementation surprises drop to zero. Seen in T5, U4, R5, X2, X3, X7.

2. **Sub-path exports coupling.** X7 added 7 sub-path exports to server/package.json. Correct for isolated consumer, but future packages may want barrel exports instead.

3. **Infrastructure packages deliver faster.** Single-cycle delivery (no UI, no design, no design-critique) with test-first discipline. Key enabler: detailed reconciliation + proactive critique fixes.

4. **Lore documentation quality.** 15+ `@lore` comments captured decisions where they live. Future agents benefit from running `/lore scan` step.
