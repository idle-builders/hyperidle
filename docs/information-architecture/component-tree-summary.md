## 6. Component Tree Summary

<!-- @source packages/web/src/shell/AppShell.tsx -->

**Canonical app shell:**

```
┌───────────────────┬─────────────────────────────────────────────┐
│     Sidebar       │           Main (view content)               │
│  (200px, always)  │                                             │
└───────────────────┴─────────────────────────────────────────────┘
```

**Full tree:**

```
App Shell (Sidebar | Main)
│
├── Sidebar
│   ├── Conversations section header (+ triage badge)
│   ├── Work section header
│   ├── Knowledge section header
│   └── Settings gear
│
├── Settings (accessed via Sidebar gear)
│   ├── Notifications tab
│   ├── Budgets tab
│   ├── Agents & Permissions tab
│   ├── Cycles tab
│   └── Knowledge tab
│
├── Conversations View (Main)
│   ├── Submenu: Thread List
│   │   ├── SearchField (jump/filter)
│   │   ├── Filter bar (product, agent, type, status)
│   │   ├── Pinned: assistant ThreadRow
│   │   └── ThreadRow × N (review or chat)
│   │       ├── Sender + role
│   │       ├── Subject/summary
│   │       ├── Type indicator (review/chat)
│   │       ├── Blocking indicator
│   │       └── Timestamp
│   │
│   └── Main Pane
│       ├── Review Thread Detail
│       │   ├── ReviewHeader (approve/request changes/reject bar)
│       │   ├── Thread header
│       │   ├── Agent reasoning block
│       │   ├── ArtifactView (one of 5 shapes)
│       │   │   ├── text_diff (with diff viewer, check results)
│       │   │   ├── content_preview (rendered content, email cards, metadata)
│       │   │   ├── visual_comparison (before/after, annotations, legend, zoom)
│       │   │   ├── action_summary (summary card)
│       │   │   └── data_metrics (headline metrics, charts, insights)
│       │   ├── Conversation history (messages × N)
│       │   ├── Inline comment anchors
│       │   └── Reply input
│       │
│       ├── Chat Thread Detail
│       │   ├── Message list × N
│       │   ├── Agent reasoning (collapsible)
│       │   ├── Action buttons (start task, close, escalate)
│       │   └── Reply input
│       │
│       └── Companion Layout (for complex ArtifactView)
│           ├── Left: conversation + ReviewHeader
│           └── Right: full ArtifactView
│
├── Work View (Main)
│   ├── Submenu: Product Selector
│   │   ├── "All Products" option (→ Portfolio Overview)
│   │   └── Product list (with status dots, → Team View)
│   │
│   └── Main Pane
│       ├── Portfolio Overview (Level 1 — default)
│       │   ├── Product status cards × N
│       │   ├── Portfolio metrics bar
│       │   ├── Portfolio metrics bar (cost burn, decisions required)
│       │   └── Shipped bet summaries (cost variance per bet)
│       │
│       ├── Team View (Level 2)
│       │   ├── Canvas (top)
│       │   │   ├── Capacity indicator
│       │   │   ├── BetCard × N (committed bets)
│       │   │   └── Add bet (+) button
│       │   │
│       │   ├── Kanban (bottom)
│       │   │   ├── Planned column
│       │   │   ├── In Progress column
│       │   │   ├── Blocked column
│       │   │   ├── Done column
│       │   │   └── Dependency arcs toggle
│       │   │
│       │   └── PitchSelector (overlay, replaces Kanban)
│       │       ├── PitchCard × N
│       │       ├── Commit / Reshape / Kill buttons
│       │       └── New Pitch button + form
│       │
│       └── Bet Detail (Level 3)
│           ├── Breadcrumb
│           ├── Bet header + progress + cost
│           ├── Pitch body (rendered markdown)
│           ├── TaskCard × N (with state indicators)
│           ├── Comment thread + input
│           └── Sync action button
│
└── Knowledge View (Main)
    ├── Submenu: Scope/Topic Browser
    │   ├── Scope selector (Practice / Product / Factory)
    │   ├── Practice or Product list
    │   ├── Topic list (with health indicators)
    │   └── Quick filter links
    │
    └── Main Pane
        ├── Knowledge Item List
        │   ├── View switcher tabs (5 views)
        │   ├── Topic section headers (collapsible)
        │   ├── KnowledgeRow × N
        │   │   ├── Title + preview
        │   │   ├── Kind tag
        │   │   ├── Status tag
        │   │   └── Metadata (timestamp, access count)
        │   ├── SearchField + results
        │   ├── Bulk update button
        │   └── Curation suggestion card
        │
        └── Knowledge Item Detail/Edit
            ├── Breadcrumb
            ├── Editable title
            ├── Metadata bar
            ├── Action bar (flag, archive, move, merge, split)
            ├── Rich content body (inline edit)
            ├── Edit toolbar
            ├── Edit history
            ├── Related items sidebar
            ├── Merge modal
            └── Split modal

---
