# AB1 Architecture — Agent Profile & Capabilities

## 1. Overview

AB1 adds a read-only agent profile page at `/agents/:agentId`. The page shows identity, configuration, skills, recent activity, performance aggregates, health signals, and harness capabilities.

**New files:**
- `packages/shared/src/agent-profile.ts` — wire types for the profile API response
- `packages/server/src/routes/agent-profile.ts` — GET `/api/agents/:id/profile` endpoint
- `packages/web/src/pages/AgentProfile.tsx` — the profile page component
- `packages/web/src/hooks/useAgentProfile.ts` — fetch hook

**Modified files:**
- `packages/shared/src/index.ts` — re-export new types
- `packages/server/src/app.ts` — mount new route, pass adapterPool
- `packages/server/src/routes/agents.ts` — add route factory parameter for adapterPool
- `packages/web/src/router.tsx` — add `/agents/:agentId` route
- `packages/web/src/pages/WorkTeam.tsx` — AgentCard links to profile

---

## 2. Wire Types (`packages/shared/src/agent-profile.ts`)

```typescript
import type { WireMoney } from "./types/money.js";

/** A single recent session in the agent's activity history. */
export interface AgentSessionSummary {
  readonly sessionId: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly betId: string;
  readonly outcome: string;       // "completed" | "crashed" | "stopped"
  readonly modelTier: string;
  readonly cost: WireMoney | null;
  readonly startedAt: string;     // ISO 8601
  readonly endedAt: string | null;
}

/** Aggregated performance metrics computed from all sessions. */
export interface AgentPerformanceStats {
  readonly totalSessions: number;
  readonly successCount: number;
  readonly successRate: number;    // 0-100 percentage
  readonly averageCostMinor: number | null;
  readonly averageCostCurrency: string | null;
  readonly totalCostMinor: number | null;
  readonly totalCostCurrency: string | null;
}

/** Health signal state. Each signal is either "ok" or a warning message. */
export interface AgentHealthSignals {
  /** Failure rate in last 7 days. "ok" or "High failure rate: N of M sessions failed in the last 7 days" */
  readonly failureRate7d: { status: "ok" | "warning"; message: string; rate: number; failed: number; total: number };
  /** Last session state. "ok" or "Last session crashed: {notes}" */
  readonly lastSession: { status: "ok" | "warning"; message: string };
  /** Harness availability. "ok" or "Harness type '{type}' not found in available adapters" */
  readonly harnessAvailable: { status: "ok" | "warning"; message: string };
  /** Model gateway config. "ok" or "Model tier '{tier}' has no configured provider" */
  readonly modelConfigured: { status: "ok" | "warning"; message: string };
  /** Overall: true if any signal is "warning". */
  readonly degraded: boolean;
}

/** Harness capabilities resolved from the adapter pool. */
export interface AgentHarnessCapabilities {
  readonly preCompactionTrigger: boolean;
  readonly subAgents: boolean;
  readonly mcpSupport: boolean;
  readonly modelProviders: readonly string[];
  /** Whether the harness type was found in the adapter pool. */
  readonly resolved: boolean;
}

/** Skill tool with access/usage information. */
export interface AgentSkillInfo {
  readonly skillId: string;
  readonly name: string;
  readonly description: string;
  /** "granted" if the agent has a userSkills row; "available" if accessible by role but never used. */
  readonly access: "granted" | "available";
  readonly autonomyLevel: number | null;
  readonly successCount: number;
  readonly failureCount: number;
  readonly lastUsedAt: string | null;
}

/** Active session info, present only when the agent has an active session. */
export interface AgentActiveSession {
  readonly sessionId: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly betId: string;
  readonly startedAt: string;
}

/** The full agent profile response. */
export interface AgentProfileResponse {
  readonly agent: {
    readonly id: string;
    readonly name: string;
    readonly role: string;
    readonly roleLabel: string;
    readonly roleDescription: string;
    readonly agentCategory: string | null;
    readonly teamId: string | null;
    readonly teamName: string | null;
    readonly status: string;       // "active" | "paused" | "retired"
    readonly createdAt: string;
    // Configuration
    readonly soulPrompt: string | null;
    readonly harnessType: string | null;
    readonly modelTierPreference: string | null;
    readonly maxConcurrentSessions: number;
  };
  readonly activeSession: AgentActiveSession | null;
  readonly health: AgentHealthSignals;
  readonly capabilities: AgentHarnessCapabilities;
  readonly skills: readonly AgentSkillInfo[];
  readonly recentSessions: readonly AgentSessionSummary[];
  readonly performance: AgentPerformanceStats;
}
```

### Design decisions

1. **Single response, not multiple endpoints.** The page needs all data on load. One round-trip is better than six. The response is modest in size (<10KB even with 10 sessions and soul prompt).

2. **Health signals as structured objects, not booleans.** Each signal carries status + message + detail fields. The frontend renders the message directly without computing display strings. The server owns the truth about what constitutes a health warning.

3. **Skills merge two sources.** `toolsForRole(role)` gives the set of tools accessible to the role. `userSkills` WHERE userId = :id gives usage stats for tools actually used. The response merges them: every tool from `toolsForRole` appears in the list. Tools with a `userSkills` row get `access: "granted"` and real stats; others get `access: "available"` and zero counts.

4. **Capabilities from adapter pool.** The server looks up the agent's `harnessType` in the adapter pool. If found, it reads the adapter's `getCapabilities()`. If not found (or harnessType is null), it returns a default capabilities object with `resolved: false`.

---

## 3. API Endpoint

### `GET /api/agents/:id/profile`

Mounted on the existing `/api/agents` router. The route factory signature changes to accept an optional `AdapterPool`:

```typescript
// packages/server/src/routes/agents.ts
export function createAgentRoutes(
  db: HyperIdleDb,
  adapterPool?: AdapterPool,
): Hono<HyperIdleEnv>
```

The `adapterPool` parameter is optional for backward compatibility (tests that create agent routes without a pool still work).

### Route handler pseudocode

```
GET /api/agents/:id/profile

1. Fetch user row WHERE id = :id AND kind = 'ai' AND role != 'system'
   → 404 if not found

2. Resolve role metadata from AGENT_ROLE_CATALOG

3. Fetch team name (if teamId != null):
   JOIN teamMembers ON users.teamId = teamMembers.id
   JOIN teams ON teamMembers.teamId = teams.id
   → teamName

4. Fetch active session:
   SELECT sessions.*, tasks.title, tasks.betId
   FROM sessions JOIN tasks ON sessions.taskId = tasks.id
   WHERE sessions.agentId = :id AND sessions.state = 'active'
   LIMIT 1

5. Fetch recent sessions (last 10):
   SELECT sessions.*, tasks.title, tasks.betId
   FROM sessions JOIN tasks ON sessions.taskId = tasks.id
   WHERE sessions.agentId = :id
   ORDER BY sessions.startedAt DESC
   LIMIT 10

6. Compute performance aggregates:
   SELECT
     COUNT(*) as total,
     COUNT(*) FILTER (WHERE outcome = 'completed') as successes,
     -- cost aggregates from session-level cost data
   FROM sessions WHERE agentId = :id

   Note: sessions table does not have cost columns. Cost is in SessionResult
   which is returned when a session ends but not stored on the sessions row.
   See §3.1 below for cost resolution.

7. Compute health signals:
   a. failureRate7d:
      SELECT COUNT(*) as total,
             COUNT(*) FILTER (WHERE state = 'crashed' OR outcome = 'crashed') as failed
      FROM sessions
      WHERE agentId = :id AND startedAt > (now - 7 days)

   b. lastSession:
      From step 5 (newest session). If state = 'crashed', warning.

   c. harnessAvailable:
      If agent.harnessType != null AND adapterPool exists:
        Check if pool.list() contains an adapter with type = agent.harnessType
        If not found: warning

   d. modelConfigured:
      If agent.modelTierPreference != null:
        Check factorySettings for model-gateway config
        If no provider configured for the tier: warning

8. Resolve harness capabilities:
   If agent.harnessType != null AND adapterPool exists:
     Find adapter entry matching type = agent.harnessType
     Call adapter.getCapabilities()
   Else:
     Return default { preCompactionTrigger: false, subAgents: false,
                      mcpSupport: false, modelProviders: [], resolved: false }

9. Fetch skills:
   a. Get tool definitions from toolsForRole(agent.role)
   b. Fetch userSkills WHERE userId = :id
   c. Merge: for each tool, if userSkills has a row → "granted" + stats,
      else → "available" + zero counts

10. Assemble and return AgentProfileResponse
```

### 3.1 Cost Resolution

The `sessions` table has no cost columns. Session cost is captured in `SessionResult` which is logged to the `propagationLog` or returned to the caller but not persisted on the session row.

However, `bets` has `costActualMinor` / `costActualCurrency` which aggregates across sessions. For per-session cost, we have two options:

**Option A: No per-session cost.** The activity table shows `"—"` for cost. Performance section shows only session counts and success rate, no cost aggregates. This is accurate and honest — the data does not exist at the session level in the schema today.

**Option B: Derive from bet cost.** Total cost exists at the bet level, but attributing it to individual sessions requires the session result data which is not stored.

**Decision: Option A.** Do not fake data. The `AgentSessionSummary.cost` field is `WireMoney | null`, and the server returns `null` for all sessions. The frontend renders `"—"` for null cost. Performance section omits cost aggregates (or shows "—").

This is the correct v1 behavior. A future workpackage can add cost columns to the sessions table (or a session_results table) to enable per-session cost tracking.

**Update to types:** `AgentPerformanceStats` cost fields are nullable to reflect this. The frontend handles null gracefully.

---

## 4. Frontend

### 4.1 Route Registration (`packages/web/src/router.tsx`)

```typescript
import { AgentProfile } from "./pages/AgentProfile";

// Inside buildRoutes(), after the work routes:
{ path: "agents/:agentId", element: <AgentProfile /> },
```

### 4.2 Fetch Hook (`packages/web/src/hooks/useAgentProfile.ts`)

Follows the `useTeam` pattern:

```typescript
import type { AgentProfileResponse } from "@hyperidle/shared";
import { useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

export interface UseAgentProfileResult {
  data: AgentProfileResponse | null;
  loading: boolean;
  error: Error | null;
}

export function useAgentProfile(agentId: string | undefined): UseAgentProfileResult {
  // Same pattern as useTeam: fetch on mount, cancel on unmount/id change
  // URL: /api/agents/{agentId}/profile
}
```

### 4.3 Page Component (`packages/web/src/pages/AgentProfile.tsx`)

Single file, following the WorkTeam pattern (outer component handles loading/error/empty, inner `AgentProfileLoaded` handles populated state).

```typescript
export function AgentProfile(): JSX.Element {
  const { agentId } = useParams<{ agentId: string }>();
  const { data, loading, error } = useAgentProfile(agentId);

  // Loading → SkeletonCard placeholders
  // Error → ErrorState / EmptyState (404 detection via error message)
  // Populated → <AgentProfileLoaded data={data} />
}

function AgentProfileLoaded({ data }: { data: AgentProfileResponse }): JSX.Element {
  // Renders all sections per design/approved.md
}
```

**Component decomposition within the file:**

- `AgentProfileLoaded` — main content
- `HealthBanner` — conditional warning banner (renders only when `data.health.degraded`)
- `CapabilityBadge` — single badge for a capability (supported/unsupported styling)

These are file-local functions, not exported components. They do not count against the component budget.

### 4.4 Navigation from Team Page

In `packages/web/src/pages/WorkTeam.tsx`, the `AgentCard` component currently calls `onCustomize` which opens the edit dialog. We add a second navigation target:

```typescript
// AgentCard already has an onClick that opens the edit dialog.
// We add a name/avatar click that navigates to the profile.
// The "Customize" button keeps its existing behavior.

// In AgentCard:
<Link to={`/agents/${encodeURIComponent(member.agentId)}`}
      className="text-[13px] font-medium text-[var(--text-primary)] truncate flex-1 hover:underline">
  {member.name}
</Link>
```

The agent name becomes a link to the profile. The "Customize" button still opens the edit dialog. This gives two entry points from the same card without breaking existing behavior.

### 4.5 State Handling

| State | Trigger | UI |
|---|---|---|
| Loading | `loading === true` | 4 SkeletonCard placeholders |
| Error (404) | `error.message.includes("404")` | EmptyState "Agent not found" |
| Error (other) | `error !== null` | ErrorState with message |
| Populated, healthy | `data.health.degraded === false` | No health banner, all sections |
| Populated, degraded | `data.health.degraded === true` | Health banner + all sections |
| No sessions | `data.recentSessions.length === 0` | EmptyState in Activity section |
| No skills | `data.skills.length === 0` | EmptyState in Skills section |

---

## 5. Server Implementation Detail

### 5.1 Passing AdapterPool to Agent Routes

In `packages/server/src/app.ts`, the agent routes mount currently passes only `db`:

```typescript
api.route("/agents", createAgentRoutes(options.db));
```

Change to:

```typescript
api.route("/agents", createAgentRoutes(options.db, options.adapterPool));
```

The `createAgentRoutes` function signature adds the optional second parameter. All existing routes are unaffected.

### 5.2 Adapter Pool Capabilities Resolution

Inside the profile route handler:

```typescript
function resolveCapabilities(
  harnessType: string | null,
  pool: AdapterPool | undefined,
): AgentHarnessCapabilities {
  if (!harnessType || !pool) {
    return {
      preCompactionTrigger: false,
      subAgents: false,
      mcpSupport: false,
      modelProviders: [],
      resolved: false,
    };
  }

  const adapters = pool.list();
  const match = adapters.find((a) => a.type === harnessType);

  if (!match) {
    return {
      preCompactionTrigger: false,
      subAgents: false,
      mcpSupport: false,
      modelProviders: [],
      resolved: false,
    };
  }

  // Get full capabilities from the adapter instance.
  // pool.list() returns AdapterInfo (public metadata) which does NOT include
  // HarnessCapabilities. We need access to the adapter instance.
  //
  // PROBLEM: AdapterPool.list() returns metadata, not the adapter itself.
  // The adapter instance is not exposed via list().
  //
  // SOLUTION: Add a getCapabilitiesByType(type: string) method to AdapterPool
  // that finds the first adapter matching the type and returns its capabilities.
  // This keeps the adapter instance private (no public .adapter field).

  const caps = pool.getCapabilitiesByType(harnessType);
  if (!caps) {
    return {
      preCompactionTrigger: false,
      subAgents: false,
      mcpSupport: false,
      modelProviders: match.modelProviders,
      resolved: true,
    };
  }

  return {
    preCompactionTrigger: caps.preCompactionTrigger,
    subAgents: caps.subAgents,
    mcpSupport: caps.mcpSupport,
    modelProviders: caps.modelProviders,
    resolved: true,
  };
}
```

### 5.3 New AdapterPool Method

Add to `packages/server/src/harness/adapter-pool.ts`:

```typescript
/** AB1: Look up harness capabilities by adapter type. Returns null if no adapter matches. */
getCapabilitiesByType(type: string): HarnessCapabilities | null {
  for (const entry of this.entries.values()) {
    if (entry.meta.type === type) {
      return entry.adapter.getCapabilities();
    }
  }
  return null;
}
```

### 5.4 Model Gateway Validation

For the `modelConfigured` health signal, the server checks if the agent's `modelTierPreference` has a provider configured. The model gateway config is stored in `factorySettings` with key `model_gateway_config`. The profile route reads this setting and checks if the tier has at least one provider.

```typescript
async function checkModelConfigured(
  db: HyperIdleDb,
  modelTierPreference: string | null,
): Promise<{ status: "ok" | "warning"; message: string }> {
  if (!modelTierPreference) {
    return { status: "ok", message: "Default tier (no preference set)" };
  }

  const [row] = await db
    .select({ value: factorySettings.value })
    .from(factorySettings)
    .where(eq(factorySettings.key, "model_gateway_config"))
    .limit(1);

  if (!row) {
    return {
      status: "warning",
      message: `Model tier '${modelTierPreference}' has no configured provider (no gateway config found)`,
    };
  }

  try {
    const config = JSON.parse(row.value);
    const tierConfig = config?.tiers?.[modelTierPreference];
    if (!tierConfig?.provider) {
      return {
        status: "warning",
        message: `Model tier '${modelTierPreference}' has no configured provider`,
      };
    }
    return { status: "ok", message: `${tierConfig.provider}/${tierConfig.model ?? "default"}` };
  } catch {
    return { status: "warning", message: "Invalid model gateway configuration" };
  }
}
```

---

## 6. Query Plan

The profile endpoint executes these queries (6 total, all on indexed columns):

| # | Table | Where | Index | Returns |
|---|---|---|---|---|
| 1 | `users` | `id = :id AND kind = 'ai'` | PK | 1 row |
| 2 | `teamMembers` JOIN `teams` | `teamMembers.id = users.teamId` | PK + FK | 1 row (team name) |
| 3 | `sessions` JOIN `tasks` | `sessions.agentId = :id AND sessions.state = 'active'` | `sessions_agent_id_idx` + `sessions_state_idx` | 0-1 rows |
| 4 | `sessions` JOIN `tasks` | `sessions.agentId = :id ORDER BY startedAt DESC LIMIT 10` | `sessions_agent_id_idx` | 0-10 rows |
| 5 | `sessions` (aggregate) | `sessions.agentId = :id` | `sessions_agent_id_idx` | 1 row (counts) |
| 6 | `sessions` (aggregate) | `sessions.agentId = :id AND startedAt > 7d ago` | `sessions_agent_id_idx` | 1 row (7d counts) |
| 7 | `userSkills` | `userId = :id` | PK composite `(userId, skillId)` | 0-N rows |

Queries 5 and 6 can be combined into a single query with conditional aggregates. Queries 3 and 4 could also be combined (the active session is always the newest `active` row, which would appear in the top 10). Optimization reduces to 4-5 round trips.

For <1000 sessions per agent (per constraints), all aggregates are fast index scans. No caching needed.

---

## 7. Task Ordering

### Task 1: Wire types
- Create `packages/shared/src/agent-profile.ts` with all types
- Export from `packages/shared/src/index.ts`
- Verify: `npm run check`

### Task 2: AdapterPool extension
- Add `getCapabilitiesByType()` to `AdapterPool`
- Write test for the new method
- Verify: `npm run test -- packages/server/src/harness`

### Task 3: API endpoint
- Modify `createAgentRoutes()` to accept optional `AdapterPool`
- Implement `GET /api/agents/:id/profile` handler
- Update `app.ts` to pass `adapterPool` to agent routes
- Write tests for the endpoint (happy path, 404, health signals, capabilities)
- Verify: `npm run test -- packages/server`

### Task 4: Frontend hook
- Create `useAgentProfile.ts` following `useTeam` pattern
- Verify: `npm run check`

### Task 5: Profile page
- Create `AgentProfile.tsx` with all sections per approved design
- Add route to `router.tsx`
- Handle all states (loading, error, populated, degraded)
- Verify: `npm run check`

### Task 6: Navigation wiring
- Update AgentCard in WorkTeam.tsx: agent name links to `/agents/:agentId`
- Verify clicking the name navigates (manual or E2E)

### Task 7: Integration verification
- `npm run check` (zero type errors)
- `npm run lint` (zero lint errors)
- `npm run test` (all green)
- Visual verification of the rendered page

---

## 8. Files Changed Summary

| File | Change |
|---|---|
| `packages/shared/src/agent-profile.ts` | **NEW** — wire types |
| `packages/shared/src/index.ts` | Export new types |
| `packages/server/src/harness/adapter-pool.ts` | Add `getCapabilitiesByType()` |
| `packages/server/src/routes/agents.ts` | Add optional `adapterPool` param, add profile route |
| `packages/server/src/app.ts` | Pass `adapterPool` to `createAgentRoutes()` |
| `packages/web/src/hooks/useAgentProfile.ts` | **NEW** — fetch hook |
| `packages/web/src/pages/AgentProfile.tsx` | **NEW** — profile page |
| `packages/web/src/router.tsx` | Add `/agents/:agentId` route |
| `packages/web/src/pages/WorkTeam.tsx` | AgentCard name links to profile |

---

## 9. Trade-offs

### Computed health signals vs. stored health state
**Chosen: computed on-demand.** Per the constraints, health signals are computed on-demand, not cached. For <1000 sessions, the aggregate queries are fast (<10ms on SQLite). Storing health state would add a cache invalidation problem (when does a health signal change?) without measurable performance benefit.

### Single endpoint vs. multiple endpoints
**Chosen: single endpoint.** One `GET /api/agents/:id/profile` returns everything. The alternative (separate endpoints for identity, sessions, skills, health) would require 4-6 round trips. The profile page always needs all data. The response is <10KB.

### Per-session cost: null vs. derived
**Chosen: null.** The sessions table lacks cost columns. Rather than deriving cost from bet-level aggregates (which would be inaccurate attribution), we return null and let the frontend show "—". Honest over fabricated.

### AdapterPool.getCapabilitiesByType() vs. exposing adapter instances
**Chosen: new method.** Adding a `getCapabilitiesByType()` method to AdapterPool keeps adapter instances private. The alternative (exposing a `getAdapter(type)` public method) would leak the adapter interface outside the harness package, widening the API surface.

### Route path: /agents/:id/profile vs. /agents/:id
**Chosen: /api/agents/:id/profile.** The existing `GET /api/agents` list endpoint and `PATCH /api/agents/:id` CRUD endpoint occupy the `/agents/:id` space. Adding `/profile` as a sub-resource avoids collision and makes intent clear. The frontend route is `/agents/:agentId` (no `/profile` suffix) because there is no other agent sub-page.
