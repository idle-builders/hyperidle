# The "other active sessions" guard in lifecycle-propagation — delete it

**Verdict: delete.** The guard defends against a state no normal path produces, the one
justification previously given for keeping it (handoff) is factually wrong, and the worst
case if it is removed is a task showing "review" a bit early — which a human or agent can
just move back.

Everything below is from the code at HEAD (`94f17245`).

---

## What the guard is

`packages/core-api/policy/src/lifecycle-propagation.ts:288-302`. When a run ends with
outcome `completed`, before moving the task from `in_progress` to `review` it reads the
`sessions` table and asks: is any *other* run on this task still `active`? If yes, it does
nothing and writes a "skipped" log row.

This is the read AU26 is trying to remove — core-api reaching straight into agent-run
state.

---

## The handoff argument is wrong

The claim was: we can't make this event-driven, because a handoff deliberately emits no
`session_ended`, so core would believe the handed-off agent is still running forever.

That does not hold. Two facts kill it:

1. **A handed-off run never reaches this code at all.** The only thing that invokes it is
   the `session_ended` subscription (`lifecycle-propagation.ts:692`) and the retry
   heartbeat re-running rows that subscription created. `endRunForHandoff`
   (`packages/agent-orchestration/run-orchestration/src/end-run-for-handoff.ts:34`) takes
   no event bus, so it cannot emit. And when the abandoned run's background tail later
   calls `endSession`, that write is conditional on the row still being `active`
   (`transition-run.ts:193-200`) — the handoff already set it to `done`, so zero rows
   change and no event fires. The handed-off run is invisible to this code, permanently.

2. **The handed-off run isn't `active` anymore either.** The handoff sets it to `done` in
   the *same database transaction* that hands the task over and requests the next run
   (`handoff-protocol.ts:121`). So the guard's query would not even see it.

The founder's instinct is right: the receiving agent finishes normally and emits normally,
and that single event is what should drive the transition. The old objection was really an
objection to one specific replacement design — keeping a running count by adding up
"started" minus "ended" events, which would drift by one on every handoff. It was never a
reason the guard itself is needed. (And even that count is closable today: core emits
`session_handoff_completed` itself, `handoff-protocol.ts:360`.)

---

## Can two runs be active on one task at once?

Not through any normal path. Runs are created three ways, and all three are exclusive by
construction:

- **Task accepted → run.** A run request is only created when a task moves *into*
  `accepted` (`work/src/task-state-machine.ts:117-146`). Once the run starts, the task is
  `in_progress`, and the lifecycle grammar (`shared/src/task-transition.ts:4-12`) has no
  edge from `in_progress` back to `accepted`. So there is no second request while one is
  running.
- **Dependency release.** A task parked on `hold` returns to `accepted` when its blocker
  finishes. A task on `hold` has no run going.
- **Handoff.** Old run closed and new run requested in one transaction — they cannot
  overlap.

Admission does not stop it either, but it doesn't need to: the only limit checked at
provisioning time is *per agent*, not per task
(`run-orchestration/src/provisioner.ts:920-930`, `concurrency.ts:64-71`). There is no
database constraint saying one active run per task
(`db/src/schema.ts:290`, `:498-530`).

**Two known ways to actually reach the state, both requiring someone to go out of their
way:**

1. `POST /api/sessions` — start a run on a task by hand. It checks the task exists and the
   agent is runnable, and nothing else (`work/src/session-start-resolver.ts:105-115`;
   route at `core-api/src/routes/sessions-routes.ts:133-250`). Fire it twice at the same
   task and you get two live runs. **No screen in the app calls this** — the web only ever
   *reads* the active run for a task, and reads the first one (`web/src/pages/
   Conversations.tsx:118-124`). It is an API-only path.
2. Put a task on hold and re-accept it during the few seconds a run request is queued but
   not yet started. The queued request is not re-checked when it drains, so both start.

Neither is a shape the product actually produces. The guard is defending a state the
system does not reach on its own.

---

## What the existing test proves

`core-api/src/__tests__/lifecycle-propagation.integration.test.ts:347` inserts two `active`
session rows straight into the database with a helper (`seedSession`, `:163-179`) and then
fires the end event.

It proves the *branch* works. It proves nothing about whether the state ever occurs — it
never goes near admission, dispatch, or any route. If the guard goes, this test goes with
it, and nothing real is lost.

---

## What breaks if it is simply deleted

Only in the contrived case where two runs really are live on one task:

- First run finishes → task moves to `review` while the second is still working.
- Second run finishes → the code sees the task is no longer `in_progress` and quietly does
  nothing (`lifecycle-propagation.ts:279-286`). No error, no duplicate, no log noise.
- Nothing cascades. The bet only reacts to tasks reaching `done` or `killed`
  (`lifecycle-propagation.ts:715`), and `review` is neither.
- Review items are unaffected — those are created per run ending, independently of this
  guard.
- Fully recoverable: `review → in_progress` is a legal move, so anyone can put it back.

So the damage is "a task shows the wrong status for a while, in a situation nobody
produces." Against that, the guard costs core-api a direct read into agent-run state — the
exact thing AU26 exists to remove — and it is a wall built for a scenario with no recorded
occurrence. That is the definition of the preemptive guard this project's ethos rejects.

**Delete `lifecycle-propagation.ts:288-302`, drop the now-unused `sessions` import at
`:7`, and delete the test at `:347`.** No replacement event, no new counter, no downward
call. If concurrent runs on one task ever become a real product feature, that is the moment
to model it properly — and the right place would be admission refusing the second run, not
propagation flinching after the fact.
