## The Interface

```
┌──────────┬────────────┬───────────────────┐
│ Sidebar  │ Submenu    │ Main Pane         │
│ (nav)    │ (filters)  │ (content)         │
└──────────┴────────────┴───────────────────┘
```

- **Sidebar** (left): Top-level navigation. Icons for Conversations, Work, Knowledge. Avatar at the bottom opens Settings. Shows ambient counts (blocked agents, unread, knowledge triage items).
- **Submenu**: Context-sensitive filters for the current view.
- **Main Pane**: Where the work happens — review threads, kanban boards, knowledge items.

## Dialogs and Overlays

HyperIdle uses a consistent dismissal grammar across all overlays:

- **Escape** closes any open dialog, sheet, or popover.
- **Backdrop click** closes modal dialogs (clicking outside the dialog box).
- **Dirty-input guard**: if you have unsaved typed input, Escape shows a discard confirmation strip instead of closing immediately. The strip is safe by default — focus lands on **Keep editing**. Press Enter or click **Keep editing** to stay in your work. Press Tab then Enter (or click **Discard**) to drop your changes and close. A second Escape also keeps your work — it does not discard.
- **Confirmation dialogs** (kill a bet, destructive actions) always close on Escape — they are never guarded, because confirming a destructive action is intentional and reversible via the cancel button.

Overlay layers stack predictably: drawers (task sheets) sit below notification popovers, which sit below modal dialogs. Opening overlays in any order always produces the correct visual stack.
