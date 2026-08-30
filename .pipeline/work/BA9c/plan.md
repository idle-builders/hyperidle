# BA9c — A routine that fires on an event knows what happened

Split from BA9 (2026-08-25, founder decision). Read `.pipeline/work/BA9/plan.md` first. Independent
of BA9a and BA9b; **BA9d depends on it.**

## Outcome

When a routine fires on an event, the run it starts is given the full context around that event: the
event itself, the entity it concerns, and the action that led to it — instead of waking knowing only
that something, somewhere, happened.

**Why.** Founder, verbatim: *"the routine needs to have the full context about and around this
event... an event around a task should include the event as well as the entire task and the action
that led to that event being triggered."* This is the difference between an extension surface and a
doorbell: a plugin could subscribe a routine to any of the 34 event types and it would fire, and the
agent it started could not find out what for.

## Acceptance criteria

1. An event-fired routine receives **the event** (type, when, what it was about), **the entity it
   concerns** — assembled as fully as elsewhere, so a task event carries the task and its bet in the
   existing `kind:"task"` shape — and **the action that led to it**.
2. This holds for **every** event type a routine may name. Where a subject cannot be assembled
   richly the routine still gets the event and whatever is known, and the gap is explicit rather
   than silent.
3. A routine owned by a **team-less** agent still receives event context — a global plugin routine
   is owned by one, and the resolver bakes `team: null, knowledge: []` because knowledge assembly
   needs a team.
4. The prompt the agent runs carries this in a form it can act on, proven by an agent naming the
   specific thing it woke for. **No restart** is needed for a new routine to match, and clock-fired
   routines and the no-self-trigger cut are unchanged.

**Out of scope.** Installing plugins (BA9a), knowledge roles (BA9b), the rituals plugin and the
purge (BA9d). Adding or removing event types. Emitting the five events that have no emitter — that
is BA8.

**Constraints.** Reuse the existing bundle union and per-entity assembly; do not build a second,
thinner context path beside the one that already assembles tasks and bets. Do not reintroduce a
startup-time subscription list. **Do not add loop prevention** — the founder ruling on BA1 stands:
all event types are authorable and the only cut is a routine's own run not re-triggering that same
routine.

# As built

A `RoutineTriggerEvent` flows from the event bus into the baked `kind:"routine"` bundle and renders
as a **Trigger Event** section in the prompt the agent runs: event type, when, the transition where
there is one, the subject, and the actor where the event carries one.

Clock-fired routines carry no trigger event — a real two-state domain, not a feature flag: the event
caller always supplies one, the clock caller never does, and `assembleTriggerEvent` returns a
non-optional value that is at minimum `{type, timestamp}`. No event-fired run reaches the agent with
the section missing.

**Every event that carries an id now delivers it.** The first implementation resolved only `taskId`
and `betId`, so 6 event types got a rich subject and the other **28 delivered a bare type label** —
while the events carried `threadId`, `itemId`, `artifactId`, `sessionId`, `teamId`, `routineId`,
`agentId` and `userId`. A routine woken by `thread_message_appended` received the string
`"thread_message_appended"`: the doorbell this package existed to replace.

Worse, an integration test *asserted* that a thread event yields no subject — the shortfall was
written down as intended behaviour, which is why nothing caught it. **A test can encode a gap as
correct; that is a distinct failure from a test that passes wrongly, and neither shows up as red.**

Ten kinds now assemble from a real row: `task`, `bet`, `thread`, `item` (the work-block table — the
founder's "block", not `knowledge_items`), `knowledge-item`, `artifact`, `team`, `session`, `agent`,
`user`. Only `routine_fired` stays generic. Task and bet reuse the canonical assembly rather than a
bespoke literal — the first version dropped `appetite` and `doneCondition`.

**The subject is chosen by what the event is about, not by the first id present.** A later review
found the selection rule wrong in a way reading the code did not reveal. Session events carry a
`taskId` alongside their `sessionId` — which task the session ran for — and `taskId` was checked
first, so `session_ended` resolved to a **task**, with the discriminant flipping depending on
whether the session happened to have one. The same shape hid a second bug: `routine_fired` carries
both `routineId` and `agentId`, so it resolved to the agent and left the `routineId` branch
unreachable.

The rule is now: **dispatch on event type first** for events carrying secondary references, then
fall back to a field scan. Ordering that list is a decision, not a detail — say why, because the
next reader will otherwise "optimise" it back.

Three shapes — session, agent and team — had no test that could fail; the reviewer broke the session
assembly and both suites stayed green. Each now has an integration case emitting a real event and
asserting on a probe value from the row.

Proven twice, because test composition cannot prove production wiring: the harness lane shows a real
agent naming the specific task it woke for, and on a bootstrapped demo workspace a routine on
`task_state_changed` matched when a bet was killed through its real API door, the baked request
carrying the task, its bet with `doneCondition`, and the transition `in_progress -> killed`.

## Known limitations

- **Actor identity is partial.** Events carrying `senderId`, `accessorId` or `agentId` deliver it,
  but several have no actor field at all — `task_state_changed` among them — so "who did it" is
  structurally unavailable.
- **A throwing subject lookup drops that event's firing.** `assembleTriggerEvent` is awaited inside
  the matcher's un-awaited async handler with no try/catch. It fails closed — no run — rather than
  delivering a run with the feature silently off.
- **Timestamp shapes differ.** Most events carry a numeric `timestamp`; `work_selection_requested`,
  `team_created`, `agent_added` and `user_created` carry an ISO string `at`. Both are handled, but a
  third shape would silently stamp assembly time.
