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

The Chief of Staff's ongoing conversation is structurally a Thread (see §4.5 for the primitive) with the *user* as its host, `pinned: true`, that never auto-archives. Everything about it — replies, attachments, memory, escalation — is identical to any other thread.

Treating it as a separate app forces the human to learn two chat UIs. Treating it as *the top thread in the thread list*, always pinned, always visible, means the muscle memory for "reply to the Chief of Staff" is the same as "reply to a Product Manager." One pattern, learned once, used everywhere.

The Chief of Staff's behavior is still special — it's a continuously-running agent with persistent context, it brings up cross-product patterns, the thread is never archived — but its *surface* is a thread. Not a second app. The earlier vocabulary "the Chief of Staff is a chat thread" is corrected in §4.5: the Chief of Staff thread is a *coach configuration* — a pattern of host (user) + participants (user, Chief of Staff) + pinning — not a thread shape.

### 3.5 Why the Rail is a right sidebar, not a view or a widget

Earlier drafts treated the Rail as a menu-bar app or a tray widget. Later drafts made it a regular view in the IconRail. Both were wrong. A menu-bar widget requires a separate binary and a separate notification permission. A regular view means the user loses ambient awareness when they switch to Conversations or Work — the whole point of ambient state is that it's *always there*.

The right model is a persistent sidebar on the right side of the window — the mirror of the IconRail on the left. Minimized, it's a narrow strip of icons showing the critical numbers. Expanded, it's a full dashboard panel. It's a proper layout zone that's always present, on every screen, regardless of which view is active. This gives the app a symmetrical frame: IconRail on the left (navigation), Rail on the right (awareness). The Main pane and Submenu live between them.

Mobile gets the same thing as a dedicated Home tab — the Rail translated to a single scrollable screen. Same component, same data, same behavior, different layout.

If a deployer really wants a menu-bar widget later, it's a thin client over the same data model. It's additive, not the default.

---
