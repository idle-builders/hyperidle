# Architecture Critique: AB2

ARCHITECTURE-SCORE: 7.4/10 rounds=1 score-line: SA:8 LI:7 AC:8 DM:8 N:8 MD:8 FMC:6 S:7 V:8

## Overall Assessment

The architecture plan is well-structured for a composition workpackage. It correctly identifies that AB2 introduces no new tables or endpoints -- only extensions to existing ones. The plan reconciliation table (section 2) is the strongest section: it catches 8 reality gaps and proposes concrete resolutions. The design-it-twice on RosterMember extension (section 3) is genuine, not theatre. The ordered task list (section 9) has correct dependency ordering.

The plan passes (7.4/10) but has one significant issue in failure-mode coverage (the query explosion on GET /teams) and several warnings worth flagging for the builder.

---

## CRITICAL

None.

---

## WARNING

### W1. [plan S5c] N+1 query explosion on GET /teams list endpoint

The plan's section 5c loops through every agent in every team, issuing per-agent queries for active sessions and then per-agent queries for recent sessions to check health. For 10 teams with 5 agents each, this is:

- 10 team queries (existing)
- 10 agent-list queries (one per team)
- 50 active-session queries (one per agent)
- 50 recent-session queries (one per agent for health check)

That is 120 queries per portfolio page load, up from the current ~30. The plan acknowledges this in section 13 ("Risks and ambiguities") but marks it as "accept for v1." However, the plan also provides a lightweight health check alternative in 5c that only fetches sessions for agents with health concerns, yet the code sample still issues per-agent queries unconditionally.

**Concrete fix:** The plan should specify a batch query pattern. The sessions table has `sessions_agent_id_idx`, so `SELECT agentId, state FROM sessions WHERE agentId IN (...agentIds) AND state = 'active'` is one query instead of N. Similarly, the health check can batch: `SELECT agentId, outcome, startedAt FROM sessions WHERE agentId IN (...agentIds) ORDER BY startedAt DESC` and group client-side. The plan should either commit to batching or explicitly document why it chose N+1 for v1 with a concrete performance bound (e.g., "acceptable for teams < 10 agents; add TODO for batch optimization").

### W2. [plan S5d] `maybeNotifyAgentError` creates a cross-package dependency from teams-routes to fabric

The plan has the teams route file (`packages/server/src/routes/teams-routes.ts`) calling `enqueueNotification` from `@hyperidle/fabric`. While `packages/server` does import from `@hyperidle/fabric` (confirmed in `app.ts` and `server-factory.ts`), those imports happen at the bootstrap level, not in individual route handlers. This would be the first route-level import from fabric.

This is not a layer violation (server depends on fabric already), but it introduces a new coupling pattern. The plan's code sample in section 5d also directly queries `notificationQueue` from `@hyperidle/db` for the dedup check -- which is the existing pattern in `notifications-routes.ts`.

**Concrete fix:** The plan should document this as a deliberate decision: "teams-routes gains a new dependency on `@hyperidle/fabric/enqueueNotification` and `@hyperidle/db/notificationQueue`. This is consistent with `notifications-routes.ts` which already imports `notificationQueue` from `@hyperidle/db`." Alternatively, the plan could inject `enqueueNotification` via the route factory parameters (matching how `adapterPool` is passed in), which would keep the route handler pure.

### W3. [plan S5b] `resolveHarnessAvailable` is not exported

The plan (section 10, "Import changes") acknowledges this: "`resolveHarnessAvailable` is currently not exported from `agent-profile.ts`. It needs to be exported." However, this is not listed as a task in the ordered task list (section 9). Task 2 says "Export `deriveHealthLevel` and `deriveHealthDetail` helpers" but does not mention `resolveHarnessAvailable`.

**Concrete fix:** Task 2 should explicitly list: "Export `resolveHarnessAvailable` (currently a file-private function). Required by Task 4."

### W4. [plan S6b] Nested `<button>` in AgentRow -- invalid HTML

The architecture plan's AgentRow code sample (section 6b, lines 450-496) renders a `<button type="button">` as the row container with another `<button>` for the Customize action. This is invalid HTML. The existing `AgentCard` in `WorkTeam.tsx` (lines 498-513) deliberately uses `<div role="button">` for the outer element to avoid this exact problem, with a detailed lore comment explaining why.

This was already flagged as S4 in the design critique. The architecture plan should have caught this, since it references the existing `AgentCard` pattern. The builder must use `<div role="button">` for the outer element, not `<button>`.

**Concrete fix:** Update the code sample in section 6b to use `<div role="button" tabIndex={0}>` with `onKeyDown` for Enter/Space handling, matching the existing AgentCard pattern.

### W5. [plan S4] `AgentHealthLevel` vs design's `healthDegraded: boolean`

The approved design (section 4, "Data flow") specifies `healthDegraded: boolean` on `RosterMember`. The architecture plan (section 4a) changes this to `healthLevel?: AgentHealthLevel` where `AgentHealthLevel = "healthy" | "warning" | "critical"`. This is a better type design (more expressive, enables the three-color dot), but the deviation from the approved design is not documented.

This is fine -- the architecture plan is allowed to refine the design's data shape -- but the plan should note: "Design specifies `healthDegraded: boolean`; plan upgrades to `healthLevel: AgentHealthLevel` for three-state health dot (green/amber/red) without requiring the frontend to re-derive the level from boolean + signals."

---

## SUGGESTION

### S1. [plan S5b] Active session check could be wrong for agents with concurrent sessions

The plan's code sample checks `const activeSession = agentSessions.find(s => s.state === "active") ?? null`. An agent with `maxConcurrentSessions > 1` could have multiple active sessions. The design only shows one task title in the context column. The plan should note: "If multiple active sessions exist, the most recently started one is shown in the context column." The `agentSessions` query is already ordered by `desc(sessions.startedAt)`, so `.find()` returns the most recent -- this is correct by accident, but should be explicit.

### S2. [plan S9] Task ordering: Task 8 (fixture updates) is listed last but could be done earlier

Task 8 says "Update existing test fixtures" and depends on Tasks 6 and 7. However, since the new `RosterMember` fields are optional, existing fixtures do not need updating unless tests assert on exact response shapes. The plan correctly notes "The new fields are optional, so existing fixtures continue to work." If that is true, Task 8 is a no-op and should be documented as such, or the plan should identify which specific tests need updating.

### S3. [plan S10] Renamed testids could break Playwright E2E

The plan lists 5 testid renames (`team-roster` -> `team-agents`, `agent-card` -> `agent-row`, etc.) in section 10 and says "The builder must grep for these testids in all test files." This is good. However, the plan does not check whether these testids appear in Playwright E2E tests (in a separate `e2e/` or `tests/` directory). The plan's protected-tests list (section 12) only covers server-side tests. If Playwright tests reference `team-roster` or `agent-card`, they would break silently.

### S4. [plan S5c] Portfolio health check duplicates health logic

The GET /teams list handler (section 5c) implements its own lightweight health check by manually checking `failureRate > 0.5` and `lastSessionCrashed`. This duplicates the logic in `computeHealthSignals`. While the plan justifies this as "lightweight" (avoiding the full health signal computation for the list endpoint), it creates two locations that define what "unhealthy" means. If health thresholds change in `computeHealthSignals`, the portfolio health check would drift.

**Alternative:** Call `computeHealthSignals` with a minimal session set (last 10 sessions per agent) and read `degraded` from the result. This reuses the single source of truth. The additional computation is trivial (it is pure arithmetic on an array).

### S5. [plan S8] AC completeness -- AC4 mentions "cost trend" but the plan does not compute it

The spec says: "Health is computed from the same signals as AB1 (failure rate, cost trend, idle duration, config validity)." The plan reuses `computeHealthSignals` from AB1, which computes `failureRate7d`, `lastSessionCrashed`, `harnessAvailable`, and `idleDurationMs` -- but NOT cost trend. The AB1 `AgentHealthSignals` type has no cost field. The spec's mention of "cost trend" appears to be aspirational (it was in the spec before AB1 was implemented). The plan silently ignores this.

This is acceptable because the plan correctly reuses the same signals as AB1 (the AC says "same signals as AB1," and AB1 does not include cost trend). But the plan should note this explicitly: "Spec mentions 'cost trend' but AB1's health signals do not include cost data. AB2 reuses AB1's signals exactly; cost trend is out of scope for both."

---

## What's Working Well

1. **Plan reconciliation table (section 2) is excellent.** Eight reality gaps identified and resolved with concrete solutions. The table format makes it scannable. The "Button supports size=xs" finding is the kind of detail that saves 30 minutes of implementation debugging.

2. **Design-it-twice on RosterMember extension (section 3) is genuine.** Both options have real trade-offs articulated. The decision for Option A (inline extension) is well-reasoned: `agentCategory` already established the extension pattern, optional fields preserve backward compatibility, and the map lookup in Option B adds cognitive overhead without value. This is not straw-man analysis.

3. **Security section (section 11) is honest.** Six STRIDE concerns evaluated, five marked N/A with valid reasons (no new POST/PATCH, no user input, no credentials, no path inputs, no outbound URLs). The one applicable concern (notification flood) has a concrete mitigation (subjectId+eventType dedup). The plan does not over-engineer security for a read-only extension workpackage.

---

## Dimension Breakdown

| # | Dimension | Score | Notes |
|---|-----------|-------|-------|
| 1 | Spec Alignment | 8 | All 6 ACs mapped to tasks and verification methods. No scope creep. Minor: "cost trend" in spec AC4 is silently dropped (S5), but this follows AB1's precedent. |
| 2 | Layer Integrity | 7 | Server -> fabric import is an established pattern but the new teams-routes -> fabric dependency is a new coupling point for route handlers (W2). No layer violations. |
| 3 | API Contracts | 8 | RosterMember extension is fully specified field-by-field. TeamListItem extension is explicit. Response shapes are TypeScript interfaces. Error shapes inherit from existing endpoints (no new error cases). |
| 4 | Data Model Alignment | 8 | No new tables. Field-by-field extension of RosterMember and TeamListItem matches design. `AgentHealthLevel` type upgrade from design's boolean is an improvement (W5). `QueueReason` extension documented. |
| 5 | Naming | 8 | `AgentOperationalStatus`, `AgentHealthLevel`, `deriveHealthLevel`, `deriveHealthDetail`, `maybeNotifyAgentError` -- all names are honest and self-documenting. No generic names. `operationalStatus` correctly distinguishes from config `status`. |
| 6 | Module Depth | 8 | Two new exports from agent-profile (`deriveHealthLevel`, `deriveHealthDetail`) are proportional. `maybeNotifyAgentError` is a single-caller helper but its complexity (dedup query + enqueue) justifies extraction. No unnecessary abstractions. |
| 7 | Failure-Mode Coverage | 6 | Weakest dimension. The N+1 query issue (W1) lacks a concrete mitigation plan. Notification timing depends on page visits (acknowledged but not mitigated). No timeout specified for the per-agent session queries in the team detail handler. Missing: what happens if `computeHealthSignals` throws? The plan assumes it never does, but it processes user data (session timestamps). |
| 8 | Simplicity / Over-Engineering | 7 | Generally lean -- no feature flags, no plugin points, no abstract base classes. The dual health-check logic (full `computeHealthSignals` for team detail, manual check for team list) adds complexity without necessity (S4). The `QueueReason` type extension is minimal. |
| 9 | Verifiability | 8 | Each AC has a named test file, specific fixture data, and concrete assertions. Protected tests list is populated (health-signals.test.ts, agent-profile.test.ts). Test ordering follows red-green (tests in Tasks 4-7, implementation in same tasks). Minor: Task 8 (fixture updates) is vague about which tests need updating (S2). |

**Weighted average: 7.4/10 -- PASS (threshold: 7.0)**

---

## Verdict

The architecture plan advances to implementation. The plan is well-structured for a composition workpackage, with thorough type signatures, explicit reconciliation with codebase reality, and a genuine design-it-twice evaluation. The builder should pay special attention to:

1. **W4 (nested button):** Use `<div role="button">`, not `<button>`, for the outer AgentRow element.
2. **W1 (query batching):** Consider batch queries on GET /teams instead of per-agent loops, especially for the health check.
3. **W3 (export resolveHarnessAvailable):** Add this to Task 2's scope.
4. **S4 (deduplicate health logic):** Reuse `computeHealthSignals` in the list endpoint rather than duplicating threshold checks.
