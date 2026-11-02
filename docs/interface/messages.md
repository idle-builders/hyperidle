# Messages

How a thread page shows a conversation. The thread and message model — host kinds, message types,
anchors, verdicts and answers, who may post, who is woken — is in
[thread.md](../objects/thread.md). Code: `layers/core-ui/src/Thread.tsx`, `thread-timeline.ts`,
`Composer.tsx`.

## Reading a thread

A thread reads top to bottom and opens at its newest message; new messages come in live.

- **Messages** — one sender's messages close together (within five minutes) share one name and
  time. A comment on a review part also says what it is "on". A removed message says so.
- **Apps** — a message that is an app shows as a card with its title and what it says about itself;
  it opens beside the thread, running sealed off (see
  [document.md](../objects/document.md#apps)).
- **Questions** — an ask with real options. Its card says "Stuck" when an agent asked and "Needs
  input" when a person did. You answer by picking an option; the card then shows the choice in
  place.
- **Reviews** — a review card shows its title and what the sender says about it. Yours says "Needs
  review" and has "Look at it", which opens the review (see [reviews.md](reviews.md)). Someone
  else's shows in full, with who reviews it. A decided one says Approved or Rejected, with the
  reason.
- **Small events** — a verdict or an answer shows as one line ("Maya approved …", "Sam went with
  …"), because the card it resolves already shows the result. A finished stretch of agent work is
  one line too ("Worked 1h 20m · 3 sessions").
- **Work items** — a task handed off in the thread sits where it started, names its owner, and
  shows its state in words, with "Open ›" to its task page. It never posts status messages.
- **The session line** — while an agent works, one line says so ("Builder is working · 12m · 8
  steps"), with "Peek at session" to show its steps in place. The session itself never enters the
  thread.

## Writing

The chat box sends on ↵ (Shift+↵ for a new line). Its format bar sits beside Send: Mention, Link,
Bold, Italic, List, Quote, Code. Typing `@` opens the mention picker: people and agents in one list,
each with what they do and how busy they are right now.

**Record** (desktop app on a Mac only) writes down what you say into the box at the cursor, live,
using Apple's speech recognition on the Mac itself — on-device only, never Apple's servers. It
needs the Mac's Dictation switched on; when it is off, the box says so and where to turn it on. Stop
leaves the words in the box to fix and send; the box is read-only while it records.

**Handing off** is a mention: @ an agent in a thread and it wakes and answers there. Work it takes
on becomes a task that keeps that thread as its own; the task page says where it came from.

**A new conversation** starts empty: say what it is about and @mention who should be in it. Its first
line, without the mentions, becomes its title.
