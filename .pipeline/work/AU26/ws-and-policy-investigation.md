# AU26 — the two non-UI agent-run reads, investigated

Both challenges answered from the code at HEAD (`94f17245`). Every file:line below was read, not
carried over from the earlier analysis. Verdicts differ: **challenge 1 the founder is right**,
**challenge 2 the founder's hypothesis does not survive the code.**

---

## Challenge 1 — the websocket subscribe check

### 1. What the `session:` branch actually does

`packages/core-api/src/ws-subscribe-authorizer.ts:158-175`. In order:

1. Strip the `session:` prefix. Empty id → deny (`:160`).
2. Read the `sessions` row by id (`:163-167`). No row → deny (`:168`).
3. **If the run has no task** (`sessionRow.taskId` null, `:169`) → hand to
   `canSubscribeToTaskFreeSession` (`:128-145`). That parses the run's stored
   `sourceCorrelationJson` and allows if **any one** of:
   - the correlation names this exact user (`correlation.userId === senderId`, `:139`), or
   - the correlation names a thread and the user is in that thread's `participants` array
     (`senderInThread`, `:112-121` — reads `threads`), or
   - the correlation names a team and the user's team matches (`senderInTeam`, `:122-127` — reads
     `users`, then `team_members`).

   Anything else → deny.
4. **If the run has a task** (`:172-174`): read the task row, and return `taskRow !== undefined`.
   That is the whole check. **Any authenticated user is allowed**, as long as the task exists.

So the three core-side reads the founder is objecting to — `threads`, `users`, `team_members` —
**are not on the task-backed path at all**. They only fire for task-free runs, which in practice
means the personal assistant chat. The task-backed path is "does the run exist, does its task
exist" and nothing more.

### 2. Where the checks came from

**The task-backed existence check is AF11, and AF11 was not a bug report.** Commit `7f4ceec6`
(`feat(AF11): WIP`) changed `packages/server/src/services/ws-broadcaster.ts` from:

```
// Q1 §3.4: any authenticated identity may subscribe to session topics.
// Observation is read-only and intentionally not participant-gated
return sessionId.length > 0;
```

to the existence check that is still there today. The commit's own comment calls the old line
"an accidental bypass of read-parity" and explicitly keeps the outcome the same for real runs:
*"Valid sessions still return true (host-scope = true); only non-existent or unresolvable sessions
now return false."*

Two things follow. First, the old behaviour was **deliberate**, written down in the Q1 spec:
observation is read-only, so it was not participant-gated on purpose. AF11 reversed a considered
decision. Second, AF11 changed nothing about what anyone can see. A topic for a run that does not
exist has nothing broadcast to it — subscribing to it returns silence either way. The check
converts silence into a `forbidden` ack. That is the entire delta.

**The `AF11-idor-regression.integration.test.ts` test does not cover this path.** Read it: its
header lists exactly four cases (`:8-12`) — `GET /api/threads/assistant`, `GET /api/threads/coach`,
`POST /api/threads/:id/messages`, `POST /api/users/:id/inbox`. All four are about one specific,
genuinely exploited bug: `readSenderId()` used to return `c.req.header("X-Identity") ?? c.get("userId")`,
so a client could spoof its own identity by sending a header (`:14-19`). That was a real learning and
the fix is right. It has nothing to do with websocket topics. The word "session" does not appear in
either AF11 test file. The AF11 hardening commit `840528a1` does not touch a websocket file at all.

The websocket coverage that does exist is `packages/core-api/src/__tests__/ws-subscribe-authz.integration.test.ts`
— written for L1/Q1, extended at `:151` by AU26 C3 to pin the fail-closed behaviour through the move.

**The task-free branch is AU1, not AF11.** Commit `9cb436fa` (`feat(AU1): route sessions through
runtime requests`) added `canSubscribeToTaskFreeSession` in the same change that made `sessions.taskId`
nullable — i.e. it arrived with the feature, as part of introducing assistant runs. Also not a
response to an incident.

### 3. Earned, or a wall built first?

Judged against `ETHOS.md` §2 ("Security is never preemptive… added afterward, narrowly, and only in
response to a real learning: a specific tool call that actually burned someone"):

**The task-backed existence check is a wall built first.** It came from a reviewer's pass, not from
anything that went wrong; it reversed a decision the spec had reasoned through; and it protects
nothing, because it gates access to a topic that carries no data. It is precisely the "accidental
bypass" framing the ethos warns about — a hole named by inspection, not by harm.

**The task-free branch is a design choice, not earned security either** — but it is the only one of
the two with a real behavioural difference, so it deserves an honest accounting rather than a
one-word verdict:

- **What it guards:** the personal assistant run stream. Task-backed runs are team work, visible to
  the team by design. An assistant run belongs to one person's private thread.
- **What is actually on the wire:** `session_started`, `session_ended`, `tool_call_recorded`
  (`packages/agent-orchestration/src/services/session-activity-gateway.ts:49-59`). Nothing else.
  `ToolCallRecordedEvent` (`packages/shared/src/events.ts:362-369`) carries `toolName` plus
  `argsSummary`, and the type's own comment says `argsSummary` is "already-scrubbed, length-bounded
  … never the raw args object". No message text, no results, no file contents.
- **Who could reach it:** only an authenticated principal. In local mode there is effectively one —
  the API key resolves to the first human user (`middleware/auth.ts:143`, `:160`). Multiple
  principals exist only in shared mode.
- **How they would reach it:** they would have to already know the run id, which is a
  `randomUUID()` (`run-orchestration/src/runtime.ts:65`). Not enumerable, not guessable. You get one
  from a core REST route that is itself scoped.

So the honest reading: it protects a narrow thing (which tools somebody's assistant ran, in scrubbed
form), against someone who already holds a valid login and has already obtained a UUID they were
never handed. That is a defence against a hypothetical insider, which is the shape §2 rejects. But
it is not zero, and it is the piece worth a deliberate founder decision rather than a silent drop.

### 4. If session streaming becomes wholly orchestration-hosted

**Orchestration already has everything it needs, and the ground has already shifted under this
question during AU26.** `packages/agent-orchestration/src/app.ts` exists at HEAD — the Layer hosts
its own Hono app with `/sessions`, `/agent-orchestration` and `/connections` routes, mounted on the
Application's `/api` router. Its own header states it owns the `sessions` table. The plan's premise
that orchestration hosts zero routes is out of date; a websocket route is now the same kind of
addition as the three routes already there.

Authorization would be: **an authenticated user, plus the run exists.**

- The authenticated user arrives free. Auth is Application-applied middleware on the shared `/api`
  router, so orchestration reads `c.get("userId")` without importing or reading `users` itself —
  the same way its existing routes work today.
- "The run exists" is a read of `sessions`, which is orchestration's own table. Not a core read.

So yes — orchestration can decide this with **zero core tables touched**. The four dependency edges
(`conversation` / `users` / `org` / `work`) and the direct `sessions` read all disappear from
core-api, and `ws-subscribe-authorizer.ts` shrinks back to what it was named for: threads.

**What a user could see that they cannot today:** for task-backed runs, nothing whatsoever — today's
check already admits every authenticated user. The only real change is task-free assistant runs: a
second logged-in user in a shared deployment, holding a run UUID they were not given, could watch a
tool-name-and-scrubbed-summary stream of someone else's assistant run. Nothing else changes. If that
residue is unwanted, orchestration can keep an owner check without any core read — the run's
`sourceCorrelationJson` already carries `userId` (`ws-subscribe-authorizer.ts:139`) and lives in
orchestration's own table. It is the *thread* and *team* fallbacks (`:140-143`) that need core, and
those are the fallbacks, not the main case.

### 5. Does this close validation scenario 4?

`plan.md:130`: *"Given a user opens a live agent session's activity view, when the UI connects for
streaming updates, then it reaches agent-orchestration's own route directly."*

**Yes — fully, and only this way.** Today the live activity view has two halves: the REST snapshot,
and the websocket stream (`packages/web/src/hooks/useSessionActivity.ts:230` subscribes to
`session:${sessionId}`). The REST half is already orchestration's. The streaming half — the half the
scenario actually names, and the half the founder described from the start as "a ui directly into
orchestration / execution" — still goes to a core-hosted socket, authorized by core-held logic, over
a hub core owns. The narrowing was recorded because the check was treated as immovable. It is not
immovable: the reason it sat in core was one reviewer-hypothesised existence check plus an assistant
branch that can be answered from orchestration's own row. Move the route and the scenario is met
literally rather than approximately.

One real cost, stated plainly: the browser would hold a second websocket, since thread topics stay
on core's socket and session topics move. That is the honest price of the split, and it is the same
price the workspace-api / orchestration-api split pays everywhere else.

---

## Challenge 2 — policy's sibling-run count

### 1. What the code does, in plain words

`packages/core-api/policy/src/lifecycle-propagation.ts`, function `propagateSessionToTask`
(`:229-342`), subscribed to `session_ended` at `:692`.

The rule it implements: **when an agent finishes working on a task, move that task to review.**

It refuses in four cases, in order:
1. The run did not finish cleanly — outcome is not `completed` (`:259`).
2. The task no longer exists (`:270`).
3. The task is not `in_progress` (`:279`) — e.g. a human already moved it.
4. **Another agent is still working on the same task** (`:289-303`).

"Sibling" means exactly that fourth case: another row in `sessions` with the same `taskId`, still
`state = "active"`, that is not the run that just ended (`:293`). Two agents on one task; the first
one finishes; the task is not ready for review because the second is still going.

When the count is non-zero the whole thing stops — no transition, and a row is written to the
propagation log saying why (`:296-303`).

### 2. Load-bearing, or cosmetic?

**Both, in different parts — and the distinction is the whole answer.**

- The **existence** of a sibling gates. `if (otherActiveSessions.length > 0) { … return; }` (`:296`,
  `:302`) skips the transition outright. There is a dedicated test:
  `lifecycle-propagation.integration.test.ts:347` *"does NOT transition task when other sessions are
  still active"* — two active runs, one ends `completed`, and it asserts the task stays
  `in_progress`. Real behaviour, proven.
- The **number** is cosmetic. It appears once, interpolated into a log string:
  `` `${otherActiveSessions.length} other active session(s) still running` `` (`:300`). Nothing reads
  it back.

So the founder's instinct is half right and worth acting on: the query is a `select()` of every
column of every sibling row when the code only needs a yes/no. The count should go. The question
should not.

Whether the case is real: nothing prevents it. Runs are claimed per **request**, not per task
(`runtime.ts:31-48`, `:181-196`) — two `agent_session_requests` for the same task produce two live
runs. Multiple agents on one task is the product, not an edge case.

### 3. The event-driven hypothesis

**It does not survive the code, and the trap named in the brief is exactly what kills it — but for a
sharper reason than expected.**

To answer "is anything still running on this task" from events alone, core would keep a running
tally from `session_started` minus `session_ended`. Both no-`session_ended` paths break it:

- `end-run-for-handoff.ts:40` writes `state: "done"` directly, and its header (`:17-18`) says
  emitting `session_ended` would "create a spurious review item on EVERY handoff."
- `request-run-stop-for-tasks.ts:54-58` writes `state: "stopped"`/`"done"` on bet-kill, emitting
  nothing (`:9-11`).

**Handoff is not an irrelevant edge case here — it is the same-task multi-run scenario this check
exists for.** Agent A hands off to agent B on one task. Today: A's row goes to `done` with no event,
B runs, B ends `completed`, the query sees no live sibling, the task moves to review. Correct.
Event-derived: core saw `session_started` for A and never saw it end, so it believes A is still
running, so it skips forever and **the task never reaches review**. That is a real, permanent stuck
state on the most common multi-run path in the system.

It is repairable in principle — handoff does emit `session_handoff_completed`
(`events.ts:202-208`), so a projection could consume that too. But bet-kill emits nothing at all, so
it would need a brand-new event invented purely to feed a counter. That is building an event-sourced
projection, with two special cases and a new event type, to replace one boolean question. Strictly
more machinery for strictly less reliability.

There is also a plainer objection. `state` in the `sessions` table is not a cache of events — it is
the authoritative record, written directly by both those paths precisely *because* the event was the
wrong channel. Deriving from events would be reconstructing an approximation of a fact that is
already recorded exactly.

### 4. Verdict

**Make it a downward call to orchestration. Not delete, not event-driven.**

- **Not delete** — it gates real behaviour and has a test that fails without it.
- **Not event-driven** — breaks handoff permanently, and bet-kill has no event to consume.
- **Downward call** — `sessions` is orchestration's own table (`agent-orchestration/src/app.ts`
  header). Core needs an answer, not a row. It should ask the owner, exactly as it already asks
  `deps.work.getTaskById` at `:269`.

Concretely: one read-only method on the existing `AgentOrchestrationSessionsPort`
(`packages/api-contract/src/agent-orchestration-port.ts:86-110`), along the lines of
`hasOtherActiveRunOnTask(taskId, excludingRunId) → boolean`. Core drops its `sessions` import
(`:7`), the direct query at `:289-294` goes, and the skip message loses the number it never needed:
"another run is still active on this task."

This also honours the direction the founder has held elsewhere — orchestration stays a blind,
request-driven executor. Core asking a question is a request core sends; orchestration is not
reaching into core or pushing at it.

---

## Summary

| | Founder's challenge | Verdict |
|---|---|---|
| **Websocket subscribe** | "Pure orchestration, shouldn't touch core at all" | **Right.** The task-backed check is a wall built first — reviewer-hypothesised, reverses a considered spec decision, guards a topic that carries no data. Orchestration can authorize with its own table alone. Move it. |
| **Policy sibling count** | "Should work off events" | **Not right, on the events part.** Handoff and bet-kill deliberately emit nothing, so an event-derived tally would strand handed-off tasks in `in_progress` forever. **Right on the count** — the number is decoration; only the yes/no matters. Make it a downward call to orchestration, drop the count. |
| **Validation scenario 4** | — | **Closes fully** if the websocket route moves. The REST half is already orchestration's; the streaming half is the last piece, and it was narrowed only because the check was assumed immovable. |
