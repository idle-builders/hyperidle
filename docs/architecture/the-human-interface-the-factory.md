## 3. The Human Interface: The Factory

### 3.1 Technology Stack

**Framework.** React (TypeScript) with **Tailwind CSS + DaisyUI** and a custom `factory-dark` theme, plus `focus-trap-react` and `@floating-ui/react` for behavior gaps. See `UI_DESIGN.md` for the canonical component tree (5 Primitives + 6 Blocks + 8 Regions = 19 custom components total, built on the DaisyUI primitive set). One codebase serving both desktop and mobile via responsive layout.

**Rendering.** Shell is `IconRail | Submenu | Main | Rail`. Per view:
- **Conversations view:** Main renders `ReviewHeader + ArtifactView` (one of 5 shapes: `text_diff`, `content_preview`, `visual_comparison`, `action_summary`, `data_metrics`) + composer. Supports the full verdict grammar (approve / approve with comments / comment / inline comment / request changes / edit / reject / reply / snooze / escalate). Submenu renders a list of `ThreadRow`s.
- **Rail:** the sole notification surface, subscribing to the WebSocket event stream. Collapsed = stacked `NavItem`s with counts per category. Expanded = grouped `NotificationRow`s. No top-bar bell, no global toasts.
- **Work view:** Main renders `Canvas` (two-column shaped / committed with hard capacity cap — no spatial canvas, just `BetCard`s with a limit) plus `Kanban` (four columns of `TaskCard`s) for Level 2. The `Kanban` is swapped for `PitchSelector` (list of `PitchCard`s) when the `+` slot on the `Canvas` is clicked. Level 1 is a portfolio grid of `BetCard`s; Level 3 is Bet Detail composed of `KeyValue`s + linked `TaskCard`s / `KnowledgeRow`s / `NotificationRow`s.
- **Knowledge view:** Submenu renders a `SearchField` + filter `Tag`s + list of `KnowledgeRow`s. Main renders item detail with inline markdown edit. Drag-and-drop merge/split via `modal`.

**Desktop shell.** Two options (deployer choice):
- **Browser tab** (default) — the PWA runs in any modern browser. Zero install.
- **Tauri wrapper** (optional) — delivers OS-native notifications, tray icon, and the "always open on a side screen" behavior. Single binary distribution. Rust backend is thin — it's just a shell around the web app.

**Mobile.** The same React app, responsive-layout-shifted into three tabs (Home, Conversations, Work). Wrapped in Capacitor (or equivalent) only if push notifications require native APIs.

### 3.2 Data Flow

```
User opens Factory app
  → WebSocket connects to /rail/stream (ambient updates)
  → GET /conversations (initial conversation list)
  → GET /rail (initial rail state)

User opens a thread
  → GET /conversations/:id (full thread with items)
  → Items render with verdict buttons

User submits a verdict
  → POST /conversations/:id/respond (Response object)
  → API writes Response to Primitive Store
  → Event emitted: response_recorded
  → Harness Adapter picks up the event → unblocks the agent
  → Knowledge Fabric picks up the event → updates attention scores
  → Thread list refreshes via WebSocket push
```

### 3.3 Offline / Degraded Mode

The Factory app is a PWA with a service worker. In offline mode:
- The Rail shows the last-known state (cached).
- Conversations are readable from cache.
- Responses queue locally and sync when connectivity returns.
- Work is read-only offline.

---
