# The Interface

```
┌──────────┬──────────────────────────────┐
│ Sidebar  │ Main Pane                    │
│ (nav)    │ (content)                    │
└──────────┴──────────────────────────────┘
```

The app is two columns:

- **Sidebar** (left): Context switching and scanning. HyperIdle identity and the grouped Search / Assistant actions sit at the top. Notifications, Conversations, Work, and Knowledge stay in one stable destination set. The large region below shows the active domain's current navigator (provisionally recent threads, teams, or documents). Settings is pinned at the bottom. On phone the same sidebar is hidden behind Menu.
- **Main Pane**: Where the work happens — section overviews, team views, review threads, documents.

Full shell structure (routes, nav grammar, badges) lives in [App Shell](../../information-architecture/app-shell-always-present.md).

## Keyboard Shortcuts

HyperIdle is keyboard-first. The shortcuts that work everywhere:

| Shortcut | Action |
|---|---|
| ⌘K | Global search (toggle) |
| ⌘[ | Go back (browser history) |
| ⌘] | Go forward (browser history) |
| ⌘1 | Switch to Conversations |
| ⌘2 | Switch to Work |
| ⌘3 | Switch to Knowledge |
| Escape | Close any dialog, sheet, or popover |

**Navigation shortcuts (⌘[ and ⌘])** move through your browser history — the same path you took through the app. They do not fire while you are typing in a text field.

**View shortcuts (⌘1/2/3)** are pinned: 1 is always Conversations, 2 is always Work, 3 is always Knowledge. The mapping never changes.

**List navigation with J/K** exists only on the Knowledge list (alongside x, v, and o/Enter there) — it is not an app-wide convention. The global search panel uses arrow keys instead.

**Back vs. Up:** The breadcrumb trail at the top of detail screens shows your structural position (Work → Team → Task, then parent task if nested). Clicking a breadcrumb segment goes *up* to the parent route. ⌘[ goes *back* to wherever you were before — which may be a different view entirely.

## Global Search

Press **⌘K** (or **Ctrl+K**) from any view to open global search. It searches three buckets:

- **Conversations** — thread titles and the latest message's text
- **Work** — tasks (description, done condition)
- **Knowledge** — title and body; items scoped to a user are visible only to their author

Results are grouped by type, exact-prefix matches ranked first. Arrow keys navigate, Enter opens, Escape closes.

## Dialogs and Overlays

HyperIdle uses a consistent dismissal grammar across all overlays:

- **Escape** closes any open dialog, sheet, or popover.
- **Backdrop click** closes modal dialogs (clicking outside the dialog box).
- **Dirty-input guard**: if you have unsaved typed input, Escape shows a discard confirmation strip instead of closing immediately. The strip is safe by default — focus lands on **Keep editing**. Press Enter or click **Keep editing** to stay in your work. Press Tab then Enter (or click **Discard**) to drop your changes and close. A second Escape also keeps your work — it does not discard.
- **Confirmation dialogs** (kill a task, destructive actions) always close on Escape — they are never guarded. Escape is equivalent to Cancel: nothing happens until you explicitly confirm.

Overlay layers stack predictably: the mobile navigation drawer sits below notification popovers, which sit below modal dialogs. Opening overlays in any order always produces the correct visual stack.

## Notifications

Your inbox fills from your own subscriptions. Subscribe to an event in **Settings → Notifications** (one toggle per event: a task, a conversation, a document, or a user — created or changed) and every occurrence you can already see — company-wide, your team's, or your own — lands a row.

### Notification inbox

Click **Notifications** in the stable destination set to open your inbox.

- **Unseen dot** — a red dot means you have unseen rows. It clears when you open the inbox.
- **Row anatomy** — each row shows an unseen dot, a title built from what changed (for example "Task changed"), the object kind, and how long ago it happened, newest first.
- **Navigate** — clicking a row opens the object the change happened to.
- **Dismiss** — the hover-reveal **×** marks this one row read and removes it from view. It does not touch your subscription — the next occurrence of the same event still arrives.
- **Pause a subscription** — turn its toggle off in **Settings → Notifications**. That stops future rows; it does not remove ones already in your inbox.

### Delivery

- **Settings → Notifications** is where subscriptions live — one toggle per event, nothing else.
- Rows older than 30 days are cleared automatically.
- **Auto-unblock is silent** — when a task's dependencies resolve, HyperIdle moves it to `in_progress` without adding an inbox row. That's ambient housekeeping, not a call to action.

An agent subscribed to the same event is woken to work on it instead of getting an inbox row — same subscription, the reader decides the effect. See [Agents](./agents.md).

## Assistant Overlay

The **Assistant** action sits with Search in the sidebar's top-right tool group. Clicking it opens your personal AI assistant as a chat overlay anchored to the bottom-right of the window. The overlay deliberately does not close when you click outside it — you can browse the Main Pane and attach context while it's open. Only Escape or the trigger button close it.

**Setup notices** — If the assistant can't respond, it shows a guidance card explaining why:

| Card | Meaning | Action |
|---|---|---|
| No API key yet | No Anthropic key is configured | Click **Settings → Connections** to add your key |
| Runtime not configured | No harness is selected for the assistant | Click **Open Agent settings** to pick a harness |
| Couldn't reach the model | The provider returned a temporary error | Click **Retry** to try again |

**Thinking indicator** — After you send a message, the overlay shows "Assistant is thinking…" while waiting for a reply. If the assistant hasn't responded after 2 minutes, the indicator is replaced with a **Retry** button so you can re-send without waiting forever.
