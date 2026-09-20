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

## What was decided along the way

- A message is its own kind of change row (`message`), so later readers can tell a post from a
  rename without parsing the row.
- Only `send_message` and `edit_task` end an agent session. `edit_task` from a thread turn (no
  task on the session) does not end it; a test pins that.
- Reads follow the posting rule. Direct threads are members-only. Team-, knowledge- and
  factory-hosted threads are readable and postable by anyone signed in, and the first post joins.
  The websocket subscribe check uses the same rule.
- A task's thread is hosted by the task's team. A task created inside a thread adds its owner to
  that thread's members; a later handoff does not touch the thread.
- In a two-party thread with exactly one agent, the agent is the host whoever speaks first, and
  one stored pair key finds the thread again. The migration re-hosts old assistant threads by
  ownership and keys them only when the key is free.
- The websocket push is a nudge: it carries the change row and the page re-runs its own open or
  search. A message body never rides the shared `conversations` topic.
- A thread lists its tasks (task search filters by thread). A review message records the task its
  session ran on, stamped by the server.
- Who can be mentioned in a thread: its members, their teams, the host team, and the sender's own
  agents. Matching takes the longest known name after the `@`.
- A wake that fails before the agent starts posts one plain notice into the thread, only when a
  person is in it. A wake whose intent cannot be recorded after commit is logged and dropped; the
  message stays.
- Production web builds ignore a local `NODE_ENV`; the desktop build fails if the bundle carries
  the dev socket address or the dev API key.

## Accepted limits and what is left

- The conversation page's dial-in button is gone; a task's sessions are on the task page. The
  session viewer on that page has no way in (it had none before this item either) — separate item.
- Recipients (`GET /recipients`) stays a legacy route until the user module. Questionnaires are
  untouched.
- A soft-deleted direct thread keeps its pair key, so a new message to that person is refused until
  the thread is restored.
- A hung agent start blocks other agents' turns because starts are admitted one after another; seen
  with cursor-agent in the packaged app. Not part of the thread module — separate item.
- Local harness lane: the thread turn test passes on claude, opencode and cursor-agent; codex
  crashes on every prompt on this machine.
- Open question carried to the session item: a message to an agent and a task for an agent may be
  one session shape once sessions are actions.
