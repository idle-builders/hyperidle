# AD5 — Approved Design

## Overview

Four UI changes, all routine pattern application or deletion:

1. **Conversations blocking badge** — new badge on Conversations section header
2. **Notification settings persistence** — behavioral wiring, no visual change
3. **Cost display** — no UI change (backend fix only)
4. **Bet pause/resume removal** — delete non-functional buttons

---

## 1. Conversations Blocking Badge

### Component Composition

Reuses the exact Y4 Knowledge triage badge pattern from `Sidebar.tsx`. No new component.

The Conversations section header gains a flex wrapper (same as Knowledge section) containing:
- `SectionHeader` (existing)
- Badge `<span>` (inline markup, not a component)

### Information Hierarchy

1. Section header label "Conversations" (existing)
2. Badge count (secondary, right-aligned via `ml-auto`)

### Visual Spec

```tsx
{conversationsBlockingCount != null && conversationsBlockingCount > 0 && (
  <span
    className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[9px] font-[600] tabular-nums bg-[var(--accent-primary)] text-[var(--text-on-accent)] ml-auto mr-[12px]"
    data-testid="conversations-blocking-badge"
  >
    {conversationsBlockingCount > 99 ? "99+" : conversationsBlockingCount}
  </span>
)}
```

Identical to the Knowledge triage badge: 18px circle, 9px tabular-nums text, accent-primary background, text-on-accent foreground, pill shape.

### States

| State | Behavior |
|---|---|
| Count = 0 | Badge hidden (not rendered) |
| Count 1-99 | Badge shows numeric count |
| Count > 99 | Badge shows "99+" |
| Loading (threads not yet fetched) | Badge hidden (count defaults to 0) |
| Error (threads fetch failed) | Badge hidden (count defaults to 0) |

### Data Source

```ts
// In AppShell.tsx, alongside existing knowledgeTriageCount:
const conversationsBlockingCount = useMemo(
  () => conversationsThreads.threads.filter(t => t.hasUnresolvedReview).length,
  [conversationsThreads.threads]
);
```

The count derives from the already-fetched thread list. No additional API call.

### Reactivity

The `useConversationsThreads()` hook already re-fetches on WebSocket push events (thread updates trigger re-render via the existing WsBroadcaster subscription). No additional reactive mechanism needed.

### Props Change on Sidebar

Add `conversationsBlockingCount?: number` to `SidebarProps`. Follows the same optional-number pattern as `knowledgeTriageCount`.

### Sidebar Layout Change

The Conversations section header wraps in a flex container (same pattern as Knowledge section at line 290):

```tsx
{/* Conversations section */}
<div className="mb-[18px]" ...>
  <div className="flex items-center">
    <SectionHeader view="conversations" ... />
    {conversationsBlockingCount != null && conversationsBlockingCount > 0 && (
      <span ... data-testid="conversations-blocking-badge">
        {conversationsBlockingCount > 99 ? "99+" : conversationsBlockingCount}
      </span>
    )}
  </div>
  {/* existing thread sub-items unchanged */}
</div>
```

---

## 2. Notification Settings Persistence

### No Visual Change

The `SettingsNotifications` component already renders correctly with `Toggle` components. The only change is behavioral: connect to `useSettings` for initial values and persistence.

### Behavior Spec

1. On mount, read notification preferences from the settings data (passed as props or via hook)
2. Initialize toggle states from server data (not hardcoded defaults)
3. On each toggle change, immediately call `save()` with the updated settings object
4. No debounce — each toggle fires one PATCH (payload is tiny, server merge is idempotent)
5. On save failure, the toggle reverts to previous state (optimistic UI with rollback)

### Integration Pattern

`SettingsNotifications` receives:
- `settings: SettingsData` (initial values from useSettings)
- `onSave: (updated: SettingsData) => Promise<void>` (calls useSettings.save)

OR the component calls `useSettings()` directly (simpler, since it already needs the data).

### Key Mapping

| Toggle key | Server field |
|---|---|
| `review-requests` | `notifications.reviewAlerts` |
| `cost-alerts` | `notifications.costAlerts` |
| `blocker-notifications` | `notifications.blockerAlerts` |
| `email-digests` | Not mapped (client-only for now — no server field exists) |

The "email-digests" toggle stays local-only until an email digest feature is built. This matches the existing "State is local-only for now" comment but persists the three mapped toggles.

---

## 3. Cost Display (No UI Change)

The `WorkTeam` page already renders cost via `KeyValue` components reading from `burn.costActual`, `burn.betCostActual`, `burn.routineCostThisMonth`. The fix is entirely in the backend — populating real numbers from session cost accumulation via `teamMembers.costActual` and `bets.costActualMinor`.

The rail endpoint (`GET /api/rail`) also returns zeros for `todaySpend`/`weekSpend`. The fix: compute from `teamMembers.costActual` aggregation or from a daily spend query in the fabric layer.

No component, layout, or styling change.

---

## 4. Bet Pause/Resume Button Removal

### What Gets Deleted

From `WorkBet.tsx`:
- The "Activate" button (`data-bet-action="activate"`, line ~1118)
- The "Pause" button (`data-bet-action="pause"`, line ~1129)
- The `handleResume` function (line ~779)
- The `handleActivate` function (line ~793)
- The "pause" and "activate" cases in `handleAction` (lines ~823, ~832)
- The "pause" entry in `ConsequencePreviewDialog` (the dialog stays for "kill")
- The "pause" | "activate" entries in `BetActionKind` type (line ~298)

### What Stays

- The "Kill" button (has a working endpoint `POST /bets/:id/kill`)
- The "Adjust appetite" action (has a working PATCH endpoint)
- The consequence preview dialog (still needed for kill confirmation)
- The "resume" entry is removed (no paused state to resume from)

### Resulting BetActionKind

```ts
type BetActionKind = "kill" | "adjust-appetite" | "unblock";
```

---

## Rejected Directions

| Direction | Reason |
|---|---|
| New Badge component in design system | Two instances (Knowledge + Conversations) don't justify a component. Inline markup is simpler and avoids budget pressure. If a third badge appears, extract then. |
| Color-coded badge (red/orange/green) | Hearth uses monochrome status signals. Accent-primary is the only badge color. |
| Animated badge on count change | Zero motion budget for persistent navigation elements. |
| Debounced notification save | Over-engineering. Immediate PATCH is simpler, server is idempotent. |
| Keep pause/resume as disabled buttons with tooltip | "Buttons that don't work" is the problem the spec identifies. Disabled buttons with "coming soon" tooltips are worse than no buttons — they promise and don't deliver. |
| Add pause/resume state machine transitions | Contradicts U1 simplification. Would require schema migration, new state, all downstream consumers updated. Out of scope for a wiring workpackage. |

---

## Open Questions for Architecture

1. **Dependency unblock + session dispatch:** When `checkAndUnblockDependents` transitions a task to `accepted`, should it also dispatch a session immediately? The spec says "dispatch a session for the newly accepted task" — need to define what "dispatch" means (create session record? trigger the harness?).

2. **Rail cost computation:** Should the rail endpoint query `teamMembers.costActual` directly (one query), or should there be a dedicated fabric-layer cost aggregation service? The team detail endpoint already does this — can the rail reuse the same query pattern?

3. **Notification toggle → server field mapping:** The "email-digests" toggle has no server field. Should it be added to the `server_config` schema, or should it remain client-only?

4. **Routine scheduler config:** What `pollIntervalMs` should be used in production? The scheduler takes this as a parameter.
