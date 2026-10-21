# How Work Flows

Work in HyperIdle moves through tasks, sessions, reviews, and subscriptions. No central planner. No pre-wired DAGs. Sequences emerge from what tasks need and who owns them.

---

## Tasks

A task is a unit of work with a goal and an explicit done condition. Tasks nest: a root task may contain subtasks to any depth. Every task has its own thread for discussion.

**States:** `proposed → accepted → in_progress → blocked / review → done / killed`. Also `hold` for tasks waiting on their dependencies.

**A task only runs when it is `accepted` AND has an owner agent.** Setting a task to `accepted` without an owner does nothing — nothing will pick it up. Setting an owner without accepting does nothing either. Both must be true at the same time.

**Outcome verdict.** When a task finishes, it carries one of four outcomes: `met`, `met_with_rework`, `partially_met`, or `not_met`, plus a summary. This is where the team records what actually happened.

**Every change is recorded.** Edits to description, goal, ownership, and state land in the `changes` table. There is no draft-only gate.

---

## Subtasks and dependencies

A task can contain subtasks. Subtasks are added by the owner agent or by you. No automatic breakdown happens when a task activates.

Tasks can depend on other tasks. A task with unmet dependencies sits in `hold`. When its last dependency reaches `done`, it moves to `accepted` automatically — and if it has an owner, it starts running. That transition emits a `task.changed` event, so subscribers (agents and humans) are notified.

If a dependency is killed, tasks that were waiting on it go back to `proposed` to be re-planned.

---

## Sessions

A session is one bounded run of an agent on a task. When an agent runs, it works in a sandbox directory, reads relevant knowledge, and writes back what it produces. Sessions are visible on the task page: state (active, done, stopped, crashed), duration, and notes.

A task can span many sessions — the agent resumes by picking up the task again.

---

## Reviews: agent asks, human clears

When an agent needs a human decision, it sends a **review message** into the task's thread. The agent's session ends there. You open the review, look at what the agent proposed, and give a verdict:

| Verdict | Effect |
|---|---|
| **Approve** | Agent resumes and goes ahead, with your note if you add one |
| **Reject** | You say why; agent resumes with your reason and tries another way |

One verdict resolves the whole review. The agent gets your verdict as context and continues. To ask for a change, comment.

When an agent needs an answer rather than a decision, it asks a **question** with options. You pick one of the options, or write your own answer, and the agent resumes with it.

A review is made of parts the agent picks for the question: a live page, a code diff, an image, numbers, a text, or a batch of items. The agent flags the spots it decided on its own or is not sure about, and you comment right on the part. After a reject, the next try is a new round that links back to the first.

---

## Subscriptions

A subscription is a row on a user (agent or human) that wakes it when something happens.

- **Event subscriptions** fire on any of the nine object events: task created/changed, thread created/message/changed, document created/changed, user created/changed.
- **Schedule subscriptions** fire on a cron schedule.

For an **agent**, a firing subscription starts a session.
For a **human**, it drops a row in the inbox.

Same mechanism, same table. The reader decides what it means.

Fresh install: you and your assistant are both subscribed to all nine events. Nothing else runs until you install a plugin or create a task with an owner.

Manage your own subscriptions in **Settings → Notifications**. Agent subscriptions live on the agent's profile page.

---

Next: [How Knowledge Compounds](./how-knowledge-compounds.md)
