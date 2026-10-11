# Design session log

1:1 founder ↔ agent. No pipeline phases, no gates. Build → look → react → change.
Authoritative on intent: `interview.md`. The shipped app is **not** an input.

---

## Session 1 — 2026-08-18

**Setup decided by founder.** Real TSX in a **new app**, not the existing one. Mock data,
no APIs. Designed from the interview only; reconciling with what exists comes later.

**Created `applications/studio`** — port 5180, React 19 + Vite. No API proxy, no
`@hyperidle/design-system` dependency, no domain types. Nothing to inherit from.

**Dropped Tailwind (agent decision, reversible).** Plain CSS custom properties instead.
`tokens.css` is the only file permitted to contain a raw value; every other file references
a var. Total token discipline and a one-line gate to enforce it. Core-ui uses Tailwind 4, so
this diverges — flagged for founder.

**Dark mode solved structurally.** The problem: a 3px black border and a hard black offset
shadow carry all structure in light, and neither survives inversion. The answer shipped here:
**the edge flips to paper; the shadow stays pure black and reads as a void** punched out of a
warm not-quite-black canvas. Accent yellow is unchanged in both themes.

**First screen: the morning arrival.** Rail (three spines) | queue | thread. Interview-derived
choices, none of which exist in the shipped app:
- **"While you were away"** — the night-shift handover as the first thing on screen, split into
  *finished* and *needs you*, not a generic inbox.
- **Waiting-on-you is the only yellow in the queue.** Colour does not carry status; yellow means
  *act on this*.
- **`Builder joined · work item minted`** as a visible thread event — the acknowledgment that
  kills the fear of forgetting, plus the work item minting itself as a side effect.
- **`Worked 4h 20m · 1 session`** — the session is collapsed to a fact. Its transcript never
  reaches the thread.
- **The ask is exposure-shaped**, in the founder's own example: *"Internally it is
  `trial_conversion`. That name is mine to pick. This one is on the pricing page and in the
  receipt, so it is yours."*

**Open for founder reaction.** Everything above.

---

## Session 2 — 2026-08-18

**Founder reversed the language for the app.** Neo-brutal reads well on a landing page and
punishes a long working session. The marketing site keeps it; the product does not.

**Three candidate skins built, each with light and dark**, switchable on the same screen so
they are judged by looking, not by description. Live at `localhost:5180`, switcher bottom-left.

Changes shared by all three, independent of palette:
- **The uppercase Archivo display face is gone.** Uppercase headings and mono tracking on every
  label are landing-page devices; they cost reading speed. Hierarchy is now weight and size.
- **Hairlines instead of 3px strokes**, real radius instead of 0.
- **Nothing is pure black on pure white** in any skin — the single biggest change for long sessions.
- **Shadow became a per-skin decision** rather than a fixed device.
- **Colour still does not carry status.** One flag colour means "this one is yours"; everything
  else is words.

| Skin | Bet | Structure |
|---|---|---|
| **Paper** | Warm, document-forward, calm. Keeps the site's yellow — but only as the "yours to decide" flag, with a deep green carrying interactive weight so it can be used on text. | 8px radius, soft two-layer shadow |
| **Precision** | Cool neutral, dense, the modern productivity archetype. Depth comes from surface steps, not elevation. | 6px radius, **no shadows at all** |
| **Workshop** | Dark-first, built for the 11pm shift. Warm amber, low glare, surfaces separated by lightness. Light mode is secondary. | 10px radius, soft deep shadow |

**Open question for the founder.** The earlier goal — a person clicking INSTALL should not feel a
change of product — is now in tension with readability. Paper keeps a thread to the site through
the yellow; Precision and Workshop break continuity entirely. Founder's call.

**Founder chose Workshop, light primary, dark retained.** (2026-08-18)

Retuned for its new role — it had been designed dark-first:
- **Shadows are now per-mode, for every skin.** Workshop's shadows were tuned against a dark
  canvas; reused on white they read muddy. This was a real defect, not a preference.
- **Light neutrals warmed and made coherent** (`#f7f6f3` canvas, `#191714` ink). They had a slight
  green cast that fought the amber.
- **The needs-you flag was strengthened** — the old pale tint did not scan. Now `#f7d9a6` fill
  with `#5e3606` text.
- **Accent set to `#a85f12`** for light (carries text at ~4.9:1 on white), `#e0a458` for dark.
- Workshop is now the studio default. Paper and Precision stay switchable for comparison until
  the founder says drop them.

**Watching:** in dark the needs-you flag is a low-contrast amber-brown fill and scans less
sharply than its light counterpart. Not yet a decision.

---

## Session 3 — HAND OFF, walked end to end

Seven steps in the rail. The queue and the thread both react to the step, so the loop's effect
on your plate is visible, not just described.

**Design decisions made — all open for founder feedback:**

1. **The picker is the twenty seconds.** Agents and people in **one list, addressed identically**
   (founder rule: `@userA` is the same gesture as `@builder`). Each row carries what they are and
   their **current load** — `idle`, `2 running`, `away` — so the choice needs no thought.
   Keyboard: `↑↓` choose, `↵` hand off, `esc` **keep it** — deciding to do it yourself stays a
   first-class outcome rather than a failure.

2. **The work item is an object in the thread, not an event.** It mints itself and then **carries
   state in place**: Queued → Running → Waiting on you → In review → Done. One object updated,
   instead of five status messages. This is what keeps the thread readable while still making the
   work item real and findable in Work.

3. **Session containment is a single line.** `Builder is working · 12m · 5 steps`, with an opt-in
   *Peek at session*. Never auto-expands. The transcript exists and stays out of the way.

4. **The queue follows the loop.** The same row moves Need you → In flight → Need you → finished,
   and the *Need you* count drops when you hand off. Handing something over visibly takes it off
   your plate, then visibly puts it back.

5. **The return lands in the thread**, attached to the same work item, offering *Look at it* /
   *Send back*. **Stopped at JUDGE's doorway on purpose.**

**Requirement filed against JUDGE (BB5):** the review surface must open from the result card in
the thread and return the verdict to that same thread. HAND OFF owns the landing; JUDGE owns the
judging.

**Open questions for the founder:** whether the work-item strip earns its place or is clutter;
whether peeking into a session is wanted at all; whether the mid-loop guidance ask should notify
or wait to be found (finish-then-turn suggests wait); whether step 7's human close is signal or noise.

### Founder feedback, and what changed

**Kept, confirmed valuable:** the work item in the thread · peeking into a session · the
needs-you flag · Maya's closing message ("that's her sauce").

1. **Work item is now clickable** — `Open ›`, hover state, real affordance. Its sub-line also
   reports the references it carries.
2. **One status word.** Was "Waiting on you" in the queue and "Needs you" on the card. Now
   **"Needs you" everywhere** — queue chip, work item state, guidance card. Same status repeated
   across surfaces on purpose; only the notifier changes.
3. **External systems arrive as references.** Founder: *"if there is an external system we could
   even work with the links and use those as references."* Maya's opening message carries the
   three real tickets as linked reference chips (source badge, id, title, out-arrow). When the
   work item mints, **it inherits them** — "3 references". This is context assembly by
   construction rather than by search.
4. **The agent stages the follow-through.** Founder: *"the agent could have gone so far and even
   draft answers for those emails after the fix and have those ready for maya to send out."*
   The result now carries **three drafted replies, one per ticket, marked "Not sent"**, each
   addressed to the real customer, and a line from the agent: *"Staged for Maya Chen — these go
   to customers, so I am not sending them."*

**What that idea implies, and why it is bigger than a feature:**
- The agent made an **exposure judgement without being asked** — drafting is its call, sending to
  a customer is not. Same rule as the naming decision, applied to an action instead of a word.
- It creates a **second hand-off, agent → human**, inside the first one. The loop chains, and it
  chains sideways to whoever owns the relationship. This is the interview's "flows up, down or
  sideways" made concrete in one screen.
- Maya's close is now the payoff, not a pleasantry: *"Sent all three, barely touched them."*

**Open for founder:** should references attach to the work item automatically at mint (built that
way) · should Maya be notified that drafts are staged for her, or find them on her own turn ·
does *Send back* belong to HAND OFF or to JUDGE.

### Founder correction — one review per owner

> "those are two seperate reviews the first one is the change in the application for me and the
> second one is email replies for maya. one for each owner."

**Structural, not cosmetic.** One agent session, one work item, **two reviews split by ownership**:

| Review | Contains | Owner | How it reads in your thread |
|---|---|---|---|
| Trial-end explainer | The change that ships | **You** | Raised card, shadow, `Needs you`, action button |
| Three replies to customers | The drafted emails | **Maya Chen** | Sunk card, no shadow, no action, "Waiting on Maya, not on you" |

The agent states the split itself: *"I raised two reviews — the change is yours, the replies are
Maya's."* The work item reports `2 reviews · 1 yours`. Done becomes *"You approved the change ·
Maya sent the replies · work item closed"* — the work item closes when **both owners closed
theirs**, not when the agent finished.

The agent's line to Maya's review is now doubly scoped: *"These go to customers, so I am not
sending them — and they are not yours to approve either."* Exposure decides that a human sends;
**ownership decides which human.**

**Send back removed.** Founder: *"a pure send back button without feedback creates chaos."*

**Requirement filed against JUDGE (BB5):** rejection is not a button. A send-back must carry
feedback, and it probably lives a level deeper than the thread. HAND OFF raises reviews and routes
them to owners; JUDGE owns what happens inside one.

**Open for founder:** whether Maya's review should appear in your thread at all or collapse to one
line and live only in hers · what closes a work item when N reviews have N owners · whether the
queue's "Need you" count counts reviews or work items once one item can raise several.

### HAND OFF approved — 2026-08-18

Founder: *"That entire design for Hand Off is very cool I like the state of it."* Journey closed
for now; moving to the next.

**Three rulings banked, all recorded in `information-architecture.md`:**

1. **Ownership is by domain, not by lineage.** Founder's own phrasing, prompted by the two-review
   split. Output is routed by who owns the thing produced — not by who started the conversation or
   whose agent did the work.
2. **A human never owns a work item; the agent does.** The work item is a *reference* to a human.
   **"Needs you" counts reviews.** Applied in the design: the strip now reads "Builder owns this".
3. **Closing:** a work item closes when all its reviews are done and the agent decides it is done.
   Waiting on another owner is not your problem — *"my work is done after my review."*

**Language switched to Paper** (from Workshop) on founder preference after living with both.
Workshop and Precision stay switchable.

**Parked, not forgotten:** *"I am never a fan of double nav bars."* The rail and the queue are both
navigation. ARRIVE owns resolving it.

---

## Session 4 — JUDGE

Second journey. Switchable against HAND OFF in the rail; seven steps.

**The layout answers the worst bug in the shipped app.** Review takes the whole content region —
the queue steps aside rather than competing — so the thing being judged gets real room. In the
shipped app the same review squeezed its artifact to ~230px.

| # | State | What it settles |
|---|---|---|
| 1 | The review at rest | display left, conversation right, verdict at the foot of the conversation |
| 2 | Comment on a spot | **anchored comments** — numbered pin on the display, matching chip in the conversation |
| 3 | Send it back | founder's ruling made structural |
| 4 | Revised, re-raised | agent flags an **unasked-for change** with its own pin |
| 5 | Approved | verdict posts back to the originating thread |
| 6 | You cannot judge it | hand down by `@mention`; ownership moves and it leaves your queue |
| 7 | Three lines and a yes | the other end of the dial |

**Decisions made:**

1. **Send-back is a composition, not a button.** Pressing it opens a required note. The panel says
   what the agent receives: *"Builder gets this comment, the pin, and the work item back."* You
   cannot reject without saying what to change — directly from *"a pure send back button without
   feedback creates chaos."*
2. **The exposure dial is one surface at two sizes.** High exposure: full stage, conversation
   column, anchored comments. Low exposure: no conversation column at all, one card, three lines,
   two buttons, and a line explaining *why* it is this small — *"Low exposure — no one outside
   sees this."* Same object, not a second screen.
3. **The display is labelled by what it is** ("Live preview", "Just an explanation") because the
   agent composes it per question. The stage is a frame around whatever it chose.
4. **Handing down is the same `@mention`.** Ownership transfers, the header flag changes from
   *Needs you* to the new owner, and the foot states plainly that it left your queue.
5. **The agent flags its own unasked-for changes** — pin 2, *"Flagging this one since you did not
   ask for it."* Scope creep surfaces itself rather than hiding in a diff.

**Open for founder:** whether the verdict belongs at the foot of the conversation or in the header ·
whether "Approve" should require a word too, or stay one click · whether a hand-down should be able
to go to an *agent* as well as a person · what the reviewer sees when the display cannot be rendered.

### JUDGE rebuilt — composite results, per-kind pointing

Founder rejected the first pass: one display, one verdict, and a send-back button that should not
exist. Went back to the shipped implementation as instructed. What was actually there and worth
keeping:

- `ReviewSubject` already holds **many artifacts** — composition was in the model, not the UI.
- **9 canvas kinds** registered, with an unknown-kind fallback so the surface never breaks.
- Anchors already carry `artifactId + blockId + spotLabel`.
- **5 verdict decisions**: approve · approve-with-comments · request-changes · **edit** · reject.

**Rebuilt around three things:**

1. **A result is a composition.** One review, six parts of different kinds — live preview, code
   diff, design rendering, numbers, email, copy change. Tabs carry their own comment counts. The
   agent proves the work with whatever mix the question needs.

2. **Pointing is per kind.** The single most useful thing to fall out of this session: *how you
   point at something depends on what it is.*

   | Part | How you point |
   |---|---|
   | Live preview | pick an element (hover shows the selector) |
   | Code | pick a line |
   | Design / screenshot | drag a region |
   | Numbers | pick a figure |
   | Email / copy | select text |

   The toolbar changes per part, and the composer placeholder names the anchor you are about to
   comment on.

3. **The stage handles real sizes.** Device switcher (1280 / 834 / 390) for anything rendered, and
   a **Full width** toggle that collapses the conversation entirely when the thing needs the room.

**Removed, per founder:**
- **The hand-over button.** Chat keeps its mechanics — `@someone` in the review conversation brings
  them in. No special affordance.
- **Send back.** There is no such action. **Commenting is how you ask for a change.**

**Verdict is now Approve / Reject, with comment as the default action.** Proposed meaning of
reject, for founder confirmation:
- Nothing ships; the work item closes as **rejected**, not returned.
- The agent **stops** rather than iterating.
- The reason **becomes knowledge**, so the next agent starts from it.
- *"Comment instead if you want a change. Reject is for the wrong direction."*

**Open for founder:** freehand drawing on top of region select · what a part that cannot render
should look like · whether a review can be approved part-by-part or only whole · whether the
shipped `edit` verdict survives (fix it yourself rather than describe the fix).

### JUDGE, second attempt — the review is a document

Founder threw away the tabbed inspector. Diagnosis before rebuilding: **the first version was an
inspector; the interview describes an authored argument.** *"the agent has to think this through and
design a review for exactly this question"* is writing, not filing evidence into drawers — and
*"the power is the ability to talk about it"* had been given a narrow sidebar.

**New structure: the review is a document the agent wrote.**

- **One reading order.** Prose and evidence interleave — what I did, here is the page, here is why
  the bug caused it, here is the diff, here are the numbers.
- **Evidence is blocks in the document**, each with its own bar and its own tools. This makes a
  review literally a set of blocks — the same spine as Knowledge.
- **Comments live in the margin beside the thing they are about.** No separate conversation pane.
- **The conversation grows the document.** Builder's revision appears as a new paragraph in the
  flow with its reply in the margin, so the document reads as a record afterwards.
- **The agent's unasked-for decisions are prose, not pins** — *"One thing I decided without asking:
  the warning email now names the amount… It felt dishonest to warn someone about a charge without
  saying how much."*
- **A block that needs the window takes it** — "Open full" goes full-bleed with device sizes.
- **The decision is at the end.** You arrive at *"Does this ship?"* by reading, not by finding a
  toolbar.

Verdict per founder: Approve / Reject, comment is how you ask for a change, `@someone` brings a
person in. No send-back, no hand-over button.

### Bug — a missing token silently removed all container padding

Founder reported the main content had no spacing around it, twice. It was not a taste question.

When the token set was rewritten for the three skins, the scale stopped at `--sp-8`. `.rv-scroll`
still referenced `--sp-9` in its `padding` shorthand. **An undefined custom property invalidates
the entire declaration at computed-value time** — so the container had *zero* padding, not a
smaller one. Nothing errored, nothing warned; it just silently stopped applying.

Fixed by restoring `--sp-9: 80px` and setting the container to `--sp-8` sides.

**Requirement for the eventual token gate:** a rule that fails on a reference to a `--*` custom
property that no skin defines. This class of bug is invisible by inspection and survives review —
the CSS looks correct and reads correctly. Worth a lint rule, not a convention.

Also fixed: the walkthrough forced full-bleed open on its own step, so "Back to the review" could
not escape it. Judge now re-seeds its local state per step.

### JUDGE, third attempt — founder discussion first

Two designs rejected. Discussed before building this time. Founder rulings:

**Volume.** *Dozens a day.* 3–10 agents pushing a change every couple of hours. **And a single
work item can carry several reviews** — a large change might have one for design, one for
architecture, and a final one.

**You are checking, not reading.** *"I was already involved in earlier parts of this work — I
either requested the task or read the refinement or discussed the design."* So: sanity-check that
it makes sense, is good enough, will work. *"You look for pointers and based of those you might ask
a few follow up questions. You barely read full diffs, you don't click through all states, and you
don't read the full prose text."*

**Why the side column failed — spatial, not conceptual.** *"the examples you give right now are
tiny components, of course these fit, but when you are looking at a 4k image of something, or a
widescreen layout of a website how the hell is this supposed to work if the nav bar is left and a
conversation is right."* But also **not full-bleed**: *"you cannot design for a 4k screen only and
neither for a tiny 3 box component."* Adaptable, with more space **one click away**, and it must
never block the flow of jumping elsewhere.

**Comments are placed, but must be indexed.** *"the issue with these pins is I never find them
again on the screen."* Two ways back: the Conversations list (a review is a conversation of many
threads, one per pin) **or** a list inside the review. A back-and-forth on a pin becomes its own
thread.

**Approve is not gated.** *"I can approve with questions still open. Since those are my questions"*
— but the open count belongs next to the button.

**Built from that:**
- Artifact takes the full width of the content region; **More space** expands it; the frame stays
  so nothing traps you.
- Pins on the thing — **mine in accent, the agent's outlined** — and the agent's pins are the
  *pointers* that make a review you don't read still tell you where to look.
- **"Questions on this review"** — an index below the artifacts. Every pin has a row: who raised
  it, what it is on, the question, the answer inline, and its state. Click a row to go to the pin.
- Header carries stage (**Final · 3 of 3**), and **Approve with the open count beside it**.
- Overall comment at the end, separate from the placed ones.

---

## Session 5 — 2026-09-28 (resumed after recovery)

**Founder answered the two open JUDGE points.**
- Agents are trusted to flag their own uncertain spots. Agent pins stay the main pointer.
- Reject requires a reason. The message goes back to the session and the agent that proposed
  the review.

**Built:** `Reject` next to `Approve` in the review header. It opens a box — "Why are you rejecting
this?" — and "Reject and send" stays disabled until a reason is typed. After sending, the header
reads "Rejected · sent to Builder" and the reason sits at the top of the review, with "Builder
answers in this thread." New walkthrough step 5 shows that state.

**Founder: a retry is a new review; open questions stay on the old one** (2026-09-28).

**Built:** walkthrough steps 6–7. Round 2 header reads "Final · round 2". At the top, a dashed link
back to round 1 with your reject reason and "1 question still open there". Then "Changed since
round 1" (new: the warning email; same: page and proration fix), the new email block, the unchanged
page, and two agent flags (C: "this is what you asked for", D: "unchanged from round 1"). Step 7:
approved, work item closed, both flags settled. Also removed the overflow clip on artifact blocks so
a pin's thread can spill past the block edge.

---

## Session 6 — ARRIVE, first pass (2026-09-28)

**Proposal for the parked double-nav concern: one navigation column.** Find-or-ask on top, the
spines as tabs (Home · Conversations · Work · Knowledge), the chosen tab's list below, detail on
the right. Home is "while you were away". The old rail + queue pair is gone in this journey. The
studio's own controls sit in a dashed "Studio controls" column so they are not mistaken for product.

**Six steps:**
1. First start — agents found on this computer (Claude Code, Codex; Cursor not installed), a team
   made for you, one button: Start talking. No setup form.
2. First conversation — Builder greets you; an optional, skippable hint to connect a folder or GitHub.
3. Morning — Home list: Needs you (reviews and questions only) · Still running · Finished overnight.
   The detail shows a short written handover: numbers, one paragraph, what each agent did.
4. Open one — the review opens on the right; the list stays so the next one is one click away.
5. Find or ask — results grouped by spine, plus "Ask Builder" at the bottom.
6. Something new while you focus — no pop-up. It lands in Home, the Home count goes up, and a quiet
   line says "1 new since you started · it waits here". Finish, then turn.

**Founder rejected tabs in the nav outright.** Asked where the lists live instead; founder: *"Top of
the sidebar the 4 items then separator and then the changeable list of items per type."* Rebuilt:
Find or ask · Home / Conversations / Work / Knowledge stacked with counts (Home's count uses the flag
colour) · separator · the selected item's list. Double-nav concern closed.

**Founder on the first Arrive pass:** stacked items plus a list is right; find-or-ask liked. Home
rejected — "could be a special screen or could even be just a routine that pops up as a thread".
The value is **per-spine prioritization** in the list. Also: bets don't exist anymore; knowledge is
a tree of documents.

**Rebuilt ARRIVE (7 steps):** first start · first conversation · morning handover (a routine thread
in Conversations, with links to what needs you) · Work in priority order · Knowledge: priority
groups then a foldable document tree · find or ask · something new while you focus (you stay in the
doc; only the Conversations count moves 2 → 3).

**Founder: "review is a thread. work is only tasks." Then: "conversation = all threads, work = all
tasks, knowledge = all documents. And everything is always one of those three."**
Reviews moved from Work into Conversations' Needs you. Work is Running · In review · Done since you
looked, with no needs-you count. Per-row type labels removed (the spine says what it is); where the
kind of thread matters it is in the subtitle ("Review · Builder…"). Detail headers use only Thread,
Task, Document. Rows tightened: unread dot + title + time on one line, needs-you chip on the
subtitle line.

**Founder: morning handover is a plugin, not built in; the tree is hard to follow, learn from
others; unclear what find-or-ask opens.**
- Morning handover removed from the core design (would be a plugin).
- Tree rebuilt with common patterns (Notion, Obsidian, VS Code): page icon on every node, guide line
  per level, fixed chevron column, child count when folded, taller rows, selected node bold.
- Find and Ask split into two steps. Find: results in the sidebar by spine; a result opens on the
  right. Ask: becomes a thread with an agent that answers with linked references; lives in
  Conversations.

**Founder: group differences (needs you / unread / recent; running / in review; needs you /
changed) are very hard to spot — needs a better concept. Changeable document icons. Find or ask
needs a complete rethink — maybe an overlay.**
- Concept: **the list gets quieter as it goes down.** Needs you = raised cards with a yellow edge;
  moving = normal rows with a state marker (dot, pulsing live dot, hollow waiting ring); the rest =
  one muted line. Bold section headings with counts. Work's middle group renamed "Waiting on a
  review".
- Documents carry their own icon; click it to pick another from a small grid.
- Find or ask is now a ⌘K overlay: Find/Ask switch with Tab, results + preview in Find, the answer
  with sources in Ask, saved as a thread.

**Founder: the boxed cards are not nice; the section headings are not good; status must be on the
row.** Removed both. Rows now carry a status icon in a fixed left column (Linear-style), bold title
only when it wants attention, priority order kept, blocks separated by space only.

**Founder: the coloured status icons say nothing; the spacing between rows makes no sense.**
Agreed — the icons broke our own rule (colour does not carry status; words do). Replaced with a
status phrase on each row ("Your review", "New reply", "Running · 2h", "Publish?", …), flag colour
only for what you owe, even row spacing, no gaps between priority blocks, bold rows first.

**All three journeys now share one sidebar.** Extracted it into `Sidebar.tsx`; Hand Off and Judge
use it instead of the old rail + queue. In Hand Off the trial-end thread's row changes status as
the loop turns (Your answer → Handed to Builder → Builder working · 12m → Your answer → Your
review · 1 of 2 reviews → Maya: Sent all three). The studio's own column now holds only studio
controls. Removed the old queue, its mock data and styles. Thread/review headers say "Thread";
a review's header reads "Review · Final · 3 of 3".

**Founder: mentions show up in the conversation; notifications are missing (they exist); first
start is right but needs "name your team".** Added a bell with a count at the top of the sidebar;
it opens a notifications panel (what happened in things you follow, each opening its thread, task
or document; mark all read; "What I follow"). New Arrive step 9. First start gains a "Name your
team" field.

---

## Session 7 — THINK, first pass (2026-09-28)

Founder accepted Arrive; the stuck-agent question (notification only, or also "Your answer" in
Conversations?) is still open.

Built from the interview ("Knowledge as where WE think collaboratively"; SECI idea → discussed →
written → built upon; "draft and published and some notifications"; proximity = no search):
1. Start a thought — "Should trials be 10 days?" made from the Q4 pricing thread; Close by line.
2. Think with an agent — @Growth answers as a block in the document, authorship in the gutter.
3. Talk about a block — replies under the block; the talk is a thread.
4. A draft waits on you — Deploy rule: why you (12 people and 8 agents read it), 1 removed, 2
   added, Publish.
5. Published — followers told, version 2 kept.
6. Built upon — Builder followed it, Maya quoted it, another document links it.

**Founder on the first THINK pass: "a very weird experience … I don't get it yet."** Stopped
building and asked three questions. Answers: a document starts empty or from a thread; the
document stays a document with conversation as a layer above — comment on a block/section to tell
the agent, maybe an inline comment block you can hide; per-block author badges are confusing and
make it look like a chat; a thinking session is not a technical session — only threads have
sessions.

**Rebuilt THINK as one story around one document:** start empty, write · ask on a block (thread
under it) · Growth answers in the thread and leaves a suggestion (Accept / Discard) · accepted →
plain text, thread folds to "2 comments", Hide comments switch · hand off from the doc (@Builder
in a block's thread → task in that thread) · publish (followers told). Dropped the deploy-rule
detour, Close by, and "built upon" from this journey.

## Session 8 — THINK, third pass (2026-10-07)

Founder on the second pass: cannot see how far a block goes — which block a comment is about;
design how comments open and close; show edit mode versus view mode.

Built (8 steps):
- **Block extent** — hover tints exactly the block (a paragraph, a heading, a whole list). Edit mode
  adds a ⠿ handle on the left. A comment button sits in the right margin.
- **Opening** — the comment button starts a composer right under the block; the block turns
  tinted and a bar on the left joins block and thread. Sending starts the thread.
- **Closing, two ways** — Hide folds the thread to a count ("2") in the margin beside the block,
  with a grey bar; click it to reopen. Resolve takes the thread off the page with a receipt
  ("Resolved. The thread stays in Conversations. Undo"). Header switch hides all comments.
- **Suggestion inside the block** — tinted, dashed underline, "Suggested by Growth · Accept ·
  Discard" right under the line. Answers the open question of where suggestions sit.
- **Edit vs view** — edit: "✎ Editing" mark + Done, caret, handles, "Type / for a block, @ to ask
  someone" line. View: "✎ Edit" button only; hover shows just the block and comment button.
  Drafts open in edit mode, published documents in view mode.

**Founder on the third pass: the boxed comments and green block highlight are ugly.** Restyled:
no boxes, no fill. A block's extent is a thin line in the left margin (on hover, and while its
thread is open); the line runs on down the thread — darker beside the block, lighter along the
thread. A thread is plain messages: small avatar, name, time, text, in smaller and greyer type
than the page; the reply is a bare underlined line with Hide · Resolve as quiet text beside it.
The task made in a thread is a one-line reference. Suggestions: dashed underline, no tint. The
"Editing" mark is grey, not green.

**Founder on the restyle: still ugly; unclear what belongs where; two-colour lines not
aesthetic; the comment field hard to use; hide/open hard to use.** Stopped inventing and built
the three patterns document tools actually use, switchable in the studio rail ("Comment style"),
all on one 6-step story:
- **Margin** (Google Docs, Notion wide, Linear) — the thread is a card beside the line it is
  about; closed threads shrink to a one-line summary there. Needs a wide window.
- **Pop-up** (Notion, Figma) — the thread opens over the page just under its line, with a pointer;
  closes on ×, Escape or a click elsewhere on the page; a closed thread is a count in the margin.
- **Under** (GitHub review threads) — the thread folds open under its block on a soft grey panel;
  closed, it is one row: who, "2 comments", the latest line.
Shared: the commented text gets a highlighter mark (soft when closed, stronger while open; click
it to open); a real text box with Cancel / Comment that grows with its text and posts for real;
✓ Resolve and close in the thread's top line. No block lines.

**Founder picked Margin (2026-10-10):** "there slightly faded to understand there is something.
And when you click it opens … you always see the full text so comments never disrupt reading."
Pop-up and Under removed, with the style switch. Two changes asked for and built:
- **No highlight while reading.** A comment waiting in the margin leaves only a faint dashed
  underline on its text. The highlight shows only while that comment is open. Clicking the
  underlined text or the faded margin summary opens it; a click elsewhere on the page, or ×, sends
  it back. One comment is in front at a time.
- **Drag the region.** An open comment's highlight has a slim edge with a small knob at each end;
  drag either to change what the comment covers (arrow keys work too). Commenting on a block
  starts with the whole block covered, then you narrow it.
Suggestions lost their dashed underline (it now means "has a comment"): suggested text is greyed.
Steps are now 7: edit · comment on a block · drag to narrow · answer + suggestion · accepted,
comment in the background · hand off · published, view mode.

**Founder: "what is an agent suggestion? makes no sense. agents and human are all users so
making agents special is a fault."** Suggesting a change happens via a comment, shown in the open
comment box, like GitHub's proposed change. Rebuilt:
- The greyed "Suggested by Growth · Accept · Discard" line in the document is gone.
- **Anyone proposes a change inside a comment.** The comment box has "± Propose a change": it
  adds the covered text below, to edit into what it should become.
- **In the thread** the change shows as lines — taken out (− and struck through), kept (grey),
  put in (+) — with Apply / Dismiss. Signs and strike-through carry it, not colour.
- **Apply** puts the new text where the comment's region was; the box then reads "✓ Applied by
  You". The document shows nothing of a change until it is applied.
Steps 4 and 5 renamed: "Reply proposes a change" · "Change applied".

**Founder: the grey box inside the comment box looks weird; wants red (old) versus green (new)
like GitHub and other diff tools.** Changed: no inner box — the changed lines run edge to edge
inside the comment card, old lines on a soft red with a red −, new lines on a soft green with a
green +, kept lines plain grey. Writing one: the old text shows in red and you type the new text
straight into the green line. This is the one place colour carries meaning, by the founder's
choice; the − / + signs stay so it also reads without colour.

## Session 9 — THINK, the format bar (2026-10-11)

Founder: likes the comment side of Think. Missing in edit mode: a person has to know by typing
which formats exist (titles, tables, links, bullet points, mention…). Wants floating buttons at
the bottom while editing, each with a small icon of the shape plus its name — and thinks the
same control belongs in chat.

Built `FormatBar` as one shared component:
- **In a document, edit mode only:** floats at the bottom of the page. Heading · List ·
  Checklist · Table · Quote · Code, then Link · Mention. Each button is icon + name. Clicking adds
  that piece where you are writing, with placeholder words to type over; Mention opens the same
  agents-and-people list as Hand Off. Gone in view mode. Wraps on a narrow window.
- **In the chat box:** Mention · Link, then List · Quote · Code, in a row under the message
  with Send. The chat box is now one bordered box (Hand Off and first conversation).
- New walkthrough step 2, "Add a table from the format bar". Think has 8 steps.
- The typing shortcuts stay ("Type / for a block, @ to ask someone"); the bar is the click path.

Also: the story's proposed change now *replaces* a line, so the walkthrough shows red and green
(before it only added a line, so no red showed — the founder noticed). Judge's code diff uses the
same red/green tokens.

**Founder, 2026-10-11: "that looks great. that marks think as finished to me."** THINK is done.
Left open on purpose: comments on a narrow window; whether the small comment box gets the
format bar. Next journey: RUN THE SHIFT.

## Session 10 — RUN THE SHIFT, the task page, first pass (2026-10-11)

Founder: go ahead with tasks; older open questions are collected for a complete pass over
everything at the end.

Grounded in how tasks work in the product (`docs/process-layer/tasks-and-sessions.md`): a task
nests into subtasks, an agent owns it, it runs in several sessions, the agent keeps notes on it,
it has a thread, and it is reviewed only when a review was asked for.

Built the task page (journey "Run the shift", 6 steps): a running task · a task with subtasks ·
a subtask waiting on your answer · waiting on your review · done with no review asked · steer
it, hold it, stop it.
- **Down the middle, top to bottom:** title · one sentence on where it stands (with "Your
  answer" / "Your review" in the flag colour only when you owe something) · what it is for and
  "Done when" · subtasks · the agent's notes · sessions · reviews · its thread with the chat box.
- **In the margin, plain label over value:** owner · part of · review before it is done (a
  switch) · made from · follows · references · started · worked.
- **Rows** for subtasks, sessions and reviews: what it is on the left, how it stands in words on
  the right. Done subtasks grey. A subtask opens as its own task page with a way back.
- **"⋯" menu:** Put on hold, Stop this task; each says what will happen.
- Reused: thread messages, the session peek, the question card, reference chips, the format bar.
Screenshots are taken at 1672px wide so the app area is 1440px, as it would be without the
studio's own control panel.

**Founder thinking the task view through (2026-10-11), before reacting to the first pass:**
- Tasks come in sizes — large tasks, small fixes, recurring tasks — and that shows as the
  complexity of the task.
- Three stages: **plan** (that is what Think and conversation are for) → **task** (monitoring
  progress through the task tree) → **check the result** (review / conversation).
- So a large part of the task view is an easy way to understand **where in the task tree the
  agents and humans currently sit**. The tree should stay visible and stable as you click
  through it, with a status indication that makes progress easy to read.
- Planning and documents attach mostly to the root, sometimes to lower tasks: need a smart way
  to see where planning happened and where documents are attached. Same for sessions and
  reviews, which happen anywhere in the tree.
- Per task: the title and the explanation of what the task is about.
Consequence: the first pass (one long page per task, subtasks one level deep) has the weight in
the wrong place. The tree is the main thing; the page for one task gets lighter.

**Founder's answers (2026-10-11):**
1. The tree sits inside the task screen. The sidebar shows root tasks.
2. A recurring task is the root; each run is a subtask.
3. Planning does not happen on the task screen; it happens in a conversation or a document. So
   attached conversations and documents are a key part of the task — and so is **ranking** them:
   which ones are the relevant ones where the human also takes part, and which are things the
   agent just produced. "When agents work for longer a lot of stuff gets created and this
   prioritization of content becomes very important."
4. The tree is mostly task names with a state indication and a count of reviews and
   documents/artifacts. The detail is what you see when you click a task. The tree is navigation
   within a root task.
Plus: **summaries.** Each subtask has its own summary when it finishes or gets stuck, and that
has to trickle up as a summary of summaries to the root. "This summarizing and prioritizing are
really also key aspect of the work of the root agent … essentially the orchestrator."

**Task screen, second pass built** (7 steps):
- **Tree** in its own column inside the task screen, scrolling on its own, unchanged while you
  click through. A row: name · state in words · owner · "2 docs" / "1 review". "Your answer" /
  "Your review" in the flag colour. Done parts grey. A folded branch rolls up its counts and
  shows "2 for you" so folding never hides what waits on you.
- **The picked part beside it:** title · where it stands · one small facts line · what it is
  about (+ "Done when") · **Summary** by its owner ("written when it finished / got stuck /
  updated") · for a parent, **From its parts**: one line from each part's own summary, the ones
  that need you first · **Conversations and documents, ranked by the owner**: what you take part
  in first, each saying why it matters and which part it hangs on; the rest folded under "Show 6
  more, made by the agents while working" · sessions · a chat box into the task's thread.
- **Small fix:** no tree, just the page. **Recurring task:** the root says "Every Monday"; each
  run is a part, next run on top.
- Dropped from the first pass: the facts margin and the separate reviews list (a review is one
  of the ranked conversations).
