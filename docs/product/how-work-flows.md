# How Work Flows

Work moves through conversations, tasks, sessions, reviews and subscriptions. There is no central
planner and no fixed workflow: the order comes from what each task needs and who owns it.

---

## Handing off

Work starts where people already talk. In a thread or a comment on a document, you @mention an
agent; it wakes and answers there. Work it takes on becomes a task that keeps that thread as its
own, so the conversation and the work stay together.

---

## Tasks

A task is a piece of work with a goal. Tasks nest: a task can have parts, and parts can have parts.
The agent that owns a task owns the work; a person is never assigned a task — a person answers its
questions and reviews.

**A task runs when it is accepted and has an owner agent.** Both must be true. A task can wait for
other tasks; it starts when the last one is done.

**The loop.** A task carries how it can be judged afterwards:

- **Decisions and assumptions** — who decided what and where; a decision still waiting for an answer
  is a question. An assumption held, is not checked yet, or did not hold.
- **Done when** — each line closes by itself with evidence (a test, a number), or by a person's
  review. "Ask for a review" on the task page adds a line a person must close.

When the work is finished, the task is done — or waits in review when one of its lines needs a
person. The owner writes a summary: its notes while it runs, the outcome once it is done.

**Hold and stop.** A person can put a task on hold — its agents finish what they are doing, then
wait — or stop it, and its agents stop at once. Either applies to every part not done. A stopped task
can start again; nothing is undone.

**Every change is recorded.** Edits to a task land in the `changes` table.

The full task model — states, dependencies, the loop, pausing, what a task needs from a person — is in
[task.md](../objects/task.md).

---

## Sessions

A session is one run of an agent on a task, through the agent program it runs on. The agent works
in its folders, reads the knowledge it is given, and writes back what it produces. A task can take
many sessions. While a session runs, its thread shows one line saying so; the task page lists the
sessions. See [session.md](../objects/session.md).

---

## Questions and reviews: the agent asks, a person clears

When an agent needs an answer, it asks a **question** with real options. You pick one or write your
own answer, and the agent goes on with it.

When it needs a decision, it sends a **review** into the thread, and its session ends there. A review
is made of parts the agent picks for the question — a live page, a code diff, an image, numbers, a
text, a batch of items — and the agent flags the spots it decided on its own or is not sure about.
You comment right on a part, then give a verdict:

| Verdict | Effect |
|---|---|
| **Approve** | The agent goes on, with your note if you add one |
| **Reject** | You say why; the agent goes on with your reason and tries another way |

To ask for a change, comment. After a reject, the next try is a new round that links back to the
first. See [interface/reviews.md](../interface/reviews.md).

---

## Subscriptions

A subscription belongs to a user — a person or an agent — and fires when something happens: one of
the nine object events (a task, thread, document or user created or changed, or a new message) or a
time, such as every Monday at 07:00.

- For an **agent**, a firing subscription starts a session. Its page lists these under "Starts
  working when".
- For a **person**, it drops a notification under the bell. Your own page lists these under
  "Notifications": a review raised for you, a message naming you, a task you started ending done or
  stuck, and a change to something you follow.

**Following** happens on the thing itself: Follow on a task's page or a document's page.

A fresh install subscribes you to those four notifications and your first agent to every object
event. Nothing else runs until you add a plugin or hand an agent a task. See
[user.md](../objects/user.md#subscriptions).

---

Next: [How Knowledge Compounds](./how-knowledge-compounds.md)
