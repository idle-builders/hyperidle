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
| any page `?app=<ref>` | An app in the pane beside the page: a document's id, `task:<id>` for a task's description, `message:<thread>:<id>` for a message |

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
   Choosing one opens the page you last had open there, or its first row the first time; the app
   starts on the first conversation. While you write in a document, choosing one only shows its list.
4. A line, then the list for the one you chose. Every list is in priority order: what you owe
   first, then what is new to you, then the rest. A row is a status mark, a title and a time, then
   who. The mark's words show when you point at it.
   - **Conversations** — "+ New conversation", then every thread across all teams. A thread that
     waits on you is marked: a question mark for Stuck or Needs input, an eye for Needs review, @ for
     "Mentioned you" (until you open the thread). Other rows say "New reply" or the last message.
   - **Work** — a team switch ("All teams" or one team, each with its task count) and, once a team
     is picked, "The team ›", which opens the team page. Then the root tasks, each marked the way
     its graph is: ○ queued, ◐ under way, ✓ done, ■ stopped, a question mark or an eye where a
     person is needed. Pointing at the mark says it in words ("3 of 7 done", On hold).
   - **Knowledge** — drafts someone else wrote (an eye, "Publish?") and documents edited since you looked,
     then the document tree: one space per team, each document with its own icon (click it to
     change it) and a + to add a document under it.
5. **You · N waiting for you** — at the bottom; opens your own page, where your settings are.

While you edit a document, the conversation list holds still and says "N new since you started · it
waits here".

## Find or ask

One overlay, one box. **Find** lists knowledge, apps, conversations and work that match, with the
matching text; ↑↓ choose, ↵ opens. An app — a document or a message that is one — opens beside the
conversation or task it was made in, or as its own page when it was made in neither. **Tab** switches to **Ask** and keeps what you typed: an agent answers —
your own agents first, the one you have had longest first, then the team's; another can be picked
before asking. The answer is written into the overlay as it comes, with its sources, and is saved
as a conversation; ↵ asks a follow-up, ⌘↵ opens the conversation. Esc closes the overlay.
