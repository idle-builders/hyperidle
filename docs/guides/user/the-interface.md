# The Interface

```
┌──────────┬──────────────────────────────┐
│ Sidebar  │ Main Pane                    │
│ (nav)    │ (content)                    │
└──────────┴──────────────────────────────┘
```

The app is two columns:

- **Sidebar** (left): Top-level navigation. Search field + Assistant button on the top row. Three section buttons (Conversations / Work / Knowledge) — click to switch views and land on that section's overview. A shared fast-nav list below the separator shows the head of the active section's items (threads / teams / knowledge items); it swaps when you switch sections. Notifications (bell) and Settings are pinned at the bottom.
- **Main Pane**: Where the work happens — section overviews, team views, review threads, knowledge items.

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

**Back vs. Up:** The breadcrumb trail at the top of detail screens shows your structural position (Work → Bet → Task). Clicking a breadcrumb segment goes *up* to the parent route. ⌘[ goes *back* to wherever you were before — which may be a different view entirely.

## Global Search

Press **⌘K** (or **Ctrl+K**) from any view to open global search. It searches three buckets:

- **Conversations** — thread titles and the latest message's text
- **Work** — bets only (description, hypothesis, done condition); tasks are not searched
- **Knowledge** — title and body; items scoped to a user are visible only to their author

Results are grouped by type, exact-prefix matches ranked first. Arrow keys navigate, Enter opens, Escape closes.

## Dialogs and Overlays

HyperIdle uses a consistent dismissal grammar across all overlays:

- **Escape** closes any open dialog, sheet, or popover.
- **Backdrop click** closes modal dialogs (clicking outside the dialog box).
- **Dirty-input guard**: if you have unsaved typed input, Escape shows a discard confirmation strip instead of closing immediately. The strip is safe by default — focus lands on **Keep editing**. Press Enter or click **Keep editing** to stay in your work. Press Tab then Enter (or click **Discard**) to drop your changes and close. A second Escape also keeps your work — it does not discard.
- **Confirmation dialogs** (kill a bet, destructive actions) always close on Escape — they are never guarded. Escape is equivalent to Cancel: nothing happens until you explicitly confirm.

Overlay layers stack predictably: the mobile navigation drawer sits below notification popovers, which sit below modal dialogs. Opening overlays in any order always produces the correct visual stack.

## Notifications

Agents send in-app notifications when they need your attention. Every notification is typed so you know what kind of action is needed.

### Notification types

| Type | When it fires | Default urgency |
|---|---|---|
| **Review requests** | An agent needs your review to proceed | Immediate (may demote to ambient for low-risk reviews) |
| **Blocker alerts** | An agent is blocked and needs you to intervene | Immediate |


### Notification inbox

Click the bell icon at the bottom of the sidebar to open your notification inbox.

- **Unseen dot** — a red dot on the bell means you have unseen notifications. It clears when you open the inbox.
- **Row anatomy** — each notification shows a colored urgency dot, the title, the type label, and how long ago it arrived. Immediate notifications sort first; within each urgency group, newest first. (Delivery order is a structural dispatch rule — see [notification primitive](../../human-interface-layer/notification-primitive.md) for detail.)
- **Navigate** — clicking a row takes you to the conversation or item that triggered it.
- **Dismiss** — removes this specific notification from your inbox. Future notifications of the same type still arrive.
- **Mute type** — silences all future notifications of that type (e.g., all review requests). Existing notifications of that type are removed from view, and the type's toggle in Settings → Notifications switches off. Reversible: re-enable the type in Settings.
- **Dismiss ≠ Mute** — dismiss clears one instance; mute suppresses all future instances of the type.

Urgency dots: **red** = immediate (needs attention now), **gray** = ambient (listed for awareness, no interrupt).

### Delivery

- **Settings → Notifications** contains one on/off toggle per notification type — nothing else. Muting a type keeps it out of your inbox entirely.
- **Quiet hours**, the global **factory silence** switch, delivery **channels** (ntfy push, email), and the **digest** all exist as server-side configuration — they have no settings UI yet.
- **Queued delivery** — blocking notifications that can't deliver (quiet hours, silence) queue persistently and deliver when the window ends; the queue survives restarts.
- **Auto-unblock is silent** — when a task's dependencies resolve, HyperIdle moves it to `in_progress` without notifying you. That's ambient housekeeping, not a call to action.

Primitive depth (queue, digest, cadence discipline) lives in [the notification primitive](../../human-interface-layer/notification-primitive.md).

## Assistant Overlay

The **Assistant** button sits in the sidebar's top row, next to the search field. Clicking it opens your personal AI assistant as a chat overlay anchored to the bottom-right of the window. The overlay deliberately does not close when you click outside it — you can browse the Main Pane and attach context while it's open. Only Escape or the trigger button close it.

**Setup notices** — If the assistant can't respond, it shows a guidance card explaining why:

| Card | Meaning | Action |
|---|---|---|
| No API key yet | No Anthropic key is configured | Click **Settings → Credentials** to add your key |
| Runtime not configured | No harness is selected for the assistant | Click **Open Agent settings** to pick a harness |
| Couldn't reach the model | The provider returned a temporary error | Click **Retry** to try again |

**Thinking indicator** — After you send a message, the overlay shows "Assistant is thinking…" while waiting for a reply. If the assistant hasn't responded after 2 minutes, the indicator is replaced with a **Retry** button so you can re-send without waiting forever.
