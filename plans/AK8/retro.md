# AK8 — Strategy-Owned Decomposition Retrospective

**Status**: Shipped (PR #347). Architecture PASS 8.5/10 (1 revise round). Code review DONE zero-blocking (3 NICE findings). Verify passed first try.

---

## Phase breakdown & cost signals

**Concept + Architecture** (commits f8edfa62 → 3b04e65b, ~1.5 hrs):
- Concept probe identified three architectural options (Kernel-driven fallback, Strategy-async event-subscriber, Strategy-sync port method). Converged on sync port method (tightest AC boundary, existing port pattern proven in AK6/AK7, no new event-subscriber infrastructure).
- Architecture plan (d93ee45f) laid out: 5th port method `decomposeBet`, 3-way turn-source precedence, inline decomposerAgentId validation, `work_decompose_requested` event.
- Critique R1 (3b04e65b): 2 CRITICAL findings (1) override-precedence order in plan was ambiguous between "test seam beats Strategy" vs "Strategy beats test seam" — plan text was loose; (2) AC4 static proof looked vacuous (ESLint guard scope was wrong, guard exempted the one file it was meant to catch). Neither was a code defect; both caught at design gate before build. Designer revised, re-critique R2 PASS 8.5/10.

**Red phase** (commits 96bb7edb, 13 lines):
- Test file `AK8-strategy-decomposition.integration.test.ts`: 4 ACs × 4–5 test cases each (AC1 emit + spy, AC2 Minimal/Fabric, AC3 error paths + AK3 protected suite, AC4 runtime strategy-swap). 672 lines, ~80 lines per AC group. Tests written before code, fixtures borrowed from AK3 (team/agent/bet seeds).

**Green phase** (commits b8ce199b → 16ff9a8f, ~2 hrs):
- T1: `strategy-port.ts` additions — `DecomposeBetRequest`, `DecompositionPlan`, `Strategy.decomposeBet()`. 56 lines. Zero logic, pure contracts.
- T3: `bet-decomposition.ts` rewire — steps 0–11 with inline validation guard, 3-way precedence, event emit. 193 lines net (+133, -87 refactor). Run-through of production flow: call `getActiveStrategy().decomposeBet(...)`, validate id against `candidates.some()`, then apply precedence. Strategy impls (Minimal, Fabric) added `decomposeBet()` returning `{decomposerAgentId, tasks:[]}`.
- Verify passed first try (commit 64b435ee).

**Phase 4 Code Review** (commit e2281633):
- Zero CRITICAL. 3 NICE findings (all polish, no blocker). Key verdict: "All ACs proven via live flow."
- Detailed findings captured in review.md — call-site wiring, 3-way precedence correctness, inline guard real (not unreachable), all 4 AK3 protected tests byte-identical.

**Phase 5 Docs** (commit e2df3d18 → 586ba9aa):
- T5 docs update + @lore comments inline (turn-source asymmetry, inline-guard replacement of selectOwner, divergent-decomposer swap test clarity).
- Retired plans/ artifacts.

---

## Key observations

### Critique gate caught AC-static defects early

The 2 CRITICAL findings in round 1 were **architectural, not code**:
1. Override precedence order ambiguity (which beats what?) — caught in the plan prose, before code. Designer clarified: Strategy-authored tasks beat override beat real turn (plan.tasks > deps.runDecompositionTurn > real). All v1 Strategies return tasks:[], so every test + prod deterministically lands on branch 2 or 3 (known, frozen).
2. AC4 static proof vacuity (ESLint guard exempted its own target) — caught in the AC checklist review. ESLint `no-restricted-imports` guard (eslint.config.ts:600) is real; the AC is a runtime test (divergent-decomposer strategy swap), not lint. Critique fact-audit separated the two.

**Signal**: Critique's design-phase gate (before code) filtered defects out of the green queue. Both were legitimate architectural decisions with documentation gaps, not mistakes. Zero rework needed after green; only comment polish.

### Green phase verify passed first try

No lint errors, no test failures. Indicates:
- Contract design (strategy-port.ts) was tight — both impls (Minimal, Fabric) satisfied it on first write.
- 3-way precedence implementation was straightforward — the real PM turn path was already proven in AK3, only steps 0–6 and 8–9 were new.
- Test fixtures reused AK3 scaffolds; no new test-infrastructure needed.

### Code review: call-site audit proved AC-completeness harder than code-coverage

The review did a call-site audit: for every AC, find a production code path that exercises it. Found:
- AC1 (emit + Strategy call): `runBetDecomposition` line 343 (emit) + line 358 (call). 
- AC2 (breakdown production): `insertProposedBetTasks` line 165 calls `selectOwner` (AC2 reroutes owner assignment through port).
- AC3 (error guarantees): `markTerminal` calls guard all paths (no throw escapes).
- AC4 (runtime swap): test-level `setActiveStrategy` call + `vi.spyOn(strategy, 'decomposeBet')` proves decision flow goes through active Strategy.

Every AC had a live call site; no dead code. This is harder than checking "do tests pass?" — it requires tracing the AC requirement into the produced binary.

### Dead code retained by design (acceptable)

`selectOwner`'s `surface: "bet_decomposer"` union member is now production-dead (AK8 removed the one caller; AK7 added the seam but bet-decomposition didn't wire it until now). The surface remains in the union because:
- AK7 protected integration tests reference it (must keep for AK7 test stability).
- Pruning would churn the `SelectAgentRequest.surface` union + all AK7 test fixtures.
- The dead surface poses zero risk (unreachable in prod, exercised only by AK7 tests, which are frozen assertions).

**Verdict**: Deferred is acceptable. Comment added noting production-dead status. Not a blocker.

### Architecture clearly owned the §2a boundary

The plan defined §2a boundary (Kernel triggers, Strategy selects decomposer + answers "what breakdown", Kernel executes) with explicit row-by-row mapping. Code review verified every line lives on the correct side:
- **Kernel side**: CAS, emit, enumerate candidates, inline validation, cost pre-flight, scratch sandbox, real turn, insert/dispatch, crash sweep.
- **Strategy side**: `decomposeBet` receives occasion (db, ids, description, candidates), returns decision only (decomposerAgentId + tasks). No sandbox, no session spawn, no cost.

The port method signature itself enforces this (hard rule: no harness/cost fields on DecomposeBetRequest/DecompositionPlan). Both impls (Minimal, Fabric) stayed within contract bounds.

---

## Compound candidates (3+ occurrence pattern)

1. **Critique catches AC-static-proof oversell before code builds** (AK2, AK6, AK7, **AK8**).
   - Pattern: Architecture plan claims an AC is "proven by lint guard" or "vacuously by stub"; critique's fact-audit digs into scope/coverage. Catches gaps early.
   - Recommendation: Critique checklist item — for every AC that claims static (lint/type) proof, verify the lint rule fires on at least one real target; never rely on a stub-based assertion in lieu of a live call site.

2. **Protected-test contract confusion** (AK7 blocker, AK8 dodged).
   - Pattern: Green phase delays scope when "AK3 protected tests can't be touched." Misread: assertions frozen, fixture setup may evolve.
   - Recommendation: Builder guidance update — "protected tests stay green" means oracle/assertion frozen; fixture may register new seam participants to satisfy new port methods.

3. **L backend WP green verifies on first try when architecture is tight** (AK3, AK6, AK7, **AK8**).
   - Pattern: Tight contract + clear boundary + TDD (tests before code). Green phase runs to full-suite green in one sweep (no "fix linting", no "fix test race").
   - Signal: For backend seams, if red phase tests pass first-try green without lint/type churn, architecture was likely solid.

---

## Cost signals (effort estimates)

- **Concept + Architecture**: ~1.5 hrs (1 critique round, 2 findings absorbed, no rework).
- **Red phase**: 1 commit (13 lines test scaffolding, reused AK3 fixtures).
- **Green phase**: ~2 hrs (3 commits, 272 lines production + test fixtures; verify first-try green).
- **Code review**: 1 round, zero CRITICAL, 3 NICE polish items.
- **Docs**: ~1 hr (retire plans, update lore, update kernel-strategy-split.md).

**Total for-credit**: ~5 hrs (concept + architecture + green + review + docs). Code review was the highest-effort phase after green (60+ lines of detailed findings).

---

## What went smoothly

1. **Reused existing port pattern** (AK2 ContextAssemblyPort, AK6 ScaffoldPort, AK7 SelectAgentPort all followed the same "request → response" shape). AK8's DecomposeBetPort was instantly familiar to both designer and builder.
2. **3-way precedence was deterministic** (all v1 Strategies return tasks:[], so every test lands on known branch 2 or 3; no surprise interactions).
3. **Existing test fixtures covered the new seam** (AK3 integration test already had team/agent/bet seeds; AK8 added spy assertions, fixture evolved but assertions stayed frozen).
4. **Strategy implementations were trivial** (Minimal: role-match PM else candidates[0]; Fabric: same — both return tasks:[], leaving the PM turn to Kernel). No knowledge-derived breakdown in v1.

---

## What created friction

1. **Critique round 1 → round 2** (override precedence ambiguity, AC4 static proof scope). Minor; caught at design gate.
2. **No friction in green** (first-try verify pass, no lint/type churn).
3. **Code review depth required** (call-site audit + boundary verification was detailed; a surface review would have missed the correctness proofs).

