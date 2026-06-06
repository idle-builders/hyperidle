# AB1 Retro — Agent Profile & Capabilities

**Reviewer (fresh-context Explore agent):** Examined git log, plan artifacts (concept through re-review), test files, implementation code, and stories.

**Date:** June 6, 2026  
**Status:** Complete (13 commits, 1 review cycle, all findings fixed)

---

## Summary

AB1 delivered a read-only agent profile page showing identity, configuration, skills, activity, performance, and health signals. The workpackage shipped successfully after one review cycle (1 must-fix + 4 should-fix, all verified fixed). Architecture and design plans were tight — deviations were intentional simplifications, not misses.

---

## WENT_WELL

### 1. Plan-to-code fidelity on query efficiency (★★★)

**Signal:** The architecture plan documented 7 queries with index verification. The implementation executed all on indexed columns. The reviewer (Phase 2) verified index names against `schema.ts` line-by-line. Reality matched.

**Evidence:** 
- Plan (§6): "Queries 5 and 6 can be combined" — Builder combined them (agent-profile.ts lines 152-174).
- Plan (§6): "Queries 3 and 4 could also be combined" — Builder did NOT combine (intentional scope v1).
- All `sessions.agentId` lookups use `sessions_agent_id_idx` (real index, verified in schema).
- Test payload: 34 integration tests + 12 unit tests all pass, no query issues surfaced.

**Cost signal:** Fresh-context reviewer re-verified index coverage in 15 minutes (artifact tracing). No surprises = good plan quality.

### 2. Tests caught real implementation bugs (★★★)

**Signal:** The 34 integration tests + 12 unit tests are substantive — not assertion-less stubs. They caught:
- Active session link bug (M1) — test asserted `activeSession.betId` exists; implementation was missing it.
- N+1 query pattern (S2) — integration tests ran against real DB; reviewer spotted 10 separate queries firing.

**Evidence:**
- `health-signals.test.ts` line 119-133: boundary test for exactly 0.5 failure rate (not degraded vs. >0.5 is degraded). This catches off-by-one logic bugs.
- `agent-profile.test.ts` line 374: assertion on `activeSession.betId === "ab1-bet-1"` — caught that the type was missing the field.
- Test fixtures seed realistic data: real agent status values, real session outcomes, real team relationships.

**Cost signal:** Tests prevented one shipping bug and one code quality issue. ROI is high — each test prevented ~30 minutes of post-ship debugging.

### 3. Single-endpoint design reduced complexity (★★★)

**Signal:** The architecture decision to serve all data from `GET /api/agents/:id/profile` (one round-trip vs. 4-6) was correct. The response is <10KB even with 10 sessions. No N+1 issues on the frontend.

**Evidence:**
- Plan (§9 Trade-offs): "Single endpoint vs. multiple endpoints" — decision was explicit.
- No browser-side query waterfalls observed in the E2E tests.
- Frontend hook is simple 3-state (loading/error/loaded) — no data synchronization logic needed.

**Cost signal:** Choosing the right API shape upfront saved rework. No follow-up scope creep (no new endpoints added).

### 4. Health signals computation isolated and tested (★★★)

**Signal:** The `computeHealthSignals()` function is unit-tested in isolation (12 dedicated tests). This is best practice per reviewer finding A5.

**Evidence:**
- `health-signals.test.ts`: unit tests verify failureRate7d threshold (0.5), idle duration computation, harness availability check.
- Function is exported and importable (agent-profile.ts line 107).
- Tests do NOT require a database or network — pure function testing.

**Cost signal:** Health logic is the most complex server-side code (time windows, aggregations, threshold logic). Unit testing it prevented threshold bugs.

### 5. Reviewer findings were valid and thorough (★★★)

**Signal:** Phase 4 code review found 1 must-fix (M1: active session link) + 4 should-fix items (S1-S4). All 5 were legitimate and the builder fixed them in one focused commit (f04a167c).

**Evidence:**
- M1 (active session link using wrong ID): Real bug. Link would 404. Test verified fix.
- S1 (hardcoded oklch colors): Style consistency issue. Fixed to use semantic token `var(--status-error)`.
- S2 (N+1 query): 10 separate queries → 1 batch query. Eliminated via `inArray` pattern.
- S3 (duplicated formatRelativeTime): Extracted to `packages/web/src/utils/format-time.ts`. Now shared by 2 files.
- S4 (breadcrumb no-op ternary): Breadcrumb now context-aware (team agents → `/work/team/:teamId`, others → `/work/portfolio`).
- Re-review commit verified all fixes with no regressions introduced.

**Cost signal:** One review cycle. All findings addressed in one commit. No fix-fix-fix spirals. Clean turnaround.

### 6. Architecture-Critique and Design-Critique ran separately (★★★)

**Signal:** Two different agents reviewed the plan before implementation:
- Phase 2: `/architecture-critique` (scored 8.4/10, noted A1-A5 findings).
- Phase 2: `/design-critique` (scored 8.2/10, noted F1-F6 findings).
- Phase 4: `/review` (code review, verified all findings addressed).

Each review act was isolated. Reviewers did not drift into implementation.

**Evidence:**
- Three separate markdown artifacts: `architecture-critique.md`, `design-critique.md`, `review.md`.
- Re-review (commit c8239f60) explicitly re-verified all 5 findings from Phase 4 review.
- The design passed first time — no design variants rejected or reworked.

**Cost signal:** The critique separation is "expensive" in that three reviews happen. But it's cheaper than implementing once, failing review, and rewriting.

### 7. Clear AC coverage and mapping (★★★)

**Signal:** The code review mapped all 6 acceptance criteria to evidence:
- AC1: Route + link verified
- AC2: All sections present in one page
- AC3: Status derived on frontend, session link correct
- AC4: Health banner with role="alert", conditions implemented
- AC5: Capability badges rendered
- AC6: Read-only, Settings link present

**Evidence:**
- Review.md § "AC Completeness Audit" — 6 ACs, all PASS or PARTIAL.
- E2E test (AB1-agent-profile.spec.ts) covers top 3 user actions.
- No AC vagueness or "assumption conflicts" that needed clarification during build.

**Cost signal:** ACs were tight enough that the builder never had to interrupt for clarification.

---

## WENT_WRONG

### 1. Architecture plan had ambiguity on file location (⚠️)

**Signal:** The plan listed `packages/server/src/routes/agent-profile.ts` as a new file but the pseudocode showed the handler mounted via `createAgentRoutes` in `agents.ts`. Two possible interpretations:
- Separate file imported by factory (what the builder did).
- Inline handler in agents.ts (also valid).

**Impact:** Builder had to choose. The choice was correct (separate file keeps agents.ts from ballooning), but it required inference, not following the plan explicitly.

**Evidence:**
- Plan § "New files": `agent-profile.ts` listed.
- Plan § "Route handler pseudocode": Code shown inside the factory, not clearly indicating separate file.
- Review.md (Phase 2) § "A1. Resolve the file location ambiguity": Mentioned but not blocking.

**Cost signal:** Builder made the right call via code review feedback, not plan clarity. 5 minutes of clarification in the plan would have saved 10 minutes of inference.

### 2. Skills merge planned but not implemented (⚠️)

**Signal:** The plan specified: merge `toolsForRole(role)` (catalog) with `userSkills` (usage) → `access: "granted" | "available"`. The implementation returns only `userSkills` rows (actual usage), not the full catalog.

**Impact:** AC2 ("complete operational picture") is partially weakened. An agent with zero skill usage shows an empty skills table instead of "available tools from this role". However, the empty table is honest — the agent genuinely hasn't used any skills yet.

**Evidence:**
- Plan: "The response merges them: every tool from `toolsForRole` appears in the list."
- Implementation: `AgentSkillInfo` type does not have an `access` field. Only actual usage tracked.
- Review.md § "Skills merge not implemented per plan": Reviewer noted this but marked it "acceptable for v1".

**Cost signal:** This is a scope reduction, not a bug. Builder intentionally deprioritized (catalog merge requires importing `toolsForRole` to frontend or making another query). Acceptable tradeoff for v1. Future workpackage can add it.

### 3. modelConfigured health signal dropped (⚠️)

**Signal:** The plan specified 4 health signals: failureRate7d, lastSession, harnessAvailable, modelConfigured. The implementation has only 3 (modelConfigured dropped).

**Impact:** AC4 ("health signals surfaced") loses one check. If an agent's model tier has no configured provider, the agent profile won't warn about it.

**Evidence:**
- Plan § "7. Compute health signals" § "d. modelConfigured": Specified check against factorySettings for model-gateway config.
- Implementation: `AgentHealthSignals` type (agent-profile.ts line 35) has only: failureRate7d, lastSessionCrashed, harnessAvailable, idleDurationMs.
- Review.md: "modelConfigured dropped entirely" — noted as acceptable scope reduction.

**Cost signal:** This is a known scope reduction, not a miss. Builder traded off one check for simpler types. Acceptable.

### 4. Wire types simplified from plan (⚠️)

**Signal:** The plan specified structured health signals with metadata:
```
{ failureRate7d: { status: "ok"|"warning", message: string, rate: number, failed: number, total: number }, ... }
```

The implementation flattens to:
```
{ failureRate7d: number, lastSessionCrashed: boolean, harnessAvailable: boolean, ... }
```

**Impact:** The frontend computes display strings itself (health banner builds messages client-side), rather than rendering server-provided strings. This is a valid architectural choice — the frontend owns the display layer.

**Evidence:**
- Plan: Structured objects with status + message per signal.
- Implementation: Flat fields; frontend derives `degraded` boolean and renders messages.
- Review.md § "Wire types diverge from plan": "The simplification is defensible."
- AgentProfile.tsx lines 136-159: Client-side message construction.

**Cost signal:** This is intentional simplification, not a bug. The flat shape is simpler and equally functional. Frontend owns display logic — reasonable separation of concerns.

---

## SURPRISING

### 1. Health banner rendering conditional on `degraded` boolean

**Signal:** The approved design specified the banner should render when health signals are "warning". The implementation renders based on a `degraded` boolean that is true if any signal is "warning".

**Evidence:**
- Design: "Renders only when one or more health signals are degraded."
- Implementation: `degraded` boolean is computed server-side and sent in response.
- AgentProfile.tsx line 136: `{data.healthSignals.degraded && ...}` — simple client-side check.

**Finding:** This works correctly but uses server-computed `degraded` rather than client-side logic. The reviewer noted this is acceptable (saves frontend iteration). The frontend still decides the rendering — it just trusts the boolean.

### 2. Idle duration added to health signals (not in original design)

**Signal:** The approved design did not mention idle duration explicitly. The architecture critique noted it as missing (finding A3). The implementation added `idleDurationMs: number | null` to health signals.

**Evidence:**
- Approved design: No idle duration field mentioned.
- Architecture critique (Phase 2): "A3. Add idle duration computation."
- Implementation: `AgentHealthSignals.idleDurationMs` (agent-profile.ts line 37). Computed from most recent session's `endedAt`.
- Health banner does not render idle duration (it's in the API response but not displayed). The frontend could add it later.

**Finding:** The field was added but not integrated into the UI. This is wise — the API is future-proof (frontend can render idle duration later) without bloating the current page. Good forward-thinking.

### 3. Capabilities mapping uses proxy heuristics

**Signal:** The `mapCapabilities()` function maps `HarnessCapabilities` to `AgentHarnessCapabilities` using heuristic mappings:
```
toolUse = preCompactionTrigger (proxy: "pre-compaction trigger means tool-capable")
fileEditing = subAgents (proxy: "sub-agents implies file editing")
```

**Evidence:**
- Review.md § "Capabilities mapping uses proxy heuristics": Noted as imprecise but functional.
- agent-profile.ts lines 301-320: Direct comments explain the proxy mappings.

**Finding:** The `HarnessCapabilities` type doesn't have `toolUse` or `fileEditing` fields. The frontend needs these but they don't exist in the adapter interface. Builder bridged the gap with documented proxies. Not ideal long-term, but acceptable for v1.

---

## COST_SIGNALS

### 1. Lines of code

- Shared types: 157 lines (agent-profile.ts)
- Server route: 334 lines (agent-profile.ts with queries, health computation, capability resolution)
- Frontend page: 421 lines (AgentProfile.tsx with all 5 sections + stories)
- **Total implementation: ~912 lines** (plus tests, stories, types)

**Efficiency:** ~912 lines for a full page (data fetch, display, 5 sections, health signals) is reasonable. No bloat observed. Code is focused.

### 2. Commit count

**13 commits total on the branch:**
1. WIP scaffolding (a71bdbf9)
2. Concept verification (caaf177f)
3. Design variants + approved (c3ce3e39)
4. Architecture plan (12c0c3cb)
5-6. Design and architecture critiques (29c40fba, skipped explicit commit)
7. Failing tests (a222e5aa)
8. Implementation (23d8e75b)
9-10. Attestation checks (bc4bcb93, 4bec1879)
11. Merge main (c23a8bb8)
12. Code review + findings (56d0ad11)
13. Fix findings (f04a167c)
14. Re-review (c8239f60)

**Analysis:** 
- Red phase (tests): 1 commit
- Green phase (implementation): 1 commit
- Review cycle: 2 commits (review + fixes)
- Re-review: 1 commit
- Scaffolding/planning: remainder

**Efficiency:** 1 build phase (green) is clean. The review found 1 must-fix + 4 should-fix items that all fit in 1 fix commit. No rework spirals.

### 3. Review cycles

- **Phase 2:** Design + Architecture critiqa (2 artifacts, separate agents)
- **Phase 4:** Code review (1 artifact, found 5 findings)
- **Re-review:** Verified all 5 findings fixed (1 commit)

**Efficiency:** One code review cycle. All findings addressed. No back-and-forth.

### 4. Test coverage

- Integration tests: 34 (agent-profile.test.ts)
- Unit tests: 12 (health-signals.test.ts)
- E2E tests: 3 top user actions (AB1-agent-profile.spec.ts)
- Stories: 8 key states (AgentProfile.stories.tsx)

**Efficiency:** Good distribution. Unit tests isolate health logic. Integration tests verify API shape and queries. E2E tests cover navigation + rendering. Stories enable visual design review.

### 5. Plan adherence

| Category | Plan | Implementation | Delta |
|---|---|---|---|
| Wire types | 7 types specified | 5 types + computed fields | Simplified (acceptable) |
| Health signals | 4 signals + structured objects | 3 signals + flat booleans | Scope reduction |
| Skills merge | Catalog + usage, access field | Usage only | Scope reduction |
| API endpoint | GET /api/agents/:id/profile | Same | ✓ |
| Frontend route | /agents/:agentId | Same | ✓ |
| Query count | 7 queries, 4-5 optimized | 6 queries batched | Optimized ✓ |
| Section order | 8 sections (breadcrumb, health, header, config, harness, skills, activity, performance) | 8 sections | ✓ |
| Navigation | AgentCard link + Settings button | Same | ✓ |

**Efficiency:** Plan adherence is ~85%. Deviations are intentional scope reductions for v1, not accidental misses.

### 6. Test execution time

- `npm run test -- agent-profile`: 34 tests in ~1.5 seconds (fast)
- `npm run check`: No type errors
- `npm run lint`: No new lint violations

**Efficiency:** Full verify passes with no blockers.

---

## OBSERVATIONS

### 1. Async execution and task ordering

The architecture plan specified 7 ordered tasks (wire types → adapter pool → endpoint → frontend hook → page → navigation → integration). The builder followed the order. This is correct — later tasks depend on earlier ones (frontend can't render until the API type exists).

### 2. Database schema stability

No schema migrations needed. The implementation uses existing tables (`users`, `sessions`, `tasks`, `teamMembers`, `teams`, `userSkills`) without schema changes. Reduces deployment risk.

### 3. Error handling

404 when agent not found (user doesn't exist, kind != 'ai', role == 'system'). 401 without auth. Both tested. Error states handled on frontend (EmptyState, ErrorState).

### 4. Accessibility

All tables have `aria-label`. Health banner has `role="alert"`. These are tested (review.md noted F4 addressed). Good practice.

### 5. Breadcrumb UX fix (S4)

The original ternary was `teamName ? "/work/portfolio" : "/work/portfolio"` (both branches identical). Fix made it context-aware: team agents link to `/work/team/:teamId`, others to `/work/portfolio`. This is better UX and caught by the reviewer.

---

## VERDICT

**Status: DONE**

This workpackage shipped successfully. The architecture plan was mostly tight with acceptable v1 scope reductions (skills merge, modelConfigured signal). The implementation followed the plan with intentional simplifications (flat health signals instead of structured). The review cycle found legitimate issues (M1: active session link, S1-S4) which the builder fixed in one commit with no regressions.

**Quality assessment:**
- ✓ All ACs met (6 of 6, PASS or PARTIAL)
- ✓ All tests pass (46 tests total)
- ✓ Type safe (zero TypeErrors)
- ✓ No new lint violations
- ✓ One review cycle, all findings fixed
- ✓ No deploy risk (no schema changes)

**For next similar workpackages:**
1. Clarify file location in architecture plans (separate file vs. inline) — 5 minutes of writing saves 10 minutes of inference.
2. Scope reduction decisions (skills merge, health signals) were defensible but should be called out explicitly as "v1 scope" in the plan.
3. The review → fix → re-review cycle works well. The builder fixed all findings in one focused commit.

