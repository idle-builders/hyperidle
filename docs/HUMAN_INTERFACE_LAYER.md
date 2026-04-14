# Human Interface Layer

How humans and the agent factory actually meet. This doc scopes the app-level architecture, the views inside it, the holistic user journey, the data model, and what the meta layer ships.

Two grounding documents sit underneath this one:
- `KNOWLEDGE_ARCHITECTURE.md` defined five conceptual modes (Factory Inbox, HUD, Bet Canvas, Coach Conversation, Practice Editor) — since consolidated into three views plus a sidebar.
- `RESEARCH_EXECUTION_LAYER.md` defined the agent-as-employee model and the five things an agent has (workspace, skills, inbox, memory, rhythm).

This doc bridges them. **The interaction modes live inside one app as three views plus an always-visible sidebar.** Two form factors. The human learns one pattern and moves between views without switching products. Think Slack + Linear + Notion — simplified, interleaved, and opinionated for a world where agents and humans collaborate as equals.

---

## 1. Why a Dedicated Interface Layer at All

The 2026 landscape is loud about one thing: most agent dashboards are unusable, and the reason is conflation. A single screen tries to be the inbox, the planner, the diff reviewer, the audit log, and the strategy doc all at once. It ends up being none of them. Real teams open it once, never again.

The tools that are working in 2026 (Devin, Cursor Background Agents, Factory Droids, Replit Agent 3, builderz Mission Control, MCP Agent Mail, LangChain Agent Inbox, Letta ADE, oh-my-codex HUD) all picked **one shape per mode of interaction** and built that shape well. None of them tried to be all four.

But the opposite failure mode is just as real: shipping *four separate applications* so the human has to decide which app to open based on what they want to do. That's where most agent-ops tooling lives in 2026 — a zoo of dashboards, CLIs, chat apps, and canvases, each with its own account and its own notification tray. It's exhausting.

The answer is neither a single mega-dashboard nor a swarm of apps. The answer is **one app, with well-defined views inside it, sharing one data model and one interaction grammar**. The human opens the factory. The factory presents the right thing.

---

## 2. Three Views + The Rail

The factory is Slack + Linear + Notion in one app. Each view maps to a well-understood tool category, simplified and opinionated for AI-human collaboration:

| View | What it is | Industry parallel | Key objects inside |
|---|---|---|---|
| **Conversations** | Messaging, reviews, coaching | Slack, Teams Chat | Threads (review, chat, coach) |
| **Work** | Planning and tracking | Linear, Jira | Bets, Tasks |
| **Knowledge** | Wiki — catalogue of knowledge items | Notion databases, Confluence | Topics, knowledge items |

Plus **the Rail** — an always-visible sidebar showing ambient factory state (active bets, blockers, cost burn, unread count). Not a view you switch to; a pane that's always there.

The Chief of Staff's chat is a pinned thread in Conversations, not a separate surface. The Rail handles ambient awareness and prioritization. Within each view, easy-to-understand objects create the complexity necessary to make it useful.

---

## 3. One App, Two Form Factors

The entire human interface layer ships as **one product: the Factory.** Two form factors — desktop and mobile — from one codebase, over one data model, with one interaction grammar.

### 3.1 Desktop (the workbench)

A single window with four zones:

- **The IconRail (always visible).** A narrow vertical strip of icons on the far left — one icon per view (Conversations, Work, Knowledge). Clicking an icon opens that view's Submenu and switches the Main pane. This is the only top-level navigation. Always visible, never changes.

- **The Submenu.** Each view has its own Submenu that opens when the view's icon is selected. For Conversations, this is the thread list. For Work, this could be the bet list. For Knowledge, the scope/topic browser. The Submenu is collapsible — the user can close it to reclaim screen space for the Main pane. Only one Submenu is open at a time.

- **The Main pane.** Where actual work happens. Shows the content for the selected view:
  - **Conversations** (the default — what's in front of you 90% of the time). Opens whichever thread is selected from the thread list Submenu. Used for review items, chat items, and the Chief of Staff conversation equally, because they're all threads.
  - **Work.** Bets and tasks — planning what to do next and tracking what's in flight. A destination, not a default.
  - **Knowledge.** The company's wiki — a catalogue of knowledge items organized by practice and product. A destination.

- **The Rail (right sidebar, always present).** A persistent sidebar on the right side of the window — the mirror of the IconRail on the left. Always visible on every screen, regardless of which view is active. Two states: **minimized** (a narrow strip of icons showing the most critical indicators — blocked count, cost burn, unread count) and **expanded** (a full panel showing the complete dashboard — bet progress, blocked agents, knowledge additions, system stability). The user can toggle between minimized and expanded at any time. Unlike the IconRail, the Rail is not navigation — it's ambient awareness. It's a layout zone that consumes space, just like the IconRail does on the left.

Breadcrumbs exist within each view (e.g., Knowledge → Building practice → Auth topic → "JWT rotation patterns") but never across views. Switching views via the IconRail is always a clean context switch.

The Factory is meant to sit open on a side screen during the workday. The IconRail gives you one-click access to any view; the Submenu gives you context within the current view; the Main pane is where you read and work; the Rail sits on the right as a persistent sidebar. Notifications only fire for blocking review items and for chat items the agent flagged as urgent — everything else is absorbed by the fact that the app is already there.

### 3.2 Mobile (the companion)

Three tabs, also one data model, also one interaction grammar:

- **Home.** The Rail, translated to a phone screen. Glanceable factory state — bets, blockers, cost burn, unread count.
- **Conversations.** The thread list plus individual threads. Review items, chat items, and the Chief of Staff's pinned chat all behave identically to their desktop counterparts. Full verdict grammar. Full reply affordance.
- **Work.** A read-only view of active bets and tasks with nudge-up/nudge-down ordering. On mobile you can reorder and react, not reshape.

**No Knowledge on mobile.** Curating a knowledge base on a phone is hostile. Knowledge is a desktop-only view.

Push notifications fire only for blocking review items and for urgent chat items. Everything else is silent and batched into a daily digest.

### 3.3 What makes this simpler

Technical:

- One codebase (PWA first, native mobile wrapper only if push integrations demand it later).
- One API, one auth, one data model.
- The threading UI is built once and reused for review items, chat items, the Chief of Staff's chat, and agent↔agent threads the human is copied on. It's the biggest component in the app and it's written exactly once.
- The Rail is a React sidebar component subscribing to the same event stream as everything else. No daemon, no menu-bar binary, no separate deployment target.
- Work and Knowledge become lazy-loaded routes inside the same shell. They ship when they're ready without blocking the rest.

UX / pattern learning:

- The human learns *one* chat grammar — verdicts, inline comments, replies, snooze, escalate — and uses it for every kind of thread.
- The holistic journey is "open the Factory." Not "check the inbox, then the HUD, then the canvas, then the coach." One door.
- Mode discipline (what belongs where) is enforced by *view routing inside the app*, not by shipping separate products. If we ever discover Work should collapse into Conversations, we just change the route.

### 3.4 Why the Chief of Staff chat is a pinned thread, not a separate surface

The Chief of Staff's ongoing conversation is structurally just a chat thread: one persistent conversation that never closes, addressed to the human, with a slightly different rhythm. Everything about it — replies, attachments, memory, escalation — is identical to any other thread.

Treating it as a separate app forces the human to learn two chat UIs. Treating it as *the top thread in the thread list*, always pinned, always visible, means the muscle memory for "reply to the Chief of Staff" is the same as "reply to a Product Manager." One pattern, learned once, used everywhere.

The Chief of Staff's behavior is still special — it's a continuously-running agent with persistent context, it brings up cross-product patterns, it never archives the thread — but its *surface* is a chat thread. Not a second app.

### 3.5 Why the Rail is a right sidebar, not a view or a widget

Earlier drafts treated the Rail as a menu-bar app or a tray widget. Later drafts made it a regular view in the IconRail. Both were wrong. A menu-bar widget requires a separate binary and a separate notification permission. A regular view means the user loses ambient awareness when they switch to Conversations or Work — the whole point of ambient state is that it's *always there*.

The right model is a persistent sidebar on the right side of the window — the mirror of the IconRail on the left. Minimized, it's a narrow strip of icons showing the critical numbers. Expanded, it's a full dashboard panel. It's a proper layout zone that's always present, on every screen, regardless of which view is active. This gives the app a symmetrical frame: IconRail on the left (navigation), Rail on the right (awareness). The Main pane and Submenu live between them.

Mobile gets the same thing as a dedicated Home tab — the Rail translated to a single scrollable screen. Same component, same data, same behavior, different layout.

If a deployer really wants a menu-bar widget later, it's a thin client over the same data model. It's additive, not the default.

---

## 4. The Three Views + The Rail

Each view gets a clear home in the app. They share data, they share identity, they share the thread model where applicable, but each has its own affordances tuned for its purpose.

### 4.1 Conversations — Review and Chat

**What it is:** The Slack of the factory. Messaging and reviews — all as threads.
**Home:** Thread list (submenu) + thread content (main pane). Mobile Conversations tab.
**Rhythm:** Whenever; smart-batched. Most items in seconds, some in short back-and-forth threads. The Chief of Staff's chat is persistent.
**Information density:** Minimal per item, but threads can grow.
**Borrows from:** MCP Agent Mail, LangChain Agent Inbox, builderz Mission Control's Aegis blocking gate, Devin Review's red/yellow/gray triage, **GitHub PR review's approve/comment/request-changes verdict model**, Read AI's persistent-context coach model, Letta's continuous sessions.

The Conversations view is where most interaction actually happens. It's the same thread infrastructure the agents use to talk to each other — one shared message store with identities, threads, and delivery rules. The thread list (the submenu for Conversations) is just the human's view into the threads addressed to them (or that they're copied on). Agents writing to other agents and agents writing to a founder go through the same pipes, with the same data model. Humans are identities in the matrix, not a special category outside it.

This has an important consequence: **agents can initiate conversations with humans**, not just surface things for approval. A Product Manager can message the founder with "hey, I noticed three of our recent Ambrovia bets all hit the same auth issue — want to talk about it?" That's not an approval item. It's an agent starting a thread. The human can reply, ignore, or escalate. The thread lives in the list either way.

#### ThreadRow: visual differentiation

The thread list must let the user distinguish two things at a glance without reading the content:

1. **Review vs. chat.** Review threads have a pending verdict; chat threads don't. The list item for a review thread (ThreadRow) carries a visible review indicator (icon, badge, or label) so the user knows it needs a decision, not just a reply.
2. **Blocking vs. non-blocking.** Blocking review threads mean an agent is literally paused waiting for the verdict. These need a distinct visual treatment (e.g., a stronger indicator, a different position in the list) so the user sees them first. Non-blocking items can wait.

Each ThreadRow shows: the sender (agent name/role), a subject or first-line summary, a timestamp, and the review/chat + blocking indicators. The Chief of Staff's chat thread is pinned at the top — always visible, always accessible.

#### Two kinds of threads, one view

1. **Review threads.** An agent proposes a concrete action (deploy this, publish this, ship this skill change) and wants a verdict. These look like PR reviews. Review threads carry a blocking/non-blocking indicator — blocking means an agent is paused waiting for the verdict.
2. **Chat threads.** An agent starts (or continues) a conversation with a human. No verdict needed — it's a message thread. The human can reply, start a task from the conversation, or close the thread. The Chief of Staff's ongoing conversation is just a chat thread — pinned at the top of the thread list, never archived, but structurally identical to any other chat.

Both carry `reasoning`, both thread, both are searchable, both are part of the audit trail. The visual distinction is simple: review threads have a pending verdict and a blocking indicator; chat threads don't.

#### Review threads: the GitHub PR verdict model

Review threads don't map cleanly to yes/no. The right metaphor is a GitHub pull request review, which has three verdicts and unlimited inline comments:

- **Approve** — the action is fine as proposed. Ship it.
- **Comment** — neither approve nor reject. The human has something to say (questions, clarifications, nudges, "have you considered X?") without blocking. The agent reads the comment and responds; the item stays open until the human comes back to it or the agent changes the proposal.
- **Request changes** — block until the agent addresses the feedback. The agent revises and re-submits. The thread continues in place.

Inside any of those verdicts, the human can leave **inline comments on specific parts** of the proposed action — a line in a diff, a paragraph in a draft, a specific step in a plan. This is how "partial feedback" works: the human approves the overall thing but flags one specific detail, and the agent iterates on that detail without the human re-reviewing the rest.

This matters because not every item is a clean yes/no. Half the interesting ones are "yes, but also…" and Conversations needs a first-class shape for those. Binary approve/reject forces the human into premature decisions and trains them to rubber-stamp to avoid friction.

#### What lands as a review thread

- Skill changes (new skills, edits, retirements) at the Chief of Staff level. *Synchronous gate. Skills are powerful and compound across the factory.*
- Risk-tier ≥ medium task completions (deploys, publishes, customer-facing actions, anything irreversible).
- Failures the facilitators flagged for human attention.
- Outputs from the Chief of Staff's chat that need final approval before being written into `PRINCIPLES.md` or `FOCUS.md`.
- File-lease conflicts where two agents want the same artifact.

#### What lands as a chat thread

- An agent addressing a founder directly: "I noticed X, want to talk?" or "quick question about the brand voice before I ship this copy" or "I'm stuck, can you unblock me?"
- Founder ↔ agent conversation: the human messaging a specific agent directly. Good for narrow, agent-specific exchanges.
- Continuations of review threads after the verdict — the agent reports back on what it did, the human asks a follow-up, the thread ends.

#### What lives in the Chief of Staff's chat

- Cross-product patterns the facilitators noticed.
- Recurring obstacles across multiple cycles.
- Proposed changes to `PRINCIPLES.md` or `FOCUS.md` (rule changes, not work changes).
- Reflections on the previous month — what worked, what didn't, what to try.
- Things the human raised in passing that the Chief of Staff has been chewing on.

The Chief of Staff has five loose anchors it returns to (anchors, not a script):

1. What are we trying to do?
2. Where are we?
3. What's in the way?
4. What should we try?
5. When will we know?

Outputs that need approval (e.g. a proposed edit to `PRINCIPLES.md`) get drafted by the Chief of Staff and posted back into the thread list as a review thread. The verdict flows through the same grammar as any other review. Then the result is appended to `L4/REFLECTIONS/2026-MM.md` as a summary.

#### What does *not* land in Conversations

- Routine task completions (those go to the audit log, not the inbox).
- Knowledge updates (Knowledge view, async).
- Items waiting on prioritization rather than decision (these show up in the Rail).

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
- `escalate` — route to the Chief of Staff's chat with the full review thread linked

On chat threads (message-shaped):

- `reply` — continue the thread
- `start a task` — turn the conversation into a concrete task for the agent to pick up
- `close` — end the thread; archive it
- `escalate` — route to the Chief of Staff's chat

**Design principle: decidability, not brevity.** 15-second decidability is the target for simple review items, but the view should never *force* a 15-second decision. When the human wants to have a conversation, the view lets them — and a good chat thread is worth 5 minutes of back-and-forth far more than a bad 15-second approve. Fast when fast is enough, conversational when the problem actually warrants it.

#### Bulk operations (review threads only)

Approve-similar, snooze-all-from-this-agent, mark-all-FYI-as-read. Chat threads are never bulk-actioned — they're individual conversations.

#### Mobile specifics

- Push only for blocking review items and chat items the agent flagged as urgent. Everything else batches into a daily digest.
- Each thread fits on one phone screen with action buttons above the fold. Thread history below.
- Diffs, screenshots, and long reasoning open on tap; never inline.
- Chat replies are a first-class mobile affordance — keyboard pops, reply, send. Full thread history on swipe.

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

### 4.2 The Rail — Prioritize

**Verb:** Prioritize.
**Home:** Right sidebar on desktop (always visible, expandable/minimizable); the Home tab on mobile.
**Rhythm:** Ambient; you glance at it. Engaged use ~3 minutes per day.
**Information density:** Medium. Compact, dense, no chrome.
**Borrows from:** oh-my-codex HUD, Windsurf Cascade's anticipation model, Cursor's background-agent status surface.

The Rail is the factory's vital signs. It shows current state at a glance — read it like a thermostat.

What surfaces in the Rail:

- **Active bets and their progress.** Each bet shown with a progress indicator (how far through the cycle, how many tasks complete vs. total).
- **Blocked agents or tasks.** Count of currently blocked items, with the ability to expand and see what's stuck on what. If an agent is paused waiting for a human verdict, this is where you notice.
- **Recent knowledge additions.** Count of new knowledge items since last visit. A signal that agents are generating learnings — and that curation may be needed.
- **Cost / token burn.** Current spend vs. budget for the day and week. A burn-down indicator that makes spend ambient rather than something you have to go look up.
- **System stability.** Basic health: how many agents are active, any session failures, any unresolved conflicts in the knowledge store.
- **Unread thread count.** Linked to Conversations — how many threads need attention.

What does *not* surface in the Rail:

- Approvals (those are Conversations).
- Chat threads (also Conversations).
- Knowledge updates (Knowledge view).
- Detailed audit trails (observability layer, not the Rail).

**Interaction grammar:**

- `nudge up` / `nudge down` — adjust the order of items the facilitators surfaced
- `acknowledge` — mark a blocker as known so it stops blinking
- `expand` — pop an item out; usually routes to the right view inside the app (Conversations, Work)

**Design principle: ambient, not interruptive.** The Rail can change colors, show counters, animate status indicators. It cannot demand attention. If something needs attention, it goes to Conversations and rings a phone.

**Keyboard-first:** arrow keys to move between items, enter to act, no mouse required.

---

### 4.3 Work — Plan and Track

**What it is:** The Linear of the factory. Bets and tasks — planning what to do and tracking what's in flight.
**Home:** A view in the Main Pane. Mobile Work tab (read-only).
**Rhythm:** Weekly planning (~15 minutes), daily glance at task progress.
**Information density:** High.
**Borrows from:** Shape Up's pitches-and-appetite model, Linear's issues-and-cycles model.

Work has two sub-views that live inside the same pane:

**The Canvas (planning).** Pitches shaped by the Product Managers show up as cards in a simple two-column layout: *shaped* (available pitches) and *committed* (what we're betting on this cycle). Capacity is shown as a visible limit on the committed column — you can't commit more than fits. The human drags cards from shaped to committed, or sends them back for reshaping. The constraint is numeric (max 2–3 bets per cycle per product), not spatial — a list with a hard cap, not a whiteboard.

**The Kanban (tracking).** Active bets expand into their tasks. Each task shows its owner, state, session count, and cost. Tasks are the objects agents actually work on — the Work view makes them visible without the human needing to dive into individual threads. Think of it as a simplified Linear board: bet → tasks → status, with enough visibility to spot a stuck task without micromanaging.

What surfaces in Work:

- Pitches from Product Managers (sketches, appetite, rabbit-hole notes).
- Active bets and their status.
- Tasks per bet — owner, state, blockers.
- Portfolio-level bets the Chief of Staff is shaping (which products to invest in, which to coast, which to kill).
- Capacity indicator — a hard limit on committed bets, visually obvious.

**Interaction grammar (planning):**

- `drag` a pitch from shaped to committed
- `comment` — add a note to a pitch to redirect shaping
- `reshape` — send back to a Product Manager with notes (this becomes a review thread)
- `kill` — drop a pitch; it disappears after this cycle
- `ship` — close out a finished bet (which triggers a retro prompt in the Chief of Staff's chat)

**Interaction grammar (tracking):**

- `expand` — open a bet to see its tasks
- `nudge` — reorder tasks or bets
- `open thread` — jump to the task's conversation in Conversations
- `flag` — mark a task for the Product Manager's attention

**Design principle: force trade-offs through limits.** The committed column has a hard cap. You can't commit 5 bets when the team has capacity for 2. The constraint is explicit and numeric, not spatial — simpler to implement, simpler to understand.

**No backlog.** Pitches that aren't picked expire after two cycles unless someone reshapes them. There is no "later" pile.

#### PitchCard and bet detail

PitchCard components in the Canvas are **previews** — enough to scan and decide, not enough to read the whole pitch. Each card shows: title, product, appetite (time budget), status, and a one- or two-line summary. Meta fields where valuable: cycle, progress indicator.

Clicking a PitchCard opens the **bet detail** in the Main pane (with a breadcrumb back to the Canvas). The detail view shows the full markdown body — the shaped pitch from the Product Manager, rendered as readable prose. Below the pitch: the TaskCard list for this bet (each task with owner, state, session count, cost), and a comment thread where the founder and agents discuss the bet. Think of a Linear issue with a rich description rather than a Jira ticket with 30 fields. Tasks within a bet are similarly simple: a title, an owner, a state, and a markdown body for notes. We can always add structured fields later if a pattern emerges.

**Mobile is read-only.** On mobile the Work tab shows bets and tasks as a flat list with status indicators and nudge-up/nudge-down ordering.

---

### 4.4 Knowledge — Curate

**What it is:** The company wiki — a catalogue of knowledge items organized by practice and product.
**Home:** A view in the Main Pane (desktop only). No mobile equivalent.
**Rhythm:** Weekly. ~20 minutes.
**Information density:** Medium-high.
**Borrows from:** Notion databases (views as filtered perspectives on the same data), Guru (card-based knowledge with verification status), Confluence (spaces for organizational structure), the structural-maintenance feel of tending a community-of-practice wiki.

#### The nature of this wiki

The Knowledge view is the company's wiki. Think Confluence, not Jira. It is **agent-free** — no human-agent interaction happens here. The human searches, filters, selects, reads, and edits knowledge items directly. Agents contribute separately through their workspaces; humans contribute separately through this view. They meet in Conversations (for proposals and discussions) and the Rail (for recommendations), not here.

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

All three scopes share the same fundamental structure: **topics containing knowledge items**. The difference is in volume (practices have many, factory has few), change frequency (practices change weekly, factory changes monthly), and who primarily contributes (agents propose practice knowledge, humans author factory knowledge).

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
- `create` — add a new knowledge item or a new topic

**Design principle: editing collective intelligence, not grading homework.**

#### Knowledge view layout

The Knowledge view uses the standard IconRail → Submenu → Main pane structure. Two layout options to explore in design:

**Option A: Split-pane.** The submenu shows the scope selector (Practice / Product / Factory) and, below it, the topic list for the selected scope. Clicking a topic filters the main pane to show items in that topic. Multiple topics can be selected to union their items. The main pane is a list of knowledge items with the view switcher (by topic, needs attention, recently created, most accessed, stale) at the top. This works well for cross-topic curation — the topic list is always visible as a navigation landmark.

**Option B: Hierarchical accordion.** The submenu shows the scope selector. The main pane shows topics as collapsible section headers, with knowledge items nested below each. Expanding a topic reveals its items. The view switcher reorders topics and items within them. This keeps everything in one scrollable surface but can feel cramped with 15-20 topics.

Both options share the same usability requirements:

**What a KnowledgeRow shows.** Each list row must let the user decide whether to open the item without clicking. Required at a glance: title, a one-line preview (either the first paragraph or a dedicated summary field in the item), and tags for the key metadata — kind (pattern, anti_pattern, decision, failure, etc.), status (captured/active/stale/...), and topic. Optional but valuable: confidence score, last-edited date, access count.

**Grouping by topic.** The default "by topic" view groups items under their topic headers. Each topic header shows: topic name, item count, and a curation health indicator (how many items are active vs. captured/provisional vs. stale). The user must be able to toggle between grouped-by-topic and flat list.

**Three sort/recommendation modes.** Beyond the five saved views, the user needs three ways to orient:
1. **Classic navigation** — browse the topic tree, scan items alphabetically or by recency. For exploration.
2. **Agent-recommended for editing** — sorted by attention_score. What do the facilitators think needs human review right now? Items recently modified by agents, items with low confidence, items flagged for review. This is the curation starting point.
3. **Most accessed by agents** — sorted by usage frequency. These are the items agents rely on most — errors here have the highest cost, so quality matters most. This is where the human focuses editing energy for maximum impact.

**Browsing to editing transition.** Click a knowledge item in the list → the item opens in the main pane (replacing the list, with a breadcrumb to return). The item displays its full markdown body, editable inline. The user reads and edits in the same surface — no separate "edit mode." Changes auto-save with version checks. The list scroll position is preserved when the user returns via breadcrumb. The human is a senior member of the practice showing up to tend the garden, not an auditor signing off on every contribution.

---

## 5. The Holistic User Journey

Three views plus a sidebar. What matters is how they thread together into a day, a week, and a month.

### 5.1 A day (mostly phone + ambient desktop)

**Morning, phone.** Open Factory. Home tab shows the Rail: two bets tracking, one blocker, $14 cost burn so far. Switch to Conversations. Two blocking review items waiting. Approve one with a comment. Request changes on the other. Reply to a chat thread from the brand-voice agent asking a quick clarification. 90 seconds total.

**Workday, desktop.** Factory sits open on a side screen. The Rail is always visible — bets drift right, cost burn ticks up, a blocker appears and is acknowledged. A notification fires: a new review thread, risk-tier high. Switch to the Factory window, open the thread, leave two inline comments and request changes. Back to primary work.

**Afternoon, desktop.** The Chief of Staff posts into its chat: "I've been noticing that our last three copy reviews all got 'request changes' on tone. Want to talk about whether we need to sharpen the brand-voice skill?" The thread is pinned at the top of the thread list. Reply later when there's space. Not now.

**Evening, phone.** One more glance at Home. Nothing blocking. The daily digest of FYI items is ready; skim it over dinner. Close the app.

### 5.2 A week

**Tuesday morning, desktop.** Switch the Main Pane to **Work**. Shaped pitches from the Product Managers are laid out on the Canvas. Drag two into the betting zone. Annotate one with a concern about scope. Kill an old pitch that's drifted. Glance at the Kanban — one task is blocked, expand it, open the thread. 12 minutes.

**Friday wind-down, desktop.** Switch the Main Pane to **Knowledge**. Select the growth practice. Switch to the "needs attention" view — three knowledge items flagged by the facilitator. Flag one that looks wrong. Merge two duplicates. Browse the "recently created" view to see what agents proposed this week. Edit a knowledge item to sharpen the wording. 18 minutes.

### 5.3 A month

**First Monday, desktop, deliberate time block.** Open the Chief of Staff's chat. Scroll back through what the Chief of Staff raised across the month. Talk about which of those patterns actually matter. Approve two proposed edits to `PRINCIPLES.md` that come back as review threads. Append the month's reflection.

### 5.4 When something breaks

**Agent stuck, any device.** The agent posts a chat thread: "I can't deploy — Stripe webhook signing keys are missing." Push notification fires on phone. Open thread, reply with where the keys live, agent continues. 30 seconds.

**Skill behaving weirdly.** Flag it from the review thread that exposed the problem. Escalate to the Chief of Staff's chat. The Chief of Staff drafts a skill revision, posts it back as a review thread, human approves or requests changes.

The point of the journey: **the human never thinks "which app do I open?"** They open the Factory. They scan the Rail. They work through Conversations. Once or twice a week they shift the Main Pane to Work or Knowledge. The Chief of Staff's chat is always there, pinned. One door.

---

## 6. Content Examples (for design reference)

Real examples grounded in the factory's products (Ambrovia — team alignment for project work; Nimmly — SME M&A analytics; HyperIdle — this operating system itself). These show what actual content looks like in each view, so design proposals can be populated with realistic density and tone.

#### Review threads

- **Text diff:** Subject: "Deploy Nimmly pricing-engine v1.4.2 to staging". Author: Nimmly Backend Builder. Artifact: a 40-line diff in `pricing-engine/src/calculate.ts` — changes to margin calculation logic. Inline comment example: "Line 23: this rounds down to the nearest cent, but our contracts specify rounding to four decimal places. Intentional?"
- **Action summary:** Subject: "Enable Stripe live mode for Ambrovia Pro tier". Author: Ambrovia Growth Agent. Artifact: structured summary — what's changing (test→live keys), why (Pro launch next Monday), impact (real charges begin), rollback plan (revert to test keys via env var), checks passed (webhook signature verified, idempotency tested).
- **Content preview:** Subject: "Ambrovia launch blog post — final draft". Author: Ambrovia Writer. Artifact: rendered blog post (1,200 words), metadata sidebar showing word count, target audience (project managers), publish date, SEO keywords.

#### Chat threads

- "Quick question about Nimmly's data retention policy before I draft the privacy page — do we keep deal data after the subscription ends?" — from Nimmly Writer to Founder.
- "I noticed three of our recent Ambrovia bets all hit the same auth issue — want to talk about it?" — from Ambrovia Product Manager to Founder.
- "I'm stuck — Coolify deploy keeps timing out. The webhook signing keys might be wrong. Can you check?" — from Nimmly Backend Builder to Founder.

#### Rail indicators

- Bets: "Nimmly: Pricing overhaul — 4/7 tasks done · week 3 of 6" | "Ambrovia: Onboarding v2 — 1/4 tasks done · week 1 of 4"
- Blocked: "2 agents blocked" → expand → "Nimmly Backend Builder: waiting on Stripe API keys (3h)" | "Ambrovia Frontend Builder: waiting on review verdict (45min)"
- Knowledge: "+8 new items this week"
- Cost: "$42 today / $150 budget · $187 this week / $500 budget"
- System: "6 agents active · 0 failures · 0 conflicts"

#### PitchCard examples (Work)

- Title: "Search results relevance (ranking overhaul)". Product: Nimmly. Appetite: 6 weeks. Body (markdown): the shaped pitch — problem statement, proposed solution sketch, rabbit holes to avoid, what "done" means.
- Title: "Onboarding v2 — guided setup flow". Product: Ambrovia. Appetite: 4 weeks. Status: committed this cycle.

#### Knowledge items

- Practice scope, building practice, topic "file-handling": Title: "Chunked upload for files >10MB". Kind: pattern. Status: active. Confidence: 0.85. Preview: "Use 2MB chunks for multipart uploads on memory-constrained hosts (Coolify free tier). 5MB chunks cause OOM — see anti-pattern."
- Practice scope, building practice, topic "authentication": Title: "JWT rotation patterns for multi-tenant SaaS". Kind: pattern. Status: provisional. Preview: "Rotate signing keys every 90 days. Store previous key for 7 days to allow graceful token expiry."
- Practice scope, building practice, topic "authentication": Title: "Large JWT payloads in cookies". Kind: anti_pattern. Status: active. Preview: "Don't embed full user profiles in JWTs — cookie size limits cause silent auth failures on Safari."
- Product scope, Nimmly, topic "pricing": Title: "Margin calculation rounding decision". Kind: decision. Status: active. Preview: "Round to four decimal places per contract terms. Nearest-cent rounding was rejected — see review thread."
- Factory scope: Title: "Ship daily, review weekly". Kind: principle. Status: active. Preview: "Agents ship continuously. Humans review in weekly batches. Never block a deploy for a non-blocking review."

---

## 7. The Cross-Cutting Data Model

Every item that flows through any view is the same shape under the hood. The view decides how to render it; the meta layer decides where to send it.

```
Item {
  id              # stable, addressable
  source          # which agent sent this — uses agent identity
  layer           # L0 / L1 / L2 / L3 / L4
  verb            # review | prioritize | bet | coach | curate
  kind            # review | chat | rail | work | knowledge
  title           # one-line, decidable
  body            # markdown; rendered by the view (chat threads, reasoning text)
  proposed_action # the structured thing the human is deciding on (review kind only)
                  # typed: { type: "text_diff" | "content_preview" | "visual_comparison" |
                  #          "action_summary" | "data_metrics",
                  #          payload: { ... type-specific fields ... } }
                  # each type has its own renderer in the Conversations view (see §4.1)
  options         # which actions are allowed: approve|edit|reject|snooze|reply|
                  # request_changes|comment|inline_comment|escalate|...
  risk_tier       # low | medium | high — controls notification + blocking behavior
  attention_score # numeric, from facilitators — controls ordering
  blocking        # bool — does an agent literally pause until this is resolved?
  deadline?       # optional soft deadline
  thread?         # threads items together for the same task or conversation
  pinned?         # bool — the Chief of Staff's chat is always pinned
  reasoning       # WHY the agent surfaced this — non-negotiable for trust
  cost_estimate?  # token / dollar cost of the proposed action
  audit_trail     # full history of the decision so far
  created_at
}
```

And every human action takes the same shape:

```
Response {
  item_id
  decision        # approve | approve_with_comments | comment | inline_comment |
                  # request_changes | edit | reject | reply | snooze | escalate |
                  # nudge | flag | merge | split | rename | archive | ...
  inline_anchor?  # for inline_comment: which part of the proposal
  edits?          # if decision === "edit"
  feedback?       # short text for the agent
  approver        # human identity
  view            # which view the response came from
  responded_at
}
```

**`reasoning` is non-negotiable.** Every Item explains *why* the agent surfaced it. The 2026 research was unambiguous: humans don't trust agents they can't reason about.

**`kind` and `verb` are separate on purpose.** `verb` is the human activity; `kind` is the rendering shape. A single item can shift kinds without losing identity — a chat thread that produces a concrete proposal becomes a review thread inline, and the history is preserved.

---

## 8. Routing: How Items Find the Right View

The facilitator family (from KNOWLEDGE_ARCHITECTURE.md) does the routing. Each facilitator emits items targeted at a specific view based on the attention they need:

| Item characteristic | View |
|---|---|
| Concrete, decidable, risk ≥ medium or skill-change | Conversations (review kind) |
| Agent-initiated conversation, no verdict needed | Conversations (chat kind) |
| Cross-product pattern, rule change, reflection | Conversations (Chief of Staff's chat, pinned) |
| Order/rank-able, not yet a decision | The Rail |
| Shaped pitch or task status update | Work |
| Knowledge update, in-flight or pruning | Knowledge |

Routing rules:

1. **Risk tier ≥ medium → Conversations (review).** Always. Irreversible or money-shaped items get the synchronous gate.
2. **Skill changes → Conversations (review).** Always. Skills compound, so they wait for a human.
3. **Knowledge updates → Knowledge.** Never Conversations. Async curation, not approval.
4. **Strategic / rule-shaped items → Chief of Staff's chat.** If it's about how the factory *operates*, not what it's doing.
5. **Pitches → Work.** Only when shaped enough to bet on.
6. **Everything else → The Rail.** The Rail is the catch-all for "the human should be aware but doesn't need to act now."

When in doubt, facilitators err toward the less interruptive view. Conversations is the most expensive view (it can interrupt a human's day); items that don't earn a phone notification shouldn't push there.

---

## 9. Interaction Cadences & Notification Discipline

Notification fatigue is the failure mode every 2026 tool is fighting. The discipline:

| View | Notification model | Why |
|---|---|---|
| Conversations (blocking, risk ≥ medium) | Push immediately. Phone rings. | The agent is paused. |
| Conversations (urgent chat) | Push, but the agent has to flag it. | Agent restraint matters here. |
| Conversations (FYI) | Silent. Daily digest. | One push per thread event = unusable. |
| The Rail | Never push. Ambient only. | It's *there*; it doesn't need to call. |
| Work | Calendar reminder once a week. | Weekly cadence is the whole point. |
| Chief of Staff's chat | Optional. Founder choice. | Some humans want a monthly nudge; others drift in. |
| Knowledge | Calendar reminder once a week. | Weekly. |

**Quiet hours and silence modes.** A human can mark themselves unavailable; blocking review items queue but don't push, and the agent system either waits or falls back to a safe-default action depending on policy. Silence modes are per-human and per-product so a founder can mute Ambrovia for the weekend without going dark on Nimmly.

**Per-agent notification preferences.** Humans can dial down a noisy agent without affecting the rest. If the growth Practice Facilitator is generating too many low-value items, cap it at 5/day in Conversations without the system silently dropping anything.

---

## 10. Trust-Building (Slow, Cumulative)

Every 2026 tool that's working has a story for how trust gets built over time. Four mechanisms that keep showing up:

1. **Reasoning visible by default.** Every Item shows *why*. Non-negotiable.
2. **Cost transparency.** Every action shows token spend; the Rail has a daily burn-rate strip.
3. **Reversibility cues.** Items are tagged "reversible" or "irreversible." Reversible items approve with lower friction.
4. **Graduated autonomy per agent per skill.** Each agent–skill combination carries its own autonomy level (L1 every action approved → L4 autonomous unless blocked). The level moves up over time as the success rate justifies it. This is effectively per-team-per-skill, since the same skill in different products needs different oversight (e.g. "deploy-landing-page" might be L3 for the experienced Builder on Product A and L1 for the new Builder on Product B). Levels are edited alongside the skill itself, with changes flowing through Conversations as review items.

The autonomy level is the real trust dial. It's how the factory transitions from "the human is in every loop" on day one to "the human is only in the loops that matter" by month six, without ever ending up in "the human is in no loops."

---

## 11. What the Meta Layer Actually Ships at This Layer

To be deployable for anyone (per the constraint from RESEARCH_EXECUTION_LAYER.md), the meta layer ships:

1. **The normalized Item / Response data model.** SQLite-backed by default, swappable. The schema in §6 is the contract.
2. **A small router** that takes any Item from any facilitator and sends it to the right view (Conversations / Rail / Work / Knowledge). The "facilitator → view" mapping in §7, made executable.
3. **One reference application — the Factory — with two form factors:**
   - **Desktop.** A web app (PWA) with four zones: IconRail + Submenu + Main pane (Conversations / Work / Knowledge) + Rail sidebar on the right. Single codebase. Tauri wrapper optional for deployers who want a real desktop binary.
   - **Mobile.** The same PWA responsive-layout-shifted into Home / Conversations / Work tabs. Native wrapper only if push integrations demand it.
4. **A notification adapter** that hooks the review-thread stream into push services (APNs, Firebase, ntfy, plain email — deployer chooses). Notifications only fire for blocking reviews and agent-flagged urgent chats.
5. **A silence-mode + autonomy-level engine** that gates which items push, which queue, and which auto-resolve based on policy.
6. **Per-deployer profile defaults.** A laptop install can strip the app down to a CLI conversation client + a tmux Rail + a markdown-file Knowledge view, all reading the same SQLite store. A team install gets the full PWA. Same data model, different rendering.

Everything else — beautification, themes, Slack/Discord integrations — is downstream of this. The meta layer's job is the data model, the router, one reference app, and the notification/autonomy engine.

---

## 12. What This Layer Is Not

To prevent scope creep, a list of things the human interface layer explicitly does not own:

- **The agent runtime.** Not our problem; lives in the harness (Claude SDK, Letta, Goose, etc.).
- **Skill execution.** Skills run in the workspace; we just route their output to the right view.
- **Memory storage.** Owned by the knowledge fabric (KNOWLEDGE_ARCHITECTURE.md).
- **Observability backends.** We emit traces to Langfuse / LangSmith / whatever; we don't run them.
- **Workflow orchestration.** No DAGs. Items flow through routing; that's it.
- **Multiple applications.** One app, two form factors. Not four.
- **Per-product custom dashboards.** If a deployer wants a custom view, they build it on top of the same Item / Response store.

If we end up writing code that fits one of these descriptions, we've crossed a layer boundary and should stop.

---

## 13. Decisions

- **Desktop shell:** web-first. Plain web app served by the API process. No Tauri wrapper, no PWA. Native shells can be added later if needed.
- **Mobile:** responsive web app, online-first. No dedicated native app in v1.
- **Tech stack:** Tailwind CSS + DaisyUI + custom `factory-dark` theme. Behavior gaps filled by `focus-trap-react` and `@floating-ui/react`. Data utilities from `@tanstack/react-*` when needed.
- **Canvas tech:** symbolic UI — standard React components in a two-column layout (shaped / committed) with a hard capacity cap. Not an actual canvas or drag-and-drop zone.
- **Navigation model:** IconRail (icons only, always visible) → Submenu (per-view, collapsible) → Main pane. Breadcrumbs within views, not across. The Rail is a right sidebar, always visible regardless of the active view — not a menu item, not a floating overlay.
- **Cross-view deep linking:** clicking anything on the Rail links to the corresponding view and item. Trivial with the shared Item model.
- **Thread types:** two kinds — review (has verdict, blocking indicator) and chat. The Chief of Staff's conversation is a pinned chat thread, not a separate type.
- **Notification adapter:** TBD during development. Will need some notification mechanism; specific technology decided at implementation time.
- **Knowledge view model:** catalogue with topic/node structure, not page tree. Three scopes (practice, product, factory). Topics group knowledge items within a practice or product. Views (saved filter perspectives) serve both curation and exploration.
- **Knowledge view is agent-free:** no human-agent interaction. Human and knowledge only. Recommendations go to the Rail, proposals go to Conversations.
- **ArtifactView shapes:** five typed renderers for review artifacts — text_diff, content_preview, visual_comparison, action_summary, data_metrics. Each external tool integration can ship a skill that extends a base renderer. `proposed_action` in the Item model carries the type and payload.
- **ArtifactView rendering:** simple artifacts render inline in the thread; complex artifacts promote to a companion pane (conversation left, artifact right). Implementation order: text_diff → content_preview → action_summary → data_metrics → visual_comparison.

---

## 14. Inspirations

**For the Conversations view:** MCP Agent Mail (Dicklesworthstone / Steve Yegge fork), LangChain Agent Inbox, builderz Mission Control's Aegis blocking gate, Devin Review's red/yellow/gray triage, Linear AI's "never act in the dark" principle, GitHub pull request reviews, Read AI's persistent-context coach, Letta's continuous sessions, Claude Cowork's ongoing dialogue.

**For the Rail:** oh-my-codex HUD, Windsurf Cascade's anticipation model, Cursor Background Agents' status surface, the macOS menu bar metaphor — reinterpreted as a persistent sidebar inside the app rather than a separate process.

**For Work (Canvas + Kanban):** Shape Up's pitches-and-appetite, Linear's issues-and-cycles model, Glue (YC, stealth). Card-based drag-and-drop with hard capacity limits — not a spatial canvas.

**For Knowledge:** Notion databases (views as filtered perspectives, properties on items), Guru (card-based knowledge with verification status and health monitoring), Confluence (spaces as organizational structure), Heptabase (Card Library with table and tag filtering), the structural-maintenance discipline of tending a community-of-practice wiki. Anti-pattern: flat card walls that become overwhelming at 500+ items (the failure mode of most knowledge management tools).

**For the one-app architecture:** Linear's single-app-many-views philosophy, Superhuman's "every verb is keyboard-accessible in one surface" discipline, Things 3's form-factor parity, the persistent-sidebar layouts of modern IDEs.

**For the data model and trust mechanisms:** LangChain Agent Inbox's interrupt schema, Microsoft Agent Governance Toolkit (April 2026), Goose adversary mode's per-action policy interception, Replit Agent 3's L1–L4 autonomy levels, Factory Droids' graduated approval workflows, Smashing Magazine's 2026 patterns on notification fatigue.

**Critiques that shaped what we *don't* build:** the "single dashboard tries to do everything" anti-pattern, the opposite "zoo of separate apps with separate accounts" anti-pattern, chat-only interfaces that hide reasoning, modal-confirmation notification fatigue, and forcing spatial canvases on tasks that want a list.

---

## 15. Canonical Component References

This document uses component names from the canonical UI_DESIGN.md component tree. Reference implementations ship as follows:

**Tier 1 — Primitives (5):** StatusChip, Tag, KeyValue, NavItem, SearchField

**Tier 2 — Blocks (6):** ThreadRow, BetCard, PitchCard, TaskCard, KnowledgeRow, NotificationRow

**Tier 3 — Regions (8):** IconRail, Submenu, Rail, ArtifactView (with five shapes: text_diff, content_preview, visual_comparison, action_summary, data_metrics), ReviewHeader, Canvas, Kanban, PitchSelector

**Tier 4 — Pages (9):** Conversations/Review, Conversations/Chat, Work/Portfolio, Work/Team, Work/Team+Pitch, Work/Bet, Knowledge/List, Knowledge/Detail, Settings

See UI_DESIGN.md v0.2 for the full component tree and build order.
