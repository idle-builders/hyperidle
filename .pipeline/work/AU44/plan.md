# AU44 — How an agent's model runs is part of configuring that agent

## Work package

**Outcome.** When someone configures an agent, they set the options that model should run with — the
settings a harness exposes for it — once, as part of that agent's configuration. Those options then
apply to every run of that agent. Nobody sets them per message.

**Why this matters.** Two things are wrong today. Harnesses expose real per-model options and there is
no way to use any of them, so agents always run on defaults. And the machinery that exists is built
around the wrong idea: options were designed as pills a human toggles before each message, which puts
a per-message decision in front of someone who wanted to configure an agent once and let it work.

**What exists today.** A harness can declare per-model options, and the composer can render them as
toggles. No production code has ever declared one — every construction writes an empty list, so the
pill row filters a permanently empty array and has never appeared. Agent run configuration already
exists and already stores which harness, model, provider and tier an agent uses, with a working write
path from the agent editor and a working read path at provisioning. The one genuinely missing
connection is the harness adapter contract, which has no options input at all.

**Missing delta.** Move the option declaration into agent configuration, carry it through to the
harness that runs the agent, and delete the per-message pill path.

**Depends on.** None.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** Light design — the agent editor gains a control whose shape depends on what a harness
declares, and the empty state matters (most harnesses declare nothing). Not a new surface.

**Constraints.**
- The pass-through to the harness must ship together with the first real option declaration. Storing
  options that no harness ever receives would recreate the exact defect this work package exists to
  fix, one layer lower.
- An agent with no options configured must run exactly as it does today.

**Out of scope.** Per-message or per-run option overrides. Exposing options for harnesses that do not
declare any. Changing which models an agent may use.

## Acceptance criteria

- An agent's configuration can hold the options its harness declares for its model, and they persist.
- Options set on an agent reach the harness when that agent runs.
- An agent with no options configured behaves as it did before this change.
- No surface offers per-message option toggles.
- A harness that declares no options for a model presents no option controls when configuring an agent
  that uses it.

## Validation scenarios

- Given a harness that declares options for a model, when someone configures an agent to use it and
  sets an option, then the agent's next run uses that option.
- Given an agent configured before this change, when it runs, then its behaviour is unchanged.
- Given a harness that declares no options, when someone configures an agent using it, then they see no
  option controls rather than an empty one.
