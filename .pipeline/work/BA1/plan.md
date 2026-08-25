# BA1 — A trigger someone configures actually starts the agent they chose

> **Refined 2026-08-24/25 — read `requirements.md` beside this file first.** The refinement reversed the
> shape of this work. This plan describes building the missing read path for the trigger-rule entity;
> the decision is that **the entity retires and routines absorb it**. There is one primitive — a routine,
> firing on a clock or on an event — carrying a prompt instead of a skill, and taking its scope from its
> owning agent rather than declaring one. Three of the five acceptance criteria below are then satisfied
> by the merge itself. The text below is kept as the original framing.

## Work package

**Outcome.** When someone writes a trigger — "when this happens, run that agent with this prompt" —
it runs. Today the Triggers tab in Settings accepts, saves and displays rules that no code ever reads.

**Why this matters.** Triggers are how this product is extended without changing it. Plugins and
people are supposed to attach their own behaviour to what happens, and that is the whole premise of
shipping opinions as configuration rather than as code. Right now the product presents a working
control surface that does nothing, which is worse than not offering it: someone configures a trigger,
sees it saved, and waits for an agent that will never run. Two other pieces of planned work — moving
reflection rituals into a plugin, and re-providing automatic decomposition as a default trigger —
both assume this substrate works. Neither can be built until it does.

**What exists today.** The trigger configuration entity is fully editable: it has a Settings tab, a
route implementation, validation, and it persists. A code comment left by an earlier work package
records the finding after git archaeology and a full call-site search: the entity **has had no code
path anywhere that reads it to affect real agent selection, pre-dating that work package**. The one
consumer that ever existed was removed as test-only-reachable. Routine firing enqueues work directly
and never consults trigger rules. Agent selection therefore always falls back to the default eligible
agent.

**Missing delta.** The read path: matching a configured trigger against something that happened, and
selecting the agent and prompt it names.

**Measured 2026-08-24 (BA9 refinement), for the question this package says is load-bearing.** "What a
trigger can match on" now has numbers, and there is a second matcher nobody listed:

- A trigger rule may name **6** event types — `task.accepted`, `assistant.message`, `routine.fire`,
  `work.decompose_requested`, `knowledge.action`, `proposed_call.granted`
  (`TRIGGER_EVENT_TYPES`, `framework/domain-model/src/trigger.ts`). The bus carries **34** (recounted during
  BA1's architecture pass; the earlier figure of 33 was one short). So even once
  the read path exists, a trigger cannot name most of what happens.
- **A second matching mechanism already works.** `registerEventTriggers`
  (`layers/core-api/routine/src/routine-scheduler.ts`) subscribes a non-builtin routine to **any**
  `EventType` named in its trigger config, and fires it. So the product has one narrow trigger
  vocabulary that nothing reads, and one broad one that works — reached through a routine rather than
  through the Triggers tab. Decide which survives before building a third path.
- Those subscriptions are registered **once, at startup**, from the routines then in the database. A rule
  or plugin added while the app runs is not matched until a restart.

**Naming ruling (founder, 2026-08-24).** A **routine** is the umbrella noun, and a routine fires either
on a clock or on an event. What the code calls a separate "trigger" primitive is the event-fired case of
a routine. Converge the two vocabularies on that rather than keeping a parallel six-name list beside the
real event union.

**Depends on.** None.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** Refinement required — what a trigger can match on is the load-bearing unresolved
question, and it is coupled to which events actually fire. Architecture required after it, because
this decides where matching happens relative to the run-request boundary.

**Constraints.**
- No new runtime path for triggered runs. A triggered run is an ordinary agent run; the trigger
  decides which agent and what prompt, nothing more.
- When no trigger matches, behaviour is unchanged: the default eligible agent runs with no
  event-specific prompt.
- A trigger that names an agent which no longer exists must fail visibly to the person who configured
  it, not silently fall back.

**Out of scope.** A plugin distribution mechanism. New event types. Conditional or chained triggers.
Trigger-authoring UI beyond what already exists.

## Acceptance criteria

- A trigger configured against something that happens causes the agent it names to run, with the
  prompt it specifies.
- When several triggers match the same occurrence, the outcome is defined and repeatable rather than
  arbitrary.
- When no trigger matches, the default eligible agent runs exactly as it does today.
- A trigger naming a missing agent surfaces as a visible failure to whoever configured it.
- A person can tell, from the product, whether a trigger has ever fired.

## Validation scenarios

- Given a trigger that runs a named agent when a bet is revised, when someone revises a bet, then that
  agent runs with the configured prompt.
- Given no trigger matches an occurrence, when it happens, then the default eligible agent runs and
  nothing about today's behaviour changed.
- Given a trigger naming an agent that was deleted, when its occurrence happens, then the person who
  configured it is told it could not run.
