## 1. App Shell (Always Present)

The shell is the fixed frame around every view. Four zones, always rendered:

```
┌──────────┬──────────────┬──────────────────────────┬──────────┐
│          │              │                          │          │
│  Icon    │   Submenu    │       Main Pane          │   Rail   │
│  Rail    │  (per-view,  │    (view content)        │  (right  │
│  (left)  │  collapsible)│                          │  sidebar)│
│          │              │                          │          │
└──────────┴──────────────┴──────────────────────────┴──────────┘
```

### 1.1 IconRail

A narrow vertical strip on the far left. Always visible, never changes.

| Component | Information | Actions |
|---|---|---|
| **Logo** | HyperIdle logo at top | — |
| **View icons** (3) | Conversations, Work, Knowledge — icon + active indicator | Click to switch view; updates submenu + main pane |
| **Active view indicator** | Left border highlight on selected icon | Visual only |
| **Settings icon** | Gear icon at bottom | Click to open settings overlay |
| **User avatar** | Profile image at bottom | — |

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
| **Cost burn card** | Today spend vs. daily budget, week spend vs. weekly budget, token spend, burn-down indicator | Read-only |
| **System stability** | Active agents count, session failures, knowledge conflicts | Read-only |
| **Unread breakdown** | X blocking reviews, Y non-blocking reviews, Z chats | Click → navigate to Conversations |
| **Minimize affordance** | Arrow/chevron | Click to collapse to icon strip |
| **CoS button** | Chief of Staff access (bottom-right) | Click to open Chief of Staff overlay |

**Important:** The Rail is the only notification surface. No dedicated notification icon, bell, or top-bar toasts. The minimized Rail strip shows counts (blocked, unread, cost); the expanded panel shows details. All alert routing goes through the Rail or Conversations thread list.

### 1.3 Submenu & Main (Slots)

**Submenu** (contextual left pane, per-view): Houses thread list, product selector, scope browser, etc. Shown per view; collapsible/fixed depending on view.

**Main** (center pane): View content — review thread, portfolio overview, knowledge list, etc.

### 1.4 Settings (Overlay)

Settings opens as an overlay — the Submenu swaps to a settings nav, and the Main pane shows the active section. The Rail and IconRail dim with `pointer-events-none` but remain visible. Press Escape to close and return to the previous view.

Seven settings sections:

| Section | Information | Actions |
|---|---|---|
| **Profile** | Name, email | Edit name and email |
| **Org Chart** | Review routing edges between users/agents | Add, edit, delete routing edges (direct, function, team mechanisms) |
| **Credentials** | API keys and shared credentials | Add/remove credentials; desktop uses safeStorage, shared uses encrypted DB |
| **Notifications** | Per-type toggles (review, cost, blocker), quiet hours (HH:MM), per-product mute | Toggle on/off, set times |
| **Appearance** | Density (auto/compact/default/comfortable), theme (light/dark/system) | Select options |
| **Products** | Product list with active/archived status | Toggle active/archived |
| **Backend** | Current backend mode, desktop-only gate | View mode, switch button with restart warning |

---
