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
