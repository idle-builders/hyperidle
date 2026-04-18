# Information Architecture & Component Tree

What information lives where, which components render it, and how the user navigates between them. Derived from the Stitch design mockups and the architecture docs.

This document serves three purposes: (1) define every component the app needs, (2) map what information each component shows, (3) trace the user journeys through the screens.

---

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

## 2. Conversations View

**Purpose:** Messaging and reviews. The founder spends ~90% of their time here.

**Shell structure:** IconRail | Submenu (Thread List) | Main (Review or Chat Thread Detail) | Rail.

### 2.1 Submenu (Thread List)

The founder's inbox. Answers: "What needs me right now?"

| Component | Information | Actions |
|---|---|---|
| **Search/jump bar** | Input with "Jump to..." placeholder | Type to filter threads |
| **Filter bar** | Filters: product, agent, type (review/chat), status (blocking/open/snoozed/resolved) | Click filters; multi-select; clear all |
| **Pinned section header** | "Pinned" label | — |
| **Chief of Staff thread item** | Name, first-line preview, unread badge | Click to open thread |
| **Active threads section header** | "Active Threads" label | — |
| **Thread list item (review)** | Sender (agent name + role), product tag, subject line, timestamp, review indicator, blocking indicator (if agent paused), estimated review time | Click to open in main pane |
| **Thread list item (chat)** | Sender, subject line, timestamp | Click to open in main pane |
| **Thread state actions** | — | Right-click or swipe: Snooze (with timer), Archive, Mute |
| **Estimated review time** | Agent-estimated complexity tag ("~2 min", "~15 min") shown on each thread item | Read-only; helps triage |
| **Bulk actions button** | — | Click to show batch operations (approve-similar, snooze-all, mark-read) |

**Ordering:** Chief of Staff pinned at top → blocking reviews → non-blocking reviews → chats → resolved.

### 2.2 Main Pane: Review Thread Detail

A review thread = reasoning → artifact → verdict. The structure is always the same; the ArtifactView varies by shape.

| Component | Information | Actions |
|---|---|---|
| **Thread header** | Thread title, agent name, timestamp, thread type badge | — |
| **Agent reasoning block** | Agent's explanation of why this action is proposed. Always visible, always first. Confidence indicator (e.g., 'High confidence' / '62% confident'). | Collapsible (but expanded by default) |
| **ArtifactView** | Content varies by type (text_diff, content_preview, visual_comparison, action_summary, data_metrics) — see §2.3 | Inline comments, scroll, zoom |
| **Conversation history** | Chronological messages: agent proposal, founder comments, agent revisions. Each: sender, avatar, timestamp, content | Reply |
| **Verdict action bar** | Primary: Approve, Request Changes, Reject, Snooze. Overflow menu (⋮): Edit, Escalate, Delegate, Comment Only | Click primary button or use keyboard shortcuts (A, R, X, S). Overflow for less-common actions. |
| **Linked threads indicator** | Related threads addressing the same issue (e.g., hardware change + firmware workaround) | Click to navigate to linked thread |
| **Inline comment input** | Text input on specific artifact parts (diff lines, paragraphs, plan steps) | Type and submit |
| **Comment input** | Thread-level reply input at bottom | Type and send |

### 2.3 ArtifactView Shapes (5 types)

Each review thread carries exactly one ArtifactView shape:

**text_diff** (code, config, schemas, hardware design files):

| Component | Information | Actions |
|---|---|---|
| **File header** | File path, change summary | — |
| **Diff viewer** | Side-by-side or inline: line numbers, additions (green), deletions (red), context lines | Inline comment on specific lines |
| **Check results** | Tests passed/failed, lint, security scan, DRC results | Read-only |

**content_preview** (blog posts, emails, CRM sequences, product manuals):

| Component | Information | Actions |
|---|---|---|
| **Rendered output** | Content as the reader will see it — formatted text, not markdown source | Inline comment on paragraphs |
| **Email sequence cards** | Per email: subject, body preview, send timing, audience segment, sentiment tag | Expand individual emails |
| **Metadata sidebar** | Word count, target audience, publish date, SEO keywords | Read-only |

**visual_comparison** (UI mockups, CAD renders, PCB layouts, enclosure designs):

| Component | Information | Actions |
|---|---|---|
| **Before/after viewer** | Side-by-side images with labels (Rev B / Rev C) | Drag slider to compare |
| **Annotation overlays** | Numbered circles/rectangles highlighting changed regions | Hover for callout detail |
| **Annotation legend** | Numbered list of changes with descriptions | Scroll, click to highlight |
| **Zoom controls** | Current zoom level, zoom in/out | Click/scroll to zoom |

**action_summary** (deploys, ops changes, procurement, vendor config):

| Component | Information | Actions |
|---|---|---|
| **Summary card** | What's changing, why, expected impact, rollback plan, checks passed, timeline, cost | Read-only; comment on whole proposal |

**data_metrics** (performance reports, A/B tests, acoustic measurements):

| Component | Information | Actions |
|---|---|---|
| **Headline metrics** | Key numbers with trend indicators (up/down arrows) | — |
| **Charts** | Line, bar, frequency response — inline SVG with axis labels, legend | Hover for values; export button |
| **Narrative insights** | Agent's text analysis of the data | Inline comment |
| **Recommendations** | Agent's proposed next actions | Comment on specific recommendations |

### 2.4 ReviewHeader & Companion Layout (Complex Artifacts)

**ReviewHeader:** The approve/request-changes/reject bar that anchors the verdict actions.

When an ArtifactView is complex, the main pane splits into companion layout:

| Zone | Content |
|---|---|
| **Left: conversation** | Thread messages, reasoning, ReviewHeader (verdict actions) |
| **Right: artifact** | Full ArtifactView (multi-file diff, full page preview, detailed dashboard, PCB layout) |
| **Toggle** | Button to switch between inline and companion layout |

### 2.5 Chat Thread Detail

| Component | Information | Actions |
|---|---|---|
| **Message list** | Chronological messages, each with sender avatar, name, timestamp, content | Scroll |
| **Agent reasoning** | Collapsible reasoning on agent messages | Expand/collapse |
| **Reply input** | Text input at bottom | Type and send |
| **Action buttons** | Start a task, Close, Escalate | Click |

---

## 3. Work View

**Purpose:** Planning and tracking. The Linear/Jira of the factory.

**Shell structure:** IconRail | Submenu (Product Selector) | Main (Portfolio Overview → Team View → Bet Detail) | Rail.

Three levels of depth: Portfolio → Team → Bet. The submenu always shows the product list; the main pane drills down.

### 3.1 Submenu (Product Selector)

| Component | Information | Actions |
|---|---|---|
| **Product selector** | List of products (Ambrovia, Nimmly, HyperIdle, Pulse) with status dot | Click to open Team View for that product |
| **"All products" option** | Portfolio-level overview | Click to show Portfolio Overview (default landing) |

### 3.2 Portfolio Overview (Level 1 — default, in Main)

The landing screen when Work is opened. High-level view across all products.

| Component | Information | Actions |
|---|---|---|
| **Portfolio header** | Title, cycle phase indicator (Shaping / Betting / Building / Cool-down), export button | Export report |
| **Product status card** | Product name, lead avatar, status (operational/shipping/decisions pending), active bets count, shipped count, velocity sparkline | Click to drill into Team View for that product |
| **Portfolio metrics bar** | Global shipping velocity, active bet count, decisions required | Read-only KPIs |
| **Cycle management card** | Current cycle number, phase, days remaining, advance cycle button | Advance to next phase (with confirmation); archives expired pitches |
| **Past cycle summaries** | Per cycle: bets shipped, bets killed, total cost, velocity trend, cost variance (appetite vs. actual) | Click to expand; compare across cycles |

### 3.3 Team View (Level 2, in Main)

Accessed by clicking a product card in Portfolio Overview, or selecting a product in the submenu. Shows two areas: the Canvas (which bets exist) and the Kanban (what's happening across all current bets).

**Canvas (top):**

| Component | Information | Actions |
|---|---|---|
| **Canvas header** | Product name, cycle label, capacity indicator (e.g., "2/3 committed"), hard limit label | — |
| **BetCard** (× N) | Per committed bet: title, appetite, status badge (on-track / behind / blocked / paused), progress bar (tasks done/total), week X of Y, cost | Click to drill into Bet Detail |
| **Add bet button (+)** | — | Opens PitchSelector overlay (replaces Kanban — see §3.3a) |
| **No-backlog indicator** | "Pitches expire after 2 cycles" | Read-only |

**Kanban (bottom):**

| Component | Information | Actions |
|---|---|---|
| **Kanban header** | "Tasks across current bets" | — |
| **Planned column** | Tasks in waiting/accepted state: title, owner agent, parent bet tag | Click task → open in Bet Detail or Conversations thread |
| **In Progress column** | Tasks in in-progress state: title, owner, progress indicator, session count | Click task |
| **Blocked column** | Tasks in blocked state: title, owner, blocker reason, duration blocked, red indicator | Click task → Conversations thread |
| **Done column** | Tasks in done state (current cycle): title, owner, completion time, cost | Click task |
| **Dependency arcs toggle** | Visual lines connecting dependent tasks across bets | Toggle on/off; hover for dependency detail |

**§3.3a PitchSelector (overlay, replaces Kanban when active):**

Triggered by clicking the **Add bet (+)** button on the Canvas. Shows available shaped pitches that can be committed.

| Component | Information | Actions |
|---|---|---|
| **PitchSelector header** | "Available Pitches" label, count, capacity remaining | — |
| **PitchCard** (× N) | Title, appetite (1w/2w/6w), summary, shaper avatar | Click to expand full pitch (problem, solution, rabbit holes, done condition) |
| **Commit button** | On each PitchCard | Click to commit pitch → becomes a BetCard on the Canvas; PitchSelector closes |
| **Reshape button** | On each PitchCard | Returns pitch for reshaping |
| **Kill button** | On each PitchCard | Removes pitch permanently |
| **New Pitch button** | — | Opens pitch creation form (title, appetite, problem, solution sketch, rabbit holes, done condition) → saves as shaped pitch |
| **Close** | — | Dismiss overlay, return to Kanban |

### 3.4 Bet Detail (Level 3, in Main)

Accessed by clicking a BetCard in the Team View. Breadcrumb returns to Team View.

| Component | Information | Actions |
|---|---|---|
| **Breadcrumb** | Work → [Product] → [Bet title] | Click to return to Team View |
| **Bet header** | Title, ID, product, appetite, status badge, extended status (on-track / behind / blocked / paused / shipped / killed), cycle, progress indicator | — |
| **Progress card** | Percentage complete, visual bar, estimated completion | Read-only |
| **Cost card** | Total cost, burn rate | Read-only |
| **Pitch body** | Full markdown: problem statement, solution sketch, rabbit holes, done condition | Read-only rendered prose |
| **TaskCard rows** (× N) | Per task: title, owner (agent name), state (planned/in progress/done/blocked), dependency, sessions, cost | Click task → open thread in Conversations; Flag for PM |
| **Task state indicator** | Colored dot + label (pulsing for in-progress, solid for done, red for blocked) | — |
| **Comment thread** | Chronological: sender, avatar, timestamp, message | Reply |
| **Comment input** | Text area with "Add a comment..." placeholder | Type and send |
| **Sync action button** | — | Opens modal: add note, flag blocker, request scope reduction, pause bet, kill bet. Creates comment thread entry. |

---

## 4. Knowledge View

**Purpose:** The company's wiki. Agent-free curation.

**Shell structure:** IconRail | Submenu (Scope & Topic Browser) | Main (Knowledge Item List or Detail) | Rail.

### 4.1 Submenu (Scope & Topic Browser)

| Component | Information | Actions |
|---|---|---|
| **Scope selector** | Three options: Practice / Product / Factory | Click to switch scope |
| **Practice list** (Practice scope) | Building, Growth, Product, Ops, Hardware, Facilitation — each with item count | Click to filter main pane |
| **Product list** (Product scope) | Ambrovia, Nimmly, HyperIdle, Pulse — each with item count | Click to filter |
| **Topic list** | Per topic: name, item count, health indicator (stable/degraded), stale count | Click to filter; multi-select with Cmd |
| **Quick filter links** | Drafts, Index, Curated, Stale, Archive — with counts | Click to jump to view |

### 4.2 Knowledge Item List (in Main)

| Component | Information | Actions |
|---|---|---|
| **View switcher** | Two views: Curated (all active items grouped by topic) and Triage (needs attention + drafts + stale, sorted by attention score). Additional sort options within each view: by date, access count, attention score. | Click to switch view; click sort control to reorder |
| **Knowledge gap indicator** | Topics with zero active items or no activity in 90+ days, highlighted in topic list | Click to create first item in gap topic |
| **Topic section header** | Topic name, item count, stale count | Collapse/expand |
| **KnowledgeRow** (× N) | Title, one-line preview, kind tag, status tag, topic (in cross-topic views), timestamp | Click to open detail |
| **Kind tag** | Pattern, anti_pattern, decision, failure, brief, principle, reflection, focus — color-coded | Read-only |
| **Status tag** | Captured, provisional, active, stale, archived — with colored dot | Read-only |
| **Search bar** | Full-text search within current scope | Type to search; highlighted results |
| **Filter/sort controls** | Sort by attention score, date, access count | Click to change sort |
| **Bulk update button** | — | Multi-select items and batch-apply operations |
| **Curation suggestion card** | Agent-generated suggestion (e.g., "3 JWT items losing relevancy — merge?") | Execute or dismiss |

### 4.3 Knowledge Item Detail/Edit (in Main)

| Component | Information | Actions |
|---|---|---|
| **Breadcrumb** | Knowledge → [Practice/Product] → [Topic] → [Item title] | Click to return to list |
| **Editable title** | Item title, large text | Click to edit inline |
| **Metadata bar** | Kind, status, topic (dropdown to change), confidence (0-1 bar), last-edited date + editor, access count, origin agent, creation context, evidence links | Read-only except topic |
| **Action bar** | Flag, Archive, Move, Merge, Split | Click each |
| **Rich content body** | Full markdown rendered: headings, paragraphs, lists, code blocks, images | Click anywhere to edit inline; auto-save |
| **Edit toolbar** | Bold, italic, link, image, save | Formatting controls (appears when editing) |
| **Observation logs** | Read-only comments from facilitator agents | — |
| **Edit history** | Version timeline: what changed, when, by whom | Collapse/expand; click version to preview |
| **Related items sidebar** | Auto-suggested related items (by topic, by text similarity) + manually linked items | Click to navigate; "Link item" button to add manual link |
| **Merge modal** | Triggered from Action bar. Lists similar items in same topic → select target → preview combined result → confirm | Execute merge; source item archived with redirect |
| **Split modal** | Triggered from Action bar. Select text section → promote to new item in same topic → auto-cross-link both | Execute split; both items linked |

---

## 5. User Journeys

### 5.1 Morning check-in (3 minutes)

```
Open Factory
  → Glance at Rail (minimized): blocked count, cost burn, unread count
  → If blocked > 0: expand Rail → see which agents are stuck → click blocker → lands in Conversations review thread → use ReviewHeader to approve/request changes (15 seconds each)
  → Scan Submenu thread list: any blocking reviews? Handle them.
  → Glance at Chief of Staff pinned thread — any new messages?
  → Done. Close or leave open on side screen.
```

### 5.2 Handle a review item (15 seconds — 5 minutes)

```
Submenu thread list shows blocking review (prominent indicator)
  → Click thread → Main shows review thread detail with ReviewHeader
  → Read agent reasoning (always visible first)
  → Look at ArtifactView (text_diff / content_preview / visual_comparison / action_summary / data_metrics)
  → Simple case: click Approve in ReviewHeader (keyboard: A) → done
  → Complex case: leave inline comment on specific line → click Comment → agent revises → come back later → Approve with comments
  → High stakes: Reject or Request Changes in ReviewHeader → agent gets feedback, revises, re-submits in same thread
```

### 5.3 Weekly bet planning (15 minutes)

```
Click Work icon → Portfolio Overview loads (default)
  → Glance at product status cards — any decisions pending?
  → Click product card → Team View for that product
  → See Canvas (committed BetCards) + Kanban below
  → Click "+" (Add bet) on Canvas → PitchSelector overlay replaces Kanban
  → Scan available pitches → expand one to read full pitch body
  → Click "Commit" on best 2-3 PitchCards (capacity cap enforced)
  → Kill pitches that aren't worth reshaping
  → Close PitchSelector → Kanban returns with new bet tasks populating
  → Click a committed BetCard → Bet Detail → review TaskCard table
  → Leave a comment if scope needs adjusting
  → Breadcrumb back to Team View → switch product in Submenu → repeat
```

### 5.4 Weekly knowledge curation (20 minutes)

```
Click Knowledge icon → Submenu shows scope selector
  → Select Practice scope → pick "Building"
  → Switch to "Needs attention" view → see KnowledgeRows sorted by attention score
  → Open first item → read body → edit inline to sharpen wording → auto-saves
  → Flag an item that looks wrong → facilitator will review
  → Switch to "Stale" view → archive 3 items nobody uses
  → Merge two duplicate items on the same topic
  → Switch to Product scope → Pulse → check recent items from hardware agents
  → Done.
```

### 5.5 Chief of Staff monthly conversation (30 minutes)

```
Submenu thread list → click pinned Chief of Staff thread (always at top)
  → Scroll through recent messages — cross-product patterns, obstacle report
  → Reply with thoughts on what's working, what to change
  → Chief of Staff proposes edit to PRINCIPLES.md → drafts it as a review thread
  → Review thread appears in Submenu list → use ReviewHeader to approve/comment/request changes
  → Approved changes are written back to factory knowledge
```

### 5.6 Respond to a blocker (reactive, 30 seconds)

```
Rail shows "2 blocked" (visually emphasized)
  → Expand Rail → see: "Pulse Hardware Agent: waiting on review verdict for PCB layout rev C (2h)"
  → Click → lands in Conversations on that review thread
  → Companion layout opens: conversation + ReviewHeader left, ArtifactView (visual_comparison) right
  → Review before/after visual, read reasoning
  → Click Approve in ReviewHeader → agent resumes immediately
```

### 5.7 Create and shape a pitch (10 minutes)

```
Click Work icon → Portfolio Overview → click product card → Team View
  → Click "+" (Add bet) → PitchSelector overlay opens
  → Click "New Pitch" button in PitchSelector
  → Fill in: title, appetite (1w/2w/6w), problem statement, solution sketch, rabbit holes, done condition
  → Save → pitch appears in PitchSelector list
  → Optionally: pitch creates a review thread in Conversations for feedback from Chief of Staff
  → Close PitchSelector (or immediately commit the pitch)
  → Next betting session: open PitchSelector again → commit, reshape, or kill
```

### 5.8 Mid-cycle bet check-in (5 minutes)

```
Click Work icon → Portfolio Overview → click product card → Team View
  → Scan Kanban: anything blocked? Any tasks piling up in "Planned"?
  → Click committed BetCard → Bet Detail
  → Read progress card, check TaskCard table states
  → If behind schedule: click "Sync" → flag blocker or request scope reduction
  → If on track: leave a comment ("looking good, keep going")
  → Check cost card: actual vs. appetite — any overrun?
  → Breadcrumb back to Team View
```

---

## 6. Component Tree Summary

**Canonical app shell:**

```
┌─────────┬──────────────┬─────────────────────────────┬────────┐
│IconRail │ Submenu      │ Main (view content)         │ Rail   │
│         │ (per view)   │                             │(right) │
└─────────┴──────────────┴─────────────────────────────┴────────┘
```

**Full tree:**

```
App Shell (IconRail | Submenu | Main | Rail)
│
├── IconRail
│   ├── Conversations icon
│   ├── Work icon
│   ├── Knowledge icon
│   └── User avatar
│
├── Rail (right sidebar)
│   ├── Minimized: blocked count, unread count, cost burn
│   └── Expanded
│       ├── NotificationRow × N (active bets, blocked agents)
│       ├── Knowledge additions count
│       ├── Cost burn card
│       ├── System stability
│       ├── Unread breakdown
│       ├── Agent activity summary
│       └── Recent completions feed
│
├── Settings (accessed via IconRail avatar)
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
│   │   ├── Pinned: Chief of Staff ThreadRow
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
│       │   ├── Cycle management card
│       │   └── Past cycle summaries
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

## Tier System (Canonical)

**Tier 1 — Primitives (5):** StatusChip, Tag, KeyValue, NavItem, SearchField

**Tier 2 — Blocks (6):** ThreadRow, BetCard, PitchCard, TaskCard, KnowledgeRow, NotificationRow

**Tier 3 — Regions (8):** IconRail, Submenu, Rail, ArtifactView, ReviewHeader, Canvas, Kanban, PitchSelector

**Tier 4 — Pages (9):** Conversations/Review, Conversations/Chat, Work/Portfolio, Work/Team, Work/Team+Pitch, Work/Bet, Knowledge/List, Knowledge/Detail, Settings

---
```

---

## 7. Cross-View Navigation Map

| From | To | Trigger |
|---|---|---|
| Any view → Conversations | Click Conversations icon in IconRail | Always available |
| Any view → Work | Click Work icon in IconRail | Always available |
| Any view → Knowledge | Click Knowledge icon in IconRail | Always available |
| Rail → Conversations thread | Click NotificationRow (blocked agent) | Direct link |
| Rail → Work bet detail | Click NotificationRow (active bet) | Direct link to Bet Detail (Level 3) |
| Rail → Knowledge "recently created" | Click knowledge additions count | Direct link |
| Submenu thread list → Review thread detail | Click ThreadRow item | Within Conversations |
| Review thread → Companion layout | Auto-promotes for complex ArtifactView; manual toggle | Within Conversations |
| Portfolio Overview → Team View | Click product status card | Within Work (Level 1 → 2) |
| Team View → Bet Detail | Click BetCard | Within Work (Level 2 → 3) |
| Team View → PitchSelector | Click Add bet (+) button on Canvas | Within Work (overlay on Level 2) |
| Bet Detail → Team View | Click breadcrumb | Within Work (Level 3 → 2) |
| Bet Detail → Conversations thread | Click TaskCard row "Open thread" | Cross-view |
| Knowledge list → Item detail | Click KnowledgeRow | Within Knowledge |
| Item detail → Knowledge list | Click breadcrumb | Within Knowledge |
| Knowledge item → Conversations | Not applicable (agent-free view) | — |
| IconRail avatar → Settings | Click avatar → Settings | Always available |
| PitchSelector → New Pitch form | Click "New Pitch" in PitchSelector | Within Work (Level 2 overlay) |
| Bet detail → Sync modal | Click "Sync" button | Within Work |
| Knowledge item → Related item | Click in related items sidebar | Within Knowledge |
| Knowledge item → Merge modal | Click "Merge" in action bar | Within Knowledge |
