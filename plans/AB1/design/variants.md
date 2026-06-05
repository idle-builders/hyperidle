# AB1 Design — Agent Profile Page

## Context

A team lead navigates to an agent's profile to answer three questions:
1. What does this agent do? (identity + role + skills)
2. How is it configured? (harness, model, MCP, soul, concurrency)
3. Does it need attention? (health signals, failure rate, status)

The profile is **read-only**. Editing routes to Settings. The page must work for all three agent categories (team, strategy, personal) with the same layout.

## Existing Patterns

Detail pages in HyperIdle follow one pattern: breadcrumb chip, then stacked `<section>` elements inside the Main pane. Each section has an uppercase `text-xs` heading and uses KeyValue pairs for data. The WorkTeam and WorkBet pages demonstrate this. No new components are needed — the page composes StatusChip, Tag, KeyValue, and DaisyUI table/badge/progress primitives.

## Navigation Entry Points

- **Team page roster** — AgentCard click navigates to `/agents/:agentId`
- **Sidebar** — future: agent name in team roster sub-items (not in AB1 scope, but the route must exist)
- **Org chart** — agent node click navigates to the profile
- **Session links** — active session status links back to the session, but other pages can link to the agent

## Route

`/agents/:agentId` — a new top-level route in the AppShell. Not nested under `/work/team/` because strategy and personal agents have no team. The breadcrumb adapts: team agents show "Team Name > Agent Name", strategy/personal agents show "Agents > Agent Name".

---

## Variant A: Single-Column Stacked Sections

The most direct application of the existing detail-page pattern. Every information group is a section with an uppercase heading, stacked vertically in a single scrollable column.

### Layout (top to bottom)

```
Breadcrumb:   <- Team Name  (or <- Agents for non-team)
Header:       Avatar(initials, agent) | Name | Tag(category) | StatusChip(status)
              Role label (from catalog) · Created {date}
              [Edit in Settings] btn-ghost

Section 1 — Status & Health
  StatusChip(active|idle|error)
  If active: "Running session: {taskTitle}" as a link to /work/bet/:betId/task/:taskId
  If error: "Last session failed: {outcome}" in text-error
  Health signals as KeyValue rows:
    Failure rate (7d):    "3/10 (30%)" with warning badge if > 50%
    Cost trend (7d):      "$12.40" with direction indicator
    Idle since:           "2h 15m" (if idle)
    Config valid:         "OK" or list of issues

Section 2 — Configuration
  KeyValue rows:
    Harness type:         "claude-code" (or "Any")
    Model tier:           "reasoning" (or "Default")
    Max sessions:         "4"
    MCP:                  "Enabled" / "Not supported"
    Soul prompt:          First 200 chars truncated, or "Not set"

Section 3 — Harness Capabilities
  DaisyUI badge grid:
    preCompactionTrigger: badge "Pre-compaction" (green if true, ghost if false)
    subAgents:            badge "Sub-agents"
    mcpSupport:           badge "MCP"
    modelProviders:       badge per provider ("anthropic", "openrouter")

Section 4 — Skills
  Table: Skill Name | Autonomy Level | Success | Failures | Last Used
  Rows from userSkills joined with toolsForRole(role)
  Skills the role has access to but no userSkills row: shown as "Available" (not yet used)

Section 5 — Recent Activity
  Table: Task | Outcome | Model Tier | Cost | Duration | When
  Last 10 sessions, newest first
  Each row links to the task

Section 6 — Performance
  KeyValue rows:
    Total sessions:       "47"
    Success rate:         "89%" with StatusChip coloring
    Average cost:         "$0.28"
    Total cost:           "$13.16"
```

### Strengths
- Follows the exact pattern of WorkTeam and WorkBet — no new layout concepts.
- Scannable: the team lead scrolls once to see everything.
- All six ACs are directly satisfied by visible sections.

### Weaknesses
- Long page if the agent has many skills and sessions.
- Health signals are buried in section 1 — if the lead just wants a quick health check, they scroll past the header.
- No visual weight differentiation between critical (health) and reference (config) information.

---

## Variant B: Priority-Weighted Sections with Health Banner

Same single-column layout, but reordered so health signals are visually prominent. A conditional banner appears at the top when any signal is degraded, making the "needs attention" question answerable at a glance.

### Layout (top to bottom)

```
Breadcrumb:   <- Team Name  (or <- Agents for non-team)

Health Banner (conditional — only if any signal is degraded):
  bg-[rgba(200,60,30,0.04)] rounded-[var(--r-subtle)] p-[12px]
  Icon-free. Text: "High failure rate: 8/10 sessions failed in the last 7 days"
  Or: "Configuration issue: harness type 'foo' not available in adapter pool"
  Multiple issues stack as a list.
  Banner is absent when all signals are green.

Header:       Avatar(initials, agent) | Name | StatusChip(active|idle|error)
              Tag(category) · Tag(role) · Created {date}
              If active: "Session: {taskTitle}" as a link
              [Edit in Settings] btn-ghost

Section 1 — Identity & Configuration  (merged)
  Two-column flex grid of KeyValue pairs:
    Left column:                Right column:
    Role:        Builder        Harness:      claude-code
    Category:    Team           Model tier:   reasoning
    Team:        Frontend       Max sessions: 4
    Created:     2024-03-15     MCP:          Enabled

  Soul prompt: collapsed by default (DaisyUI `collapse` component).
  Click to expand and read full text.

Section 2 — Harness Capabilities
  Inline badge row (horizontal):
    [Pre-compaction] [Sub-agents] [MCP] [anthropic] [openrouter]
  Green-tinted badges for supported, ghost for unsupported.

Section 3 — Skills
  Compact table: Skill | Access | Uses | Success Rate
  "Access" column: badge-sm with "Granted" (in toolsForRole) or "Restricted"
  "Uses" = successCount + failureCount
  "Success Rate" = successCount / total, displayed as percentage

Section 4 — Recent Activity (last 10 sessions)
  Compact table: Task | Outcome | Cost | When
  Outcome as StatusChip(done|crashed|stopped)
  Task title links to task page

Section 5 — Performance Summary
  Four KeyValue pairs in a horizontal flex row (mini-dashboard):
    Sessions: 47    Success: 89%    Avg cost: $0.28    Total: $13.16
```

### Strengths
- Health issues are impossible to miss — the banner is the first thing you see.
- When everything is healthy, the banner is absent and the page starts clean with identity.
- Merged identity/config section is denser — fewer section headings, less scroll.
- Horizontal KeyValue grid for performance gives dashboard-like scannability.
- Soul prompt collapsed by default saves space for the common case (team lead does not need to read the full prompt).

### Weaknesses
- The conditional banner is a new behavioral pattern — no other page uses a conditional warning block at the top. However, it composes from existing primitives (div with bg/border/text).
- Two-column KeyValue grid is also new (WorkTeam uses single-column). But it uses the same KeyValue component.
- The collapsed soul prompt could surprise users who expect to see everything.

---

## Variant C: Tabbed Sections with Summary Header

The profile header contains the most critical info (identity, status, health). Below it, a DaisyUI `tabs` component splits the detail into Overview / Activity / Configuration tabs. This reduces scroll depth and lets the team lead focus on one concern at a time.

### Layout

```
Breadcrumb:   <- Team Name  (or <- Agents for non-team)

Header Card:  
  bg-[var(--surface-container)] rounded-[var(--r-subtle)] p-[18px]
  Row 1: Avatar | Name | StatusChip | Tag(category) | [Edit in Settings]
  Row 2: Role description (from catalog) · Team name · Created date
  Row 3 (health summary): Four mini KeyValues inline:
    Sessions: 47    Success: 89%    Failure 7d: 2/10    Status: idle 2h

Tabs: [Overview] [Activity] [Configuration]

--- Tab: Overview (default) ---
  Section: Skills
    Table: Skill | Access | Uses | Success Rate

  Section: Harness Capabilities
    Badge row: [Pre-compaction] [Sub-agents] [MCP] [anthropic] [openrouter]

  Section: Health Signals
    KeyValue column:
      Failure rate (7d):  3/10 (30%)
      Cost trend (7d):    $12.40 (+15%)
      Idle since:         2h 15m
      Config valid:       OK

--- Tab: Activity ---
  Table: Task | Outcome | Model Tier | Cost | Duration | When
  Last 10 sessions, links to tasks

--- Tab: Configuration ---
  KeyValue column: harness, model tier, max sessions, MCP status
  Soul prompt: full text displayed (no collapse)
```

### Strengths
- The header card creates a strong visual summary — identity and health at a glance.
- Tabs reduce visible complexity. A team lead doing a health check stays on Overview. One configuring routes to Configuration.
- Familiar web pattern (tabs on a detail page).

### Weaknesses
- **Tabs are not in the existing vocabulary.** No other HyperIdle page uses tabs in the Main pane. DaisyUI tabs exist but introducing them for one page is precedent-setting. The design credo says "if two components do almost the same thing, merge them."
- Configuration is hidden behind a click. AC2 says the team lead should see the "complete operational picture in one view." Tabs split that picture.
- URL state: tabs either need query params (`?tab=activity`) or lose position on navigation. More state to manage.
- Three tabs for one agent feels over-structured. This is not a complex entity — it is a configuration record with session history.

---

## Recommendation: Variant B

Variant B is the strongest design for these reasons:

**1. It answers the primary question first.** The conditional health banner means a team lead visiting an unhealthy agent sees the problem before anything else. When the agent is healthy, the banner is absent and the page opens clean — no wasted space.

**2. It preserves the single-view requirement.** AC2 says "complete operational picture in one view." Variant B is one scrollable page — no tabs, no hidden content (soul prompt is collapsed but visible as a disclosure widget, not hidden). Every section is immediately accessible by scrolling.

**3. It follows established patterns with minimal extensions.** The only new patterns are:
- Conditional warning block at the top (composes from a `div` + existing text tokens — no new component).
- Two-column KeyValue grid (composes from flex layout + existing KeyValue).
- Horizontal performance row (KeyValues in a flex row instead of a column).

None of these require a new custom component. They are layout variations of existing primitives.

**4. It is dense without being cluttered.** The merged identity/config section eliminates one section heading. The collapsed soul prompt saves vertical space. The horizontal performance row fits four numbers on one line instead of four rows.

**5. AC satisfaction map:**
- AC1 (accessible from team page, sidebar, org chart): Route `/agents/:agentId` + breadcrumb. Team page AgentCard links there.
- AC2 (complete operational picture): All five data groups are visible sections. Identity + config merged. Skills, activity, performance each get a section.
- AC3 (current status): StatusChip in header + "Session: {title}" link when active.
- AC4 (health signals): Conditional banner for degraded signals. Health KeyValues visible in identity/config section.
- AC5 (harness capabilities): Badge row in its own section.
- AC6 (link to Settings for editing): "Edit in Settings" ghost button in the header.

### Health Banner Behavior (Variant B detail)

The banner renders when ANY of these conditions are true:
- Failure rate in last 7 days exceeds 50%
- Last session state is "crashed"
- Harness type is set but no matching adapter in the pool
- Model tier preference is set but no matching model gateway config

Each condition produces a human-readable sentence. Multiple conditions stack as a bulleted list. The banner uses `bg-[rgba(200,60,30,0.04)]` (subtle error tint) and `text-[var(--text-primary)]` — not screaming red, but warm and visible.

When all signals are green, the banner `div` is not rendered at all (not hidden, not collapsed — absent from the DOM).

### Variant B Rejected Alternatives

- **Variant A** is safe but buries health signals in section 1, making the "needs attention" question harder to answer quickly.
- **Variant C** introduces tabs (new interaction pattern), violates AC2 ("one view"), and over-structures a simple detail page.

---

## Component Inventory

No new custom components. Everything composes from:

| Used | Source | Purpose |
|---|---|---|
| StatusChip | Tier 1 | Agent status, session outcome badges |
| Tag | Tier 1 | Category label, role badge |
| KeyValue | Tier 1 | Every label-value pair in identity, config, health, performance |
| Avatar | DaisyUI + design-system | Agent avatar with initials |
| Badge | DaisyUI | Harness capability indicators, skill access |
| Table | DaisyUI | Skills table, sessions table |
| Collapse | DaisyUI | Soul prompt disclosure |
| Button (btn-ghost) | DaisyUI | "Edit in Settings", breadcrumb |

**Component budget impact: 0 new components.**

---

## States

| State | Behavior |
|---|---|
| **Loading** | SkeletonCard placeholders for header + each section (matching WorkTeam pattern) |
| **Error** | ErrorState component with retry |
| **Not found** | EmptyState "Agent not found" (matching WorkTeam 404 pattern) |
| **Populated, healthy** | No health banner. All sections render normally. |
| **Populated, degraded** | Health banner visible at top. Sections render normally. |
| **Populated, active** | Header shows StatusChip("active") + "Session: {title}" link |
| **Populated, idle** | Header shows StatusChip("idle") + idle duration in health |
| **Populated, error** | Header shows StatusChip("error") + last failure info |
| **No sessions** | Activity section shows EmptyState "No sessions yet." Performance shows "—" for all values. |
| **No skills** | Skills section shows EmptyState "No skills configured for this role." |

---

## Keyboard & Focus

- Tab order follows visual order: breadcrumb -> edit button -> banner links (if present) -> sections top-to-bottom
- Session task links and the "Edit in Settings" button are focusable
- Collapse trigger (soul prompt) is keyboard-accessible via DaisyUI default behavior
- No special keyboard shortcuts (no modal, no command-K interaction on this page)

---

## Mobile (secondary)

On mobile (viewport < 768px), the two-column KeyValue grid collapses to single column. The horizontal performance row wraps to two rows. Everything else stacks naturally. No mobile-specific design needed beyond responsive flex behavior.
