# BA9c — A routine that fires on an event knows what happened

Split from BA9 (2026-08-25, founder decision). Read `.pipeline/work/BA9/founder-decisions.md` first.
Independent of BA9a and BA9b; **BA9d depends on it.**

## Outcome

When a routine fires on an event, the run it starts is given the full context around that event: the
event itself, the entity it concerns, and the action that led to it. An event-fired routine can do its
job instead of waking up knowing only that something, somewhere, happened.

## Why this matters

Founder, verbatim: *"the routine needs to have the full context about and around this event. that's
context assembly. i.e. an event around a task should include the event as well as the entire task and the
action that led to that event being triggered."*

This is the difference between an extension surface and a doorbell. Today a plugin can subscribe a
routine to any of the 34 event types and it will fire — and the agent it starts cannot find out what it
fired for. Every event-shaped plugin behaviour needs this, not just retros. BA9d's post-bet retro is
simply the first thing that cannot be built without it.

## What exists today

Verified against the tree at `dc8d1cbd7`.

**The matcher fires with no event.** `registerRoutineEventMatcher`
(`layers/core-api/routine/src/routine-scheduler.ts:770-812`) subscribes once per member of `EVENT_TYPES`
— a compile-time constant — and on delivery queries the database for routines naming that type
(`:776-780`). It then calls `fireGenericRoutine(db, eventBus, routine, ports)` at `:791`. **The `event`
is in scope at that call site and is not passed.**

Because the subscription set is derived from a constant and the routines are read per event, **no restart
is needed** when a routine is added — the clock path re-reads too (`:889`). The plan for BA9 said a
restart was required; that is stale.

**The baked bundle carries no event.** `resolveRoutineRunRequest`
(`layers/core-api/routine/src/routine-service.ts:465-506`) reads scope off the owner agent, assembles
knowledge, and bakes `kind: "routine"` with the routine, agent, team and knowledge. Nothing else.

**Bundles are already a union by kind, and the task variant is rich**
(`framework/domain-model/src/work-intent.ts:226-265`): `kind: "task"` already carries the task **and its
bet** and the agent, team and ranked knowledge. `kind: "routine"` and `kind: "knowledge"` also exist. So
"the entire task" is a shape that already exists and is already assembled — at
`layers/core-api/work/src/task-run-resolver.ts:138-147` and
`layers/core-api/review/src/proposed-call-workflow.ts:325-339`.

That file also carries a standing `@lore` note (`work-intent.ts:214-225`) saying the `kind:"knowledge"`
variant is a capability addition rather than a preserve-behaviour migration, **flagged for architecture
reconciliation**. This package is where that reconciliation happens.

**A team-less owner gets no knowledge.** When the owning agent has no team, the resolver bakes
`team: null` and `knowledge: []` and says so in a `@lore` note (`routine-service.ts:465-491`): assembling
knowledge needs a team, and the resolver does not invent a global query. This matters because a
global plugin routine is owned by a team-less agent.

**Events.** 34 types in `EVENT_TYPES` (`framework/event-bus/src/events.ts:678-713`), validated on the way
in at `layers/core-api/src/routes/routines-routes.ts:65`.

**A routine does not re-trigger itself.** `originRoutineId` filters the firing routine out of its own
matches (`routine-scheduler.ts:788-790`). That is the only cut, and it is deliberate — there is no other
loop prevention and none is to be added.

## Acceptance criteria

1. A routine that fires on an event receives, in its run, **the event** — its type, when it happened, and
   what it was about.
2. It receives **the entity the event concerns**, assembled as fully as that entity is assembled
   elsewhere. For a task event that means the task and its bet, matching the existing `kind: "task"`
   shape rather than a thinner parallel one.
3. It receives **the action that led to the event** — who or what did it, and what they did.
4. This works for **every** event type a routine may name, not a hand-picked few. Where an event's subject
   cannot be assembled richly, the routine still receives the event itself and whatever is known, and the
   gap is explicit rather than silent.
5. A routine owned by a **team-less** agent still receives event context. Whether knowledge assembly
   learns a global query or the bundle carries context without it is a design choice to make and state.
6. The prompt an agent actually runs contains this context in a form it can act on — proven by an agent
   correctly naming the specific thing it woke up for.
7. No restart is needed for a newly added routine to match, and the package does not reintroduce one.
8. The existing behaviour is unchanged for clock-fired routines and for the routine's own no-self-trigger
   cut.

## Validation scenarios

- Given a routine that fires on a task event, when a task changes, then the run names that specific task
  and describes what changed.
- Given two tasks changing close together, when the routine fires twice, then each run refers to its own
  task.
- Given a routine owned by an agent with no team, when its event fires, then the run still receives the
  event context.
- Given a clock-fired routine, when it fires, then its behaviour is exactly as before.
- Given a routine whose own run emits the event it listens to, when it runs, then it does not re-trigger
  itself.
- Given a routine added while the app is running, when its event next fires, then it matches without a
  restart.

## Out of scope

Installing plugins (BA9a). Knowledge roles and materialisation (BA9b). The rituals plugin and the purge
(BA9d). Adding or removing event types. Emitting the five events that have no emitter — that is BA8.
Any form of loop prevention beyond the existing no-self-trigger cut.

## Constraints

- Reuse the existing bundle union and the existing per-entity assembly. Do not build a second, thinner
  context path beside the one that already assembles tasks and bets.
- Do not reintroduce a startup-time subscription list.
- Do not add loop prevention. Founder ruling on BA1 stands: all event types are authorable and the only
  cut is a routine's own run not re-triggering that same routine.


---

# As built

Consolidated at ship; the review this section replaces was deleted after its content landed here.

## What changed

A `RoutineTriggerEvent` flows from the event bus into the baked `kind:"routine"` bundle and renders as a
**Trigger Event** section in the prompt the agent actually runs — event type, when it happened, the
transition where there is one, the subject, and the actor where the event carries one.

Path: `registerRoutineEventMatcher` receives the event → `assembleTriggerEvent` resolves the subject →
passed to `fireGenericRoutine` → `resolveRoutineRunRequest` threads it onto the bundle →
`buildRoutineTaskSection` renders it.

Clock-fired routines carry no trigger event. That is a real two-state domain, not a feature flag: the
event caller always supplies one, the clock caller never does, and `assembleTriggerEvent` returns a
non-optional value that is at minimum `{type, timestamp}`. There is no path where an event-fired run
reaches the agent with the section missing.

## Subjects: every event that carries an id now delivers it

The first implementation resolved only `taskId` and `betId`, so 6 event types got a rich subject and the
other **28 delivered a bare type label** — while the events themselves were carrying `threadId`,
`itemId`, `artifactId`, `sessionId`, `teamId`, `routineId`, `agentId` and `userId`. A routine woken by
`thread_message_appended` received the string `"thread_message_appended"` and could not find the thread.
That is the doorbell this package existed to replace.

Worse, an integration test *asserted* that a thread event yields no subject — the shortfall was written
down as intended behaviour, which is why nothing caught it. **A test can encode a gap as correct; that is
a distinct failure from a test that passes wrongly, and neither shows up as red.**

Now ten kinds assemble from a real row: `task`, `bet`, `thread`, `item` (the work-block table — the
founder's "block" concept, not `knowledge_items`), `knowledge-item`, `artifact`, `team`, `session`,
`agent` and `user`. Only `routine_fired` stays generic, deliberately: a routine waking about a routine
carries nothing useful beyond the event itself. Task and bet reuse the canonical assembly rather
than a bespoke literal — the first version dropped `appetite` and `doneCondition`, so a routine reacting
to a bet finishing could not see what was wagered or when it counted as done.

## Verified

- Harness lane, real binaries, no stubs: an agent named the specific task it woke for — a probe token
  existing nowhere but the triggering task.
- Sanity-broken three ways, each confirmed red then restored clean: disabling the trigger-event rendering
  (5 harness cases red), removing the thread subject (the AC4 test red), removing the `When` line (3
  rendering tests red).
- `npm run verify` exit 0; service integration lane 2416 passed.

## Known limitations

- **Actor identity is partial.** Events that carry `senderId`, `accessorId` or `agentId` now deliver it,
  but several events have no actor field at all — `task_state_changed` among them — so "who did it" is
  structurally unavailable there.
- **A throwing subject lookup drops that event's firing.** `assembleTriggerEvent` is awaited inside the
  matcher's un-awaited async handler with no try/catch, alongside the pre-existing `listRoutines` and
  `originRoutineId` awaits under the same regime. It fails closed — no run — rather than delivering a run
  with the feature silently off.
- **Timestamp shapes differ across events.** Most carry a numeric `timestamp`; `work_selection_requested`,
  `team_created`, `agent_added` and `user_created` carry an ISO string `at`. Both are handled, but a new
  event type using a third shape would silently stamp assembly time instead.


## The subject is chosen by what the event is about, not by the first id present

A later review found the selection rule was wrong in a way reading the code did not reveal. Session
events carry a `taskId` alongside their `sessionId` — which task the session ran for — and `taskId` was
checked first, so `session_ended` resolved to a **task**. A routine wanting the session's outcome got a
task instead, and the discriminant flipped depending on whether the session happened to have one. The
same shape hid a second bug: `routine_fired` carries both `routineId` and `agentId`, so it resolved to
the agent and left the `routineId` branch unreachable.

The rule is now: dispatch on **event type** first for events that carry secondary references, then fall
back to a field scan. Ordering that list is a decision, not a detail — say why it is ordered as it is,
because the next reader will otherwise "optimise" it back.

Three shapes — session, agent and team — also had no test that could fail. The reviewer broke the session
assembly and both suites stayed green. Each now has an integration case that emits a real event and
asserts on a probe value loaded from the row, and each was broken and confirmed red.

## Proven in the running app, not only in tests

The harness lane proves an agent names what it woke for. This proves the **production wiring** — real
bindings, real scheduler, real event — which test composition cannot.

On a freshly bootstrapped demo workspace: an event-fired routine was added listening on
`task_state_changed`, the app was started, and a bet was killed through its real API door. The cascade
transitioned its tasks, the scheduler matched the routine, and the baked request carried:

```
type: task_state_changed
subject.kind: task
  task: "Write the four-email sequence"  (state: killed)
  bet:  "Onboarding email sequence"      (with doneCondition)
transition: in_progress -> killed
```

Also established on the way: all 65 migrations apply cleanly to an empty database, the app boots with no
server errors on the new schema, and the onboarding wizard renders for a fresh install — so BA9a, BA9b
and BA9c's schema changes hold together in the real server.

A caution for repeating it: PGlite is single-writer, so the database cannot be read from a second process
while the dev server holds it. Stop the server, then inspect.
