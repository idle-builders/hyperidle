# Redesign session: where we landed (Q&A)

A summary of the founder ↔ agent design session from 2026-08-17 to 2026-08-18. It is read
**from the end backwards**: each answer is the *last* word on that question. Earlier answers that a
later one overturned are left out, except for a short "overturned" line where knowing it matters.

The full record is in this folder: `interview.md` (the product interview), `journeys.md` (the first
draft of the five journeys), `session-log.md` (every build and every piece of feedback) and
`information-architecture.md` (screens, objects, rules). The clickable preview is
`applications/studio`.

---

## 1. Where did the session stop?

**Q: What was the last thing built?**
The third version of the review screen (JUDGE). It was built after the founder asked to stop
getting designs thrown at them and to first talk through what matters in a review.

**Q: What was the open question at the very end?**
Whether the founder would trust the **agent flagging its own uncertainty**. The third JUDGE design
leans on agent-placed pins. Answered 2026-09-28: **yes, we trust agents to flag their own uncertain
spots.** So the agent's pins are the main way a review shows where to look.

**Q: Which journeys are done?** (updated 2026-10-12)
- **HAND OFF**: designed and approved.
- **JUDGE**: designed; reject needs a reason, a retry is a new review, agent flags are trusted.
- **ARRIVE**: designed and approved — one sidebar, find or ask, notifications, name your team.
- **THINK**: designed and approved — comments in the margin, draggable comment region, changes
  proposed inside a comment, the format bar. Details in `information-architecture.md`.
- **RUN THE SHIFT**: first version accepted — the task page: a graph of its parts that follows
  where you are, a floating box for what is attached, title + details + conversation on the page.
- **PEOPLE**: accepted for now — a team page, and one page for an agent, a person and yourself.
  Your own page holds your settings; there is no settings screen.
- **SETTING UP A USER**: second pass, awaiting the founder — dialogs over the user page (where
  someone works · what they can reach · the reasons they start or are told · edit · add
  someone). No form has its own page; an agent's instructions are written as a document.

---

## 2. JUDGE: reviewing an agent's result (latest decisions)

**Q: How many reviews does a person see, and how long does one take?**
Dozens a day. With 3–10 agents each pushing changes every few hours, that is a lot of reviews.
One work item can also have several reviews in stages (for example design, then architecture,
then final). So the screen is a **production line, not a reading room**.

**Q: Is the reviewer reading or checking?**
**Checking.** The reviewer was already involved earlier: they asked for the task, read the
refinement or discussed the design. They are sanity checking whether the result makes sense, is
good enough and will work. They follow **pointers** and ask a few follow-up questions. They barely
read full diffs, don't click through every state and don't read the full prose.

**Q: How much of the window does the thing under review get?**
**Adaptable, never fixed to one extreme.** Founder: you cannot design for a 4K screen only, nor for
a tiny three-box component; each would ruin the layout of the other. There is usually enough room
for the average thing, **more space is one click away**, and the review never blocks you from
jumping somewhere else.
*Overturned:* "the artifact owns the whole window" was proposed and rejected.

**Q: Where do comments go?**
**On the element being reviewed**, not in a chat at the bottom and not in a side column. A review
is still a conversation, but one made of targeted comments or questions on specific elements plus
overall comments at the end.
*Overturned:* comments in a side column (rejected twice, because a side column plus a nav rail
leaves no room for a widescreen page or large image) and comments in the page margin.

**Q: How do I find a comment again?**
A pin alone is not enough: "I never find them again on the screen." Two ways back:
1. **Conversations list.** Each comment or question is its own thread, so the review shows up as a
   conversation made of several threads, one per pin.
2. **A list on the review** of all questions and answers. Clicking a row jumps to its pin.

**Q: Who places pins?**
Both. The reviewer's own comments, and **the agent's pointers**: "I decided this without asking",
"I'm not sure about this", "this part touches customers". That is how a review nobody reads still
shows where to look.

**Q: Where is Approve, and is it blocked by open questions?**
Approve is a quiet button you reach when you're ready (for example in the header). It is **not
blocked by open questions**, because those are your own questions, but the **count of open
questions sits next to it**.

**Q: Approve, reject, send back?**
- There is **no "send back" button.** Founder: "a pure send back button without feedback creates
  chaos." Asking for a change is done by **commenting**.
- The verdict is **Approve** or **Reject**. Settled 2026-09-28: **a reject requires a message
  saying why**, and that message goes back to the session and the agent that proposed the review.
  *Overturned:* the agent's earlier proposal (reject closes the work item and the agent stops).

**Q: After a reject, is the next version a new review or an update?**
**A new review** ("round 2") on the same work item. The old one stays as it was, so comments keep
pointing at the version they were made on. The thread has the history either way.

**Q: Do open questions carry over to round 2?**
**No, they stay on the old review**, for simplicity. Round 2 links back to round 1 and shows the
open count there, and starts with "Changed since round 1".

**Q: How do I hand a review to someone else?**
Mention them with **@**, exactly like in chat. No separate "hand off" button; the conversation
keeps the same mechanics everywhere.

**Q: What can be under review?**
Almost anything an agent produced: a live preview of a website, a code diff, a design image or
screenshot, a dashboard with numbers, an email, a text change, or combinations of these. The agent
composes the review for the specific question. **How you point depends on what you're looking at**:
pick an element on a page, a line of code, a region of an image, a number, or a piece of text.
Device sizes (desktop, tablet, phone) matter for rendered pages.

**Q: Anything from the old review code worth keeping?**
The founder said some of it was overbuilt and ugly, but there is substance: one review can already
hold many artifacts, anchors carry a label, and there are several canvas types with a fallback for
unknown ones.

---

## 3. HAND OFF: passing work to an agent (approved)

**Q: Is HAND OFF finished?**
Yes. Founder: "That entire design for Hand Off is very cool, I like the state of it." Seven steps:
problem arrives → the twenty seconds → agent joins and commits → session running → agent needs
your judgement → result returns → done.

**Q: Who owns what?**
- **Ownership is by domain, not by lineage.** Results go to whoever owns the *thing produced*, not
  to whoever started the conversation. Example: one agent session produced an app change (the
  founder's review) and customer email replies (Maya's review).
- **A human never owns a work item; the agent does.** To a person, a work item is a reference they
  can see and click. The person owns only the **review**.
- **"Needs you" counts reviews**, never work items.

**Q: When is a work item closed?**
When **all its reviews are done and the agent decides it is done**. Waiting on another owner is not
your problem: "for me my work is done after my review."

**Q: One review or several?**
**One review per owner**, raised in the same thread. Maya is told her drafts are waiting.

**Q: What about links to outside systems (tickets, emails)?**
They come in as **reference chips** and **attach to the work item automatically** when it is
created. "That's close context."

**Q: Should the agent go further than the fix?**
Yes. The agent can prepare the follow-through, such as drafting customer replies for Maya to send.
The agent drafts; a human sends anything that reaches customers.

**Q: Work item shown in the thread?**
Yes. It earns its place: you can see it and click it. It updates its status in place instead of
posting a stream of status messages.

**Q: Peek into a running agent session?**
Yes, as an option. The session is one line by default; its chatter never enters the thread.

**Q: Status wording?**
One word everywhere, **"Needs you"**. Only the label/notifier changes by place.

**Q: Anything parked?**
**Double navigation**: a nav rail plus a conversation list. Founder: "I am never a fan of double
nav bars", but it doesn't matter for now. ARRIVE owns fixing it.

---

## 4. Look and feel

**Q: Which visual style?**
**Paper** (the founder's last preference, after comparing the three). Light first, dark kept.
*Overturned:* neo-brutal (the website's black and yellow look) was dropped as "cool for landing
pages but very hard to read for productivity applications"; Workshop was picked next, then
replaced by Paper.

**Q: What was the brief for the new style?**
Something that is nice and easy to work with for hours, with a clean and modern design.

**Q: What stays true in every style?**
- No uppercase display headings; hierarchy comes from weight and size.
- Thin lines instead of thick 3px borders, and real corner rounding.
- Nothing is pure black on pure white.
- **Colour does not carry status.** One flag colour means "this one is yours"; everything else is
  words.
- Tokens hold every value, and a token check should catch mistakes. A real bug in the session (an
  undefined spacing token silently removed all padding) showed a check should fail on any reference
  to a token that doesn't exist.

---

## 5. How we work on the redesign

**Q: Pipeline, work packages, gates?**
**No.** Founder: "I want this to be an interactive 1:1 session between me and the agent, I want to
be deeply involved in all iterations and provide constant feedback." Build → look → react → change.
The only record kept is the session log.

**Q: Where do designs live?**
In `applications/studio`, a separate small app with made-up data written from the interview. No
link to the old app's code, so nothing old leaks in.

**Q: Screen by screen or journey by journey?**
**Journey by journey.** Walk one journey end to end as a series of states. Journeys share screens,
so one information architecture covers all of them: each screen has one owning journey, and other
journeys file requests against it.

**Q: What about old design work packages (AZ17–AZ21)?**
Ignored: "we redesign from scratch, we don't want to be bothered by old baggage."

**Q: Design tokens and lint?**
Needed from the start, even while designing: a new token set, adjusted as journeys show what works.
The existing token-lint machinery is good and stays; only the values change.

---

## 6. The product underneath (from the interview)

**Q: What is HyperIdle for, in one line?**
"Unification isn't the product. It's the precondition for the thing you actually want, which is a
system that compounds." Flow gets you started; compounding keeps you in it.

**Q: What does a good day look like?**
80% of your work happens in HyperIdle, without jumping between Slack, Notion, Linear and agent
tools. **9am:** see what finished overnight and what needs you, like arriving to a team in another
time zone. **Middle of the day:** deep thinking and planning. **6pm:** hand new bets and knowledge
to agents for the night. The good feeling: your hours of thinking turned into many more hours of
work done elsewhere. No score is shown for this; it's a feeling, not a metric.

**Q: What breaks focus today, and what's the fix?**
Something new comes in, handing it off is costly or likely to be forgotten, so you do it yourself
and lose 30 minutes. The fix: **handing off takes 20 seconds, and a thoughtful result comes back
hours later in the same place.** The real enemy is the **fear of forgetting**. The goal: finish one
thing, then turn attention to the next.

**Q: What is the basic structure?**
Three building blocks that repeat everywhere, on purpose familiar:
- **Thread** (like Slack). Every bet, task, document and review has one, and all of them show up
  in Conversations.
- **Work item** (like Linear). Created the moment an agent is assigned anything, anywhere. Found
  again in Work.
- **Block** (like Notion). Every rich description is blocks; a knowledge document is a set of
  blocks.
Nothing needs moving between tools, because nothing is ever in the wrong place.

**Q: What does a hand-off look like?**
Someone posts a problem → you write "@builder can you take a look" → the agent joins and says it
will come back with a fix → a work item is created → time passes → the agent asks for a review in
the same thread.

**Q: Who is the product for?**
Small teams (think ten people and dozens of agents), not 10,000-person enterprises. Everyone has
the same kind of day in their own domain. Agents have human owners, but you can talk to anyone's
agent. Work can move up, down or sideways through the organisation, and conversations (including
reviews) are how it moves.

**Q: How much does a person need to be involved?**
Everything passes through human hands; **only how closely** changes. That depends on scope and
**exposure** (how far the result travels). An internal service name: the agent decides. A product
name customers see: the human decides. Mistakes get fixed through retros that become knowledge.

**Q: What is Knowledge?**
Where people and agents **think together**, and also the memory store. It becomes draft →
published → a few notifications. The old triage queue was a defence that grew too big. Scopes and
closeness signals keep running in the background; design decides whether any of them should be
visible.

**Q: How do conversations stay manageable?**
The agent's working chatter stays in its **session**. It only posts to the thread when it has
something. Mentions and highlighting do the rest (needs tuning later).

**Q: Where is the source of truth?**
Knowledge blocks in the database. Files in agent workspaces or anywhere else are mirrors that
sync back.

**Q: Desktop, web, mobile?**
A desktop app (Electron, so also a web app). Runs alone (you and agents) or on a shared backend
(team and agents). Mobile maybe later; not a design target now.

**Q: What happens on first start?**
The app finds a locally installed agent tool (or sets up the built-in one) and you start talking
to agents. A team is created. File systems (GitHub, Google Drive, local folders) and connectors
get added as you go.

**Q: What's in scope for this redesign?**
Everything in the app. The UI is lean; it's just designed badly. In scope: screens for **routines
and triggers** (a repeatable prompt run on a schedule or event). Out of scope: a plugin ecosystem
UI (none exists). Cost: a tiny "this session cost X" where the data exists (it currently doesn't).
Two things were overbuilt before: cost and agent tracking, and a knowledge system that got in the
way of conversations, work and knowledge.
