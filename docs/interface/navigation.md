# Navigation

Code: `layers/core-ui/src/App.tsx` (addresses), `Sidebar.tsx`, `sidebar-lists.ts`, `Find.tsx`.

## Page addresses

| Address | Page |
|---|---|
| `/conversations` | The sidebar, no page open |
| `/conversations/new` | A new conversation: say what it is about and @mention who is in it; its first line becomes its title |
| `/conversations/:id` | A thread |
| `/conversations/:id?review=<message id>` | A review, at its thread's address |
| `/work/:id` | A task; `?part=<id>` picks a part of it |
| `/knowledge/:id` | A document |
| `/people/:id` | A person or an agent; `/people/me` is your own page |
| `/teams/:name` | A team's page |
| `/plugins/:id` | A plugin's page; `?team=` names the team it was opened from |
| `/start` | First start |

Any other address goes to `/conversations`. A fresh install — no person yet — goes to `/start`.
Everything you pick is in the address, so back, forward and reload keep your place.

## The sidebar

Top to bottom:

1. **Find or ask… ⌘K** — opens the find-or-ask overlay (below).
2. **The bell** — Notifications: a panel of what happened in things you follow, newest first. Each
   item opens the thread, task, document or person it is about; Mark all read. Its footer says "You
   get these for what you follow" and links to "Change what you are told about" on your page.
3. **Conversations · Work · Knowledge**, stacked. Conversations and Knowledge show how many items
   wait on you. Work never does: agents own work.
4. A line, then the list for the one you chose. Every list is in priority order: what you owe
   first, then what is new to you, then the rest. A row is a title and a time, then a few words of
   status and who.
   - **Conversations** — "+ New conversation", then every thread across all teams. The status words
     say what a thread waits on from you (Stuck, Needs input, Needs review), or "Mentioned you",
     "New reply", or the last message.
   - **Work** — a team switch ("All teams" or one team, each with its task count) and, once a team
     is picked, "The team ›", which opens the team page. Then the root tasks, with words such as
     Running, Needs review, "3 of 7 done", On hold or Stopped.
   - **Knowledge** — drafts someone else wrote ("Publish?") and documents edited since you looked,
     then the document tree: one space per team, each document with its own icon (click it to
     change it) and a + to add a document under it.
5. **You · N waiting for you** — at the bottom; opens your own page, where your settings are.

While you edit a document, the conversation list holds still and says "N new since you started · it
waits here".

## Find or ask

One overlay, one box. **Find** lists knowledge, conversations and work that match, with the matching
text; ↑↓ choose, ↵ opens. **Tab** switches to **Ask** and keeps what you typed: an agent answers —
your own agents first, the one you have had longest first, then the team's; another can be picked
before asking. The answer is written into the overlay as it comes, with its sources, and is saved
as a conversation; ↵ asks a follow-up, ⌘↵ opens the conversation. Esc closes the overlay.
