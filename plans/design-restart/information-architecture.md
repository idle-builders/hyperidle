# Information architecture

Living register. Updated as each journey is designed. Screens, the objects inside them, and the
rules that govern both. Authoritative on intent: `interview.md`. The shipped app is not an input.

**Language:** Paper (founder preference, 2026-08-18, switched from Workshop). Light primary, dark
kept. Token set in `applications/studio/src/tokens.css`; Workshop and Precision remain switchable
for comparison.

---

## 1. The three spines

Founder: *"These three are the spines and repeat endless."* Familiar content types on purpose —
learning curve and ecosystem interoperability.

| Spine | Analogue | Attaches to | Aggregated in |
|---|---|---|---|
| **Thread** | Slack | every bet, task, knowledge doc, review | Conversations |
| **Work item** | Linear | minted the moment an agent is assigned, anywhere | Work |
| **Block** | Notion | every rich description anywhere | Knowledge |

---

**Everything is always one of three** (founder, 2026-09-28): Conversations = all threads,
Work = all tasks, Knowledge = all documents. A review is a thread. A routine's output is a thread.
Work is only tasks. So a list never needs a per-row type label — the spine already says what it is.

## 2. Ownership — settled 2026-08-18

**Ownership is by domain, not by lineage.** Founder's words. An agent's output is split and routed
by *who owns the thing produced*, not by who started the conversation or who the agent belongs to.
One agent session produced a code change owned by the founder and customer replies owned by Maya.

**A human never owns a work item. The agent does.** Founder: *"Work items are references — I don't
own the work item, the agent does. I only am responsible for the review."*

- The **work item** is the agent's. To a human it is a **reference**: visible, clickable, carrying
  its context — never a task on your plate.
- The **review** is the human's. It is the only unit a human is responsible for.
- **"Needs you" counts reviews**, never work items.

**Closing.** A work item closes when **all its reviews are done and the agent decides it is done**.
Waiting on another owner does not concern you — founder: *"my work is done after my review."*
A human's loop ends at their own verdict.

**Exposure decides that a human acts. Ownership decides which human.** The agent drafted customer
replies (its call) but would not send them (exposure), and routed them to Maya rather than the
founder (ownership).

---

## 3. Surfaces registered

### Frame — two regions, on every screen
| Region | Holds | Owning journey |
|---|---|---|
| **Sidebar** | find-or-ask (opens the ⌘K overlay), Conversations · Work · Knowledge stacked, a separator, the chosen spine's priority list | ARRIVE |
| **Detail** | the thread, task or document you opened — including a review, which is a thread | HAND OFF (thread), JUDGE (review) |

All three journeys use the same sidebar component in the studio (`applications/studio/src/Sidebar.tsx`).

### HAND OFF — designed, founder-approved 2026-08-18
Seven states of one thread, walkable in the studio:

| # | State | What is registered |
|---|---|---|
| 1 | Interruption arrives | message + **external references** as linked chips |
| 2 | The twenty seconds | **mention picker**: agents and people in one list, with current load; `esc` = keep it |
| 3 | Joined & committed | agent join event, its **spoken commitment**, **work item minted** |
| 4 | Session running | one-line presence, **opt-in peek**, transcript never enters the thread |
| 5 | Needs your judgement | **exposure-scoped ask** with real options |
| 6 | Result returns | **one review per owner**, raised in the same thread |
| 7 | Done | both owners closed theirs; work item closed |

---

### THINK — designed, founder-approved 2026-10-11
**A document stays a document; conversation is a layer on top** (founder: "the document is still a
document and you have a conversation as a layer above"). No per-block authors — they made it look
like a chat. A document can start empty or from an existing thread.
- **Comment on a block** (or type @someone in it) → a **thread anchored under that block**, also in
  Conversations. Folds to "💬 2 comments"; a header switch hides all comments.
- **An agent answers in the thread.** When it wants to change the page it leaves a **suggestion**
  (dashed, tinted, "Suggested by Growth", Accept / Discard). Accepted → plain document text.
- **No session on a document.** "A thinking session isn't a session in the technical sense." A
  thread on a block can hand work off (@Builder …) — that thread gets the task and the session.
- Draft → Publish → followers told. Comments stay as threads; the page shows what was decided.
- **Comments live in the margin** (founder picked this, 2026-10-10). A waiting comment is faded
  text beside its line — who, how many, the latest — so the page always reads in full. Opening it
  turns it into a card; one comment is in front at a time; a click elsewhere or × sends it back.
- **No highlight while reading.** Waiting comment → a faint dashed underline on its text. Open
  comment → its text is highlighted.
- **The region can be dragged.** An open comment's highlight has a slim edge and small knob at
  each end; drag to change what the comment covers. Commenting on a block starts with the whole
  block, then you narrow it.
- **The comment box is a real text box** with Cancel / Comment; a reply box stays one line until
  used. ✓ Resolve and × sit in the thread's top line. Resolve takes it off the page, with Undo.
- **A change is proposed inside a comment, by anyone** (founder, 2026-10-10: "agents and human
  are all users so making agents special is a fault"). "± Propose a change" in the comment box
  adds the covered text to edit. The thread shows it like a diff, edge to edge in the comment
  card with no inner box: old lines red with −, new lines green with +, kept lines grey, then
  Apply / Dismiss. Apply replaces the comment's region; the document shows nothing before that.
  (Founder, 2026-10-10: red/green like GitHub — the one exception to "colour does not carry
  status".)
- **No agent-only features anywhere.** Whatever an agent does, a person does the same way.
- **The format bar** (founder, 2026-10-11) — one shared control wherever someone writes, so
  nobody has to know the typing shortcuts. Each button is a small icon of the shape plus its
  name. In a document it floats at the bottom in edit mode: Heading · List · Checklist · Table ·
  Quote · Code, then Link · Mention. In the chat box it sits under the message beside Send:
  Mention · Link, then List · Quote · Code. Clicking adds the piece where you are writing.
- Open: on a narrow window the margin has no room — what then? Not designed yet.
- **Edit vs view mode.** Edit: "Editing" mark + Done, caret, block handles, an empty line "Type /
  for a block, @ to ask someone". View: an Edit button; no handles, no caret. Drafts open in edit,
  published documents in view. Commenting works in both.

### RUN THE SHIFT — the task page, first version accepted 2026-10-11
Work happens in three stages (founder): **plan** in documents and conversations (Think) →
**watch it move through the task tree** (this screen) → **check the result** in a review.
- **The sidebar lists root tasks only. No second navigation inside the page** (founder,
  2026-10-11: "horrible"). The tree is a **section** of the task page.
- **The tree is a graph** (founder, 2026-10-11): branches run left to right, top aligned; a
  dashed arrow points from a part to the part that waits for it. A chip: a mark for how it
  stands (✓ done, ◐ under way, ○ not started, the agent's initials where one is working), the
  name, a few words, document/review counts.
- **The graph follows where you are and never scrolls on its own** (founder, 2026-10-11). The
  root is not drawn. It shows three levels at most — the level above the picked part, the part
  among its siblings, its subtasks — at any depth. Clicking a part shows its subtasks; a path
  line above the graph leads back. A long row of finished parts folds into one chip that opens
  in place.
- **Where a person is needed is an icon, never "You"**: a question mark = needs input, an eye =
  needs review. "Review or input doesn't assign the task to me." Parents count them.
- **The page holds only title, details and conversation.** Details = where it stands, what it
  is about, Done when, the owner's summary.
- **Everything attached sits in one floating box on the right:** quick actions (hold, stop) ·
  facts · then **Questions, Reviews and Documents each in a section of their own** · sessions.
  Documents are ranked by the owner, the agent-made rest folded away.
- **Clicking a part** changes what the page and the box are about; the graph does not move.
  "‹ The whole task" goes back.
- **Summaries trickle up.** Every part gets a summary when it finishes or gets stuck; a parent's
  summary is a summary of those. Summarising and ranking is the root agent's job.
- **Sizes:** a small fix has no tree; a recurring task is a root whose parts are its runs.
- **Steering** is a message in the task's thread. **Hold** and **Stop** sit behind "⋯" and each
  says what will happen.
- Not designed, dropped unless asked for: handing over a batch for the night (hand-off already
  happens from a document or thread) · seeing what runs across all tasks (the Work list).

### PEOPLE — accepted for now 2026-10-12
An agent and a person are the same kind of user, so they share one page.
- **Two ways in:** the team's name at the top of the sidebar opens the team page (people, each
  with the agents that work for them; then the agents that work for the whole team). Your own
  page is at the bottom of the sidebar ("You · 4 waiting for you").
- **The user page is that user's to-do and status list** (founder, 2026-10-12): an agent's open
  tasks; for a person, what waits for them and what they started. No conversation on the page.
- **The floating box is the settings sidebar:** Open conversation · Edit / Pause · facts · Runs
  on · Works in (folders) · Can reach (services) · Starts working when (agents) · Notifications
  (your own page) · Instructions, skills and memory (agents) or About (people) · Looks (your own
  page).
- **No settings screen.** Your own page holds your settings.
- **Following happens on the thing:** a Follow / Following button on a task and on a published
  document. Your page lists what you follow and has the switches for what you are told about.
- **One mechanism underneath, two plain names:** what tells a person something is
  "Notifications"; what makes an agent start is "Starts working when" (a mention, a hand-off, a
  time such as every Monday at 07:00).
- Every user is in exactly one team today, so there is no team picker.
- **Changing any of it is a dialog over the page** (second pass 2026-10-12, awaiting the
  founder): where someone works · what they can reach · the reasons they start working, or are
  told · edit · add someone. No form has a page of its own. Adding and editing are one form.
- **Where it works and what it can reach are two things** (founder, 2026-10-12): folders and
  services (MCPs) have a list and a dialog each. Added once, ticked per agent.
- **Reasons are a list** (founder, 2026-10-12): an agent has several reasons to start, a person
  a set of reasons to be told. The dialog shows the list and adds several at once.
- **Anything an agent is told at length is a document** (founder, 2026-10-12), never a text box
  in a dialog: an agent's instructions, its skills, and what one of its reasons makes it do. The
  dialog makes the agent or the reason and asks for a name; the document is written next, in
  edit mode with the format bar.
- Not drawn yet: the list behind "See what you follow".

### PLUGINS — first pass 2026-10-12, awaiting the founder
A plugin is a ready-made pack: agents, skills, reasons to start and services. What it adds are
ordinary agents and documents, yours to change.
- **Plugins live in the team's box.** The team page has a floating box like every other page:
  facts, where the team lives, and its plugins. No sidebar entry, no screen of its own.
- **A plugin has a page** in the task-page layout: how it stands, then what it added, kind by
  kind, each agent opening its own page. The box has Switch off / Remove (or Install), where it
  came from, who it is for, and what the team changed since, each with "Put the plugin's
  version back".
- **No store.** The list is what is installed plus what comes with the app. Anything else is
  added from a git address, a folder or a zip file, in a dialog.
- An agent's page says which plugin it came with.

## 4. Object vocabulary

Objects that appear inside surfaces. Designed once, reused everywhere.

| Object | What it is | Rules |
|---|---|---|
| **Reference chip** | a link into an external system (source badge, id, title, out-arrow) | **auto-attaches to the work item at mint** — this is close context, not a filing step |
| **Mention picker** | the whole twenty seconds | agents and people identical; shows current load; keyboard-first; declining to hand off is first-class |
| **Work item strip** | the agent's work, surfaced as a reference | clickable; **carries state in place** rather than posting status messages; names its owner |
| **Session line** | agent presence while running | one line, elapsed + step count; expands only on request |
| **Ask card** | agent requesting judgement | states its **exposure** ("seen by every trial user"); offers real options, not yes/no |
| **Review card** | conversation + a display of a result | **one per owner**; yours is raised with an action, someone else's is sunk with none |
| **Needs-you flag** | the single attention marker | one wording everywhere; the only use of the flag colour |

---

## 5. Rules governing every surface

1. **Colour does not carry status.** One flag colour means "this one is yours". Everything else is
   words.
2. **One status wording** across queue, work item and card. Only the notifier changes.
3. **The session never leaks into the thread.** Agent chatter is contained; the agent posts when it
   has something.
4. **Status is carried by an object updating in place**, not by a stream of status messages.
5. **The return lands where the interruption arrived** — never in a separate inbox.
6. **Nothing is pure black on pure white** in any skin.
7. Populated real state only in design; skeleton/empty/error are a later pass.
8. Desktop only.

---

## 6. Requirements filed against journeys not yet designed

**JUDGE (review internals)**
- The review must open from the result card in the thread and return its verdict to that thread.
- **Rejection is not a button.** Founder: *"a pure send back button without feedback creates
  chaos."* Send-back must carry feedback and probably lives a level deeper than the thread.
- A review is *conversation + a display of a result*; the display is composed by the agent per
  question, from an open-ended vocabulary.

**ARRIVE (rail, queue, first run)**
- Owns the rail and the queue, both currently drawn by HAND OFF as scenery.
- Inherits a defect in shipped code: the navigator shows stale context (says CONVERSATIONS on an
  agent route, renders an empty WORK heading on work routes).
- Must resolve the double-navigation concern below.

---

## 6b. Review — settled 2026-08-19

- **Dozens per day.** The surface is a production line, not a reading room.
- **A work item can carry several reviews** by stage (design → architecture → final).
- **The reviewer checks, never reads.** They were already involved upstream. No full diffs, no
  clicking every state, no reading prose. They follow **pointers** and ask follow-ups.
- **The agent places pointers** — the flags that make an unread review still legible.
- **Artifact sizing is adaptable**, never fixed to one extreme. More space is one click away, and
  the review never blocks jumping elsewhere.
- **Comments are placed on the element, and indexed in a list.** A pin alone is unfindable. Each
  pin's back-and-forth is its own thread; the review is a conversation of many threads.
- **Approve is not gated on open questions** — they are the reviewer's own — but the open count
  sits beside the button.
- **Agents are trusted to flag their own uncertain spots** (founder, 2026-09-28). Agent pins are the
  primary pointer mechanic.
- **Reject requires a reason** (founder, 2026-09-28). The message goes back to the session and the
  agent that proposed the review. No bare reject, no send-back button.
- **A retry is a new review, never an edit of the old one** (founder, 2026-09-28). Round 2 is a new
  review on the same work item; comments stay pinned to the version they were made on. The thread
  holds the history either way.
- **Open questions stay on the old review** (founder, 2026-09-28) — simplest. Round 2 links back to
  round 1 and shows how many are still open there, but does not carry them over.

## 7. Open concerns

- ~~Double navigation~~ — **settled 2026-09-28: one sidebar.** Top: the three items
  Conversations · Work · Knowledge, stacked, with a needs-you count. Then a separator. Then the list for the
  selected item. Detail on the right. **Never tabs in the nav** (founder: "absolutely not").
- **No Home** (founder, 2026-09-28: "not convinced of this home concept"). A morning overview would
  be a **plugin**, not a built-in feature, so the core design does not include one.
- **Mentions land in Conversations** (founder, 2026-09-28): the thread shows up with "Mentioned
  you". No pop-up.
- **Notifications exist and have their own place** (founder, 2026-09-28): a bell next to the
  wordmark with a count opens a panel beside the sidebar — what happened in things you follow
  (task done, agent stuck, document published or edited). Each item opens the thread, task or
  document it is about. Footer: "You get these for what you follow" · What I follow.
- **First start** is right as designed, plus **Name your team** (founder, 2026-09-28).
- **Find or ask is an overlay (⌘K)**, not a sidebar mode. One input, two intents, **Tab** flips
  between them and keeps what you typed. Find: results left (grouped by spine), preview right with
  the match highlighted; ↵ opens here, ⌘↵ opens beside; top row offers "Ask Builder about …".
  Ask: the agent answers inside the overlay with its sources listed; it is saved as a thread in
  Conversations (↵ follow up, ⌘↵ open the thread).
- **Sidebar lists: one evenly spaced run, in priority order, status in words on the row**
  (founder, 2026-09-28: coloured status icons "absolutely no value … meaningless"; uneven spacing
  "makes no sense"). Row = title + time, then a status phrase + who. The phrase says what is going
  on: *Your review · Your answer · Mentioned you · New reply · Done · Waiting on your review ·
  Running · 2h · 3 of 7 done · Publish? · Edited by Growth*; a read thread shows its last message.
  Only what you owe gets the flag colour; something new you have not seen is green; the rest is
  grey. Bold titles always come first. Work never flags anything as yours.
- **Document tree:** every node is a document with **its own icon, changeable** (click it; the page
  outline is only the default), one guide line per level, a fixed
  chevron column, collapsed nodes show their child count. Patterns taken from Notion, Obsidian and
  VS Code's explorer.
- **Each spine's list is in priority order** — the founder's point: "each of conversation, work,
  knowledge have this valuable prioritization in the sub nav so that you actually see per category
  what there is to see."
  - Conversations: Needs you (reviews, questions, mentions — all threads) · Unread · Recent.
  - Work: Running · In review · Done since you looked. Tasks only; the agent owns them, so Work
    never carries a needs-you count.
  - Knowledge: Needs you (drafts to publish) · Changed since you looked · then the **document tree**.
- **Bets do not exist.** Work is tasks; a task can have subtasks.
- **Knowledge is a tree of documents.**
- Whether another owner's review belongs in your thread at all, or collapses to one line and lives
  only in theirs.
- Whether the thread should auto-scroll to the newest content.

---

## 7b. Collected for the final pass

The founder (2026-10-11): older open questions wait for one complete pass over everything at
the end.
- Should a stuck agent also show as "Your answer" in Conversations, or is a notification enough?
- Someone else's review in your thread: in full, or folded to one line?
- Should a thread jump to the newest message when opened?
- Comments on a narrow window, where the margin has no room.
- Does the small comment box in the margin get the format bar?
- Bold and italic in the format bar?
- The header repeats the title that the page already shows (documents and tasks).
- The Work list in the sidebar still says "Waiting on your review"; the task page says "Needs
  review" because review or input does not assign the task to anyone. One wording.
- At the whole task the graph shows only direct parts; is that enough of an overview?
- A dependency arrow shows only while both of its parts are in view.
- Can a user be in several teams? Today: no. If yes, the team name at the top becomes a picker.
- Adding a person: the design sends a link by email; the product has no invite yet.
- A plugin's agents belong to the team in the product; the People story has Builder working for
  you. Can "works for" change after an agent is added?
- A service is ticked per agent in the design; today a person's services reach all their agents.

## 8. Not yet registered

All five journeys, People, the set-up dialogs and Plugins have a design. Still undrawn:
- **Where the app runs** — placed as a fact in the team's box ("Lives on"); moving a team
  between this computer and a shared server is not designed.
- **The programs on this computer** (found, signed in, switched off, look again) and any key one
  of them needs — not placed.
- The list behind "See what you follow".
- Failure, empty and loading states · the "this session cost X" line.
