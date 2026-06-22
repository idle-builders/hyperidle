## The Interface

```
┌──────────┬────────────┬───────────────────┐
│ Sidebar  │ Submenu    │ Main Pane         │
│ (nav)    │ (filters)  │ (content)         │
└──────────┴────────────┴───────────────────┘
```

- **Sidebar** (left): Top-level navigation. Search field + Assistant button at the top. Three section buttons (Conversations / Work / Knowledge) — click to switch views and land on that section's overview. A shared fast-nav list below the separator shows the head of the active section's items (threads / teams / knowledge items); it swaps when you switch sections. Settings is pinned at the bottom.
- **Main Pane**: Where the work happens — section overviews, team views, review threads, knowledge items.

## Keyboard Shortcuts

HyperIdle is keyboard-first. The most common shortcuts:

| Shortcut | Action |
|---|---|
| ⌘K | Global search |
| ⌘[ | Go back (browser history) |
| ⌘] | Go forward (browser history) |
| ⌘1 | Switch to Conversations |
| ⌘2 | Switch to Work |
| ⌘3 | Switch to Knowledge |
| J / K | Next / previous item in a list |
| A / R / X / S | Verdict actions on the review page (Approve / Request changes / Reject / Snooze) |
| Escape | Close any dialog, sheet, or popover |
| ? | Show shortcut help overlay |

**Navigation shortcuts (⌘[ and ⌘])** move through your browser history — the same path you took through the app. They do not fire while you are typing in a text field.

**View shortcuts (⌘1/2/3)** are pinned: 1 is always Conversations, 2 is always Work, 3 is always Knowledge. The mapping never changes.

**Back vs. Up:** The breadcrumb trail at the top of detail screens shows your structural position (Work → Bet → Task). Clicking a breadcrumb segment goes *up* to the parent route. ⌘[ goes *back* to wherever you were before — which may be a different view entirely.

## Dialogs and Overlays

HyperIdle uses a consistent dismissal grammar across all overlays:

- **Escape** closes any open dialog, sheet, or popover.
- **Backdrop click** closes modal dialogs (clicking outside the dialog box).
- **Dirty-input guard**: if you have unsaved typed input, Escape shows a discard confirmation strip instead of closing immediately. The strip is safe by default — focus lands on **Keep editing**. Press Enter or click **Keep editing** to stay in your work. Press Tab then Enter (or click **Discard**) to drop your changes and close. A second Escape also keeps your work — it does not discard.
- **Confirmation dialogs** (kill a bet, destructive actions) always close on Escape — they are never guarded, because confirming a destructive action is intentional and reversible via the cancel button.

Overlay layers stack predictably: drawers (task sheets) sit below notification popovers, which sit below modal dialogs. Opening overlays in any order always produces the correct visual stack.

## Assistant Overlay

The **Assistant** button in the bottom-right corner opens your personal AI assistant chat overlay. The assistant responds inline as you type.

**Setup notices** — If the assistant can't respond, it shows a guidance card explaining why:

| Card | Meaning | Action |
|---|---|---|
| No API key yet | No Anthropic key is configured | Click **Settings → Credentials** to add your key |
| Runtime not configured | No harness is selected for the assistant | Click **Open Agent settings** to pick a harness |
| Couldn't reach the model | The provider returned a temporary error | Click **Retry** to try again |

**Thinking indicator** — After you send a message, the overlay shows "Assistant is thinking…" while waiting for a reply. If the assistant hasn't responded after 2 minutes (a crash), the thinking indicator is replaced with a **Retry** button so you can re-send without waiting forever.

**Customizing the assistant** — Go to **Settings → Assistant** to edit your assistant's persona instructions (system prompt). Changes take effect on the next message.
