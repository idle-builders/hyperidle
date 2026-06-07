# Variant B — Dense Row

## Thesis

Replace cards with flat table rows, matching the RoutineRow pattern from R5. Agents are infrastructure to monitor, not decision objects to inspect. The team lead scans a table, spots anomalies, drills in. Maximum density -- 6 agents fit in the space of 3 cards.

## User task

Team lead glances at the agent table to detect anomalies (red indicators, error status). If everything is green, they move on. If something is red, they click to investigate.

## Component composition

- **Section heading:** "Agents" (text-xs font-heading uppercase, with "+ Add agent" button right-aligned, matching Routines section pattern)
- **Container:** `bg-[var(--surface-container)] p-[12px] rounded-[var(--r-subtle)]` (matching Routines container)
- **Row layout per agent:** `[6px health dot] [24px avatar] [name flex-1] [status 48px] [task/role flex-1 truncate] [Customize 72px]`
- **Row height:** 36px (same as RoutineRow), min-height 44px for touch targets
- **Row separator:** Bottom `border-[var(--border-subtle)]` hairline, not on last row

## Information hierarchy

1. **Primary:** Health dot (leftmost, peripheral vision catches red before conscious scan begins)
2. **Secondary:** Agent name (13px font-medium, text-primary, flex-1, truncate)
3. **Tertiary:** Status label (11px mono, right-aligned in 48px column)
4. **Quaternary:** Current task or role (11px, text-tertiary, truncated, fills remaining space)

## Health dot

Same mapping as Variant A:
- Green (--status-success): not degraded
- Amber (--status-warning): degraded, only harness unavailable
- Red (--status-error): degraded, high failure rate or last session crashed

## Status label styling

- Active: `text-[var(--status-success)]` mono 11px
- Idle: `text-[var(--text-tertiary)]` mono 11px  
- Error: `text-[var(--status-error)]` mono 11px

## Row content by status

| Status | Name column | Status column | Task/role column |
|---|---|---|---|
| Active | "Atlas" | "active" | "Implement file upload" (task title) |
| Idle | "Scout" | "idle" | "Practice facilitator" (role description) |
| Error | "Kira" | "error" | "5/6 sessions failed" (error summary) |

## States

### Empty
```
EmptyState title="No agents" description="No agents are assigned to this team."
```
(Inside the container, matching Routines empty state pattern)

### Populated (3 agents)
```
AGENTS                                                    + Add agent
  ┌──────────────────────────────────────────────────────────────┐
  │ [green] [AT] Atlas — Lead   active   Implement file upload   │
  │─────────────────────────────────────────────────────────────│
  │ [green] [SC] Scout          idle     Practice facilitator    │
  │─────────────────────────────────────────────────────────────│
  │ [red]   [KI] Kira           error    5/6 sessions failed     │
  └──────────────────────────────────────────────────────────────┘
```

## Behavior

- **Row click:** Navigate to `/agents/:agentId`. Entire row is a `<button type="button">` (same pattern as RoutineRow).
- **Row keyboard:** Tab focuses the row button. Enter/Space navigates.
- **Row hover:** `rgba(44,36,26,0.02)` background tint (AQ-010 flat-list hover pattern, same as RoutineRow).
- **Health dot hover:** Native `title` tooltip with health detail.
- **"+ Add agent" button:** In the section header, matching the Routines "+ New routine" pattern. Opens AB3 add dialog.
- **Customize:** Removed from individual rows. Editing happens through the agent profile page (AB1 links to Settings). This simplifies the row.

Wait -- the spec says "Agent cards link to the agent profile (AB1) on click." But the existing AgentCard has a "Customize" button that opens the AB3 edit dialog. If we remove Customize from rows, users lose quick-edit access. Let me keep it as a ghost button at row end.

Revised: **Customize button** stays as a ghost btn-xs at the far right of each row, with stopPropagation. Row click navigates to profile; Customize opens edit dialog.

## Mobile adaptation

On narrow viewports (<=768px): hide the task/role column. Show only: dot + avatar + name + status. Customize button uses icon-only (gear icon). The row compresses gracefully.

## Signature

The table density. A team with 6 agents fits in ~250px vertical height. Anomaly detection is faster because the health dots form a vertical column -- a single red dot breaks the green column and draws the eye immediately. This is the "server monitoring" pattern.

## Trade-offs

- **Pro:** Maximum density. 6 agents in the space of 2.5 cards. Anomaly detection is faster.
- **Pro:** Consistent with RoutineRow pattern -- agents and routines use the same visual grammar (flat rows in a container).
- **Con:** Loses the card affordance -- agents feel less like "team members" and more like "infrastructure items."
- **Con:** Less room for the task name -- truncation happens sooner.
- **Con:** The Lead label is harder to fit in the row without adding visual noise.
