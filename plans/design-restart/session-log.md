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
