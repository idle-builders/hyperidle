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

### Frame — three regions, present on every screen designed so far
| Region | Holds | Owning journey |
|---|---|---|
| **Rail** | identity, find-or-ask, the three spines with counts | ARRIVE |
| **Queue** | the night-shift handover, then what needs you, then what finished | ARRIVE |
| **Detail** | the thread and everything inside it | HAND OFF |

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
- **No Home** (founder, 2026-09-28: "not convinced of this home concept"). The morning overview is a
  **routine that posts a thread** ("Morning handover", weekdays 08:00), so it arrives in
  Conversations like anything else.
- **Each spine's list is in priority order** — the founder's point: "each of conversation, work,
  knowledge have this valuable prioritization in the sub nav so that you actually see per category
  what there is to see."
  - Conversations: Needs you · Unread · Recent.
  - Work: Needs your review · Running · Done since you looked.
  - Knowledge: Needs you (drafts to publish) · Changed since you looked · then the **document tree**.
- **Bets do not exist.** Work is tasks; a task can have subtasks.
- **Knowledge is a tree of documents.**
- Whether another owner's review belongs in your thread at all, or collapses to one line and lives
  only in theirs.
- Whether the thread should auto-scroll to the newest content.

---

## 8. Not yet registered

JUDGE · THINK · RUN THE SHIFT · first run and harness discovery · search results · notifications ·
failure states · the Work and Knowledge spines beyond stub buttons.
