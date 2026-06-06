# Variant A — Enhanced Card

## Thesis

Evolve the existing AgentCard. Same card shape, add operational data. Minimal disruption to the existing UI. The card becomes a "glanceable status report" per agent.

## User task

Team lead scans agent cards to answer: "Who needs attention?" in under 5 seconds.

## Component composition

- **Section heading:** "Agents" (text-xs font-heading uppercase, same style as "Active Bets" and "Routines")
- **Card container:** Same as current AgentCard -- `bg-[var(--surface-container)] p-[12px] rounded-[var(--r-subtle)]`
- **Row 1 (identity + status):** Avatar(sm, agent=true) | Name (13px medium, Link to profile) | Lead label | StatusChip(status) | Health dot (6px)
- **Row 2 (context):** Indented under avatar (ml-40px). If active: task name (12px tertiary, truncated). If idle: role description (12px tertiary). If error: "Last session crashed" or "High failure rate" (12px, status-error color).
- **Customize button:** Same position as today (top-right, ghost btn-sm). Existing AB3 edit dialog unchanged.

## Information hierarchy

1. **Primary:** Agent name + StatusChip (eye lands here first -- name is the anchor, chip gives immediate state)
2. **Secondary:** Health dot (6px circle, right of StatusChip or right-aligned). Green = healthy, amber = warning (degraded but not critical), red = error (high failure + crashed)
3. **Tertiary:** Row 2 context line -- task name (active), role (idle), error detail (error)

## Health dot mapping

- **Green** (--status-success): `degraded === false`
- **Amber** (--status-warning): `degraded === true` AND `failureRate7d <= 0.5` AND `!lastSessionCrashed` (only harnessAvailable is false, or idle too long)
- **Red** (--status-error): `degraded === true` AND (`failureRate7d > 0.5` OR `lastSessionCrashed`)

Note: The current `computeHealthSignals` sets `degraded = failureRate7d > 0.5 || lastSessionCrashed || !harnessAvailable`. So amber only fires when `!harnessAvailable` alone causes degraded. This is correct -- harness unavailability is a configuration concern, not a runtime failure.

## Status mapping to StatusChip

- active -> StatusChip status="healthy" (shows "HEALTHY" dot + text) -- but this is semantically odd. Better: use the StatusChip with a new mapping function that returns "healthy" for active, "paused" for idle, "error" for error.
- idle -> StatusChip status="paused" (blue dot, "PAUSED" text) -- but "PAUSED" is misleading. Idle is normal, not paused. Alternative: skip StatusChip for status, use a simpler text label.

**Decision:** Don't use StatusChip for operational status. Use plain text with color:
- Active: 12px font-medium, text-[var(--status-success)] -- "Active"
- Idle: 12px font-medium, text-[var(--text-tertiary)] -- "Idle"
- Error: 12px font-medium, text-[var(--status-error)] -- "Error"

This is simpler, denser, and avoids semantic mismatch with StatusChip's existing vocabulary.

## States

### Empty
```
EmptyState title="No agents" description="No agents are assigned to this team."
```

### Populated (3 agents: 1 active, 1 idle, 1 error)
```
AGENTS
  [Avatar] Atlas — Lead    Active  [green dot]
           Working on "Implement file upload"
  
  [Avatar] Scout           Idle    [green dot]
           Practice facilitator
  
  [Avatar] Kira            Error   [red dot]
           Last session crashed
  
  + Add agent
```

### Active agent with long task name
Task name truncates with ellipsis after one line.

## Behavior

- **Card click:** Navigate to `/agents/:agentId` (agent profile). Same as current AB3 behavior but changes from opening edit dialog to navigating to profile.
- **Card keyboard:** Enter/Space navigates to profile. Tab order: card -> Customize button -> next card.
- **Customize button click:** Opens AB3 edit dialog (unchanged). `stopPropagation` prevents navigation.
- **Card hover:** `bg-[var(--surface-elevated)]` transition (existing pattern, --motion-fast).
- **Name link click:** Navigate to profile (stopPropagation, same as today).
- **Health dot hover:** Tooltip showing health detail: "Healthy" / "Harness unavailable" / "High failure rate (83%)" / "Last session crashed". Uses native `title` attribute.

## Mobile adaptation

Cards stack vertically. Touch targets already meet 44px minimum (card is taller than 44px). No changes needed for mobile.

## Signature

The operational context line (Row 2) -- showing what the agent is doing or why it needs attention -- differentiates this from the pure-identity card. The health dot is ambient: you notice it when it's red, ignore it when green.

## Trade-offs

- **Pro:** Familiar layout, minimal code change, cards give generous touch targets
- **Con:** Cards are tall -- 3 agents take significant vertical space. With 6+ agents, the section dominates the page
- **Con:** Status as plain text (not StatusChip) breaks the "StatusChip is the single source of truth for status" principle -- but StatusChip's vocabulary doesn't map to agent operational status
