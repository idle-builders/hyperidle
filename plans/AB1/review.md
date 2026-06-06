# AB1 Code Review — Agent Profile & Capabilities

**Reviewer:** Phase 4 Reviewer (same reviewer as Phase 2 design/architecture critique)
**Files reviewed:** 11 implementation files, 4 test files, 1 stories file
**Lines added:** ~4527

---

## 1. Architecture Lens

### Wire types diverge from plan

The architecture plan specified structured health signals (`{ status: "ok" | "warning"; message: string }` per signal) with four signals (failureRate7d, lastSession, harnessAvailable, modelConfigured). The implementation simplified to flat boolean/numeric fields:

- `failureRate7d: number` instead of `{ status, message, rate, failed, total }`
- `lastSessionCrashed: boolean` instead of `{ status, message }`
- `harnessAvailable: boolean` instead of `{ status, message }`
- `modelConfigured` dropped entirely
- `idleDurationMs: number | null` added (was missing from plan, per reviewer finding A3)

**Assessment:** The simplification is defensible. The plan's structured signal objects pushed display string computation to the server, but the frontend computes its own display strings anyway (the health banner in AgentProfile.tsx builds messages client-side). The flat shape is simpler and equally functional. The `modelConfigured` signal was dropped; this is an intentional scope reduction, not a bug.

### AgentProfileResponse shape differs from plan

The plan nested agent fields under an `agent` sub-object:
```
{ agent: { id, name, role, ... }, activeSession, health, capabilities, skills, recentSessions, performance }
```

The implementation flattens everything to the top level:
```
{ id, name, role, ..., activeSession, healthSignals, harnessCapabilities, skills, recentSessions, performance }
```

**Assessment:** Acceptable deviation. The flat shape is simpler and avoids one level of nesting. Both server and client agree on the shape. No cross-boundary mismatch.

### Skills merge not implemented per plan

The plan specified merging `toolsForRole(role)` (available tools) with `userSkills` (usage stats) and returning `access: "granted" | "available"`. The implementation only returns `userSkills` rows -- no catalog merge, no `access` field, no `name`/`description` fields from the catalog.

**Assessment: Should-fix.** The skills section shows only skills the agent has actually used, not the full catalog of skills available to the role. An agent with no usage history shows an empty skills table. This means AC2 ("complete operational picture") is partially weakened for the skills dimension. However, the userSkills data is the genuinely useful data (what the agent has actually done), and the catalog merge was architectural complexity that added display value but no operational value. Acceptable for v1.

### AgentActiveSession missing fields

The plan specified `taskTitle` and `betId` on `AgentActiveSession`. The implementation has only `sessionId`, `taskId`, `startedAt`. The frontend links the active session using taskId (`/work/bet/${taskId}`), which assumes taskId and betId are the same -- they are not. The link will likely 404.

**Finding: MUST-FIX (M1).** In `AgentProfile.tsx` line 205, the active session link is:
```
to={`/work/bet/${encodeURIComponent(data.activeSession.taskId)}`}
```
This navigates to `/work/bet/{taskId}` but the bet route expects a betId, not a taskId. The link is broken. Either add `betId` to `AgentActiveSession` and update the server query, or change the link to use the task route (`/work/bet/:betId/task/:taskId`) which requires both IDs.

### AdapterPool extension correct

`getCapabilitiesByType()` follows the plan exactly. The method is on AdapterPool, scans entries, returns `HarnessCapabilities | null`. The null-harnessType case (any adapter) is handled correctly. Seven unit tests cover the expected scenarios.

### Capabilities mapping uses proxy heuristics

`mapCapabilities()` in agent-profile.ts (lines 301-320) maps `HarnessCapabilities` to `AgentHarnessCapabilities`:
- `toolUse = caps.preCompactionTrigger` (proxy: "pre-compaction trigger means tool-capable")
- `fileEditing = caps.subAgents` (proxy: "sub-agents implies file editing")

**Observation:** These are heuristic mappings, not direct capability flags. The `HarnessCapabilities` type does not have a `toolUse` or `fileEditing` field. The mapping is documented via comments but is inherently imprecise. Not blocking, but worth noting for future capability system refinement.

### Layer integrity maintained

Human Interface (web) calls Meta Layer (server API) which queries Agent Runtime (adapter pool). No layer-skipping. The web package imports only from `@hyperidle/shared` (types) and `@hyperidle/design-system` (components). The server route imports from `@hyperidle/db` and `@hyperidle/shared`. Correct.

---

## 2. Design Lens

### Section order matches approved design

The approved design specifies: Breadcrumb, Health Banner (conditional), Header, Configuration, Harness Capabilities, Skills, Recent Activity, Performance. The implementation follows this order exactly (AgentProfile.tsx lines 124-384).

### Section container styling (F6 addressed)

All five sections use `rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px]` -- matching the WorkTeam pattern. The design critique flagged this ambiguity (F6). Resolved correctly.

### Health banner behavior (F2 addressed)

The banner renders only when `data.healthSignals.degraded === true` (line 136). It has `role="alert"` (line 138). The three sub-messages render conditionally based on specific signal values (lines 146-158). F2 is fully addressed.

### Settings deep-link (F1 addressed)

Link target is `/conversations?settings=open` (line 214). This matches the F1 recommendation (option c -- link to settings open, accept the section limitation). Addressed.

### Table accessibility (F4 addressed)

Skills table: `aria-label="Agent skills and usage statistics"` (line 281).
Activity table: `aria-label="Recent agent session activity"` (line 332).
Both tables have aria-labels. F4 addressed.

### Skills table overflow (F5 addressed)

Skills table is wrapped in `<div className="overflow-x-auto">` (line 277). F5 addressed.

### States handled

| State | Implemented | Evidence |
|---|---|---|
| Loading | Yes | Lines 63-69: SkeletonCard placeholders |
| Error (404) | Yes | Lines 73-84: EmptyState "Agent not found" |
| Error (other) | Yes | Lines 85-89: ErrorState with message |
| Populated, healthy | Yes | No banner, all sections |
| Populated, degraded | Yes | Lines 136-159: Health banner |
| No sessions | Yes | Line 329: "No sessions recorded." |
| No skills | Yes | Line 279: "No skill usage recorded." |
| Active session | Yes | Lines 202-210: active session link |

### Hardcoded colors

Two `oklch(0.55_0.15_25)` values (lines 177, 413) for error/crashed states. These should use `var(--status-error)` which exists in the design system. The `rgba(220, 100, 60, ...)` values in the health banner (lines 141-142) follow the same pattern as `rgba(200,60,30,...)` in WorkBet.tsx -- established precedent for tinted warning backgrounds.

**Finding: SHOULD-FIX (S1).** Replace `oklch(0.55_0.15_25)` with `var(--status-error)` in two places (lines 177 and 413). The `rgba` tints in the health banner are consistent with existing codebase patterns and acceptable.

### Stories file present

`AgentProfile.stories.tsx` covers 8 states: Healthy, WithActiveSession, Degraded, NoHistory, Loading, FetchError, NotFound, StrategyAgent. This is thorough and covers all design states plus edge cases. A4 from Phase 2 is addressed.

---

## 3. Security Lens

### Auth check

The profile endpoint is mounted behind the global auth middleware (app.ts line 334). The test confirms 401 without auth (agent-profile.test.ts line 197-200). Correct.

### Rate limiting

Covered by the global rate limiter on all `/api/*` routes (app.ts lines 247-260). No POST/PATCH on this endpoint (GET only). Adequate.

### Input validation

The `:id` parameter is used directly in a Drizzle `eq()` clause (line 150), which is parameterized. No SQL injection risk. The ID is not used in file paths or outbound URLs. No SSRF or path traversal vectors.

### Information disclosure

The endpoint returns `soulPrompt` which could be sensitive. However, the endpoint is behind auth, and the soul prompt is configuration data that the authenticated user (founder) would have access to via the settings page anyway. Acceptable.

No secrets, API keys, or tokens are returned in the response.

### XSS

The response is JSON. React auto-escapes string values when rendering. The `soulPrompt` is rendered inside a `<pre>` tag (line 243). No `dangerouslySetInnerHTML`. Safe.

---

## 4. Adversarial Lens

### N+1 query in recent sessions

`handleAgentProfile` lines 195-212: For each of the 10 recent sessions, a separate `SELECT` query fetches the task title. This is an N+1 pattern. With 10 sessions, it fires 10 extra queries.

**Finding: SHOULD-FIX (S2).** Use a single query with a JOIN or batch the task IDs into an `IN` clause. For 10 rows, performance is acceptable, but the pattern is a code quality concern.

### Date.now() called multiple times in computeHealthSignals

`Date.now()` is called at line 72 (sevenDaysAgo), line 117 (idleDurationMs), and is used via `new Date(Date.now() - ...)` in tests. Multiple `Date.now()` calls within one computation can theoretically yield different timestamps. In practice, the time delta is negligible, but for correctness the function should capture `Date.now()` once at the top.

**Observation.** Not blocking -- the time skew between calls is sub-millisecond.

### Idle duration computed from all sessions, not just 7d

`idleDurationMs` computation (lines 109-119) sorts ALL sessions by startedAt, not just 7d. This is intentional per the `@lore` comment (line 107) and is correct -- idle duration should reflect the absolute most recent session, not just the 7d window.

### Test coverage gaps

The tests do not test:
- What happens when the task for a session has been deleted (task title fallback to taskId, line 205)
- Agent with `harnessType: null` and empty adapter pool (edge case where pool.size === 0)
- Concurrent active sessions (multiple sessions with state='active' -- the handler takes the first, but the find() semantics are order-dependent on the `DESC sessions.startedAt` ordering)

**Observation.** These are edge cases, not blocking.

### Test quality assessment

The 34 integration tests and 12 unit tests are substantive. They:
- Use real database fixtures (createTestDb), not mocks
- Assert specific values, not just `toBeDefined()`
- Cover boundary conditions (50% failure rate exactly, 10-day-old sessions outside 7d window)
- Test auth rejection (401 without API key)

The E2E tests mock the API response and verify DOM structure. They cover the three primary user actions (navigate, view sections, settings link). Quality is good.

### `as Record<string, unknown>` casts in tests

The integration tests cast response bodies as `Record<string, unknown>` throughout (e.g., line 156, 207, 374, etc.). This is a test-only pattern and is acceptable -- the tests verify field existence and values through property access assertions.

---

## 5. Simplification Lens

### formatRelativeTime duplicated

`formatRelativeTime()` is defined in both `AgentProfile.tsx` (line 421) and `WorkTeam.tsx` (line 630). Both functions compute relative time strings from ISO date strings with slightly different formatting.

**Finding: SHOULD-FIX (S3).** Extract to a shared utility (e.g., `packages/web/src/utils/format-time.ts`). Two independent implementations with different formatting logic (AgentProfile omits seconds) is a maintenance burden.

### HealthSignalInput type is redundant

`HealthSignalInput` (agent-profile.ts line 43) mirrors a subset of the session row shape. The type is used only by `computeHealthSignals`. This is fine -- it enables unit testing without DB types. Not a simplification target.

### mapCapabilities helper is minimal

`mapCapabilities` (lines 301-320) is 20 lines for a direct property mapping. This is the right size for this task. No over-engineering.

### No dead code or commented-out code

No `console.log`, no `TODO: implement`, no commented-out blocks in production code. Clean.

---

## 6. Slop Lens

### Lore comments are dense but justified

The files contain 20+ `@lore` annotations. Every one of them documents a non-obvious decision (cost is null, operational vs config status, file location, idle duration scope). These are signal, not noise. The convention is established project-wide.

### Breadcrumb link is hardcoded to /work/portfolio

AgentProfile.tsx line 128-131:
```tsx
<Link
    to={data.teamName ? "/work/portfolio" : "/work/portfolio"}
    className="btn btn-ghost btn-xs"
>
```

The ternary always evaluates to the same URL. The approved design specifies: team agents link to `/work/team/{teamId}`, strategy/personal agents link to `/settings?section=agents`.

**Finding: SHOULD-FIX (S4).** The breadcrumb link is always `/work/portfolio` regardless of agent type. Per the design, it should be context-aware. The ternary is a no-op.

### No AI slop markers

- No "simplified version", "for now", "TODO: implement"
- No unnecessary async (all async functions actually await)
- No single-use helpers that should be inlined
- No `=== true` or redundant else-return patterns
- No verbose variable names or over-commenting

Clean implementation.

---

## Phase 2 Finding Verification

| Finding | Status | Evidence |
|---|---|---|
| **F1** Settings deep-link broken | ADDRESSED | AgentProfile.tsx line 214: `to="/conversations?settings=open"` |
| **F2** Health banner needs role="alert" | ADDRESSED | AgentProfile.tsx line 138: `role="alert"` |
| **F3/A3** Idle duration in health signals | ADDRESSED | agent-profile.ts type has `idleDurationMs: number \| null`, computed at lines 106-119 |
| **F4** Tables need aria-label | ADDRESSED | Lines 281, 332: both tables have `aria-label` |
| **F5** Skills table overflow-x-auto | ADDRESSED | Line 277: `<div className="overflow-x-auto">` |
| **F6** Section container styling | ADDRESSED | All sections use `bg-[var(--surface-container)] p-[18px]` |
| **A1** Profile handler in separate file | ADDRESSED | `agent-profile.ts` is a separate file, imported by `agents.ts` at line 27 |
| **A2** Operational status derived on frontend | ADDRESSED | AgentProfile.tsx lines 113-115: `isActive = activeSession !== null`, etc. |
| **A4** Stories file for AgentProfile | ADDRESSED | `AgentProfile.stories.tsx` with 8 states |
| **A5** Health signal computation unit tests | ADDRESSED | `health-signals.test.ts` with 12 tests |

All Phase 2 findings are addressed.

---

## AC Completeness Audit

| AC# | Description | Status | Evidence |
|---|---|---|---|
| AC1 | Profile accessible from team page, sidebar, org chart | PARTIAL | WorkTeam.tsx line 491: Link to `/agents/:agentId`. Router.tsx line 80: route registered. Sidebar and org chart not wired (spec scopes to team page only). |
| AC2 | Complete operational picture in one view | PASS | All sections present: identity (header), configuration (section 1), skills (section 3), recent activity (section 4), performance (section 5). Single scrollable page. |
| AC3 | Current status shown (active/idle/error with session link) | PASS with caveat | Status derived on frontend (lines 113-115). Active session link present (lines 202-210). **However, the link target uses taskId where betId is needed (M1).** |
| AC4 | Health signals surfaced with warning when degraded | PASS | Health banner (lines 136-159) with role="alert". Failure rate, last crash, harness availability shown. Idle duration in API response (not displayed in UI but available). |
| AC5 | Harness capabilities shown | PASS | Capabilities section (lines 250-265) with four badges: Tool use, MCP, File editing, Sub-agents. |
| AC6 | Profile links to Settings for editing -- read-only | PASS | "Edit in Settings" link (line 214) to `/conversations?settings=open`. No edit forms on page (E2E test at line 334 confirms zero inputs). |

---

## Summary of Findings

### Must-Fix (1)

**M1. Active session link uses wrong ID.** AgentProfile.tsx line 205: `to={/work/bet/${encodeURIComponent(data.activeSession.taskId)}}` navigates to a bet route with a task ID. This will 404. Either add `betId` to the `AgentActiveSession` type and server query, or use the task detail route `/work/bet/:betId/task/:taskId`.

### Should-Fix (4)

**S1. Hardcoded oklch color.** AgentProfile.tsx lines 177, 413: `oklch(0.55_0.15_25)` should use `var(--status-error)`.

**S2. N+1 query for task titles.** agent-profile.ts lines 195-212: each of 10 recent sessions fires a separate task title query. Use a JOIN or batch `IN` clause.

**S3. Duplicated formatRelativeTime.** AgentProfile.tsx line 421 duplicates WorkTeam.tsx line 630. Extract to shared utility.

**S4. Breadcrumb always links to /work/portfolio.** AgentProfile.tsx lines 128-131: ternary is a no-op. Should link to team page for team agents per approved design.

### Observations (3)

- O1: Wire types simplified from plan (structured signals to flat fields, no skills merge). Acceptable for v1.
- O2: Capabilities mapping uses proxy heuristics (preCompactionTrigger -> toolUse, subAgents -> fileEditing). Imprecise but functional.
- O3: `Date.now()` called multiple times in `computeHealthSignals`. Sub-millisecond skew, not blocking.

---

## Verdict (Initial): NOT DONE

**Reason:** One must-fix finding (M1) -- the active session link navigates to `/work/bet/{taskId}` which will 404 because the bet route expects a betId, not a taskId. This is a functional bug visible to users.

Once M1 is fixed, the four should-fix items are non-blocking and the workpackage can ship.

---

## Re-Review (commit f04a167c)

Builder applied all 5 findings in a single commit. Verification follows.

### M1: Active session link used wrong ID -- FIXED

- `AgentActiveSession` in `packages/shared/src/agent-profile.ts` now has `readonly betId: string` (line 29) with `@lore` annotation explaining the fix.
- Server in `packages/server/src/routes/agent-profile.ts` fetches `betId` via a `tasks` query when an active session exists (lines 191-199). Falls back to empty string when the task row is missing (`activeTaskRow?.betId ?? ""`).
- Frontend link in `packages/web/src/pages/AgentProfile.tsx` line 208 now constructs `/work/bet/${betId}/task/${taskId}` using both IDs.
- Integration test asserts `activeSession.betId === "ab1-bet-1"` (agent-profile.test.ts).
- Stories updated: `WithActiveSession` includes `betId: "bet-1"`.

**Verified. Fix is correct and tested.**

### S1: Hardcoded oklch colors -- FIXED

- Status chip (line 180): `bg-[oklch(0.55_0.15_25)]` replaced with `bg-[var(--status-error)]`.
- OutcomeChip (line 416): `text-[oklch(0.55_0.15_25)]` replaced with `text-[var(--status-error)]`.
- `grep -n oklch AgentProfile.tsx` returns zero results.

**Verified. Both instances use the semantic token.**

### S2: N+1 query for task titles -- FIXED

- The `Promise.all(recentSessionRows.map(async ...))` pattern (10 individual queries) is replaced with a single `inArray(tasks.id, taskIds)` query (lines 210-215).
- Results are collected into a `Map<id, title>` and looked up during the `.map()` (line 219).
- `inArray` imported from `drizzle-orm` (line 33).

**Verified. N+1 eliminated. One batch query regardless of session count.**

### S3: Duplicated formatRelativeTime -- FIXED

- New shared utility at `packages/web/src/utils/format-time.ts` with `@lore AB1 S3` annotation.
- `AgentProfile.tsx` imports from `../utils/format-time.js` (line 41). The local `formatRelativeTime` function removed (15 lines deleted from bottom of file).
- `WorkTeam.tsx` imports from `../utils/format-time.js` (line 51). Local definition removed (confirmed: `grep -c "function formatRelativeTime" WorkTeam.tsx` returns 0).
- `WorkTask.tsx` still has its own local definition -- this is pre-existing (not part of AB1) and acceptable.

**Verified. Single source of truth for the two files in scope.**

### S4: Breadcrumb no-op ternary -- FIXED

- `AgentProfileResponse` in shared types now includes `readonly teamId: string | null` (line 127).
- Server populates `resolvedTeamId` from the teams JOIN (lines 159-169) and includes it in the response (line 266).
- Breadcrumb link (AgentProfile.tsx line 131): `to={data.teamId ? \`/work/team/${data.teamId}\` : "/work/portfolio"}`.
- Team agents link to `/work/team/:teamId`. Non-team agents link to `/work/portfolio`.
- Stories updated: BASE_PROFILE has `teamId: "team-1"`, StrategyAgent has `teamId: null`.

**Verified. Breadcrumb is context-aware.**

### New issues introduced -- NONE

Scanned the fix diff for regressions:
- No new `any` / `as` / `!` casts.
- No new hardcoded colors.
- No dead code introduced.
- `betId` fallback to empty string (`activeTaskRow?.betId ?? ""`) is a reasonable guard against orphaned task rows; the link would be malformed but would not crash.
- The `inArray` import is correct Drizzle ORM usage.
- Stories type-check against `AgentProfileResponse` (TypeScript enforces the new `teamId` and `betId` fields).

---

## AC Completeness Audit (Updated)

| AC# | Description | Status | Evidence |
|---|---|---|---|
| AC1 | Profile accessible from team page, sidebar, org chart | PARTIAL | WorkTeam.tsx link + Router.tsx route. Sidebar/org chart not wired (spec scopes to team page). |
| AC2 | Complete operational picture in one view | PASS | All sections present in single scrollable page. |
| AC3 | Current status shown (active/idle/error with session link) | PASS | Status derived on frontend. Active session link uses correct `/work/bet/:betId/task/:taskId` route. Test asserts betId. |
| AC4 | Health signals surfaced with warning when degraded | PASS | Health banner with role="alert". Three sub-conditions shown. |
| AC5 | Harness capabilities shown | PASS | Four capability badges rendered. |
| AC6 | Profile links to Settings for editing -- read-only | PASS | "Edit in Settings" link. No edit forms on page. |

---

## Final Verdict: DONE

All 5 findings (1 must-fix, 4 should-fix) are verified fixed. No new issues introduced. The workpackage is ready for retro and ship.
