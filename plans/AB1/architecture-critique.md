# AB1 Architecture Critique — Agent Profile & Capabilities

**Reviewer:** Phase 2 Reviewer
**Artifact reviewed:** `plans/AB1/architecture.md`

---

## Dimension Scores

### 1. AC Coverage — 8/10

The plan covers all six acceptance criteria with clear mapping:

- **AC1 (accessible from team page, sidebar, org chart):** Route `/agents/:agentId` in `router.tsx`, AgentCard link in WorkTeam. Sidebar and org chart entry points are out-of-scope (noted but not implemented). Acceptable.
- **AC2 (complete operational picture):** Single API endpoint returns all data in one response. All five data groups represented in the wire types.
- **AC3 (current status with session link):** `AgentActiveSession` type provides active session data with task title and bet ID for linking.
- **AC4 (health signals):** `AgentHealthSignals` type with four structured signal objects + `degraded` boolean. **Gap: "idle duration" and "cost trend" from the AC are not computed.** The plan acknowledges cost is null (honest). Idle duration is not mentioned in the health computation pseudocode. The `status` field on the `agent` object is the DB status ("active"/"paused"/"retired"), not the operational status ("active session"/"idle"/"error"). The frontend will need to derive the operational status from the combination of `agent.status` and `activeSession !== null`.
- **AC5 (harness capabilities):** `AgentHarnessCapabilities` type + `resolveCapabilities()` function + `getCapabilitiesByType()` method on AdapterPool.
- **AC6 (link to Settings):** Frontend concern, covered in design.

The idle duration gap is a real omission. The plan should compute "how long has this agent been idle" from the most recent session's `endedAt` timestamp. This is a straightforward query addition but it is not in the plan.

### 2. Type Safety — 9/10

The wire types in `packages/shared/src/agent-profile.ts` are comprehensive:

- All fields are `readonly` — good.
- Nullable fields are correctly typed (`WireMoney | null`, `string | null`, `number | null`).
- The `AgentHealthSignals` type uses structured objects (`{ status: "ok" | "warning"; message: string }`) rather than booleans — forces the server to own display logic. Excellent decision.
- `AgentSkillInfo.access` is `"granted" | "available"` — closed enum, not a boolean. Good.
- `AgentProfileResponse.agent.status` is typed as `string` but the DB column has an implicit closed vocabulary ("active"/"paused"/"retired"). Consider using a union type for stronger typing, though this is minor.
- The `AgentSessionSummary.outcome` field is `string` but the DB domain is "completed"/"crashed"/"stopped". Same observation.

**Verified against schema.ts:** The plan's wire types correctly reflect the `users` table columns (soulPrompt, harnessType, modelTierPreference, maxConcurrentSessions, agentCategory, status, createdAt). The `sessions` table has the columns referenced (taskId, agentId, modelTier, startedAt, endedAt, state, outcome). The `userSkills` table has the fields referenced (userId, skillId, autonomyLevel, successCount, failureCount, lastUsedAt). All correct.

### 3. API Design — 8/10

**Endpoint:** `GET /api/agents/:id/profile` — clean sub-resource pattern that avoids collision with existing `GET /api/agents/:id` (which doesn't exist, but `PATCH /api/agents/:id` and `DELETE /api/agents/:id` do). Good.

**Route mounting:** The plan says `createAgentRoutes` gets an optional `adapterPool` parameter. Verified: the current signature is `createAgentRoutes(db: HyperIdleDb)` (line 78 of agents.ts). Adding `adapterPool?: AdapterPool` is backward-compatible.

**Route registration in app.ts:** Currently `api.route("/agents", createAgentRoutes(options.db))` at line 377. The plan changes this to `createAgentRoutes(options.db, options.adapterPool)`. Verified: `options.adapterPool` exists on `AppOptions` (line 147 of app.ts). Correct.

**Concern: should the profile route be in a separate file?** The plan says the route is in `packages/server/src/routes/agent-profile.ts` (new file, per "New files" section) but then says the handler is mounted via the existing `createAgentRoutes` function in `agents.ts`. These are contradictory. The "New files" list says `agent-profile.ts`, but the pseudocode shows the handler inside the existing agent routes factory. The builder needs to decide: either put the profile route handler in a separate file and import it into `agents.ts`, or put it directly in `agents.ts` (which is simpler but makes the file larger). The plan is ambiguous.

**Error handling:** The pseudocode checks for 404 (user not found, kind != 'ai', role == 'system'). Good. No mention of rate limiting for this GET endpoint, but the global rate limiter covers all `/api/*` routes (line 248-259 of app.ts). Fine.

### 4. Query Efficiency — 8/10

The plan documents 7 queries, all on indexed columns:

| Query | Index | Verified |
|---|---|---|
| `users` by PK | PK (`id`) | Yes — `users` table has `id` as PK |
| `teamMembers` + `teams` join | PKs | Yes — `teamMembers.id` PK, `teams.id` PK |
| `sessions` by agentId + state='active' | `sessions_agent_id_idx` + `sessions_state_idx` | Yes — both indexes exist in schema.ts (lines 204-206) |
| `sessions` by agentId, ordered | `sessions_agent_id_idx` | Yes |
| `sessions` aggregate by agentId | `sessions_agent_id_idx` | Yes |
| `sessions` 7d aggregate | `sessions_agent_id_idx` | Yes |
| `userSkills` by userId | PK composite `(userId, skillId)` | Yes — composite PK in schema.ts (line 335) |

The plan correctly notes that queries 3+4 and 5+6 could be combined. 4-5 round trips for a <1000 session agent is fast.

**One concern:** The team name resolution (query 2) uses `teamMembers` JOIN `teams`. The plan says `JOIN teamMembers ON users.teamId = teamMembers.id`. Verified: `users.teamId` references `teamMembers.id` (schema.ts line 45). Then `teamMembers.teamId` references `teams.id` (schema.ts line 87). So the full join path is `users.teamId -> teamMembers.id -> teamMembers.teamId -> teams.id -> teams.name`. The plan's pseudocode is correct but the description in the query plan table is slightly simplified.

### 5. Separation of Concerns — 9/10

**Server computes, client renders.** The health signal messages are computed server-side and sent as pre-formatted strings. The client renders the message directly. The `degraded` boolean is server-computed. The capabilities resolution happens server-side via the adapter pool. Skills merge (toolsForRole + userSkills) happens server-side.

The plan correctly keeps `toolsForRole` on the server (it's in `packages/server/src/skill-tools/tool-registry.ts`, line 142 — a server package). The plan does not attempt to import it on the client.

**One small concern:** The `modelConfigured` health check reads `factorySettings` and parses JSON. This JSON parsing is wrapped in a try-catch, which is appropriate for parsing untrusted stored data. The plan handles this correctly.

### 6. Pattern Consistency — 8/10

**API pattern:** The existing agent routes use the factory pattern (`createAgentRoutes(db) -> Hono`). The plan extends this factory with an optional parameter — consistent.

**Frontend hook pattern:** The `useAgentProfile` hook follows the `useTeam` pattern exactly (useEffect + cancelled flag + apiFetch + setState). Verified against `useTeam.ts`. Correct.

**Frontend page pattern:** The `AgentProfile` page follows the WorkTeam pattern (outer component handles loading/error/empty, inner `AgentProfileLoaded` handles populated state). Verified against `WorkTeam.tsx`. Correct.

**Route registration:** Adding `{ path: "agents/:agentId", element: <AgentProfile /> }` inside the AppShell children — consistent with existing routes like `work/team/:teamId` and `work/bet/:betId`.

**Concern:** The plan lists `packages/server/src/routes/agent-profile.ts` as a new file but the existing pattern puts all agent routes in `agents.ts`. Creating a separate file for the profile route is a deviation from pattern (all other route files contain all routes for that resource). However, `agents.ts` is already 275 lines and the profile handler will add significant code. A separate file imported by the factory is defensible but should be explicitly justified.

### 7. Migration Safety — 10/10

No database migrations. No schema changes. The plan adds:
- A new method to AdapterPool (additive, no existing API changes)
- An optional parameter to `createAgentRoutes` (backward-compatible)
- A new API endpoint (additive)
- New frontend files (additive)
- A link on AgentCard (behavioral change, but the card already has click handlers)

The only behavioral change to existing code is in `WorkTeam.tsx` where AgentCard gets a name-as-link navigation. The existing `onCustomize` click handler on the card wrapper and "Customize" button are preserved — the agent name becomes a `Link` that navigates, while the rest of the card still opens the edit dialog. No existing behavior is broken.

### 8. Testability — 8/10

The plan identifies test targets:
- Task 2: AdapterPool `getCapabilitiesByType()` — unit testable in isolation
- Task 3: API endpoint — integration testable with test DB fixtures
- Task 7: Full integration verification

**Gap:** The plan does not specify mock/fixture strategy for the frontend. How will `AgentProfile.tsx` be tested? WorkTeam uses `overrideData` props for story/test injection. The plan does not mention this pattern for AgentProfile, but the builder can follow it. The plan also does not mention testing the health signal computation logic, which is the most complex server-side logic. A unit test for the health signal derivation (given sessions data, assert correct signals) would be valuable.

The plan does not mention `.stories.tsx` for the new page. Per frontend rules: "Every custom component must have a `.stories.tsx` file next to it rendering key states at `/designsystem`." AgentProfile is a page, not a custom component, but following the WorkTeam pattern (which has stories), a stories file should be created.

### 9. Simplicity — 8/10

The plan is well-scoped: 4 new files, 5 modified files, 7 ordered tasks. The single-endpoint approach avoids over-engineering. The `resolveCapabilities` function and `checkModelConfigured` function are focused and appropriately sized.

**One concern:** The `AgentHealthSignals` type is the most complex structure in the plan. Each signal has `{ status, message }` plus `failureRate7d` has additional `rate`, `failed`, `total` fields. The overall `degraded` boolean is redundant (computable from checking if any signal has status="warning"), but it saves the frontend from iterating — acceptable convenience.

**Adapter pool method:** `getCapabilitiesByType()` iterates `entries.values()` to find the first match. This is O(n) where n is the number of adapters (typically 2-5). Fine. The method returns the full `HarnessCapabilities` object, which maps 1:1 to `AgentHarnessCapabilities` except for `resolved` flag. Clean.

---

## Overall Score: 8.4/10

**Verdict: PASS.** The architecture plan is well-grounded in the actual codebase, uses correct table/column references, follows established patterns, and introduces no breaking changes. The wire types are comprehensive and correctly typed.

## Findings for the Builder

### Must-Fix (blocking)

**A1. Resolve the file location ambiguity.** The "New files" section lists `packages/server/src/routes/agent-profile.ts` but the pseudocode shows the handler mounted via `createAgentRoutes` in `agents.ts`. Decide: either a separate file (imported by the factory) or inline in `agents.ts`. Both are acceptable — just be consistent with the plan.

**A2. Derive operational status on the frontend.** The `agent.status` field from the DB is "active"/"paused"/"retired" — these are configuration statuses, not operational statuses. The AC requires showing "active (running session)", "idle", or "error". The frontend must compute operational status from `agent.status` + `activeSession !== null` + `recentSessions[0]?.outcome`. The plan does not specify this derivation.

### Should-Fix (non-blocking)

**A3. Add idle duration computation.** AC4 lists "idle duration" as a health signal. The plan computes failure rate, last session crash, harness availability, and model config — but not idle duration. Add a field to `AgentHealthSignals` (or to the agent object) indicating how long since the last session ended. This is a simple MAX(sessions.endedAt) WHERE agentId = :id query.

**A4. Create a stories file for AgentProfile.** Per frontend rules and WorkTeam precedent, `AgentProfile.stories.tsx` should render key states (loading, healthy, degraded, no sessions, no skills).

**A5. Test health signal computation.** The health signal derivation (especially failureRate7d threshold, harnessAvailable check, modelConfigured JSON parsing) is the most complex server-side logic. It deserves dedicated unit tests, not just integration tests via the HTTP endpoint.

### Observations (informational)

- The `toolsForRole` function is in `packages/server/src/skill-tools/tool-registry.ts` and accepts `UserRole` (a shared type). The plan correctly notes that the skills merge happens server-side. The profile endpoint will need to import `toolsForRole` — this is a server-internal import, no cross-package boundary issue.
- The plan's cost decision (null for all sessions) is correct and well-justified. The `sessions` table genuinely lacks cost columns (verified in schema.ts lines 185-208). `SessionResult.cost` exists as a return value but is not persisted to the sessions table.
- The `AgentProfileResponse.agent.status` uses `string` rather than a union type. The builder should consider `"active" | "paused" | "retired"` for stronger typing, though this is a wire type (external contract) where `string` provides forward compatibility.
- The `getCapabilitiesByType` method returns `HarnessCapabilities` from `@hyperidle/shared`, which includes `preCompactionTrigger`, `subAgents`, `modelProviders`, and `mcpSupport`. This matches the `AgentHarnessCapabilities` wire type exactly (minus the `resolved` flag which is added by the profile handler). Clean alignment.
