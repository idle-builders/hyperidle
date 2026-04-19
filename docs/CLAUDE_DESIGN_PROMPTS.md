# Claude Design Prompts — HyperIdle "The Factory"

Four sequential prompts. Run them in order. Each builds on the previous.

---

## Prompt 1: Design System & App Shell

```
Design a design system and app shell for "HyperIdle — The Factory," a desktop-first dark-mode application for a small founding team collaborating with AI agent teams across a portfolio of digital products. Think Linear meets Slack — information-dense, professional, no consumer fluff.

THE APP IN ONE SENTENCE: A founding team opens one app to review agent work, plan bets, and curate knowledge — spending 90% of their time in a threaded conversation view approving or commenting on agent proposals. Review items are routed to the right founder by domain.

LAYOUT: Fixed four-zone shell that never changes:
- IconRail (48px, left): 4 icons stacked vertically — Conversations, Work, Knowledge, Settings. Active = 2px primary left bar + surface-4 fill. User avatar at bottom.
- Submenu (240px, left of main): Contextual per-view. Title, search field, filter tags, scrollable list. Collapsible.
- Main (fluid center): Where content lives. Changes per view.
- Rail (56px collapsed / 360px expanded, right): The ONLY notification surface. Collapsed = stacked icons with count badges (blocked, cost, unread). Expanded = grouped notification rows with search. No bell icon anywhere else. No toasts. No top-bar alerts.

COLOR TOKENS — "Silent Intelligence" palette:
- Surfaces (tonal layering, no borders): #000000, #0e0e0e, #131313, #191a1a, #1f2020, #252626, #2c2c2c, plus ghost rgba(255,255,255,0.06)
- Primary accent: #adc6ff (cool blue — links, selection, active states)
- Warn: #d58f24 (amber — behind schedule, attention needed)
- Ok: #bbffb3 (soft green — healthy, done, approved)
- Danger: #ee7d77 (muted red — blocked, errors, rejected)
- Text: #e7e5e4 (high), #acabaa (mid), #767575 (low)

TYPOGRAPHY:
- Inter for all UI text: 24/18/14/12px at weights 400/500/600
- Space Grotesk for data/mono: 13/11px at weights 400/500, uppercase + 0.05em tracking at 11px

SPACING & SHAPE:
- 4px baseline grid throughout
- Radii: 0 / 2 / 4 / 8 / 999 px only. Default border-radius 2px for buttons, 4px for cards/containers.
- Internal padding default 8–12px. Density over whitespace.
- No drop shadows except floating surfaces: 0 0 32px rgba(173,198,255,0.08)
- No visible borders between zones — rely on surface tone differences only.

PRIMITIVE COMPONENTS TO DESIGN (5):
1. StatusChip — small badge with 6px colored dot + uppercase mono text. Six states: healthy (#bbffb3), behind (#d58f24), blocked (#ee7d77), paused (#767575), done (#bbffb3 dimmed), error (#ee7d77). Used everywhere status appears.
2. Tag — flat neutral badge for identity: product name, object kind (bet, pitch, task), knowledge category. No border, subtle fill.
3. KeyValue — stacked or inline layout: uppercase mono-sm label on top, body value below. The only way structured metadata is displayed.
4. NavItem — icon + text + optional count badge. Selected state: surface-4 fill + 2px primary left bar. Used in IconRail, Submenu, Settings.
5. SearchField — compact input with leading search icon and trailing keyboard shortcut hint (⌘K). Always the same size/style.

BLOCK COMPONENTS TO DESIGN (6):
1. ThreadRow — avatar + title + caption + StatusChip + relative timestamp. The list item in conversation thread lists.
2. BetCard — Tag(product) + title + StatusChip + progress track (thin horizontal bar) + owner avatar. The card on the bet canvas.
3. PitchCard — Tag(kind) + title + appetite KeyValue + StatusChip. The card in the pitch selector.
4. TaskCard — title + StatusChip + optional bet Tag + owner avatar. The card in kanban columns.
5. KnowledgeRow — title + Tag(category) + caption + timestamp. The list item in knowledge lists.
6. NotificationRow — StatusChip + summary text + source Tag + timestamp + optional ghost action button. The only shape notifications ever take.

DESIGN DELIVERABLES:
1. The complete app shell with all four zones, showing the Conversations view as default (thread list in Submenu, a review thread in Main, Rail collapsed on right).
2. A component sheet showing every primitive and block component in all their states (default, hover, active, selected, disabled where applicable).
3. The Rail in both collapsed (56px icon strip with count badges) and expanded (360px panel with NotificationRows grouped by category) states.
4. Typography scale showing Inter + Space Grotesk at all specified sizes.
5. Color swatch sheet with all surface tones, accents, and text colors labeled.

DESIGN PRINCIPLES:
- Density over whitespace. This is a professional tool, not a consumer app.
- Information hierarchy through tonal surface differences, not borders or shadows.
- Every component earns its existence. If DaisyUI (Tailwind component library) already has it, we use theirs. Only 19 custom components total for the whole app.
- The Rail is sacred — it's the ONLY place notifications appear. No bell icons, no toast popups, no inline badges outside the Rail.
```

---

## Prompt 2: Conversations View (Review + Chat)

```
Design the Conversations view for HyperIdle. This is where founders spend 90% of their time. It's the Slack of the factory — but for reviewing agent work proposals and having threaded discussions.

USE THE DESIGN SYSTEM from the previous design. Same shell, same colors, same components.

LAYOUT: IconRail | Submenu (thread list) | Main (thread detail) | Rail

THE SUBMENU — THREAD LIST:
- SearchField at top with "Jump to..." placeholder
- Filter row: Tag chips for product, agent, type (review/chat), status (blocking/open/snoozed/resolved)
- Pinned section: Chief of Staff thread always first (this is the team's persistent AI advisor)
- Active threads section: ThreadRows sorted by: blocking reviews first → non-blocking reviews → chats → resolved
- Each ThreadRow shows: agent avatar, agent name + role, subject line, timestamp, and two key indicators:
  - Review vs. chat: review threads have a visible review badge/icon
  - Blocking vs. non-blocking: blocking reviews have a stronger visual treatment (the agent is literally paused waiting)
- Right-click context: snooze (with duration picker), archive, mute

THE MAIN PANE — REVIEW THREAD DETAIL:
A review thread always has the same structure: reasoning → artifact → verdict.

Top: ReviewHeader bar with:
- Thread title + Tag(product) + StatusChip
- Three primary verdict buttons: Approve (A), Request Changes (R), Reject (X)
- Overflow (⋮): Edit, Escalate, Comment Only, Snooze (S), Approve with Comments

Below ReviewHeader: Agent reasoning block — always visible, always first. Shows WHY the agent is proposing this. Collapsible but expanded by default. Includes confidence indicator.

Below reasoning: ArtifactView — the actual thing being reviewed. Five shapes, show ONE:

1. text_diff — Side-by-side or inline diff. File header, line numbers, green additions, red deletions, context lines. Inline comments attach to specific lines. Check results (tests, lint) shown below. Think GitHub PR diff.

2. content_preview — Rendered content as the reader will see it (blog post, email, landing page). Not markdown source. Inline comments on paragraphs. Metadata sidebar: word count, audience, publish date.

3. visual_comparison — Two panes side by side with labels (e.g., "Rev B" / "Rev C"). For UI mockups, design assets, visual artifacts. Slider for overlay comparison.

4. action_summary — Structured summary card: what's changing, why, expected impact, rollback plan, checks passed, timeline, cost. For deploys, config changes, ops actions.

5. data_metrics — Headline metrics with trend arrows, inline charts (line/bar), narrative insights, recommended actions. For performance reports, A/B tests, analytics.

Below artifact: Conversation history — chronological messages. Each: sender avatar, name, timestamp, message body. Inline comment indicators linked to specific artifact parts.

Bottom: Reply composer — textarea + send button.

THE MAIN PANE — CHAT THREAD DETAIL:
Simpler than review. No ReviewHeader, no ArtifactView.
- Message list: chronological, each with avatar, name, timestamp, content
- Agent messages can have collapsible reasoning blocks
- Bottom: reply input + action buttons (Start a Task, Close, Escalate)

DESIGN DELIVERABLES:
1. Full Conversations view: thread list in Submenu with mix of review and chat threads (show Chief of Staff pinned, 2 blocking reviews with strong visual, 3 non-blocking reviews, 2 chats)
2. Review thread detail showing text_diff shape with inline comments and ReviewHeader
3. Review thread detail showing content_preview shape (a blog post being reviewed)
4. Review thread detail showing action_summary shape (a deployment proposal)
5. Review thread detail showing data_metrics shape (a performance report with charts)
6. Review thread detail showing visual_comparison shape (two design versions side by side)
7. Chat thread detail (the Chief of Staff conversation — a long-running advisory chat)
8. Empty state: no threads needing attention

INTERACTION DETAILS:
- Keyboard shortcuts visible on verdict buttons: A (approve), R (request changes), X (reject), S (snooze)
- Inline comments: clicking a diff line or paragraph opens a small comment input attached to that location
- Companion layout for complex artifacts: conversation on left, full artifact on right (toggle available)
- 10 verdict actions total: approve, approve-with-comments, comment, inline-comment, request-changes, edit, reject, reply, snooze, escalate
```

---

## Prompt 3: Work View (Portfolio → Team → Bet)

```
Design the Work view for HyperIdle. This is the Linear/Jira of the factory — planning which bets to take and tracking task progress. Used ~15 minutes weekly for planning, daily glance for tracking.

USE THE DESIGN SYSTEM from the first design. Same shell, same colors, same components.

LAYOUT: IconRail | Submenu (product selector) | Main (three depth levels) | Rail

THE SUBMENU — PRODUCT SELECTOR:
- "All Products" option (default — shows Portfolio Overview)
- Four product NavItems: Ambrovia, Nimmly, HyperIdle, Pulse — each with a status dot (healthy/behind/blocked)
- Clicking a product opens that product's Team View in Main

LEVEL 1 — PORTFOLIO OVERVIEW (default landing):
High-level view across all products.
- Portfolio header: "Portfolio" title + cycle phase indicator (Shaping / Betting / Building / Cool-down) + cycle number
- Product status cards in a grid: each card shows product name, lead agent avatar, status (operational/shipping/decisions pending), active bets count, shipped count this cycle, velocity sparkline (tiny line chart)
- Portfolio metrics bar: global shipping velocity, active bet count, decisions required count
- Cycle management card: current cycle number, phase, days remaining, "Advance Cycle" button
- Past cycle summaries: collapsible list, each showing bets shipped, bets killed, total cost, cost variance (appetite vs actual)

LEVEL 2 — TEAM VIEW (per product):
Two-area layout, Canvas on top, Kanban on bottom.

Canvas (top):
- Header: product name, cycle label, capacity indicator ("2/3 committed"), hard capacity limit visible
- BetCards laid out in a row or grid — each committed bet showing title, appetite, StatusChip (on-track/behind/blocked/paused), progress bar, week indicator (week 2 of 6), cost
- "+" button to add a bet → opens PitchSelector overlay

Kanban (bottom):
- Header: "Tasks across current bets"
- Four columns: Planned, In Progress, Blocked, Done
- Each column holds TaskCards with: title, owner agent avatar+name, parent bet Tag, status indicator
- Blocked column: tasks show blocker reason + duration blocked + red indicator
- Optional dependency arcs toggle: visual lines connecting dependent tasks

PitchSelector (overlay, replaces Kanban when "+" clicked):
- Header: "Available Pitches" + count + capacity remaining
- Scrollable list of PitchCards, each showing: title, appetite (1w/2w/6w), one-line summary, shaper avatar
- Each PitchCard expandable to show full pitch: problem statement, solution sketch, rabbit holes, done condition
- Three actions per card: Commit (adds to Canvas), Reshape (sends back), Kill (removes permanently)
- "New Pitch" button: opens inline form (title, appetite, problem, solution, rabbit holes, done condition)
- Close button returns to Kanban

LEVEL 3 — BET DETAIL:
Accessed by clicking a BetCard. Breadcrumb: Work → [Product] → [Bet title]
- Bet header: title, product Tag, appetite, StatusChip, cycle, progress indicator
- Progress card + Cost card side by side (KeyValue blocks)
- Pitch body: full rendered markdown — problem, solution, rabbit holes, done condition
- Task table: list of TaskCards with columns for title, owner, state, dependency, sessions, cost
- Comment thread: chronological messages with reply input
- Action button: add note, flag blocker, request scope reduction, pause bet, kill bet

DESIGN DELIVERABLES:
1. Portfolio Overview with 4 product cards, cycle management, past cycle summaries
2. Team View: Canvas with 3 committed BetCards + Kanban with tasks in all 4 columns
3. Team View with PitchSelector open (overlay replacing Kanban), showing 4 available pitches, one expanded
4. Bet Detail page with full pitch body, task table, comment thread
5. Empty states: no bets committed (Canvas empty with "+" prominent), no tasks yet (Kanban columns empty)
6. Capacity limit state: Canvas at max capacity, "+" button disabled or shows "at capacity"

KEY DESIGN DETAILS:
- Capacity is a HARD LIMIT, not a suggestion. Visually enforce it — no committing past the cap.
- No backlog. Pitches expire after 2 cycles. Show this somewhere subtle.
- The Canvas is NOT a Kanban — it's a Shape Up betting table. Two conceptual columns: shaped (available) vs committed (bet on). But the shaped column only appears via PitchSelector overlay.
- BetCards should feel substantial — these are 1-6 week commitments, not quick tasks.
- TaskCards are lightweight — they're atomic work units inside a bet.
```

---

## Prompt 4: Knowledge View (Catalogue + Curation)

```
Design the Knowledge view for HyperIdle. This is the Notion/Confluence of the factory — a company wiki where founders curate knowledge that AI agents generate. Desktop only. Used ~20 minutes weekly.

USE THE DESIGN SYSTEM from the first design. Same shell, same colors, same components.

LAYOUT: IconRail | Submenu (scope & topic browser) | Main (knowledge list or detail) | Rail

KEY CONCEPT: This view is agent-free. No human-agent interaction happens here. Founders search, filter, read, and edit knowledge items directly. It's editorial work — tending a wiki.

THE SUBMENU — SCOPE & TOPIC BROWSER:
- Scope selector (three tabs or segmented control): Practice / Product / Factory
- Practice scope shows: Building, Growth, Product, Ops, Facilitation — each with item count and health dot
- Product scope shows: Ambrovia, Nimmly, HyperIdle, Pulse — each with item count
- Factory scope shows: very few items (5-15), the company constitution
- Below scope: Topic list for selected scope. Each topic shows: name, item count, health indicator (stable/degraded), stale count
- Quick filter links at bottom: Drafts, Curated, Stale, Archive — with counts

THE MAIN PANE — KNOWLEDGE LIST:
- View switcher: "Curated" (all active items grouped by topic) vs "Triage" (needs-attention + drafts + stale, sorted by attention score)
- Sort controls: by date, access count, attention score
- Topic section headers (collapsible): topic name + item count + stale count
- KnowledgeRows under each topic: title, one-line preview, kind Tag (pattern, anti_pattern, decision, failure, brief, principle, reflection, focus — each a different subtle color), status Tag (captured, provisional, active, stale, archived), timestamp
- Knowledge gap indicator: topics with zero active items highlighted
- Search bar: full-text search within current scope, results highlighted
- Curation suggestion card: agent-generated suggestion floating above list (e.g., "3 JWT items losing relevancy — merge?") with Execute/Dismiss buttons

THE MAIN PANE — KNOWLEDGE DETAIL:
Accessed by clicking a KnowledgeRow. Breadcrumb: Knowledge → [Practice/Product] → [Topic] → [Item title]
- Editable title (large, click to edit)
- Metadata bar: kind Tag, status Tag, topic (dropdown), confidence bar (0-1), last-edited date + editor name, access count, origin agent
- Action bar: Flag, Archive, Move, Merge, Split buttons
- Rich markdown body: rendered content with inline editing (click to edit, auto-save). Headings, paragraphs, lists, code blocks.
- Observation logs: read-only comments from facilitator agents (subtle, below body)
- Edit history: version timeline showing what changed, when, by whom (collapsible)
- Related items sidebar (right): auto-suggested related items + manually linked items. "Link item" button.

MERGE MODAL: Select target item from same-topic list → preview combined result → confirm. Source item archived with redirect.

SPLIT MODAL: Select text section → promote to new item in same topic → auto-cross-link both.

THREE SCOPES HAVE DIFFERENT CHARACTER:
- Practice scope: densest. 15-20 topics per practice, 5-50 items each. Craft knowledge — patterns, anti-patterns, decisions.
- Product scope: per-product. Mix of long narratives (briefs, architecture docs) and short entries (decisions, learnings). Volume varies by product phase.
- Factory scope: very few items. The constitution. Changing these changes how every agent behaves. Should feel weighty.

DESIGN DELIVERABLES:
1. Knowledge list in "Curated" view, Practice scope, "Building" practice selected. Show 3 topics expanded with KnowledgeRows. Show kind and status Tags.
2. Knowledge list in "Triage" view showing needs-attention items sorted by score, with a curation suggestion card.
3. Knowledge detail page: a medium-length knowledge item with metadata bar, action bar, markdown body, observation logs, related items sidebar.
4. Knowledge detail in edit mode: inline editing active on the body, edit toolbar visible.
5. Merge modal: selecting a target, preview of combined result.
6. Factory scope view: very few items, the company constitution — should feel different from the dense practice lists.
7. Empty state: a new topic with no knowledge items yet, showing the knowledge gap indicator.

KEY DESIGN DETAILS:
- This is editorial UI. Think Notion's database view, not a chat interface.
- Kind Tags should be subtly but distinctly colored — founders scan by kind to find what they need.
- Status lifecycle is visual: captured (dim) → provisional (slightly brighter) → active (full) → stale (warn-tinted) → archived (very dim).
- The triage view is the weekly to-do list for knowledge curation. Make it actionable.
- Factory scope items should feel constitutionally important — maybe slightly larger text or a subtle visual weight.
- Observation logs from facilitator agents should be clearly secondary — gray, smaller, collapsed by default.
```

---

## Usage Notes

**Sequence:** Run Prompt 1 first — it establishes the design system and shell. Then run 2, 3, 4 in any order (they're independent views within the same shell).

**After round 1:** Use the results as a baseline. In round 2, feed Claude the current designs from `stitch 2/` alongside these prompts and ask it to evolve toward the design system.

**Design critique between rounds:** Use Opus with max effort to run design critique on each output before iterating.
