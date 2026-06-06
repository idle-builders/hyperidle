# AB2 Architecture — Agent Overview in Team Work Page

## 1. Overview

AB2 surfaces agent operational status and health on the Team Work page (as dense flat rows) and per-team agent summaries on the Portfolio page. It also fires notifications when an agent transitions to error state.

**Fixed inputs (do not re-litigate):**
- Concept: `plans/AB2/concept.md` -- no new primitives; composition workpackage.
- Design: `plans/AB2/design/approved.md` -- dense flat rows (RoutineRow pattern), server-derived status.

## Required reading

The engineer must read these files before implementing:

- `packages/shared/src/team.ts` -- RosterMember, TeamDetail, TeamListItem
- `packages/shared/src/agent-profile.ts` -- AgentHealthSignals, AgentActiveSession
- `packages/server/src/routes/agent-profile.ts` -- computeHealthSignals, resolveHarnessAvailable
- `packages/server/src/routes/teams-routes.ts` -- GET /teams and GET /teams/:id handlers
- `packages/server/src/app.ts` -- route mounting, adapterPool parameter
- `packages/web/src/pages/WorkTeam.tsx` -- R3 Roster section, AgentCard, RoutineRow
- `packages/web/src/pages/WorkPortfolio.tsx` -- portfolio summary, team pills
- `packages/fabric/src/services/notifications/dispatcher.ts` -- enqueueNotification
- `packages/fabric/src/services/notifications/types.ts` -- QueueReason, NotificationSeverity
- `packages/design-system/src/StatusChip.tsx` -- Status type

---

## 2. Plan reconciliation: spec vs reality

| Spec assumption | Reality | Resolution |
|---|---|---|
| `RosterMember` has operational status fields | Missing -- only identity fields exist | Extend `RosterMember` with optional operational fields (backward compatible) |
| `TeamListItem` has agent counters | Missing -- only `routineCount` exists | Add `agentCount`, `activeAgentCount`, `agentHealthWarning` fields |
| `createTeamRoutes` has access to `adapterPool` | No -- signature is `(db, eventBus)` | Add `adapterPool` parameter to `createTeamRoutes` and update `app.ts` mount |
| `computeHealthSignals` is importable from agent-profile | Yes -- exported function | Reuse directly |
| `Button` supports `size="xs"` | No -- only `"default"` and `"sm"` | Use DaisyUI `btn btn-ghost btn-xs` class directly on the Customize button, same as existing pattern in the codebase |
| `QueueReason` includes `"agent_health_transition"` | No -- current values are `"silence" | "digest" | "flood_coalesce" | "retry"` | Add `"agent_health_transition"` to the union |
| Notification queue has deduplication by `subjectId + eventType` | No built-in dedup | Query before insert: check for pending notification with same `subjectId` + `eventType` |
| Sessions table has `agentId` index | Yes -- `sessions_agent_id_idx` | Use existing index for per-agent session queries |

---

## 3. Design-it-twice: RosterMember extension vs parallel map

### Option A: Extend RosterMember inline

Add operational fields directly to `RosterMember`:
```typescript
interface RosterMember {
  // ... existing fields
  operationalStatus: "active" | "idle" | "error";
  activeTaskTitle: string | null;
  activeTaskId: string | null;
  activeBetId: string | null;
  healthDegraded: boolean;
  healthDetail: string | null;
}
```

**Trade-off:** Simple rendering (one object per agent). But changes a shared type that 5+ test files reference. Existing tests that construct `RosterMember` fixtures break unless updated.

### Option B: Parallel `agentStatus` map in TeamDetail

```typescript
interface TeamDetail {
  // ... existing fields
  agentStatus: Record<string, AgentOperationalSummary>;
}
interface AgentOperationalSummary {
  operationalStatus: "active" | "idle" | "error";
  activeTaskTitle: string | null;
  activeTaskId: string | null;
  activeBetId: string | null;
  healthDegraded: boolean;
  healthDetail: string | null;
}
```

**Trade-off:** Cleaner type boundary. Existing tests are unaffected. But rendering requires a map lookup per agent row.

### Decision: Option A (extend RosterMember)

Rationale:
1. The map lookup in Option B is trivial but adds cognitive overhead to every consumer.
2. `RosterMember` already has `agentCategory` (AB3 extension) -- it's an established extension point.
3. The 5 test files that construct RosterMember fixtures need updating regardless (they test the team page and the data shape changed). These updates are mechanical.
4. Making fields optional (`operationalStatus?: ...`) preserves backward compatibility for any fixture that doesn't provide them. The frontend defaults missing fields to idle/healthy.

---

## 4. Type signatures

### 4a. Shared types (`packages/shared/src/team.ts`)

```typescript
/** AB2: Operational status computed from session state. */
export type AgentOperationalStatus = "active" | "idle" | "error";

/** AB2: Health indicator level for display. */
export type AgentHealthLevel = "healthy" | "warning" | "critical";

export interface RosterMember {
  agentId: string;
  name: string;
  role: string;
  isLead: boolean;
  agentCategory: string | null;
  // AB2: operational fields (optional for backward compat with pre-AB2 fixtures)
  operationalStatus?: AgentOperationalStatus;
  activeTaskTitle?: string | null;
  activeTaskId?: string | null;
  activeBetId?: string | null;
  healthLevel?: AgentHealthLevel;
  healthDetail?: string | null;
}

export interface TeamListItem extends TeamSummary {
  // ... existing fields
  routineCount: number;
  // AB2: agent summary
  agentCount: number;
  activeAgentCount: number;
  agentHealthWarning: boolean;
}
```

### 4b. Notification types (`packages/fabric/src/services/notifications/types.ts`)

```typescript
export type QueueReason = "silence" | "digest" | "flood_coalesce" | "retry" | "agent_health_transition";
```

### 4c. Agent health computation (reused)

The existing `computeHealthSignals` from `packages/server/src/routes/agent-profile.ts` is reused. A new helper derives `AgentHealthLevel` from `AgentHealthSignals`:

```typescript
// In packages/server/src/routes/agent-profile.ts (new export)
export function deriveHealthLevel(signals: AgentHealthSignals): AgentHealthLevel {
  if (!signals.degraded) return "healthy";
  if (signals.failureRate7d > 0.5 || signals.lastSessionCrashed) return "critical";
  return "warning";
}

export function deriveHealthDetail(signals: AgentHealthSignals): string {
  if (!signals.degraded) return "Healthy";
  const parts: string[] = [];
  if (signals.failureRate7d > 0.5) parts.push(`High failure rate (${Math.round(signals.failureRate7d * 100)}%)`);
  if (signals.lastSessionCrashed) parts.push("Last session crashed");
  if (!signals.harnessAvailable) parts.push("Harness unavailable");
  return parts.join(". ");
}
```

---

## 5. Server changes

### 5a. Teams routes signature change

```typescript
// packages/server/src/routes/teams-routes.ts
export function createTeamRoutes(
  db: HyperIdleDb,
  eventBus: EventBus,
  adapterPool?: AdapterPool  // AB2: added
): Hono
```

Update in `packages/server/src/app.ts`:
```typescript
api.route("/teams", createTeamRoutes(options.db, eventBus, options.adapterPool));
```

### 5b. GET /teams/:teamId — enrich roster with operational data

After building the roster array (line ~307), add a loop that fetches sessions and computes status/health for each agent:

```typescript
// For each roster member, compute operational status and health
for (const member of roster) {
  const agentSessions = await db
    .select({
      id: sessions.id,
      taskId: sessions.taskId,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      state: sessions.state,
      outcome: sessions.outcome,
    })
    .from(sessions)
    .where(eq(sessions.agentId, member.agentId))
    .orderBy(desc(sessions.startedAt));

  // Active session check
  const activeSession = agentSessions.find(s => s.state === "active") ?? null;
  
  // Resolve task title for active session
  let activeTaskTitle: string | null = null;
  let activeTaskId: string | null = null;
  let activeBetId: string | null = null;
  if (activeSession) {
    const [taskRow] = await db
      .select({ title: tasks.title, betId: tasks.betId })
      .from(tasks)
      .where(eq(tasks.id, activeSession.taskId))
      .limit(1);
    activeTaskTitle = taskRow?.title ?? null;
    activeTaskId = activeSession.taskId;
    activeBetId = taskRow?.betId ?? null;
  }

  // Health signals
  const agent = agentRows.find(a => a.id === member.agentId);
  const harnessAvailable = resolveHarnessAvailable(
    agent?.harnessType ?? null,
    adapterPool
  );
  const healthSignals = computeHealthSignals({
    sessions: agentSessions.map(s => ({
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      outcome: s.outcome,
    })),
    harnessType: agent?.harnessType ?? null,
    harnessAvailable,
  });

  // Derive operational status
  const hasActiveSess = activeSession !== null;
  const isError = healthSignals.lastSessionCrashed || healthSignals.failureRate7d > 0.5;
  member.operationalStatus = hasActiveSess ? "active" : isError ? "error" : "idle";
  member.activeTaskTitle = activeTaskTitle;
  member.activeTaskId = activeTaskId;
  member.activeBetId = activeBetId;
  member.healthLevel = deriveHealthLevel(healthSignals);
  member.healthDetail = deriveHealthDetail(healthSignals);

  // AB2: notification on error transition
  if (member.operationalStatus === "error") {
    await maybeNotifyAgentError(db, member, team.name);
  }
}
```

### 5c. GET /teams — enrich TeamListItem with agent summary

In the teams list handler, after fetching the memberGroup, add agent queries:

```typescript
// AB2: agent summary for portfolio
const teamAgents = await db
  .select({ id: users.id })
  .from(users)
  .where(and(eq(users.teamId, memberGroup.id), eq(users.kind, "ai")));

const agentCount = teamAgents.length;

// Count active agents (any agent with a session in state="active")
let activeAgentCount = 0;
let agentHealthWarning = false;

if (agentCount > 0) {
  const agentIds = teamAgents.map(a => a.id);
  // Find agents with active sessions
  for (const agentId of agentIds) {
    const [activeSess] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.agentId, agentId), eq(sessions.state, "active")))
      .limit(1);
    if (activeSess) activeAgentCount++;
  }

  // Lightweight health check: just check for any agent with recent crashes
  for (const agentId of agentIds) {
    const recentSessions = await db
      .select({ outcome: sessions.outcome, startedAt: sessions.startedAt })
      .from(sessions)
      .where(eq(sessions.agentId, agentId))
      .orderBy(desc(sessions.startedAt))
      .limit(10);
    
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).getTime();
    const recent7d = recentSessions.filter(s => 
      new Date(s.startedAt).getTime() >= sevenDaysAgo
    );
    if (recent7d.length > 0) {
      const crashedCount = recent7d.filter(s => s.outcome === "crashed").length;
      if (crashedCount / recent7d.length > 0.5) {
        agentHealthWarning = true;
        break; // one unhealthy agent is enough
      }
    }
    // Also check lastSessionCrashed
    const lastCompleted = recentSessions.find(s => s.outcome !== null);
    if (lastCompleted?.outcome === "crashed") {
      agentHealthWarning = true;
      break;
    }
  }
}

return {
  // ... existing fields
  routineCount,
  agentCount,
  activeAgentCount,
  agentHealthWarning,
};
```

### 5d. Notification throttling

```typescript
// packages/server/src/routes/teams-routes.ts (or a helper file)
async function maybeNotifyAgentError(
  db: HyperIdleDb,
  member: RosterMember,
  teamName: string
): Promise<void> {
  // Check for existing pending/sent notification for this agent
  const [existing] = await db
    .select({ id: notificationQueue.id })
    .from(notificationQueue)
    .where(
      and(
        eq(notificationQueue.eventType, "agent.health.degraded"),
        eq(notificationQueue.subjectId, member.agentId),
        eq(notificationQueue.status, "pending")
      )
    )
    .limit(1);

  if (existing) return; // throttled — already pending

  await enqueueNotification(db, {
    eventType: "agent.health.degraded",
    subjectId: member.agentId,
    severity: "blocking",
    title: `Agent ${member.name} needs attention`,
    body: `${member.name} on team ${teamName}: ${member.healthDetail ?? "Error state detected"}`,
    reason: "agent_health_transition",
    channel: null,
    now: new Date(),
  });
}
```

---

## 6. Frontend changes

### 6a. WorkTeam.tsx — Replace R3 Roster with Agents section

**Replace:** The entire R3 section (lines 368-418) and AgentCard component (lines 485-563).

**New section:** Uses `AgentRow` component matching RoutineRow pattern.

```typescript
{/* R3 — Agents (replaces Roster) */}
<section aria-label="Team agents" data-testid="team-agents">
  <div className="flex items-center mb-2">
    <h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)] flex-1">
      Agents
    </h2>
    <Button variant="ghost" size="sm" type="button"
      onClick={() => setAddDialogOpen(true)} data-testid="add-agent-btn">
      + Add agent
    </Button>
  </div>

  {/* AB3 first-time hint — same logic, moved position */}
  {hintReviewAgents.visible && roster.length > 0 && (
    <div role="status" data-testid={hintReviewAgents.testId}
      className="rounded-[var(--r-subtle)] p-[18px] flex flex-col gap-[6px] mb-[6px]"
      style={{ background: "rgba(22,118,79,0.03)" }}>
      <p className="text-[13px] text-[var(--text-secondary)] leading-[var(--leading-body)]">
        {hintReviewAgents.copy}
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" type="button" onClick={hintReviewAgents.dismiss}>
          Got it
        </Button>
      </div>
    </div>
  )}

  <div className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[12px]">
    {roster.length === 0 ? (
      <EmptyState title="No agents"
        description="No agents are assigned to this team." />
    ) : (
      roster.map((member, idx) => (
        <AgentRow key={member.agentId} member={member}
          isLast={idx === roster.length - 1}
          onNavigate={() => navigate(`/agents/${encodeURIComponent(member.agentId)}`)}
          onCustomize={() => setEditingAgentId(member.agentId)} />
      ))
    )}
  </div>
</section>
```

### 6b. AgentRow component (replaces AgentCard, in WorkTeam.tsx)

```typescript
function AgentRow({
  member, isLast, onNavigate, onCustomize,
}: {
  member: RosterMember;
  isLast: boolean;
  onNavigate: () => void;
  onCustomize: () => void;
}): JSX.Element {
  const catalogEntry = findRoleCatalogEntry(member.role);
  const description = catalogEntry?.description ?? member.role;
  const initials = member.name.slice(0, 2).toUpperCase();

  // Derive display values from operational fields (default to idle/healthy if absent)
  const status = member.operationalStatus ?? "idle";
  const healthLevel = member.healthLevel ?? "healthy";
  const healthDetail = member.healthDetail ?? "Healthy";

  // Context column: task title (active), error detail (error), role description (idle)
  let contextText = description;
  let contextIsError = false;
  if (status === "active" && member.activeTaskTitle) {
    contextText = member.activeTaskTitle;
  } else if (status === "error") {
    contextText = healthDetail;
    contextIsError = true;
  }

  // Health dot color
  const dotColor = healthLevel === "healthy"
    ? "var(--status-success)"
    : healthLevel === "warning"
      ? "var(--status-warning)"
      : "var(--status-error)";

  // Status text color
  const statusColor = status === "active"
    ? "var(--status-success)"
    : status === "error"
      ? "var(--status-error)"
      : "var(--text-tertiary)";

  return (
    <button type="button" data-testid="agent-row" onClick={onNavigate}
      className={[
        "w-full flex items-center gap-[9px] h-[36px] px-[6px]",
        "border-none bg-transparent text-left cursor-pointer",
        "transition-[background-color] duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
        "hover:bg-[rgba(44,36,26,0.02)]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]",
        !isLast ? "border-b border-[var(--border-subtle)]" : "",
      ].filter(Boolean).join(" ")}
      style={{ minHeight: "44px" }}>

      {/* Health dot */}
      <span className="w-[6px] h-[6px] rounded-full shrink-0"
        style={{ background: dotColor }} title={healthDetail} aria-hidden="true" />

      {/* Avatar */}
      <Avatar initials={initials} size="sm" agent />

      {/* Name + Lead marker */}
      <span className="flex-1 min-w-0 text-[13px] font-medium text-[var(--text-primary)] truncate">
        {member.name}
        {member.isLead && (
          <span className="ml-1 text-[var(--accent-primary)] text-[10px]"> — Lead</span>
        )}
      </span>

      {/* Status label */}
      <span className="w-[48px] shrink-0 text-[11px] font-mono truncate"
        style={{ color: statusColor }} data-testid="agent-status">
        {status}
      </span>

      {/* Context column */}
      <span className={`flex-1 min-w-0 text-[11px] truncate ${
        contextIsError ? "text-[var(--status-error)]" : "text-[var(--text-tertiary)]"
      }`} data-testid="agent-context">
        {contextText}
      </span>

      {/* Customize button */}
      <button type="button" className="btn btn-ghost btn-xs shrink-0"
        onClick={(e) => { e.stopPropagation(); onCustomize(); }}
        data-testid="agent-customize-btn">
        Customize
      </button>
    </button>
  );
}
```

### 6c. WorkPortfolio.tsx — Agent summary line + team pill health dot

Add agent summary after the routine summary in the portfolio header:

```typescript
// Aggregate agent stats across all teams
const { totalAgentCount, totalActiveAgents, anyHealthWarning } = useMemo(() => {
  let total = 0, active = 0, warning = false;
  for (const t of teams) {
    total += t.agentCount ?? 0;
    active += t.activeAgentCount ?? 0;
    if (t.agentHealthWarning) warning = true;
  }
  return { totalAgentCount: total, totalActiveAgents: active, anyHealthWarning: warning };
}, [teams]);

// In the header JSX, after routine summary:
{totalAgentCount > 0 && (
  <span data-testid="portfolio-agent-summary"
    className="text-[12px] text-[var(--text-tertiary)] inline-flex items-center gap-[6px]">
    {totalAgentCount} agent{totalAgentCount !== 1 ? "s" : ""}, {totalActiveAgents} active
    {anyHealthWarning && (
      <span className="w-[6px] h-[6px] rounded-full bg-[var(--status-error)] shrink-0"
        title="One or more agents need attention" />
    )}
  </span>
)}
```

For team pills, add agent count and health dot:

```typescript
// In the team pill button, after team name:
<span className="text-[11px] font-mono text-[var(--text-tertiary)] ml-[3px]">
  {team.agentCount ?? 0}
</span>
{team.agentHealthWarning && (
  <span className="w-[6px] h-[6px] rounded-full bg-[var(--status-error)] shrink-0 ml-[3px]"
    title="Agent needs attention" />
)}
```

---

## 7. File change manifest

### New files
None. All changes are extensions to existing files.

### Modified files

| File | Change |
|---|---|
| `packages/shared/src/team.ts` | Add `AgentOperationalStatus`, `AgentHealthLevel` types; extend `RosterMember` with optional operational fields; extend `TeamListItem` with agent summary fields |
| `packages/server/src/routes/agent-profile.ts` | Export `deriveHealthLevel`, `deriveHealthDetail` helpers |
| `packages/server/src/routes/teams-routes.ts` | Add `adapterPool` param; enrich GET /:teamId roster; enrich GET / with agent counters; add `maybeNotifyAgentError` |
| `packages/server/src/app.ts` | Pass `options.adapterPool` to `createTeamRoutes` |
| `packages/fabric/src/services/notifications/types.ts` | Add `"agent_health_transition"` to `QueueReason` |
| `packages/web/src/pages/WorkTeam.tsx` | Replace R3 Roster/AgentCard with Agents/AgentRow |
| `packages/web/src/pages/WorkPortfolio.tsx` | Add agent summary line; enhance team pills |

### Test files to create

| File | Tests |
|---|---|
| `packages/server/src/routes/__tests__/AB2-team-agents.test.ts` | GET /teams/:id roster includes operational status; health signals computed; notification enqueued on error transition; notification throttled on repeat |
| `packages/server/src/routes/__tests__/AB2-teams-list-agents.test.ts` | GET /teams includes agentCount, activeAgentCount, agentHealthWarning |
| `packages/web/src/__tests__/WorkTeam.AB2.test.tsx` | AgentRow renders active/idle/error status; health dot colors; Customize button fires; row click navigates to profile |
| `packages/web/src/__tests__/WorkPortfolio.AB2.test.tsx` | Agent summary line renders; team pill health dot shows when warning |

---

## 8. Acceptance criteria and verification

### AC1: Team page shows "Agents" section alongside Bets and Routines

**Verification:** Vitest component test (`WorkTeam.AB2.test.tsx`) -- render WorkTeam with overrideData containing a roster with 3 agents; assert `[data-testid="team-agents"]` section exists; assert section heading text is "AGENTS"; assert section appears after routines section in DOM order.

### AC2: Each agent appears with name, role, status (active/idle/error), current task, and health indicator

**Verification:** Vitest component test -- render WorkTeam with fixture data:
- Agent 1: `operationalStatus: "active"`, `activeTaskTitle: "Implement file upload"`, `healthLevel: "healthy"` -> assert row shows "active" in green, task title in context column, green health dot
- Agent 2: `operationalStatus: "idle"`, `healthLevel: "healthy"` -> assert row shows "idle" in tertiary, role description in context column
- Agent 3: `operationalStatus: "error"`, `healthLevel: "critical"`, `healthDetail: "5 of 6 sessions failed"` -> assert row shows "error" in red, error detail in context column, red health dot

### AC3: Agent cards link to agent profile on click

**Verification:** Vitest component test -- render WorkTeam, click agent row, assert `navigate` was called with `/agents/${agentId}`.

### AC4: Health computed from same signals as AB1

**Verification:** Server integration test (`AB2-team-agents.test.ts`) -- seed an agent with 5/6 crashed sessions in last 7 days, fetch GET /teams/:id, assert the roster member has `healthLevel: "critical"` and `operationalStatus: "error"`.

Verification #2: Unit test -- import `deriveHealthLevel` from `agent-profile.ts`, pass various `AgentHealthSignals` inputs, assert correct `AgentHealthLevel` output. This test goes in the existing `health-signals.test.ts` file.

### AC5: Portfolio page shows per-team agent summary

**Verification:** Vitest component test (`WorkPortfolio.AB2.test.tsx`) -- mock useTeams to return teams with `agentCount`, `activeAgentCount`, `agentHealthWarning`; assert `[data-testid="portfolio-agent-summary"]` shows correct text and health dot.

Server integration test (`AB2-teams-list-agents.test.ts`) -- seed 2 teams with agents (one healthy, one with crashed sessions), fetch GET /teams, assert `agentCount`, `activeAgentCount`, `agentHealthWarning` fields.

### AC6: Notification on error state transition

**Verification:** Server integration test (`AB2-team-agents.test.ts`) -- seed an agent with 5/6 crashed sessions, fetch GET /teams/:id (triggers health check), assert `notification_queue` table has a row with `eventType: "agent.health.degraded"` and `subjectId: agentId`.

**Throttling:** Fetch GET /teams/:id again, assert NO new notification row was created (deduplication check).

---

## 9. Ordered task list

### Task 1: Extend shared types
**Files:** `packages/shared/src/team.ts`
**Changes:** Add `AgentOperationalStatus`, `AgentHealthLevel` types. Extend `RosterMember` with optional operational fields. Extend `TeamListItem` with agent summary fields.
**Depends on:** Nothing.
**Verify:** `npm run check`

### Task 2: Export health helpers from agent-profile
**Files:** `packages/server/src/routes/agent-profile.ts`
**Changes:** Add and export `deriveHealthLevel(signals)` and `deriveHealthDetail(signals)`. Add unit tests in `health-signals.test.ts`.
**Depends on:** Task 1 (uses `AgentHealthLevel` type).
**Verify:** `npm run test -- --filter health-signals`

### Task 3: Add QueueReason variant
**Files:** `packages/fabric/src/services/notifications/types.ts`
**Changes:** Add `"agent_health_transition"` to `QueueReason` union.
**Depends on:** Nothing.
**Verify:** `npm run check`

### Task 4: Enrich GET /teams/:id with agent operational data
**Files:** `packages/server/src/routes/teams-routes.ts`, `packages/server/src/app.ts`
**Changes:**
1. Change `createTeamRoutes` signature to accept optional `adapterPool`.
2. Update `app.ts` to pass `options.adapterPool`.
3. After building roster, loop through agents to compute operational status and health using `computeHealthSignals` + `resolveHarnessAvailable` (imported from agent-profile.ts).
4. Add `maybeNotifyAgentError` function for throttled notification.
**Depends on:** Tasks 1, 2, 3.
**Verify:** New test file `AB2-team-agents.test.ts`: seed agents with various session states, assert roster members in response have correct `operationalStatus`, `healthLevel`, `healthDetail`. Assert notification enqueued on error. Assert no duplicate notification.

### Task 5: Enrich GET /teams with agent summary
**Files:** `packages/server/src/routes/teams-routes.ts`
**Changes:** In the list handler, after fetching memberGroup, query agents for each team. Count agents, active sessions, and check for degraded health.
**Depends on:** Task 4 (same file, reuses patterns).
**Verify:** New test file `AB2-teams-list-agents.test.ts`.

### Task 6: Replace R3 Roster with Agents section on team page
**Files:** `packages/web/src/pages/WorkTeam.tsx`
**Changes:**
1. Replace R3 section heading "Roster" with "Agents", move "+ Add agent" button to header (matching Routines pattern).
2. Replace `AgentCard` component with `AgentRow` component (RoutineRow-style flat rows).
3. AgentRow renders: health dot, Avatar(sm), name+lead, status label, context column, Customize button.
4. Row click navigates to `/agents/:agentId`.
5. Update hint position.
6. Update data-testid from "team-roster" to "team-agents" and "agent-card" to "agent-row".
**Depends on:** Task 1 (uses extended RosterMember fields).
**Verify:** New test file `WorkTeam.AB2.test.tsx`.

### Task 7: Add agent summary to portfolio page
**Files:** `packages/web/src/pages/WorkPortfolio.tsx`
**Changes:**
1. Add agent summary line after routine summary.
2. Enhance team pills with agent count and health dot.
**Depends on:** Task 1 (uses extended TeamListItem fields).
**Verify:** New test file `WorkPortfolio.AB2.test.tsx`.

### Task 8: Update existing test fixtures
**Files:** Various test files that construct `RosterMember` or `TeamListItem` fixtures.
**Changes:** The new fields are optional, so existing fixtures continue to work. But tests that assert on the exact shape of the response may need updating. Check all `RosterMember` and `TeamListItem` usage in test files.
**Depends on:** Tasks 6, 7.
**Verify:** `npm run test`

---

## 10. Migrations

### Renamed testids (breaking for E2E/Playwright)

| Old testid | New testid | Files affected |
|---|---|---|
| `team-roster` | `team-agents` | `WorkTeam.tsx`, `WorkTeam.AB3.test.tsx`, any Playwright E2E |
| `agent-card` | `agent-row` | `WorkTeam.tsx`, `WorkTeam.AB3.test.tsx` |
| `agent-card-name` | Removed (row click navigates) | `WorkTeam.tsx` |
| `agent-card-description` | `agent-context` | `WorkTeam.tsx` |
| `agent-card-category` | Removed (category not shown in row) | `WorkTeam.tsx` |

The builder must grep for these testids in all test files and update them.

### Import changes

`resolveHarnessAvailable` is currently not exported from `agent-profile.ts`. It needs to be exported for the teams route to use it. Alternatively, copy the 5-line function. Given the function is trivial and the teams route already imports `computeHealthSignals`, exporting is preferred.

---

## 11. Security & abuse cases

| Concern | Applicable? | Addressed |
|---|---|---|
| Rate-limit on POST/PATCH | N/A -- no new POST/PATCH endpoints | N/A |
| Input-trust boundary for agent-authored fields | N/A -- all data server-derived, no user input | N/A |
| Secret-handling for credentials | N/A -- no new credentials | N/A |
| Path-traversal | N/A -- no path inputs | N/A |
| SSRF | N/A -- no outbound URLs | N/A |
| Notification flood | Yes | Throttled via subjectId+eventType dedup check in `maybeNotifyAgentError`. At most 1 notification per agent per error state. |

---

## 12. Protected tests

```
protectedTests:
  - packages/server/src/routes/__tests__/health-signals.test.ts
  - packages/server/src/routes/__tests__/agent-profile.test.ts
```

These existing tests must not have their assertions weakened. They verify the health signal computation that AB2 reuses.

---

## 13. Risks and ambiguities

1. **Query load on GET /teams/:id.** For a team with N agents, the handler now executes N session queries + N task queries (for active sessions). For typical teams (2-6 agents), this is 4-12 additional queries. For teams with 20+ agents (unusual), this could be slow. Mitigation: sessions table has `agent_id` index. If performance is a concern post-launch, batch the session queries with `inArray(sessions.agentId, agentIds)` and group client-side.

2. **Query load on GET /teams.** The list endpoint now queries agents and their sessions for every team. For 10 teams with 5 agents each, that's 50 agent queries + health checks. Mitigation: use lightweight health check (just check for crashed sessions in last 7 days, not full health signals). Accept the cost for v1; optimize with a materialized view or caching if needed.

3. **Notification timing depends on page visits.** Health notifications only fire when someone loads the team page (GET /teams/:id). If no one visits the page, degraded agents go unnotified. This is acceptable for v1 -- the team lead is the primary actor, and they visit the team page regularly. A future workpackage could add a periodic health check worker.

4. **AgentCard -> AgentRow rename in tests.** The AB3 test file `WorkTeam.AB3.test.tsx` uses `agent-card` testid. Must be updated. This is mechanical but failure-prone if missed.
