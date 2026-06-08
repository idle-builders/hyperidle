## 3. One App, One Form Factor

The entire human interface layer ships as **one product: the Factory.** A native macOS desktop app (Electron) with the server embedded in-process. One codebase, one data model, one interaction grammar. Desktop-only — no mobile companion.

### 3.1 Desktop (the workbench)

A single window with four zones:

- **The IconRail (always visible).** A narrow vertical strip of icons on the far left — one icon per view (Conversations, Work, Knowledge). Clicking an icon opens that view's Submenu and switches the Main pane. This is the only top-level navigation. Always visible, never changes.

- **The Submenu.** Each view has its own Submenu that opens when the view's icon is selected. For Conversations, this is the thread list. For Work, this could be the bet list. For Knowledge, the scope/topic browser. The Submenu is collapsible — the user can close it to reclaim screen space for the Main pane. Only one Submenu is open at a time.

- **The Main pane.** Where actual work happens. Shows the content for the selected view:
  - **Conversations** (the default — what's in front of you 90% of the time). Opens whichever thread is selected from the thread list Submenu. Used for review items, chat items, and human-initiated conversations equally, because they're all threads.
  - **Work.** Bets and tasks — planning what to do next, creating new bets, and tracking what's in flight. A destination, not a default.
  - **Knowledge.** The company's wiki — a catalogue of knowledge items organized by practice and product. Humans create and curate knowledge at any scope. A destination.

- **The Rail (right sidebar, always present).** A persistent sidebar on the right side of the window — the mirror of the IconRail on the left. Always visible on every screen, regardless of which view is active. Two states: **minimized** (a narrow strip of icons showing the most critical indicators — blocked count, cost burn, unread count) and **expanded** (a full panel showing the complete dashboard — bet progress, blocked agents, knowledge additions, system stability). The user can toggle between minimized and expanded at any time. Unlike the IconRail, the Rail is not navigation — it's ambient awareness. It's a layout zone that consumes space, just like the IconRail does on the left.

Breadcrumbs exist within each view (e.g., Knowledge → Building practice → Auth topic → "JWT rotation patterns") but never across views. Switching views via the IconRail is always a clean context switch.

The Factory is meant to sit open on a side screen during the workday. The IconRail gives you one-click access to any view; the Submenu gives you context within the current view; the Main pane is where you read and work; the Rail sits on the right as a persistent sidebar.

### 3.2 Delivery model

- **Installation:** `brew install --cask hyperidle` or download the signed/notarized DMG.
- **Runtime:** The Hono API server runs embedded in Electron's main process. No separate server to manage.
- **Database:** SQLite at `~/Library/Application Support/HyperIdle/hyperidle.db`.
- **Auth:** Auto-generated API key injected via Electron's preload bridge. Invisible to the user.
- **First run:** SetupFlow page guides through profile creation (name, email), first product setup, and optional API key configuration.

### 3.3 What makes this simpler

Technical:

- One codebase (Electron bundles server + client together).
- One API, one auth, one data model.
- The threading UI is built once and reused for review items, chat items, human-initiated conversations, and agent↔agent threads the human is copied on. It's the biggest component in the app and it's written exactly once.
- The Rail is a React sidebar component subscribing to the same event stream as everything else. No daemon, no menu-bar binary, no separate deployment target. <!-- @lore AD8a: historical — Rail removed in U6 -->
- Work and Knowledge become lazy-loaded routes inside the same shell. They ship when they're ready without blocking the rest.

UX / pattern learning:

- The human learns *one* chat grammar — verdicts, inline comments, replies, snooze, escalate — and uses it for every kind of thread.
- The holistic journey is "open the Factory." Not "check the inbox, then the HUD, then the canvas, then the assistant." One door.
- Mode discipline (what belongs where) is enforced by *view routing inside the app*, not by shipping separate products. If we ever discover Work should collapse into Conversations, we just change the route.

---
