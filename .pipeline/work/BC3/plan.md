# BC3 — Thread as a module: search · open · send a message · adjust

## What we need

**Why this exists.** Threads are the largest code path (`routes/threads.ts` 1,651 lines; the message-post handler ~350 lines in one function owning authz, transaction, events, WS push and a cross-layer call). Agents and humans post through different tools and routes today; the contract says one action.

**What exists today.** `layers/core-api/conversation` (755 lines, 'row write only — callers keep their own eventBus.emit'); `routes/threads.ts`, `threads-schema.ts`, `conversations.ts`, `assistant.ts`, `reviews.ts`; the `items` table with mandatory `threadId`; tools `send_message · reply · create_item · submit_review`; hooks `useThreadDetail · useAssistantThread · useConversationsThreads · useHostThread`; two hand-pushed WS sites; `policy-engine.ts` adjudicating `item_created`.

**Missing delta.** The `thread` module with four actions; the `items` table dropped; sending with an existing id overwrites; the reply-to-caller rule and who-may-post-where as invariants; `thread.created · thread.message · thread.changed` from `changes` rows; the WS push sites replaced by the stream from `changes`; every task owns a thread. Deletes the package, the routes, the table, the four tools, the hooks, `policy-engine.ts`, the assistant special case.

**Depends on.** BC2 — copies the proven pattern and the loops.

**Dials (provisional).** complexity: suite · ambiguity: established context · exposure: public contract

## How it works

This item copies BC2's pattern onto thread, the largest object, and fixes how tasks, threads and
agents relate.

**One list.** A thread module exports four actions — search a thread, open a thread, send a
message, adjust a thread — each as a name, the sentence an agent reads, the shape of its input,
the invariants, and what it does. Nothing else about thread is public. Today the same knowledge is
spread over the conversation package, a 1,600-line route file, three item routes, four tools, four
UI hooks and a policy engine that writes verdicts on its own.

**Send is the write that posts.** Send takes a thread id or a list of recipients (recipients start
a new thread with the sender and them as members), plus the message: plain text, a review, a
verdict, a questionnaire. With a message id it overwrites that message; without one it creates.
Retries do not double-post because a create carries a client key that is unique per thread and
sender. An agent sending with neither thread nor recipients posts to the thread its session was
called from, else to the one human in its team — the old reply fallback, now an invariant. The
invariants run over the resulting thread and message: is the sender a member, is a verdict from a
human who is not the review's author, does the review it resolves live in this thread. Failures
come back as a list of problems. On success the message and one row in `changes` land in the same
transaction: `thread.created` when the send opened a thread, `thread.message` for the message.
That row is the event. Mentions in the text add the mentioned people and agents to the thread in
the same transaction.

**Adjust is the other write.** Adjust changes the thread itself: title, members, resolved or
reopened, pinned, deleted. Without an id it creates an empty thread. A stored title wins when
present; the computed name (host, counterpart, first line) stays as the fallback. Delete is one
timestamp; a deleted thread is hidden from search and open. Only a member may adjust. Each adjust
appends `thread.changed`.

**Two reads, neither creates.** Search is one filtered list (mine, by task, by host, text) backed by
one read model that carries the unresolved-review flag the sidebar badge needs. Open returns the
thread with its members and messages, including a review looked up by its message id, so the
review page needs no route of its own.

**Every task has a thread.** A task's thread is a real column on the task, written when the task
is created: a thread with the creator and the owner as members, unless the task is created inside
an existing thread, in which case that thread is the task's thread. A thread can hold many tasks;
a task has one thread. Sessions talk in the task's thread, the task page shows it, and "thread
hosted by a task" disappears as a host kind. Hosts stay for direct threads, teams and knowledge
items.

**A message wakes agents; agents make tasks.** After commit, send wakes every agent mentioned in
the message, plus the other member when the thread has exactly two members and that member is an
agent, so a direct thread with your own agent needs no @. Waking is the existing post-commit work
intent that today only the assistant thread records, made general: a turn for that agent on that
thread. The agent reads the thread and decides: answer back, or create a task in this thread with
edit-a-task and say so — accepted when it was told to do something, proposed when it was asked to
plan. A turn ends with the agent's message, as today. The thread module never creates tasks. Nothing else wakes on a message; humans get theirs from
subscriptions in BC5.

**The assistant is your agent.** Every user's agent is an ordinary agent that the user owns. The
overlay stays as a screen and opens your direct thread with it, created on first send like any
direct thread. The special assistant thread id, its route that created on read, the pin reaction
and the turn-coherence reaction go.

**Items die; the policy engine dies.** No screen reads items; their readers were the policy engine,
notification links and routine subjects. A review, a question, an escalation are messages already.
The table is dropped. The policy engine's one unique effect, auto-approving a review as a sender
that has no user row, goes; approval is a human's verdict message, and "tell me when a review
waits" is a BC5 subscription.

**Everything else is the BC2 loop.** The four actions join the shared list; HTTP, MCP, UI `call`
and the governance rule gain thread the way they gained task. Screens and tools stop calling routes.
The hand-pushed websocket sites go; the browser is fed from the change rows. Old bus event names
are emitted from the change row until BC5. A verdict that resolves a review still resumes the
agent that filed it through the existing post-commit recorder. Neighbours that insert threads or
messages today (calling-thread bindings, run resolver, routine trigger) call send or adjust
in-process as the same actor.

**Rejected.** Items as a message kind (nothing reads them). A separate edit-message action.
Create-on-read for any thread. Waking every agent in a thread on every message (three agents,
three turns per message). The thread module creating tasks from mentions (the agent decides what
was asked). A thread-hosted-by-task lookup next to the task's thread column.

**Left simple.** One transaction per send or adjust; last write wins on concurrent overwrite; no
message versions. Message kinds stay a field with today's four values. One thread row per task,
including agent-made subtasks. Who may post is membership, nothing more.

## How we work on this

**Confirmed 2026-09-17.** Items dropped outright; policy engine deleted; membership is the only
posting rule; stored title with computed fallback; soft delete by timestamp; every task gets a
thread at creation and the task's thread column becomes real; mentions wake agents and agents make
tasks; the assistant is an ordinary owned agent, overlay kept. One PR. Net red expected; the size
of the add is not a gate.

**Order.** Architecture, one critique, one builder (red tests, then code), one fresh reviewer in two
passes (module first, projections and screens second). Only blocking findings go back.

**Gates.** One, before ship: the founder sees the conversations page, a task's thread and the
overlay running through the list; a bad send returning problems; a mention waking an agent that
makes a task in the thread; items and the policy engine gone; the governance rule green with the
legacy lists shrunk. Then retro and ship to a CI-green open PR. Nobody merges.

**Verification.** `npm run verify`, `npm run test`, `npm run test:integration:service`; a
thread-actions integration test; full e2e compared against main; the harness lane locally once at
the end because sessions post through the composed tool list.

## Confusions

1. `changes.kind` gains `message` — revises the earlier call to reuse `changed`; BC5 needs to tell
   a post from a rename without parsing `after`. Migration widens the check.
2. Return gate: `send_message` is terminal for a session as all three posting tools are today;
   `edit_task` from a thread turn (no task on the session) is not terminal — the gate already
   returns false without a session task; pin it with a test, do not weaken it.
6. Reads follow membership too: open and search show a thread only to its members, except
   team-, knowledge- and factory-hosted threads, which any signed-in principal may read and post
   to (today's rule: whoever can read can write), and the first post makes them a member. That is
   how a new owner after a handoff, a reviewer giving a verdict, and a visitor on a knowledge page
   get in. Direct threads stay members-only.
7. A task's thread is hosted by the task's team, whether migrated or created.
8. Founder 2026-09-17: the websocket push is a nudge. It carries the change row; the page re-runs
   its own open or search. This reverses the earlier "no refetch, core submits the changed version"
   rule for thread surfaces; one push path for every write, no viewer-relative title composed for a
   broadcast.
3. Questionnaire stays a message kind; nothing in this item touches it.
4. Recipients list (`GET /recipients`) is a users read and stays a legacy route until the user
   module.
5. A task created inside a thread makes the task's owner a member of that thread if not already.
9. A thread shows its tasks: search-a-task gains a by-thread filter (the task module reading its
   own column), and the thread view lists them where the old task link sat. A review message
   records the task its session ran on, stamped by the server from the session, so the review page
   can name its task.
10. Found at the gate, founder said fix here: a name with a space or an apostrophe could not be
    mentioned by typing, and a wake that fails before the agent starts left the thread silent.
    Mentions now match the longest known name after the @; a failed wake posts one plain notice
    into the thread, the same way a session that ends without answering does. The conversation
    page's dial-in button is gone and its session viewer has no way in: both accepted, the viewer
    is a separate item.

## Proposed items

- BC6: a message to an agent and a task for an agent are one thing once sessions are actions;
  decide whether a turn and a task run are the same session shape.
