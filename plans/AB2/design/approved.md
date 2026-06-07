# AB2 Approved Design — Agent Overview in Team Work Page

## Design direction

Dense flat rows (Variant B) with Customize button from Variant A. Agents use the same visual grammar as Routines (flat table rows in a container), not the card grammar used by Bets.

---

## 1. Team page — Agents section (replaces R3 Roster)

### Section position

R3 Roster is renamed to "Agents" and keeps its current position in the page layout:
R1 (header) -> R4 (burn vs cap) -> R2 (active bets) -> R5 (routines) -> **R3 (agents)** -> L12 (artifacts)

### Section heading

```
<div class="flex items-center mb-2">
  <h2 class="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)] flex-1">
    Agents
  </h2>
  <Button variant="ghost" size="sm" onClick={openAddDialog}>
    + Add agent
  </Button>
</div>
```

Matches the Routines section heading pattern exactly (R5).

### Agent row layout

Each agent is a `<button type="button">` matching the RoutineRow pattern:

```
[6px health dot] [24px avatar (sm)] [name flex-1] [status 48px mono] [task/role flex-1 truncate] [Customize ghost btn-xs]
```

Row height: 36px, min-height: 44px (touch target).
Row hover: `rgba(44,36,26,0.02)` background tint (AQ-010).
Row separator: `border-b border-[var(--border-subtle)]` except last row.
Container: `bg-[var(--surface-container)] p-[12px] rounded-[var(--r-subtle)]`.

### Row content by agent status

| Agent status | Name column | Status column | Task/role column |
|---|---|---|---|
| Active | "{name}" + lead marker | "active" (--status-success, 11px mono) | Task title from active session |
| Idle | "{name}" + lead marker | "idle" (--text-tertiary, 11px mono) | Role description from catalog |
| Error | "{name}" + lead marker | "error" (--status-error, 11px mono) | Error detail: "{N}/{M} sessions failed" or "Last session crashed" (--status-error) |

### Health dot

6px circle, leftmost element. Three states:

| Health state | Dot color | Condition |
|---|---|---|
| Healthy | `--status-success` | `degraded === false` |
| Warning | `--status-warning` | `degraded === true` AND NOT (`failureRate7d > 0.5` OR `lastSessionCrashed`) |
| Critical | `--status-error` | `degraded === true` AND (`failureRate7d > 0.5` OR `lastSessionCrashed`) |

Tooltip (native `title`): "Healthy" / "Harness type '{type}' not available" / "High failure rate ({N}%)" / "Last session crashed"

### Name + Lead marker

- Name: 13px font-medium text-primary, flex-1, truncate
- Lead marker: " -- Lead" appended to name in 10px text-[var(--accent-primary)]
- Name is NOT a separate link (unlike Variant A). The entire row navigates to the profile on click. This avoids the nested interactive element problem.

### Customize button

- Ghost btn-xs, right-aligned, inside each row
- `onClick` with `stopPropagation` to prevent row navigation
- Opens the existing AB3 AgentEditDialog

### Row click behavior

- **Click:** Navigate to `/agents/${agentId}` (agent profile page from AB1)
- **Keyboard:** Enter/Space triggers navigation
- **Focus:** `focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]`

### Component mapping

| Element | Component | Props/variant |
|---|---|---|
| Avatar | `Avatar` | `size="sm"`, `agent=true`, `initials={name.slice(0,2)}` |
| Customize | `Button` | `variant="ghost"`, `size="xs"` (note: Button currently supports "sm", may need "xs" or use btn-xs directly) |
| Empty state | `EmptyState` | `title="No agents"`, `description="No agents are assigned to this team."` |
| Section header | Raw HTML | Matches R5 heading pattern |

### All states

**Empty:**
```
EmptyState title="No agents" description="No agents are assigned to this team."
```
Inside the container (matching routines empty pattern).

**Loading:** Handled by parent WorkTeam skeleton (SkeletonCard). No separate agent loading state.

**Populated:** Rows as described above.

**Error (fetch failure):** Handled by parent WorkTeam error state. No separate agent error state.

### First-time hint

The existing `hintReviewAgents` hint (AB3) moves from above the roster cards to above the agent row container. No change to hint logic, only position adjustment.

---

## 2. Portfolio page — Agent summary

### Position

Inline with the existing summary line in the portfolio header. After the routine summary:

```
{totalActiveRoutines} routines across {N} teams | {totalAgentCount} agents, {activeAgentCount} active [health-dot]
```

The health dot is red if ANY team has a degraded agent, green otherwise. This mirrors the routine summary pattern from AA1.

### Data shape

`TeamListItem` gains three fields:
- `agentCount: number` -- total agents on this team
- `activeAgentCount: number` -- agents with an active session
- `agentHealthWarning: boolean` -- true if any agent is degraded

The portfolio summary aggregates: `totalAgentCount = sum(t.agentCount)`, `activeAgentCount = sum(t.activeAgentCount)`, `anyHealthWarning = teams.some(t => t.agentHealthWarning)`.

### Per-team indicator

No per-team indicator in the current team pill filters or bet grid. The summary line with health dot is sufficient for the portfolio level. Per-team agent info is on the team page.

Wait -- AC5 says "The Work portfolio page shows per-team agent summary: agent count, active count, and a health indicator per team." This means per-team, not just aggregate.

Revised: Each team in the team pill filter area (or wherever teams are listed) shows an agent count badge and a health dot. Since the portfolio page shows bet cards, not team rows, and teams appear only as pills in the filter bar, the natural place is on the team pills themselves.

**Team pill enhancement:**
```
[team name] [agent-count badge "3"] [health-dot if warning]
```

The agent count badge is a small inline number (12px mono, text-tertiary). The health dot (6px) appears only when `agentHealthWarning === true`.

---

## 3. Error notification

### Trigger

When an agent transitions to error state (degraded becomes true with `failureRate7d > 0.5` or `lastSessionCrashed`), the server enqueues a notification via `enqueueNotification`.

### Notification shape

```typescript
{
  eventType: "agent.health.degraded",
  subjectId: agentId,
  severity: "blocking",
  title: `Agent ${agentName} needs attention`,
  body: `${agentName} on team ${teamName}: ${errorDetail}`,
  reason: "agent_health_transition",
  channel: null, // uses configured primary channel
  now: new Date()
}
```

### Throttling

One notification per agent per state transition. The server tracks the last-known health state for each agent. A notification fires only when the state transitions FROM non-error TO error. Repeat health checks that find the same error state do NOT re-fire.

Implementation approach: add a `lastHealthState` column or use the notification queue's `subjectId` deduplication. If the queue already has a pending notification for the same `subjectId` + `eventType`, skip.

### When does the health check run?

The health check is NOT a background job. It runs as part of the team detail endpoint response computation. When the server computes `AgentHealthSignals` for the team page response, it also checks for state transitions and enqueues notifications if needed. This keeps the system simple (no new worker, no cron) and ensures notifications fire exactly when a human looks at the page.

Alternative: run health checks in the teams list endpoint (GET /teams) so portfolio page loads also trigger checks. This ensures notifications fire even if the team lead only visits the portfolio, not individual team pages.

---

## 4. Data flow

### Team detail endpoint enhancement

`GET /api/teams/:teamId` currently returns `TeamDetail` with `roster: RosterMember[]`. AB2 extends the roster members with operational data:

```typescript
interface RosterMember {
  agentId: string;
  name: string;
  role: string;
  isLead: boolean;
  agentCategory: string | null;
  // AB2 additions:
  operationalStatus: "active" | "idle" | "error";
  activeTaskTitle: string | null;     // null when not active
  activeTaskId: string | null;        // for linking
  activeBetId: string | null;         // for linking
  healthDegraded: boolean;
  healthDetail: string | null;        // tooltip text: "Healthy" / "High failure rate (83%)" / etc.
}
```

This keeps operational status derivation on the server (not frontend) which is simpler for the team page -- the frontend just renders what the server sends. This is a departure from AB1's "frontend-derived" pattern, but the team page fetches multiple agents at once and computing health on the frontend would require N additional fetches or a batch endpoint.

### Teams list endpoint enhancement

`GET /api/teams` returns `TeamListItem[]`. AB2 adds:

```typescript
interface TeamListItem extends TeamSummary {
  // ... existing fields
  agentCount: number;
  activeAgentCount: number;
  agentHealthWarning: boolean;
}
```

---

## 5. Rejected directions

1. **Cards for agents** -- Cards are for decision objects. Agents here are monitoring targets.
2. **StatusChip for operational status** -- Vocabulary mismatch. Plain colored text is clearer.
3. **Category Tag on rows** -- Noise. Category is on the profile page.
4. **Separate Roster + Agents sections** -- Confusing duplication. One section.
5. **Frontend-derived status on team page** -- Would require N fetches or batch endpoint. Server-side derivation is simpler.
6. **Real-time WebSocket updates** -- Per spec constraint.
7. **Historical health trends** -- Per spec constraint.
8. **Removing Customize button** -- Regression from AB3.

---

## 6. Open questions for architecture

1. **Server-side health computation:** Should the team detail endpoint reuse `computeHealthSignals` from `agent-profile.ts`, or compute a lighter version? Full health signals require fetching all sessions per agent. For a team with 6 agents, that's 6 session queries. Acceptable?

2. **Notification throttling mechanism:** Use `subjectId` + `eventType` deduplication in the notification queue, or add a dedicated `agentHealthState` tracking table?

3. **Health check timing:** Team detail endpoint only, or also teams list endpoint? Former means portfolio loads don't trigger checks. Latter adds query overhead to the list endpoint.

4. **RosterMember type extension vs new type:** Extending `RosterMember` changes a shared contract. Alternative: return agent operational data in a parallel array/map alongside roster. Trade-off: simpler rendering (one object per agent) vs cleaner type boundaries.
