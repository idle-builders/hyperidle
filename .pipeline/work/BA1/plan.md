# BA1 — A trigger someone configures actually starts the agent they chose

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
