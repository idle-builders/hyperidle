## 3. The Human Interface: The Factory

### 3.1 Technology Stack

**Framework.** React (TypeScript) with **Tailwind CSS + DaisyUI** and a custom Lucid theme (dark/light/system), plus `focus-trap-react` and `@floating-ui/react` for behavior gaps. See `UI_DESIGN.md` for the canonical component tree. One codebase, desktop-only.

**Rendering.** Shell is `IconRail | Submenu | Main | Rail`. Per view:
- **Conversations view:** Main renders rich messages inline — review messages embed an artifact reference + verdict affordance, plain messages are text. ArtifactView dispatches to one of 5 shapes: `text_diff`, `content_preview`, `visual_comparison`, `action_summary`, `data_metrics`. Supports the full verdict grammar (approve / approve with comments / comment / inline comment / request changes / edit / reject / reply / snooze / escalate). Submenu renders a list of `ThreadRow`s with filter chips (All | Blocking | Async). Founders can initiate conversations (RecipientPicker, N key) and dial into live sessions (D key).
- **Rail:** the sole notification surface, subscribing to the WebSocket event stream. Collapsed = stacked icons with counts per category. Expanded = grouped notification rows. No top-bar bell, no global toasts. Chief of Staff overlay accessible via bottom-right button.
- **Work view:** Five-level drill-down: Portfolio (product cards) → Product (Canvas + task list) → Bet Detail (pitch as styled markdown blocks + tasks + artifacts + thread) → Task → Session (jump-out to harness). Canvas has a hard capacity cap. Founders can create bets (BetCreateDialog). Tasks are agent-owned — no drag, state changes via threads. Bet-level actions (pause, stop, adjust appetite) show consequence previews.
- **Knowledge view:** Submenu renders a `SearchField` + filter chips + list of `KnowledgeRow`s with three relevance signals (recency, frequency, citation). Main renders item detail with styled markdown blocks (Block primitive) + inline edit + thread section. Founders can create knowledge at any scope (KnowledgeCreateDialog) and change scope with reason tracking.

**Desktop shell.** Native macOS app via Electron. Server (Hono on `@hono/node-server`) runs embedded in the main process. SQLite via `better-sqlite3` at `~/Library/Application Support/HyperIdle/`. Auth via auto-generated API key injected by preload bridge.

### 3.2 Data Flow

```
User opens Factory app
  → Electron main process starts embedded Hono server on localhost
  → BrowserWindow loads http://127.0.0.1:{port}
  → WebSocket connects (ambient updates for threads, sessions, costs)
  → GET /api/conversations (initial thread list)
  → GET /api/rail (initial rail state)

User opens a thread
  → GET /api/threads/:id (full thread with messages)
  → Rich messages render inline with verdict affordances

User submits a verdict
  → POST /api/threads/:id/messages (verdict-type message)
  → API writes Message to Primitive Store
  → Event emitted via EventBus
  → Fabric subscribers react: harness adapter unblocks agent, attention scores update
  → Thread list refreshes via WebSocket push

User creates a bet
  → POST /api/bets (markdown pitch + appetite)
  → Bet appears in Canvas immediately (optimistic update)

User creates knowledge
  → POST /api/knowledge (scope_kind + scope_id + markdown body)
  → Item appears in list; fabric assigns to correct knowledge layer
```

---
