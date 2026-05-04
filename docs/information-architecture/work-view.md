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
| **Pitch body** | Full markdown rendered as a list of blocks per the **Block primitive** (TRACK-L L2; spec at `docs/BLOCKS.md`): problem statement, solution sketch, rabbit holes, done condition. Each block carries a stable, server-computed id, scoped by `host_id = bet:<id>`. | Read-only rendered prose; per-block discussion via L18+L26 attaches via `(host_id, block_id)` anchor. |
| **TaskCard rows** (× N) | Per task: title, owner (agent name), state (planned/in progress/done/blocked), dependency, sessions, cost | Click task → open thread in Conversations; Flag for PM |
| **Task state indicator** | Colored dot + label (pulsing for in-progress, solid for done, red for blocked) | — |
| **Comment thread** | Chronological: sender, avatar, timestamp, message | Reply |
| **Comment input** | Text area with "Add a comment..." placeholder | Type and send |
| **Sync action button** | — | Opens modal: add note, flag blocker, request scope reduction, pause bet, kill bet. Creates comment thread entry. |

---
