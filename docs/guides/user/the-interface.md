# The Interface

The app is two columns: a sidebar on the left and a main pane on the right.

**Sidebar** — context switching and scanning. At the top: the HyperIdle identity, Search, and the Assistant overlay button. Below: four stable destinations — **Notifications**, **Conversations**, **Work**, **Knowledge**. Settings is pinned at the bottom.

**Main pane** — where the work happens: overviews, threads, task pages, documents.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| ⌘K | Global search (toggle) |
| ⌘[ | Go back (browser history) |
| ⌘] | Go forward (browser history) |
| ⌘1 | Switch to Conversations |
| ⌘2 | Switch to Work |
| ⌘3 | Switch to Knowledge |
| Escape | Close any dialog, sheet, or popover |

**⌘1/2/3** are pinned: 1 is always Conversations, 2 is always Work, 3 is always Knowledge.

**J/K navigation** is available on the Knowledge Triage tab only (`v` accepts, `x` archives, `o` or Enter opens).

---

## Global search

Press **⌘K** from any view. Results come from three buckets:

- **Conversations** — matches any message in threads you are a member of; the title is the first message.
- **Work** — root tasks only (description and done condition).
- **Knowledge** — title and body; user-scoped items are visible only to their author.

Arrow keys navigate. Enter opens. Escape closes.

---

## Dialogs and overlays

**Escape** closes any open dialog, sheet, or popover.

If you have unsaved typed input, Escape shows a discard-confirmation strip instead of closing immediately. The strip defaults to **Keep editing** — press Enter to stay, Tab then Enter to discard.

---

## Notifications

Your inbox fills from your own subscriptions. A fresh install subscribes you to nothing — only your assistant is subscribed out of the box. Add your own subscriptions in **Settings → Notifications** (one toggle per event).

Click **Notifications** in the sidebar to open your inbox.

- A red dot means unseen rows. It clears when you open the inbox.
- Each row shows what changed, the object kind, and how long ago.
- Clicking a row opens the object.
- The **×** on a row dismisses that row (marks it read). Your subscription is unchanged.
- Only **read** rows older than 30 days are cleared automatically.

When a subscribed event fires for an agent, it starts a session instead of landing in the inbox.

---

## Assistant overlay

Click the **Assistant** button in the sidebar's top row (next to search) to open your personal assistant as a chat overlay. It stays open while you browse — you can navigate the main pane with it open. Only Escape or the trigger button close it.

If the assistant cannot respond, it shows a card explaining why: no harness configured, or the harness is not signed in. Click **Open Agent settings** to fix it.

---

Next: [Views](./views.md) — walkthroughs of Conversations, Work, and Knowledge
