## 1. App Shell (Always Present)

The shell is the fixed frame around every view. Four zones, always rendered:

```
┌──────────┬──────────────┬──────────────────────────┬──────────┐
│          │              │                          │          │
│  Icon    │   Submenu    │       Main Pane          │   Rail   │
│  Menu    │  (per-view,  │    (view content)        │  (right  │
│  (left)  │  collapsible)│                          │  sidebar)│
│          │              │                          │          │
└──────────┴──────────────┴──────────────────────────┴──────────┘
```

### 1.1 IconRail

A narrow vertical strip on the far left. Always visible, never changes.

| Component | Information | Actions |
|---|---|---|
| **View icons** (3) | Conversations, Work, Knowledge — icon + active indicator | Click to switch view; updates submenu + main pane |
| **Active view indicator** | Left border highlight on selected icon | Visual only |
| **User avatar** | Profile image | Click for profile/settings |

### 1.2 Rail (Right Sidebar)

Always present. Two states: minimized (icon strip) and expanded (full panel).

**Minimized strip:**

| Component | Information | Actions |
|---|---|---|
| **Blocked count icon** | Number of blocked agents/tasks | Click to expand Rail |
| **Unread count icon** | Threads needing attention | Click to navigate to Conversations |
| **Cost burn icon** | Today's spend vs. budget (e.g., "$42/$150") | Click to expand Rail |
| **Expand affordance** | Arrow/chevron | Click to expand to full panel |

**Expanded panel:**

| Component | Information | Actions |
|---|---|---|
| **Active bets list** | Per bet: title, product, progress (tasks done/total), time (week X of Y), status (on track/behind/blocked) | Click bet → navigate to Work bet detail |
| **Blocked agents list** | Per blocker: agent name, reason, duration | Click blocker → navigate to relevant Conversations thread |
| **Knowledge additions count** | New items since last Knowledge view visit | Click → navigate to Knowledge "recently created" |
| **Cost burn card** | Today spend vs. daily budget, week spend vs. weekly budget, burn-down indicator | Read-only |
| **System stability** | Active agents count, session failures, knowledge conflicts | Read-only |
| **Unread breakdown** | X blocking reviews, Y non-blocking reviews, Z chats | Click → navigate to Conversations |
| **Agent activity summary** | Active agent count, per-agent: name, current task, progress indicator | Read-only; click agent → Conversations thread |
| **Recent completions feed** | Last 3 resolved items (shipped bets, approved reviews, closed threads) | Click → navigate to relevant view |
| **Minimize affordance** | Arrow/chevron | Click to collapse to icon strip |

### 1.3 Submenu & Main (Slots)

**Submenu** (contextual left pane, per-view): Houses thread list, product selector, scope browser, etc. Shown per view; collapsible/fixed depending on view.

**Main** (center pane): View content — review thread, portfolio overview, knowledge list, etc.

### 1.4 Top Bar

| Component | Information | Actions |
|---|---|---|
| **App name** | "HyperIdle" or logo | — |
| **Global search** | Search input with ⌘K shortcut hint | Type to search across all views — results grouped by type (Threads, Bets/Tasks, Knowledge Items). ⌘K from any view. |

**Important:** The Rail is the only notification surface. No dedicated notification icon, bell, or top-bar toasts. The minimized Rail strip shows counts (blocked, unread, cost); the expanded panel shows details. All alert routing goes through the Rail or Conversations thread list.

### 1.5 Settings (accessed via user avatar)

| Component | Information | Actions |
|---|---|---|
| **Notifications tab** | Per-type toggles (review, cost, blocker), quiet hours, per-product mute | Toggle on/off |
| **Budgets tab** | Daily/weekly cost caps per agent, per team, factory-wide | Edit values |
| **Agents & Permissions tab** | Agent list, autonomy levels per skill, pause/reactivate | Edit levels, pause agent |
| **Cycles tab** | Cycle length, cool-down duration, current cycle phase | Edit values, advance cycle |
| **Knowledge tab** | Auto-archive stale threshold, conflict resolution rules, import/export | Toggle, upload, download |

---
