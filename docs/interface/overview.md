# Interface overview

HyperIdle is one web app; the desktop app shows the same app in a window. Every screen is the same
frame: one sidebar on the left, the page you opened on the right. There are no tabs, no second
navigation inside a page, no home screen and no settings screen. Code: `layers/core-ui/src/`.

The sidebar and the page addresses are in [navigation.md](navigation.md).

## The pages

- **Thread** — a conversation: messages, questions, reviews, and the work handed off in it. See
  [messages.md](messages.md).
- **Review** — a review opens at its thread's address. See [reviews.md](reviews.md).
- **Task** — the parts of a task drawn as a graph (branches left to right, a dashed arrow from a
  part to the part that waits for it; a question mark where a part needs input, an eye where it
  needs a review). Clicking a part picks it; "‹ The whole task" goes back. Below the graph: the
  loop — decisions and assumptions, then "Done when" — then the owner's summary, then the part's
  own conversation. A box floating on the right holds Follow, Put on hold / Stop / Start again,
  Ask for a review (adds a "done when" line a person closes), the facts, then Questions, Reviews
  and Documents each in a section of their own, then sessions. The task model is in
  [task.md](../objects/task.md).
- **Document** — Markdown in a rich editor, with view mode and edit mode (Edit / Done). In edit mode
  the format bar floats at the bottom; `/` adds a block, `@` mentions someone. Comments live in the
  margin, each pinned to a stretch of the text; anyone can propose a change inside a comment
  (Apply / Dismiss), and a task can be handed off from a comment's thread. The page also says which
  agents get the document ("For …"), and has Follow and Publish. Drafts open in edit mode,
  published documents in view mode. See [document.md](../objects/document.md) and
  [thread.md](../objects/thread.md#comments-on-a-document).
- **Person** — people and agents share one page: that user's list (an agent's open tasks; for a
  person, what waits for them and what they started) and a floating box with how they are set up.
  Your own page is your settings: notifications, folders, services, the agent programs on this
  computer, and looks (light, dark, or like this computer — kept in this browser only). Every change
  is a dialog over the page; anything an agent is told at length is a document. See
  [user.md](../objects/user.md).
- **Team** — its people with the agents that work for them, the agents of every team, Add someone,
  and the team's plugins in its box. A person can be in several teams, an agent in one.
- **Plugin** — how it stands, what it added (agents, skills, reasons to start, services), Switch
  off / on, Remove, where it came from, and what the team changed since, each with "Put the
  plugin's version back". Plugins are added from the team page: from a git address, a folder or a
  zip file; ones that come with the app show Install. See [plugins.md](../architecture/plugins.md).
- **First start** — on a fresh install: the agent programs found on this computer and how to make
  one ready, your name and your team's name, Start talking. The desktop app can instead join a team
  that runs on a server. Then the first conversation opens with the first agent's hello.

## Rules every page keeps

- **A person checks, an agent works.** Work belongs to the agent that owns it; a person answers
  questions and reviews. Nothing is approved by itself.
- **Status is a mark, not a coloured box.** A list row draws its status as the same marks a task's
  graph uses — a question mark or an eye where a person is needed, @ when you were mentioned, ✓ done,
  ◐ under way, ○ queued, ■ stopped — and says it in words when you point at it ("Stuck", "Needs
  input", "3 of 7 done"). Colour sits in text and edges, never as a solid fill: one need colour
  (mustard in light mode, yellow in dark) marks what you owe; green marks what is new to you.
- **What floats over the page is frosted glass.** Find, menus, popovers and dialogs are see-through
  and blurred; the page itself stays solid. With reduced transparency turned on they are solid.
- **Status updates in place.** A work item in a thread shows its state; it does not post status
  messages. An agent's session never enters the thread — one line says it is working.
- **A page that did not load says so** in one line, with the reason and Try again.
