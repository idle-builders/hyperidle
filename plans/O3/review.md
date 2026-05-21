# O3 Code Review -- Service Move and Bootstrap

**Reviewer:** Phase 4 reviewer (same agent as Phase 2 architecture critique)
**Date:** 2026-05-21
**Commit:** 47956ad (feat(O3): service move and bootstrap)
**Attestation:** PASSED (check, lint, test, build, e2e)

---

## Lens 1: Architecture

PASS. Layer integrity enforced. The fabric package never imports from `@hyperidle/server` (verified via grep). Dependency direction is clean: server -> fabric -> shared -> db.

CRITICAL from Phase 2 addressed: lifecycle-propagation.ts no longer imports `transitionTask` or `RevisionLogEntry` from kernel state machines. Both were inlined with `@lore O3` annotations documenting the duplication and drift risk.

bootstrapFabric signature matches spec: `({ db, eventBus }) => Array<() => void>`. Returns exactly 7 disposers. AppOptions.strategyBootstrap field added with correct type. Production entry point (server-factory.ts) passes bootstrapFabric. All server routes, skill-tools, and ~30 test files updated from relative imports to `@hyperidle/fabric`.

Deviation: `notificationAdapterFactory` retained on AppOptions (plan said "REMOVED"). Documented with `@lore O3` -- avoids test restructuring. Acceptable trade-off.

## Lens 2: Design

PASS. KnowledgeList.tsx fetch URL updated from `/api/knowledge/L3` to `/api/knowledge`. Frontend imports use `@hyperidle/fabric/types`. No new UI components introduced.

## Lens 3: Security

PASS. No new endpoints, input surfaces, or credential handling. Structural refactoring only. Boundary violation check clean.

## Lens 4: Adversarial

WARNING: Stale `@ts-expect-error` at O3-service-move-bootstrap.test.ts line 24. Red-phase artifact.

WARNING: Inlined `transitionTask` in lifecycle-propagation.ts (lines 67-133) creates drift risk with kernel's task-state-machine.ts. No automated detection of divergence. Follow-up: extract transition map to `@hyperidle/shared`.

WARNING: Unsafe `as Record<string, string>` cast at lifecycle-propagation.ts line 189 in Drizzle `.set()` call.

13 `as` casts in lifecycle-propagation.ts total. Most are standard Drizzle column-narrowing patterns. One (`Record<string, string>`) is genuinely unsafe.

## Lens 5: Simplification

PASS. No dead code, commented-out code, or unnecessary abstractions. adapter-factory.ts is correctly extracted (serves two consumers). fabric/src/index.ts is large (394 lines) but every export has consumers.

## Lens 6: AI Slop

PASS. No AI slop patterns in implementation code. `@lore` comments are informative, not filler. Architecture plan deliberation (lines 58-150) was not pruned per Phase 2 feedback -- plan-only issue, not code.

---

## AC Completeness

| AC | Status | Evidence |
|---|---|---|
| AC-1: 7 disposer services moved to fabric | PASS | ls + git rename verification |
| AC-2: 9 non-disposer services moved to fabric | PASS | ls + validation grep zero matches in server |
| AC-3: notifications/ subtree moved | PASS | 8+1 files in fabric, dir removed from server |
| AC-4: observability/ stays in server | PASS | 5 files present, not in fabric |
| AC-5: bootstrapFabric exports correctly | PASS | Signature matches, returns 7 disposers |
| AC-6: AppOptions gains strategyBootstrap | PASS | Field present with correct type |
| AC-7: 7 hardwired register calls removed | PASS | Validation grep zero in app.ts |
| AC-8: Kernel-only boot works | PASS | Test verifies createApp({}) returns 200 |
| AC-9: Production entry passes bootstrapFabric | PASS | server-factory.ts line 110 |
| AC-10: Frontend URL shape updated | PASS | Grep zero for /api/knowledge/L3 |
| AC-11: Frontend imports from @hyperidle/fabric | PASS | Validation grep zero for @hyperidle/shared |
| AC-12: bun run verify passes | PASS | Attestation: all tools green |

---

## Verdict

**DONE.** All 12 ACs pass. Zero critical findings. Three non-blocking warnings (stale ts-expect-error, inlined transitionTask drift risk, one unsafe as cast).
