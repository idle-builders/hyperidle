## 3. One App, One Form Factor

The entire human interface layer ships as **one product: the Factory.** A native macOS desktop app (Electron) with the server embedded in-process. One codebase, one data model, one interaction grammar. Desktop is the primary form factor. The same web app is accessible from mobile browsers for review triage and agent unblocking. No native mobile app. No offline support.

### 3.1 Desktop (the workbench)

<!-- @source packages/web/src/shell/AppShell.tsx -->

A single window with two zones:

- **The Sidebar (always visible).** A 200px column on the left with three section headers (Conversations, Work, Knowledge). Clicking a section header navigates to that view. A triage badge on Conversations shows unread count. Always visible, never changes.

- **The Main pane.** Where actual work happens. Shows the content for the selected view:
  - **Conversations** (the default — what's in front of you 90% of the time). Opens whichever thread is selected. Filter chips surface triage state (blocked, needs review, unread). Used for review items, chat items, and human-initiated conversations equally, because they're all threads.
  - **Work.** Bets and tasks — planning what to do next, creating new bets, and tracking what's in flight. A destination, not a default. Team pages show agent health indicators inline in each AgentRow.
  - **Knowledge.** The company's wiki — a catalogue of knowledge items organized by practice and product. Humans create and curate knowledge at any scope. A destination.

Breadcrumbs exist within each view (e.g., Knowledge → Building practice → Auth topic → "JWT rotation patterns") but never across views. Switching views via the Sidebar is always a clean context switch.

The Factory is meant to sit open on a side screen during the workday. The Sidebar gives you one-click access to any view; the Main pane is where you read and work.

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
- The Sidebar is a React component subscribing to the same data as everything else. No daemon, no menu-bar binary, no separate deployment target.
- Work and Knowledge become lazy-loaded routes inside the same shell. They ship when they're ready without blocking the rest.

UX / pattern learning:

- The human learns *one* chat grammar — verdicts, inline comments, replies, snooze, escalate — and uses it for every kind of thread.
- The holistic journey is "open the Factory." Not "check the inbox, then the HUD, then the canvas, then the assistant." One door.
- Mode discipline (what belongs where) is enforced by *view routing inside the app*, not by shipping separate products. If we ever discover Work should collapse into Conversations, we just change the route.

---
