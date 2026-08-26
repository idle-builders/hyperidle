# BA9c — Implementation review (independent, read-only)

Reviewed `57c334389..HEAD`. Verdict: **NOT-DONE**.

Verified separately by the orchestrator and not re-tested here: the harness proof is real (clean 5
passed / rendering disabled 5 failed / restored 5 passed, tree clean), an agent named the specific task
it woke for, `npm run verify` exit 0, service lane 2416 passed.

## BLOCKING

### B1 — The bet subject is a thinner parallel shape, built by a duplicated path

`assembleTriggerEvent` (`layers/core-api/routine/src/routine-scheduler.ts:817-828`) calls
`getTaskById`/`getBetById` itself and constructs a bespoke literal. Its **task** shape matches the
canonical one, but its **bet** carries only `{id, description}` where the canonical `kind:"task"` bundle
carries `{id, description, appetite, doneCondition}` (`layers/core-api/work/src/task-run-resolver.ts:150-158`).

`appetite` and `doneCondition` — what we are wagering and when it is done — are dropped, so a routine
reacting to a bet event cannot see either. The plan forbids this twice: AC2 says "matching the existing
`kind: \"task\"` shape rather than a thinner parallel one", and Constraint 1 says "do not build a second,
thinner context path beside the one that already assembles tasks and bets."

### B2 — 28 of 34 event types discard an entity id they actually carry

`assembleTriggerEvent` recognises only `rec.taskId` and `rec.betId`, and the `subject` union
(`framework/domain-model/src/work-intent.ts`) has only `task | bet`. At most 6 event types get a rich
subject; the other 28 return `{type, timestamp}` alone.

But those events **do** carry identifying ids — `threadId`, `itemId`, `sessionId`, `artifactId`,
`teamId`, `agentId`, `userId` — and every one is thrown away. A routine woken by
`thread_message_appended` receives the string `"thread_message_appended"` and nothing else. It cannot
find which thread. That is the doorbell this package existed to replace, for the majority of events.

AC4 requires that where a subject cannot be assembled richly, the routine "still receives the event
itself and **whatever is known**, and the gap is explicit rather than silent." The known id is silently
dropped, so even the minimum bar is missed.

The shortfall is enshrined rather than accidental: `BA9c-routine-event-context.integration.test.ts:346-390`
asserts `thread_message_appended` yields a trigger event with **no subject** and does not retain the
thread id. The doc comment calls thread events "no identifiable entity", which is untrue — a thread event
carries a `threadId`.

### B3 — "when it happened" never reaches the prompt

`RoutineTriggerEvent.timestamp` is assembled but `buildRoutineTaskSection`
(`layers/agent-orchestration/run-orchestration/src/context.ts:466-499`) renders only event type,
transition and subject. AC1 requires the run receive "the event — its type, **when it happened**, and what
it was about", and the deliverable is the prompt the agent runs. The rendering test sets a timestamp and
never asserts it appears, so this is untested as well as absent.

Related: `work_selection_requested`, `team_created`, `agent_added` and `user_created` carry `at` (an ISO
string), not `timestamp` (a number), so the `typeof rec.timestamp === "number"` fallback records
`Date.now()` — assembly time, not event time. Moot only because nothing renders it today.

## Non-blocking

- **"Who did it" is essentially undelivered (AC3).** Only the state transition reaches the agent, and only
  for the two state-change events. Actor ids the events do carry — `senderId`, `accessorId`, `agentId` —
  are dropped. Same root cause as B2.
- **A throwing `getTaskById` drops the whole event's firing.** `routine-scheduler.ts:879` awaits inside an
  un-awaited async handler with no try/catch. Pre-existing regime (lines 866, 877 already do this), and it
  fails closed — no run, rather than a run with the feature silently off — so not the BA9b trap, but it
  adds two more DB reads under it.
- **A missing bet renders as id `"unknown"` with an empty description** (`routine-scheduler.ts:824-827`)
  instead of the gap being explicit. Moot once B1 is fixed by reusing the canonical assembly.

## Solid, verified rather than claimed

- **The optional `triggerEvent` is genuinely safe** — not the BA9b trap. `assembleTriggerEvent` returns a
  non-optional value, is called unconditionally on the event path (`:879`), and always yields at least
  `{type, timestamp}`. The event caller always passes it; the clock caller omits it. There is no path
  where an event-fired run reaches the agent with the feature silently off.
- **No regressions.** Clock-fired routines behave exactly as before; the no-self-trigger cut is unchanged
  and computed before assembly; no loop prevention added; the matcher still subscribes from the
  compile-time `EVENT_TYPES` constant and reads routines per event, so no restart is needed.
- **Team-less owners keep event context** — the `triggerEvent` spread sits on the same unified bundle, so
  an owner with no team still receives it. AC5 met.
- **The absolute rule holds.** `getTaskById` is a required port member, its sole implementor provides it,
  and the fixtures moved in the same change. The optional fields model a real two-state domain
  (event-fired has a trigger, clock-fired does not) rather than a compatibility shim.
- **No scope creep.** Eight production files, all in the routine/context/domain-model area; `events.ts`
  untouched, no new emitters, no rituals, no `strategy` purge.
