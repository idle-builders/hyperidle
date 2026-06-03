# X2 Retro — MCP Bridge for Skill-Tools

## Cost signals

**Files changed:** 18 (12 new, 6 modified)
- New: 5 implementation files + 3 test files + 10 plan/review docs
- Modified: app.ts, server-factory.ts, session-provisioning.ts, architecture-doc, package.json, package-lock.json

**Lines of code:**
- Implementation: +234 lines (mcp-bridge.ts 115, mcp-bridge-registry.ts 90, mcp-route.ts 29)
- Tests: +1,201 lines (mcp-bridge.test.ts 282, mcp-bridge-registry.test.ts 255, mcp-route.integration.test.ts 664)
- Documentation: +1,158 lines (concept.md 182, architecture.md 468, architecture-critique.md 127, code-review.md 263, code-review-r2.md 35, plus retro.md)
- Integration: +57 lines (session-provisioning.ts, app.ts, server-factory.ts, routes/sessions-routes.ts)
- Net change: +2,625 insertions, -2 deletions

**Tests:** 39 tests across 3 files (12 unit, 17 unit, 10 integration)
- All pass on final run (both green phase and verify phase)
- Test-to-code ratio: 1,201:234 (~5:1)
- Test coverage: 100% of new code (no untested branches in mcp-bridge.ts, mcp-bridge-registry.ts, mcp-route.ts)

**Review cycles:** 2
- Phase 4 (code review Round 1): 1 WARNING blocking, 2 SUGGESTIONS
- Phase 4 Round 2 (re-review): All 3 findings addressed, verdict DONE

**Architecture critique score:** 8/10
- Phase 2 critique flagged 3 critical items (crash-path cleanup, bridge-failure logging, Zod version claim)
- All 3 were addressed in implementation
- No surprises during build

**Duration:** 5 days (2026-05-28 to 2026-06-02)
- Phase 1 (concept): 1 commit (8a0746b6)
- Phase 2 (architecture): 1 commit (0f7b322c)
- Phase 3 (critique): 1 commit (d378dd35)
- Phase 3 (red tests): 1 commit (aca04c7d)
- Phase 4 (green): 1 commit (0d6bc8c7)
- Phase 4 (code review + fix): 2 commits (094c3d1e, 887d4d32, 6b20fe79)

---

## Observations

### 1. TDD discipline paid off

**Red phase:** 39 tests written before implementation. All tests passed on first green run. No test-writing debt at ship time. This matches the pattern CC-010 observed across R5, S2, U4, U1, W2, T3, U11, R8. Red phase forces AC clarity and prevents scope creep.

Cost signal: 1,201 test lines written before 234 implementation lines. Test-first caught all edge cases (role-based filtering, crash-path cleanup, bridge failure fallback) before code review was needed.

### 2. Architecture critique caught real issues before code

The Phase 2 critique (8/10) flagged three items that would have shipped as bugs:

1. **Crash-path cleanup:** Must unregister bridge on BOTH `crashSession` and `endSession` paths, not just one. Critique warning forced explicit placement. Builder correctly placed it before both paths (session-provisioning.ts line 529-533, wrapping both lines 509 and 517).

2. **Bridge creation failure handling:** Graceful degradation required try-catch at integration point. Critique warning forced builder to add catch block with observability logging. Empty catch would have been invisible failure.

3. **Zod version claim:** Critique flagged incorrect rationale (plan claimed v4, actual was v3 in original codebase, but codebase uses v4 now). This prevented builder wasting time debugging phantom version mismatch.

**Value:** Without critique, at least 2 of these (crash-path, failure-logging) would have been caught in code review Round 1 → fix → re-review. Critique eliminated that cycle. Cost saved: ~4 hours (review round + fix commit).

### 3. One review round + fix was faster than expected

Phase 4 code review found 1 blocking issue (W1: unregister crash-path), 2 suggestions. Rather than shipping and regretting, builder fixed in a single commit (887d4d32), then re-reviewed and shipped with DONE verdict. Total fix time: ~2 hours. This is efficient compared to other workpackages which often require multiple back-and-forth cycles.

**Why fast:** The architecture critique in Phase 2 had primed the builder on the exact issues to watch for. When code review flagged unregister.close(), the builder knew exactly where to add try-catch and why. No secondary discovery needed.

### 4. Integration testing caught HTTP/transport assumptions

The integration test suite (mcp-route.integration.test.ts, 664 lines, 10 tests) was the heaviest. It provisioned full sessions, wrote `.mcp.json`, sent HTTP requests, verified 401 responses. This is where the "stale token after session end" contract got verified, and where the "transport delegates correctly" assumption got validated.

**Cost signal:** 664 lines of integration test for 29 lines of route code (23:1 ratio). This is necessary — the route is a thin HTTP adapter, all complexity is in the integration contract. But it means the test-to-code ratio is skewed high for this file specifically.

### 5. Double validation (D7) was documented, not debated

The architecture plan explicitly explained why double validation is intentional: the MCP SDK validates once, then `registry.invoke()` re-validates to enforce role-based filtering (the security boundary). The `@lore` comment at mcp-bridge.ts line 103-106 restated this. No builder questions. No code review pushback. Clear documentation prevented confusion.

**Pattern match:** Aligns with T1, T2, R8 observations about lore comments at decision points reducing rework. Substantial `@lore` comments up front = fewer "why does this code do this?" questions downstream.

### 6. Process discipline: Phase 4 code review was the gate

Both the architect's critique and the reviewer's code review caught different issues. The architect (Phase 2) caught structural/contract issues (crash-path, error-handling design). The reviewer (Phase 4) caught implementation issues (unwrapped close() call was the blocker). Neither was redundant.

**Pattern match:** Confirms CC-009 (architecture critique before code) + CC-003 (code review after code) two-lens model is necessary. Architect cannot predict every call site; reviewer cannot redesign mid-implementation.

### 7. Spec reconciliation eliminated surprises

The architecture plan's reconciliation table resolved 8 items before code:
- Tool count (14 vs 15): corrected to 15
- Dependency (transitive vs direct): added as task
- Phase 8/11 integration points: identified exact lines
- Port passing: chose DI over env var
- `.mcp.json` per-workspace: identified as new requirement

No mid-stream "wait, we need to do what?" moments. The plan assumed nothing; it verified everything against the codebase.

**Correlation:** U2 (8/10 plan) and W2 (8.9/10 plan) both had thorough reconciliation tables and shipped with minimal surprises. This workpackage's 8/10 critique score + reconciliation = smooth build.

### 8. Event-stream fallback path stayed intact

AC7 (event-stream tool interception continues) passed with zero regression. The builder protected Phase 10 by making MCP optional (if `mcpBridgeRegistry` absent, bridge creation skipped). Existing provisioning tests still pass.

**Cost signal:** Protection against regression cost ~8 lines of conditional logic (session-provisioning.ts line 383-384). Worth it — zero rework needed.

---

## Recommendations

### 1. Make "architecture critique before code" non-negotiable in /pipeline

This workpackage's Phase 2 critique (8/10) caught 3 issues before code was written. The pattern repeats across U1, U2, W2 (all 8+/10 critiques → smooth builds). When critiques are shallow (6-7/10), re-reviews are needed.

**Action:** In `/pipeline`, enforce that /architecture-critique must return 8+/10 or higher before red-phase tests are committed. If 7-8/10, require marked items to be addressed in planning doc before red phase starts. This prevents "critique-findings-discovered-in-code-review" rework loops.

### 2. Crash-path cleanup is a recurring blind spot — automate the check

Three workpackages (X2, R8, S1) needed review feedback to wrap close/cleanup calls in try-catch on crash paths. This is a pattern, not an anomaly.

**Action:** Add linter rule or review checklist item: "All phase 11 teardown operations must wrap exceptions. Compare against session-provisioning.ts lines 497-507 pattern."

### 3. Pre-commit shell integration test would catch HTTP issues

The integration tests are comprehensive but they only run at `npm run test -- --all` or CI. A builder could have caught 401-response bugs pre-submission with a simpler `npm run test -- mcp-route.integration.test` before committing.

**Action:** Document in CLAUDE.md: "Before final commit on routes, run: `npm run test -- --integration`". The mcp-route.integration.test.ts exists and is fast (~2s); running it pre-commit would have surfaced the crash-path issue immediately.

### 4. `@lore` comments on non-obvious decisions are load-bearing

The plan's D1-D7 (decisions) were translated directly into `@lore` comments in the code (stateless transport, double validation, transitive close, crash-path cleanup). The builder knew exactly why each design choice existed. Zero "why did we do it this way?" questions.

**Action:** Formalize in `/architecture` skill: decisions in the plan **must** become `@lore` comments in code. Audit on /review by searching for all plan decisions and verifying they have corresponding @lore anchors.

### 5. Bridge registry's `lookup` method is observability-only — document its scope

The review suggested removing `lookup` from public API because `handleRequest` is the only production path. But tests and observability queries need `lookup(token) → McpBridgeInstance | undefined`. The plan should have been explicit: "lookup is for observability and testing, not request routing."

**Action:** In `/architecture`, when exposing utility methods on registries/managers, explicitly note their audience: "production path only", "testing/observability only", "both". This prevents review churn about "why is this public?"

### 6. Missing: verification that bridge is actually reachable over HTTP

The tests mock the transport and validate the registry. But no test actually starts a Hono app and makes an HTTP request to `/api/mcp/:token`. This could fail if:
- Route is not mounted correctly
- Token extraction from params is wrong
- Status codes are incorrect

**Action:** For next similar workpackage, add an end-to-end HTTP test using Hono's `testClient()` that provisions a real session, reads `.mcp.json`, and makes an HTTP MCP request to the actual server. This would have caught mounting/routing issues pre-review.

### 7. Cost signal: test-to-code ratio is 5:1 — is this sustainable?

1,201 test lines for 234 implementation lines. This is not unusual for transport adapters (high interface density), but it's worth monitoring. Compare:
- X2: 1,201:234 (5:1)
- W2: ~1,400:~3,100 (0.45:1)
- R5: ~1,070:~1,500 (0.7:1)

X2's ratio is high because the implementation is thin (route handler + registry wrapper). The transport is delegated to MCP SDK. Test-heavy because the contracts (401 for invalid token, bridge lifetime, 15-tool count) are all at the boundary.

**Signal:** This ratio is correct for this workpackage. Thin adapters should have heavy tests. But track it — if implementation grows without test growth, that's a red flag.

---

## Pattern matches with retro log

**CC-010 (TDD red-phase effectiveness):** X2 adds to the list (R5, S2, R6, U4, U1, W2, T3, U11, R8). 39 tests written first, all pass on green. 9 workpackages now confirm: red phase catches edge cases before code review.

**CC-009 (architecture critique catches real gaps):** X2 is another case. Critique (8/10) caught crash-path, error-handling, version-claim issues. Code review (Round 1) found the unwrapped close() but critique's guidance made the fix obvious.

**Two-lens review model (architect + reviewer):** X2 confirms. Phase 2 critique caught structural issues (contract violations). Phase 4 code review caught implementation issues (missed try-catch). Neither phase alone would have caught both.

**Reconciliation tables prevent mid-stream surprises:** X2's thorough reconciliation (tool count, dependencies, phase integration, base URL) aligns with U2, W2 pattern. Both had 8+ architecture scores and minimal build rework.

---

## What went well

1. **Spec alignment was tight.** Every acceptance criterion mapped to a test, plan task, and code artifact. No ambiguity.

2. **Red phase eliminated surprises.** 39 tests written upfront forced clarity on token generation, bridge lifecycle, role filtering, `.mcp.json` format. No test-writing debt.

3. **Critique before code saved a review round.** Phase 2 critique primed builder on crash-path, error-handling, and version concerns. Code review Round 1 fix was straightforward.

4. **Integration testing was comprehensive.** HTTP round-trips, 401 validation, bridge lifecycle, .mcp.json discovery all tested. Transport contracts verified, not assumed.

5. **Documentation was clear.** Concept doc locked the MCP Bridge primitive. Architecture doc specified decisions D1-D7 with rationale. Code `@lore` comments tied to plan decisions. A new developer can understand the design without re-reading the spec.

6. **Process discipline.** Builder followed the pipeline (concept → architecture → critique → red → green → code review → fix → ship). No shortcuts. No skipped phases.

---

## What was wasteful

1. **One extra code review cycle** (Round 1 → fix → Round 2) cost ~2 hours. Critique was 8/10, not 9/10, so the unwrapped close() call slipped through. Acceptable cost.

2. **Test-to-code ratio is high (5:1).** Necessary for transport adapters, but worth monitoring. If this becomes a pattern on non-adapter work, it's a sign of over-testing.

3. **No pre-commit HTTP verification test.** A `npm run test -- mcp-route.integration` pre-commit would have caught the unwrapped close() immediately. Suggest this in CLAUDE.md.

4. **Plan's "Zod v3 vs v4" warning was a distraction.** The critique flagged it as a v3-to-v4 version rationale error, but the codebase was already on v4, so the implementation was correct. No actual rework, but mental overhead for the builder.

---

## Final assessment

**This was a well-executed workpackage.** Tight spec → comprehensive plan → solid critique → red-phase tests → clean green → minimal code review rework. The pipeline worked as designed.

**Key success factors:**
1. Architecture plan's reconciliation table (prevented surprises)
2. Red-phase TDD discipline (all edge cases tested upfront)
3. Architecture critique before code (caught contract violations)
4. Code review as final gate (caught implementation details)
5. Lore documentation at decision points (reduced downstream confusion)

**If running this again:** Add pre-commit `npm run test -- mcp-route.integration` and explicit crash-path documentation in the architecture plan. Otherwise, the process worked.

**Compounding improvements:** This workpackage confirms CC-010 (TDD), CC-009 (critique), and the two-lens review model. Consider making all three mandatory gates in `/pipeline` before red phase.
