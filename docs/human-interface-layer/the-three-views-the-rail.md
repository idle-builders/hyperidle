## 4. The Three Views + The Rail <!-- @lore AD8a: historical — Rail removed in U6 -->

Each view gets a clear home in the app. They share data, they share identity, they share the thread model where applicable, but each has its own affordances tuned for its purpose.

### 4.1 Conversations — Review and Chat

> **Reframe note (added with the L1 Thread primitive).** This section uses "review threads" and "chat threads" as a shorthand for the user-facing experience. The structural reality is one Thread primitive (see §4.5) carrying typed messages: a *review message* embeds an artifact + a verdict affordance; a *plain message* is text. "Review thread" is short for "thread that contains a review message awaiting a verdict"; "chat thread" is short for "thread that does not (yet) contain a review or questionnaire message". A thread can move between those experiences as messages are appended. The blocking indicator and verdict grammar described below render *off the messages*, not off a `kind` column on the thread.
>
> **Implementers: do not implement off the shorthand.** Every "review thread" rule below is implemented as "the thread contains a review message"; every "chat thread" rule is implemented as "the thread contains no unanswered review or questionnaire message". When the prose below conflicts with §4.5, §4.5 wins. L8 (Submenu thread sections), L9 (collapse review/chat to one detail route), and L10 (filter chips) all consume §4.5 directly, not the shorthand.

**What it is:** The Slack of the factory. Messaging and reviews — all as threads.
**Home:** Thread list (submenu) + thread content (main pane). Mobile Conversations tab.
**Rhythm:** Whenever; smart-batched. Most items in seconds, some in short back-and-forth threads. The assistant's chat is persistent.
**Information density:** Minimal per item, but threads can grow.
**Borrows from:** MCP Agent Mail, LangChain Agent Inbox, builderz Mission Control's Aegis blocking gate, Devin Review's red/yellow/gray triage, **GitHub PR review's approve/comment/request-changes verdict model**, Read AI's persistent-context coach model, Letta's continuous sessions.

The Conversations view is where most interaction actually happens. It's the same thread infrastructure the agents use to talk to each other — one shared message store with identities, threads, and delivery rules. The thread list (the submenu for Conversations) is just the human's view into the threads addressed to them (or that they're copied on). Agents writing to other agents and agents writing to a founder go through the same pipes, with the same data model. Humans are identities in the matrix, not a special category outside it.

This has an important consequence: **agents can initiate conversations with humans**, not just surface things for approval. A Product Manager can message the founder with "hey, I noticed three of our recent Ambrovia bets all hit the same auth issue — want to talk about it?" That's not an approval item. It's an agent starting a thread. The human can reply, ignore, or escalate. The thread lives in the list either way.

#### ThreadRow: visual differentiation

The thread list must let the user distinguish two things at a glance without reading the content:

1. **Review vs. chat.** Review threads have a pending verdict; chat threads don't. The list item for a review thread (ThreadRow) carries a visible review indicator (icon, badge, or label) so the user knows it needs a decision, not just a reply.
2. **Blocking vs. non-blocking.** Blocking review threads mean an agent is literally paused waiting for the verdict. These need a distinct visual treatment (e.g., a stronger indicator, a different position in the list) so the user sees them first. Non-blocking items can wait.

Each ThreadRow shows: the sender (agent name/role), a subject or first-line summary, a timestamp, and the review/chat + blocking indicators. The assistant's chat thread is pinned at the top — always visible, always accessible.

#### Two kinds of threads, one view

1. **Review threads.** An agent proposes a concrete action (deploy this, publish this, ship this skill change) and wants a verdict. These look like PR reviews. Review threads carry a blocking/non-blocking indicator — blocking means an agent is paused waiting for the verdict.
2. **Chat threads.** An agent starts (or continues) a conversation with a human. No verdict needed — it's a message thread. The human can reply, start a task from the conversation, or close the thread. The assistant's ongoing conversation is just a chat thread — pinned at the top of the thread list, never archived, but structurally identical to any other chat.

Both carry `reasoning`, both thread, both are searchable, both are part of the audit trail. The visual distinction is simple: review threads have a pending verdict and a blocking indicator; chat threads don't.

#### Review threads: the GitHub PR verdict model

Review threads don't map cleanly to yes/no. The right metaphor is a GitHub pull request review, which has three verdicts and unlimited inline comments:

- **Approve** — the action is fine as proposed. Ship it.
- **Comment** — neither approve nor reject. The human has something to say (questions, clarifications, nudges, "have you considered X?") without blocking. The agent reads the comment and responds; the item stays open until the human comes back to it or the agent changes the proposal.
- **Request changes** — block until the agent addresses the feedback. The agent revises and re-submits. The thread continues in place.

Inside any of those verdicts, the human can leave **inline comments on specific parts** of the proposed action — a line in a diff, a paragraph in a draft, a specific step in a plan. This is how "partial feedback" works: the human approves the overall thing but flags one specific detail, and the agent iterates on that detail without the human re-reviewing the rest.

This matters because not every item is a clean yes/no. Half the interesting ones are "yes, but also…" and Conversations needs a first-class shape for those. Binary approve/reject forces the human into premature decisions and trains them to rubber-stamp to avoid friction.

#### What lands as a review thread

- Skill changes (new skills, edits, retirements) at the assistant level. *Synchronous gate. Skills are powerful and compound across the factory.*
- Risk-tier ≥ medium task completions (deploys, publishes, customer-facing actions, anything irreversible).
- Failures the facilitators flagged for human attention.
- Outputs from the assistant's chat that need final approval before being written into `PRINCIPLES.md` or `FOCUS.md`.
- File-lease conflicts where two agents want the same artifact.

#### What lands as a chat thread

- An agent addressing a founder directly: "I noticed X, want to talk?" or "quick question about the brand voice before I ship this copy" or "I'm stuck, can you unblock me?"
- Founder ↔ agent conversation: the human messaging a specific agent directly. Good for narrow, agent-specific exchanges.
- Continuations of review threads after the verdict — the agent reports back on what it did, the human asks a follow-up, the thread ends.

#### What lives in the assistant's chat

- Cross-product patterns the facilitators noticed.
- Recurring obstacles across multiple cycles.
- Proposed changes to `PRINCIPLES.md` or `FOCUS.md` (rule changes, not work changes).
- Reflections on the previous month — what worked, what didn't, what to try.
- Things the human raised in passing that the assistant has been chewing on.

The assistant has five loose anchors it returns to (anchors, not a script):

1. What are we trying to do?
2. Where are we?
3. What's in the way?
4. What should we try?
5. When will we know?

Outputs that need approval (e.g. a proposed edit to `PRINCIPLES.md`) get drafted by the assistant and posted back into the thread list as a review thread. The verdict flows through the same grammar as any other review. Then the result is appended to `L4/REFLECTIONS/2026-MM.md` as a summary.

#### What does *not* land in Conversations

- Routine task completions (those go to the audit log, not the inbox).
- Knowledge updates (Knowledge view, async).
- Items waiting on prioritization rather than decision (these show up in the Rail). <!-- @lore AD8a: historical — Rail removed in U6 -->

#### Interaction grammar

On review threads (PR-shaped):

- `approve` — ship as proposed
- `approve with comments` — ship, but these comments go back to the agent for awareness
- `comment` — neither approve nor block; start or continue a discussion on the item
- `inline comment` — leave a comment on a specific part of the proposal (a diff line, a paragraph, a step)
- `request changes` — block until the agent revises and re-submits
- `edit` — modify the proposal inline and approve the modified version (shortcut for "request changes + here's exactly what I want")
- `reject` — block the action with a short reason; the proposal is dead, not revised
- `reply` — send a message back to the agent without approving or rejecting (e.g. "do you mean X?")
- `snooze` — defer (default 4h)
- `escalate` — route to the assistant's chat with the full review thread linked

On chat threads (message-shaped):

- `reply` — continue the thread
- `start a task` — turn the conversation into a concrete task for the agent to pick up
- `close` — end the thread; archive it
- `escalate` — route to the assistant's chat

**Design principle: decidability, not brevity.** 15-second decidability is the target for simple review items, but the view should never *force* a 15-second decision. When the human wants to have a conversation, the view lets them — and a good chat thread is worth 5 minutes of back-and-forth far more than a bad 15-second approve. Fast when fast is enough, conversational when the problem actually warrants it.

#### Bulk operations (review threads only)

Approve-similar, snooze-all-from-this-agent, mark-all-FYI-as-read. Chat threads are never bulk-actioned — they're individual conversations.

#### Human-initiated conversations

Founders can start new threads with agents directly. The RecipientPicker (N key) shows available agents with name, role, and active-session indicator. Select a recipient, type a message, send — the thread appears in the Conversations list. The agent responds asynchronously; thread updates arrive via WebSocket.

Founders can also dial into a running session (D key) to observe an agent's live activity stream. This is read-only — tool calls, reasoning steps, and cost accumulating — with filter tabs (All | Tools | Reasoning | Cost).

#### ArtifactView: five shapes

Review threads always have the same structure: reasoning + artifact + verdict. But the artifact being reviewed varies wildly depending on what the agent did. A code change looks nothing like a blog post looks nothing like a deployment plan. The Conversations view uses ArtifactView, which dispatches to one of five shape renderers based on content type.

Five ArtifactView shapes cover the range of work agents produce when building products (SaaS, content businesses, e-commerce, analytics products, and products that orchestrate external tools):

**text_diff** — code, configuration, documentation. Any change to text files. Renders as a side-by-side or inline diff: file names, line numbers, additions, deletions, context lines. Like a GitHub PR. Inline comments attach to specific lines. Automated check results (tests, lint, security) shown alongside. This is the most common review type for SaaS products.

**content_preview** — blog posts, newsletters, emails, landing page copy, product descriptions, social media posts, documentation. Content the agent wrote that will be published or sent to an audience. Renders as the reader will see it — the rendered output, not the markdown source. Inline comments attach to specific paragraphs or sections. Metadata sidebar shows word count, target audience, publish date, SEO data. For emails: subject line and mobile rendering preview.

**visual_comparison** — UI mockups, logos, marketing graphics, design assets. Visual artifacts the agent created or modified. Renders the image(s) at full size with before/after comparison (side-by-side, overlay slider, or gallery of variations). Comments are thread-level, potentially with region annotation for pointing at specific areas.

**action_summary** — deployments, pricing changes, CRM/ERP configuration, payment processor setup, DNS changes, feature flags, ad campaign setup, partnership outreach. The agent did or wants to do something in a system. There's no diff or visual to show — the artifact is a structured description of what will happen and its expected impact. Renders as a structured summary card: what's changing, why, impact analysis, rollback plan, checks passed, timeline. Comments are on the proposal as a whole.

**data_metrics** — performance reports, A/B test results, cohort analyses, financial projections, marketing ROI, feature adoption metrics. The agent analyzed data and presents findings. Renders as headline metrics (key numbers with trend indicators), charts (line, bar, pie — inline), narrative insights, and recommended next actions. Comments attach to specific recommendations.

Each ArtifactView shape has its own renderer in the Conversations view. The agent specifies the artifact shape when creating a review item via the `proposed_action.type` field. The view dispatches to the correct renderer.

**Extensibility via skills.** Each external tool integration can ship a skill that extends one of the base ArtifactView shapes with tool-specific fields. A Stripe skill extends action_summary with Stripe-specific payment/pricing structure. A Vercel skill extends action_summary with deployment-specific canary stages and monitoring. A Figma skill extends visual_comparison with Figma-specific metadata. The five shapes are the base renderers; skills specialize them.

**Inline vs. companion pane.** Simple artifacts render inline in the thread flow. Complex artifacts (multi-file diffs, full landing page previews, detailed dashboards) promote to a companion pane: conversation on the left, artifact on the right. The inline version shows a summary; the companion pane shows the full artifact. The founder can toggle.

**Implementation order** by frequency and value: text_diff first (most common for SaaS), then content_preview (essential for content products), then action_summary (needed for operations), then data_metrics (needed once products generate data), then visual_comparison (needed when agents produce design work).

---

### 4.2 The Rail — Prioritize <!-- @lore AD8a: historical — Rail removed in U6 -->

**Verb:** Prioritize.
**Home:** Right sidebar on desktop (always visible, expandable/minimizable); the Home tab on mobile.
**Rhythm:** Ambient; you glance at it. Engaged use ~3 minutes per day.
**Information density:** Medium. Compact, dense, no chrome.
**Borrows from:** oh-my-codex HUD, Windsurf Cascade's anticipation model, Cursor's background-agent status surface.

The Rail is the factory's vital signs. It shows current state at a glance — read it like a thermostat. <!-- @lore AD8a: historical — Rail removed in U6 -->

What surfaces in the Rail: <!-- @lore AD8a: historical — Rail removed in U6 -->

- **Active bets and their progress.** Each bet shown with a progress indicator (how far through the cycle, how many tasks complete vs. total).
- **Blocked agents or tasks.** Count of currently blocked items, with the ability to expand and see what's stuck on what. If an agent is paused waiting for a human verdict, this is where you notice.
- **Recent knowledge additions.** Count of new knowledge items since last visit. A signal that agents are generating learnings — and that curation may be needed.
- **Cost / token burn.** Current spend vs. budget for the day and week. A burn-down indicator that makes spend ambient rather than something you have to go look up.
- **System stability.** Basic health: how many agents are active, any session failures, any unresolved conflicts in the knowledge store.
- **Unread thread count.** Linked to Conversations — how many threads need attention.

What does *not* surface in the Rail: <!-- @lore AD8a: historical — Rail removed in U6 -->

- Approvals (those are Conversations).
- Chat threads (also Conversations).
- Knowledge updates (Knowledge view).
- Detailed audit trails (observability layer, not the Rail). <!-- @lore AD8a: historical — Rail removed in U6 -->

**Interaction grammar:**

- `nudge up` / `nudge down` — adjust the order of items the facilitators surfaced
- `acknowledge` — mark a blocker as known so it stops blinking
- `expand` — pop an item out; usually routes to the right view inside the app (Conversations, Work)

**Design principle: ambient, not interruptive.** The Rail can change colors, show counters, animate status indicators. It cannot demand attention. If something needs attention, it goes to Conversations and rings a phone. <!-- @lore AD8a: historical — Rail removed in U6 -->

**Keyboard-first:** arrow keys to move between items, enter to act, no mouse required.

---

### 4.3 Work — Plan and Track

**What it is:** The Linear of the factory. Bets and tasks — planning what to do and tracking what's in flight.
**Home:** A view in the Main Pane. Mobile Work tab (read-only).
**Rhythm:** Weekly planning (~15 minutes), daily glance at task progress.
**Information density:** High.
**Borrows from:** Shape Up's pitches-and-appetite model, Linear's issues-and-cycles model.

Work has a five-level drill-down hierarchy:

1. **Portfolio** — all products at once. Product cards with velocity sparklines, active bet count, status.
2. **Product** (= Team) — one product's view. Canvas (shaped/committed bets) + task list.
3. **Bet Detail** — the full pitch rendered as styled markdown blocks, task list with cost columns, artifact aggregation, thread section for discussion.
4. **Task** — individual task with owner, status, cost, and linked session outcomes.
5. **Session** — jump-out only (harness URL). HyperIdle shows session metadata and outcome; the harness hosts the actual session.

**The Canvas (planning).** Pitches shaped by the Product Managers show up as cards in a two-column layout: *shaped* (available pitches) and *committed* (what we're betting on this cycle). Capacity is shown as a visible limit on the committed column — you can't commit more than fits. The constraint is numeric (max 2–3 bets per cycle per product), not spatial — a list with a hard cap, not a whiteboard. Founders can create new bets with markdown pitches via the BetCreateDialog ("+" button on the Canvas).

**Task list (tracking).** Active bets show their tasks. Each task shows its owner, state, cost (money + tokens), and outcome. Tasks are agent-owned — **humans do not drag or manually move tasks between states**. Instead, humans request state changes via thread conversations attached to the bet or task. The task list gives visibility into what agents are working on without the human needing to dive into individual threads.

What surfaces in Work:

- Pitches from Product Managers (sketches, appetite, rabbit-hole notes).
- Human-created bets with markdown pitches and appetite budgets.
- Active bets and their status, with artifact aggregation from tasks.
- Tasks per bet — owner, state, cost (money + tokens), blockers.
- Portfolio-level product cards with velocity and cost metrics.
- Capacity indicator — a hard limit on committed bets, visually obvious.

**Interaction grammar (planning):**

- `create bet` — open BetCreateDialog, write markdown pitch, set appetite, create
- `commit` — move a shaped pitch to committed
- `comment` — add a note to a pitch to redirect shaping (via thread)
- `reshape` — send back to a Product Manager with notes (this becomes a review thread)
- `kill` — drop a pitch; it disappears after this cycle
- `ship` — close out a finished bet (which triggers a retro prompt in the assistant's chat)

**Interaction grammar (tracking):**

- `expand` — click a bet to see its tasks and full pitch
- `open thread` — jump to the task's or bet's conversation thread
- `bet actions` — pause, stop, adjust appetite (with consequence preview before destructive actions)
- `harness jump-out` — click session metadata to open in the harness

**Design principle: force trade-offs through limits.** The committed column has a hard cap. You can't commit 5 bets when the team has capacity for 2. The constraint is explicit and numeric, not spatial — simpler to implement, simpler to understand.

**No backlog.** Pitches that aren't picked expire after two cycles unless someone reshapes them. There is no "later" pile.

#### PitchCard and bet detail

PitchCard components in the Canvas are **previews** — enough to scan and decide, not enough to read the whole pitch. Each card shows: title (derived from first line of pitch markdown), product, appetite (money budget + optional token budget), status, and a one- or two-line summary.

Clicking a PitchCard opens the **bet detail** in the Main pane (with a breadcrumb back to the Product view). The detail view shows the full markdown body — the shaped pitch, rendered as styled markdown blocks (the Block primitive, §4.6) with proper heading/paragraph structure. Below the pitch: the task list for this bet (each task with owner, state, cost in money + tokens, outcome), artifact aggregation from tasks (gallery/stack layouts), and a thread section (§4.5) where the founder and agents discuss the bet. Bet-level human actions (pause, stop, adjust appetite) show consequence previews before execution.

Appetite uses **money + tokens, never duration**. Bets carry `costCapMinor`/`costCapCurrency` and tasks carry `costActualMinor`/`costActualCurrency` with structured minor-units currency handling.

---

### 4.4 Knowledge — Curate

**What it is:** The company wiki — a catalogue of knowledge items organized by practice and product.
**Home:** A view in the Main Pane (desktop only). No mobile equivalent.
**Rhythm:** Weekly. ~20 minutes.
**Information density:** Medium-high.
**Borrows from:** Notion databases (views as filtered perspectives on the same data), Guru (card-based knowledge with verification status), Confluence (spaces for organizational structure), the structural-maintenance feel of tending a community-of-practice wiki.

#### The nature of this wiki

The Knowledge view is the company's wiki. Think Confluence, not Jira. The human searches, filters, selects, reads, edits, and **creates** knowledge items directly. Knowledge items can be authored at any of seven scopes: factory, product, practice, team, bet, task, or user-private. Both humans and agents contribute to the knowledge base — agents through their workspaces, humans through this view and the KnowledgeCreateDialog. Threads (§4.5) can be attached to knowledge items for discussion, and per-block discussion (§4.6) allows anchoring comments to specific sections.

Both humans and agents also need to *find* knowledge items in this catalogue — the human through the Knowledge view UI, the agent through the materialization engine at session start. The access patterns are similar: browse by practice or product, filter by kind and status, search by keyword.

It reads from and writes to the canonical `knowledge_items` store via the Knowledge Fabric (see KNOWLEDGE_ARCHITECTURE.md §4). It is not an approval gate — knowledge flows freely between teams without per-change human review. Knowledge is *async curation* that prevents AI-only drift.

This is the most critical view to get right and the one most easily skipped, because nothing forces you to open it. Without it, the knowledge base is a community of bots talking to itself.

#### Why knowledge management tools fail — and how we avoid it

Enterprise knowledge tools (Guru, Tettra, Bloomfire) consistently fail for four reasons:

1. **Stale content.** No owners, no review cadence. Content rots and users stop trusting the system. → HyperIdle has facilitator agents that continuously organize, flag stale items, and score everything for attention. The lifecycle status (captured → active → stale → archived) creates a built-in health signal.

2. **Overwhelming volume without structure.** Flat lists or card walls of 500+ items with no meaningful mid-level organization. → HyperIdle organizes knowledge items into topics within practices and products (see below). Topics are the browsable mid-level structure.

3. **No clear curation workflow.** Tools offer editing but don't tell you *what to edit* or *why*. → HyperIdle has "views" (saved filter perspectives) that give the founder a starting point: "needs attention," "recently created," "stale."

4. **Search that doesn't work.** Generic full-text search returns too many results with no ranking. → FTS5 with results showing context: which practice or product, what kind, what status. Not just a list of titles.

#### Three scopes — each with different character

The Knowledge view has three scopes. They share the same data model (`knowledge_items`) and the same interaction grammar, but the knowledge inside them has different shapes, volumes, and access patterns.

**Practice scope** — the catalogue of cross-product knowledge, organized by practice (building, growth, product, ops, facilitation). Each practice groups knowledge items that share a craft: what works, what doesn't, anti-patterns, reusable patterns. Knowledge items within a practice are organized by **topic** — a curated grouping maintained by Practice Facilitators (e.g., within the building practice: file-handling, authentication, deployment, testing). Topics are not rigid categories — they're living groupings that the facilitators create, merge, split, and rename as knowledge accumulates. A mature practice might have 15-20 topics, each containing 5-50 knowledge items. This is the densest scope.

**Product scope** — per-product knowledge. Each product has its own set of knowledge items: the product brief, architecture decisions, brand guidelines, product-level principles, cycle reflections, accumulated learnings. These are also organized by topic within each product. Some knowledge items here are longer narrative documents (briefs, architecture), some are short structured entries (decisions, learnings). The mix varies by product and by phase — a product in exploration generates more knowledge than one in maintenance.

**Factory scope** — the company-level principles, focus areas, and portfolio strategy. Very few knowledge items (5-15). These are the constitution — written by the founders, changing rarely, overriding everything below. Editing a factory-level knowledge item changes how every agent in the company behaves.

All three scopes share the same fundamental structure: **topics containing knowledge items**. The difference is in volume (practices have many, factory has few), change frequency (practices change weekly, factory changes monthly), and who primarily contributes (agents propose practice knowledge, humans author knowledge at any scope). Knowledge items carry a `scope_kind` and `scope_id` that determine their organizational placement; items scoped to `user` are private and visible only to their author.

#### The catalogue — topics and knowledge items

The browsing experience is a catalogue, not a page tree. Knowledge items are the atomic unit — each one is a markdown document with metadata (kind, status, confidence, last-used, topic). Some are short (a paragraph), some are longer (a full brief). The UI does not distinguish between short and long — it shows the same knowledge item structure for all.

Topics group related knowledge items within a practice or product. The structure is:

```
Practice or Product
  └── Topic
        └── Knowledge item
        └── Knowledge item
        └── ...
  └── Topic
        └── Knowledge item
        └── ...
```

The founder navigates: select a practice or product → see its topics → browse knowledge items within a topic → select one to read and edit.

Topics carry health indicators: how many knowledge items, how many are curated (validated/active) vs. uncurated (captured/provisional), how many are stale. This lets the founder see at a glance which areas of knowledge are well-maintained and which need attention.

#### Curation through exploration

The primary job in the Knowledge view is curation — reviewing, editing, improving knowledge quality. But curation requires exploration. The corpus is too small (hundreds of items) and interaction frequency too low for algorithmic recommendation to work. No algorithm has enough signal. The human needs to explore for breadth — discovering gaps, noticing patterns across topics, finding stale knowledge items that no algorithm would flag. Only human exploration can create the right balance of depth and breadth in a corpus this size.

This means the Knowledge view must be an excellent **browsing** experience, not just an excellent **editing** experience. The founder needs to move fluidly between "show me what needs attention" (curation starting point) and "let me wander through the growth practice and see what's there" (exploration).

**Views as filtered perspectives.** Like Notion database views, the Knowledge view offers saved filter/sort perspectives on the same data. Each view is a different lens for a different intent:

- **By topic** (default) — knowledge items grouped under their topics within the selected practice or product. The natural browsing structure.
- **Needs attention** — knowledge items with high attention_score, sorted by score. The curation starting point: what the facilitators think needs human eyes this week.
- **Recently created** — newest knowledge items first. What are agents contributing right now? What are they "thinking about"?
- **Most accessed** — knowledge items agents reference most, sorted by usage. What's proving valuable?
- **Stale** — knowledge items not accessed or updated recently. What needs pruning?

Views are filters on the same data, not separate screens. Switching is instant. Practices and products go through cycles — sometimes generating lots of knowledge, sometimes mostly consuming it. The views adapt to wherever the cycle is.

#### What the founder does here

All async, none blocking:

- **Browse** by practice, product, or factory scope → browse topics → browse knowledge items within a topic
- **Search** across all knowledge — full-text, with results showing practice/product, topic, kind, status
- **Filter** by status, kind, confidence, or switch to a saved view
- **Read** any knowledge item — see its content, metadata, edit history, confidence, when agents last referenced it
- **Edit** inline — click and type, always editable. Changes save and version automatically. Every edit is logged in the edit log and helps the facilitators learn what humans correct.
- **Restructure** — merge duplicate knowledge items, split one that's too broad, rename drifted topics, archive stale knowledge items, create new topics, move knowledge items between topics

**Interaction grammar:**

- `search` — full-text search across all knowledge
- `filter` — narrow by status, kind, practice, product, topic
- `switch view` — change the active view (by topic, needs attention, recently created, most accessed, stale)
- `select` — open a knowledge item for reading and editing
- `inline edit` — modify content directly, auto-saves with version check
- `flag` — mark a knowledge item for the facilitator to revisit
- `merge` — collapse two knowledge items into one
- `split` — separate an overloaded knowledge item into two
- `rename` — fix a topic or knowledge item title that drifted
- `archive` — move stale knowledge out of ACTIVE status
- `move` — reassign a knowledge item to a different topic
- `create` — add a new knowledge item at any scope (factory, product, practice, team, bet, task, or user-private) via KnowledgeCreateDialog
- `change scope` — move a knowledge item to a different scope with reason tracking and version bump

**Design principle: editing collective intelligence, not grading homework.**

#### Knowledge view layout

The Knowledge view uses the standard IconRail → Submenu → Main pane structure. Two layout options to explore in design:

**Option A: Split-pane.** The submenu shows the scope selector (Practice / Product / Factory) and, below it, the topic list for the selected scope. Clicking a topic filters the main pane to show items in that topic. Multiple topics can be selected to union their items. The main pane is a list of knowledge items with the view switcher (by topic, needs attention, recently created, most accessed, stale) at the top. This works well for cross-topic curation — the topic list is always visible as a navigation landmark.

**Option B: Hierarchical accordion.** The submenu shows the scope selector. The main pane shows topics as collapsible section headers, with knowledge items nested below each. Expanding a topic reveals its items. The view switcher reorders topics and items within them. This keeps everything in one scrollable surface but can feel cramped with 15-20 topics.

Both options share the same usability requirements:

**What a KnowledgeRow shows.** Each list row must let the user decide whether to open the item without clicking. Required at a glance: title, a one-line preview (either the first paragraph or a dedicated summary field in the item), and tags for the key metadata — kind (pattern, anti_pattern, decision, failure, etc.), status (draft/active/archived), and topic. Each row also displays three relevance signals: last activity timestamp (recency), access count over 30 days (frequency), and citation count (where feasible). Items scoped to `user` show a "Private" badge.

**Grouping by topic.** The default "by topic" view groups items under their topic headers. Each topic header shows: topic name, item count, and a curation health indicator (how many items are active vs. captured/provisional vs. stale). The user must be able to toggle between grouped-by-topic and flat list.

**Three sort/recommendation modes.** Beyond the five saved views, the user needs three ways to orient:
1. **Classic navigation** — browse the topic tree, scan items alphabetically or by recency. For exploration.
2. **Agent-recommended for editing** — sorted by attention_score. What do the facilitators think needs human review right now? Items recently modified by agents, items with low confidence, items flagged for review. This is the curation starting point.
3. **Most accessed by agents** — sorted by usage frequency. These are the items agents rely on most — errors here have the highest cost, so quality matters most. This is where the human focuses editing energy for maximum impact.

**Browsing to editing transition.** Click a knowledge item in the list → the item opens in the main pane (replacing the list, with a breadcrumb to return). The item displays its full markdown body, editable inline. The user reads and edits in the same surface — no separate "edit mode." Changes auto-save with version checks. The list scroll position is preserved when the user returns via breadcrumb. The human is a senior member of the practice showing up to tend the garden, not an auditor signing off on every contribution.

---

### 4.5 The Thread primitive (cross-cutting)

A Thread is a *container* — an append-only, chronologically-ordered sequence of Messages attached to exactly one host entity. The thread itself has no shape; the *messages* do. Most messages are plain text. Some are *rich* and carry their own inline UI — a review message embeds an artifact reference plus a verdict affordance, a questionnaire message embeds a constrained answer set plus an answer slot. This is the generative-UI pattern every modern AI chat product converged on in 2025–2026. The factory leans into it.

This section is the cross-cutting concept the four views share. Conversations is one renderer of threads; the bet detail, task detail, knowledge item detail, artifact detail, and assistant surface are others. Earlier drafts of `§4.1` used "review thread / chat thread / assistant thread" as if they were thread types — they are not. The differences live on *messages* (typed shapes) and on a thread's *configuration* (host + visibility + membership + pinning), never on the thread itself.

#### 4.5.1 Definition and essential properties

**Thread.** Every thread has:
- An **id** — server-generated, opaque.
- A **host** — exactly one (entity kind + entity id). Host = the entity the thread is *about*. Not the creator (that is `initiator`); no thread has an owner. A thread on a bet exists to discuss that bet. Closed host kinds: `bet`, `task`, `knowledge_item`, `artifact`, `agent`, `user`, `team`, `factory`. There are no orphan threads. A assistant-style thread that has no domain object to attach to attaches to the *user themselves*.
- An **initiator** — the identity that opened the thread.
- **Participants** — the set of subscribed identities. Agents and humans are identities in the same matrix, not separate categories.
- **blocking** — derived; the rule is in §4.5.5 below.
- **pinned** — a boolean. Pinned threads surface at the top of any list rendering them.
- **resolvedAt** — a timestamp or null. Set when the thread's underlying ask is settled — a verdict on a review, an answer on a questionnaire, a `close` on a chat. Re-opening clears it.
- **createdAt**, **lastActiveAt** — timestamps.

The architect picks the exact column names, types, and identity encoding during planning. The contracts above are what every implementation must preserve.

> **Note on `syncMode` (dropped).** An earlier draft of this section carried a `syncMode ∈ {sync, async}` field. It was redundant with `blocking`: `sync` ≡ `blocking=true at this moment`, `async` ≡ `blocking=false`. Two fields meaning the same axis produce two sources of truth. The concept names a single derived field, `blocking`, and treats sync/async as descriptive language for the same axis from the human-prose side.

**Message.** A Message is the unit inside a thread:
- **id** — server-generated, opaque.
- **threadId** — exactly one.
- **sender** — identity (agent or human).
- **type** — a discriminant from a closed vocabulary. Initial set: `plain`, `review`, `questionnaire`, `verdict`.
- **payload** — typed by `type`. Plain carries text and may embed inline references (knowledge item, task, artifact). Review carries the artifact reference plus the verdict-affordance hint. Questionnaire carries the constrained answer set plus the answer-slot hint. Verdict carries the binding `decision` (one of the 5 binding actions) and `resolvesMessageId` pointing at the review or questionnaire message it terminates.
- **createdAt**.

Rich messages render via a typed dispatch — a TypeScript discriminant with exhaustiveness checked by the compiler. There is no untyped HTML payload.

**Verdicts and questionnaire answers are themselves Messages** (with their own type) appended to the thread. They are not hidden state on the review/questionnaire message. The audit trail lives in the message sequence: who said what, when, in order.

#### 4.5.2 Configurations vs. shapes

A **thread configuration** is a recognisable preset of host / visibility / membership / pinning that produces a familiar experience without being a separate primitive:

- **DM** — host is an agent or user; participants = {sender, recipient}; pinned = false.
- **assistant thread** — host is the user themselves; participants = {user, assistant}; pinned = true; never auto-archived.
- **Feed** — host is `team` or `factory`; participants = the team's agents plus the founders (or all agents + founders, for `factory`); pinned = false; messages are mostly broadcast plain announcements.

Configurations are *not* a typed enum on the thread row. They are described patterns — recognised by host + participants + pinning, rendered with the same primitive. A Builder sending a question to a Product Manager is a DM whether or not we label it; the queue treats it as such because of its host and participants. Configurations live in the *concept doc* and the *style guide*, not in the schema.

**Message shapes** (`plain`, `review`, `questionnaire`) are the closed enum on the message row. They are the *generative-UI dispatch*; configurations are *visibility/membership presets*. These are different axes. Mixing them — calling DM a "shape" or calling review a "configuration" — is the conflation the founder reframe rejects.

#### 4.5.3 What a Thread is NOT

- **Not a Message.** They live at different levels. The thread is the container; the message is the event inside it. "Review thread" is shorthand for "a thread that contains a review message awaiting a verdict" — the review shape lives on the *message*.
- **Not a "review-shape" or "chat-shape" thing.** A thread may mix message types — a review message followed by plain replies followed by a questionnaire is a normal sequence, not a thread "morphing" between types.
- **Not a route, a view, or owned by Conversations.** Conversations is one view over threads (filtered to threads where the human is a participant). The bet detail is another. The artifact detail is another. None of them owns threads — threads attach to hosts and exist whether or not any view is open.
- **Not free-form HTML.** Rich messages render via a typed dispatch. New rich types require a concept-doc update first.
- **Not a place for visibility / membership / pinning *as message properties*.** Those belong on the thread (configuration).
- **Not the audit trail.** Threads are *part* of the audit trail (events flow to the Event Bus, ARCHITECTURE.md §2.6). They are not the audit trail's only form, and they are not designed to be tamper-proof — the immutability of message payloads supports the audit, but the source of truth for compliance is the event log, not the thread.

#### 4.5.4 Composition

- A Thread **carries** Messages (1:N, append-only).
- A Thread **attaches to** exactly one host entity (1:1; by reference, not embedding).
- A Thread is **referenced by** filtered views: the Conversations queue, the host's detail surface, the Rail's unread count. <!-- @lore AD8a: historical — Rail removed in U6 -->
- A Message **carries** a typed payload. Rich payloads **embed references** to other primitives (artifact, knowledge item, task, bet) but never **own** them — embeddings are fetched and rendered inline as cards. (A *block* is not embedded as a card — the bridge from a thread message to a specific block is the block-anchor metadata, see §4.6.5; cards are reserved for whole-entity references.)
- A response (verdict, questionnaire answer, plain reply) is **itself a Message** in the thread.

#### 4.5.5 Lifecycle

```
created (open) ──► messages append ──► resolvedAt set ──► (optional) re-opened
                                                                 │
                                                                 ▼
                                                             archived
```

- A thread is *open* by default; `resolvedAt` is null.
- Messages append; `lastActiveAt` updates.
- The thread becomes *resolved* when its underlying ask is settled. `resolvedAt` is recorded.
- A thread can be **re-opened** (resolved is not terminal); re-opening clears `resolvedAt`.
- A thread can be **archived** (soft-delete; history preserved). Archived threads do not surface in queues but remain queryable.

`blocking` is *derived*, not stored. The rule:

> A thread is **blocking** iff the agent participating in the thread cannot continue to work without an answer to a message in this thread.

This is a single semantic test, decoupled from session state. The agent may have ended its session, paused, or be running a different session; what matters is whether *progress on the work the thread is about* depends on the answer. Common shapes:

- A `review` message awaiting a binding verdict before the agent can ship → blocking.
- A `questionnaire` message awaiting an answer the agent needs to choose its next step → blocking.
- A `plain` "quick question" message where the agent has paused everything pending the reply → blocking.
- A `plain` FYI message → not blocking, even if it goes unread.
- An unanswered review on a thread whose agent has finished and walked away (the work is done from the agent's side) → not blocking.
- A assistant thread to the user (no agent waiting on the user) → not blocking.

The architect picks the storage during planning (a `blocked_on_thread_id` reference on the task or session, an explicit lock row, an event-sourced flag, or a deterministic join). The concept rule is the iff above; the storage choice must satisfy it.

Blocking drives ordering: blocking threads sort first in any rendered list, because an agent is literally waiting.

**Multi-participant ordering.** Messages within a thread are ordered by `(createdAt, id)` ascending — the message id is monotonic / lexicographically tiebreaks `createdAt` collisions. This guarantees deterministic re-render order even when two agents post in the same millisecond.

#### 4.5.6 Authority

- **Server is source of truth.** The thread row plus message rows live in the Primitive Store (ARCHITECTURE.md §2.1); every write emits an event to the Event Bus (§2.6). Clients subscribe via WebSocket.
- **Initiator** owns the thread's existence (created it). **Any participant** can post a message — agents and humans alike.
- **Hosts reference threads, not the other way round.** A bet does not own its threads; it references them. The concept rule (which constrains the architect's schema choice) is:
  1. **Hosts cannot be hard-deleted while threads reference them.** The system uses soft-archive only for hosts that have ever had a thread. Hard delete is reserved for never-discussed entities.
  2. **Archiving a host inherits the archived state on its threads.** Threads disappear from queues but remain queryable via the host's archived view and via direct id.
  3. **Re-homing is illegal except for one constrained case.** A thread's host is immutable except: when a `user` host is offboarded, its assistant thread re-homes to `factory` (so reflections in `L4/REFLECTIONS/` retain a host). Every other host transition requires a new thread.
- **Agents and humans are equal participants.** An agent can initiate a thread to a founder. A founder can initiate a thread to an agent. The same model serves both.
- **Idempotent appends.** Because clients post messages over WebSocket-with-at-least-once-delivery, a message append carries a client-generated idempotency key (`clientKey`); the server treats `(threadId, sender, clientKey)` as the unique constraint and replies with the canonical id on a duplicate. This prevents duplicate appends after a retry.

#### 4.5.7 Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Thread** | Container for messages, attached to exactly one host. | conversation, chat, dialog, "review thread" (as a primitive), "chat thread" (as a primitive), "assistant thread" (as a primitive) |
| **Message** | Element inside a thread; typed (`plain` / `review` / `questionnaire`). | post, comment, entry. The `Item` shape in §7 is *one* expression of a thread payload; it is not a synonym for Message. |
| **Plain message** | The default text shape. | chat message, regular message |
| **Rich message** | A message that carries its own inline UI via a typed renderer. | embed, card, generative-UI message (descriptive, not the type) |
| **Review message** | Rich message embedding an artifact reference + a verdict affordance. | review item, review thread (the latter conflates levels) |
| **Questionnaire message** | Rich message embedding a constrained answer set + an answer slot. | form, survey |
| **Host entity** | The entity the thread is *about* (bet / task / knowledge_item / artifact / agent / user / team / factory). | parent, owner, target |
| **Thread configuration** | Recognisable preset of host + visibility + membership + pinning (DM, assistant, feed). | thread shape, thread type, thread kind |
| **Verdict** | The *binding* response to a review message — one of `approve`, `approve-with-comments`, `request-changes`, `edit`, `reject`. A verdict terminates the review (sets `resolvedAt` on the underlying message). The other five verdict-grammar actions in `docs/human-interface-layer/verdict-actions.md` (`comment`, `inline-comment`, `reply`, `snooze`, `escalate`) are **review actions**, not verdicts. | decision (overloaded), action (overloaded) |
| **Review action** | A non-binding response to a review message. `comment`, `inline-comment`, `reply` emit a `plain` message in the thread; `snooze`, `escalate` are sidecar workflow operations (see §4.5.8 for which emit messages). | — |

#### 4.5.8 Contracts

- **Cardinality.** Every thread attaches to exactly one host (1:1 thread → host). A host can have many threads (1:N host → threads). Every message belongs to exactly one thread (1:1 message → thread).
- **Closure.** Message-type vocabulary is closed: `plain`, `review`, `questionnaire`, `verdict`. Adding a new type requires a concept-doc update first (this section). Host-kind vocabulary is closed: `bet`, `task`, `knowledge_item`, `artifact`, `agent`, `user`, `team`, `factory`. Adding a new host kind requires the same.
- **Mutability.** A thread's host is **immutable** after creation, except the user→factory re-home on user offboarding (§4.5.6). `pinned`, `resolvedAt`, `lastActiveAt` are mutable; `blocking` is derived. Messages are **append-only**: after a message is persisted, its payload is immutable. Soft-delete (a `deletedAt` flag) is allowed; in-place edits are not. (Audit invariant: what an agent or human saw at decision time stays the same.)
- **Redaction.** Sensitive content (a pasted secret, PII flagged for removal) is redacted by *replacement payload*, not in-place edit: the message's payload is replaced with `{ redacted: true, redactedBy, redactedAt, reason }` while preserving the message's id, sender, type, and createdAt. The audit trail records both the redaction event and the replacement. In-place text edits are still not allowed.
- **Identity.** Threads and messages have opaque, server-generated ids. Message ordering within a thread is by `(createdAt, id)` ascending — the id breaks createdAt ties for deterministic re-render.
- **Idempotency.** Message appends carry a client-generated `clientKey`; the server's unique constraint is `(threadId, sender, clientKey)`. Duplicates return the canonical id, not a new row.
- **Verdict semantics.** Five verdict-grammar actions are *binding verdicts* and emit a `verdict`-payload message that terminates the review: `approve`, `approve-with-comments`, `request-changes`, `edit`, `reject`. Three more emit `plain` messages in the thread but do not terminate: `comment`, `inline-comment`, `reply`. Two are sidecar workflow operations and emit no message in the thread itself: `snooze` (a per-recipient defer, recorded on the thread or on the routing item, not in the message stream), `escalate` (creates a *new* thread on the assistant's assistant configuration, with a back-reference to the original — not an in-place message). This split keeps the audit trail clean: every action that *changes the substance of the conversation* is a message; every action that *changes the routing or workflow* is sidecar state.
- **Hard rules.**
  1. The Conversations view is a *view*, never an owner. Threads do not depend on Conversations to exist.
  2. Threads carry attachments — no orphan threads. assistant-style threads attach to the user themselves.
  3. Rich messages render via a typed dispatch (TypeScript discriminant exhaustiveness checked by the compiler). No untyped HTML payloads.
  4. A binding verdict is a message in the thread, not a hidden state on the review message.
  5. Adding a new message type, a new host kind, or a new verdict-grammar action requires updating this section first — not the schema, not the renderer, not `docs/human-interface-layer/thread-primitive.md`.
  6. `resolvedAt` is not terminal. Threads can be re-opened.
  7. Hosts cannot be hard-deleted while threads reference them; soft-archive only.

#### 4.5.9 Rationale

This shape comes from the post-journey-v3 alignment review founder reframe (`docs/reviews/improvements-conversations.md`):

> "Every discussion should be a thread. Also on the artifacts. Every knowledge/concept/document piece should be a block. Every output an artifact. So these three should be the first 3 stories. Work, Knowledge, Conversation are our 3 domains. And artifacts, blocks, thread is how their objects are shared into other domains where necessary."

The reframe replaces an earlier "thread shape vocabulary" — review thread, chat thread, assistant thread — that had grown by accretion across the journey docs (`§3.4` and `§4.1` of this document still carry fragments of that older framing; cross-references at the top of those sections point here as the corrective). The earlier vocabulary mistook *configurations* (DM/assistant/feed) and *message shapes* (review/questionnaire/plain) for thread types. They are not.

The reframe also consolidates four otherwise-divergent implementations that have already started accreting in code: `MockReviewItem` in `packages/web/src/pages/ConversationsReview.tsx:22-33`, `MockThread` in `ConversationsChat.tsx:14-32`, the `MockBetComment` array in `WorkBet.tsx:24-28`, and the page-local `MOCK_REVIEWS` / `MOCK_THREADS` constants. Each of those would, left alone, become its own "comment thread" / "review thread" / "chat thread" model — four similar models, four implementation paths, four bugs in the same place. One Thread primitive — one schema, one renderer, one set of affordances — replaces them. New cross-domain affordances (per-block discussion in L26, threads on artifacts in L11/L12, threads on tasks) inherit it for free.

#### 4.5.10 Relationship to the legacy Item / Response model (§7)

The Item / Response data model in `§7` predates this section. It expresses a *single* surfaced item plus a *single* response — the unit of routing the meta layer ships. The Thread primitive is broader: a thread carries a sequence of messages over time, of which an Item is one expression (the surfaced ask, often a review message) and a Response is another (the verdict, a message in its own right).

The concept rule (which constrains the architect, not just suggests):

1. **`threads` and `messages` are the source of truth for the conversation history**, including review verdicts and questionnaire answers. Verdict-payload messages replace the legacy `responses` table; the `responses` table is dropped in the L1 migration.
2. **`items` is the Router's working set** (what's surfaced where, with what verdict outstanding). It is a derived projection of the thread + message sequence — not a parallel source of truth. An `item` row is created when a review message routes to a view; it is closed when the corresponding verdict message lands. Item kinds (`review` / `chat` / `coach` / `skill_change`) remain routing categories on the item row; they do not appear on the thread row.
3. **Conversations queue source-of-truth = `threads` table.** The queue is `SELECT thread WHERE current_user IN participants AND NOT archived`, not a query against `items`. The `items` table powers routing notifications, not the queue rendering.
4. **Routing rules in ARCHITECTURE.md §2.2 read both** during the transition: the Router computes `Item.kind` for routing today, sourced from the message that triggered the routing (a review message produces `kind=review`, a plain message addressed to a founder produces `kind=chat`, etc.). Once every routing rule has migrated to reading message types directly, `Item.kind` becomes derived; until then it's stored.
5. **Adding a new rich message type does not require expanding `Item.kind`.** Item kinds are routing categories; message types are payload shapes. The router decides how to map a new message type to the existing routing categories at the time it ships.

The architect picks the migration sequencing — whether `items` and `responses` are refactored in L1 itself or kept-then-removed in subsequent stories — but the five rules above hold either way.

---

### 4.6 The Block primitive (cross-cutting)

A **Block** is a derived structural unit of a markdown body — an addressable section of structured prose (heading, paragraph, list, code, quote, table, etc.) extracted from a GitHub-flavoured markdown source so a body renders as proper prose with per-section affordances. The on-disk format stays plain GFM; blocks are a runtime view, never a stored dialect.

This section is the cross-cutting concept the prose-bearing surfaces share — knowledge bodies (§4.4) and bet pitches (§4.3). Conversations (§4.1) does **not** use blocks: chat messages are messages, not blocks. The long-form authority is `docs/blocks/`; this section restates the load-bearing properties.

#### 4.6.1 Definition and essential properties

Every block has:
- An **id** — server-computed, deterministic from `(host, content, position_context)`. Stable across re-parse with identical input. Opaque to the client; clients never compute ids.
- A **kind** — discriminant from a closed vocabulary: `heading | paragraph | list | list_item | code | quote | table | table_row | hr | image`.
- A **content** payload typed by `kind`.
- A **source span** — offset range into the original markdown for round-trip.
- An **occurrence index** — the block's position among siblings of the same kind under the same parent (used in id derivation to disambiguate duplicates).
- A **host reference** — `knowledge_item:<id>` or `bet:<id>`. Identifies which body this block was derived from.

Children, where the kind nests (a list contains list_items, a table contains table_rows), are ordered child blocks under the parent and have their own ids.

#### 4.6.2 What a Block is NOT

- **Not a stored entity.** Blocks are derived from the body; the body stays markdown text in `knowledge_items.body` or on the bet's pitch. There is no `blocks` table that mirrors the body.
- **Not a markdown dialect.** No `{#id}`, no `:::block-id:::`, no HTML-comment markers. Block ids are reproducible from content + position alone. The dialect stays GFM so external tools (LLMs, file watchers, GitHub preview, plain editors) keep working.
- **Not a Notion-style typing primitive.** No "/" command, no callout block, no embed block, no toggle, no synced block, no template. The kind enum is closed and tied to GFM's grammar. (Founder filter: "no customizable block kits.")
- **Not a linking primitive.** The block-anchor is a *scope* on a thread message — the pair `(host_id, block_id)`. It is not a `[[block-id]]` chip rendered inline. L24 (linking) is deferred and L26 must work without it.
- **Not a message in a thread.** Threads (§4.5) carry typed Messages; bodies (§4.6) carry blocks. Conversations does not use blocks; Work and Knowledge do.
- **Not a knowledge item, a bet, or a document.** A knowledge item is the addressable unit of curation; a block is a structural unit *inside* its body. Different lifecycles, different ownership.
- **Not the unit of editing.** The body is the editable surface; on save / on file-watcher pickup, blocks re-derive. There is no "edit block X" API.

#### 4.6.3 Composition

- A **body** is composed of an ordered list of blocks (1:N body → blocks; ordering matches the markdown source).
- A **block** belongs to exactly one body (1:1 block → body).
- A **block** hosts 0..N anchored thread messages — the anchor is the pair `(host_id, block_id)` carried as optional metadata on a thread message; the thread itself attaches to the host per §4.5.
- A **block** may carry child blocks where the kind nests (list ⊃ list_items, table ⊃ table_rows).

The block-anchor is the bridge to §4.5: a thread message scopes itself to a specific block by carrying the block_id; the thread primitive does not know about blocks, the block primitive does not know about threads. The anchor is opaque metadata.

#### 4.6.4 Derivation pipeline

```
markdown text → GFM parser → AST → flatten → block list → id-stamp → derived view
```

The pipeline runs server-side: in fabric for file-backed bodies (file-watcher ingest), in the API layer for client-edit saves. Clients render the derived view they receive; clients never compute ids.

Stable id properties (the contract; the architect picks the formula):
1. **Determinism.** Same markdown twice → same ids.
2. **Local stability.** Editing block X changes only X's id; siblings keep theirs.
3. **No cross-document collision.** Same paragraph text in two knowledge items → two different ids. Block ids are scoped by `host_id`.

Round-trip is **lossless** for the supported kinds — a renderer that emits markdown from the block list produces text byte-equivalent to the input (modulo whitespace normalisation the parser already performs).

#### 4.6.5 Block-anchor (per-block discussion)

Per-block discussion is the load-bearing reason this primitive exists. The block-anchor is a coordinate, not an inline reference:
- A thread attaches to the host (the knowledge item or bet) per §4.5.
- A message in that thread MAY carry an optional `anchor: { block_id }` metadata field.
- When set, the message renders next to that block in the host's body view.

When the body is edited and a block-anchor's `block_id` no longer corresponds to any block in the re-derived view, anchored messages are **preserved** with an **anchor lost** indicator. The system deliberately does not distinguish between "block deleted" and "block edited in place" — both produce the same observable (the old `block_id` no longer matches), and the data layer cannot reliably tell which scenario occurred. The renderer is honest about this: one indicator, "anchor lost," not two indicators pretending to know the cause. (Long-form: `BLOCKS.md §6.1`.) Anchored messages outlive their block.

#### 4.6.6 Authority

- **The body is the source of truth.** `knowledge_items.body` for knowledge; the bet's pitch for bets.
- **The server runs derivation.** Pipeline lives server-side; clients never compute ids.
- **No "block CRUD."** There is no API to create / update / delete a block in isolation. Edit the body; blocks re-derive.
- **Block ids are not user-meaningful.** Not slugs, not URL fragments, not titles. Internal coordinates only.

#### 4.6.7 Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Block** | Derived structural unit of a markdown body — addressable, stable-id, runtime-only. | section, chunk, Notion block, page block |
| **Block kind** | The closed-enum role a block plays. | block type, block shape |
| **Block id** | Stable, deterministic, server-computed identifier for a block. | block uid, block hash, slug (slugs are URL-friendly title derivatives — different concept) |
| **Body** / **markdown body** | The on-disk-or-persisted GFM markdown source from which blocks derive. | document, doc, source, content (overloaded — `content` is the *payload of one block*) |
| **Derivation** | The ingestion-time transformation from markdown text to a list of blocks. | parsing (one step inside derivation), ingestion (the watcher-level pipeline that also handles frontmatter + diff) |
| **Block-anchor** | The block primitive's affordance for scoping a thread message to a specific block. The pair `(host_id, block_id)`. | block link, block ref, anchor link (URL fragments — different concept) |
| **Markdown block** | Disambiguator for *Block primitive* when the context could collide with `ReasoningBlock` (a Tier 2 design system component). Use in user-visible copy when ambiguous. | — |

#### 4.6.8 Contracts

- **Cardinality.** Body has 0..N blocks. Block belongs to exactly 1 body. Block hosts 0..N anchored messages (cardinality on the message side).
- **Closure.** Block-kind vocabulary is closed. Adding a new kind requires updating the kind list in `BLOCKS.md §5.2` first.
- **Mutability.** Blocks are immutable derivations — never patched. The body changes; blocks re-derive.
- **Identity.** Opaque, server-computed, scoped by `host_id`.
- **Hard rules.**
  1. **The on-disk format is GitHub-flavoured markdown.** Blocks are a derived view, never a stored dialect.
  2. **Block ids are not user-meaningful.** Not slugs, not URL fragments, not titles.
  3. **Block kinds are closed.** Adding a new kind requires a `BLOCKS.md §5.2` update first.
  4. **Conversations does not use blocks.** Chat messages are messages, not blocks.
  5. **The block-anchor is independent of any linking primitive.** L24 is deferred; L26 must work without it.
  6. **Anchored messages outlive their block.** When the body changes and an anchor's `block_id` no longer matches a block in the re-derived view, anchored messages are preserved with an "anchor lost" indicator. The system does not claim to distinguish "deleted" from "edited" — one indicator, honest.
  7. **The pipeline is server-authoritative.** Clients render derived views; clients never compute ids.

#### 4.6.9 Rationale

The shape comes from the post-journey-v3 founder reframe: "Every knowledge/concept/document piece should be a block. […] Work, Knowledge, Conversation are our 3 domains. And artifacts, blocks, thread is how their objects are shared into other domains where necessary." Plus the explicit founder filter on dialect — "we do not introduce a new markdown dialect; the markdown dialect stays GitHub dialect compatible."

The reframe and filter together force the *derived view* model. Stored block-rows would force agents into a dialect; markdown extensions (`{#id}`, `:::block:::`) would break LLM round-trips and external editors. The derived view sits behind both: the source stays clean GFM; the system gets the structural view it needs to render prose, anchor discussion, and stabilise ids across normal editing.

The reframe also consolidates two surfaces that today fall back to `<pre>` rectangles — the bet pitch in `WorkBet.tsx:262-267` (`@lore J5`) and the knowledge body in `KnowledgeDetail.tsx:301-307` (`@lore J7`). L2 makes them disappear in one stroke: one shared primitive, one renderer, two consumers.

For the long-form authority, including the block-kind table, the id-derivation contract, the round-trip rule, and the consumer story list, see `docs/blocks/`.

---

### 4.7 Artifact primitive (cross-domain)

**Definition.** An Artifact is a function-agnostic, task-rooted, persistent record of something the team has produced. It is the concept that lets Work surfaces, review messages in Conversations, and any future surface refer to the same "thing the team made" without each surface inventing its own type. Per the L-track founder reframe — *every output an artifact* — the primitive is one and the renderings are many.

**Essential properties.** Every Artifact has:

- `id` — opaque, stable identity assigned at creation.
- `producing_task_id` — the Task that produced it. Required at creation; never null; immutable.
- `kind` — the function-agnostic type label (illustrative, not enumerated here: code diff, deck, contract, dashboard, screenshot, drafted email, design, data analysis, decision with rationale, running service, communication draft, test/verification result, and any future output kind). The exact closed-or-open status of `kind` is settled in `/architecture`; the concept commits only to function-agnosticism.
- `preview` — a short representation (text excerpt, thumbnail reference, structured summary, or null) used by the gallery card and stack item. May be null at creation; populated when a render is ready. Once non-null, immutable for that render generation.
- `cost_from_session` — the money + token spend attributable to the session(s) that produced this artifact. May be null until the producing session settles. Once populated, immutable.
- `created_at` — when the Artifact record was created.

Anything not in this list is incidental and lives on a consumer surface (e.g. a gallery's filter state, a review-message's verdict) — not on the Artifact itself.

**What it is not.**

- **Not a File.** A File is a filesystem entry. An Artifact may correspond to one file, many files, or no file at all (e.g. a "decision with rationale" artifact is a structured record). File handling is a storage detail; Artifact is the user-facing primitive.
- **Not a Deliverable.** Deliverable implies a contract with an external recipient. An Artifact is internal evidence that work happened; some Artifacts later become Deliverables, but the primitive is upstream of that distinction.
- **Not an Output.** "Output" is the loose word the team uses in conversation. The canonical noun is Artifact. Output is an alias to retire — see Vocabulary.
- **Not bet-, product-, or portfolio-owned.** Artifacts root on Tasks. Higher-level surfaces (Bet detail, Product page, Portfolio gallery) **aggregate** Artifacts from their constituent tasks; they never own them and never mutate them.
- **Not the same thing as `ArtifactView`.** The pre-existing `ArtifactView` component (§4.1) is the renderer for a review message's `proposed_action` payload — one of five shapes (text_diff, content_preview, visual_comparison, action_summary, data_metrics). Those five shapes describe *how a preview is rendered inside a review-message embed*; they are a sub-vocabulary inside one of the four Artifact view-family layouts (see Contracts), not the primitive itself.
- **Not a fake thumbnail.** When `preview` is null, surfaces render an explicit placeholder. Surfaces never synthesise a fake image, fake metric, or fake excerpt to fill the slot.

**Composition.** An Artifact roots on exactly one Task (`producing_task_id`). Threads (L1) attach to Artifacts via the universal cross-area attachment contract — discussion of an artifact lives on the artifact itself. The producing Session contributes `cost_from_session`. Higher-level surfaces compose Artifacts upward by aggregation: a Bet's Artifacts are the union of its Tasks' Artifacts; a Product's Artifacts are the union of its Bets'; a Portfolio's are the union of its Products'. Aggregation is read-only.

**Lifecycle.** An Artifact is created when a Task produces something worth recording. At creation, only `id`, `producing_task_id`, `kind`, and `created_at` are guaranteed; `preview` and `cost_from_session` may populate later (preview when rendering completes, cost when the session settles). The Artifact is **not deleted** at this layer. Archival, supersession, and retention policy are out of scope for L3 and addressed in a later concept update if needed.

**Authority.** The producing Task owns its Artifacts. The producing Agent (running on that Task) creates them. Aggregating surfaces are read-only consumers. Threads attached to an Artifact are owned by their respective participants; the Artifact does not own its threads, it merely hosts them.

**Vocabulary.**

| Term | Definition | Aliases not to use |
|---|---|---|
| **Artifact** | A function-agnostic, task-rooted, persistent record of something the team produced. | Output, File, Deliverable, Result, Asset, Document, Product (in the noun sense) |
| **Producing Task** | The unique Task that owns an Artifact. | Source, Origin, Parent |
| **Preview** | The short representation used by gallery card and stack item. May be null. | Thumbnail (ambiguous — could be image-only), Summary (ambiguous — could be a synthesis) |
| **Artifact view family** | The closed set of four layouts that render an Artifact: gallery card, stack item, single full preview, review-message embed. | Variant, Mode, Style |
| **Review-message embed** | The Artifact view-family layout used when an Artifact is shown inline in a review message. Internally consumes the five `ArtifactView` shapes for its preview rendering. | Inline preview, Review widget |
| `ArtifactView` (component) | Pre-existing component that renders the five `proposed_action` shapes (text_diff / content_preview / visual_comparison / action_summary / data_metrics). It is the engine inside the review-message embed layout. | Do not use as a synonym for Artifact-the-primitive. |

**Contracts.**

- **Cardinality.** One Task → many Artifacts (zero or more). One Artifact → exactly one producing Task (required, immutable). Threads → Artifact: zero or more.
- **Closure (view family).** The Artifact view family is **closed** at four layouts: `gallery_card`, `stack_item`, `single_full_preview`, `review_message_embed`. Adding a fifth layout requires a concept-doc update first. (This is the L3 hard-rule from the spec, line 141.)
- **Closure (review-message-embed renderers).** The five `ArtifactView` shapes inside the review-message-embed layout remain governed by §4.1 — they are a separate closure independently maintained. Skill extensions specialise; they do not add new shapes.
- **Mutability.** `id`, `producing_task_id`, `kind`, `created_at` are immutable from creation. `preview` and `cost_from_session` may transition exactly once from null to a populated value; once populated, immutable.
- **Identity.** Opaque ID. Not a content hash (a re-render of the same artifact must keep the same identity); not a deterministic key derived from task + kind (a Task may produce many Artifacts of the same kind).
- **Fetching.** The system can fetch Artifacts filtered by Task, Bet, Product, or Portfolio. The shape returned is the canonical Artifact shape (above), with `cost_from_session` already populated where the session has settled.

**Hard rules** (violation downstream means the implementation has broken the concept):

1. **Artifacts root on Tasks.** Nothing else creates them. Bet/Product/Portfolio surfaces aggregate; they never own.
2. **The view family is closed at four layouts.** New layouts require a concept-doc update before any code.
3. **Threads attach to Artifacts via the L1 primitive.** No bespoke comment system on Artifacts.
4. **No fake thumbnails.** When `preview` is null, render a placeholder. Never synthesise.
5. **No emojis.**

**Rationale.** The L-track founder reframe — *"Every output an artifact"* — collapsed a sprawl of overlapping nouns (output, file, deliverable, result, asset) into one primitive that crosses Work, Knowledge, and Conversation. Without it, every surface that wanted to show "what the team made" reinvented its own shape, the dependency graph grew an undocumented edge into L11 and L12 (the founder noted L12 was missing from the graph entirely), and the existing component-named `ArtifactView` was carrying both the renderer-of-review-payloads job and the implicit-noun-for-an-output job at once. Locking Artifact as a task-rooted, function-agnostic primitive with a closed view family lets L11 (rich review messages) and L12 (Work surfaces) consume one shape and lets the existing five `ArtifactView` shapes remain a *renderer* concept inside one of four Artifact layouts — a cleaner separation than blurring the two.

---
